// strategyService.ts - Versão com Logs Controlados
import { newOrder } from "./orderService";
import { appendToJSONFile, logOperation } from "../utils/fileHandler";
import { connectToBinance } from "./webSocketService";
import axios from "axios";
import { SMA, RSI, OBV } from 'technicalindicators';
import dayjs from 'dayjs';
import readline from 'readline';

// Configurações de Log
const LOG_LINES_LIMIT = 50; // Mantém apenas as últimas 50 linhas no console
let logLines: string[] = [];

// Configurações (ajustáveis via environment variables)
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

// Variáveis de estado
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

// Sistema de logs controlados
function controlledLog(message: string, important = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  if (important || process.env.DEBUG_MODE === 'true') {
    // Adiciona nova linha e remove a mais antiga se passar do limite
    logLines.push(logMessage);
    if (logLines.length > LOG_LINES_LIMIT) {
      logLines.shift();
    }
    
    // Limpa console e reescreve todas as linhas
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    console.log(logLines.join('\n'));
  }
  
  // Sempre registra em arquivo
  logOperation(logMessage);
}

export async function fetchInitialCandles() {
  try {
    controlledLog(`📡 Buscando candles iniciais para ${symbol} (15m)`);
    const response = await axios.get("https://api.binance.com/api/v3/klines", {
      params: {
        symbol,
        interval: "15m",
        limit: 100,
      },
    });
    
    candleHistory = response.data.map((c: any) => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));
    
    priceHistory = candleHistory.map(c => c.close);
    volumeHistory = candleHistory.map(c => c.volume);
    
    controlledLog(`✅ ${candleHistory.length} candles carregados`, true);
    controlledLog(`📊 Primeiro candle: ${dayjs(candleHistory[0].timestamp).format('DD/MM HH:mm')} | O:${candleHistory[0].open} C:${candleHistory[0].close}`);
    controlledLog(`📊 Último candle: ${dayjs(candleHistory[candleHistory.length-1].timestamp).format('DD/MM HH:mm')} | O:${candleHistory[candleHistory.length-1].open} C:${candleHistory[candleHistory.length-1].close}`);
    
  } catch (error: any) {
    controlledLog(`❌ Erro ao buscar candles: ${error.message}`, true);
  }
}

export async function startTrading() {
  controlledLog("🔁 Iniciando estratégia MM + Volume + RSI", true);
  await fetchInitialCandles();
  
  controlledLog("🌐 Conectando ao WebSocket...");
  await connectToBinance();

  // Atualização periódica de preço
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
      if (err instanceof Error) {
        controlledLog(`❌ Erro ao atualizar preço: ${err.message}`);
      } else {
        controlledLog(`❌ Erro ao atualizar preço: ${JSON.stringify(err)}`);
      }
    }
  }, 5000);
}

function calculateIndicators() {
  const closes = candleHistory.map(c => c.close);
  const volumes = candleHistory.map(c => c.volume);
  
  const fastSMA = SMA.calculate({ period: CONFIG.fastSMA, values: closes });
  const slowSMA = SMA.calculate({ period: CONFIG.slowSMA, values: closes });
  const volumeSMA = SMA.calculate({ period: CONFIG.volumeSMA, values: volumes });
  const rsi = RSI.calculate({ period: CONFIG.rsiPeriod, values: closes });
  const obv = OBV.calculate({ close: closes, volume: volumes });
  
  return { fastSMA, slowSMA, volumeSMA, rsi, obv };
}

export function processKlineData(kline: any) {
  try {
    if (!kline.k.x) return; // Só processa candles fechados

    controlledLog(`\n📩 Novo candle fechado: ${dayjs(kline.k.t).format('DD/MM HH:mm')} | ${kline.k.o} → ${kline.k.c}`, true);

    // Atualiza histórico
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

    // Verifica dados suficientes
    const requiredLength = Math.max(CONFIG.fastSMA, CONFIG.slowSMA, CONFIG.volumeSMA, CONFIG.rsiPeriod) + 10;
    if (candleHistory.length < requiredLength) {
      controlledLog("⏳ Coletando mais dados...");
      return;
    }

    const { fastSMA, slowSMA, volumeSMA, rsi, obv } = calculateIndicators();
    const price = newCandle.close;
    const currentVolume = newCandle.volume;
    const avgVolume = volumeSMA[volumeSMA.length - 1] || 1;

    // Log resumido dos indicadores
    controlledLog(`📊 Indicadores | MM${CONFIG.fastSMA}: ${fastSMA.slice(-1)[0].toFixed(6)} | MM${CONFIG.slowSMA}: ${slowSMA.slice(-1)[0].toFixed(6)} | RSI: ${rsi.slice(-1)[0]?.toFixed(1) || 'N/A'}`);

    // Condições
    const isUptrend = fastSMA[fastSMA.length - 1] > slowSMA[slowSMA.length - 1] && 
                     (fastSMA[fastSMA.length - 1] - fastSMA[fastSMA.length - 2]) > CONFIG.minTrendStrength;
    const hasHighVolume = currentVolume > avgVolume * CONFIG.minVolumeFactor;
    const rsiValue = rsi[rsi.length - 1] || 50;
    const obvIncreasing = obv[obv.length - 1] > obv[obv.length - 2] && obv[obv.length - 2] > obv[obv.length - 3];
    const priceAboveFastSMA = price > fastSMA[fastSMA.length - 1];
    const candleBullish = newCandle.close > newCandle.open;

    // Condições de entrada
    const shouldBuy = !isBought && isUptrend && hasHighVolume && obvIncreasing && 
                     priceAboveFastSMA && (rsiValue > 50 && rsiValue < CONFIG.rsiOverbought) && candleBullish;

    if (shouldBuy) {
      controlledLog(`💚 COMPRA | Preço: ${price.toFixed(6)} | Volume: ${(currentVolume/avgVolume).toFixed(1)}x | RSI: ${rsiValue.toFixed(1)}`, true);
      executeTrade("BUY", price, {
        fastSMA: fastSMA[fastSMA.length - 1],
        slowSMA: slowSMA[slowSMA.length - 1],
        volumeRatio: (currentVolume/avgVolume).toFixed(1),
        rsi: rsiValue.toFixed(1)
      });
    }

    // Condições de saída
    if (isBought) {
      const exitReasons = [];
      if (price <= buyPrice * (1 - CONFIG.stopLossPercent)) exitReasons.push(`STOP LOSS (${(CONFIG.stopLossPercent * 100).toFixed(1)}%)`);
      if (price >= buyPrice * (1 + CONFIG.takeProfitPercent)) exitReasons.push(`TAKE PROFIT (${(CONFIG.takeProfitPercent * 100).toFixed(1)}%)`);
      if (price <= highestPriceSinceBuy * (1 - CONFIG.trailingStopPercent)) exitReasons.push(`TRAILING STOP (${(CONFIG.trailingStopPercent * 100).toFixed(1)}%)`);
      if (rsiValue >= CONFIG.rsiOverbought) exitReasons.push(`RSI OVERBOUGHT (${rsiValue.toFixed(1)})`);
      if (fastSMA[fastSMA.length - 1] < slowSMA[slowSMA.length - 1]) exitReasons.push(`TENDÊNCIA REVERSÃO`);

      if (exitReasons.length > 0) {
        controlledLog(`❤️ VENDA | Motivo: ${exitReasons.join(' + ')} | Lucro: ${((price/buyPrice - 1) * 100).toFixed(2)}%`, true);
        executeTrade("SELL", price, { exitReason: exitReasons.join(' | ') });
      }
    }
  } catch (error: any) {
    controlledLog(`❌ Erro ao processar candle: ${error.message}`, true);
  }
}

async function executeTrade(action: "BUY" | "SELL", price: number, indicators?: any) {
  try {
    controlledLog(`📤 Enviando ordem de ${action}...`);
    const result = await newOrder(tradeQuantity.toString(), action);
    
    if (!result || result.status !== "FILLED") {
      controlledLog(`❌ Falha na ordem: ${result?.status || 'Sem resposta'}`, true);
      return;
    }

    if (action === "BUY") {
      buyPrice = price;
      highestPriceSinceBuy = price;
      lowestPriceSinceBuy = price;
      entryTime = Date.now();
      isBought = true;
      
      appendToJSONFile("trades", {
        type: "BUY",
        date: new Date().toISOString(),
        symbol,
        price,
        quantity: tradeQuantity,
        indicators
      });
    } else {
      const profit = (price - buyPrice) * tradeQuantity;
      isBought = false;
      
      appendToJSONFile("trades", {
        type: "SELL",
        date: new Date().toISOString(),
        symbol,
        price,
        quantity: tradeQuantity,
        profit,
        roi: ((price / buyPrice - 1) * 100).toFixed(2) + '%',
        duration: ((Date.now() - entryTime) / (1000 * 60 * 60)).toFixed(2) + 'h',
        exitReason: indicators?.exitReason
      });
    }
  } catch (error: any) {
    controlledLog(`❌ Erro na ordem de ${action}: ${error.message}`, true);
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
    tradeQuantity
  };
}

export async function forceSellNow() {
  if (!isBought) {
    controlledLog("⚠️ Nenhuma posição aberta para vender", true);
    return { status: 'warning', message: 'Nenhuma posição aberta' };
  }

  try {
    const currentPrice = priceHistory.at(-1) || buyPrice;
    controlledLog(`🔴 VENDA MANUAL solicitada a ${currentPrice.toFixed(6)}`, true);
    await executeTrade("SELL", currentPrice, { exitReason: "VENDA MANUAL" });
    return { status: 'success' };
  } catch (error: any) {
    controlledLog(`❌ Falha na venda manual: ${error.message}`, true);
    return { status: 'error', message: error.message };
  }
}

// Inicializa com linha limpa
console.clear();
controlledLog("🟢 Sistema de trading iniciado", true);