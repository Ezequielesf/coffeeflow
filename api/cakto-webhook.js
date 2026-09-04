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
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    // ============================================================
    // 1. RECEBER PAYLOAD
    // ============================================================

    const payload = req.body || {};

    console.log('========== CAKTO WEBHOOK ==========');
    console.log(
      'PAYLOAD COMPLETO:',
      JSON.stringify(payload, null, 2)
    );

    // ============================================================
    // 2. VALIDAR SECRET
    // ============================================================

    const expectedSecret = process.env.CAKTO_WEBHOOK_SECRET;

    if (
      expectedSecret &&
      payload.secret &&
      payload.secret !== expectedSecret
    ) {
      console.warn('Secret inválido.');

      return res.status(401).json({
        error: 'Invalid secret'
      });
    }

    // ============================================================
    // 3. IDENTIFICAR EVENTO
    // ============================================================

    const evento = payload.data || payload;

    console.log(
      'EVENTO:',
      JSON.stringify(evento, null, 2)
    );

    // ============================================================
    // 4. EVENT ID
    // ============================================================

    const eventId =
      evento.id ||
      payload.id ||
      evento.event_id ||
      payload.event_id ||
      evento.transaction_id ||
      payload.transaction_id;

    if (!eventId) {
      console.warn(
        'Webhook sem ID de evento.'
      );

      return res.status(400).json({
        error: 'Event ID não encontrado'
      });
    }

    console.log(
      'EVENT ID:',
      String(eventId)
    );

    // ============================================================
    // 5. STATUS
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
      'STATUS ORIGINAL:',
      statusPagamento
    );

    console.log(
      'STATUS NORMALIZADO:',
      statusStr
    );

    // ============================================================
    // 6. EMAIL
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

    console.log(
      'EMAIL ENCONTRADO:',
      customerEmail
    );

    if (!customerEmail) {
      console.warn(
        'Nenhum email encontrado no payload.'
      );

      return res.status(400).json({
        error: 'E-mail não encontrado'
      });
    }

    // ============================================================
    // 7. VERIFICAR DUPLICIDADE
    // ============================================================

    console.log(
      'Verificando evento no Supabase...'
    );

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
        'ERRO SUPABASE - verificar evento:',
        erroEventoExistente
      );

      throw erroEventoExistente;
    }

    if (eventoExistente) {
      console.log(
        'Evento já processado.'
      );

      return res.status(200).json({
        received: true,
        success: true,
        message: 'Evento já processado'
      });
    }

    // ============================================================
    // 8. VERIFICAR PAGAMENTO
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
      'PAGAMENTO APROVADO:',
      eAprovado
    );

    if (!eAprovado) {
      console.log(
        'Pagamento não aprovado. Apenas registrando evento.'
      );

      const {
        error: erroRegistroNaoAprovado
      } = await supabaseAdmin
        .from('webhooks_processados')
        .insert([
          {
            event_id: String(eventId),
            processado_em: new Date().toISOString()
          }
        ]);

      if (erroRegistroNaoAprovado) {
        console.error(
          'ERRO AO REGISTRAR EVENTO:',
          erroRegistroNaoAprovado
        );

        throw erroRegistroNaoAprovado;
      }

      return res.status(200).json({
        received: true,
        success: true,
        message: 'Evento recebido, sem ativação'
      });
    }

    // ============================================================
    // 9. BUSCAR CAFETERIA PELO EMAIL
    // ============================================================

    console.log(
      'Procurando cafeteria pelo email:',
      customerEmail
    );

    let cafeteria = null;

    const {
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
        'ERRO SUPABASE - busca por email:',
        erroBuscaEmail
      );

      throw erroBuscaEmail;
    }

    cafeteria = cafeteriaPorEmail;

    // ============================================================
    // 10. BUSCAR PELO DONO EMAIL
    // ============================================================

    if (!cafeteria) {
      console.log(
        'Não encontrado por email. Tentando "dono email"...'
      );

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
          'ERRO SUPABASE - busca por dono email:',
          erroBuscaDonoEmail
        );

        throw erroBuscaDonoEmail;
      }

      cafeteria = cafeteriaPorDonoEmail;
    }

    // ============================================================
    // 11. CAFETERIA NÃO ENCONTRADA
    // ============================================================

    if (!cafeteria) {
      console.warn(
        'CAFETERIA NÃO ENCONTRADA:',
        customerEmail
      );

      return res.status(200).json({
        received: true,
        success: false,
        warning: 'Cafeteria não localizada'
      });
    }

    console.log(
      'CAFETERIA ENCONTRADA:',
      JSON.stringify(cafeteria, null, 2)
    );

    // ============================================================
    // 12. CALCULAR EXPIRAÇÃO
    // ============================================================

    const agora = new Date();

    const expiracaoAtual = cafeteria.data_expiracao
      ? new Date(cafeteria.data_expiracao)
      : null;

    let base;

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
      'NOVA EXPIRAÇÃO:',
      novaExpiracao.toISOString()
    );

    // ============================================================
    // 13. ATIVAR PLANO
    // ============================================================

    console.log(
      'Atualizando cafeteria...'
    );

    const {
      data: cafeteriaAtualizada,
      error: erroUpdate
    } = await supabaseAdmin
      .from('cafeterias')
      .update({
        plano_ativo: true,
        data_expiracao: novaExpiracao.toISOString()
      })
      .eq('id', cafeteria.id)
      .select('id, email, "dono email", plano_ativo, data_expiracao')
      .maybeSingle();

    if (erroUpdate) {
      console.error(
        'ERRO SUPABASE - atualizar cafeteria:',
        erroUpdate
      );

      throw erroUpdate;
    }

    console.log(
      'CAFETERIA ATUALIZADA:',
      JSON.stringify(cafeteriaAtualizada, null, 2)
    );

    // ============================================================
    // 14. REGISTRAR EVENTO
    // ============================================================

    console.log(
      'Registrando webhook como processado...'
    );

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
        'ERRO SUPABASE - registrar webhook:',
        erroRegistro
      );

      throw erroRegistro;
    }

    console.log(
      '========== WEBHOOK CONCLUÍDO COM SUCESSO =========='
    );

    return res.status(200).json({
      received: true,
      success: true,
      message: 'Pagamento processado e plano ativado',
      cafeteria_id: cafeteria.id,
      data_expiracao: novaExpiracao.toISOString()
    });

  } catch (err) {

    console.error(
      '========== ERRO CRÍTICO CAKTO =========='
    );

    console.error(
      'Mensagem:',
      err?.message
    );

    console.error(
      'Erro completo:',
      err
    );

    return res.status(500).json({
      error: 'Erro interno',
      details: err?.message || 'Erro desconhecido'
    });
  }
}
