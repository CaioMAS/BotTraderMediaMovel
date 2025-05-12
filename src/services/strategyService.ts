// strategyService.ts (corrigido para agir igual ao simulador)

import { newOrder } from "./orderService";
import { appendToJSONFile, logOperation } from "../utils/fileHandler";
import { connectToBinance } from "./webSocketService";
import axios from "axios";
import { SMA, RSI, OBV } from 'technicalindicators';

const STRATEGY_CONFIG = {
  fastSMA: 9,
  slowSMA: 21,
  volumeSMA: 20,
  rsiPeriod: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  minVolumeFactor: 1.5,
  stopLossPercent: 0.02,
  takeProfitPercent: 0.04,
  trailingStopPercent: 0.015,
  minTrendStrength: 0.0003,
  tradeCooldownMs: 30000
};

let isBought = false;
let buyPrice = 0;
let highestPriceSinceBuy = 0;
const tradeQuantity = parseFloat(process.env.TRADE_QUANTITY || "0.01");
const symbol = process.env.SYMBOL || 'BTCUSDT';

let priceHistory: number[] = [];
let volumeHistory: number[] = [];
let lastTradeTime = 0;

export async function fetchInitialCandles() {
  try {
    const response = await axios.get("https://api.binance.com/api/v3/klines", {
      params: {
        symbol,
        interval: "15m",
        limit: 100,
      },
    });
    priceHistory = response.data.map((c: any) => parseFloat(c[4]));
    volumeHistory = response.data.map((c: any) => parseFloat(c[5]));
    console.log(`✅ Carregados ${priceHistory.length} candles iniciais`);
  } catch (error) {
    console.error("❌ Erro ao buscar candles iniciais:", error);
  }
}

export async function startTrading() {
  console.log("🔁 Iniciando processo de trading com estratégia MM + Volume + RSI");
  await fetchInitialCandles();
  await connectToBinance();

  setInterval(async () => {
    try {
      const { data } = await axios.get("https://api.binance.com/api/v3/ticker/price", {
        params: { symbol }
      });
      const currentPrice = parseFloat(data.price);
      if (isBought) {
        highestPriceSinceBuy = Math.max(highestPriceSinceBuy, currentPrice);
      }
    } catch (err) {
      console.error("Erro ao buscar preço atual:", err);
    }
  }, 5000);
}

export function processKlineData(kline: any) {
  if (!kline.isFinal) return; // 🔒 Evita processar candles ainda em formação

  const close = parseFloat(kline.close);
  const volume = parseFloat(kline.volume);

  priceHistory.push(close);
  volumeHistory.push(volume);

  if (priceHistory.length > 100) {
    priceHistory.shift();
    volumeHistory.shift();
  }

  const minPeriod = Math.max(STRATEGY_CONFIG.slowSMA, STRATEGY_CONFIG.rsiPeriod);
  if (priceHistory.length >= minPeriod + 3) {
    const fastSMAValues = SMA.calculate({ period: STRATEGY_CONFIG.fastSMA, values: priceHistory });
    const slowSMAValues = SMA.calculate({ period: STRATEGY_CONFIG.slowSMA, values: priceHistory });
    const volumeSMAValues = SMA.calculate({ period: STRATEGY_CONFIG.volumeSMA, values: volumeHistory });
    const rsiValues = RSI.calculate({ period: STRATEGY_CONFIG.rsiPeriod, values: priceHistory });
    const obvHistory = OBV.calculate({ close: priceHistory, volume: volumeHistory });

    const fastSMA = fastSMAValues.at(-1) || 0;
    const fastSMA_prev = fastSMAValues.at(-2) || 0;
    const slowSMA = slowSMAValues.at(-1) || 0;
    const avgVolume = volumeSMAValues.at(-2) || 0;
    const rsi = rsiValues.at(-1) || 50;

    const smaInclination = fastSMA - fastSMA_prev;
    const isUptrend = fastSMA > slowSMA && smaInclination > STRATEGY_CONFIG.minTrendStrength;
    const hasHighVolume = volume > avgVolume * STRATEGY_CONFIG.minVolumeFactor;

    const last = obvHistory.length;
    const obvIncreasing = obvHistory[last - 1] > obvHistory[last - 2] && obvHistory[last - 2] > obvHistory[last - 3];
    const rsiOk = rsi > 50 && rsi < STRATEGY_CONFIG.rsiOverbought;
    const priceAboveFastSMA = close > fastSMA;
    const isGreenCandle = close > parseFloat(kline.open);

    if (!isBought && isUptrend && hasHighVolume && obvIncreasing && rsiOk && priceAboveFastSMA && isGreenCandle) {
      if (Date.now() - lastTradeTime < STRATEGY_CONFIG.tradeCooldownMs) return;
      lastTradeTime = Date.now();
      console.log("💚 Sinal de COMPRA detectado");
      executeTrade("BUY", close, {
        fastSMA, slowSMA, volume, avgVolume, rsi,
        obv: obvHistory.at(-1)
      });
    }

    if (isBought) {
      const trailingStopPrice = highestPriceSinceBuy * (1 - STRATEGY_CONFIG.trailingStopPercent);
      const stopLoss = close <= buyPrice * (1 - STRATEGY_CONFIG.stopLossPercent);
      const takeProfit = close >= buyPrice * (1 + STRATEGY_CONFIG.takeProfitPercent);
      const trailingStop = close <= trailingStopPrice;
      const rsiOverbought = rsi >= STRATEGY_CONFIG.rsiOverbought;
      const trendReversal = fastSMA < slowSMA;

      if (stopLoss || takeProfit || trailingStop || rsiOverbought || trendReversal) {
        let reason = "";
        if (stopLoss) reason = `Stop Loss (${STRATEGY_CONFIG.stopLossPercent * 100}%)`;
        else if (takeProfit) reason = `Take Profit (${STRATEGY_CONFIG.takeProfitPercent * 100}%)`;
        else if (trailingStop) reason = `Trailing Stop (${STRATEGY_CONFIG.trailingStopPercent * 100}%)`;
        else if (rsiOverbought) reason = `RSI Sobrecarregado (${rsi.toFixed(1)})`;
        else if (trendReversal) reason = "Reversão de Tendência";

        console.log(`❤️ Sinal de VENDA (${reason})`);
        executeTrade("SELL", close);
      }
    }
  }
}

async function executeTrade(action: "BUY" | "SELL", price: number, indicators?: any) {
  try {
    if (action === "BUY") {
      console.log(`🟢 COMPRA executada a ${price.toFixed(6)} USD`);
      const result = await newOrder(tradeQuantity.toString(), "BUY");
      if (!result || result.status !== "FILLED") return;

      buyPrice = price;
      highestPriceSinceBuy = price;
      isBought = true;

      appendToJSONFile("purchases", {
        date: new Date().toISOString(),
        symbol: result.symbol,
        price: parseFloat(price.toFixed(6)),
        quantity: parseFloat(result.executedQty),
        indicators
      });

      logOperation(`📥 COMPRA | ${result.symbol} | Preço: ${price.toFixed(4)} | Qtd: ${result.executedQty}`);

    } else {
      console.log(`🔴 VENDA executada a ${price.toFixed(6)} USD`);
      const result = await newOrder(tradeQuantity.toString(), "SELL");
      if (!result || result.status !== "FILLED") return;

      const profit = (price - buyPrice) * tradeQuantity;
      isBought = false;
      buyPrice = 0;
      highestPriceSinceBuy = 0;

      appendToJSONFile("sales", {
        date: new Date().toISOString(),
        symbol: result.symbol,
        price: parseFloat(price.toFixed(6)),
        quantity: parseFloat(result.executedQty),
        profit: parseFloat(profit.toFixed(6)),
        roi: ((price / buyPrice - 1) * 100).toFixed(2) + '%'
      });

      logOperation(`📤 VENDA | ${result.symbol} | Preço: ${price.toFixed(4)} | Lucro: ${profit.toFixed(2)}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao executar ${action}`, error);
  }
}

export function getCurrentStatus() {
  return { isBought, buyPrice, tradeQuantity, symbol, highestPriceSinceBuy };
}

export async function forceSellNow() {
  if (!isBought) return { status: 'warning', message: 'Nenhuma operação aberta para vender.' };

  const currentPrice = priceHistory.at(-1) || buyPrice;
  console.log(`🔴 VENDA MANUAL executada a ${currentPrice.toFixed(6)} USD`);
  const result = await newOrder(tradeQuantity.toString(), "SELL");

  if (!result || result.status !== "FILLED") {
    return { status: 'error', message: 'Erro ao executar venda manual.' };
  }

  const profit = (currentPrice - buyPrice) * tradeQuantity;

  appendToJSONFile("sales", {
    date: new Date().toISOString(),
    symbol: result.symbol,
    price: parseFloat(currentPrice.toFixed(6)),
    quantity: parseFloat(result.executedQty),
    profit: parseFloat(profit.toFixed(6)),
  });

  logOperation(`📤 VENDA MANUAL | ${result.symbol} | Preço: ${currentPrice.toFixed(4)} | Lucro: ${profit.toFixed(2)}`);

  isBought = false;
  buyPrice = 0;
  highestPriceSinceBuy = 0;

  return { status: 'success', result };
}
