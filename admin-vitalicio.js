// /api/admin-vitalicio.js

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_MASTER_PIN = process.env.ADMIN_MASTER_PIN;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método não permitido'
    });
  }

  try {
    const { pin } = req.body || {};

    if (!pin) {
      return res.status(400).json({
        error: 'PIN não informado'
      });
    }

    // Obtém o token da sessão do usuário
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Usuário não autenticado'
      });
    }

    const accessToken = authHeader.replace('Bearer ', '');

    // Verifica o usuário diretamente no Supabase Auth
    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: 'Sessão inválida ou expirada'
      });
    }

    const user = await userResponse.json();

    if (!user?.email) {
      return res.status(401).json({
        error: 'Usuário não identificado'
      });
    }

    // Valida o PIN SOMENTE no servidor
    if (pin.trim() !== ADMIN_MASTER_PIN) {
      return res.status(403).json({
        error: 'PIN Secreto inválido.'
      });
    }

    const email = user.email.trim().toLowerCase();

    // Data muito distante para representar acesso vitalício
    const dataVitalicia = '2099-12-31T23:59:59.000Z';

    // Atualiza somente a cafeteria pertencente ao usuário autenticado
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/cafeterias?email=eq.${encodeURIComponent(email)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          plano_ativo: true,
          data_expiracao: dataVitalicia
        })
      }
    );

    const texto = await updateResponse.text();

    if (!updateResponse.ok) {
      console.error('Erro Supabase:', updateResponse.status, texto);

      return res.status(500).json({
        error: 'Erro ao ativar acesso vitalício'
      });
    }

    let cafeterias;

    try {
      cafeterias = JSON.parse(texto);
    } catch {
      cafeterias = [];
    }

    if (!Array.isArray(cafeterias) || cafeterias.length === 0) {
      return res.status(404).json({
        error: 'Nenhuma cafeteria encontrada para esta conta'
      });
    }

    return res.status(200).json({
      ok: true,
      dataExpiracao: dataVitalicia
    });

  } catch (error) {
    console.error('Erro no acesso vitalício:', error);

    return res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
};
