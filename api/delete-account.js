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
  // =========================================================
  // SOMENTE DELETE
  // =========================================================

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');

    return send(res, 405, {
      error: 'Método não permitido.'
    });
  }

  try {
    // =========================================================
    // 1. PEGAR TOKEN DA SESSÃO
    // =========================================================

    const authorization =
      req.headers.authorization || '';

    const match =
      authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return send(res, 401, {
        error: 'Sessão não fornecida.'
      });
    }

    const accessToken = match[1];

    // =========================================================
    // 2. VALIDAR USUÁRIO NO SUPABASE AUTH
    // =========================================================

    const {
      data: { user },
      error: authError
    } = await supabaseAdmin.auth.getUser(
      accessToken
    );

    if (authError || !user) {
      console.error(
        'Erro ao validar sessão:',
        authError
      );

      return send(res, 401, {
        error:
          authError?.message ||
          'Sessão inválida ou expirada.',
        code: authError?.code || null
      });
    }

    console.log(
      'Iniciando exclusão da conta:',
      user.id
    );

    // =========================================================
    // 3. EXCLUIR DADOS DA CAFETERIA
    // =========================================================

    const {
      data: deleteResult,
      error: deleteDataError
    } = await supabaseAdmin.rpc(
      'excluir_dados_cafeteria',
      {
        p_user_id: user.id
      }
    );

    if (deleteDataError) {
      console.error(
        'Erro no RPC excluir_dados_cafeteria:',
        deleteDataError
      );

      return send(res, 500, {
        error:
          `Erro ao excluir os dados: ${
            deleteDataError.message ||
            'erro desconhecido'
          }`,
        code:
          deleteDataError.code || null,
        details:
          deleteDataError.details || null,
        hint:
          deleteDataError.hint || null
      });
    }

    console.log(
      'Dados da cafeteria excluídos:',
      deleteResult
    );

    // =========================================================
    // 4. EXCLUIR USUÁRIO DO SUPABASE AUTH
    // =========================================================

    const {
      error: deleteUserError
    } =
      await supabaseAdmin.auth.admin.deleteUser(
        user.id
      );

    if (deleteUserError) {
      console.error(
        'Erro ao excluir usuário do Auth:',
        deleteUserError
      );

      return send(res, 500, {
        error:
          `Os dados da cafeteria foram excluídos, ` +
          `mas ocorreu um erro ao remover a conta: ${
            deleteUserError.message ||
            'erro desconhecido'
          }`,
        code:
          deleteUserError.code || null,
        details:
          deleteUserError.details || null
      });
    }

    // =========================================================
    // 5. SUCESSO
    // =========================================================

    console.log(
      'Conta excluída completamente:',
      user.id
    );

    return send(res, 200, {
      ok: true,
      message:
        'Conta, dados e acesso excluídos permanentemente.'
    });

  } catch (error) {
    // =========================================================
    // ERRO INESPERADO
    // =========================================================

    console.error(
      'Erro inesperado em delete-account:',
      error
    );

    return send(res, 500, {
      error:
        error?.message ||
        'Erro interno ao excluir a conta.',
      code:
        error?.code || null,
      details:
        error?.details || null,
      hint:
        error?.hint || null
    });
  }
};
