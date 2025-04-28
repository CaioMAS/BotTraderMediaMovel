import * as dotenv from 'dotenv';
dotenv.config();

import { newOrder } from './src/services/orderService';
import { forceBuy } from './src/services/strategyService'; // <-- Importa a função que ajusta o status

async function testBuyOrder() {
  const quantity = '250'; // ou ajuste
  const side = 'BUY';

  console.log('🧪 Testando envio de ordem para Binance...');
  console.log(`🔢 Quantidade: ${quantity}`);
  console.log(`📘 Tipo: ${side}`);

  const result = await newOrder(quantity, side);

  if (result && result.status === 'FILLED') {
    // Agora sim, pegar o preço de execução real
    const executedPrice = parseFloat(result.fills[0].price);
    console.log(`✅ Ordem preenchida a ${executedPrice}`);
    
    forceBuy(executedPrice); // <-- Aqui atualiza o estado interno do bot
  } else {
    console.error('❌ Erro ao executar ordem de compra!');
  }
}

testBuyOrder();
