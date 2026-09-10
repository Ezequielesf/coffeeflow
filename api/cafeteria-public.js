import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Método não permitido.'
    });
  }

  try {
    const id = String(req.query?.id || '').trim();

    if (!id) {
      return res.status(400).json({
        error: 'ID da cafeteria não informado.'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('cafeterias')
      .select(`
        id,
        nome,
        plano_ativo,
        data_expiracao
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar cafeteria pública:', error);

      return res.status(500).json({
        error: 'Não foi possível carregar a cafeteria.'
      });
    }

    if (!data) {
      return res.status(404).json({
        error: 'Cafeteria não encontrada.'
      });
    }

    const planoValido =
      data.plano_ativo === true &&
      data.data_expiracao &&
      new Date(data.data_expiracao) > new Date();

    if (!planoValido) {
      return res.status(403).json({
        error: 'O plano desta cafeteria não está ativo.'
      });
    }

    return res.status(200).json({
      cafeteria: {
        id: data.id,
        nome: data.nome,
        planoAtivo: true,
        dataExpiracao: data.data_expiracao
      }
    });

  } catch (error) {
    console.error('Erro interno em cafeteria-public:', error);

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    });
  }
}
