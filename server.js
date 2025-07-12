require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ABACATEPAY_TOKEN = process.env.ABACATEPAY_TOKEN;

app.post('/create-pix', async (req, res) => {
  const {
    amount,
    description,
    customer,
    tracking,
    fbp,
    fbc,
    user_agent
  } = req.body;

  if (!amount || amount < 2000) {
    return res.status(400).json({ error: 'Valor mínimo de R$20,00 (2000 centavos)' });
  }
  if (amount > 70000) {
    return res.status(400).json({ error: 'Valor máximo de R$700,00 (70000 centavos)' });
  }
  if (!customer || !customer.name || !customer.cellphone || !customer.email || !customer.taxId) {
    return res.status(400).json({ error: 'Dados do cliente incompletos' });
  }

  const sanitizeNumber = (str) => str.replace(/\D/g, '');

  const sanitizedCustomer = {
    ...customer,
    cellphone: sanitizeNumber(customer.cellphone),
    taxId: sanitizeNumber(customer.taxId),
  };

  try {
    const pixResponse = await axios.post('https://api.abacatepay.com/v1/pixQrCode/create', {
      amount,
      description: description || 'Doação Ajude Isa',
      customer: sanitizedCustomer,
      expiresIn: 3600
    }, {
      headers: {
        Authorization: `Bearer ${ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });

    const pixData = pixResponse.data.data;

    // Enviar payload para UTMify
    const orderId = pixData.txid || crypto.randomUUID();
    const payload = {
      orderId,
      platform: "checkoutfy",
      paymentMethod: "pix",
      status: "waiting_payment",
      createdAt: new Date().toISOString(),
      approvedDate: new Date().toISOString(),
      customer: {
        name: customer.name || "Doador anônimo",
        email: customer.email || "anonimo@exemplo.com",
        phone: customer.cellphone || "",
        document: customer.taxId || ""
      },
      trackingParameters: {
        utm_term: tracking?.utm?.term || '',
        utm_medium: tracking?.utm?.medium || '',
        utm_source: tracking?.utm?.source || '',
        utm_content: tracking?.utm?.content || '',
        utm_campaign: tracking?.utm?.campaign || ''
      },
      commission: {
        totalPriceInCents: amount,
        gatewayFeeInCents: 300,
        userCommissionInCents: amount
      },
      products: [
        {
          id: "produto1",
          name: "Doação Checkout",
          planId: "pix_plano",
          planName: "Pix Único",
          quantity: 1,
          priceInCents: amount
        }
      ]
    };

    // Envia para UTMify
    axios.post("https://api.utmify.com.br/api-credentials/orders", payload, {
      headers: {
        "Content-Type": "application/json",
        "x-api-token": "a970kEmXX55G4T4Qe48hIv3liStmyR55x8l9"
      }
    }).then(() => {
      console.log("✅ Payload enviado para UTMify");
    }).catch((err) => {
      console.error("❌ Erro ao enviar para UTMify:", err.message);
    });

    // Dispara o webhook do Pushcut
    axios.post("https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/CheckoutFy%20Gerou", {
      title: "Pagamento Gerado",
      text: `Pix gerado com valor R$ ${(amount / 100).toFixed(2)}`
    }).then(() => {
      console.log("🚀 Webhook Pushcut disparado com sucesso");
    }).catch((err) => {
      console.error("❌ Erro ao disparar webhook Pushcut:", err.message);
    });

    return res.json({ data: pixData });
  } catch (error) {
    console.error('❌ Erro na AbacatePay:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Erro ao gerar PIX' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend rodando na porta ${PORT}`);
});
