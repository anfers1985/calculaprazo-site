// Limpeza de jobs de vídeo travados em erro.
//
// O motivo do estouro de Storage no Supabase: `apagarArquivosDoJob` (em lib/supabase.mjs)
// só é chamada em 08-publicar-youtube.mjs, depois que o vídeo publica com sucesso.
// Um job que falha em qualquer etapa (narração, imagem, render, upload) fica com
// áudio + imagens de cena + vídeo renderizado + thumbnail parados no bucket `pipeline`
// pra sempre — mesmo depois de esgotar as tentativas (MAX_TENTATIVAS = 5 em
// listar-pendentes.mjs) e nunca mais ser reprocessado.
//
// Este script varre a tabela `video_jobs` atrás desses jobs "mortos" e apaga os
// arquivos deles do Storage, liberando espaço. Não mexe na tabela em si (não apaga
// a linha, só os arquivos) — assim o histórico de erro continua consultável.
//
// Uso:
//   node scripts/10-limpar-jobs-travados.mjs           → aplica a limpeza
//   node scripts/10-limpar-jobs-travados.mjs --dry-run  → só mostra o que seria apagado

import { supabase, apagarArquivosDoJob } from './lib/supabase.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_TENTATIVAS = 5; // mesmo valor usado em listar-pendentes.mjs

// Jobs com status "erro" e tentativas >= MAX_TENTATIVAS não vão ser reprocessados
// nunca mais (listar-pendentes.mjs os exclui explicitamente). Esses são candidatos
// seguros à limpeza: não há risco de apagar arquivo que ainda vai ser usado num retry.
const { data: jobs, error } = await supabase
  .from('video_jobs')
  .select('id, status, tentativas, erro_etapa, updated_at')
  .eq('status', 'erro')
  .gte('tentativas', MAX_TENTATIVAS);

if (error) throw new Error(`Falha ao buscar jobs travados: ${error.message}`);

if (!jobs.length) {
  console.log('Nenhum job travado em erro (com tentativas esgotadas) encontrado. Nada a limpar.');
  process.exit(0);
}

console.log(`Encontrados ${jobs.length} job(s) travado(s) em erro:`);
for (const job of jobs) {
  console.log(`  - ${job.id} | etapa: ${job.erro_etapa || '?'} | tentativas: ${job.tentativas} | atualizado em: ${job.updated_at}`);
}

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
