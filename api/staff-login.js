import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const pin = String(req.body?.pin || '').trim();
    if (!pin) return res.status(400).json({ error: 'PIN obrigatório.' });

    const { data, error } = await supabaseAdmin
      .from('cafeterias')
      .select('id, nome, plano_ativo, data_inscricao, data_expiracao')
      .eq('pin_equipe', pin)
      .maybeSingle();

    if (error) {
      console.error('Erro ao validar PIN da equipe:', error);
      return res.status(500).json({ error: 'Não foi possível validar o PIN.' });
    }
    if (!data) return res.status(401).json({ error: 'PIN de acesso incorreto.' });

    const ativo = data.plano_ativo === true && data.data_expiracao && new Date(data.data_expiracao) > new Date();
    if (!ativo) return res.status(403).json({ error: 'O plano desta cafeteria está expirado.' });

    return res.status(200).json({
      cafeteria: {
        id: data.id,
        nome: data.nome,
        plano_ativo: true,
        data_inscricao: data.data_inscricao,
        data_expiracao: data.data_expiracao
      }
    });
  } catch (error) {
    console.error('Erro interno em staff-login:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}
