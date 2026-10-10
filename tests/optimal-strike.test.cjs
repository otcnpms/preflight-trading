const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("public/app.js","utf8");
function extract(name) {
  const begin=source.indexOf("function "+name+"(");
  assert(begin>=0,"Missing "+name);
  const next=source.indexOf("\nfunction ",begin+10);
  return source.slice(begin,next<0?undefined:next);
}
const handlers = {};
const elements = {
  optimalStrikeSummary:{textContent:""},
  optimalStrikeCandidates:{children:[],replaceChildren(){this.children=[]},appendChild(x){this.children.push(x)}},
  chainExpiration:{value:"2026-10-16"}
};
const ctx={
  document:{getElementById:id=>elements[id],createElement:()=>({addEventListener:(ev,fn)=>{handlers[ev]=fn}})},
  state:{market:{symbol:"HD"}},
  investepOptionRanges:{HD:{optimal:[120,240]},QQQ:{optimal:[35,55]}},
  schwabOptionChain:[],
  optionRangePct:c=>c.low>0&&c.high>=c.low?(c.high-c.low)/c.low*100:null,
  optionPriceInsideDayRange:c=>c.ask>=c.low&&c.ask<=c.high,
  optionContractDollars:c=>c.ask*100,
  useRangeContract:symbol=>{ctx.selected=symbol}
};
vm.createContext(ctx);
ctx.investepEligibleContracts=analysis=>analysis.ranked.filter(x=>x.inRange && x.contract.bid>0 && x.contract.ask>0 && (x.contract.ask-x.contract.bid)/x.contract.ask<=0.20);
vm.runInContext(extract("renderOptimalStrikePreview"),ctx);
function c(symbol,strike,ask,low,high,bid=ask*0.9,type="CALL") {
 return {symbol,strike,ask,low,high,bid,type,expiration:"2026-10-16"};
}
function render(symbol,chain,type="CALL",spot=100){
 ctx.state.market.symbol=symbol;ctx.schwabOptionChain=chain;
 const ranked=chain.filter(x=>x.expiration==="2026-10-16" && x.type===type && (type==="CALL"?x.strike>spot:x.strike<spot)).map(contract=>({contract,valuation:ctx.optionRangePct(contract),inRange:ctx.optionPriceInsideDayRange(contract),cost:ctx.optionContractDollars(contract)})).filter(x=>x.valuation!==null).sort((a,b)=>b.valuation-a.valuation);
 ctx.renderOptimalStrikePreview({type,spot,ranked});
 return {text:elements.optimalStrikeSummary.textContent,buttons:elements.optimalStrikeCandidates.children.map(x=>x.textContent)};
}
let out=render("HD",[c("A",105,2,1,4),c("B",110,0.4,0.2,1.8),c("C",115,1.5,1,2),c("ITM",90,1,0.5,2)]);
assert.match(out.text,/110 CALL/); // highest valuation wins even at lower ASK
assert.equal(out.buttons.length,3);
assert.match(out.buttons[1],/105 CALL/);
out=render("HD",[c("HIGH",105,3,1,4),c("LOW",110,2,1,2)]);
assert.match(out.text,/105 CALL/);
assert.match(out.text,/Outside HD instructor optimal/);
out=render("QQQ",[c("Q",105,0.45,0.3,0.6)]);
assert.match(out.text,/Inside QQQ instructor optimal \$35–55/);
out=render("UNKNOWN",[c("U",105,2,1,3)]);
assert.match(out.text,/No instructor reference for UNKNOWN/);
out=render("HD",[c("WIDE",105,2,1,3,1),c("BAD",110,2,2.1,3)]);
assert.match(out.text,/NO ELIGIBLE STRIKE/);
assert.equal(out.buttons.length,0);
out=render("HD",[c("PUT",95,2,1,3,1.9,"PUT"),c("CALL",105,2,1,4)],"PUT");
assert.match(out.text,/95 PUT/);
out=render("HD",[c("EXPIRED",105,2,1,4),{...c("OTHER",106,2,1,4),expiration:"2026-10-23"}]);
assert.equal(out.buttons.length,1);
console.log("7 optimal-strike ranking tests passed");
