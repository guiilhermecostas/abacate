import AbacatePay from '@mcpbr/abacatepay';

const abacatePay = new AbacatePay({ apiKey: process.env.ABACATEPAY_TOKEN });

// Criar cliente
const customer = await abacatePay.createCustomer({
  name: 'Nome do Cliente',
  email: 'cliente@exemplo.com',
  cellphone: '11999999999',
  taxId: '12345678900'
});

// Criar cobrança via PIX
const payment = await abacatePay.createPayment({
  amount: 1000, // em centavos
  description: 'Serviço prestado',
  customerId: customer.id
});
console.log('URL de pagamento:', payment.url);
