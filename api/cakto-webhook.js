import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false
    }
  }
);

export default async function handler(req, res) {
  // ============================================================
  // 1. ACEITAR SOMENTE POST
  // ============================================================

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    // ============================================================
    // 2. RECEBER PAYLOAD
    // ============================================================

    const payload = req.body || {};

    console.log(
      'Webhook Cakto recebido:',
      JSON.stringify(payload)
    );

    // ============================================================
    // 3. VALIDAR SECRET
    // ============================================================

    const expectedSecret = process.env.CAKTO_WEBHOOK_SECRET;

    if (
      expectedSecret &&
      payload.secret &&
      payload.secret !== expectedSecret
    ) {
      console.warn(
        'Tentativa de webhook com secret incorreto.'
      );

      // Retornamos 200 para evitar reenvios desnecessários
      // da Cakto.
      return res.status(200).json({
        received: true,
        warning: 'Secret inválido'
      });
    }

    // ============================================================
    // 4. IDENTIFICAR OBJETO DO EVENTO
    // ============================================================

    const evento = payload.data || payload;

    // ============================================================
    // 5. ID DO EVENTO
    // ============================================================

    const eventId =
      evento.id ||
      payload.id ||
      evento.event_id ||
      payload.event_id ||
      evento.transaction_id ||
      payload.transaction_id ||
      `evt_${Date.now()}`;

    // ============================================================
    // 6. STATUS DO PAGAMENTO
    // ============================================================

    const statusPagamento =
      evento.status ||
      payload.status ||
      evento.event ||
      payload.event ||
      evento.type ||
      payload.type ||
      '';

    const statusStr = String(statusPagamento)
      .trim()
      .toLowerCase();

    console.log(
      'Evento:',
      String(eventId)
    );

    console.log(
      'Status:',
      statusStr
    );

    // ============================================================
    // 7. LOCALIZAR E-MAIL DO CLIENTE
    // ============================================================

    const customerEmail = String(
      evento.customer?.email ||
      payload.customer?.email ||
      evento.client?.email ||
      payload.client?.email ||
      evento.email ||
      payload.email ||
      ''
    )
      .trim()
      .toLowerCase();

    if (!customerEmail) {
      console.warn(
        'Webhook recebido sem e-mail:',
        JSON.stringify(payload)
      );

      return res.status(200).json({
        received: true,
        warning: 'E-mail não encontrado'
      });
    }

    console.log(
      'E-mail do cliente:',
      customerEmail
    );

    // ============================================================
    // 8. VERIFICAR SE O EVENTO JÁ FOI PROCESSADO
    // ============================================================

    const {
      data: eventoExistente,
      error: erroEventoExistente
    } = await supabaseAdmin
      .from('webhooks_processados')
      .select('id')
      .eq('event_id', String(eventId))
      .maybeSingle();

    if (erroEventoExistente) {
      console.error(
        'Erro ao verificar evento:',
        erroEventoExistente
      );

      throw erroEventoExistente;
    }

    if (eventoExistente) {
      console.log(
        'Evento já processado:',
        String(eventId)
      );

      return res.status(200).json({
        received: true,
        message: 'Evento já processado'
      });
    }

    // ============================================================
    // 9. VERIFICAR SE O PAGAMENTO FOI APROVADO
    // ============================================================

    const eAprovado =
      statusStr.includes('approved') ||
      statusStr.includes('paid') ||
      statusStr.includes('renewed') ||
      statusStr.includes('purchase_approved') ||
      statusStr.includes('compra aprovada') ||
      statusStr === 'completed' ||
      statusStr === 'complete' ||
      statusStr === 'success' ||
      statusStr === 'successful';

    console.log(
      'Pagamento aprovado:',
      eAprovado
    );

    // ============================================================
    // 10. SE NÃO FOR APROVADO, REGISTRAR EVENTO E ENCERRAR
    // ============================================================

    if (!eAprovado) {
      console.log(
        'Evento recebido, mas não é pagamento aprovado.'
      );

      await supabaseAdmin
        .from('webhooks_processados')
        .insert([
          {
            event_id: String(eventId),
            processado_em: new Date().toISOString()
          }
        ]);

      return res.status(200).json({
        received: true,
        success: true,
        message: 'Evento recebido, sem ativação'
      });
    }

    // ============================================================
    // 11. PROCURAR CAFETERIA PELO CAMPO email
    // ============================================================

    let cafeteria = null;

    let {
      data: cafeteriaPorEmail,
      error: erroBuscaEmail
    } = await supabaseAdmin
      .from('cafeterias')
      .select(
        'id, email, "dono email", data_expiracao, plano_ativo'
      )
      .ilike('email', customerEmail)
      .maybeSingle();

    if (erroBuscaEmail) {
      console.error(
        'Erro ao procurar cafeteria pelo email:',
        erroBuscaEmail
      );

      throw erroBuscaEmail;
    }

    cafeteria = cafeteriaPorEmail;

    // ============================================================
    // 12. SE NÃO ENCONTROU, PROCURAR PELO "dono email"
    // ============================================================

    if (!cafeteria) {
      const {
        data: cafeteriaPorDonoEmail,
        error: erroBuscaDonoEmail
      } = await supabaseAdmin
        .from('cafeterias')
        .select(
          'id, email, "dono email", data_expiracao, plano_ativo'
        )
        .ilike('"dono email"', customerEmail)
        .maybeSingle();

      if (erroBuscaDonoEmail) {
        console.error(
          'Erro ao procurar pelo dono email:',
          erroBuscaDonoEmail
        );

        throw erroBuscaDonoEmail;
      }

      cafeteria = cafeteriaPorDonoEmail;
    }

    // ============================================================
    // 13. CAFETERIA NÃO ENCONTRADA
    // ============================================================

    if (!cafeteria) {
      console.warn(
        `Cafeteria não encontrada para: ${customerEmail}`
      );

      return res.status(200).json({
        received: true,
        warning: 'Cafeteria não localizada'
      });
    }

    console.log(
      'Cafeteria encontrada:',
      cafeteria.id
    );

    // ============================================================
    // 14. CALCULAR NOVA EXPIRAÇÃO
    // ============================================================

    const agora = new Date();

    const expiracaoAtual = cafeteria.data_expiracao
      ? new Date(cafeteria.data_expiracao)
      : null;

    let base;

    // Se ainda está ativo:
    // acrescenta 30 dias à validade existente.
    //
    // Se já expirou ou não possui data:
    // começa a contar 30 dias a partir de agora.

    if (
      expiracaoAtual &&
      !isNaN(expiracaoAtual.getTime()) &&
      expiracaoAtual > agora
    ) {
      base = expiracaoAtual;
    } else {
      base = agora;
    }

    const novaExpiracao = new Date(
      base.getTime() +
      30 * 24 * 60 * 60 * 1000
    );

    console.log(
      'Expiração anterior:',
      cafeteria.data_expiracao
    );

    console.log(
      'Nova expiração:',
      novaExpiracao.toISOString()
    );

    // ============================================================
    // 15. ATIVAR PLANO
    // ============================================================

    const {
      error: erroUpdate
    } = await supabaseAdmin
      .from('cafeterias')
      .update({
        plano_ativo: true,
        data_expiracao: novaExpiracao.toISOString()
      })
      .eq('id', cafeteria.id);

    if (erroUpdate) {
      console.error(
        'Erro ao ativar plano:',
        erroUpdate
      );

      throw erroUpdate;
    }

    console.log(
      `Plano ativado com sucesso para ${customerEmail}`
    );

    // ============================================================
    // 16. REGISTRAR WEBHOOK COMO PROCESSADO
    // ============================================================

    const {
      error: erroRegistro
    } = await supabaseAdmin
      .from('webhooks_processados')
      .insert([
        {
          event_id: String(eventId),
          processado_em: new Date().toISOString()
        }
      ]);

    if (erroRegistro) {
      console.error(
        'Erro ao registrar webhook:',
        erroRegistro
      );

      // O pagamento já foi processado.
      // Não retornamos 500 por causa apenas do log.
    }

    // ============================================================
    // 17. RESPOSTA FINAL
    // ============================================================

    return res.status(200).json({
      received: true,
      success: true,
      message: 'Pagamento processado e plano ativado',
      cafeteria_id: cafeteria.id,
      data_expiracao: novaExpiracao.toISOString()
    });

  } catch (err) {

    // ============================================================
    // 18. ERRO CRÍTICO
    // ============================================================

    console.error(
      'Erro crítico no webhook da Cakto:',
      err
    );

    return res.status(500).json({
      error: 'Erro interno',
      details: err?.message || 'Erro desconhecido'
    });
  }
}
