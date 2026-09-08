const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL ||
  'https://tuecuhzmsyauzkdclrdv.supabase.co';

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY não configurada.'
  );
}

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function send(res, status, body) {
  return res.status(status).json(body);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return send(res, 405, {
      error: 'Método não permitido.'
    });
  }

  try {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    if (!email) {
      return send(res, 400, {
        error: 'E-mail obrigatório.'
      });
    }

    // Procura o usuário no Supabase Auth.
    // Não usamos a tabela cafeterias como fonte de verdade.
    let page = 1;
    const perPage = 1000;

    while (true) {
      const {
        data,
        error
      } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });

      if (error) {
        console.error(
          '[check-account] Erro ao consultar usuários:',
          error
        );

        return send(res, 500, {
          error:
            'Não foi possível verificar a conta.',
          code: error.code || null
        });
      }

      const users = data?.users || [];

      const user = users.find(
        item =>
          (item.email || '').trim().toLowerCase() === email
      );

      if (user) {
        return send(res, 200, {
          exists: true
        });
      }

      if (
        users.length < perPage ||
        page >= (data?.totalPages || page)
      ) {
        break;
      }

      page++;
    }

    return send(res, 200, {
      exists: false
    });

  } catch (error) {
    console.error(
      '[check-account] Erro inesperado:',
      error
    );

    return send(res, 500, {
      error:
        error?.message ||
        'Erro interno ao verificar a conta.'
    });
  }
};
