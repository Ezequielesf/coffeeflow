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
    // 2. VALIDAR O USUÁRIO
    // =========================================================

    const {
      data: { user },
      error: authError
    } = await supabaseAdmin.auth.getUser(
      accessToken
    );

    if (authError || !user) {
      console.error(
        '[delete-account] Erro ao validar sessão:',
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
      '[delete-account] Usuário autenticado:',
      user.id
    );

    // =========================================================
    // 3. ENCONTRAR A CAFETERIA PELO USER_ID
    // =========================================================

    const {
      data: cafeteria,
      error: cafeteriaError
    } = await supabaseAdmin
      .from('cafeterias')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (cafeteriaError) {
      console.error(
        '[delete-account] Erro ao buscar cafeteria:',
        cafeteriaError
      );

      return send(res, 500, {
        error:
          'Erro ao localizar os dados da cafeteria.',
        code:
          cafeteriaError.code || null,
        details:
          cafeteriaError.details || null,
        hint:
          cafeteriaError.hint || null
      });
    }

    if (!cafeteria) {
      return send(res, 404, {
        error:
          'Nenhuma cafeteria encontrada para esta conta.'
      });
    }

    const cafeteriaId = cafeteria.id;

    console.log(
      '[delete-account] Cafeteria encontrada:',
      cafeteriaId
    );

    // =========================================================
    // 4. APAGAR PRODUTOS
    // =========================================================

    const {
      error: produtosError
    } = await supabaseAdmin
      .from('produtos')
      .delete()
      .eq('cafeteria_id', cafeteriaId);

    if (produtosError) {
      console.error(
        '[delete-account] Erro ao excluir produtos:',
        produtosError
      );

      return send(res, 500, {
        error:
          'Erro ao excluir os produtos da cafeteria.',
        code:
          produtosError.code || null,
        details:
          produtosError.details || null,
        hint:
          produtosError.hint || null
      });
    }

    console.log(
      '[delete-account] Produtos excluídos.'
    );

    // =========================================================
    // 5. APAGAR PEDIDOS
    // =========================================================

    const {
      error: pedidosError
