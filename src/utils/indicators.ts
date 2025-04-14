export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0
  const sum = prices.slice(-period).reduce((acc, price) => acc + price, 0)
  return sum / period
}

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return 0
  const k = 2 / (period + 1)
  let ema = prices.slice(0, period).reduce((acc, price) => acc + price, 0) / period
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k)
  }
  return ema
}

export function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50

  let gains = 0,
    losses = 0
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }

  let averageGain = gains / period
  let averageLoss = losses / period

  if (averageLoss === 0) return 100
  if (averageGain === 0) return 0

  let rs = averageGain / averageLoss
  let rsi = 100 - 100 / (1 + rs)

  return rsi
}

export function calculateATR(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0

  let atrValues: number[] = []

  for (let i = 1; i < prices.length; i++) {
    let tr = Math.max(prices[i] - prices[i - 1], Math.abs(prices[i] - prices[0]), Math.abs(prices[i - 1] - prices[0]))
    atrValues.push(tr)
  }

  const atr = atrValues.slice(-period).reduce((acc, val) => acc + val, 0) / period
  return atr
}

export function calculateADX(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0

  let dmPlus: number[] = []
  let dmMinus: number[] = []
  let trValues: number[] = []

  for (let i = 1; i < prices.length; i++) {
    let highDiff = prices[i] - prices[i - 1]
    let lowDiff = prices[i - 1] - prices[i]

    dmPlus.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0)
    dmMinus.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0)

    let tr = Math.max(prices[i] - prices[i - 1], Math.abs(prices[i] - prices[0]), Math.abs(prices[i - 1] - prices[0]))
    trValues.push(tr)
  }

  let smoothedTR = trValues.slice(-period).reduce((acc, val) => acc + val, 0) / period
  let smoothedDMPlus = dmPlus.slice(-period).reduce((acc, val) => acc + val, 0) / period
  let smoothedDMMinus = dmMinus.slice(-period).reduce((acc, val) => acc + val, 0) / period

  let diPlus = (smoothedDMPlus / smoothedTR) * 100
  let diMinus = (smoothedDMMinus / smoothedTR) * 100

  let dx = (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100

  return dx
}

export function calculateMACD(prices: number[], shortPeriod: number, longPeriod: number, signalPeriod: number) {
  if (prices.length < longPeriod) return { macd: 0, signal: 0, histogram: 0 }

  const shortEMA = calculateEMA(prices, shortPeriod)
  const longEMA = calculateEMA(prices, longPeriod)
  const macd = shortEMA - longEMA

  const macdHistory = prices.slice(-signalPeriod).map((_, index) => {
    if (index < signalPeriod - 1) return 0
    return calculateEMA(prices.slice(index - signalPeriod + 1, index + 1), signalPeriod)
  })
  const signal = macdHistory[macdHistory.length - 1]
  const histogram = macd - signal

  return { macd, signal, histogram }
}
