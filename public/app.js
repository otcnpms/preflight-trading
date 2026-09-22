const coreItems = [
  { id: "fed", title: "FED meeting", detail: "Calendar context for the selected trade date.", mode: "auto" },
  { id: "earnings", title: "Earnings", detail: "Confirm whether company earnings are relevant to the trade window.", mode: "manual" },
  { id: "bollinger", title: "Bollinger context", detail: "15m / 1H / Daily position versus Bollinger midpoint and bands.", mode: "auto" },
  { id: "movingAverages", title: "Moving averages", detail: "15m / 1H / Daily price position versus MA 20 / 40 / 100 / 200.", mode: "auto" },
  { id: "trendline", title: "Trendline / support / resistance", detail: "Visual review of trendlines and key support/resistance.", mode: "manual" },
  { id: "gap", title: "Gap context", detail: "Gap up/down calculated from session open versus previous close.", mode: "auto" },
  { id: "bidAsk", title: "Bid / Ask", detail: "Spread and midpoint calculated from the selected option contract.", mode: "auto" },
  { id: "spotStrike", title: "Spot / Strike / Expiration", detail: "Spot/strike relationship and DTE calculated from contract details.", mode: "auto" }
];

const state = {
  checks: Object.fromEntries(coreItems.filter(x => x.mode === "manual").map(x => [x.id, null])),
  autoFacts: Object.fromEntries(coreItems.filter(x => x.mode === "auto").map(x => [x.id, null])),
  market: null
};

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
    state.autoFacts.fed = null;
    renderChecklist();
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
  state.autoFacts.fed = statusEl.textContent;
  renderChecklist();
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
    if (item.mode === "auto") {
      const fact = state.autoFacts[item.id];
      row.innerHTML = `
        <div>
          <div class="check-title">${item.title} <span class="core-mode auto">AUTO</span></div>
          <div class="check-detail">${item.detail}</div>
          <div class="auto-fact ${fact ? "available" : ""}">${fact || "Waiting for data"}</div>
        </div>
        <div class="auto-check ${fact ? "done" : ""}">${fact ? "✓" : "—"}</div>`;
    } else {
      row.innerHTML = `
        <div>
          <div class="check-title">${item.title} <span class="core-mode visual">VISUAL</span></div>
          <div class="check-detail">${item.detail}</div>
        </div>
        <div class="segmented" data-id="${item.id}">
          <button data-value="pass">CONFIRM</button>
          <button data-value="fail">ISSUE</button>
        </div>`;
    }
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
  const manualValues = Object.values(state.checks);
  const manualReviewed = manualValues.filter(Boolean).length;
  const autoValues = Object.values(state.autoFacts);
  const autoReady = autoValues.filter(Boolean).length;
  const hasFailure = manualValues.includes("fail");
  const allReviewed = manualReviewed === manualValues.length && autoReady === autoValues.length;
  const ready = allReviewed && !hasFailure;

  document.getElementById("coreCounter").textContent =
    `${autoReady} auto · ${manualValues.length - manualReviewed} visual remaining`;
  const badge = document.getElementById("overallStatus");
  badge.textContent = ready ? "METHODOLOGY COMPLETE" : hasFailure ? "REVIEW REQUIRED" : "NOT COMPLETE";
  badge.classList.toggle("ready", ready);
  document.getElementById("saveBtn").disabled = !allReviewed;
  document.getElementById("finalHeadline").textContent = ready ? "Core Pre-Flight complete" : hasFailure ? "Review visual issue" : "Pre-Flight incomplete";
  document.getElementById("finalCopy").textContent = ready
    ? "All available objective checks are populated and visual checks are confirmed."
    : hasFailure
      ? "At least one visual methodology check is marked ISSUE."
      : `${autoValues.length - autoReady} automatic checks and ${manualValues.length - manualReviewed} visual reviews remain.`;
}

function setAutoFact(id, text) {
  state.autoFacts[id] = text || null;
  renderChecklist();
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

    const tf15 = data.timeframes?.min15;
    const tf1h = data.timeframes?.hour1;
    const tfD = data.timeframes?.daily;
    const allTfAvailable = tf15?.available && tf1h?.available && tfD?.available;

    state.autoFacts.bollinger = allTfAvailable
      ? `15m: ${bollingerContext(Number(tf15.latest?.close), tf15.bollinger)} · 1H: ${bollingerContext(Number(tf1h.latest?.close), tf1h.bollinger)} · Daily: ${bollingerContext(Number(tfD.latest?.close), tfD.bollinger)}`
      : null;

    state.autoFacts.movingAverages = allTfAvailable
      ? `15m: ${maContext(Number(tf15.latest?.close), tf15.movingAverages)} · 1H: ${maContext(Number(tf1h.latest?.close), tf1h.movingAverages)} · Daily: ${maContext(Number(tfD.latest?.close), tfD.movingAverages)}`
      : null;

    state.autoFacts.gap = gap === null
      ? null
      : `${gap > 0 ? "Gap up" : gap < 0 ? "Gap down" : "No gap"} · ${gap >= 0 ? "+" : ""}${gap.toFixed(2)}%`;

    if (Number.isFinite(Number(data.price))) document.getElementById("spotPrice").value = Number(data.price).toFixed(2);
    updateMetrics();
    renderChecklist();
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
  },
  E3: {
    title: "Rebote en punto medio · tendencia a la baja",
    meta: "Bollinger · Diario bajista · 1 hora alcista · confirmación: 15 minutos",
    direction: "Course-defined setup direction: bearish / put. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "En Bollinger, la temporalidad Diario debe encontrarse en una tendencia claramente bajista.",
      "En Bollinger, la temporalidad 1 Hora debe encontrarse en una tendencia claramente alcista.",
      "El precio debe venir subiendo y acercarse al punto medio del Diario, equivalente a la media móvil de 20 períodos, usada como referencia del punto de rebote.",
      "Cuando el precio toca esa marca, verificar que no cruce el punto medio sino que lo respete.",
      "Cambiar a 15 minutos y esperar que el precio comience a rebotar desde esa zona.",
      "En 1 Hora, esperar una vela de confirmación bajista."
    ]
  },
  E4: {
    title: "Rebote en punto medio · tendencia al alza",
    meta: "Bollinger · Diario alcista · 1 hora bajista · confirmación: 15 minutos",
    direction: "Course-defined setup direction: bullish / call. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "En Bollinger, la temporalidad Diario debe encontrarse en una tendencia claramente alcista.",
      "En Bollinger, la temporalidad 1 Hora debe encontrarse en una tendencia claramente bajista.",
      "El precio debe venir cayendo y acercarse al punto medio del Diario, equivalente a la media móvil de 20 períodos, usada como referencia del punto de rebote.",
      "Cuando el precio toca esa marca, verificar que no cruce el punto medio sino que lo respete.",
      "Cambiar a 15 minutos y esperar que el precio comience a rebotar desde esa zona.",
      "En 1 Hora, esperar una vela de confirmación alcista."
    ]
  },
  E5: {
    title: "Tendencia lateral · apertura fuera de Bollinger al alza sin volatilidad",
    meta: "Bollinger · temporalidad: 15 minutos · apertura del mercado",
    direction: "Course-defined setup direction: bearish / put. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "En temporalidad 15 minutos, en Bollinger la tendencia debe ser totalmente lateral y sin volatilidad.",
      "El precio debe aperturar con un salto y quedar extremadamente alejado del oscilador superior, en zona de sobrecompra.",
      "Observar que el precio comience a bajar después de la apertura.",
      "Según la metodología del curso, una vez cumplidos los requisitos la ejecución se contempla dentro de los primeros 5 minutos de la apertura del mercado.",
      "La nota del curso recomienda comenzar el análisis unos minutos antes de la apertura para confirmar que el precio abrirá con un salto considerable al alza respecto al cierre del día anterior."
    ]
  },
  E6: {
    title: "Tendencia lateral · apertura fuera de Bollinger a la baja sin volatilidad",
    meta: "Bollinger · temporalidad: 15 minutos · apertura del mercado",
    direction: "Course-defined setup direction: bullish / call. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "En temporalidad 15 minutos, en Bollinger la tendencia debe ser totalmente lateral y sin volatilidad.",
      "El precio debe aperturar con un salto a la baja y quedar extremadamente alejado del oscilador inferior, en zona de sobreventa.",
      "Observar que el precio comience a subir después de la apertura.",
      "Según la metodología del curso, una vez cumplidos los requisitos la compra de contratos call se contempla dentro de los primeros 5 minutos de la apertura del mercado.",
      "La estrategia se concentra en los primeros movimientos del mercado; el material del curso indica que el desplazamiento principal puede ocurrir dentro de los primeros 15 minutos."
    ]
  },
  E7: {
    title: "Efecto Imán · tendencia bajista · medias móviles 20 y 40",
    meta: "Gráfico 1 hora · Bollinger 15 minutos · volumen + Worden Stochastics",
    direction: "Course-defined setup direction: bullish / call. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "En las medias móviles, la tendencia debe ser claramente bajista y llevar varios días bajando.",
      "El precio debe abrir con un fuerte salto a la baja y quedar muy alejado de la media móvil de 20 períodos.",
      "En Bollinger de 15 minutos, la primera vela debe quedar completamente fuera del oscilador.",
      "Cuando comience a formarse la vela en el indicador de volumen, debe cruzar la línea roja del indicador Worden Stochastics; el material del curso lo usa como confirmación de compra de contratos call."
    ]
  },
  E8: {
    title: "Efecto Imán · tendencia alcista · medias móviles 20 y 40",
    meta: "Gráfico 1 hora · Bollinger 15 minutos · volumen + Worden Stochastics",
    direction: "Course-defined setup direction: bearish / put. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "En las medias móviles, la tendencia debe ser claramente alcista y llevar varios días subiendo.",
      "El precio debe abrir con un fuerte salto al alza y quedar muy alejado de la media móvil de 20 períodos.",
      "En Bollinger de 15 minutos, la primera vela debe quedar completamente fuera del oscilador.",
      "Cuando comience a formarse la vela en el indicador de volumen, debe cruzar la línea roja del indicador Worden Stochastics; el material del curso lo usa como confirmación de compra de contratos put."
    ]
  },
  E9: {
    title: "Cambio de tendencia al alza · Bollinger 15 minutos",
    meta: "Bollinger · temporalidad: 15 minutos · gap + punto medio + línea de tendencia",
    direction: "Course-defined setup direction: bullish / call. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "En 15 minutos, la tendencia debe ser bajista o lateral.",
      "Trazar una línea de tendencia desde el punto máximo del día hasta el mínimo, por la parte superior del precio, bordeando la mayor cantidad de puntos posibles.",
      "El precio debe abrir con un salto al alza, rompiendo el punto medio de Bollinger y la línea de tendencia.",
      "Si al abrir se expande la volatilidad inmediatamente, el material del curso considera la condición válida para la estrategia.",
      "Según la metodología del curso, una vez cumplidos los requisitos se contempla tomar posición en CALL."
    ]
  },
  E10: {
    title: "Cambio de tendencia a la baja · Bollinger 15 minutos",
    meta: "Bollinger · temporalidad: 15 minutos · gap + punto medio + línea de tendencia",
    direction: "Course-defined setup direction: bearish / put. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "En 15 minutos, la tendencia debe ser alcista o lateral.",
      "Trazar una línea de tendencia por debajo del precio, bordeando la mayor cantidad de puntos posibles.",
      "El precio debe abrir con un salto a la baja, rompiendo el punto medio de Bollinger y la línea de tendencia.",
      "Si al abrir se expande la volatilidad inmediatamente, el material del curso considera la condición válida para la estrategia.",
      "Según la metodología del curso, una vez cumplidos los requisitos se contempla tomar posición en PUT."
    ]
  },
  E11: {
    title: "Cambio de tendencia lateral al alza a mediano plazo",
    meta: "Medias móviles 20 / 40 / 100 / 200 · canal lateral · Bollinger 1 hora",
    direction: "Course-defined setup direction: bullish / call. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "Las medias móviles de 20, 40, 100 y 200 períodos deben mostrarse laterales o entrelazadas dentro de un canal lateral, con predominio de las medias de 100 y 200 períodos.",
      "El precio debe permanecer dentro de ese canal lateral durante 10 días o más; el material indica que puede extenderse por más de 30 días.",
      "Debe aparecer una señal alcista que saque al precio del canal, ya sea mediante un salto (gap), una vela alcista o una vela extremadamente alcista.",
      "Esperar una vela final de confirmación alcista.",
      "La confirmación debe observarse en Bollinger Bands de 1 Hora con alta volatilidad."
    ]
  },
  E12: {
    title: "Cambio de tendencia lateral a la baja a mediano plazo",
    meta: "Medias móviles 20 / 40 / 100 / 200 · canal lateral · Bollinger 1 hora",
    direction: "Course-defined setup direction: bearish / put. PreFlight records the course methodology; it does not recommend a trade.",
    requirements: [
      "Las medias móviles de 20, 40, 100 y 200 períodos deben mostrarse laterales o entrelazadas dentro de un canal lateral, con predominio de las medias de 100 y 200 períodos; el precio suele moverse entre las medias durante el canal.",
      "El precio debe permanecer dentro de ese canal lateral durante 10 días o más; el material indica que puede extenderse por más de 30 días y debe respetar repetidamente los límites del canal.",
      "Debe aparecer una señal bajista que saque al precio del canal, ya sea mediante un salto (gap), una vela bajista o una vela extremadamente bajista.",
      "Esperar una vela final de confirmación bajista.",
      "La confirmación debe observarse en Bollinger Bands de 1 Hora con alta volatilidad."
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
  const bid = number("bid");
  const ask = number("ask");
  const spot = number("spotPrice");
  const strike = number("strikePrice");
  const contracts = number("contracts");
  const entry = number("entryPrice");
  const type = document.getElementById("optionType").value;
  const expiration = document.getElementById("expiration").value;
  const tradeDate = document.getElementById("tradeDate").value;

  const spread = bid !== null && ask !== null ? ask - bid : null;
  const mid = bid !== null && ask !== null ? (bid + ask) / 2 : null;
  const distance = spot !== null && strike !== null ? strike - spot : null;
  const distancePct = distance !== null && spot ? (distance / spot) * 100 : null;

  document.getElementById("spread").textContent = spread !== null ? spread.toFixed(2) : "—";
  document.getElementById("midPrice").textContent = mid !== null ? money(mid) : "—";
  document.getElementById("spreadPct").textContent = spread !== null && mid ? ((spread / mid) * 100).toFixed(1) + "%" : "—";
  document.getElementById("strikeDistance").textContent = distance !== null ? `${distance >= 0 ? "+" : ""}${distance.toFixed(2)}` : "—";
  document.getElementById("strikeDistancePct").textContent = distancePct !== null ? `${distancePct >= 0 ? "+" : ""}${distancePct.toFixed(2)}%` : "—";

  let moneyness = "—";
  if (spot !== null && strike !== null && type) {
    const diff = Math.abs(spot - strike);
    const atmThreshold = Math.max(0.5, spot * 0.0025);
    if (diff <= atmThreshold) {
      moneyness = "ATM";
    } else if (type === "CALL") {
      moneyness = strike < spot ? "ITM" : "OTM";
    } else if (type === "PUT") {
      moneyness = strike > spot ? "ITM" : "OTM";
    }
  }
  document.getElementById("moneyness").textContent = moneyness;

  let dte = "—";
  if (expiration && tradeDate) {
    const start = localDateOnly(tradeDate);
    const end = localDateOnly(expiration);
    dte = String(Math.round((end - start) / 86400000));
  }
  document.getElementById("dte").textContent = dte;

  const costBasis = entry !== null ? entry : mid;
  document.getElementById("estimatedCost").textContent =
    contracts !== null && costBasis !== null ? money(costBasis * 100 * contracts) : "—";

  state.autoFacts.bidAsk = spread !== null && mid !== null
    ? `Mid ${money(mid)} · spread ${spread.toFixed(2)} (${((spread / mid) * 100).toFixed(1)}%)`
    : null;

  state.autoFacts.spotStrike = spot !== null && strike !== null && expiration
    ? `Spot ${money(spot)} · strike ${money(strike)} · ${moneyness} · ${dte} DTE`
    : null;

  renderChecklist();
}
["bid","ask","spotPrice","strikePrice","contracts","entryPrice","expiration","optionType","tradeDate"].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener(el.tagName === "SELECT" || el.type === "date" ? "change" : "input", updateMetrics);
});

document.getElementById("tradeDate").valueAsDate = new Date();
document.getElementById("tradeDate").addEventListener("change", updateFedContext);
updateFedContext();

document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset this Pre-Flight?")) return;
  Object.keys(state.checks).forEach(k => state.checks[k] = null);
  Object.keys(state.autoFacts).forEach(k => state.autoFacts[k] = null);
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
    autoFacts: state.autoFacts,
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
