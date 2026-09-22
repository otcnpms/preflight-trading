const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const marketCache = new Map();
const CACHE_MS = 60_000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "preflight-trading" });
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

    const dailyUrl = new URL("https://api.twelvedata.com/time_series");
    dailyUrl.searchParams.set("symbol", symbol);
    dailyUrl.searchParams.set("interval", "1day");
    dailyUrl.searchParams.set("outputsize", "220");
    dailyUrl.searchParams.set("apikey", apiKey);

    const [quoteResp, dailyResp] = await Promise.all([fetch(quoteUrl), fetch(dailyUrl)]);
    const [quote, daily] = await Promise.all([quoteResp.json(), dailyResp.json()]);

    if (!quoteResp.ok || quote.status === "error") {
      throw new Error(quote.message || "Quote request failed.");
    }
    if (!dailyResp.ok || daily.status === "error" || !Array.isArray(daily.values)) {
      throw new Error(daily.message || "Daily history request failed.");
    }

    const rows = [...daily.values]
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

    const closes = rows.map(v => v.close);
    const bb = bollinger(closes, 20, 2);
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
      movingAverages: {
        ma20: sma(closes, 20),
        ma40: sma(closes, 40),
        ma100: sma(closes, 100),
        ma200: sma(closes, 200)
      },
      bollingerDaily: bb,
      latestDailyBar: rows.at(-1) || null,
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
