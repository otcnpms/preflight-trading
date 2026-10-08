"use strict";

/**
 * Experimental 15-minute Bollinger breakout evaluator.
 * Accepts COMPLETED OHLCV candles only, oldest to newest.
 * Returns observations, not orders or investment advice.
 */
function evaluateBollinger15m(candles, options = {}) {
  const period = options.period ?? 20;
  const multiplier = options.multiplier ?? 2;
  const minVolumeRatio = options.minVolumeRatio ?? 1.2;
  const minWidthExpansion = options.minWidthExpansion ?? 1.02;
  if (!Number.isInteger(period) || period < 5 || multiplier <= 0 ||
      minVolumeRatio <= 0 || minWidthExpansion <= 0) {
    throw new Error("Invalid Bollinger configuration");
  }
  if (!Array.isArray(candles) || candles.length < period + 1) {
    return { status: "INSUFFICIENT_DATA", direction: null };
  }
  const recent = candles.slice(-(period + 1));
  if (recent.some(c => !c || ![c.open,c.high,c.low,c.close,c.volume].every(
    x => typeof x === "number" && Number.isFinite(x)) ||
    c.volume < 0 || c.high < c.low || c.high < Math.max(c.open,c.close) ||
    c.low > Math.min(c.open,c.close))) {
    return { status: "INVALID_DATA", direction: null };
  }
  function bands(rows) {
    const closes = rows.map(c => c.close);
    const mean = closes.reduce((a,b) => a+b,0) / closes.length;
    const variance = closes.reduce((s,v) => s+(v-mean)**2,0) / closes.length;
    const deviation = Math.sqrt(variance);
    return { middle: mean, upper: mean+multiplier*deviation,
      lower: mean-multiplier*deviation,
      width: mean > 0 ? (2*multiplier*deviation)/mean : 0 };
  }
  const prior = recent.slice(0, period);
  const current = recent[period];
  const before = bands(prior);
  const after = bands(recent.slice(1));
  const averageVolume = prior.reduce((s,c)=>s+c.volume,0)/period;
  const volumeRatio = averageVolume > 0 ? current.volume/averageVolume : 0;
  const widthRatio = before.width > 0 ? after.width/before.width : 0;
  const direction = current.close > before.upper ? "CALL" :
    current.close < before.lower ? "PUT" : null;
  const confirmed = Boolean(direction && volumeRatio >= minVolumeRatio &&
    widthRatio >= minWidthExpansion);
  return {
    status: confirmed ? "CONFIRMED" : direction ? "UNCONFIRMED" : "NO_BREAKOUT",
    direction, volumeRatio, widthRatio,
    priorBands: before, currentBands: after,
    conditions: { breakout: Boolean(direction),
      volume: volumeRatio >= minVolumeRatio,
      expansion: widthRatio >= minWidthExpansion },
    note: "Directional observation only. Does not evaluate option IV, spread, liquidity or profitability."
  };
}
module.exports = { evaluateBollinger15m };
