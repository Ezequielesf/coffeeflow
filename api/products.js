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
  // =========================================================
  // 1. ACEITAR SOMENTE POST, PATCH E DELETE
  // =========================================================

  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({
      error: 'Método não permitido.'
    });
  }

  try {
    // =========================================================
    // 2. PEGAR TOKEN DO USUÁRIO
    // =========================================================

    const authorization = req.headers.authorization || '';

    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Sessão não autenticada.'
      });
    }

    const token = authorization.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({
        error: 'Token de autenticação ausente.'
      });
    }

    // =========================================================
    // 3. VALIDAR TOKEN NO SUPABASE AUTH
    // =========================================================

    const {
      data: authData,
      error: authError
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData?.user) {
      return res.status(401).json({
        error: 'Sessão inválida ou expirada. Faça login novamente.'
      });
    }

    const user = authData.user;

    // =========================================================
    // 4. LOCALIZAR A CAFETERIA DO USUÁRIO
    // =========================================================

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
        error: 'Não foi possível localizar sua cafeteria.'
      });
    }

    if (!cafeteria) {
      return res.status(404).json({
        error: 'Nenhuma cafeteria vinculada a esta conta.'
      });
    }

    // =========================================================
    // 5. POST — CRIAR PRODUTO
    // =========================================================

    if (req.method === 'POST') {
      const body = req.body || {};

      const nome = String(body.nome || '').trim();
      const categoria = String(
        body.categoria || 'Cafés'
      ).trim();

      const descricao = String(
        body.descricao || ''
      ).trim();

      const imagem = String(
        body.imagem || ''
      ).trim();

      const preco = Number(body.preco);

      const disponivel = body.disponivel !== false;

      // -------------------------------------------------------
      // Validações
      // -------------------------------------------------------

      if (!nome) {
        return res.status(400).json({
          error: 'Informe o nome do produto.'
        });
      }

      if (!Number.isFinite(preco) || preco < 0) {
        return res.status(400).json({
          error: 'Informe um preço válido.'
        });
      }

      // -------------------------------------------------------
      // IMPORTANTE:
      // A cafeteria usada será SEMPRE a cafeteria do usuário
      // autenticado. Não confiamos no cafeteria_id enviado pelo
      // navegador.
      // -------------------------------------------------------

      const produto = {
        cafeteria_id: cafeteria.id,
        nome,
        preco,
        categoria: categoria || 'Cafés',
        descricao,
        imagem,
        disponivel
      };

      const {
        data,
        error
      } = await supabaseAdmin
        .from('produtos')
        .insert(produto)
        .select()
        .single();

      if (error) {
        console.error(
          'Erro ao criar produto:',
          error
        );

        return res.status(500).json({
          error: 'Não foi possível salvar o produto.'
        });
      }

      return res.status(201).json({
        success: true,
        produto: data
      });
    }

    // =========================================================
    // 6. PATCH — EDITAR PRODUTO
    // =========================================================

    if (req.method === 'PATCH') {
      const body = req.body || {};

      const id = String(body.id || '').trim();

      if (!id) {
        return res.status(400).json({
          error: 'ID do produto não informado.'
        });
      }

      const nome = String(body.nome || '').trim();
      const categoria = String(
        body.categoria || 'Cafés'
      ).trim();

      const descricao = String(
        body.descricao || ''
      ).trim();

      const imagem = String(
        body.imagem || ''
      ).trim();

      const preco = Number(body.preco);

      const disponivel = body.disponivel !== false;

      // -------------------------------------------------------
      // Validações
      // -------------------------------------------------------

      if (!nome) {
        return res.status(400).json({
          error: 'Informe o nome do produto.'
        });
      }

      if (!Number.isFinite(preco) || preco < 0) {
        return res.status(400).json({
          error: 'Informe um preço válido.'
        });
      }

      // -------------------------------------------------------
      // O WHERE possui cafeteria_id.
      //
      // Mesmo que alguém descubra o ID de um produto de outra
      // cafeteria, ele não poderá alterá-lo.
      // -------------------------------------------------------

      const {
        data,
        error
      } = await supabaseAdmin
        .from('produtos')
        .update({
          nome,
          preco,
          categoria: categoria || 'Cafés',
          descricao,
          imagem,
          disponivel
        })
        .eq('id', id)
        .eq('cafeteria_id', cafeteria.id)
        .select()
        .maybeSingle();

      if (error) {
        console.error(
          'Erro ao editar produto:',
          error
        );

        return res.status(500).json({
          error: 'Não foi possível atualizar o produto.'
        });
      }

      if (!data) {
        return res.status(404).json({
          error: 'Produto não encontrado ou não pertence à sua cafeteria.'
        });
      }

      return res.status(200).json({
        success: true,
        produto: data
      });
    }

    // =========================================================
    // 7. DELETE — EXCLUIR PRODUTO
    // =========================================================

    if (req.method === 'DELETE') {
      const body = req.body || {};

      const id = String(body.id || '').trim();

      if (!id) {
        return res.status(400).json({
          error: 'ID do produto não informado.'
        });
      }

      // -------------------------------------------------------
      // O WHERE garante que somente produtos da própria
      // cafeteria possam ser excluídos.
      // -------------------------------------------------------

      const {
        data,
        error
      } = await supabaseAdmin
        .from('produtos')
        .delete()
        .eq('id', id)
        .eq('cafeteria_id', cafeteria.id)
        .select()
        .maybeSingle();

      if (error) {
        console.error(
          'Erro ao excluir produto:',
          error
        );

        return res.status(500).json({
          error: 'Não foi possível excluir o produto.'
        });
      }

      if (!data) {
        return res.status(404).json({
          error: 'Produto não encontrado ou não pertence à sua cafeteria.'
        });
      }

      return res.status(200).json({
        success: true,
        produto: data
      });
    }

  } catch (error) {
    console.error(
      'Erro interno em /api/products:',
      error
    );

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    });
  }
        }
