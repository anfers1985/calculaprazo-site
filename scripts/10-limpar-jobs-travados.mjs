// Limpeza de arquivos "esquecidos" no Storage. Cobre dois casos:
//
// 1) Jobs travados em erro, com tentativas esgotadas (MAX_TENTATIVAS em
//    listar-pendentes.mjs) — nunca mais vão ser reprocessados, então os
//    arquivos que sobraram (áudio, imagens, vídeo, thumbnail) não servem
//    pra nada.
//
// 2) Jobs já publicados que ainda têm arquivo no Storage — descoberto que a
//    limpeza pós-publicação (limparComSeguranca em 08-publicar-youtube.mjs)
//    só passou a funcionar de fato a partir de um certo ponto; jobs publicados
//    antes disso nunca tiveram os arquivos removidos e, por já estarem com
//    status "publicado", o pipeline nunca mais vai tocar neles. É seguro
//    limpar: o vídeo já está no YouTube, o arquivo no Storage não é mais
//    reaproveitado por nada.
//
// Uso:
//   node scripts/10-limpar-jobs-travados.mjs           → aplica a limpeza
//   node scripts/10-limpar-jobs-travados.mjs --dry-run  → só mostra o que seria apagado

import { supabase, apagarArquivosDoJob } from './lib/supabase.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_TENTATIVAS = 5; // mesmo valor usado em listar-pendentes.mjs

const { data: jobs, error } = await supabase
  .from('video_jobs')
  .select('id, status, tentativas, erro_etapa, criado_em')
  .or(`status.eq.publicado,and(status.eq.erro,tentativas.gte.${MAX_TENTATIVAS})`);

if (error) throw new Error(`Falha ao buscar jobs: ${error.message}`);

if (!jobs.length) {
  console.log('Nenhum job candidato à limpeza encontrado.');
  process.exit(0);
}

const travados = jobs.filter(j => j.status === 'erro');
const publicados = jobs.filter(j => j.status === 'publicado');

console.log(`Candidatos à limpeza: ${jobs.length} (${travados.length} travado(s) em erro, ${publicados.length} publicado(s)).`);
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
