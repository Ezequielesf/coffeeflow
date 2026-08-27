export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Método não permitido.'
    });
  }

  try {
    const { pin, cafeteriaId } = req.body || {};

    if (!pin || !cafeteriaId) {
      return res.status(400).json({
        success: false,
        error: 'PIN e cafeteriaId são obrigatórios.'
      });
    }

    // O PIN mestre fica somente na Vercel
    const masterPin = process.env.ADMIN_MASTER_PIN;

    if (!masterPin) {
      console.error('ADMIN_MASTER_PIN não configurado.');
      return res.status(500).json({
        success: false,
        error: 'Configuração do servidor incompleta.'
      });
    }

    // Compara o PIN digitado com o PIN armazenado na Vercel
    if (String(pin).trim() !== String(masterPin).trim()) {
      return res.status(401).json({
        success: false,
        error: 'PIN Secreto inválido.'
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Variáveis do Supabase não configuradas.');
      return res.status(500).json({
        success: false,
        error: 'Configuração do Supabase incompleta.'
      });
    }

    const dataVitaliciaIso =
      new Date('2099-12-31T23:59:59.000Z').toISOString();

    const response = await fetch(
      `${supabaseUrl}/rest/v1/cafeterias?id=eq.${encodeURIComponent(cafeteriaId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          plano_ativo: true,
          data_expiracao: dataVitaliciaIso
        })
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error('Erro Supabase:', responseText);

      return res.status(500).json({
        success: false,
        error: 'Não foi possível ativar o acesso vitalício.'
      });
    }

    let data = [];

    try {
      data = responseText ? JSON.parse(responseText) : [];
    } catch {
      data = [];
    }

    if (!Array.isArray(data) || !data[0]) {
      return res.status(404).json({
        success: false,
        error: 'Cafeteria não encontrada.'
      });
    }

    return res.status(200).json({
      success: true,
      dataExpiracao: dataVitaliciaIso
    });
  } catch (error) {
    console.error('Erro no admin-bypass:', error);

    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor.'
    });
  }
        }
