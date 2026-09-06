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
    // ==============================
    // 1. VALIDAR TOKEN
    // ==============================

    const authorization = req.headers.authorization || '';

    const match = authorization.match(
      /^Bearer\s+(.+)$/i
    );

    if (!match) {
      return send(res, 401, {
        error: 'Sessão não fornecida.'
      });
    }

    const accessToken = match[1];

    const {
      data: { user },
      error: authError
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !user) {
      return send(res, 401, {
        error: 'Sessão inválida ou expirada.'
      });
    }

    // ==============================
    // 2. LOCALIZAR CAFETERIA DO USUÁRIO
    // ==============================

    const {
      data: cafeteria,
      error: cafeteriaError
    } = await supabaseAdmin
      .from('cafeterias')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cafeteriaError) {
      console.error(
        'Erro ao localizar cafeteria:',
        cafeteriaError
      );

      return send(res, 500, {
        error: 'Não foi possível localizar a cafeteria.'
      });
    }

    if (!cafeteria) {
      return send(res, 404, {
        error: 'Nenhuma cafeteria vinculada a esta conta.'
      });
    }

    const cafeteriaId = cafeteria.id;

    // ==============================
    // 3. APAGAR PRODUTOS
    // ==============================

    const { error: produtosError } =
      await supabaseAdmin
        .from('produtos')
        .delete()
        .eq('cafeteria_id', cafeteriaId);

    if (produtosError) {
      console.error(
        'Erro ao apagar produtos:',
        produtosError
      );

      return send(res, 500, {
        error:
          'Não foi possível apagar os produtos da cafeteria.'
      });
    }

    // ==============================
    // 4. APAGAR PEDIDOS
    // ==============================

    const { error: pedidosError } =
      await supabaseAdmin
        .from('pedidos')
        .delete()
        .eq('cafeteria_id', cafeteriaId);

    if (pedidosError) {
      console.error(
        'Erro ao apagar pedidos:',
        pedidosError
      );

      return send(res, 500, {
        error:
          'Não foi possível apagar os pedidos da cafeteria.'
      });
    }

    // ==============================
    // 5. APAGAR CAFETERIA
    // ==============================

    const { error: deleteCafeteriaError } =
      await supabaseAdmin
        .from('cafeterias')
        .delete()
        .eq('id', cafeteriaId)
        .eq('user_id', user.id);

    if (deleteCafeteriaError) {
      console.error(
        'Erro ao apagar cafeteria:',
        deleteCafeteriaError
      );

      return send(res, 500, {
        error:
          'Não foi possível apagar a cafeteria.'
      });
    }

    // ==============================
    // 6. APAGAR USUÁRIO DO AUTH
    // ==============================

    const { error: deleteUserError } =
      await supabaseAdmin.auth.admin.deleteUser(
        user.id
      );

    if (deleteUserError) {
      console.error(
        'Erro ao apagar usuário Auth:',
        deleteUserError
      );

      return send(res, 500, {
        error:
          'Os dados da cafeteria foram apagados, mas não foi possível remover o acesso de autenticação. Contate o suporte.'
      });
    }

    // ==============================
    // 7. SUCESSO
    // ==============================

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
