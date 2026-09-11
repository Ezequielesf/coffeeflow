import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const authorization = req.headers.authorization || '';
    const staffPin = String(req.headers['x-staff-pin'] || '').trim();
    const requestedCafeteriaId = String(req.headers['x-cafeteria-id'] || '').trim();
    let cafeteria = null;

    // Administrador autenticado pelo Supabase.
    if (authorization.startsWith('Bearer ')) {
      const token = authorization.replace('Bearer ', '').trim();
      if (!token) return res.status(401).json({ error: 'Token ausente.' });

      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !authData?.user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      const { data, error } = await supabaseAdmin
        .from('cafeterias')
        .select('id, user_id')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      if (error) {
        console.error('Erro ao localizar cafeteria:', error);
        return res.status(500).json({ error: 'Não foi possível localizar sua cafeteria.' });
      }
      cafeteria = data;
    } else if (staffPin && requestedCafeteriaId) {
      // Funcionário autenticado pelo PIN da cafeteria.
      const { data, error } = await supabaseAdmin
        .from('cafeterias')
        .select('id, user_id')
        .eq('id', requestedCafeteriaId)
        .eq('pin_equipe', staffPin)
        .maybeSingle();

      if (error) {
        console.error('Erro ao validar PIN da equipe:', error);
        return res.status(500).json({ error: 'Não foi possível validar o acesso da equipe.' });
      }
      cafeteria = data;
    } else {
      return res.status(401).json({ error: 'Sessão não autenticada.' });
    }

    if (!cafeteria) {
      return res.status(401).json({ error: 'Acesso não autorizado à cafeteria.' });
    }

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('pedidos')
        .select('*')
        .eq('cafeteria_id', cafeteria.id)
        .neq('status', 'entregue')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar pedidos:', error);
        return res.status(500).json({ error: 'Não foi possível buscar os pedidos.' });
      }

      return res.status(200).json(data || []);
    }

    const body = req.body || {};
    const id = String(body.id || '').trim();
    const status = String(body.status || '').trim();

    if (!id || !status) {
      return res.status(400).json({ error: 'ID e status são obrigatórios.' });
    }

    const statusPermitidos = ['pendente', 'em_preparo', 'entregue'];
    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({ error: 'Status de pedido inválido.' });
    }

    const { data, error } = await supabaseAdmin
      .from('pedidos')
      .update({ status })
      .eq('id', id)
      .eq('cafeteria_id', cafeteria.id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Erro ao atualizar pedido:', error);
      return res.status(500).json({ error: 'Não foi possível atualizar o pedido.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Pedido não encontrado ou não pertence à sua cafeteria.' });
    }

    return res.status(200).json({ success: true, pedido: data });
  } catch (error) {
    console.error('Erro interno em /api/orders:', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}
