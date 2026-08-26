// /api/cakto-webhook.js
// Endpoint que a Cakto chama automaticamente quando um pagamento é aprovado.
// Ativa a assinatura SOMENTE da cafeteria dona do e-mail que fez o pagamento.

// --- Configuração (definir como variáveis de ambiente na Vercel, nunca deixar fixo no código) ---
const SUPABASE_URL = process.env.SUPABASE_URL;                 // ex: https://tuecuhzmsyauzkdclrdv.supabase.co
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // chave "service_role" do Supabase (NÃO é a anon key)
const CAKTO_WEBHOOK_SECRET = process.env.CAKTO_WEBHOOK_SECRET;  // o "secret" que a Cakto gera ao criar o webhook

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const body = req.body;
console.log('PAYLOAD CAKTO:', JSON.stringify(body));
    // 1) Confirma que a chamada realmente veio da Cakto (evita que qualquer pessoa
    //    chame esse endpoint e ative uma conta de graça).
    if (!body || body.secret !== CAKTO_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Assinatura inválida' });
    }

    const evento = body.event;
    const dados = body.data || {};
    const status = dados.status;
    const emailComprador = dados.customer?.email;

    // 2) Só processa eventos de pagamento aprovado (compra ou assinatura).
    const eventosQueLiberamAcesso = ['purchase_approved', 'subscription_created', 'subscription_renewed'];
    // Eventos que devem BLOQUEAR o acesso (assinatura cancelada, pagamento falhou, etc.)
    const eventosQueRevogamAcesso = ['subscription_canceled', 'subscription_renewal_refused', 'refund', 'chargeback'];

    if (!emailComprador) {
      return res.status(400).json({ error: 'E-mail do comprador não encontrado no payload' });
    }

    const emailNormalizado = emailComprador.trim().toLowerCase();

    if (eventosQueLiberamAcesso.includes(evento) && status === 'paid') {
      // Ativa (ou renova) o acesso somente da cafeteria com esse e-mail
      const resposta = await fetch(
        `${SUPABASE_URL}/rest/v1/cafeterias?email=eq.${encodeURIComponent(emailNormalizado)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            plano_ativo: true,
            data_inscricao: new Date().toISOString()
          })
        }
      );

      const atualizados = await resposta.json();

      if (!resposta.ok || !Array.isArray(atualizados) || atualizados.length === 0) {
        // Não existe (ainda) nenhuma cafeteria cadastrada com esse e-mail.
        // Isso pode acontecer se a pessoa pagou antes de criar a conta no CoffeeFlow.
        return res.status(200).json({
          ok: true,
          aviso: 'Pagamento recebido, mas nenhuma cafeteria encontrada com esse e-mail ainda.'
        });
      }

      return res.status(200).json({ ok: true, cafeteriaAtivada: emailNormalizado });
    }

    if (eventosQueRevogamAcesso.includes(evento)) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/cafeterias?email=eq.${encodeURIComponent(emailNormalizado)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ plano_ativo: false })
        }
      );

      return res.status(200).json({ ok: true, cafeteriaDesativada: emailNormalizado });
    }

    // Evento que não precisa de ação (ex: "abandono de checkout")
    return res.status(200).json({ ok: true, ignorado: evento });

  } catch (err) {
    console.error('Erro no webhook da Cakto:', err);
    return res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
};
