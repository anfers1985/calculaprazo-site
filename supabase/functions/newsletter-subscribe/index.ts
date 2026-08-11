// ════════════════════════════════════════════════════════════════════════
// newsletter-subscribe — Edge Function PÚBLICA (sem autenticação)
// ════════════════════════════════════════════════════════════════════════
// Chamada pelo formulário no rodapé do site. Recebe um e-mail, valida,
// e insere (ou reativa, se a pessoa já tinha cancelado antes) na tabela
// de assinantes. Usa a service_role key internamente — o navegador nunca
// vê essa chave, só chama esta URL pública.
//
// Deploy: supabase functions deploy newsletter-subscribe --no-verify-jwt
// (--no-verify-jwt é necessário porque quem chama é um visitante anônimo
// do site, não um usuário logado no Supabase)
// ════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://calculaprazo.com.br',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const email = (body?.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'E-mail inválido' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // honeypot simples anti-spam: se o campo oculto "website" vier preenchido,
    // finge sucesso mas não faz nada (bots geralmente preenchem tudo)
    if (body?.website) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Verifica se já existe
    const { data: existing } = await supabase
      .from('newsletter_subscribers')
      .select('id, status')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'unsubscribed') {
        // Reativa quem já tinha cancelado antes
        await supabase
          .from('newsletter_subscribers')
          .update({ status: 'active', subscribed_at: new Date().toISOString(), unsubscribed_at: null })
          .eq('id', existing.id);
      }
      // Se já está ativo, não faz nada — não revela isso ao chamador
      // (evita usar o endpoint pra descobrir se um e-mail está cadastrado)
    } else {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .insert({ email });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('newsletter-subscribe error:', err);
    return new Response(JSON.stringify({ error: 'Erro ao processar inscrição' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
