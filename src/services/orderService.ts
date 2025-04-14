import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config/dotenv';

export async function newOrder(quantity: string, side: string) {
  const data = {
    symbol: config.SYMBOL,
    type: 'MARKET',
    side,
    quantity,
    timestamp: Date.now(),
    recvWindow: 10000,
  };

  const stringData = Object.entries(data).reduce((acc, [key, value]) => {
    acc[key] = value !== undefined ? value.toString() : '';
    return acc;
  }, {} as Record<string, string>);

  const queryString = new URLSearchParams(stringData).toString();

  const signature = crypto
    .createHmac('sha256', config.SECRET_KEY)
    .update(queryString)
    .digest('hex');

  const signedData = {
    ...stringData,
    signature,
  };

  try {
    const response = await axios.post(
      `${config.API_URL}/v3/order`,
      new URLSearchParams(signedData),
      {
        headers: {
          'X-MBX-APIKEY': config.API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    console.log('✅ Ordem executada:', response.data);
    return response.data; // ✅ Retorne o resultado da ordem

  } catch (err: any) {
    console.error('❌ Erro ao executar ordem na Binance:', err?.response?.data || err.message);
    return null; // ✅ Retorne null se falhar
  }
}