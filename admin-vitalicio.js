import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';
    const pin = String(req.body?.pin || '').trim();

    if (!token) return res.status(401).json({ error: 'Sessão não autenticada.' });
    if (!pin) return res.status(400).json({ error: 'PIN administrativo obrigatório.' });
    if (!process.env.ADMIN_MASTER_PIN) {
      return res.status(500).json({ error: 'ADMIN_MASTER_PIN não configurado no servidor.' });
    }
    if (pin !== process.env.ADMIN_MASTER_PIN) {
      return res.status(403).json({ error: 'PIN Secreto inválido.' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    const userId = authData.user.id;
    const { data: cafeteria, error: cafeteriaError } = await supabaseAdmin
      .from('cafeterias')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (cafeteriaError) {
      console.error('Erro ao localizar cafeteria:', cafeteriaError);
      return res.status(500).json({ error: 'Não foi possível localizar sua cafeteria.' });
    }
    if (!cafeteria) {
      return res.status(404).json({ error: 'Nenhuma cafeteria vinculada a esta conta.' });
    }

    const dataVitalicia = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('cafeterias')
      .update({ plano_ativo: true, data_expiracao: dataVitalicia })
      .eq('id', cafeteria.id)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Erro ao atualizar plano vitalício:', updateError);
      return res.status(500).json({ error: 'Não foi possível atualizar a licença.' });
    }

    return res.status(200).json({ ok: true, data_expiracao: dataVitalicia });
  } catch (error) {
    console.error('Erro interno em admin-vitalicio:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}
