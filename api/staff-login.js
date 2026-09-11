import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Método não permitido.'
    });
  }

  try {
    const pinDigitado = String(req.body?.pin ?? '').trim();

    if (!pinDigitado) {
      return res.status(400).json({
        error: 'PIN obrigatório.'
      });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('Variáveis do Supabase ausentes.');

      return res.status(500).json({
        error: 'Configuração do Supabase ausente no servidor.'
      });
    }

    console.log('PIN recebido:', JSON.stringify(pinDigitado));

    const { data, error } = await supabaseAdmin
      .from('cafeterias')
      .select(`
        id,
        nome,
        pin_equipe,
        plano_ativo,
        data_inscricao,
        data_expiracao
      `)
      .eq('pin_equipe', pinDigitado)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('ERRO SUPABASE:', error);

      return res.status(500).json({
        error: 'Erro ao consultar o PIN no Supabase.',
        details: error.message
      });
    }

    if (!data) {
      console.log(
        'Nenhuma cafeteria encontrada para o PIN:',
        JSON.stringify(pinDigitado)
      );

      return res.status(401).json({
        error: 'PIN de acesso incorreto.',
        debug: {
          pinRecebido: pinDigitado,
          encontrado: false
        }
      });
    }

    console.log('CAFETERIA ENCONTRADA:', {
      id: data.id,
      nome: data.nome,
      pin_equipe: data.pin_equipe,
      plano_ativo: data.plano_ativo,
      data_expiracao: data.data_expiracao
    });

    const expiracao = data.data_expiracao
      ? new Date(data.data_expiracao)
      : null;

    const expiracaoValida =
      expiracao &&
      !Number.isNaN(expiracao.getTime());

    const ativo =
      data.plano_ativo === true &&
      expiracaoValida &&
      expiracao > new Date();

    if (!ativo) {
      return res.status(403).json({
        error: 'O plano desta cafeteria está expirado ou inativo.',
        debug: {
          cafeteriaId: data.id,
          planoAtivo: data.plano_ativo,
          dataExpiracao: data.data_expiracao,
          agora: new Date().toISOString()
        }
      });
    }

    return res.status(200).json({
      cafeteria: {
        id: data.id,
        nome: data.nome,
        pin_equipe: data.pin_equipe,
        plano_ativo: data.plano_ativo,
        data_inscricao: data.data_inscricao,
        data_expiracao: data.data_expiracao
      }
    });

  } catch (error) {
    console.error('ERRO INTERNO STAFF LOGIN:', error);

    return res.status(500).json({
      error: 'Erro interno do servidor.',
      details: error?.message || 'Erro desconhecido.'
    });
  }
}
