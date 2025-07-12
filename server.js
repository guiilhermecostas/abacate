const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🚀 Backend AbacatePay está rodando!');
});

app.post("/criar-cobranca", async (req, res) => {
  const { customer, amountCentavos } = req.body;

  const payload = {
    frequency: "ONE_TIME",
    methods: ["PIX"],
    products: [{
      externalId: "doacao-ajude-ana",
      name: "Doação Ajude Ana",
      description: "Sua contribuição pode salvar uma vida.",
      quantity: 1,
      price: amountCentavos
    }],
    returnUrl: "https://example.com/voltar",
    completionUrl: "https://example.com/sucesso",
    customerId: "", // se não tiver um ID salvo, pode omitir
    customer,
    allowCoupons: false
  };

  try {
    const response = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("✅ Resposta AbacatePay:", result);

    if (result?.checkoutUrl) {
      res.json({ checkoutUrl: result.checkoutUrl });
    } else {
      res.status(400).json({ error: "Erro ao gerar link", detalhes: result });
    }
  } catch (err) {
    console.error("❌ Erro:", err);
    res.status(500).json({ error: "Erro interno ao criar cobrança" });
  }
});


// ✅ Rota para checar status do PIX
app.get('/abacatepay/v1/pixQrCode/check', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID da transação não informado' });
  }

  try {
    const response = await fetch(`https://api.abacatepay.com/v1/pixQrCode/check?id=${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    res.status(response.status).json(result);
  } catch (err) {
    console.error('Erro ao checar status na AbacatePay:', err);
    res.status(500).json({ error: 'Erro ao checar status do pagamento' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
});
