import { renderCampaignHtml } from './render-email.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Calcula Prazo <newsletter@calculaprazo.com.br>';
const BATCH_SIZE = 90; // Resend aceita até 100 destinatários por chamada em lote; ficamos com folga

interface SendResult {
  ok: boolean;
  sentCount: number;
  failedCount: number;
  error?: string;
}

// Envia UMA campanha pra todos os assinantes ativos. Usado tanto pelo
// disparo agendado (cron) quanto pelo botão "Enviar agora" do admin.
// Marca a campanha como 'sending' no início (evita disparo duplicado se
// o cron e um clique manual coincidirem) e 'sent'/'failed' no final.
export async function sendCampaign(
  supabase: any,
  campaignId: string,
  resendApiKey: string
): Promise<SendResult> {
  // Trava otimista: só segue se a campanha ainda não estiver em envio/enviada
  const { data: campaign, error: fetchErr } = await supabase
    .from('newsletter_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (fetchErr || !campaign) {
    return { ok: false, sentCount: 0, failedCount: 0, error: 'Campanha não encontrada' };
  }
  if (campaign.status === 'sending' || campaign.status === 'sent') {
    return { ok: false, sentCount: 0, failedCount: 0, error: `Campanha já está com status "${campaign.status}"` };
  }

  await supabase.from('newsletter_campaigns').update({ status: 'sending' }).eq('id', campaignId);

  try {
    const { data: subscribers, error: subErr } = await supabase
      .from('newsletter_subscribers')
      .select('email, unsubscribe_token')
      .eq('status', 'active');

    if (subErr) throw subErr;
    if (!subscribers || subscribers.length === 0) {
      await supabase.from('newsletter_campaigns')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', campaignId);
      await supabase.from('newsletter_sends_log').insert({ campaign_id: campaignId, sent_count: 0, failed_count: 0 });
      return { ok: true, sentCount: 0, failedCount: 0 };
    }

    let sentCount = 0;
    let failedCount = 0;

    // Processa em lotes — cada assinante recebe um HTML com SEU PRÓPRIO
    // link de descadastro (token individual), então cada e-mail é uma
    // chamada separada à API do Resend.
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (sub: { email: string; unsubscribe_token: string }) => {
          const unsubscribeUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/newsletter-unsubscribe?token=${sub.unsubscribe_token}`;
          const html = await renderCampaignHtml(campaign, unsubscribeUrl);
          const res = await fetch(RESEND_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: FROM_ADDRESS,
              to: sub.email,
              subject: campaign.subject,
              html,
            }),
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Resend ${res.status}: ${errText}`);
          }
        })
      );
      sentCount += results.filter(r => r.status === 'fulfilled').length;
      failedCount += results.filter(r => r.status === 'rejected').length;

      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          console.error(`Falha ao enviar pra ${batch[idx].email}:`, r.reason);
        }
      });

      // pequena pausa entre lotes pra não estourar rate limit do Resend
      if (i + BATCH_SIZE < subscribers.length) await new Promise(r => setTimeout(r, 1000));
    }

    const finalStatus = failedCount > 0 && sentCount === 0 ? 'failed' : 'sent';
    await supabase.from('newsletter_campaigns').update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      error_message: failedCount > 0 ? `${failedCount} envio(s) falharam de ${subscribers.length}` : null,
    }).eq('id', campaignId);

    await supabase.from('newsletter_sends_log').insert({
      campaign_id: campaignId, sent_count: sentCount, failed_count: failedCount,
    });

    return { ok: true, sentCount, failedCount };
  } catch (err) {
    console.error('sendCampaign error:', err);
    await supabase.from('newsletter_campaigns').update({
      status: 'failed',
      error_message: String(err),
    }).eq('id', campaignId);
    return { ok: false, sentCount: 0, failedCount: 0, error: String(err) };
  }
}
