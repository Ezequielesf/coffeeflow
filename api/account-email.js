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
  if (req.method !== 'PATCH') {
    return res.status(405).json({
      error: 'Método não permitido'
    });
  }

  try {
    // ==========================================
    // 1. PEGAR TOKEN DA SESSÃO
    // ==========================================

    const authorization = req.headers.authorization || '';

    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Sessão não autenticada.'
      });
    }

    const token = authorization.replace('Bearer ', '').trim();

    // ==========================================
    // 2. VALIDAR USUÁRIO
    // ==========================================

    const {
      data: authData,
      error: authError
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: 'Sessão inválida ou expirada.'
      });
    }

    const user = authData.user;

    // ==========================================
    // 3. PEGAR NOVO E-MAIL
    // ==========================================

    const novoEmail = String(
      req.body?.email || ''
    )
      .trim()
      .toLowerCase();

    if (!novoEmail) {
      return res.status(400).json({
        error: 'Informe o novo e-mail.'
      });
    }

    // Validação básica
    const emailValido =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoEmail);

    if (!emailValido) {
      return res.status(400).json({
        error: 'Informe um e-mail válido.'
      });
    }

    const emailAtual = String(
      user.email || ''
    )
      .trim()
      .toLowerCase();

    if (novoEmail === emailAtual) {
      return res.status(400).json({
        error: 'O novo e-mail é igual ao atual.'
      });
    }

    // ==========================================
    // 4. LOCALIZAR A CAFETERIA DO USUÁRIO
    // ==========================================

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

      return res.status(500).json({
        error: 'Não foi possível localizar a cafeteria.'
      });
    }

    if (!cafeteria) {
      return res.status(404).json({
        error: 'Nenhuma cafeteria vinculada a esta conta.'
      });
    }

    // ==========================================
    // 5. VERIFICAR SE O E-MAIL JÁ EXISTE
    // ==========================================

    const {
      data: usersData,
      error: usersError
    } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });

    if (usersError) {
      console.error(
        'Erro ao verificar e-mail:',
        usersError
      );

      return res.status(500).json({
        error: 'Não foi possível verificar o novo e-mail.'
      });
    }

    const emailEmUso = usersData.users.some(
      (item) =>
        String(item.email || '')
          .trim()
          .toLowerCase() === novoEmail &&
        item.id !== user.id
    );

    if (emailEmUso) {
      return res.status(409).json({
        error: 'Este e-mail já está sendo usado por outra conta.'
      });
    }

    // ==========================================
    // 6. ALTERAR E-MAIL NO SUPABASE AUTH
    // ==========================================

    const {
      error: updateAuthError
    } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        email: novoEmail,
        email_confirm: true
      }
    );

    if (updateAuthError) {
      console.error(
        'Erro ao alterar e-mail no Auth:',
        updateAuthError
      );

      return res.status(500).json({
        error: 'Não foi possível alterar o e-mail de acesso.'
      });
    }

    // ==========================================
    // 7. ATUALIZAR CAFETERIA
    // ==========================================

    const {
      error: updateCafeteriaError
    } = await supabaseAdmin
      .from('cafeterias')
      .update({
        email: novoEmail,
        dono_email: novoEmail
      })
      .eq('id', cafeteria.id)
      .eq('user_id', user.id);

    // ==========================================
    // 8. SE DER ERRO, TENTAR REVERTER AUTH
    // ==========================================

    if (updateCafeteriaError) {
      console.error(
        'Erro ao atualizar cafeteria:',
        updateCafeteriaError
      );

      await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          email: emailAtual,
          email_confirm: true
        }
      );

      return res.status(500).json({
        error: 'Não foi possível concluir a alteração do e-mail.'
      });
    }

    // ==========================================
    // 9. SUCESSO
    // ==========================================

    return res.status(200).json({
      ok: true,
      email: novoEmail
    });

  } catch (error) {

    console.error(
      'Erro interno em account-email:',
      error
    );

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    });
  }
      }
