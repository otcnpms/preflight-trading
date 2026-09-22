const coreItems = [
  { id: "fed", title: "FED meeting", detail: "Check whether a Federal Reserve meeting/event is relevant to the trade window." },
  { id: "earnings", title: "Earnings", detail: "Check whether company earnings are relevant to the trade window." },
  { id: "bollinger", title: "Bollinger context", detail: "Review 15m / 1H / Daily and daily midpoint support/resistance context." },
  { id: "movingAverages", title: "Moving averages", detail: "Review floors/ceilings and the 1H / Daily context." },
  { id: "trendline", title: "Trendline / support / resistance", detail: "Identify relevant trendline breaks and key levels." },
  { id: "gap", title: "Gap context", detail: "Check for gap up / gap down and its relevance." },
  { id: "bidAsk", title: "Bid / Ask", detail: "Review liquidity and spread before selecting the contract." },
  { id: "spotStrike", title: "Spot / Strike / Expiration", detail: "Confirm spot price, strike relationship, and expiration." }
];

const state = { checks: Object.fromEntries(coreItems.map(x => [x.id, null])), market: null };
const list = document.getElementById("coreChecklist");

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? "$" + n.toFixed(2) : "—";
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fmtInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}

function renderChecklist() {
  list.innerHTML = "";
  for (const item of coreItems) {
    const row = document.createElement("div");
    row.className = "check-row";
    row.innerHTML = `
      <div><div class="check-title">${item.title}</div><div class="check-detail">${item.detail}</div></div>
      <div class="segmented" data-id="${item.id}">
        <button data-value="pass">PASS</button>
        <button data-value="fail">FAIL</button>
        <button data-value="manual">MANUAL</button>
      </div>`;
    list.appendChild(row);
  }
  syncButtons();
}

function syncButtons() {
  document.querySelectorAll(".segmented").forEach(group => {
    const id = group.dataset.id;
    group.querySelectorAll("button").forEach(btn => {
      btn.className = state.checks[id] === btn.dataset.value ? `active ${btn.dataset.value}` : "";
    });
  });
  updateStatus();
}

function updateStatus() {
  const values = Object.values(state.checks);
  const completed = values.filter(Boolean).length;
  const hasFailure = values.includes("fail");
  const allReviewed = completed === coreItems.length;
  const ready = allReviewed && !hasFailure;

  document.getElementById("coreCounter").textContent = `${completed} / ${coreItems.length} reviewed`;
  const badge = document.getElementById("overallStatus");
  badge.textContent = ready ? "METHODOLOGY COMPLETE" : hasFailure ? "REVIEW REQUIRED" : "NOT COMPLETE";
  badge.classList.toggle("ready", ready);
  document.getElementById("saveBtn").disabled = !allReviewed;
  document.getElementById("finalHeadline").textContent = ready ? "Core Pre-Flight complete" : hasFailure ? "Review failed checks" : "Pre-Flight incomplete";
  document.getElementById("finalCopy").textContent = ready
    ? "All core checks were reviewed with no failed requirement."
    : hasFailure ? "At least one core requirement is marked FAIL." : "Review every core methodology item before saving.";
}

list.addEventListener("click", e => {
  const btn = e.target.closest("button[data-value]");
  if (!btn) return;
  state.checks[btn.closest(".segmented").dataset.id] = btn.dataset.value;
  syncButtons();
});

async function loadMarketData() {
  const tickerEl = document.getElementById("ticker");
  const symbol = tickerEl.value.trim().toUpperCase();
  const msg = document.getElementById("marketMessage");
  const button = document.getElementById("loadMarketBtn");
  if (!symbol) {
    msg.textContent = "Enter a ticker first.";
    return;
  }

  tickerEl.value = symbol;
  button.disabled = true;
  button.textContent = "Loading…";
  msg.textContent = `Loading ${symbol} market data…`;

  try {
    const resp = await fetch(`/api/market/${encodeURIComponent(symbol)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Unable to load market data.");

    state.market = data;
    document.getElementById("marketCard").hidden = false;
    document.getElementById("marketSymbol").textContent = data.symbol;
    document.getElementById("marketName").textContent = data.name ? "· " + data.name : "";
    document.getElementById("marketTimestamp").textContent = data.datetime || "Latest available";
    document.getElementById("marketPrice").textContent = money(data.price);
    document.getElementById("marketExchange").textContent = data.exchange || "—";
    document.getElementById("marketVolume").textContent = fmtInt(data.volume);
    document.getElementById("marketOpen").textContent = money(data.open);
    document.getElementById("marketHigh").textContent = money(data.high);
    document.getElementById("marketLow").textContent = money(data.low);
    document.getElementById("marketPrevClose").textContent = money(data.previousClose);

    const change = num(data.change);
    const pct = num(data.percentChange);
    const changeEl = document.getElementById("marketChange");
    changeEl.textContent = change !== null && pct !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : "—";
    changeEl.className = "market-change " + (change > 0 ? "positive" : change < 0 ? "negative" : "");

    const gap = num(data.gapPct);
    document.getElementById("marketGap").textContent = gap === null ? "—" : `${gap >= 0 ? "+" : ""}${gap.toFixed(2)}%`;

    const ma = data.movingAverages || {};
    document.getElementById("ma20").textContent = money(ma.ma20);
    document.getElementById("ma40").textContent = money(ma.ma40);
    document.getElementById("ma100").textContent = money(ma.ma100);
    document.getElementById("ma200").textContent = money(ma.ma200);

    const bb = data.bollingerDaily || {};
    document.getElementById("bbUpper").textContent = money(bb.upper);
    document.getElementById("bbMiddle").textContent = money(bb.middle);
    document.getElementById("bbLower").textContent = money(bb.lower);

    function paintTimeframe(prefix, tf, statusId) {
      const latest = tf?.latest || {};
      const tma = tf?.movingAverages || {};
      const tbb = tf?.bollinger || {};
      document.getElementById(prefix + "Price").textContent = money(latest.close);
      document.getElementById(prefix + "BbUpper").textContent = money(tbb.upper);
      document.getElementById(prefix + "BbMid").textContent = money(tbb.middle);
      document.getElementById(prefix + "BbLower").textContent = money(tbb.lower);
      document.getElementById(prefix + "Ma20").textContent = money(tma.ma20);
      document.getElementById(prefix + "Ma40").textContent = money(tma.ma40);
      document.getElementById(prefix + "Ma100").textContent = money(tma.ma100);
      document.getElementById(prefix + "Ma200").textContent = money(tma.ma200);
      if (statusId) {
        document.getElementById(statusId).textContent = tf?.available
          ? "Observation only · no PASS/FAIL automation yet"
          : (tf?.error || "Timeframe data unavailable");
      }
    }

    paintTimeframe("tf15", data.timeframes?.min15, "tf15Status");
    paintTimeframe("tf1h", data.timeframes?.hour1, "tf1hStatus");
    paintTimeframe("tfD", data.timeframes?.daily);

    if (Number.isFinite(Number(data.price))) document.getElementById("spotPrice").value = Number(data.price).toFixed(2);
    updateMetrics();
    msg.textContent = `${symbol} loaded. 15m, 1H and Daily context calculated from returned price history.`;
  } catch (err) {
    document.getElementById("marketCard").hidden = true;
    msg.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = "Load Market Data";
  }
}

document.getElementById("loadMarketBtn").addEventListener("click", loadMarketData);
document.getElementById("ticker").addEventListener("keydown", e => {
  if (e.key === "Enter") loadMarketData();
});

const strategyPresent = document.getElementById("strategyPresent");
const strategy = document.getElementById("strategy");
strategyPresent.addEventListener("change", () => {
  const active = strategyPresent.value === "yes";
  strategy.disabled = !active;
  if (!active) strategy.value = "";
});

function number(id) {
  const v = parseFloat(document.getElementById(id).value);
  return Number.isFinite(v) ? v : null;
}

function updateMetrics() {
  const bid = number("bid"), ask = number("ask"), spot = number("spotPrice"), strike = number("strikePrice");
  document.getElementById("spread").textContent = bid !== null && ask !== null ? (ask - bid).toFixed(2) : "—";
  document.getElementById("strikeDistance").textContent = spot !== null && strike !== null ? (strike - spot).toFixed(2) : "—";
}
["bid","ask","spotPrice","strikePrice"].forEach(id => document.getElementById(id).addEventListener("input", updateMetrics));

document.getElementById("tradeDate").valueAsDate = new Date();

document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset this Pre-Flight?")) return;
  Object.keys(state.checks).forEach(k => state.checks[k] = null);
  state.market = null;
  document.querySelectorAll("input,textarea").forEach(el => { if (el.id !== "tradeDate") el.value = ""; });
  document.querySelectorAll("select").forEach(el => el.selectedIndex = 0);
  strategy.disabled = true;
  document.getElementById("marketCard").hidden = true;
  document.getElementById("marketMessage").textContent = "Enter a ticker and load market data.";
  updateMetrics();
  syncButtons();
});

document.getElementById("saveBtn").addEventListener("click", () => {
  const record = {
    savedAt: new Date().toISOString(),
    ticker: document.getElementById("ticker").value.trim().toUpperCase(),
    tradeDate: document.getElementById("tradeDate").value,
    priceRange: document.getElementById("priceRange").value,
    marketSnapshot: state.market,
    checks: state.checks,
    strategy: strategyPresent.value === "yes" ? strategy.value : null,
    strategyNotes: document.getElementById("strategyNotes").value,
    option: {
      type: document.getElementById("optionType").value,
      expiration: document.getElementById("expiration").value,
      spotPrice: number("spotPrice"),
      strikePrice: number("strikePrice"),
      bid: number("bid"),
      ask: number("ask"),
      contracts: number("contracts"),
      entryPrice: number("entryPrice")
    },
    plan: {
      name: document.getElementById("plan").value,
      targetDollar: number("targetDollar"),
      planPercent: number("planPercent")
    },
    tradeNotes: document.getElementById("tradeNotes").value
  };
  const history = JSON.parse(localStorage.getItem("preflightHistory") || "[]");
  history.unshift(record);
  localStorage.setItem("preflightHistory", JSON.stringify(history.slice(0, 100)));
  alert("Pre-Flight saved locally on this device.");
});

renderChecklist();
updateMetrics();
