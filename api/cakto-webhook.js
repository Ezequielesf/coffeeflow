// /api/cakto-webhook.js

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CAKTO_WEBHOOK_SECRET = process.env.CAKTO_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método não permitido'
    });
  }

  try {
    const body = req.body;

    console.log('PAYLOAD CAKTO:', JSON.stringify(body));

    // Verifica o segredo enviado pela Cakto
    if (!body || body.secret !== CAKTO_WEBHOOK_SECRET) {
      return res.status(401).json({
        error: 'Assinatura inválida'
      });
    }

    const evento = body.event;

    // A Cakto envia data como ARRAY
    const dados = Array.isArray(body.data)
      ? body.data[0]
      : body.data || {};

    const status = dados.status;
    const emailComprador = dados.customer?.email;

    if (!emailComprador) {
      return res.status(400).json({
        error: 'E-mail do comprador não encontrado no payload'
      });
    }

    const emailNormalizado = emailComprador
      .trim()
      .toLowerCase();

    console.log('Evento:', evento);
    console.log('E-mail:', emailNormalizado);
    console.log('Status:', status);

    // Eventos que liberam ou renovam acesso
    const eventosQueLiberamAcesso = [
      'purchase_approved',
      'subscription_renewed'
    ];

    // Eventos que revogam acesso
    const eventosQueRevogamAcesso = [
      'subscription_canceled',
      'refund',
      'chargeback'
    ];

    // ==========================================
    // PAGAMENTO APROVADO / RENOVAÇÃO
    // ==========================================

    if (
      eventosQueLiberamAcesso.includes(evento) &&
      status === 'paid'
    ) {
      const agora = new Date();

      // Compra inicial = 30 dias
      // Renovação = 30 dias a partir de agora
      const dataExpiracao = new Date(
        agora.getTime() + 30 * 24 * 60 * 60 * 1000
      );

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
            data_inscricao: agora.toISOString(),
            data_expiracao: dataExpiracao.toISOString()
          })
        }
      );

      const texto = await resposta.text();

      let atualizados;

      try {
        atualizados = JSON.parse(texto);
      } catch {
        atualizados = [];
      }

      if (!resposta.ok) {
        console.error(
          'Erro Supabase:',
          resposta.status,
          texto
        );

        return res.status(500).json({
          error: 'Erro ao atualizar cafeteria'
        });
      }

      if (
        !Array.isArray(atualizados) ||
        atualizados.length === 0
      ) {
        return res.status(200).json({
          ok: true,
          aviso:
            'Pagamento recebido, mas nenhuma cafeteria foi encontrada com esse e-mail.'
        });
      }

      return res.status(200).json({
        ok: true,
        cafeteriaAtivada: emailNormalizado,
        dataExpiracao: dataExpiracao.toISOString()
      });
    }

    // ==========================================
    // REEMBOLSO / CHARGEBACK / CANCELAMENTO
    // ==========================================

    if (eventosQueRevogamAcesso.includes(evento)) {
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
            plano_ativo: false
          })
        }
      );

      if (!resposta.ok) {
        const erro = await resposta.text();

        console.error(
          'Erro ao desativar cafeteria:',
          erro
        );

        return res.status(500).json({
          error: 'Erro ao desativar cafeteria'
        });
      }

      return res.status(200).json({
        ok: true,
        cafeteriaDesativada: emailNormalizado
      });
    }

    // ==========================================
    // EVENTO IGNORADO
    // ==========================================

    return res.status(200).json({
      ok: true,
      ignorado: evento
    });

  } catch (err) {
    console.error(
      'Erro no webhook da Cakto:',
      err
    );

    return res.status(500).json({
      error: 'Erro interno ao processar webhook'
    });
  }
};
