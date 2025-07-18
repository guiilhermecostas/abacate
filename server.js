require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ABACATEPAY_TOKEN = process.env.ABACATEPAY_TOKEN;
const UTMIFY_TOKEN = process.env.UTMIFY_API_KEY;
const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('⚠️ JWT_SECRET não está definido no .env');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const sanitizeNumber = str => str ? str.replace(/\D/g, '') : '';
const hashSHA256 = str => {
  if (!str) return null;
  return crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');
};

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

async function enviarEventoFacebook(data, evento = 'InitiateCheckout') {
  const utm = data.tracking?.utm || {};
  const url = `https://graph.facebook.com/v17.0/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`;

  const nomeCompleto = data.customer?.name || '';
  const nomes = nomeCompleto.split(' ');
  const primeiroNome = nomes[0] || '';
  const sobrenome = nomes.slice(1).join(' ') || '';

  const payload = {
    data: [
      {
        event_name: evento,
        event_time: Math.floor(Date.now() / 1000),
        event_id: data.txid,
        action_source: 'website',
        event_source_url: data.tracking?.src || 'https://seudominio.com',
        user_data: {
          em: hashSHA256(data.customer?.email),
          ph: hashSHA256(data.customer?.cellphone),
          fn: hashSHA256(primeiroNome),
          ln: hashSHA256(sobrenome),
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
    console.log(`✅ Facebook (${evento}) enviado:`, res.data);
  } catch (err) {
    console.error(`❌ Erro Facebook CAPI (${evento}):`, err.response?.data || err.message);
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

async function salvarVendaNoSupabase(data, status) {
  const utm = data.tracking?.utm || {};

  const existing = await supabase.from('vendas').select('txid').eq('txid', data.txid).single();
  if (existing.data) {
    console.log('🟡 Venda já registrada. Ignorando.');
    return;
  }

  await supabase.from('vendas').insert([{
    txid: data.txid,
    amount: data.amount,
    status: status,
    api_key: data.api_key || '',
    name: data.customer?.name || '',
    email: data.customer?.email || '',
    cellphone: data.customer?.cellphone || '',
    taxid: data.customer?.taxId || '',
    utm_source: utm.utm_source || '',
    utm_medium: utm.utm_medium || '',
    utm_campaign: utm.utm_campaign || '',
    utm_term: utm.utm_term || '',
    utm_content: utm.utm_content || '',
    fbp: data.fbp || '',
    fbc: data.fbc || '',
    user_agent: data.user_agent || ''
  }]);


  if (error) {
    console.error("❌ Erro ao salvar no Supabase:", error.message);
  } else {
    console.log("✅ Venda salva no Supabase com sucesso.");
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token inválido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
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
      description: description || 'Este pagamento tem o selo de segurança do Banco Central do Brasil.',
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

    const apiKey = req.headers['x-api-key'];

    const dadosEvento = {
      txid: pixData.id,
      amount,
      customer: sanitizedCustomer,
      tracking: tracking || {},
      fbp,
      fbc,
      user_agent,
      api_key: apiKey
    };


    await enviarEventoUtmify(dadosEvento, "waiting_payment");
    await enviarEventoFacebook(dadosEvento, "InitiateCheckout");
    await enviarPushcut();
    await salvarVendaNoSupabase(dadosEvento, "waiting_payment");

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

app.get('/check-status/:txid', async (req, res) => {
  const { txid } = req.params;

  try {
    const response = await axios.get(`https://api.abacatepay.com/v1/pixQrCode/check?id=${txid}`, {
      headers: {
        Authorization: `Bearer ${ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const status = response.data?.data?.status;

    if (status === 'PAID') {
      const { data, error } = await supabase.from('vendas').select('*').eq('txid', txid).single();

      if (!data || error) return res.status(404).json({ error: 'Venda não encontrada' });

      await supabase.from('vendas').update({ status: 'paid' }).eq('txid', txid);

      await enviarEventoFacebook(data, "Purchase");
      await enviarEventoUtmify(data, "paid");

      return res.json({ status: 'paid', message: 'Pagamento confirmado' });
    }

    return res.json({ status, message: 'Pagamento ainda não confirmado' });

  } catch (err) {
    console.error("❌ Erro ao checar status:", err.response?.data || err.message);
    return res.status(500).json({ error: 'Erro ao verificar status do Pix' });
  }
});

app.post('/webhook', async (req, res) => {
  const { txid, status } = req.body;
  if (!txid || status !== 'PAID') return res.status(400).json({ error: 'Dados inválidos' });

  const { data, error } = await supabase.from('vendas').select('*').eq('txid', txid).single();
  if (error || !data) return res.status(404).json({ error: 'Venda não encontrada' });

  await supabase.from('vendas').update({ status: 'paid' }).eq('txid', txid);
  await enviarEventoFacebook(data, "Purchase");
  await enviarEventoUtmify(data, "paid");

  return res.status(200).json({ ok: true });
});

setInterval(async () => {
  try {
    const { data: pendentes, error } = await supabase
      .from('vendas')
      .select('*')
      .eq('status', 'waiting_payment');

    if (error) {
      console.error('❌ Erro ao buscar pendentes:', error.message);
      return;
    }

    for (const venda of pendentes) {
      try {
        const response = await axios.get(`https://api.abacatepay.com/v1/pixQrCode/check?id=${venda.txid}`, {
          headers: {
            Authorization: `Bearer ${ABACATEPAY_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        const status = response.data?.data?.status;

        if (status === 'PAID') {
          await supabase.from('vendas').update({ status: 'paid' }).eq('txid', venda.txid);
          await enviarEventoFacebook(venda, "Purchase");
          await enviarEventoUtmify(venda, "paid");
          console.log(`✅ Pagamento confirmado automaticamente para: ${venda.txid}`);
        }
      } catch (err) {
        console.error(`❌ Erro ao verificar status do Pix ${venda.txid}:`, err.response?.data || err.message);
      }
    }
  } catch (err) {
    console.error('❌ Erro geral no verificador automático:', err.message);
  }
}, 5000);

app.post('/api/cadastro', async (req, res) => {
  const { nome, email, senha, cpf } = req.body;

  const { data: existingUser } = await supabase
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    return res.status(400).json({ error: 'Usuário já cadastrado' });
  }

  const { error } = await supabase.from('usuarios').insert({
    nome,
    email,
    senha,
    cpf,
    api_key: 'overpay_key_' + Math.random().toString(36).substring(2, 15),
    pin_key_int: Math.floor(1000 + Math.random() * 9000)
  });

  if (error) {
    return res.status(500).json({ error: 'Erro ao cadastrar usuário' });
  }

  res.status(201).json({ ok: true, msg: 'Usuário cadastrado com sucesso' });
});

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;

  const { data: user } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .single();

  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

  if (senha !== user.senha) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '1d'
  });

  res.json({
    token,
    nome: user.nome,
    email: user.email,
    api_key: user.api_key
  });
});

app.get('/api/validate-key', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(400).json({ valid: false, message: 'Api key não enviada' });
  }

  const { data: user, error } = await supabase
    .from('usuarios')
    .select('id')
    .eq('api_key', apiKey)
    .single();

  if (error || !user) {
    return res.status(401).json({ valid: false, message: 'Api key inválida' });
  }

  return res.json({ valid: true });
});

app.get('/api/tax-info', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(400).json({ error: 'API key não enviada' });
  }

  const { data: user, error } = await supabase
    .from('usuarios')
    .select('percenttax, fixtax')
    .eq('api_key', apiKey)
    .single();

  if (error || !user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }

  return res.json({ percenttax: user.percenttax, fixtax: user.fixtax });
});

app.get('/api/resumo-vendas', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const { data_de, data_ate } = req.query;

  if (!apiKey) {
    return res.status(401).json({ error: 'API Key não fornecida' });
  }

  let query = supabase
    .from('vendas')
    .select('status, valor_liquido', { count: 'exact' })
    .eq('api_key', apiKey);

  if (data_de) {
    query = query.gte('created_at', `${data_de}T00:00:00`);
  }

  if (data_ate) {
    query = query.lte('created_at', `${data_ate}T23:59:59`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro no Supabase:', error);
    return res.status(500).json({ error: 'Erro ao consultar vendas' });
  }

  let vendasPagas = { quantidade: 0, total: 0 };
  let vendasPendentes = { quantidade: 0, total: 0 };

  for (const venda of data) {
    if (venda.status === 'paid') {
      vendasPagas.quantidade++;
      vendasPagas.total += venda.valor_liquido;
    } else if (venda.status === 'waiting_payment') {
      vendasPendentes.quantidade++;
      vendasPendentes.total += venda.valor_liquido;
    }
  }


  return res.json({ vendasPagas, vendasPendentes });
});


app.get('/api/visitas', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const { data_de, data_ate } = req.query;

  if (!apiKey) {
    return res.status(400).json({ error: 'API key não enviada' });
  }

  let query = supabase
    .from('visitas')
    .select('*', { count: 'exact' })
    .eq('api_key', apiKey);

  if (data_de) {
    query = query.gte('created_at', `${data_de}T00:00:00`);
  }

  if (data_ate) {
    query = query.lte('created_at', `${data_ate}T23:59:59`);
  }

  try {
    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar visitas:', error.message);
      return res.status(500).json({ error: 'Erro ao buscar visitas' });
    }

    return res.json({ totalVisitas: data.length });
  } catch (err) {
    console.error('Erro inesperado ao buscar visitas:', err.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/visitas-vivo', async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(400).json({ error: 'API key não enviada' });
  }

  try {
    const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('visitas')
      .select('*')
      .eq('api_key', apiKey)
      .gte('created_at', cincoMinutosAtras)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar visitas:', error);
      return res.status(500).json({ error: 'Erro interno' });
    }

    return res.json({
      quantidade: data.length,
      visitas: data
    });
  } catch (err) {
    console.error('Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro interno inesperado' });
  }
});

app.post('/api/iniciais', async (req, res) => {
  const { api_key } = req.body;

  if (!api_key) return res.status(400).json({ error: 'api_key é obrigatória' });

  const { data, error } = await supabase
    .from('usuarios')
    .select('nome')
    .eq('api_key', api_key)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });

  const partes = data.nome.trim().split(' ');
  const iniciais = (partes[0]?.[0] || '') + (partes[1]?.[0] || '');

  return res.json({ iniciais: iniciais.toUpperCase() });
});

function formatarStatus(status) {
  if (status === 'paid') return 'Aprovado';
  if (status === 'waiting_payment') return 'Pendente';
  if (status === 'refunded') return 'Reembolsado';
  return status;
}

app.get('/api/vendas', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from('vendas')
      .select('valor_liquido, status, name, email, created_at, cellphone, taxid', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Erro ao buscar vendas:', error);
      return res.status(500).json({ error: 'Erro ao buscar vendas.' });
    }

    const vendas = data.map((venda) => ({
      valor: venda.valor_liquido,
      status: formatarStatus(venda.status),
      nome: venda.name,
      telefone: venda.cellphone,
      cpf: venda.taxid,
      email: venda.email,
      horario: venda.created_at,
    }));

    return res.json({
      vendas,
      total: count,
      page,
      totalPages: Math.ceil(count / pageSize),
    });
  } catch (err) {
    console.error('Erro interno:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

app.post("/api/saldo", async (req, res) => {
  const { api_key } = req.body;

  if (!api_key) return res.status(400).json({ error: "api_key obrigatória" });

  try {
      const { data: vendas, error: vendasError } = await supabase
          .from("vendas")
          .select("valor_liquido")
          .eq("api_key", api_key)
          .eq("status", "paid");

      if (vendasError) throw vendasError;

      const totalvenda = vendas.reduce((sum, row) => sum + (parseFloat(row.valor_liquido) || 0), 0);

      const { data: saques, error: saquesError } = await supabase
          .from("saque")
          .select("valor_saque")
          .eq("api_key", api_key)
          .in("status_saque", ["Transferido", "Pendente"]);  
 
      if (saquesError) throw saquesError;

      const totalsaque = saques.reduce((sum, row) => sum + (parseFloat(row.valor_saque) || 0), 0);

      const saldo = totalvenda - totalsaque;

      res.json({ saldo, totalSacado: totalsaque });
  } catch (error) {
      console.error("Erro ao calcular saldo:", error);
      res.status(500).json({ error: "Erro interno ao buscar saldo" });
  }
});

app.post("/api/solicitar-saque", async (req, res) => {
  const { valor_saque, tipo_saque, chave_saque, api_key } = req.body;

  if (!valor_saque || !tipo_saque || !chave_saque || !api_key) {
    return res.status(400).json({ error: "Campos obrigatórios ausentes" });
  }

  try {
    const { data: vendasPagas, error: erroVendas } = await supabase
      .from("vendas")
      .select("valor_liquido")
      .eq("api_key", api_key)
      .eq("status", "paid");

    if (erroVendas) throw erroVendas;

    const totalVenda = vendasPagas.reduce(
      (acc, venda) => acc + parseFloat(venda.valor_liquido || 0),
      0
    );

    const { data: saquesTransferidos, error: erroSaques } = await supabase
      .from("saque")
      .select("valor_saque")
      .eq("api_key", api_key)
      .eq("status_saque", "transferido");

    if (erroSaques) throw erroSaques;

    const totalSaque = saquesTransferidos.reduce(
      (acc, saque) => acc + parseFloat(saque.valor_saque || 0),
      0
    );

    const saldoDisponivel = totalVenda - totalSaque;

    if (valor_saque > saldoDisponivel) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    // Inserção do saque como pendente
    const { error: erroInsert } = await supabase.from("saque").insert([
      {
        valor_saque,
        tipo_saque,
        chave_saque,
        status_saque: "Pendente",
        api_key,
      },
    ]);

    if (erroInsert) throw erroInsert;

    return res.status(200).json({ success: true, message: "Saque solicitado com sucesso" });
  } catch (error) {
    console.error("Erro ao solicitar saque:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.get("/api/saldox", async (req, res) => {
  const { api_key } = req.query;

  if (!api_key) {
    return res.status(400).json({ error: "API Key obrigatória" });
  }

  try {
    const { data: vendasPagas, error: erroVendas } = await supabase
      .from("vendas")
      .select("valor_liquido")
      .eq("api_key", api_key)
      .eq("status", "paid");

    if (erroVendas) throw erroVendas;
 
    const totalVenda = vendasPagas.reduce(
      (acc, venda) => acc + parseFloat(venda.valor_liquido || 0),
      0
    );

    const { data: saques, error: erroSaques } = await supabase
      .from("saque")
      .select("valor_saque")
      .eq("api_key", api_key)
      .in("status_saque", ["Transferido", "Pendente"]);

    if (erroSaques) throw erroSaques;

    const totalSaque = saques.reduce(
      (acc, saque) => acc + parseFloat(saque.valor_saque || 0),
      0
    );

    const saldoDisponivel = totalVenda - totalSaque;

    return res.status(200).json({
      totalVenda,
      totalSaque,
      saldoDisponivel,
    });
  } catch (error) {
    console.error("Erro ao calcular saldo:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.get('/api/saques', async (req, res) => {
  const { api_key } = req.query;

  if (!api_key) {
    return res.status(400).json({ error: 'API Key obrigatória' });
  }

  try {
    const { data, error } = await supabase
      .from('saque')
      .select('valor_saque, created_at, status_saque')
      .eq('api_key', api_key)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar saques:', error);
      return res.status(500).json({ error: 'Erro ao buscar saques' });
    }

    const listaSaques = data.map((item) => ({
      valor: item.valor_saque,
      horario: item.created_at,
      status: item.status_saque,
    }));

    return res.json(listaSaques);
  } catch (err) {
    console.error('Erro interno:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/salvar-chave', async (req, res) => {
  const { campo, valor, api_key } = req.body;

  if (!campo || !valor || !api_key) {
    return res.status(400).json({ erro: 'Dados incompletos.' });
  }

  if (!['utmify_key', 'meta_key'].includes(campo)) {
    return res.status(400).json({ erro: 'Campo inválido.' });
  }

  const { error } = await supabase
    .from('usuarios')
    .update({ [campo]: valor })
    .eq('api_key', api_key);

  if (error) {
    return res.status(500).json({ erro: 'Erro interno ao salvar chave.' });
  }

  res.json({ sucesso: true });
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/api/produtos', upload.single('imagem'), async (req, res) => {
  try {
    const { nome, descricao, tipo, preco } = req.body;
    const imagem = req.file;

    if (!imagem) return res.status(400).json({ error: 'Imagem não enviada' });

    const fileName = `${Date.now()}_${imagem.originalname}`;

    const { error: uploadError } = await supabase.storage
      .from('productsimage')
      .upload(fileName, imagem.buffer, {
        contentType: imagem.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return res.status(500).json({ error: 'Erro ao enviar imagem pro Supabase', details: uploadError.message });
    }

    const { error: insertError } = await supabase
      .from('products')
      .insert([{
        name: nome,
        details: descricao,
        type: tipo,
        offer: parseFloat(preco),
        image: fileName,
      }]);

    if (insertError) {
      return res.status(500).json({ error: 'Erro ao salvar dados no Supabase', details: insertError.message });
    }

    res.status(200).json({ message: 'Produto salvo com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});




app.listen(PORT, () => console.log(`🚀 Backend rodando na porta ${PORT}`));
