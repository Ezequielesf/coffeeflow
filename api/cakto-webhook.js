// api/cakto-webhook.js
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const evento = req.body;
  
  // 1. Validar estrutura básica do evento da Cakto
  const eventId = evento?.id || evento?.event_id || evento?.transaction_id;
  const statusPagamento = evento?.status || evento?.event;
  const customerEmail = (evento?.customer?.email || evento?.email || '').trim().toLowerCase();

  if (!eventId || !customerEmail) {
    return res.status(400).json({ error: 'Payload inválido: faltando eventId ou customerEmail' });
  }

  try {
    // 2. Garantir Idempotência (verificar se o evento já foi processado)
    const { data: eventoExistente, error: erroBuscaEvento } = await supabaseAdmin
      .from('webhooks_processados')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (erroBuscaEvento) {
      console.error('Erro ao verificar idempotência:', erroBuscaEvento);
    }

    if (eventoExistente) {
      return res.status(200).json({ status: 'ignored', message: 'Evento já processado anteriormente.' });
    }

    // 3. Verificar eventos aprovados de pagamento
    const eventosAprovados = ['purchase_approved', 'subscription_renewed', 'order.paid', 'approved'];
    
    if (eventosAprovados.includes(statusPagamento)) {
      // Buscar cafeteria pelo e-mail
      const { data: cafeteria, error: erroCafeteria } = await supabaseAdmin
        .from('cafeterias')
        .select('id, data_expiracao, plano_ativo')
        .or(`email.eq.${customerEmail},dono_email.eq.${customerEmail}`)
        .maybeSingle();

      if (erroCafeteria || !cafeteria) {
        // Se a cafeteria não existir ainda, podemos registrar o webhook como pendente ou ignorar temporariamente
        console.warn(`Cafeteria não encontrada para o e-mail: ${customerEmail}`);
        return res.status(200).json({ status: 'warning', message: 'Cafeteria não localizada para este e-mail.' });
      }

      // 4. Calcular Renovação Acumulativa (+30 Dias)
      const agora = new Date();
      const expiracaoAtual = cafeteria.data_expiracao ? new Date(cafeteria.data_expiracao) : null;
      
      const base = (expiracaoAtual && expiracaoAtual > agora) ? expiracaoAtual : agora;
      const novaExpiracao = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

      // 5. Atualizar Cafeteria
      const { error: erroUpdate } = await supabaseAdmin
        .from('cafeterias')
        .update({
          plano_ativo: true,
          data_expiracao: novaExpiracao.toISOString()
        })
        .eq('id', cafeteria.id);

      if (erroUpdate) throw erroUpdate;
    }

    // 6. Registra o evento como processado para garantir a idempotência
    await supabaseAdmin
      .from('webhooks_processados')
      .insert([{ event_id: eventId, processado_em: new Date().toISOString() }]);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erro ao processar webhook da Cakto:', err);
    return res.status(500).json({ error: 'Erro interno ao processar webhook' });
  }
}
          resposta.status,
          texto
        );

        return res.status(500).json({
          error: 'Erro ao atualizar cafeteria'
        });
      }

      if (
        !Array.isArray(atualizados) ||
        atualizados.length === 0
      ) {
        return res.status(200).json({
          ok: true,
          aviso:
            'Pagamento recebido, mas nenhuma cafeteria foi encontrada com esse e-mail.'
        });
      }

      return res.status(200).json({
        ok: true,
        cafeteriaAtivada: emailNormalizado,
        dataExpiracao: dataExpiracao.toISOString()
      });
    }

    // ==========================================
    // REEMBOLSO / CHARGEBACK / CANCELAMENTO
    // ==========================================

    if (eventosQueRevogamAcesso.includes(evento)) {
      const resposta = await fetch(
        `${SUPABASE_URL}/rest/v1/cafeterias?email=eq.${encodeURIComponent(emailNormalizado)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            plano_ativo: false
          })
        }
      );

      if (!resposta.ok) {
        const erro = await resposta.text();

        console.error(
          'Erro ao desativar cafeteria:',
          erro
        );

        return res.status(500).json({
          error: 'Erro ao desativar cafeteria'
        });
      }

      return res.status(200).json({
        ok: true,
        cafeteriaDesativada: emailNormalizado
      });
    }

    // ==========================================
    // EVENTO IGNORADO
    // ==========================================

    return res.status(200).json({
      ok: true,
      ignorado: evento
    });

  } catch (err) {
    console.error(
      'Erro no webhook da Cakto:',
      err
    );

    return res.status(500).json({
      error: 'Erro interno ao processar webhook'
    });
  }
};
