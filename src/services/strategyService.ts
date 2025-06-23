// strategyService.ts - Estratégia consistente com backtest
import { newOrder } from "./orderService";
import { appendToJSONFile, logOperation } from "../utils/fileHandler";
import { connectToBinance } from "./webSocketService";
import axios from "axios";
import { SMA, RSI, OBV } from 'technicalindicators';
import dayjs from 'dayjs';

// Configurações carregadas do .env com valores padrão (iguais ao backtest)
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

// Histórico de candles completos (igual ao backtest)
let candleHistory: Array<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> = [];

function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  logOperation(line);
}

export async function fetchInitialCandles() {
  try {
    const response = await axios.get("https://api.binance.com/api/v3/klines", {
      params: { symbol, interval: "15m", limit: 200 }, // Aumentado para 200
    });

    candleHistory = response.data.map((c: any) => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    }));

    log(`✅ ${candleHistory.length} candles históricos carregados`);
    
    // Log dos indicadores iniciais
    if (candleHistory.length >= 50) {
      logCurrentIndicators();
    }
  } catch (error: any) {
    log(`❌ Erro ao buscar candles: ${error.message}`);
  }
}

export async function startTrading() {  
  log("🚀 Estratégia iniciada - Consistente com backtest");  
  await fetchInitialCandles();  
  await connectToBinance();  
  
  // Monitoramento de preço em tempo real (mantido para logs)
  setInterval(async () => {  
    try {  
      const { data } = await axios.get("https://api.binance.com/api/v3/ticker/price", {  
        params: { symbol }  
      });  
  
      const currentPrice = parseFloat(data.price);
      
      // Atualizar tracking de posição
      if (isBought) {  
        highestPriceSinceBuy = Math.max(highestPriceSinceBuy, currentPrice);  
        lowestPriceSinceBuy = Math.min(lowestPriceSinceBuy, currentPrice);  
      }  

      // Log periódico do status
      const status = getCurrentStatus();
      log(`💲 ${symbol}: ${currentPrice.toFixed(6)} | Posição: ${isBought ? 'COMPRADO' : 'AGUARDANDO'} | ${isBought ? `Lucro: ${status.profit.toFixed(2)}%` : ''}`);
      
    } catch (err: any) {  
      log(`❌ Erro ao atualizar preço: ${err.message || JSON.stringify(err)}`);  
    }  
  }, 30000); // Reduzido para 30s para menos spam
}

function calculateIndicators() {
  if (candleHistory.length < 50) return null;

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

export async function processKlineData(kline: any) {  
  try {  
    // Validação robusta
    if (!kline || !kline.k || typeof kline.k.x === 'undefined') {  
      log("⚠️ Kline inválido recebido, ignorando...");  
      return;  
    }  

    // Só processar candles fechados (igual ao backtest)
    if (!kline.k.x) {
      return; // Candle ainda não fechou
    }
  
    const newCandle = {  
      timestamp: kline.k.t,  
      open: parseFloat(kline.k.o),  
      high: parseFloat(kline.k.h),  
      low: parseFloat(kline.k.l),  
      close: parseFloat(kline.k.c),  
      volume: parseFloat(kline.k.v)  
    };  
  
    // Atualizar histórico
    candleHistory.push(newCandle);  
    candleHistory = candleHistory.slice(-200); // Manter 200 candles
  
    // Verificar se temos dados suficientes
    const requiredLength = Math.max(CONFIG.fastSMA, CONFIG.slowSMA, CONFIG.volumeSMA, CONFIG.rsiPeriod) + 10;  
    if (candleHistory.length < requiredLength) {
      log(`⏳ Aguardando mais dados... ${candleHistory.length}/${requiredLength}`);
      return;
    }
  
    const indicators = calculateIndicators();
    if (!indicators) return;

    const { fastSMA, slowSMA, volumeSMA, rsi, obv } = indicators;
    const price = newCandle.close;
    const currentVolume = newCandle.volume;
    const avgVolume = volumeSMA[volumeSMA.length - 1] || 1;
    const rsiValue = rsi[rsi.length - 1] || 50;

    // ===== LÓGICA DE ENTRADA (EXATAMENTE IGUAL AO BACKTEST) =====
    if (!isBought) {
      // Condições de tendência
      const currentFastSMA = fastSMA[fastSMA.length - 1];
      const previousFastSMA = fastSMA[fastSMA.length - 2];
      const currentSlowSMA = slowSMA[slowSMA.length - 1];
      
      const isUptrend = currentFastSMA > currentSlowSMA;
      const hasTrendStrength = (currentFastSMA - previousFastSMA) > CONFIG.minTrendStrength;
      
      // Condições de volume
      const hasHighVolume = currentVolume > avgVolume * CONFIG.minVolumeFactor;
      
      // Condições de OBV
      const obvLength = obv.length;
      const obvIncreasing = obvLength >= 3 && 
                           obv[obvLength - 1] > obv[obvLength - 2] && 
                           obv[obvLength - 2] > obv[obvLength - 3];
      
      // Condições de preço e RSI
      const priceAboveFastSMA = price > currentFastSMA;
      const rsiInRange = rsiValue > 50 && rsiValue < CONFIG.rsiOverbought;
      const candleBullish = newCandle.close > newCandle.open;

      // TODAS as condições devem ser verdadeiras (igual ao backtest)
      const entryConditions = [
        isUptrend,
        hasTrendStrength,
        hasHighVolume,
        obvIncreasing,
        priceAboveFastSMA,
        rsiInRange,
        candleBullish
      ];

      const shouldBuy = entryConditions.every(Boolean);

      if (shouldBuy) {
        const volumeRatio = (currentVolume / avgVolume).toFixed(1);
        log(`🔥 SINAL DE COMPRA DETECTADO!`);
        log(`📊 Condições: Trend✅ Volume:${volumeRatio}x✅ OBV✅ RSI:${rsiValue.toFixed(1)}✅ Candle✅`);
        log(`💰 Preço: ${price.toFixed(6)} | SMA9: ${currentFastSMA.toFixed(6)} | SMA21: ${currentSlowSMA.toFixed(6)}`);
        
        await executeTrade("BUY", price, { 
          fastSMA: currentFastSMA, 
          slowSMA: currentSlowSMA, 
          rsi: rsiValue,
          volumeRatio: parseFloat(volumeRatio),
          obvTrend: 'CRESCENTE'
        });
      } else {
        // Log detalhado das condições não atendidas (apenas quando próximo)
        if (isUptrend && hasHighVolume) {
          const failedConditions = [];
          if (!hasTrendStrength) failedConditions.push('TrendStrength');
          if (!obvIncreasing) failedConditions.push('OBV');
          if (!priceAboveFastSMA) failedConditions.push('Price<SMA');
          if (!rsiInRange) failedConditions.push(`RSI:${rsiValue.toFixed(1)}`);
          if (!candleBullish) failedConditions.push('CandleBear');
          
          if (failedConditions.length <= 2) { // Só log quando próximo
            log(`⚠️ Quase compra - Faltam: ${failedConditions.join(', ')}`);
          }
        }
      }
    }

    // ===== LÓGICA DE SAÍDA (IGUAL AO BACKTEST) =====
    if (isBought) {
      const exitConditions = {
        stopLoss: price <= buyPrice * (1 - CONFIG.stopLossPercent),
        takeProfit: price >= buyPrice * (1 + CONFIG.takeProfitPercent),
        trailingStop: price <= highestPriceSinceBuy * (1 - CONFIG.trailingStopPercent),
        rsiOverbought: rsiValue >= CONFIG.rsiOverbought,
        trendReversal: fastSMA[fastSMA.length - 1] < slowSMA[slowSMA.length - 1]
      };

      const exitReasons = [];
      if (exitConditions.stopLoss) exitReasons.push(`Stop Loss (${(CONFIG.stopLossPercent * 100).toFixed(1)}%)`);
      if (exitConditions.takeProfit) exitReasons.push(`Take Profit (${(CONFIG.takeProfitPercent * 100).toFixed(1)}%)`);
      if (exitConditions.trailingStop) exitReasons.push(`Trailing Stop (${(CONFIG.trailingStopPercent * 100).toFixed(1)}%)`);
      if (exitConditions.rsiOverbought) exitReasons.push(`RSI Sobrecomprado (${rsiValue.toFixed(1)})`);
      if (exitConditions.trendReversal) exitReasons.push('Reversão de Tendência');

      if (exitReasons.length > 0) {
        log(`🔴 SINAL DE VENDA: ${exitReasons.join(' + ')}`);
        log(`💰 Preço: ${price.toFixed(6)} | Entrada: ${buyPrice.toFixed(6)} | Máximo: ${highestPriceSinceBuy.toFixed(6)}`);
        
        await executeTrade("SELL", price, { 
          exitReason: exitReasons.join(' | '),
          rsi: rsiValue,
          fastSMA: fastSMA[fastSMA.length - 1],
          slowSMA: slowSMA[slowSMA.length - 1]
        });
      }
    }
  } catch (e: any) {  
    log(`❌ Erro ao processar candle: ${e.message}`);  
  }  
}

async function executeTrade(action: "BUY" | "SELL", price: number, indicators?: any) {
  try {
    log(`🔄 Executando ${action} a ${price.toFixed(6)}...`);
    
    const result = await newOrder(tradeQuantity.toString(), action);
    if (!result || result.status !== "FILLED") {
      log(`❌ Ordem não preenchida: ${result?.status || 'Sem resposta'}`);
      return;
    }

    const executedPrice = parseFloat(result.fills?.[0]?.price || price.toString());
    const executedQty = parseFloat(result.executedQty || tradeQuantity.toString());

    if (action === "BUY") {
      buyPrice = executedPrice;
      highestPriceSinceBuy = executedPrice;
      lowestPriceSinceBuy = executedPrice;
      entryTime = Date.now();
      isBought = true;

      log(`✅ COMPRA EXECUTADA!`);
      log(`📊 Preço: ${executedPrice.toFixed(6)} | Quantidade: ${executedQty}`);
      log(`📈 RSI: ${indicators?.rsi?.toFixed(1)} | Volume: ${indicators?.volumeRatio}x | OBV: ${indicators?.obvTrend}`);

      appendToJSONFile("purchases", {
        date: new Date().toISOString(), 
        symbol, 
        price: executedPrice, 
        quantity: executedQty, 
        indicators,
        orderId: result.orderId
      });
    } else {
      const profit = (executedPrice - buyPrice) * executedQty;
      const percentProfit = ((executedPrice / buyPrice - 1) * 100);
      const holdingTimeMinutes = ((Date.now() - entryTime) / (1000 * 60));
      
      isBought = false;

      log(`✅ VENDA EXECUTADA!`);
      log(`📊 Preço: ${executedPrice.toFixed(6)} | Quantidade: ${executedQty}`);
      log(`💰 Lucro: ${profit.toFixed(2)} USDT (${percentProfit.toFixed(2)}%)`);
      log(`⏱️ Duração: ${holdingTimeMinutes.toFixed(1)} minutos`);
      log(`🎯 Motivo: ${indicators?.exitReason}`);

      appendToJSONFile("sales", {
        date: new Date().toISOString(), 
        symbol, 
        price: executedPrice, 
        quantity: executedQty, 
        profit,
        percentProfit: percentProfit.toFixed(2) + '%',
        holdingTime: holdingTimeMinutes.toFixed(1) + 'min',
        exitReason: indicators?.exitReason,
        orderId: result.orderId
      });
      
      // Registrar o trade completo
      appendToJSONFile("trades", {
        entryDate: new Date(entryTime).toISOString(),
        exitDate: new Date().toISOString(),
        symbol,
        entryPrice: buyPrice,
        exitPrice: executedPrice,
        quantity: executedQty,
        profit,
        percentProfit: percentProfit.toFixed(2),
        holdingTime: holdingTimeMinutes.toFixed(1),
        exitReason: indicators?.exitReason,
        buyOrderId: result.orderId // Seria melhor salvar o ID da compra também
      });

      // Reset tracking
      highestPriceSinceBuy = 0;
      lowestPriceSinceBuy = 0;
    }
  } catch (e: any) {
    log(`❌ Erro na execução da ordem ${action}: ${e.message}`);
  }
}

export function getCurrentStatus() {
  const lastCandle = candleHistory[candleHistory.length - 1];
  const lastPrice = lastCandle?.close ?? 0;
  
  return { 
    isBought, 
    buyPrice, 
    currentPrice: lastPrice, 
    profit: isBought ? ((lastPrice / buyPrice - 1) * 100) : 0, 
    symbol, 
    tradeQuantity,
    highestPriceSinceBuy,
    lowestPriceSinceBuy,
    holdingTime: isBought ? ((Date.now() - entryTime) / (1000 * 60)).toFixed(1) + 'min' : '0min',
    candlesLoaded: candleHistory.length
  };
}

export async function forceSellNow() {
  if (!isBought) {
    log("⚠️ Nenhuma posição para vender");
    return { status: 'warning', message: 'Nenhuma posição aberta' };
  }
  try {
    const lastCandle = candleHistory[candleHistory.length - 1];
    const currentPrice = lastCandle?.close || buyPrice;
    log(`🔴 VENDA MANUAL solicitada a ${currentPrice.toFixed(6)}`);
    await executeTrade("SELL", currentPrice, { exitReason: "VENDA MANUAL" });
    return { status: 'success' };
  } catch (error: any) {
    log(`❌ Erro na venda manual: ${error.message}`);
    return { status: 'error', message: error.message };
  }
}

export function logCurrentIndicators() {
  const requiredLength = Math.max(CONFIG.fastSMA, CONFIG.slowSMA, CONFIG.volumeSMA, CONFIG.rsiPeriod) + 10;
  
  if (candleHistory.length < requiredLength) {
    const msg = `⏳ Aguardando candles suficientes... ${candleHistory.length}/${requiredLength}`;
    log(msg);
    return { status: "waiting", message: msg, candlesLoaded: candleHistory.length };
  }

  const indicators = calculateIndicators();
  if (!indicators) {
    return { status: "error", message: "Erro ao calcular indicadores" };
  }

  const { fastSMA, slowSMA, volumeSMA, rsi, obv } = indicators;
  const lastCandle = candleHistory[candleHistory.length - 1];
  
  const current = {
    timestamp: new Date(lastCandle.timestamp).toISOString(),
    preço: lastCandle.close,
    volume: lastCandle.volume,
    fastSMA: fastSMA[fastSMA.length - 1],
    slowSMA: slowSMA[slowSMA.length - 1],
    volumeSMA: volumeSMA[volumeSMA.length - 1],
    volumeRatio: (lastCandle.volume / volumeSMA[volumeSMA.length - 1]).toFixed(2),
    rsi: rsi[rsi.length - 1],
    obv: {
      atual: obv[obv.length - 1],
      anterior: obv[obv.length - 2],
      tendencia: obv[obv.length - 1] > obv[obv.length - 2] ? 'SUBINDO' : 'DESCENDO'
    },
    tendencia: fastSMA[fastSMA.length - 1] > slowSMA[slowSMA.length - 1] ? 'ALTA' : 'BAIXA',
    candleTipo: lastCandle.close > lastCandle.open ? 'ALTA' : 'BAIXA'
  };

  log("📊 INDICADORES ATUAIS:");
  log(JSON.stringify(current, null, 2));

  return { status: "success", indicators: current };
}

console.clear();
log("🟢 Bot iniciado - Estratégia 100% consistente com backtest");
log(`⚙️ Configurações: SMA(${CONFIG.fastSMA}/${CONFIG.slowSMA}) | RSI(${CONFIG.rsiPeriod}) | Volume(${CONFIG.minVolumeFactor}x)`);
log(`🎯 Risk Management: SL(${(CONFIG.stopLossPercent*100).toFixed(1)}%) | TP(${(CONFIG.takeProfitPercent*100).toFixed(1)}%) | TS(${(CONFIG.trailingStopPercent*100).toFixed(1)}%)`);