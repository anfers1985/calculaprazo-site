// Orquestrador do pipeline de vídeos do admin:  node processar.mjs <job_id>
// Etapas: roteiro → narração → render → publicação. Retoma de onde parou se o job estiver em "erro".
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJob, updateJob, marcarErro, enviarArquivo, baixarArquivo, caminhoStorage } from './lib/db.mjs';
import { etapaRoteiro } from './roteiro.mjs';
import { etapaPublicar } from './publicar.mjs';
import { roteiroParaCena } from './lib/cena.mjs';
import { renderizar, duracaoDoAudio } from './render.mjs';
import { imagensDoJob } from './lib/imagens-job.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_STORAGE_MB = 48; // limite de arquivo do plano gratuito do Supabase é 50 MB

// Cópia para download que cabe no limite do Storage: recodifica com bitrate calculado a partir da duração (o original segue para o YouTube).
function compactarParaStorage(mp4, durSeg) {
  const saida = mp4.replace(/\.mp4$/i, '_download.mp4');
  const alvoKbps = Math.floor(((LIMITE_STORAGE_MB * 0.9 * 8 * 1024) / Math.max(durSeg, 1)) - 128);
  if (alvoKbps < 300) return null;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${alvoKbps}k`, '-maxrate', `${Math.floor(alvoKbps * 1.2)}k`, '-bufsize', `${alvoKbps * 2}k`, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', saida], { stdio: 'inherit' });
  return fs.statSync(saida).size / 1048576 <= LIMITE_STORAGE_MB ? saida : null;
}

async function etapaNarracao(jobId) {
  const r = spawnSync('python3', [path.join(AQUI, 'narracao.py'), jobId], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw new Error(`narracao.py terminou com código ${r.status}`);
}

async function etapaRender(jobId) {
  const job = await getJob(jobId);
  await updateJob(jobId, { etapa_atual: 'render' });
  const audio = await baixarArquivo(job.narracao_path, path.resolve('output/audio/narracao.mp3'));
  const cena = roteiroParaCena(job.roteiro, job.tipo, duracaoDoAudio(audio), job.estilo || 'slides');
  if (job.estilo === 'ilustrado') {
    // imagens por IA (com Storage como cache); cena sem imagem vira cartão de papel
    const arquivos = await imagensDoJob(job, path.resolve('output/imagens'));
    cena.cenas.forEach((c, i) => { c.imagem_arquivo = arquivos[i] || null; });
  }
  const { mp4, thumbnail } = await renderizar({ cena, audio, outDir: path.resolve('output/render') });
  const mb = fs.statSync(mp4).size / 1048576;
  const campos = { status: 'render_ok', erro_etapa: null, erro_mensagem: null, roteiro: { ...job.roteiro, cortes_reais: cena.cortes } };
  if (mb <= LIMITE_STORAGE_MB) campos.video_path = await enviarArquivo(mp4, caminhoStorage(jobId, 'video.mp4'), 'video/mp4');
  else {
    let copia = null;
    try { copia = compactarParaStorage(mp4, duracaoDoAudio(audio)); } catch (e) { console.warn('Recompressão para o Storage falhou:', e.message); }
    if (copia) { campos.video_path = await enviarArquivo(copia, caminhoStorage(jobId, 'video.mp4'), 'video/mp4'); console.log(`Vídeo com ${mb.toFixed(0)} MB: guardada uma cópia recomprimida (${(fs.statSync(copia).size / 1048576).toFixed(0)} MB) para baixar no admin; o original segue para o YouTube.`); }
    else console.log(`Vídeo com ${mb.toFixed(0)} MB: acima do limite do Storage e não coube nem recomprimido; segue direto para o YouTube sem guardar cópia.`);
  }
  if (thumbnail) campos.thumbnail_path = await enviarArquivo(thumbnail, caminhoStorage(jobId, 'thumbnail.png'), 'image/png');
  await updateJob(jobId, campos);
  console.log(`Render concluído (${mb.toFixed(1)} MB).`);
}

export const ETAPAS = [
  { nome: 'roteiro', apos: 'na_fila', run: etapaRoteiro },
  { nome: 'narracao', apos: 'roteiro_ok', run: etapaNarracao },
  { nome: 'render', apos: 'narracao_ok', run: etapaRender },
  { nome: 'publicacao', apos: 'render_ok', run: async id => {
    // se o arquivo local não existe (nova execução) e não há cópia no Storage, refaz o render
    const j = await getJob(id);
    if (!fs.existsSync(path.resolve('output/render/video.mp4')) && !j.video_path) await etapaRender(id);
    await etapaPublicar(id);
  } },
];

export function etapaInicial(job) {
  if (job.status === 'publicado') return -1;
  if (job.status === 'erro') { const i = ETAPAS.findIndex(e => e.nome === job.erro_etapa); return i < 0 ? 0 : i; }
  const i = ETAPAS.findIndex(e => e.apos === job.status);
  return i < 0 ? 0 : i;
}

export async function processarUm(jobId) {
  const job = await getJob(jobId);
  if (process.env.GITHUB_RUN_ID) await updateJob(jobId, { github_run_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` });
  const ini = etapaInicial(job);
  if (ini < 0) { console.log('Job já publicado.'); return true; }
  for (let i = ini; i < ETAPAS.length; i++) {
    const e = ETAPAS[i];
    console.log(`\n===== Etapa: ${e.nome} =====`);
    await updateJob(jobId, { status: e.apos, etapa_atual: e.nome, erro_etapa: null, erro_mensagem: null });
    try { await e.run(jobId); }
    catch (err) { console.error(`Falha na etapa ${e.nome}:`, err); await marcarErro(jobId, e.nome, err.message || err); return false; }
  }
  console.log('\nJob concluído.');
  return true;
}

// Aceita um ou vários ids separados por vírgula (o botão "Gerar o par do dia" manda os dois no mesmo workflow,
// que roda um depois do outro). Cada job usa sua própria pasta de trabalho.
async function main(ids) {
  let ok = true;
  for (const [n, id] of ids.entries()) {
    console.log(`\n######## Job ${n + 1}/${ids.length}: ${id} ########`);
    if (n > 0) fs.rmSync(path.resolve('output'), { recursive: true, force: true });
    try { if (!(await processarUm(id))) ok = false; }
    catch (e) { console.error(`Job ${id} falhou:`, e); ok = false; }
  }
  return ok;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ids = String(process.argv[2] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!ids.length) { console.error('Uso: node processar.mjs <job_id>[,<job_id>...]'); process.exit(1); }
  main(ids).then(ok => process.exit(ok ? 0 : 1)).catch(e => { console.error(e); process.exit(1); });
}
