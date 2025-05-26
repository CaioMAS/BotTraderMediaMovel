// strategyService.ts - Usando technicalindicators
import { newOrder } from "./orderService";
import { appendToJSONFile, logOperation } from "../utils/fileHandler";
import { connectToBinance } from "./webSocketService";
import axios from "axios";
import { SMA, RSI, OBV } from 'technicalindicators';
import dayjs from 'dayjs';

// Configurações carregadas do .env com valores padrão
const CONFIG = {
  fastSMA: parseInt(process.env.FAST_SMA || "9"),
  slowSMA: parseInt(process.env.SLOW_SMA || "21"),
  volumeSMA: parseInt(process.env.VOLUME_SMA || "20"),
  rsiPeriod: parseInt(process.env.RSI_PERIOD || "14"),
  rsiOverbought: parseInt(process.env.RSI_OVERBOUGHT || "70"),
  rsiOversold: parseInt(process.env.RSI_OVERSOLD || "30"),
  minVolumeFactor: parseFloat(process.env.MIN_VOLUME_FACTOR || "1.5"),
  stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || "0.02"),
  takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || "0.04"),
  trailingStopPercent: parseFloat(process.env.TRAILING_STOP_PERCENT || "0.015"),
  minTrendStrength: parseFloat(process.env.MIN_TREND_STRENGTH || "0.0003")
};

let isBought = false;
let buyPrice = 0;
let highestPriceSinceBuy = 0;
let lowestPriceSinceBuy = 0;
let entryTime = 0;
const tradeQuantity = parseFloat(process.env.TRADE_QUANTITY || "50");
const symbol = process.env.SYMBOL || 'WIFUSDT';

let priceHistory: number[] = [];
let volumeHistory: number[] = [];
let candleHistory: any[] = [];

function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  logOperation(line);
}

export async function fetchInitialCandles() {
  try {
    const response = await axios.get("https://api.binance.com/api/v3/klines", {
      params: { symbol, interval: "15m", limit: 100 },
    });

    candleHistory = response.data.map((c: any) => ({
      timestamp: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]),
      low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5])
    }));

    priceHistory = candleHistory.map(c => c.close);
    volumeHistory = candleHistory.map(c => c.volume);
    log(`✅ ${candleHistory.length} candles carregados`);
  } catch (error: any) {
    log(`❌ Erro ao buscar candles: ${error.message}`);
  }
}

export async function startTrading() {
  log("🚀 Estratégia iniciada");
  await fetchInitialCandles();
  await connectToBinance();

  setInterval(async () => {
    try {
      const { data } = await axios.get("https://api.binance.com/api/v3/ticker/price", {
        params: { symbol }
      });

      if (isBought) {
        highestPriceSinceBuy = Math.max(highestPriceSinceBuy, parseFloat(data.price));
        lowestPriceSinceBuy = Math.min(lowestPriceSinceBuy, parseFloat(data.price));
      }
    } catch (err: any) {
      log(`❌ Erro ao atualizar preço: ${err.message || JSON.stringify(err)}`);
    }
  }, 5000);
}

function calculateIndicators() {
  const closes = candleHistory.map(c => c.close);
  const volumes = candleHistory.map(c => c.volume);

  return {
    fastSMA: SMA.calculate({ period: CONFIG.fastSMA, values: closes }),
    slowSMA: SMA.calculate({ period: CONFIG.slowSMA, values: closes }),
    volumeSMA: SMA.calculate({ period: CONFIG.volumeSMA, values: volumes }),
    rsi: RSI.calculate({ period: CONFIG.rsiPeriod, values: closes }),
    obv: OBV.calculate({ close: closes, volume: volumes })
  };
}

export function processKlineData(kline: any) {  
  try {  
    // Validação robusta para evitar erro de leitura de propriedades indefinidas  
    if (!kline || !kline.k || typeof kline.k.x === 'undefined') {  
      log("⚠️ Kline inválido recebido, ignorando...");  
      return;  
    }  
  
    const newCandle = {  
      timestamp: kline.k.t,  
      open: parseFloat(kline.k.o),  
      high: parseFloat(kline.k.h),  
      low: parseFloat(kline.k.l),  
      close: parseFloat(kline.k.c),  
      volume: parseFloat(kline.k.v)  
    };  
  
    candleHistory.push(newCandle);  
    candleHistory = candleHistory.slice(-100);  
    priceHistory = candleHistory.map(c => c.close);  
    volumeHistory = candleHistory.map(c => c.volume);  
  
    const requiredLength = Math.max(CONFIG.fastSMA, CONFIG.slowSMA, CONFIG.volumeSMA, CONFIG.rsiPeriod) + 10;  
    if (candleHistory.length < requiredLength) return;  
  
    const { fastSMA, slowSMA, volumeSMA, rsi, obv } = calculateIndicators();  
    const price = newCandle.close;  
    const currentVolume = newCandle.volume;  
    const avgVolume = volumeSMA[volumeSMA.length - 1] || 1;  
  
    const isUptrend = fastSMA.at(-1)! > slowSMA.at(-1)! && (fastSMA.at(-1)! - fastSMA.at(-2)!) > CONFIG.minTrendStrength;  
    const hasHighVolume = currentVolume > avgVolume * CONFIG.minVolumeFactor;  
    const rsiValue = rsi[rsi.length - 1] || 50;  
    const obvIncreasing = obv[obv.length - 1] > obv[obv.length - 2] && obv[obv.length - 2] > obv[obv.length - 3];  
    const priceAboveFastSMA = price > fastSMA[fastSMA.length - 1];  
    const candleBullish = newCandle.close > newCandle.open;  
  
    const shouldBuy = !isBought && isUptrend && hasHighVolume && obvIncreasing && priceAboveFastSMA && (rsiValue > 50 && rsiValue < CONFIG.rsiOverbought) && candleBullish;  
    if (shouldBuy) {  
      log(`💚 COMPRA em ${price.toFixed(6)}`);  
      executeTrade("BUY", price, { fastSMA: fastSMA.at(-1), slowSMA: slowSMA.at(-1), rsi: rsiValue });  
    }  
  
    if (isBought) {  
      const exitReasons = [];  
      if (price <= buyPrice * (1 - CONFIG.stopLossPercent)) exitReasons.push("STOP LOSS");  
      if (price >= buyPrice * (1 + CONFIG.takeProfitPercent)) exitReasons.push("TAKE PROFIT");  
      if (price <= highestPriceSinceBuy * (1 - CONFIG.trailingStopPercent)) exitReasons.push("TRAILING STOP");  
      if (rsiValue >= CONFIG.rsiOverbought) exitReasons.push("RSI OVERBOUGHT");  
      if (fastSMA.at(-1)! < slowSMA.at(-1)!) exitReasons.push("TENDÊNCIA REVERSÃO");  
  
      if (exitReasons.length > 0) {  
        log(`❤️ VENDA em ${price.toFixed(6)} | Motivo: ${exitReasons.join(' + ')}`);  
        executeTrade("SELL", price, { exitReason: exitReasons.join(' | ') });  
      }  
    }  
  } catch (e: any) {  
    log(`❌ Erro ao processar candle: ${e.message}`);  
  }  
}

async function executeTrade(action: "BUY" | "SELL", price: number, indicators?: any) {
  try {
    const result = await newOrder(tradeQuantity.toString(), action);
    if (!result || result.status !== "FILLED") {
      log(`❌ Ordem não preenchida: ${result?.status || 'Sem resposta'}`);
      return;
    }

    if (action === "BUY") {
      buyPrice = price;
      highestPriceSinceBuy = price;
      lowestPriceSinceBuy = price;
      entryTime = Date.now();
      isBought = true;

      appendToJSONFile("purchases", {
        date: new Date().toISOString(), 
        symbol, 
        price, 
        quantity: tradeQuantity, 
        indicators
      });
    } else {
      const profit = (price - buyPrice) * tradeQuantity;
      const percentProfit = ((price / buyPrice - 1) * 100).toFixed(2);
      isBought = false;

      appendToJSONFile("sales", {
        date: new Date().toISOString(), 
        symbol, 
        price, 
        quantity: tradeQuantity, 
        profit,
        percentProfit: percentProfit + '%',
        holdingTime: ((Date.now() - entryTime) / (1000 * 60)).toFixed(1) + 'min',
        exitReason: indicators?.exitReason
      });
      
      // Registrar o trade completo
      appendToJSONFile("trades", {
        entryDate: new Date(entryTime).toISOString(),
        exitDate: new Date().toISOString(),
        symbol,
        entryPrice: buyPrice,
        exitPrice: price,
        quantity: tradeQuantity,
        profit,
        percentProfit,
        holdingTime: ((Date.now() - entryTime) / (1000 * 60)).toFixed(1),
        exitReason: indicators?.exitReason
      });
    }
  } catch (e: any) {
    log(`❌ Erro na execução da ordem ${action}: ${e.message}`);
  }
}

export function getCurrentStatus() {
  const lastPrice = priceHistory?.at(-1) ?? 0;
  return { 
    isBought, 
    buyPrice, 
    currentPrice: lastPrice, 
    profit: isBought ? ((lastPrice / buyPrice - 1) * 100) : 0, 
    symbol, 
    tradeQuantity,
    highestPriceSinceBuy,
    lowestPriceSinceBuy,
    holdingTime: isBought ? ((Date.now() - entryTime) / (1000 * 60)).toFixed(1) + 'min' : '0min'
  };
}

export async function forceSellNow() {
  if (!isBought) {
    log("⚠️ Nenhuma posição para vender");
    return { status: 'warning', message: 'Nenhuma posição aberta' };
  }
  try {
    const currentPrice = priceHistory.at(-1) || buyPrice;
    log(`🔴 VENDA MANUAL solicitada a ${currentPrice.toFixed(6)}`);
    await executeTrade("SELL", currentPrice, { exitReason: "VENDA MANUAL" });
    return { status: 'success' };
  } catch (error: any) {
    log(`❌ Erro na venda manual: ${error.message}`);
    return { status: 'error', message: error.message };
  }
}

export function logCurrentIndicators() {
  if (candleHistory.length < 100) {
    const msg = "⏳ Aguardando candles suficientes para calcular indicadores...";
    log(msg);
    return { status: "waiting", message: msg };
  }

  const { fastSMA, slowSMA, volumeSMA, rsi, obv } = calculateIndicators();
  const current = {
    preçoAtual: priceHistory.at(-1),
    fastSMA: fastSMA[fastSMA.length - 1],
    slowSMA: slowSMA[slowSMA.length - 1],
    volumeAtual: volumeHistory.at(-1),
    volumeSMA: volumeSMA[volumeSMA.length - 1],
    rsi: rsi[rsi.length - 1],
    obvAtual: obv[obv.length - 1],
    obvAnterior: obv[obv.length - 2],
    obvAtrasado: obv[obv.length - 3]
  };

  log("📊 Indicadores atuais:");
  log(JSON.stringify(current, null, 2));

  return { status: "success", indicators: current };
}

console.clear();
log("🟢 Bot iniciado com estratégia consistente com o backtest");