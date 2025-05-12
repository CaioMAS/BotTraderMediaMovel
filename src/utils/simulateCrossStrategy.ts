import axios from "axios";
import { SMA, RSI, OBV } from "technicalindicators";
import dayjs from "dayjs";

// Tipos
interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  type: "BUY" | "SELL";
  price: number;
  time: string;
  reason?: string;
  profit?: number;
  percent?: string;
  holdingPeriod?: number;
}

// Configurações ajustáveis
const CONFIG = {
  pair: "WIFUSDT",
  interval: "15m",
  daysToLoad: 1, // Analisa os últimos 30 dias
  fastSMA: 9,
  slowSMA: 21,
  volumeSMA: 20,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  minVolumeFactor: 1.5,
  stopLossPercent: 0.02,
  takeProfitPercent: 0.04,
  maxTradesPerDay: 20, // Limite de trades diários
  quantity: 50, // 0.001 BTC como você mencionou
  trailingStopPercent: 0.015,
  minTrendStrength: 0.0003
};

async function fetchCandles(): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = dayjs(endTime).subtract(CONFIG.daysToLoad, "day").valueOf();
  const candles: Candle[] = [];
  let currentStartTime = startTime;

  while (true) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${CONFIG.pair}&interval=${CONFIG.interval}&startTime=${currentStartTime}&limit=1000`;
    const { data } = await axios.get(url);
    if (!data.length) break;

    data.forEach((k: any[]) => {
      candles.push({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      });
    });

    const lastTimestamp = data[data.length - 1][0];
    if (lastTimestamp >= endTime) break;
    currentStartTime = lastTimestamp + 1;
  }

  return candles;
}

function calculateIndicators(candles: Candle[]) {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  const fastSMA = SMA.calculate({ period: CONFIG.fastSMA, values: closes });
  const slowSMA = SMA.calculate({ period: CONFIG.slowSMA, values: closes });
  const volumeSMA = SMA.calculate({ period: CONFIG.volumeSMA, values: volumes });
  const rsi = RSI.calculate({ period: CONFIG.rsiPeriod, values: closes });
  const obv = OBV.calculate({ close: closes, volume: volumes });
  
  return { fastSMA, slowSMA, volumeSMA, rsi, obv };
}

async function simulate() {
  const candles = await fetchCandles();
  const { fastSMA, slowSMA, volumeSMA, rsi, obv } = calculateIndicators(candles);
  
  const trades: Trade[] = [];
  let inPosition = false;
  let entryPrice = 0;
  let entryTime = 0;
  let dailyTrades = 0;
  let lastTradeDate = "";
  let profit = 0;
  let highestPriceSinceEntry = 0;
  let lowestPriceSinceEntry = 0;

  const startingIndex = Math.max(CONFIG.fastSMA, CONFIG.slowSMA, CONFIG.volumeSMA, CONFIG.rsiPeriod, 20);

  for (let i = startingIndex; i < candles.length; i++) {
    const currentDate = dayjs(candles[i].timestamp).format("YYYY-MM-DD");
    if (currentDate !== lastTradeDate) {
      dailyTrades = 0;
      lastTradeDate = currentDate;
    }

    const price = candles[i].close;
    const timestamp = candles[i].timestamp;
    const currentVolume = candles[i].volume;
    const avgVolume = volumeSMA[i - CONFIG.volumeSMA] || 0;

    if (inPosition) {
      highestPriceSinceEntry = Math.max(highestPriceSinceEntry, price);
      lowestPriceSinceEntry = Math.min(lowestPriceSinceEntry, price);
    }

    const isUptrend = fastSMA[i - CONFIG.fastSMA] > slowSMA[i - CONFIG.slowSMA] && 
                      (fastSMA[i - CONFIG.fastSMA] - fastSMA[i - CONFIG.fastSMA - 1]) > CONFIG.minTrendStrength;
    const isDowntrend = fastSMA[i - CONFIG.fastSMA] < slowSMA[i - CONFIG.slowSMA] && 
                        (slowSMA[i - CONFIG.slowSMA] - slowSMA[i - CONFIG.slowSMA - 1]) > CONFIG.minTrendStrength;
    
    const hasHighVolume = currentVolume > avgVolume * CONFIG.minVolumeFactor;
    const rsiValue = rsi[i - CONFIG.rsiPeriod] || 50;
    const obvIncreasing = obv[i] > obv[i - 1] && obv[i - 1] > obv[i - 2];
    const priceAboveFastSMA = price > fastSMA[i - CONFIG.fastSMA];
    const priceBelowFastSMA = price < fastSMA[i - CONFIG.fastSMA];

    const entryConditions = {
      long: [
        !inPosition,
        dailyTrades < CONFIG.maxTradesPerDay,
        isUptrend,
        hasHighVolume,
        obvIncreasing,
        priceAboveFastSMA,
        rsiValue > 50 && rsiValue < CONFIG.rsiOverbought,
        candles[i].close > candles[i].open
      ].every(Boolean),
      
      short: [
        false // Desativado por padrão
      ].every(Boolean)
    };

    const exitConditions = {
      long: {
        stopLoss: price <= entryPrice * (1 - CONFIG.stopLossPercent),
        takeProfit: price >= entryPrice * (1 + CONFIG.takeProfitPercent),
        trailingStop: price <= highestPriceSinceEntry * (1 - CONFIG.trailingStopPercent),
        rsiOverbought: rsiValue >= CONFIG.rsiOverbought,
        trendReversal: fastSMA[i - CONFIG.fastSMA] < slowSMA[i - CONFIG.slowSMA]
      },
      short: {
        stopLoss: false,
        takeProfit: false,
        trailingStop: false,
        rsiOversold: false,
        trendReversal: false
      }
    };

    if (entryConditions.long) {
      inPosition = true;
      entryPrice = price;
      entryTime = timestamp;
      highestPriceSinceEntry = price;
      dailyTrades++;

      trades.push({
        type: "BUY",
        price,
        time: new Date(timestamp).toLocaleString(),
        reason: `Cruzamento MM${CONFIG.fastSMA}>MM${CONFIG.slowSMA}, Volume ${(currentVolume/avgVolume).toFixed(1)}x, RSI ${rsiValue.toFixed(1)}`
      });
      continue;
    }

    if (inPosition) {
      let exitReason = "";
      let shouldExit = false;
      
      if (trades[trades.length - 1].type === "BUY") {
        if (exitConditions.long.stopLoss) {
          exitReason = `Stop Loss (${(CONFIG.stopLossPercent * 100).toFixed(1)}%)`;
          shouldExit = true;
        } else if (exitConditions.long.takeProfit) {
          exitReason = `Take Profit (${(CONFIG.takeProfitPercent * 100).toFixed(1)}%)`;
          shouldExit = true;
        } else if (exitConditions.long.trailingStop) {
          exitReason = `Trailing Stop (${(CONFIG.trailingStopPercent * 100).toFixed(1)}%)`;
          shouldExit = true;
        } else if (exitConditions.long.rsiOverbought) {
          exitReason = `RSI Sobrevendido (${rsiValue.toFixed(1)})`;
          shouldExit = true;
        } else if (exitConditions.long.trendReversal) {
          exitReason = "Reversão de Tendência";
          shouldExit = true;
        }
      }

      if (shouldExit) {
        const gain = (price - entryPrice) * CONFIG.quantity;
        const percentGain = ((price / entryPrice - 1) * 100).toFixed(2);

        trades.push({
          type: "SELL",
          price,
          time: new Date(timestamp).toLocaleString(),
          profit: gain,
          percent: percentGain,
          holdingPeriod: (timestamp - entryTime) / (1000 * 60 * 60),
          reason: exitReason
        });

        profit += gain;
        inPosition = false;
        highestPriceSinceEntry = 0;
        lowestPriceSinceEntry = Infinity;
      }
    }
  }

  // Resultados - PARTE CORRIGIDA
  console.log("📊 Simulação Finalizada - Estratégia MM com Volume e RSI");
  console.log(`Par: ${CONFIG.pair} | Timeframe: ${CONFIG.interval}`);
  console.log(`Período: ${dayjs(candles[0].timestamp).format("DD/MM/YYYY")} - ${dayjs(candles[candles.length - 1].timestamp).format("DD/MM/YYYY")}`);
  console.log(`Total de operações: ${trades.filter(t => t.type === "BUY").length}`);

  const winningTrades = trades.filter(t => t.type === "SELL" && (t.profit || 0) > 0);
  const losingTrades = trades.filter(t => t.type === "SELL" && (t.profit || 0) <= 0);

  console.log(`Operações lucrativas: ${winningTrades.length} (${(winningTrades.length / (trades.length / 2) * 100 || 0).toFixed(1)}%)`);
  console.log(`Operações perdedoras: ${losingTrades.length}`);
  console.log(`Lucro médio: ${(winningTrades.reduce((sum, t) => sum + (t.profit || 0), 0) / (winningTrades.length || 1)).toFixed(2)} USDT`);
  console.log(`Perda média: ${(losingTrades.reduce((sum, t) => sum + (t.profit || 0), 0) / (losingTrades.length || 1)).toFixed(2)} USDT`);

  console.log("\n📈 Detalhes das Operações:");
  for (let i = 0; i < trades.length; i += 2) {
    const entry = trades[i];
    const exit = trades[i + 1];
    
    if (entry && exit) {
      console.log(`📈 ${entry.type} em ${entry.time} | Preço: ${entry.price.toFixed(2)} | Motivo: ${entry.reason}`);
      console.log(`💼 ${exit.type} em ${exit.time} | Preço: ${exit.price.toFixed(2)} | Lucro: ${(exit.profit || 0).toFixed(2)} USDT (${exit.percent}%) | Motivo: ${exit.reason} | Duração: ${(exit.holdingPeriod || 0).toFixed(1)}h`);
    }
  }

  // CÁLCULO CORRIGIDO DO RETORNO SOBRE CAPITAL
  const capitalNecessario = CONFIG.quantity * trades[0]?.price || 1;
  const retornoPercentual = (profit / capitalNecessario * 100);
  
  console.log(`\n📈 Lucro Total: ${profit.toFixed(2)} USDT`);
  console.log(`💰 Capital necessário por operação: ~${capitalNecessario.toFixed(2)} USDT`);
  console.log(`🚀 Retorno sobre capital: ${retornoPercentual.toFixed(2)}%`);
}

simulate();