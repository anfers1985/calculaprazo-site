import { marked } from 'npm:marked@12';
import { CALCULATORS } from './calculators-list.ts';

const SITE_URL = 'https://calculaprazo.com.br';
const LOGO_URL = `${SITE_URL}/icon-192.png`;

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

// Card do primeiro artigo — maior, com imagem em cima (quando disponível) e
// resumo completo, dando destaque de "matéria principal".
function featuredArticleHtml(post: Post & { show_image: boolean }): string {
  const url = `${SITE_URL}/blog/${post.id}.html`;
  const img = post.show_image && post.image
    ? `<tr><td><img src="${escapeAttr(post.image)}" alt="" width="544" style="width:100%;max-width:544px;height:220px;object-fit:cover;display:block;"></td></tr>`
    : '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:18px;">
    ${img}
    <tr><td style="padding:18px 20px;">
      ${post.category_label ? `<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#2563eb;margin-bottom:6px;">${escapeHtml(post.category_label)}</div>` : ''}
      <a href="${url}" style="font-size:18px;font-weight:800;color:#0f172a;text-decoration:none;line-height:1.35;">${escapeHtml(post.title)}</a>
      ${post.excerpt ? `<p style="font-size:14px;color:#475569;margin:8px 0 0 0;line-height:1.55;">${escapeHtml(post.excerpt)}</p>` : ''}
      <a href="${url}" style="display:inline-block;margin-top:12px;font-size:13px;font-weight:700;color:#2563eb;text-decoration:none;">Ler artigo completo →</a>
    </td></tr>
  </table>`;
}

// Cards dos artigos seguintes — miniatura ao lado do texto, mais compacto.
function secondaryArticleHtml(post: Post & { show_image: boolean }): string {
  const url = `${SITE_URL}/blog/${post.id}.html`;
  const thumb = post.show_image && post.image
    ? `<td width="100" valign="top" style="padding:16px 0 16px 16px;"><img src="${escapeAttr(post.image)}" alt="" width="84" height="84" style="width:84px;height:84px;object-fit:cover;border-radius:8px;display:block;"></td>`
    : '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:14px;">
    <tr>
      ${thumb}
      <td valign="top" style="padding:16px;">
        ${post.category_label ? `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#2563eb;margin-bottom:4px;">${escapeHtml(post.category_label)}</div>` : ''}
        <a href="${url}" style="font-size:15px;font-weight:700;color:#0f172a;text-decoration:none;line-height:1.35;">${escapeHtml(post.title)}</a>
        ${post.excerpt ? `<p style="font-size:13px;color:#475569;margin:6px 0 0 0;line-height:1.5;">${escapeHtml(post.excerpt)}</p>` : ''}
        <a href="${url}" style="display:inline-block;margin-top:8px;font-size:12.5px;font-weight:700;color:#2563eb;text-decoration:none;">Ler artigo completo →</a>
      </td>
    </tr>
  </table>`;
}

function calculatorCellHtml(slug: string): string {
  const calc = CALCULATORS.find(c => c.slug === slug);
  if (!calc) return '<td width="48%"></td>';
  const url = `${SITE_URL}/${calc.slug}`;
  return `
  <td width="48%" valign="top" style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;">
    <div style="font-size:22px;margin-bottom:6px;">${calc.icon}</div>
    <a href="${url}" style="font-size:14px;font-weight:800;color:#0f172a;text-decoration:none;">${escapeHtml(calc.nome)}</a>
    <p style="font-size:12px;color:#64748b;margin:5px 0 0 0;line-height:1.4;">${escapeHtml(calc.desc)}</p>
    <a href="${url}" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:#2563eb;text-decoration:none;">Usar →</a>
  </td>`;
}

// Monta a grade de calculadoras em pares (2 colunas), igual ao modelo
// aprovado. Se sobrar uma ímpar, a última linha fica com uma célula vazia.
function calculatorsGridHtml(slugs: string[]): string {
  if (!slugs.length) return '';
  const rows: string[] = [];
  for (let i = 0; i < slugs.length; i += 2) {
    const left = calculatorCellHtml(slugs[i]);
    const right = slugs[i + 1] ? calculatorCellHtml(slugs[i + 1]) : '<td width="48%"></td>';
    rows.push(`<tr>${left}<td width="4%"></td>${right}</tr>`);
  }
  return `
  <tr><td style="padding:24px 28px 4px 28px;">
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Calculadoras úteis</div>
  </td></tr>
  <tr><td style="padding:16px 28px 24px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>
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

  let articlesHtml = '';
  if (articles.length) {
    const [first, ...rest] = articles;
    articlesHtml = `
    <tr><td style="padding:20px 28px 4px 28px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#94a3b8;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">Artigos em destaque</div>
    </td></tr>
    <tr><td style="padding:16px 28px 0 28px;">
      ${featuredArticleHtml(first)}
      ${rest.map(secondaryArticleHtml).join('')}
    </td></tr>`;
  }

  const calcsHtml = calculatorsGridHtml(campaign.calculator_slugs || []);

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

  <!-- CABEÇALHO -->
  <tr><td style="background:#1e3a8a;padding:24px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px;"><img src="${LOGO_URL}" width="36" height="36" style="width:36px;height:36px;border-radius:8px;display:block;" alt="Calcula Prazo"></td>
      <td valign="middle">
        <div style="color:#ffffff;font-size:19px;font-weight:800;line-height:1.1;">Calcula Prazo</div>
        <div style="color:rgba(255,255,255,.65);font-size:11px;margin-top:2px;">Calculadoras e conteúdo jurídico-trabalhista</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- TEXTO LIVRE (Markdown) -->
  <tr><td style="padding:28px 28px 8px 28px;">
    <div style="font-size:15px;color:#0f172a;line-height:1.65;">${bodyHtml}</div>
  </td></tr>

  ${articlesHtml}
  ${calcsHtml}

  <!-- RODAPÉ -->
  <tr><td style="padding:24px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px;"><img src="${LOGO_URL}" width="28" height="28" style="width:28px;height:28px;border-radius:6px;display:block;" alt=""></td>
      <td valign="middle" style="font-size:13px;font-weight:800;color:#0f172a;">Calcula Prazo</td>
    </tr></table>
    <p style="font-size:12px;color:#64748b;margin:12px 0 8px 0;line-height:1.5;">Calculadoras jurídicas gratuitas e conteúdo especializado em Direito do Trabalho, para advogados, contadores, profissionais de RH e trabalhadores.</p>
    <p style="font-size:12px;color:#64748b;margin:0 0 12px 0;">Você está recebendo este e-mail porque se inscreveu na newsletter do Calcula Prazo.</p>
    <a href="${unsubscribeUrl}" style="font-size:12px;color:#2563eb;text-decoration:underline;">Cancelar inscrição</a>
    <p style="font-size:11px;color:#94a3b8;margin:14px 0 0 0;">Calcula Prazo — calculaprazo.com.br</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
