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
        .select('id, email, plano_ativo, data_expiracao')
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
     * CÁLCULO DA NOVA DATA DE EXPIRAÇÃO
     * =====================================================
     *
     * Se a cafeteria ainda possui dias restantes:
     *
     * data atual:       04/09
     * expiração atual:  14/09
     * nova assinatura:  +30 dias
     * nova expiração:   14/10
     *
     * Ou seja, os 10 dias restantes NÃO são perdidos.
     *
     * Se a assinatura já expirou:
     *
     * data atual:       04/09
     * expiração antiga: 01/09
     * nova assinatura:  +30 dias
     * nova expiração:   04/10
     */

    const agora = new Date();

    let dataBase = agora;

    if (cafeteria.data_expiracao) {
      const expiracaoAtual =
        new Date(cafeteria.data_expiracao);

      // Só usa a data antiga se ela ainda estiver válida
      if (expiracaoAtual > agora) {
        dataBase = expiracaoAtual;
      }
    }

    // Adiciona 30 dias à data-base
    const novaDataExpiracao = new Date(
      dataBase.getTime() +
      30 * 24 * 60 * 60 * 1000
    ).toISOString();

    console.log(
      'Data de expiração anterior:',
      cafeteria.data_expiracao
    );

    console.log(
      'Nova data de expiração:',
      novaDataExpiracao
    );

    // Atualiza a assinatura
    const { error: updateError } =
      await supabase
        .from('cafeterias')
        .update({
          plano_ativo: true,
          data_expiracao: novaDataExpiracao
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
      `Plano ativado com sucesso para ${cleanEmail}`
    );

    console.log(
      `Nova data de expiração: ${novaDataExpiracao}`
    );

    return res.status(200).json({
      received: true,
      processed: true,
      email: cleanEmail,
      plano_ativo: true,
      data_expiracao: novaDataExpiracao
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
