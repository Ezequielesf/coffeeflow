const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL ||
  'https://tuecuhzmsyauzkdclrdv.supabase.co';

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
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
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    res.setHeader('Allow', 'DELETE, POST');

    return send(res, 405, {
      error: 'Método não permitido.'
    });
  }

  try {
    // =========================================================
    // 1. Pegar o token da sessão
    // =========================================================

    const authorization = req.headers.authorization || '';

    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return send(res, 401, {
        error: 'Sessão não fornecida.'
      });
    }

    const accessToken = match[1];

    // =========================================================
    // 2. Validar o usuário no Supabase Auth
    // =========================================================

    const {
      data: { user },
      error: authError
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !user) {
      return send(res, 401, {
        error: 'Sessão inválida ou expirada.'
      });
    }

    // =========================================================
    // 3. Apagar todos os dados da cafeteria
    //    usando uma transação SQL
    // =========================================================

    const { data: deleteResult, error: deleteDataError } =
      await supabaseAdmin.rpc(
        'excluir_dados_cafeteria',
        {
          p_user_id: user.id
        }
      );

    if (deleteDataError) {
      console.error(
        'Erro ao excluir dados da cafeteria:',
        deleteDataError
      );

      return send(res, 500, {
        error:
          'Não foi possível excluir os dados da cafeteria.'
      });
    }

    // =========================================================
    // 4. Depois que os dados foram apagados com sucesso,
    //    remover o usuário do Supabase Auth
    // =========================================================

    const { error: deleteUserError } =
      await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      console.error(
        'Erro ao excluir usuário do Auth:',
        deleteUserError
      );

      return send(res, 500, {
        error:
          'Os dados da cafeteria foram excluídos, mas não foi possível remover o acesso da conta. Entre em contato com o suporte.'
      });
    }

    // =========================================================
    // 5. Sucesso
    // =========================================================

    return send(res, 200, {
      ok: true,
      message:
        'Conta, dados e acesso excluídos permanentemente.'
    });

  } catch (error) {
    console.error(
      'Erro inesperado em delete-account:',
      error
    );

    return send(res, 500, {
      error: 'Erro interno ao excluir a conta.'
    });
  }
};
