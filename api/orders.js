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
  // Aceita somente GET e PATCH
  if (!['GET', 'PATCH'].includes(req.method)) {
    return res.status(405).json({
      error: 'Método não permitido.'
    });
  }

  try {
    // =========================================================
    // 1. VALIDAR TOKEN
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
        error: 'Token ausente.'
      });
    }

    // =========================================================
    // 2. VALIDAR USUÁRIO NO SUPABASE AUTH
    // =========================================================

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

    // =========================================================
    // 3. ENCONTRAR A CAFETERIA DO USUÁRIO
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
    // 4. GET — BUSCAR PEDIDOS
    // =========================================================

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('pedidos')
        .select('*')
        .eq('cafeteria_id', cafeteria.id)
        .neq('status', 'entregue')
        .order('created_at', {
          ascending: false
        });

      if (error) {
        console.error(
          'Erro ao buscar pedidos:',
          error
        );

        return res.status(500).json({
          error: 'Não foi possível buscar os pedidos.'
        });
      }

      return res.status(200).json(data || []);
    }

    // =========================================================
    // 5. PATCH — ATUALIZAR STATUS
    // =========================================================

    if (req.method === 'PATCH') {
      const body = req.body || {};

      const id = String(body.id || '').trim();
      const status = String(body.status || '').trim();

      if (!id || !status) {
        return res.status(400).json({
          error: 'ID e status são obrigatórios.'
        });
      }

      const { data, error } = await supabaseAdmin
        .from('pedidos')
        .update({
          status
        })
        .eq('id', id)
        .eq('cafeteria_id', cafeteria.id)
        .select()
        .maybeSingle();

      if (error) {
        console.error(
          'Erro ao atualizar pedido:',
          error
        );

        return res.status(500).json({
          error: 'Não foi possível atualizar o pedido.'
        });
      }

      if (!data) {
        return res.status(404).json({
          error: 'Pedido não encontrado ou não pertence à sua cafeteria.'
        });
      }

      return res.status(200).json({
        success: true,
        pedido: data
      });
    }

  } catch (error) {
    console.error(
      'Erro interno em /api/orders:',
      error
    );

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    });
  }
  }
