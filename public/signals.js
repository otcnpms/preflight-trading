"use strict";
const $ = id => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
function element(tag, attrs, parent) {
  const node=document.createElementNS(svgNS,tag);
  Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
  parent.appendChild(node); return node;
}
function breakoutMarkers(candles) {
  const markers = [];
  let previous = null;
  for (let i = 20; i < candles.length; i++) {
    const band = rows => {
      const mean = rows.reduce((sum, c) => sum + c.close, 0) / 20;
      const sd = Math.sqrt(rows.reduce((sum, c) => sum + (c.close - mean) ** 2, 0) / 20);
      return {upper: mean + 2 * sd, lower: mean - 2 * sd, width: mean > 0 ? 4 * sd / mean : 0};
    };
    const prior = band(candles.slice(i - 20, i));
    const current = band(candles.slice(i - 19, i + 1));
    const direction = candles[i].close > prior.upper ? "CALL"
      : candles[i].close < prior.lower ? "PUT" : null;
    const confirmed = direction && prior.width > 0 && current.width / prior.width >= 1.02;
    if (!confirmed) { previous = null; continue; }
    markers.push({index: i, direction, first: direction !== previous});
    previous = direction;
  }
  return markers;
}
const chartET = datetime => {
  const date = new Date(datetime);
  if (Number.isNaN(date.getTime())) return String(datetime);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
  }).format(date);
};
function drawChart(candles, formingCandle = null) {
  const svg=$("signalChart"); svg.replaceChildren();
  const rows=[...candles, ...(formingCandle ? [formingCandle] : [])].slice(-65);
  if(rows.length<21) { element("text",{x:25,y:200,fill:"#91a2b8"},svg).textContent="Not enough completed candles.";return; }
  const bands=rows.map((_,i)=>{
    const window=rows.slice(Math.max(0,i-19),i+1);
    if(window.length<20)return null;
    const mean=window.reduce((s,c)=>s+c.close,0)/20;
    const sd=Math.sqrt(window.reduce((s,c)=>s+(c.close-mean)**2,0)/20);
    return {upper:mean+2*sd,middle:mean,lower:mean-2*sd};
  });
  const all=[...rows.flatMap(c=>[c.low,c.high]),...bands.filter(Boolean).flatMap(b=>[b.lower,b.upper])];
  const lo=Math.min(...all), hi=Math.max(...all), range=Math.max(hi-lo,.01);
  const left=52,right=800,top=24,bottom=365;
  const x=i=>left+(right-left)*(i+.5)/rows.length;
  const y=v=>bottom-(v-lo)/range*(bottom-top);
  for(let i=0;i<5;i++){
    const price=lo+range*i/4,py=y(price);
    element("line",{x1:left,y1:py,x2:right,y2:py,stroke:"#223955","stroke-width":1},svg);
    element("text",{x:5,y:py+4,fill:"#91a2b8","font-size":11},svg).textContent=price.toFixed(2);
  }
  // Subtle white volatility envelope, behind band outlines and candles.
  const valid=bands.map((b,i)=>b?{b,i}:null).filter(Boolean);
  if(valid.length>1){
    const upper=valid.map(({b,i})=>`${x(i)},${y(b.upper)}`);
    const lower=valid.slice().reverse().map(({b,i})=>`${x(i)},${y(b.lower)}`);
    element("polygon",{points:[...upper,...lower].join(" "),fill:"#ffffff","fill-opacity":0.09,stroke:"none"},svg);
  }
  for(const [field,color] of [["upper","#d7aa46"],["middle","#7b91ac"],["lower","#d7aa46"]]){
    const points=bands.map((b,i)=>b?`${x(i)},${y(b[field])}`:null).filter(Boolean).join(" ");
    element("polyline",{points,fill:"none",stroke:color,"stroke-width":1.7},svg);
  }
  const width=Math.max(2,(right-left)/rows.length*.54);
  rows.forEach((c,i)=>{
    const color=c.close>=c.open?"#5fd39a":"#f07e7e",cx=x(i);
    const provisional=Boolean(formingCandle && i===rows.length-1);
    const candleGroup = element("g",{},svg);
    element("line",{x1:cx,y1:y(c.high),x2:cx,y2:y(c.low),stroke:color,"stroke-width":1.5},candleGroup);
    element("rect",{x:cx-width/2,y:Math.min(y(c.open),y(c.close)),width,
      height:Math.max(1,Math.abs(y(c.open)-y(c.close))),fill:color,
      "fill-opacity":provisional?0.45:1,stroke:provisional?color:"none",
      "stroke-dasharray":provisional?"3 2":"none"},candleGroup);
    element("rect",{x:cx-Math.max(5,width/2),y:top,width:Math.max(10,width),
      height:bottom-top,fill:"transparent"},candleGroup);
    element("title",{},candleGroup).textContent =
      (provisional ? "PROVISIONAL SCHWAB BAR · " : "") + chartET(c.datetime) + " | O " + c.open.toFixed(2) +
      " H " + c.high.toFixed(2) + " L " + c.low.toFixed(2) +
      " C " + c.close.toFixed(2) + " | Volume " + Number(c.volume).toLocaleString("en-US");
  });
  if (selectedInterval === "15min") {
    for (const marker of breakoutMarkers(formingCandle ? rows.slice(0,-1) : rows).filter(m => m.first)) {
      const c = rows[marker.index], cx = x(marker.index);
      const call = marker.direction === "CALL";
      const cy = call ? Math.min(bottom - 16, y(c.low) + 19) : Math.max(top + 16, y(c.high) - 19);
      // Filled arrow silhouette rather than a font glyph; remains legible
      // regardless of the browser's arrow font.
      const shape = call
        ? "0,-15 11,-2 5,-2 5,13 -5,13 -5,-2 -11,-2"
        : "0,15 11,2 5,2 5,-13 -5,-13 -5,2 -11,2";
      const arrow = element("polygon", {
        points: shape.split(" ").map(pair => {
          const [dx, dy] = pair.split(",").map(Number);
          return (cx + dx) + "," + (cy + dy);
        }).join(" "),
        fill: call ? "#00b45c" : "#f02732",
        stroke: "#07111f", "stroke-width": 2, "stroke-linejoin": "round"
      }, svg);
      const time = new Date(c.datetime);
      const formatted = Number.isNaN(time.getTime()) ? c.datetime
        : new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York", year: "numeric", month: "short",
            day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short"
          }).format(time);
      element("title", {}, arrow).textContent =
        marker.direction + " confirmed breakout · " + formatted;
    }
  }
  element("text",{x:left,y:393,fill:"#91a2b8","font-size":11},svg).textContent=chartET(rows[0].datetime);
  element("text",{x:right,y:393,fill:"#91a2b8","font-size":11,"text-anchor":"end"},svg).textContent=chartET(rows.at(-1).datetime);
}
let selectedInterval="15min";
let selectedTradeDirection=null;
const intervalLabels={"1day":"D","1h":"1H","15min":"15m"};
async function load() {
  const symbol=$("signalTicker").value.trim().toUpperCase();
  if(!/^[A-Z0-9.\-]{1,12}$/.test(symbol)){$("signalStatus").textContent="Enter a valid ticker.";return;}
  $("signalLoad").disabled=true;$("signalStatus").textContent="Loading...";
  try{
    const response=await fetch("/api/signals/"+encodeURIComponent(symbol)+"?interval="+encodeURIComponent(selectedInterval),{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Data unavailable");
    drawChart(data.candles, selectedInterval === "15min" ? data.formingCandle : null);
    const markers = selectedInterval === "15min" && !data.dataStale ? breakoutMarkers(data.candles.slice(-65)) : [];
    const latestIndex = Math.min(64, data.candles.length - 1);
    const latest = markers.find(m => m.index === latestIndex);
    const call100 = !data.dataStale && latest?.direction === "CALL";
    const put100 = !data.dataStale && latest?.direction === "PUT";
    const indicator = $("signalBreakout100");
    if (indicator) indicator.textContent = data.dataStale ? "STALE DATA · CALL/PUT unavailable" : selectedInterval === "15min"
      ? "CALL " + (call100 ? 100 : 0) + " · PUT " + (put100 ? 100 : 0) + " · latest completed candle"
      : "CALL/PUT 0–100 available on 15m";
    $("signalTitle").textContent=symbol+" · "+intervalLabels[selectedInterval]+" Candles + BB (20, 2)";
    const s=data.signal || {status:"CONTEXT_ONLY",direction:null};
    selectedTradeDirection = selectedInterval==="15min" && ["CALL","PUT"].includes(s.direction) ? s.direction : null;
    updateInvestepHandoff();
    $("signalDirection").textContent=s.status==="FORMING"?s.direction+" · FORMING":s.status==="CONFIRMED"?s.direction+" · CONFIRMED":s.status==="UNCONFIRMED"?s.direction+" · UNCONFIRMED":s.status.replaceAll("_"," ");
    $("signalDirection").className="signal-state "+(s.status==="FORMING"?"forming":s.direction||"").toLowerCase();
    $("signalExplanation").textContent=s.status==="STALE_DATA"?"Schwab has not supplied the expected trading session. Signals are disabled until candle data catches up.":s.status==="CONTEXT_ONLY"?"Signal detection remains on 15m. This timeframe is for context.":s.status==="FORMING"?"Provisional intrabar breakout. Wait for candle close to confirm.":s.status==="CONFIRMED"?"Completed candle meets breakout and band expansion thresholds. Volume is supporting context.":s.status==="UNCONFIRMED"?"Breakout detected but filters did not all pass.":"No confirmed breakout in latest completed candle.";
    $("signalVolume").textContent=Number.isFinite(s.volumeRatio)?s.volumeRatio.toFixed(2)+"×":"—";
    $("signalExpansion").textContent=Number.isFinite(s.widthRatio)?s.widthRatio.toFixed(2)+"×":"—";
    $("signalSource").textContent=data.source;
    $("signalStatus").textContent="Loaded "+data.candles.length+" completed candles. Latest: "+(data.lastCandleAt?chartET(data.lastCandleAt):"none")+(data.formingCandle?" · PROVISIONAL "+chartET(data.formingCandle.datetime)+" (Schwab snapshot, not streaming)":"")+(data.dataStale?" · STALE DATA (expected "+data.expectedSession+" ET)":"");
  }catch(err){$("signalStatus").textContent=err.message;$("signalDirection").textContent="UNAVAILABLE";}
  finally{$("signalLoad").disabled=false;}
}
document.querySelectorAll("[data-interval]").forEach(button=>button.addEventListener("click",()=>{
  selectedInterval=button.dataset.interval;
  document.querySelectorAll("[data-interval]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
  load();
}));
$("signalLoad").addEventListener("click",load);
$("signalTicker").addEventListener("keydown",e=>{if(e.key==="Enter")load();});

const params=new URLSearchParams(location.search);
const initialSymbol=params.get("symbol");
if(initialSymbol && /^[A-Z0-9.\\-]{1,12}$/i.test(initialSymbol)){
  $("signalTicker").value=initialSymbol.toUpperCase();
  load();
}

function savedBoards(){
  try {const b=JSON.parse(localStorage.getItem("preflightWatchBoards")||"[]");
    return Array.isArray(b)?b.filter(x=>x&&typeof x.name==="string"&&Array.isArray(x.symbols)):[];
  }catch{return [];}
}
function populateBoards(){
  const select=$("signalBoard"),boards=savedBoards();
  select.replaceChildren();
  for(const b of boards){const option=document.createElement("option");option.value=b.id;option.textContent=b.name+" ("+b.symbols.length+")";select.appendChild(option);}
  const active=localStorage.getItem("preflightActiveWatchBoard");
  if(boards.some(b=>b.id===active))select.value=active;
  if(!boards.length)$("signalScanProgress").textContent="No saved watchlists in this browser. Create one in Preflight first.";
}
let autoWatchTimer=null,scanInProgress=false,soundEnabled=false,nextScanAt=0;
const seenAlerts=new Set();
function refreshWatchIndicators(){
  const active=Boolean(autoWatchTimer);
  $("signalWatchHealth").textContent=active?"● LIVE":"○ IDLE";
  $("signalWatchHealth").classList.toggle("active",active);
  $("signalWatchHealth").title=active?"Auto-watch enabled; checks every 60 seconds":"Auto-watch stopped";
  $("signalNextScan").textContent=active?Math.max(0,Math.ceil((nextScanAt-Date.now())/1000))+"s":"—";
}
setInterval(refreshWatchIndicators,1000);
let audioContext=null;
function playSignalTone(){
  if(!soundEnabled)return;
  try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    const osc=audioContext.createOscillator(),gain=audioContext.createGain();
    osc.type="sine";osc.frequency.value=740;gain.gain.value=0.06;
    osc.connect(gain);gain.connect(audioContext.destination);
    osc.start();osc.stop(audioContext.currentTime+0.16);
  }catch{}
}
function alertSignal(symbol,data){
  const s=data.signal;
  if(!data.signalIsLive || !s?.direction || !["CONFIRMED","FORMING"].includes(s.status))return;
  const key=[symbol,s.direction,s.status,data.signalCandle].join("|");
  if(seenAlerts.has(key))return;
  seenAlerts.add(key);
  if(seenAlerts.size>300)seenAlerts.delete(seenAlerts.values().next().value);
  playSignalTone();
  const title=symbol+" · "+s.direction+" "+s.status;
  if("Notification" in window && Notification.permission==="granted"){
    const notification=new Notification("Preflight Bollinger",{body:title,tag:key});
    notification.onclick=()=>{window.focus();$("signalTicker").value=symbol;selectedInterval="15min";load();notification.close();};
  }
  $("signalScanProgress").textContent="New signal: "+title+" · "+new Date().toLocaleTimeString();
}
$("signalAlertSound").addEventListener("click",async()=>{
  soundEnabled=!soundEnabled;
  $("signalAlertSound").textContent=soundEnabled?"Sound on":"Sound off";
  $("signalAlertSound").setAttribute("aria-pressed",String(soundEnabled));
  if(soundEnabled){playSignalTone();if("Notification" in window && Notification.permission==="default")await Notification.requestPermission();}
});
$("signalAutoWatch").addEventListener("click",()=>{
  if(autoWatchTimer){clearInterval(autoWatchTimer);autoWatchTimer=null;}
  else { $("signalScanBoard").click();nextScanAt=Date.now()+60000;autoWatchTimer=setInterval(()=>{nextScanAt=Date.now()+60000;if(!scanInProgress)$("signalScanBoard").click();},60000); }
  $("signalAutoWatch").textContent=autoWatchTimer?"Stop auto-watch":"Start auto-watch";
  $("signalAutoWatch").setAttribute("aria-pressed",String(Boolean(autoWatchTimer)));
  refreshWatchIndicators();
});
$("signalScanBoard").addEventListener("click",async()=>{
  const board=savedBoards().find(b=>b.id===$("signalBoard").value);
  if(!board||scanInProgress)return;
  scanInProgress=true;
  const btn=$("signalScanBoard");btn.disabled=true;
  $("signalScanResults").replaceChildren();
  for(const [i,symbol] of board.symbols.entries()){
    $("signalScanProgress").textContent="Scanning "+(i+1)+"/"+board.symbols.length+" · "+symbol;
    const line=document.createElement("div");line.className="data-line";
    const link=document.createElement("button");link.type="button";link.className="secondary";link.textContent=symbol;
    link.addEventListener("click",()=>{document.querySelectorAll("#signalScanResults .data-line").forEach(el=>el.classList.remove("active"));line.classList.add("active");$("signalTicker").value=symbol;selectedInterval="15min";document.querySelectorAll("[data-interval]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.interval==="15min")));load();});
    const status=document.createElement("strong");status.textContent="Checking…";
    line.append(link,status);$("signalScanResults").appendChild(line);
    try{const res=await fetch("/api/signals/"+encodeURIComponent(symbol)+"?interval=15min",{cache:"no-store"});
      const data=await res.json();if(!res.ok)throw Error(data.error||"Unavailable");
      status.textContent=data.dataStale?"STALE DATA":data.signal?.direction?data.signal.direction+" · "+data.signal.status:data.signal?.status||"NO SIGNAL";
      status.className=(data.signal?.status==="FORMING"?"forming":data.signal?.direction||"").toLowerCase();
      if(data.signalIsLive && data.signal?.direction)line.classList.add("live");
      alertSignal(symbol,data);
    }catch(err){status.textContent=err.message;}
  }
  $("signalScanProgress").textContent=board.symbols.length+" symbols";
  $("signalLastScan").textContent="↻ "+new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  btn.disabled=false;scanInProgress=false;
});
populateBoards();

// Handoff to the existing Investep trade workflow; never imply a validated entry.
function updateInvestepHandoff(){
  const symbol=$("signalTicker").value.trim().toUpperCase();
  const link=$("investepHandoff");
  const params=new URLSearchParams();
  if(/^[A-Z0-9.\\-]{1,12}$/.test(symbol))params.set("symbol",symbol);
  if(selectedTradeDirection)params.set("direction",selectedTradeDirection);
  link.href="/"+(params.size?"?"+params.toString():"");
}
$("signalTicker").addEventListener("input",()=>{selectedTradeDirection=null;updateInvestepHandoff();});
$("investepHandoff").addEventListener("click",updateInvestepHandoff);
updateInvestepHandoff();
