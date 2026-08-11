import { marked } from 'npm:marked@12';
import { CALCULATORS } from './calculators-list.ts';

const SITE_URL = 'https://calculaprazo.com.br';

interface ArticleRef { id: string; show_image: boolean; }
interface Campaign {
  subject: string;
  body_markdown: string;
  article_ids: ArticleRef[];
  calculator_slugs: string[];
}
interface Post {
  id: string;
  title: string;
  excerpt?: string;
  image?: string;
  category_label?: string;
}

// Busca o posts.json publicado no site (fonte pública, sem precisar de
// credencial) e devolve só os posts pedidos pela campanha, na mesma ordem.
async function fetchArticles(articleRefs: ArticleRef[]): Promise<Array<Post & { show_image: boolean }>> {
  if (!articleRefs.length) return [];
  const res = await fetch(`${SITE_URL}/data/posts.json`);
  if (!res.ok) throw new Error('Não foi possível carregar posts.json do site');
  const allPosts: Post[] = await res.json();
  const byId = new Map(allPosts.map(p => [p.id, p]));
  return articleRefs
    .map(ref => {
      const post = byId.get(ref.id);
      if (!post) return null;
      return { ...post, show_image: ref.show_image };
    })
    .filter((p): p is Post & { show_image: boolean } => p !== null);
}

function articleCardHtml(post: Post & { show_image: boolean }): string {
  const url = `${SITE_URL}/blog/${post.id}.html`;
  const img = post.show_image && post.image
    ? `<img src="${escapeAttr(post.image)}" alt="" width="560" style="width:100%;max-width:560px;height:auto;border-radius:8px 8px 0 0;display:block;">`
    : '';
  return `
  <tr><td style="padding:0 0 16px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      ${img ? `<tr><td>${img}</td></tr>` : ''}
      <tr><td style="padding:16px;">
        ${post.category_label ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#2563eb;margin-bottom:6px;">${escapeHtml(post.category_label)}</div>` : ''}
        <a href="${url}" style="font-size:16px;font-weight:700;color:#0f172a;text-decoration:none;line-height:1.4;">${escapeHtml(post.title)}</a>
        ${post.excerpt ? `<p style="font-size:14px;color:#475569;margin:8px 0 0 0;line-height:1.5;">${escapeHtml(post.excerpt)}</p>` : ''}
        <a href="${url}" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:#2563eb;text-decoration:none;">Ler artigo →</a>
      </td></tr>
    </table>
  </td></tr>`;
}

function calculatorCardHtml(slug: string): string {
  const calc = CALCULATORS.find(c => c.slug === slug);
  if (!calc) return '';
  const url = `${SITE_URL}/${calc.slug}`;
  return `
  <tr><td style="padding:0 0 10px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;">
      <tr><td style="padding:14px 16px;">
        <a href="${url}" style="font-size:15px;font-weight:700;color:#0f172a;text-decoration:none;">🧮 ${escapeHtml(calc.nome)}</a>
        <p style="font-size:13px;color:#475569;margin:6px 0 0 0;line-height:1.4;">${escapeHtml(calc.desc)}</p>
        <a href="${url}" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:700;color:#2563eb;text-decoration:none;">Usar calculadora →</a>
      </td></tr>
    </table>
  </td></tr>`;
}

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

export async function renderCampaignHtml(campaign: Campaign, unsubscribeUrl: string): Promise<string> {
  const bodyHtml = marked.parse(campaign.body_markdown || '', { async: false }) as string;
  const articles = await fetchArticles(campaign.article_ids || []);
  const articlesHtml = articles.length
    ? `<tr><td style="padding:24px 0 8px 0;"><h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px 0;">📰 Artigos em destaque</h2></td></tr>
       <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${articles.map(articleCardHtml).join('')}</table></td></tr>`
    : '';

  const calcSlugs: string[] = campaign.calculator_slugs || [];
  const calcsHtml = calcSlugs.length
    ? `<tr><td style="padding:16px 0 8px 0;"><h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px 0;">🧮 Calculadoras úteis</h2></td></tr>
       <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${calcSlugs.map(calculatorCardHtml).join('')}</table></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(campaign.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">

  <tr><td style="background:#2563eb;padding:20px 24px;">
    <span style="color:#ffffff;font-size:18px;font-weight:800;">Calcula Prazo</span>
  </td></tr>

  <tr><td style="padding:24px;">
    <div style="font-size:15px;color:#0f172a;line-height:1.65;">${bodyHtml}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${articlesHtml}${calcsHtml}</table>
  </td></tr>

  <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <p style="font-size:12px;color:#64748b;margin:0 0 8px 0;line-height:1.5;">
      Você está recebendo este e-mail porque se inscreveu na newsletter do Calcula Prazo.
    </p>
    <a href="${unsubscribeUrl}" style="font-size:12px;color:#2563eb;text-decoration:underline;">Cancelar inscrição</a>
    <p style="font-size:11px;color:#94a3b8;margin:12px 0 0 0;">Calcula Prazo — calculaprazo.com.br</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
