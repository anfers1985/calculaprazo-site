// Título, descrição, tags e privacidade do YouTube a partir do roteiro (sem banco: usado também no modo local).
import { montarCapitulos } from './cena.mjs';

const limpar = s => String(s || '').replace(/[<>]/g, '');

export function montarMetadados(job, agora = new Date()) {
  const r = job.roteiro || {};
  const longo = job.tipo === 'longo';
  let titulo = limpar(r.titulo_seo || job.post_titulo || 'Calcula Prazo').trim();
  if (longo && !/direto ao ponto/i.test(titulo) && (titulo + ' | Direto ao Ponto').length <= 100) titulo += ' | Direto ao Ponto';
  titulo = titulo.slice(0, 100);
  let hashtags = (r.hashtags || []).map(h => '#' + String(h).replace(/^#+/, '').replace(/\s+/g, ''));
  if (!longo && !hashtags.some(h => h.toLowerCase() === '#shorts')) hashtags = ['#Shorts', ...hashtags];
  const capitulos = longo ? montarCapitulos(r, r.cortes_reais || []) : [];
  const partes = [limpar(r.descricao), `Leia o artigo completo: ${job.post_url}`];
  if (capitulos.length) partes.push(capitulos.join('\n'));
  partes.push('🔔 Inscreva-se no canal Calcula Prazo para acompanhar mais conteúdos sobre Direito do Trabalho.');
  partes.push(hashtags.join(' '));
  partes.push('Este vídeo tem caráter informativo e não substitui consulta jurídica individualizada.');
  let privacyStatus = 'private', publishAt;
  if (job.publicacao === 'publico') privacyStatus = 'public';
  else if (job.publicacao === 'agendado') {
    const quando = job.agendar_em ? new Date(job.agendar_em) : null;
    if (quando && quando.getTime() > agora.getTime() + 10 * 60 * 1000) publishAt = quando.toISOString(); // YouTube exige data futura (e vídeo privado até lá)
    else privacyStatus = 'public'; // horário já passou: publica agora
  }
  return { titulo, descricao: partes.join('\n\n').slice(0, 4900), tags: hashtags.map(h => h.slice(1)).slice(0, 15), privacyStatus, publishAt, capitulos };
}
