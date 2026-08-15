// ════════════════════════════════════════════════════════════════════════
// newsletter-admin — Edge Function protegida, chamada só pelo painel admin
// ════════════════════════════════════════════════════════════════════════
// Um único endpoint que aceita várias "ações" via JSON body, pra não
// precisar de uma function separada pra cada operação de CRUD.
//
// Protegida por um header x-admin-secret que precisa bater com o secret
// ADMIN_SECRET configurado no Supabase. Esse mesmo valor fica embutido no
// admin/index.html (client-side) — é a mesma lógica de proteção que o
// resto do seu admin já usa (uma barreira, não uma fortaleza; o painel
// não é linkado publicamente).
//
// Deploy: supabase functions deploy newsletter-admin --no-verify-jwt
// Depois: supabase secrets set ADMIN_SECRET=<gere uma string aleatória>
// ════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendCampaign } from '../_shared/send-campaign.ts';
import { renderCampaignHtml } from '../_shared/render-email.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const ADMIN_SECRET = Deno.env.get('ADMIN_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // o admin roda de vários lugares (localhost, preview, produção)
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  if (req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return json({ error: 'Não autorizado' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const { action } = body;

  try {
    switch (action) {
      case 'list_campaigns': {
        const { data, error } = await supabase
          .from('newsletter_campaigns')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return json({ campaigns: data });
      }

      case 'get_campaign': {
        const { data, error } = await supabase
          .from('newsletter_campaigns').select('*').eq('id', body.id).single();
        if (error) throw error;
        return json({ campaign: data });
      }

      case 'create_campaign': {
        const { subject, body_markdown, article_ids, calculator_slugs, scheduled_for } = body;
        if (!subject || !subject.trim()) return json({ error: 'Assunto é obrigatório' }, 400);
        const { data, error } = await supabase.from('newsletter_campaigns').insert({
          subject: subject.trim(),
          body_markdown: body_markdown || '',
          article_ids: article_ids || [],
          calculator_slugs: calculator_slugs || [],
          scheduled_for: scheduled_for || null,
          status: scheduled_for ? 'scheduled' : 'draft',
        }).select().single();
        if (error) throw error;
        return json({ campaign: data });
      }

      case 'update_campaign': {
        const { id, subject, body_markdown, article_ids, calculator_slugs, scheduled_for, status } = body;
        if (!id) return json({ error: 'id é obrigatório' }, 400);
        const updates: Record<string, unknown> = {};
        if (subject !== undefined) updates.subject = subject;
        if (body_markdown !== undefined) updates.body_markdown = body_markdown;
        if (article_ids !== undefined) updates.article_ids = article_ids;
        if (calculator_slugs !== undefined) updates.calculator_slugs = calculator_slugs;
        if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for;
        if (status !== undefined) updates.status = status;
        const { data, error } = await supabase
          .from('newsletter_campaigns').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return json({ campaign: data });
      }

      case 'delete_campaign': {
        if (!body.id) return json({ error: 'id é obrigatório' }, 400);
        const { error } = await supabase.from('newsletter_campaigns').delete().eq('id', body.id);
        if (error) throw error;
        return json({ ok: true });
      }

      case 'send_now': {
        if (!body.id) return json({ error: 'id é obrigatório' }, 400);
        const result = await sendCampaign(supabase, body.id, RESEND_API_KEY);
        return json(result, result.ok ? 200 : 500);
      }

      case 'preview_campaign': {
        // Gera o HTML do e-mail exatamente como ele sairia de verdade — usa
        // a MESMA função que o envio real usa (render-email.ts), então o
        // preview nunca fica dessincronizado do e-mail que chega na caixa
        // de entrada. Não precisa de campanha salva: funciona com os dados
        // que estão no formulário no momento, antes até de clicar Salvar.
        const draft = {
          subject: body.subject || '(sem assunto)',
          body_markdown: body.body_markdown || '',
          article_ids: body.article_ids || [],
          calculator_slugs: body.calculator_slugs || [],
        };
        const fakeUnsubscribeUrl = `${SUPABASE_URL}/functions/v1/newsletter-unsubscribe?token=preview`;
        try {
          const html = await renderCampaignHtml(draft, fakeUnsubscribeUrl);
          return json({ html });
        } catch (err) {
          return json({ error: 'Erro ao gerar preview: ' + String(err) }, 500);
        }
      }

      case 'list_subscribers': {
        const limit = Math.min(body.limit || 100, 500);
        const offset = body.offset || 0;
        const { data, error, count } = await supabase
          .from('newsletter_subscribers')
          .select('id, email, status, subscribed_at, unsubscribed_at', { count: 'exact' })
          .order('subscribed_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw error;
        const { count: activeCount } = await supabase
          .from('newsletter_subscribers')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active');
        return json({ subscribers: data, total: count, activeCount });
      }

      case 'add_subscriber': {
        const email = (body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'E-mail inválido' }, 400);
        const { data, error } = await supabase
          .from('newsletter_subscribers')
          .upsert({ email, status: 'active', subscribed_at: new Date().toISOString(), unsubscribed_at: null }, { onConflict: 'email' })
          .select().single();
        if (error) throw error;
        return json({ subscriber: data });
      }

      case 'remove_subscriber': {
        if (!body.id) return json({ error: 'id é obrigatório' }, 400);
        const { error } = await supabase.from('newsletter_subscribers').delete().eq('id', body.id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (err) {
    console.error('newsletter-admin error:', err);
    return json({ error: String(err) }, 500);
  }
});
