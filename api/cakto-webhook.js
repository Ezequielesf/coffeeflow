import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.SUPABASE_URL ||
  'https://tuecuhzmsyauzkdclrdv.supabase.co';

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY não configurada.'
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

// Regras da assinatura
const DIAS_ASSINATURA = 30;
const DIAS_MINIMOS_PARA_RENOVAR = 15;
const DIAS_MAXIMOS = 60;

export default async function handler(req, res) {
  // Aceita somente POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const event = req.body;

    console.log(
      'Cakto webhook recebido:',
      JSON.stringify(event)
    );

    // Identifica o tipo do evento
    const eventType =
      event?.event ||
      event?.type ||
      event?.event_type ||
      event?.custom_id;

    // Procura o e-mail do cliente
    const customerEmail =
      event?.customer?.email ||
      event?.data?.customer?.email ||
      event?.customer_email ||
      event?.email ||
      event?.data?.email;

    console.log('Evento:', eventType);
    console.log('E-mail:', customerEmail);

    // Eventos considerados como compra aprovada
    const isPurchaseApproved =
      eventType === 'purchase_approved' ||
      eventType === 'approved' ||
      eventType === 'order.paid' ||
      eventType === 'Compra aprovada';

    // Ignora outros eventos
    if (!isPurchaseApproved) {
      console.log(
        `Evento ignorado: ${eventType}`
      );

      return res.status(200).json({
        received: true,
        processed: false,
        reason: 'Event not handled'
      });
    }

    // Compra aprovada sem e-mail
    if (!customerEmail) {
      console.error(
        'Compra aprovada recebida, mas nenhum e-mail foi encontrado.'
      );

      return res.status(200).json({
        received: true,
        processed: false,
        reason: 'Customer email not found'
      });
    }

    const cleanEmail = String(customerEmail)
      .trim()
      .toLowerCase();

    // Busca a cafeteria pelo e-mail
    const { data: cafeteria, error: searchError } =
      await supabase
        .from('cafeterias')
        .select(
          'id, email, plano_ativo, data_expiracao'
        )
        .eq('email', cleanEmail)
        .maybeSingle();

    if (searchError) {
      console.error(
        'Erro ao buscar cafeteria:',
        searchError.message
      );

      return res.status(500).json({
        received: true,
        processed: false,
        error: 'Failed to find cafeteria'
      });
    }

    // Cafeteria não encontrada
    if (!cafeteria) {
      console.warn(
        `Nenhuma cafeteria encontrada para o e-mail: ${cleanEmail}`
      );

      return res.status(200).json({
        received: true,
        processed: false,
        reason: 'Cafeteria not found'
      });
    }

    /*
     * =====================================================
     * CONTROLE DA ASSINATURA
     * =====================================================
     *
     * Regras:
     *
     * - Até 15 dias restantes:
     *   pagamento pode adicionar +30 dias.
     *
     * - Mais de 15 dias restantes:
     *   pagamento NÃO concede novos dias.
     *
     * - Assinatura expirada:
     *   +30 dias a partir de agora.
     *
     * - Nunca permitir mais de 60 dias acumulados.
     */

    const agora = new Date();

    let diasRestantes = 0;
    let expiracaoAtual = null;

    if (cafeteria.data_expiracao) {
      expiracaoAtual =
        new Date(cafeteria.data_expiracao);

      if (expiracaoAtual > agora) {
        diasRestantes = Math.ceil(
          (
            expiracaoAtual.getTime() -
            agora.getTime()
          ) /
          (24 * 60 * 60 * 1000)
        );
      }
    }

    console.log(
      'Dias restantes antes da renovação:',
      diasRestantes
    );

    /*
     * =====================================================
     * BLOQUEIO DE RENOVAÇÃO ANTECIPADA
     * =====================================================
     *
     * Se ainda houver mais de 15 dias,
     * não concedemos os 30 dias.
     *
     * Isso protege o CoffeeFlow mesmo que
     * o cliente entre diretamente no checkout
     * da Cakto.
     */

    if (diasRestantes > DIAS_MINIMOS_PARA_RENOVAR) {
      console.warn(
        `Renovação antecipada recusada para ${cleanEmail}. ` +
        `${diasRestantes} dias restantes.`
      );

      return res.status(200).json({
        received: true,
        processed: false,
        renewal_allowed: false,
        reason: 'Renewal only allowed with 15 days or less remaining',
        days_remaining: diasRestantes
      });
    }

    /*
     * =====================================================
     * CALCULA NOVA EXPIRAÇÃO
     * =====================================================
     */

    let dataBase = agora;

    // Se ainda possui dias, preserva todos eles.
    if (
      expiracaoAtual &&
      expiracaoAtual > agora
    ) {
      dataBase = expiracaoAtual;
    }

    let novaDataExpiracao = new Date(
      dataBase.getTime() +
      DIAS_ASSINATURA *
      24 *
      60 *
      60 *
      1000
    );

    /*
     * =====================================================
     * LIMITE ABSOLUTO DE 60 DIAS
     * =====================================================
     */

    const limiteMaximo = new Date(
      agora.getTime() +
      DIAS_MAXIMOS *
      24 *
      60 *
      60 *
      1000
    );

    if (novaDataExpiracao > limiteMaximo) {
      console.warn(
        `Limite de ${DIAS_MAXIMOS} dias atingido.`
      );

      novaDataExpiracao = limiteMaximo;
    }

    const novaDataExpiracaoIso =
      novaDataExpiracao.toISOString();

    console.log(
      'Data de expiração anterior:',
      cafeteria.data_expiracao
    );

    console.log(
      'Dias restantes:',
      diasRestantes
    );

    console.log(
      'Nova data de expiração:',
      novaDataExpiracaoIso
    );

    /*
     * =====================================================
     * ATUALIZA A ASSINATURA
     * =====================================================
     */

    const { error: updateError } =
      await supabase
        .from('cafeterias')
        .update({
          plano_ativo: true,
          data_expiracao:
            novaDataExpiracaoIso
        })
        .eq('id', cafeteria.id);

    if (updateError) {
      console.error(
        'Erro ao atualizar cafeteria no Supabase:',
        updateError.message
      );

      return res.status(500).json({
        received: true,
        processed: false,
        error: 'Supabase update failed'
      });
    }

    console.log(
      `Plano renovado com sucesso para ${cleanEmail}`
    );

    console.log(
      `Dias anteriores: ${diasRestantes}`
    );

    console.log(
      `Dias adicionados: ${DIAS_ASSINATURA}`
    );

    console.log(
      `Nova data de expiração: ${novaDataExpiracaoIso}`
    );

    return res.status(200).json({
      received: true,
      processed: true,
      renewal_allowed: true,
      email: cleanEmail,
      plano_ativo: true,
      previous_days_remaining: diasRestantes,
      days_added: DIAS_ASSINATURA,
      data_expiracao: novaDataExpiracaoIso
    });

  } catch (error) {
    console.error(
      'Erro interno no webhook:',
      error
    );

    return res.status(500).json({
      received: false,
      error: 'Internal server error'
    });
  }
}
