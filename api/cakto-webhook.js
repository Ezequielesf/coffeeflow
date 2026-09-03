import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const evento = req.body || {};
    
    const eventId = evento.id || evento.event_id || evento.transaction_id || evento.data?.id || 'evt_' + Date.now();
    const statusPagamento = evento.status || evento.event || evento.type || evento.data?.status || 'approved';
    
    const customerEmail = (
      evento.customer?.email || 
      evento.email || 
      evento.client?.email || 
      evento.data?.customer?.email || 
      evento.data?.email || 
      ''
    ).trim().toLowerCase();

    if (!customerEmail) {
      console.warn('Webhook recebido sem e-mail do cliente:', JSON.stringify(evento));
      return res.status(200).json({ status: 'ignored', message: 'E-mail do cliente não encontrado no payload.' });
    }

    const { data: eventoExistente } = await supabaseAdmin
      .from('webhooks_processados')
      .select('id')
      .eq('event_id', String(eventId))
      .maybeSingle();

    if (eventoExistente) {
      return res.status(200).json({ status: 'ignored', message: 'Evento já processado anteriormente.' });
    }

    const statusStr = String(statusPagamento).toLowerCase();
    const eAprovado = statusStr.includes('approved') || statusStr.includes('paid') || statusStr.includes('renewed') || statusStr.includes('compra aprovada');

    if (eAprovado) {
      const { data: cafeteria, error: erroCafeteria } = await supabaseAdmin
        .from('cafeterias')
        .select('id, data_expiracao, plano_ativo')
        .or(`email.eq.${customerEmail},dono_email.eq.${customerEmail}`)
        .maybeSingle();

      if (erroCafeteria || !cafeteria) {
        console.warn(`Cafeteria não encontrada para o e-mail: ${customerEmail}`);
        return res.status(200).json({ status: 'warning', message: 'Cafeteria não localizada para este e-mail.' });
      }

      const agora = new Date();
      const expiracaoAtual = cafeteria.data_expiracao ? new Date(cafeteria.data_expiracao) : null;
      
      const base = (expiracaoAtual && expiracaoAtual > agora) ? expiracaoAtual : agora;
      const novaExpiracao = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

      const { error: erroUpdate } = await supabaseAdmin
        .from('cafeterias')
        .update({
          plano_ativo: true,
          data_expiracao: novaExpiracao.toISOString()
        })
        .eq('id', cafeteria.id);

      if (erroUpdate) throw erroUpdate;
    }

    await supabaseAdmin
      .from('webhooks_processados')
      .insert([{ event_id: String(eventId), processado_em: new Date().toISOString() }])
      .catch(() => {});

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erro crítico no webhook da Cakto:', err);
    return res.status(500).json({ error: 'Erro interno ao processar webhook', details: err.message });
  }
}
