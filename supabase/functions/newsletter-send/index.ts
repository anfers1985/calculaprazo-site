// ════════════════════════════════════════════════════════════════════════
// newsletter-send — chamada pelo Cron Job do Supabase (pg_cron), 2x ao dia
// ════════════════════════════════════════════════════════════════════════
// Verifica se existe alguma campanha com status='scheduled' cujo horário já
// chegou (scheduled_for <= agora) e dispara. Não precisa de autenticação
// externa porque só o pg_cron dentro do próprio projeto Supabase chama isso
// — mas ainda exigimos um header secreto simples como camada extra, pra
// caso a URL da function vaze.
//
// Deploy: supabase functions deploy newsletter-send --no-verify-jwt
// Depois: supabase secrets set CRON_SECRET=<gere uma string aleatória>
//                              RESEND_API_KEY=<sua chave do Resend>
// ════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendCampaign } from '../_shared/send-campaign.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  const auth = req.headers.get('x-cron-secret');
  if (auth !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 });
  }

  try {
    const { data: due, error } = await supabase
      .from('newsletter_campaigns')
      .select('id, subject')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString());

    if (error) throw error;

    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: 'Nenhuma campanha agendada pra agora.' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    for (const campaign of due) {
      const result = await sendCampaign(supabase, campaign.id, RESEND_API_KEY);
      results.push({ id: campaign.id, subject: campaign.subject, ...result });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('newsletter-send error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
