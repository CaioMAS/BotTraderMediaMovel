import axios from 'axios';
import { logOperation } from '../utils/fileHandler';
import { config } from '../config/dotenv';

export async function sendTelegramNotification(message: string) {
  const url = `https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/sendMessage`;

  try {
    const response = await axios.post(url, {
      chat_id: config.CHAT_ID,
      text: message,
      parse_mode: "HTML", // ou "Markdown" se preferir
    });

    const successLog = `✅ Notificação enviada ao Telegram: ${JSON.stringify(response.data)}`;
    console.log(successLog);
    logOperation(successLog);

  } catch (error: any) {
    const detailedError =
      error?.response?.data?.description || // Erro descritivo do Telegram
      error?.response?.data ||              // JSON bruto da resposta
      error?.message ||                     // Erro padrão
      JSON.stringify(error);                // Fallback final

    const msg = `❌ Erro ao enviar notificação para o Telegram: ${detailedError}`;
    console.error(msg);
    logOperation(msg);
  }
}
