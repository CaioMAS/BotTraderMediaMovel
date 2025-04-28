// strategyService.ts - processa candles + inicia trading conectando à Binance

import { newOrder } from "./orderService";
import { calculateEMA } from "../utils/indicators";
import { appendToJSONFile, logOperation } from "../utils/fileHandler";
import { connectToBinance } from "./webSocketService";

let isBought = false;
let buyPrice = 0;
const tradeQuantity = 250;
let priceHistory: number[] = [];
let prevDiff = 0;
const symbol = process.env.SYMBOL || 'SYMBOL_NOT_SET';

export async function fetchInitialCandles(): Promise<number[]> {
  const axios = await import("axios");
  try {
    const response = await axios.default.get("https://api.binance.com/api/v3/klines", {
      params: {
        symbol: symbol,
        interval: "15m",
        limit: 100,
      },
    });
    return response.data.map((candle: any) => parseFloat(candle[4]));
  } catch (error) {
    console.error("❌ Erro ao buscar candles iniciais:", error);
    return [];
  }
}

export async function startTrading() {
  console.log("🔁 Iniciando processo de trading...");
  priceHistory = await fetchInitialCandles();
  await connectToBinance();
}

export function processKlineData(close: number) {
  console.log("📥 Novo candle recebido. Analisando indicadores...");

  priceHistory.push(close);
  if (priceHistory.length > 100) priceHistory.shift();

  if (priceHistory.length >= 40) {
    const ema7 = calculateEMA(priceHistory, 7);
    const ema40 = calculateEMA(priceHistory, 40);
    const diff = ema7 - ema40;

    console.log(`📊 EMA7: ${ema7.toFixed(6)} | EMA40: ${ema40.toFixed(6)} | Diferença: ${diff.toFixed(6)}`);

    if (!isBought && prevDiff < 0 && diff >= 0) {
      console.log("💚 Cruzamento pra CIMA detectado → COMPRA");
      executeTrade("BUY", close, { ema7, ema40 });
    }

    if (isBought && prevDiff > 0 && diff <= 0) {
      console.log("❤️ Cruzamento pra BAIXO detectado → VENDA");
      executeTrade("SELL", close);
    }

    prevDiff = diff;
  }
}

async function executeTrade(action: "BUY" | "SELL", price: number, indicators?: any) {
  if (action === "BUY") {
    console.log(`🟢 COMPRA executada a ${price.toFixed(6)} USD`);
    const result = await newOrder(tradeQuantity.toString(), "BUY");
    if (!result || result.status !== "FILLED") return;

    buyPrice = price;
    isBought = true;

    appendToJSONFile("purchases", {
      date: new Date().toISOString(),
      symbol: result.symbol,
      price: parseFloat(price.toFixed(6)),
      quantity: parseFloat(result.executedQty),
    });

    logOperation(`📥 COMPRA | ${result.symbol} | Preço: ${price.toFixed(4)} | Qtd: ${result.executedQty}`);

  } else {
    console.log(`🔴 VENDA executada a ${price.toFixed(6)} USD`);
    const result = await newOrder(tradeQuantity.toString(), "SELL");
    if (!result || result.status !== "FILLED") return;

    const profit = (price - buyPrice) * tradeQuantity;
    isBought = false;
    buyPrice = 0; // Limpa o preço de compra

    appendToJSONFile("sales", {
      date: new Date().toISOString(),
      symbol: result.symbol,
      price: parseFloat(price.toFixed(6)),
      quantity: parseFloat(result.executedQty),
      profit: parseFloat(profit.toFixed(6)),
    });

    logOperation(`📤 VENDA | ${result.symbol} | Preço: ${price.toFixed(4)} | Lucro: ${profit.toFixed(2)}`);
  }
}

// ✅ Funções novas para o Front

export function getCurrentStatus() {
  return {
    isBought,
    buyPrice,
    tradeQuantity,
    symbol,
  };
}

export async function forceSellNow() {
  if (!isBought) {
    throw new Error('Nenhuma operação aberta para vender.');
  }

  const precoAtual = priceHistory[priceHistory.length - 1] || buyPrice;

  console.log(`🔴 VENDA MANUAL executada a ${precoAtual.toFixed(6)} USD`);
  const result = await newOrder(tradeQuantity.toString(), "SELL");

  if (!result || result.status !== "FILLED") {
    throw new Error('Erro ao executar venda manual.');
  }

  const profit = (precoAtual - buyPrice) * tradeQuantity;

  appendToJSONFile("sales", {
    date: new Date().toISOString(),
    symbol: result.symbol,
    price: parseFloat(precoAtual.toFixed(6)),
    quantity: parseFloat(result.executedQty),
    profit: parseFloat(profit.toFixed(6)),
  });

  logOperation(`📤 VENDA MANUAL | ${result.symbol} | Preço: ${precoAtual.toFixed(4)} | Lucro: ${profit.toFixed(2)}`);

  isBought = false;
  buyPrice = 0;

  return result;
}


