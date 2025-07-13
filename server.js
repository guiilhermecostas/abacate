require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ABACATEPAY_TOKEN = process.env.ABACATEPAY_TOKEN;
const UTMIFY_TOKEN = process.env.UTMIFY_API_KEY;
const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

const sanitizeNumber = str => str.replace(/\D/g, '');
const hashSHA256 = str => crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');

async function enviarEventoUtmify(data, status) {
  const utm = data.tracking?.utm || {};

  const payload = {
    orderId: data.txid,
    platform: "checkoutfy",
    paymentMethod: "pix",
    status: status,
    createdAt: new Date().toISOString(),
    approvedDate: new Date().toISOString(),
    customer: {
      name: data.customer?.name || 'Sem nome',
      email: data.customer?.email || 'sememail@email.com',
      phone: data.customer?.cellphone || '',
      document: data.customer?.taxId || ''
    },
    trackingParameters: {
      utm_term: utm.utm_term || '',
      utm_medium: utm.utm_medium || '',
      utm_source: utm.utm_source || '',
      utm_content: utm.utm_content || '',
      utm_campaign: utm.utm_campaign || ''
    },
    commission: {
      totalPriceInCents: data.amount || 0,
      gatewayFeeInCents: 300,
      userCommissionInCents: data.amount || 0
    },
    products: [
      {
        id: "produto1",
        name: "Doação Checkout",
        planId: "pix_plano",
        planName: "Pix Único",
        quantity: 1,
        priceInCents: data.amount || 0
      }
    ]
  };

  try {
    const res = await axios.post("https://api.utmify.com.br/api-credentials/orders", payload, {
      headers: {
        "Content-Type": "application/json",
        "x-api-token": UTMIFY_TOKEN
      }
    });
    console.log("✅ UTMify enviado:", res.data);
  } catch (err) {
    console.error("❌ Erro ao enviar para UTMify:", err.response?.data || err.message);
  }
}

async function enviarEventoFacebook(data) {
  const utm = data.tracking?.utm || {};
  const url = `https://graph.facebook.com/v17.0/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`;

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: data.txid,
        action_source: 'website',
        event_source_url: data.tracking?.src || 'https://seudominio.com',
        user_data: {
          em: hashSHA256(data.customer.email),
          ph: hashSHA256(data.customer.cellphone),
          fn: hashSHA256(data.customer.name.split(' ')[0] || ''),
          ln: hashSHA256(data.customer.name.split(' ').slice(1).join(' ') || ''),
          fbp: data.fbp || null,
          fbc: data.fbc || null,
          client_user_agent: data.user_agent || null,
        },
        custom_data: {
          currency: 'BRL',
          value: (data.amount || 0) / 100,
          content_name: 'Doação',
          content_category: utm.utm_campaign || 'ajudeana',
          content_type: 'product',
          order_id: data.txid
        }
      }
    ]
  };

  try {
    const res = await axios.post(url, payload);
    console.log("✅ Facebook enviado:", res.data);
  } catch (err) {
    console.error("❌ Erro Facebook CAPI:", err.response?.data || err.message);
  }
}

async function enviarPushcut() {
  try {
    const url = 'https://api.pushcut.io/U-9R4KGCR6y075x0NYKk7/notifications/Aprovado';
    const res = await axios.post(url, { title: 'Gerado', text: 'Pix gerado' });
    console.log("✅ Pushcut enviado:", res.data);
  } catch (err) {
    console.error("❌ Erro Pushcut:", err.message);
  }
}

app.post('/create-pix', async (req, res) => {
  const { amount, description, customer, tracking, fbp, fbc, user_agent } = req.body;

  if (!amount || amount < 2000 || amount > 200000)
    return res.status(400).json({ error: 'Valor fora do permitido (mín. R$20,00, máx. R$700,00)' });

  if (!customer || !customer.name || !customer.cellphone || !customer.email || !customer.taxId)
    return res.status(400).json({ error: 'Dados do cliente incompletos' });

  const sanitizedCustomer = {
    ...customer,
    cellphone: sanitizeNumber(customer.cellphone),
    taxId: sanitizeNumber(customer.taxId)
  };

  try {
    const response = await axios.post('https://api.abacatepay.com/v1/pixQrCode/create', {
      amount,
      description: description || 'Doação Ajude Ana',
      customer: sanitizedCustomer,
      expiresIn: 3600
    }, {
      headers: {
        Authorization: `Bearer ${ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const pixData = response.data?.data;

    if (!pixData || !pixData.id) throw new Error('Pix não retornou ID');

    const dadosEvento = {
      txid: pixData.id, // agora usando o campo correto
      amount,
      customer: sanitizedCustomer,
      tracking: tracking || {},
      fbp,
      fbc,
      user_agent
    };

    // Disparar os eventos
    await enviarEventoUtmify(dadosEvento, "waiting_payment");
    await enviarEventoFacebook(dadosEvento);
    await enviarPushcut();

    // Retornar dados ao frontend
    return res.json({
      data: {
        txid: pixData.id,
        brCode: pixData.brCode,
        qrCodeBase64: pixData.brCodeBase64
      }
    });
  } catch (error) {
    console.error('❌ Erro ao gerar Pix:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Erro ao gerar PIX' });
  }
});


app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));
