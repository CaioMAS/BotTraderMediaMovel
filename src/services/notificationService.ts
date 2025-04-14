import { config } from "../config/dotenv";
import { sendTelegramNotification } from "./sendTelegramNotification";

export async function notifyTradeAction(action: "BUY" | "SELL", price: number, profit?: number) {
  const message =
    action === "BUY"
      ? `🚀 COMPRA realizada! 
🎯 Ativo: ${config.SYMBOL} 
💵 Preço de compra: ${price.toFixed(2)} USD`
      : `📉 VENDA realizada! 
🎯 Ativo: ${config.SYMBOL} 
💵 Preço de venda: ${price.toFixed(2)} USD
💰 Lucro/Prejuízo: ${profit?.toFixed(2)} USD`;

  console.log(message);

  // ✅ Agora aguardando a conclusão da notificação
  await sendTelegramNotification(message);
}