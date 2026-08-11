// ════════════════════════════════════════════════════════════════════════
// newsletter-unsubscribe — Edge Function PÚBLICA (sem autenticação)
// ════════════════════════════════════════════════════════════════════════
// O link de descadastro em todo e-mail aponta pra cá:
//   https://[project-ref].supabase.co/functions/v1/newsletter-unsubscribe?token=xxx
// Um clique já cancela — sem login, sem confirmação por e-mail, sem passar
// por você. Depois redireciona pra página de confirmação no site.
//
// Deploy: supabase functions deploy newsletter-unsubscribe --no-verify-jwt
// ════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SITE_URL = 'https://calculaprazo.com.br';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return Response.redirect(`${SITE_URL}/newsletter/cancelar?status=erro`, 302);
  }

  try {
    const { data: sub } = await supabase
      .from('newsletter_subscribers')
      .select('id, status')
      .eq('unsubscribe_token', token)
      .maybeSingle();

    if (!sub) {
      return Response.redirect(`${SITE_URL}/newsletter/cancelar?status=erro`, 302);
    }

    if (sub.status === 'active') {
      await supabase
        .from('newsletter_subscribers')
        .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
        .eq('id', sub.id);
    }

    // já estava cancelado ou acabou de ser — mesmo destino (idempotente,
    // clicar duas vezes no link não dá erro)
    return Response.redirect(`${SITE_URL}/newsletter/cancelar?status=ok`, 302);
  } catch (err) {
    console.error('newsletter-unsubscribe error:', err);
    return Response.redirect(`${SITE_URL}/newsletter/cancelar?status=erro`, 302);
  }
});
