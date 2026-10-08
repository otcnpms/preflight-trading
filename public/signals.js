"use strict";
const $ = id => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
function element(tag, attrs, parent) {
  const node=document.createElementNS(svgNS,tag);
  Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
  parent.appendChild(node); return node;
}
function drawChart(candles) {
  const svg=$("signalChart"); svg.replaceChildren();
  const rows=candles.slice(-65);
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
    element("line",{x1:cx,y1:y(c.high),x2:cx,y2:y(c.low),stroke:color,"stroke-width":1.5},svg);
    element("rect",{x:cx-width/2,y:Math.min(y(c.open),y(c.close)),width,
      height:Math.max(1,Math.abs(y(c.open)-y(c.close))),fill:color},svg);
  });
  element("text",{x:left,y:393,fill:"#91a2b8","font-size":11},svg).textContent=rows[0].datetime;
  element("text",{x:right,y:393,fill:"#91a2b8","font-size":11,"text-anchor":"end"},svg).textContent=rows.at(-1).datetime;
}
let selectedInterval="15min";
const intervalLabels={"1day":"D","1h":"1H","15min":"15m"};
async function load() {
  const symbol=$("signalTicker").value.trim().toUpperCase();
  if(!/^[A-Z0-9.\-]{1,12}$/.test(symbol)){$("signalStatus").textContent="Enter a valid ticker.";return;}
  $("signalLoad").disabled=true;$("signalStatus").textContent="Loading...";
  try{
    const response=await fetch("/api/signals/"+encodeURIComponent(symbol)+"?interval="+encodeURIComponent(selectedInterval),{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Data unavailable");
    drawChart(data.candles);
    $("signalTitle").textContent=symbol+" · "+intervalLabels[selectedInterval]+" Candles + BB (20, 2)";
    const s=data.signal;
    $("signalDirection").textContent=s.status==="CONFIRMED"?s.direction+" · CONFIRMED":s.status==="UNCONFIRMED"?s.direction+" · UNCONFIRMED":s.status.replaceAll("_"," ");
    $("signalDirection").className="signal-state "+(s.direction||"").toLowerCase();
    $("signalExplanation").textContent=s.status==="CONFIRMED"?"Historical candle meets breakout, volume and expansion thresholds.":s.status==="UNCONFIRMED"?"Breakout detected but filters did not all pass.":"No confirmed breakout in latest completed candle.";
    $("signalVolume").textContent=Number.isFinite(s.volumeRatio)?s.volumeRatio.toFixed(2)+"×":"—";
    $("signalExpansion").textContent=Number.isFinite(s.widthRatio)?s.widthRatio.toFixed(2)+"×":"—";
    $("signalSource").textContent=data.source;
    $("signalStatus").textContent="Loaded "+data.candles.length+" completed candles.";
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
