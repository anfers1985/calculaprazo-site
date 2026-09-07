// Limpeza de arquivos no Storage. Cobre dois casos:
//
// 1) Jobs travados em erro, com tentativas esgotadas (MAX_TENTATIVAS em
//    listar-pendentes.mjs) — nunca mais vão ser reprocessados, então os
//    arquivos que sobraram (áudio, imagens, vídeo, thumbnail) não servem
//    pra nada.
//
// 2) Jobs já publicados cuja janela de retenção (RETENCAO_DIAS, a partir de
//    `publicado_em`) já venceu. Enquanto dentro da janela, os arquivos ficam
//    guardados de propósito: é o que alimenta a aba "Vídeos p/ Redes" no
//    admin, pra dar tempo de baixar vídeo/capa/título/descrição e postar
//    manualmente no X, Instagram, Facebook, LinkedIn e TikTok antes de
//    expirar. Depois da janela, é seguro limpar: o vídeo já está no
//    YouTube, o arquivo no Storage não é mais reaproveitado por nada — e
//    isso evita estourar o limite de 1 GB do plano gratuito do Supabase.
//
// Uso:
//   node scripts/10-limpar-jobs-travados.mjs           → aplica a limpeza
//   node scripts/10-limpar-jobs-travados.mjs --dry-run  → só mostra o que seria apagado

import { supabase, apagarArquivosDoJob } from './lib/supabase.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_TENTATIVAS = 5; // mesmo valor usado em listar-pendentes.mjs
const RETENCAO_DIAS = 5; // mesmo valor considerado em supabase/functions/videos-admin/index.ts

const cutoff = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000).toISOString();

const { data: jobs, error } = await supabase
  .from('video_jobs')
  .select('id, status, tentativas, erro_etapa, criado_em, publicado_em')
  .or(
    `and(status.eq.publicado,publicado_em.lte.${cutoff}),` +
    `and(status.eq.publicado,publicado_em.is.null),` +
    `and(status.eq.erro,tentativas.gte.${MAX_TENTATIVAS})`
  );

if (error) throw new Error(`Falha ao buscar jobs: ${error.message}`);

if (!jobs.length) {
  console.log('Nenhum job candidato à limpeza encontrado.');
  process.exit(0);
}

const travados = jobs.filter(j => j.status === 'erro');
const publicados = jobs.filter(j => j.status === 'publicado');

console.log(`Retenção configurada: ${RETENCAO_DIAS} dia(s) após publicado_em.`);
console.log(`Candidatos à limpeza: ${jobs.length} (${travados.length} travado(s) em erro, ${publicados.length} publicado(s) fora da janela de retenção).`);
for (const job of travados) {
  console.log(`  [erro]      ${job.id} | etapa: ${job.erro_etapa || '?'} | tentativas: ${job.tentativas} | criado em: ${job.criado_em}`);
}
console.log(`  [publicado] ${publicados.length} job(s) — lista completa suprimida (é volume grande); confira o total apagado no resumo final.`);

if (DRY_RUN) {
  console.log('\n--dry-run ativo: nenhum arquivo foi apagado.');
  process.exit(0);
}

console.log('\nApagando arquivos do Storage...');
let ok = 0;
let falhou = 0;
for (const job of jobs) {
  try {
    await apagarArquivosDoJob(job.id);
    ok++;
  } catch (err) {
    console.error(`Falha ao limpar job ${job.id}: ${err.message}`);
    falhou++;
  }
}

console.log(`\nConcluído: ${ok} job(s) limpo(s), ${falhou} falha(s).`);
