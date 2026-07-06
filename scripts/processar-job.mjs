import { execFileSync } from 'node:child_process';
import { getJob } from './lib/supabase.mjs';

// Ordem das etapas e a partir de qual status cada uma deve rodar.
const ETAPAS = [
  { apos: 'queued', script: 'scripts/02-gerar-roteiro.mjs' },
  { apos: 'roteiro_ok', script: 'scripts/03-narracao.py' },
  { apos: 'narracao_ok', script: 'scripts/04-legendas.py' },
  { apos: 'legendas_ok', script: 'scripts/05-imagens.mjs' },
  { apos: 'imagens_ok', script: 'scripts/06-thumbnail.mjs' },
  { apos: 'thumbnail_ok', script: 'scripts/07-render.mjs' },
  { apos: 'render_ok', script: 'scripts/08-publicar-youtube.mjs' },
];

function statusParaIndice(status) {
  if (status === 'erro') return null; // tratado à parte abaixo
  const idx = ETAPAS.findIndex(e => e.apos === status);
  return idx === -1 ? 0 : idx; // 'queued' ou desconhecido -> começa do início
}

async function main(jobId) {
  const job = await getJob(jobId);

  let indiceInicial;
  if (job.status === 'erro') {
    // Retoma a partir da etapa que falhou (não da anterior, que já está concluída).
    const idxFalha = ETAPAS.findIndex(e => e.script.includes(job.erro_etapa));
    indiceInicial = idxFalha === -1 ? 0 : idxFalha;
  } else if (job.status === 'publicado') {
    console.log(`Job ${jobId} já publicado. Nada a fazer.`);
    return;
  } else {
    indiceInicial = statusParaIndice(job.status);
  }

  for (let i = indiceInicial; i < ETAPAS.length; i++) {
    const { script } = ETAPAS[i];
    console.log(`\n=== Job ${jobId}: rodando ${script} ===`);
    const comando = script.endsWith('.py') ? 'python3' : 'node';
    execFileSync(comando, [script, jobId], { stdio: 'inherit' });
  }
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Uso: node processar-job.mjs <job_id>');
  process.exit(1);
}
main(jobId).catch(err => {
  console.error(`Job ${jobId} falhou:`, err.message);
  process.exit(1);
});
