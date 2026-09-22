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

const fomcMeetings = [
  { start: "2026-01-27", end: "2026-01-28" },
  { start: "2026-03-17", end: "2026-03-18" },
  { start: "2026-04-28", end: "2026-04-29" },
  { start: "2026-06-16", end: "2026-06-17" },
  { start: "2026-07-28", end: "2026-07-29" },
  { start: "2026-09-15", end: "2026-09-16" },
  { start: "2026-10-27", end: "2026-10-28" },
  { start: "2026-12-08", end: "2026-12-09" },
  { start: "2027-01-26", end: "2027-01-27" },
  { start: "2027-03-16", end: "2027-03-17" },
  { start: "2027-04-27", end: "2027-04-28" },
  { start: "2027-06-08", end: "2027-06-09" },
  { start: "2027-07-27", end: "2027-07-28" },
  { start: "2027-09-14", end: "2027-09-15" },
  { start: "2027-10-26", end: "2027-10-27" },
  { start: "2027-12-07", end: "2027-12-08" }
];

function localDateOnly(value) {
  const [y,m,d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatShortDate(value) {
  return localDateOnly(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function updateFedContext() {
  const tradeDateValue = document.getElementById("tradeDate").value;
  if (!tradeDateValue) return;

  const tradeDate = localDateOnly(tradeDateValue);
  const oneDay = 86400000;

  const current = fomcMeetings.find(m => {
    const start = localDateOnly(m.start);
    const end = localDateOnly(m.end);
    return tradeDate >= start && tradeDate <= end;
  });

  const next = fomcMeetings.find(m => localDateOnly(m.end) >= tradeDate);
  const nextDateEl = document.getElementById("fedNextDate");
  const daysAwayEl = document.getElementById("fedDaysAway");
  const statusEl = document.getElementById("fedTradeStatus");

  if (!next) {
    nextDateEl.textContent = "Schedule not loaded";
    daysAwayEl.textContent = "—";
    statusEl.textContent = "Manual review";
    return;
  }

  nextDateEl.textContent = formatShortDate(next.start) + "–" + localDateOnly(next.end).getDate();
  const daysAway = Math.ceil((localDateOnly(next.start) - tradeDate) / oneDay);
  daysAwayEl.textContent = current ? "0" : String(Math.max(0, daysAway));

  if (current) {
    statusEl.textContent = "FOMC meeting day";
  } else if (daysAway === 1) {
    statusEl.textContent = "Meeting tomorrow";
  } else if (daysAway >= 0 && daysAway <= 3) {
    statusEl.textContent = "Meeting within 3 days";
  } else {
    statusEl.textContent = "No meeting within 3 days";
  }
}

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

    function bollingerContext(price, bb) {
      if (![price, bb?.upper, bb?.middle, bb?.lower].every(v => Number.isFinite(Number(v)))) return "—";
      if (price > bb.upper) return "Above upper band";
      if (price < bb.lower) return "Below lower band";
      if (price >= bb.middle) return "Above midpoint · inside bands";
      return "Below midpoint · inside bands";
    }

    function maContext(price, ma) {
      const pairs = [
        ["20", ma?.ma20], ["40", ma?.ma40], ["100", ma?.ma100], ["200", ma?.ma200]
      ].filter(([,v]) => Number.isFinite(Number(v)));
      if (!Number.isFinite(Number(price)) || !pairs.length) return "—";
      const above = pairs.filter(([,v]) => price >= Number(v)).map(([label]) => label);
      const below = pairs.filter(([,v]) => price < Number(v)).map(([label]) => label);
      if (above.length === pairs.length) return "Above 20 / 40 / 100 / 200";
      if (below.length === pairs.length) return "Below 20 / 40 / 100 / 200";
      const parts = [];
      if (above.length) parts.push("Above " + above.join(" / "));
      if (below.length) parts.push("Below " + below.join(" / "));
      return parts.join(" · ");
    }

    function paintTimeframe(prefix, tf, statusId) {
      const latest = tf?.latest || {};
      const tma = tf?.movingAverages || {};
      const tbb = tf?.bollinger || {};
      const price = Number(latest.close);
      document.getElementById(prefix + "Price").textContent = money(price);
      document.getElementById(prefix + "BbContext").textContent = bollingerContext(price, tbb);
      document.getElementById(prefix + "MaContext").textContent = maContext(price, tma);
      document.getElementById(prefix + "BbUpper").textContent = money(tbb.upper);
      document.getElementById(prefix + "BbMid").textContent = money(tbb.middle);
      document.getElementById(prefix + "BbLower").textContent = money(tbb.lower);
      document.getElementById(prefix + "Ma20").textContent = money(tma.ma20);
      document.getElementById(prefix + "Ma40").textContent = money(tma.ma40);
      document.getElementById(prefix + "Ma100").textContent = money(tma.ma100);
      document.getElementById(prefix + "Ma200").textContent = money(tma.ma200);
      if (statusId) {
        document.getElementById(statusId).textContent = tf?.available
          ? "Observation only"
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


const strategyDefinitions = {
  E1: {
    title: "Cambio de tendencia al alza",
    meta: "Bollinger · temporalidad principal: 1 hora · confirmación: 15 minutos",
    direction: "Course-defined setup direction: bullish / call. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "Trazar una línea de tendencia sobre la trayectoria bajista, bordeando levemente por encima la mayor cantidad de puntos posibles.",
      "El precio rompe la línea de tendencia bajista.",
      "La ruptura puede ocurrir durante el día o en forma de salto (gap).",
      "En la temporalidad de 1 hora, el precio rompe la media móvil de 20 períodos y termina con una vela de confirmación alcista.",
      "Al cambiar a 15 minutos, la tendencia debe mostrarse totalmente alcista."
    ]
  },
  E2: {
    title: "Cambio de tendencia a la baja",
    meta: "Bollinger · temporalidad principal: 1 hora · confirmación: 15 minutos",
    direction: "Course-defined setup direction: bearish / put. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "Trazar una línea de tendencia sobre la trayectoria alcista, bordeando levemente por debajo la mayor cantidad de puntos posibles.",
      "El precio rompe la línea de tendencia alcista.",
      "La ruptura puede ocurrir durante el día o en forma de salto (gap).",
      "En la temporalidad de 1 hora, el precio rompe la media móvil de 20 períodos y termina con una vela de confirmación bajista.",
      "Al cambiar a 15 minutos, la tendencia debe mostrarse totalmente bajista."
    ]
  }
};

const strategyConfirmations = {};

function renderStrategyModule(code) {
  const module = document.getElementById("strategyModule");
  const def = strategyDefinitions[code];
  if (!def) {
    module.hidden = true;
    return;
  }

  module.hidden = false;
  document.getElementById("strategyCode").textContent = code;
  document.getElementById("strategyTitle").textContent = def.title;
  document.getElementById("strategyMeta").textContent = def.meta;
  document.getElementById("strategyCourseDirection").textContent = def.direction;

  if (!strategyConfirmations[code]) {
    strategyConfirmations[code] = Array(def.requirements.length).fill(false);
  }

  const wrap = document.getElementById("strategyRequirements");
  wrap.innerHTML = "";
  def.requirements.forEach((text, index) => {
    const row = document.createElement("label");
    row.className = "strategy-check";
    row.innerHTML = `
      <input type="checkbox" data-strategy="${code}" data-index="${index}" ${strategyConfirmations[code][index] ? "checked" : ""}>
      <span><strong>Requirement ${index + 1}</strong><small>${text}</small></span>
    `;
    wrap.appendChild(row);
  });
  updateStrategyProgress(code);
}

function updateStrategyProgress(code) {
  const def = strategyDefinitions[code];
  if (!def) return;
  const values = strategyConfirmations[code] || [];
  const complete = values.filter(Boolean).length;
  document.getElementById("strategyProgress").textContent = `${complete} / ${def.requirements.length} confirmed`;
}

document.getElementById("strategyRequirements").addEventListener("change", e => {
  const box = e.target.closest('input[type="checkbox"][data-strategy]');
  if (!box) return;
  const code = box.dataset.strategy;
  const index = Number(box.dataset.index);
  if (!strategyConfirmations[code]) return;
  strategyConfirmations[code][index] = box.checked;
  updateStrategyProgress(code);
});


const strategyPresent = document.getElementById("strategyPresent");
const strategy = document.getElementById("strategy");
strategyPresent.addEventListener("change", () => {
  const active = strategyPresent.value === "yes";
  strategy.disabled = !active;
  if (!active) {
    strategy.value = "";
    document.getElementById("strategyModule").hidden = true;
  } else if (strategy.value) {
    renderStrategyModule(strategy.value);
  }
});

strategy.addEventListener("change", () => {
  renderStrategyModule(strategy.value);
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
document.getElementById("tradeDate").addEventListener("change", updateFedContext);
updateFedContext();

document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset this Pre-Flight?")) return;
  Object.keys(state.checks).forEach(k => state.checks[k] = null);
  state.market = null;
  document.querySelectorAll("input,textarea").forEach(el => { if (el.id !== "tradeDate") el.value = ""; });
  document.querySelectorAll("select").forEach(el => el.selectedIndex = 0);
  strategy.disabled = true;
  document.getElementById("strategyModule").hidden = true;
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
    strategyRequirements: strategyPresent.value === "yes" && strategy.value
      ? strategyConfirmations[strategy.value] || []
      : [],
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

document.addEventListener("click", e => {
  const toggle = e.target.closest(".details-toggle");
  if (!toggle) return;
  const panel = document.getElementById(toggle.dataset.target);
  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  toggle.textContent = willOpen ? "Hide details" : "Details";
});
