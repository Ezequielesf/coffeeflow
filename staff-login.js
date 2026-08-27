const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { pin } = req.body || {};

    if (!pin || !pin.trim()) {
      return res.status(400).json({ error: 'PIN não informado' });
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cafeterias?pin_equipe=eq.${encodeURIComponent(pin.trim())}&select=id,nome,pin_equipe,email,dono_email,plano_ativo,data_inscricao,data_expiracao,user_id`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`
        }
      }
    );

    if (!response.ok) {
      console.error('Erro ao consultar cafeteria:', await response.text());
      return res.status(500).json({ error: 'Erro ao validar o PIN.' });
    }

    const cafeterias = await response.json();

    if (!Array.isArray(cafeterias) || cafeterias.length === 0) {
      return res.status(401).json({
        error: 'PIN de acesso incorreto.'
      });
    }

    const cafeteria = cafeterias[0];

    const planoValido =
      cafeteria.plano_ativo === true &&
      cafeteria.data_expiracao &&
      new Date(cafeteria.data_expiracao) > new Date();

    if (!planoValido) {
      return res.status(403).json({
        error: 'O plano desta cafeteria não está ativo.'
      });
    }

    const isVitalicio =
      cafeteria.data_expiracao &&
      new Date(cafeteria.data_expiracao).getFullYear() > 2090;

    return res.status(200).json({
      ok: true,
      cafeteria: {
        id: cafeteria.id,
        nome: cafeteria.nome,
        pinEquipe: cafeteria.pin_equipe,
        donoEmail: cafeteria.email || cafeteria.dono_email || '',
        dataInscricao: cafeteria.data_inscricao,
        dataExpiracao: cafeteria.data_expiracao,
        planoAtivo: cafeteria.plano_ativo === true,
        isVitalicio
      }
    });

  } catch (error) {
    console.error('Erro no staff-login:', error);

    return res.status(500).json({
      error: 'Erro interno do servidor.'
    });
  }
};
