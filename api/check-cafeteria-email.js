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
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método não permitido.'
    });
  }

  try {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    if (!email) {
      return res.status(400).json({
        error: 'E-mail obrigatório.'
      });
    }

    const {
      data,
      error
    } = await supabaseAdmin
      .from('cafeterias')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error(
        'Erro ao verificar cafeteria por e-mail:',
        error
      );

      return res.status(500).json({
        error: 'Não foi possível verificar o e-mail.'
      });
    }

    return res.status(200).json({
      exists: Boolean(data)
    });

  } catch (error) {
    console.error(
      'Erro em /api/check-cafeteria-email:',
      error
    );

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    });
  }
}
