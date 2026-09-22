const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const marketCache = new Map();
const CACHE_MS = 60_000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "preflight-trading" });
});

const SCHWAB_CALLBACK_URL = "https://preflight-web-production-88d4.up.railway.app/auth/schwab/callback";
const SCHWAB_AUTH_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const SCHWAB_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const SCHWAB_MARKET_BASE = "https://api.schwabapi.com/marketdata/v1";
const SCHWAB_COOKIE = "preflight_schwab";

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(raw.split(";").map(x => x.trim()).filter(Boolean).map(pair => {
    const idx = pair.indexOf("=");
    return [pair.slice(0, idx), decodeURIComponent(pair.slice(idx + 1))];
  }));
}
function schwabKey() {
  const secret = process.env.SCHWAB_CLIENT_SECRET;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}
function encryptTokenBundle(bundle) {
  const key = schwabKey();
  if (!key) throw new Error("Schwab secret is not configured.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(bundle), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(x => x.toString("base64url")).join(".");
}
function decryptTokenBundle(value) {
  try {
    const key = schwabKey();
    if (!key || !value) return null;
    const [ivB64, tagB64, encB64] = value.split(".");
    if (!ivB64 || !tagB64 || !encB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(encB64, "base64url")), decipher.final()]).toString("utf8");
    return JSON.parse(plain);
  } catch {
    return null;
  }
}
function setSchwabCookie(res, bundle) {
  const value = encodeURIComponent(encryptTokenBundle(bundle));
  res.setHeader("Set-Cookie", `${SCHWAB_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
}
function clearSchwabCookie(res) {
  res.setHeader("Set-Cookie", `${SCHWAB_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
async function exchangeSchwabToken(params) {
  const clientId = process.env.SCHWAB_CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Schwab credentials are not configured.");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(SCHWAB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: new URLSearchParams(params)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.error || `Schwab token request failed (${response.status}).`);
  return payload;
}
async function getSchwabTokens(req, res) {
  const cookie = parseCookies(req)[SCHWAB_COOKIE];
  let bundle = decryptTokenBundle(cookie);
  if (!bundle?.access_token || !bundle?.refresh_token) return null;
  if (Number(bundle.accessExpiresAt) > Date.now() + 60_000) return bundle;
  try {
    const refreshed = await exchangeSchwabToken({
      grant_type: "refresh_token",
      refresh_token: bundle.refresh_token
    });
    bundle = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || bundle.refresh_token,
      accessExpiresAt: Date.now() + Number(refreshed.expires_in || 1800) * 1000,
      refreshExpiresAt: refreshed.refresh_token
        ? Date.now() + 7 * 24 * 60 * 60 * 1000
        : bundle.refreshExpiresAt
    };
    setSchwabCookie(res, bundle);
    return bundle;
  } catch (err) {
    console.error("Schwab refresh error:", err.message);
    clearSchwabCookie(res);
    return null;
  }
}

app.get("/auth/schwab/start", (req, res) => {
  const clientId = process.env.SCHWAB_CLIENT_ID;
  if (!clientId || !process.env.SCHWAB_CLIENT_SECRET) {
    return res.status(503).send("Schwab credentials are not configured.");
  }
  const url = new URL(SCHWAB_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", SCHWAB_CALLBACK_URL);
  res.redirect(url.toString());
});

app.get("/auth/schwab/callback", async (req, res) => {
  const code = String(req.query.code || "");
  if (!code) return res.status(400).send("Missing Schwab authorization code.");
  try {
    const token = await exchangeSchwabToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: SCHWAB_CALLBACK_URL
    });
    const bundle = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      accessExpiresAt: Date.now() + Number(token.expires_in || 1800) * 1000,
      refreshExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    setSchwabCookie(res, bundle);
    res.redirect("/?schwab=connected");
  } catch (err) {
    console.error("Schwab callback error:", err.message);
    res.status(502).send("Unable to complete Schwab authorization. " + err.message);
  }
});

app.post("/auth/schwab/disconnect", (_req, res) => {
  clearSchwabCookie(res);
  res.json({ ok: true });
});

app.get("/api/schwab/status", async (req, res) => {
  const configured = Boolean(process.env.SCHWAB_CLIENT_ID && process.env.SCHWAB_CLIENT_SECRET);
  if (!configured) return res.json({ configured: false, connected: false });
  const bundle = await getSchwabTokens(req, res);
  res.json({
    configured: true,
    connected: Boolean(bundle),
    accessExpiresAt: bundle?.accessExpiresAt || null,
    refreshExpiresAt: bundle?.refreshExpiresAt || null
  });
});

app.get("/api/schwab/quote/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.$\-]{1,16}$/.test(symbol)) return res.status(400).json({ error: "Invalid ticker symbol." });
  const bundle = await getSchwabTokens(req, res);
  if (!bundle) return res.status(401).json({ error: "Schwab is not connected." });
  const url = new URL(`${SCHWAB_MARKET_BASE}/quotes`);
  url.searchParams.set("symbols", symbol);
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${bundle.access_token}`, Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: payload.message || payload.error || "Schwab quote request failed." });
    const item = payload[symbol] || payload[Object.keys(payload)[0]] || {};
    const quote = item.quote || {};
    res.json({
      symbol: item.symbol || symbol,
      realtime: item.realtime ?? null,
      assetMainType: item.assetMainType || null,
      assetSubType: item.assetSubType || null,
      bid: Number(quote.bidPrice),
      ask: Number(quote.askPrice),
      last: Number(quote.lastPrice),
      mark: Number(quote.mark),
      open: Number(quote.openPrice),
      high: Number(quote.highPrice),
      low: Number(quote.lowPrice),
      previousClose: Number(quote.closePrice),
      volume: Number(quote.totalVolume),
      securityStatus: quote.securityStatus || null,
      source: "Charles Schwab"
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "Unable to load Schwab quote." });
  }
});

app.get("/api/schwab/options/:symbol", async (req, res) => {
  const symbol = String(req.params.symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.$\-]{1,16}$/.test(symbol)) return res.status(400).json({ error: "Invalid ticker symbol." });
  const bundle = await getSchwabTokens(req, res);
  if (!bundle) return res.status(401).json({ error: "Schwab is not connected." });
  const today = new Date();
  const future = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 10);
  const url = new URL(`${SCHWAB_MARKET_BASE}/chains`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("contractType", "ALL");
  url.searchParams.set("strikeCount", "6");
  url.searchParams.set("includeUnderlyingQuote", "true");
  url.searchParams.set("strategy", "SINGLE");
  url.searchParams.set("fromDate", fmt(today));
  url.searchParams.set("toDate", fmt(future));
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${bundle.access_token}`, Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: payload.message || payload.error || "Schwab option chain request failed." });
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: err.message || "Unable to load Schwab option chain." });
  }
});

function avg(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sma(values, period) {
  if (values.length < period) return null;
  return avg(values.slice(-period));
}

function bollinger(values, period = 20, mult = 2) {
  if (values.length < period) return null;
  const sample = values.slice(-period);
  const middle = avg(sample);
  const variance = sample.reduce((sum, x) => sum + Math.pow(x - middle, 2), 0) / sample.length;
  const sd = Math.sqrt(variance);
  return { middle, upper: middle + mult * sd, lower: middle - mult * sd };
}

app.get("/api/market/:symbol", async (req, res) => {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "Market data is not configured." });

  const symbol = String(req.params.symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return res.status(400).json({ error: "Invalid ticker symbol." });
  }

  const cached = marketCache.get(symbol);
  if (cached && Date.now() - cached.time < CACHE_MS) {
    return res.json({ ...cached.data, cached: true });
  }

  try {
    const quoteUrl = new URL("https://api.twelvedata.com/quote");
    quoteUrl.searchParams.set("symbol", symbol);
    quoteUrl.searchParams.set("apikey", apiKey);

    function seriesUrl(interval) {
      const url = new URL("https://api.twelvedata.com/time_series");
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("interval", interval);
      url.searchParams.set("outputsize", "220");
      url.searchParams.set("apikey", apiKey);
      return url;
    }

    const [quoteResp, dailyResp, hourResp, min15Resp] = await Promise.all([
      fetch(quoteUrl),
      fetch(seriesUrl("1day")),
      fetch(seriesUrl("1h")),
      fetch(seriesUrl("15min"))
    ]);
    const [quote, daily, hour, min15] = await Promise.all([
      quoteResp.json(),
      dailyResp.json(),
      hourResp.json(),
      min15Resp.json()
    ]);

    if (!quoteResp.ok || quote.status === "error") {
      throw new Error(quote.message || "Quote request failed.");
    }

    function parseSeries(resp, payload, label) {
      if (!resp.ok || payload.status === "error" || !Array.isArray(payload.values)) {
        return { error: payload.message || label + " history unavailable.", rows: [] };
      }
      const rows = [...payload.values]
        .map(v => ({
          datetime: v.datetime,
          open: Number(v.open),
          high: Number(v.high),
          low: Number(v.low),
          close: Number(v.close),
          volume: Number(v.volume)
        }))
        .filter(v => Number.isFinite(v.close))
        .sort((a, b) => a.datetime.localeCompare(b.datetime));
      return { error: null, rows };
    }

    function summarize(parsed) {
      const closes = parsed.rows.map(v => v.close);
      const previousCloses = closes.slice(0, -1);
      return {
        available: parsed.rows.length > 0,
        error: parsed.error,
        latest: parsed.rows.at(-1) || null,
        previous: parsed.rows.at(-2) || null,
        movingAverages: {
          ma20: sma(closes, 20),
          ma40: sma(closes, 40),
          ma100: sma(closes, 100),
          ma200: sma(closes, 200)
        },
        previousMovingAverages: {
          ma20: sma(previousCloses, 20),
          ma40: sma(previousCloses, 40),
          ma100: sma(previousCloses, 100),
          ma200: sma(previousCloses, 200)
        },
        bollinger: bollinger(closes, 20, 2),
        previousBollinger: bollinger(previousCloses, 20, 2)
      };
    }

    const dailyParsed = parseSeries(dailyResp, daily, "Daily");
    if (!dailyParsed.rows.length) {
      throw new Error(dailyParsed.error || "Daily history request failed.");
    }
    const hourParsed = parseSeries(hourResp, hour, "1H");
    const min15Parsed = parseSeries(min15Resp, min15, "15m");

    const dailySummary = summarize(dailyParsed);
    const hourSummary = summarize(hourParsed);
    const min15Summary = summarize(min15Parsed);

    const rows = dailyParsed.rows;
    const closes = rows.map(v => v.close);
    const bb = dailySummary.bollinger;
    const previousClose = Number(quote.previous_close);
    const open = Number(quote.open);
    const gapPct = Number.isFinite(previousClose) && previousClose !== 0 && Number.isFinite(open)
      ? ((open - previousClose) / previousClose) * 100
      : null;

    const data = {
      symbol,
      name: quote.name || null,
      exchange: quote.exchange || null,
      currency: quote.currency || "USD",
      datetime: quote.datetime || null,
      price: Number(quote.close),
      open,
      high: Number(quote.high),
      low: Number(quote.low),
      previousClose,
      change: Number(quote.change),
      percentChange: Number(quote.percent_change),
      volume: Number(quote.volume),
      gapPct,
      movingAverages: dailySummary.movingAverages,
      bollingerDaily: bb,
      latestDailyBar: dailySummary.latest,
      timeframes: {
        min15: min15Summary,
        hour1: hourSummary,
        daily: dailySummary
      },
      source: "Twelve Data",
      cached: false
    };

    marketCache.set(symbol, { time: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error("Market data error:", err);
    res.status(502).json({ error: err.message || "Unable to load market data." });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`PreFlight Trading listening on port ${port}`);
});
