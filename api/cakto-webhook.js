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
    const payload = req.body || {};
    
    // Validação correta do secret enviado pela Cakto no corpo JSON (se configurado na Vercel)
    const expectedSecret = process.env.CAKTO_WEBHOOK_SECRET;
    if (expectedSecret && payload.secret && payload.secret !== expectedSecret) {
      console.warn('Tentativa de webhook com secret incorreto.');
      return.status(200).json({ received: true, warning: 'Secret inválido' });
    }

    const evento = payload.data || payload;
    
    const eventId = evento.id || payload.id || evento.event_id || evento.transaction_id || 'evt_' + Date.now();
    const statusPagamento = evento.status || payload.status || evento.event || evento.type || 'approved';
    
    const customerEmail = (
      evento.customer?.email || 
      payload.customer?.email || 
      evento.email || 
      payload.email || 
      evento.client?.email || 
      payload.client?.email || 
      ''
    ).trim().toLowerCase();

    if (!customerEmail) {
      console.warn('Webhook recebido sem e-mail do cliente:', JSON.stringify(payload));
      return res.status(200).json({ received: true, warning: 'E-mail não encontrado' });
    }

    const { data: eventoExistente } = await supabaseAdmin
      .from('webhooks_processados')
      .select('id')
      .eq('event_id', String(eventId))
      .maybeSingle();

    if (eventoExistente) {
      return res.status(200).json({ received: true, message: 'Evento já processado' });
    }

    const statusStr = String(statusPagamento).toLowerCase();
    const eAprovado = statusStr.includes('approved') || statusStr.includes('paid') || statusStr.includes('renewed') || statusStr.includes('compra aprovada') || statusStr.includes('purchase_approved');

    if (eAprovado) {
      const { data: cafeteria, error: erroCafeteria } = await supabaseAdmin
        .from('cafeterias')
        .select('id, data_expiracao, plano_ativo')
        .or(`email.eq.${customerEmail},dono_email.eq.${customerEmail}`)
        .maybeSingle();

      if (erroCafeteria || !cafeteria) {
        console.warn(`Cafeteria não encontrada para o e-mail: ${customerEmail}`);
        return res.status(200).json({ received: true, warning: 'Cafeteria não localizada' });
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

    return res.status(200).json({ received: true, success: true });
  } catch (err) {
    console.error('Erro crítico no webhook da Cakto:', err);
    return res.status(500).json({ error: 'Erro interno', details: err.message });
  }
}
