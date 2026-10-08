"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateBollinger15m } = require("../lib/bollinger15m");
const candle = (close, volume=100) => ({open:close,high:close,low:close,close,volume});
test("insufficient candles never trigger", () => {
  assert.equal(evaluateBollinger15m([candle(100)]).status,"INSUFFICIENT_DATA");
});
test("flat market does not trigger", () => {
  assert.equal(evaluateBollinger15m(Array.from({length:21},()=>candle(100))).status,"NO_BREAKOUT");
});
test("upward breakout with volume and expansion confirms CALL", () => {
  const rows=Array.from({length:20},(_,i)=>candle(100+(i%2),100));
  assert.equal(evaluateBollinger15m([...rows,candle(110,300)]).status,"CONFIRMED");
  assert.equal(evaluateBollinger15m([...rows,candle(110,300)]).direction,"CALL");
});
test("downward breakout confirms PUT", () => {
  const rows=Array.from({length:20},(_,i)=>candle(100+(i%2),100));
  const result=evaluateBollinger15m([...rows,candle(90,300)]);
  assert.equal(result.status,"CONFIRMED");
  assert.equal(result.direction,"PUT");
});
test("low volume does not confirm breakout", () => {
  const rows=Array.from({length:20},(_,i)=>candle(100+(i%2),100));
  assert.equal(evaluateBollinger15m([...rows,candle(110,50)]).status,"UNCONFIRMED");
});
test("invalid OHLC is rejected", () => {
  const rows=Array.from({length:21},()=>candle(100));
  rows[20]={open:100,high:90,low:80,close:100,volume:100};
  assert.equal(evaluateBollinger15m(rows).status,"INVALID_DATA");
});
