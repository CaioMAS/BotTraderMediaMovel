import sqlite3 from "sqlite3";
import path from "path";

const dbPath = path.resolve(__dirname, "../trades.db");
export const db = new sqlite3.Database(dbPath);

// 📌 Criação de tabela com garantias de tipos
const createTableSQL = `
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  buyTime TEXT,
  buyPrice REAL,
  sellTime TEXT DEFAULT NULL,
  sellPrice REAL DEFAULT NULL,
  buyTotal REAL,
  sellTotal REAL DEFAULT NULL,
  sma20 REAL,
  ema20 REAL,
  ema100 REAL,
  rsi14 REAL,
  adx REAL,
  macd REAL,
  result REAL DEFAULT NULL
)`;

db.run(createTableSQL, (err) => {
  if (err) {
    console.error("❌ Erro ao criar a tabela 'trades':", err.message);
  } else {
    console.log("✅ Tabela 'trades' verificada/criada com sucesso.");
  }
});

// 🔐 Função utilitária para validar indicadores
function sanitizeIndicator(value: any): number {
  return typeof value === "number" && !isNaN(value) && isFinite(value) ? value : 0;
}

// 🔹 Função robusta para salvar uma compra
export function saveTradeBuy(data: any, tradeQuantity: number, callback?: (id: number) => void) {
  const buyTime = new Date().toISOString();
  const buyPrice = sanitizeIndicator(data.buyPrice);
  const buyTotal = tradeQuantity * buyPrice;

  const indicators = {
    sma20: sanitizeIndicator(data.sma20),
    ema20: sanitizeIndicator(data.ema20),
    ema100: sanitizeIndicator(data.ema100),
    rsi14: sanitizeIndicator(data.rsi14),
    adx: sanitizeIndicator(data.adx),
    macd: sanitizeIndicator(data.macd),
  };

  console.log("🧪 Salvando nova compra no banco com:", {
    buyTime, buyPrice, buyTotal, ...indicators
  });

  db.run(
    `INSERT INTO trades (
      buyTime, buyPrice, buyTotal,
      sma20, ema20, ema100, rsi14, adx, macd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      buyTime,
      buyPrice,
      buyTotal,
      indicators.sma20,
      indicators.ema20,
      indicators.ema100,
      indicators.rsi14,
      indicators.adx,
      indicators.macd,
    ],
    function (this: sqlite3.RunResult, err) {
      if (err) {
        console.error("❌ Erro ao inserir trade:", err.message);
        return;
      }
      console.log(`✅ Compra registrada com ID: ${this.lastID}`);
      if (callback) callback(this.lastID);
    }
  );
}

// 🔹 Função robusta para salvar uma venda
export function saveTradeSell(id: number, sellPrice: number, profit?: number) {
  const sellTime = new Date().toISOString();

  if (isNaN(sellPrice) || !isFinite(sellPrice)) {
    console.error("❌ Preço inválido para venda:", sellPrice);
    return;
  }

  const sellTotal = sellPrice * 250;

  console.log("🧪 Atualizando venda para ID:", id);

  db.run(
    `UPDATE trades 
     SET sellTime = ?, sellPrice = ?, sellTotal = ?, result = ?
     WHERE id = ?`,
    [sellTime, sellPrice, sellTotal, profit ?? null, id],
    function (this: sqlite3.RunResult, err) {
      if (err) {
        console.error("❌ Erro ao atualizar venda:", err.message);
        return;
      }

      if (this.changes === 0) {
        console.warn("⚠️ Nenhum trade foi atualizado. Verifique o ID:", id);
      } else {
        console.log(`✅ Venda registrada para ID: ${id} com lucro de ${profit}`);
      }
    }
  );
}
