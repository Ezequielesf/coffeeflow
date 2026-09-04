import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.SUPABASE_URL ||
  'https://tuecuhzmsyauzkdclrdv.supabase.co';

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
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

    console.log('Cakto webhook recebido:', JSON.stringify(event));

    // Tipo do evento enviado pela Cakto
    const eventType =
      event?.event ||
      event?.type ||
      event?.event_type ||
      event?.custom_id;

    // Procura o e-mail nos formatos mais comuns
    const customerEmail =
      event?.customer?.email ||
      event?.data?.customer?.email ||
      event?.customer_email ||
      event?.email ||
      event?.data?.email;

    console.log('Evento:', eventType);
    console.log('E-mail:', customerEmail);

    // Compra aprovada
    const isPurchaseApproved =
      eventType === 'purchase_approved' ||
      eventType === 'approved' ||
      eventType === 'order.paid' ||
      eventType === 'Compra aprovada';

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

    // 30 dias de acesso
    const novaDataExpiracao = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Ativa a cafeteria
    const { data, error } = await supabase
      .from('cafeterias')
      .update({
        plano_ativo: true,
        data_expiracao: novaDataExpiracao
      })
      .eq('email', cleanEmail)
      .select();

    if (error) {
      console.error(
        'Erro ao atualizar cafeteria no Supabase:',
        error.message
      );

      return res.status(500).json({
        received: true,
        processed: false,
        error: 'Supabase update failed'
      });
    }

    // Nenhuma cafeteria encontrada
    if (!data || data.length === 0) {
      console.warn(
        `Nenhuma cafeteria encontrada para o e-mail: ${cleanEmail}`
      );

      return res.status(200).json({
        received: true,
        processed: false,
        reason: 'Cafeteria not found'
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
