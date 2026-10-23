// Renderizador do vídeo em slides animados (separado do Remotion do pipeline antigo).
// Uso (teste local):  node scripts/video-admin/render.mjs --cena cena.json --audio audio.mp3 --out pasta [--max-seg 20]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SLIDES = path.join(AQUI, 'slides');
export const FPS = 24;

export function duracaoDoAudio(arquivo) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo]).toString().trim();
  return parseFloat(out);
}

// Símbolos Lucide ("lu-nome") usados na cena, lidos da pasta slides/lucide.
function simbolosLucide(cena) {
  const ids = [...new Set(JSON.stringify(cena).match(/"lu-[a-z0-9-]+"/g) || [])].map(s => s.slice(1, -1));
  const faltando = [];
  const simbolos = ids.map(id => {
    const arq = path.join(SLIDES, 'lucide', id.slice(3) + '.svg');
    if (!fs.existsSync(arq)) { faltando.push(id); return ''; }
    const interno = fs.readFileSync(arq, 'utf-8').match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1];
    return `<symbol id="${id}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${interno}</g></symbol>`;
  });
  if (faltando.length) throw new Error(`Ícones Lucide fora da lista permitida: ${faltando.join(', ')}`);
  return ids.length ? `<svg width="0" height="0" style="position:absolute"><defs>${simbolos.join('')}</defs></svg>` : '';
}

function idsDoSite(cena) {
  const sprite = fs.readFileSync(path.join(SLIDES, 'icons.svg'), 'utf-8');
  const existentes = new Set([...sprite.matchAll(/symbol id="(ic-[a-z0-9-]+)"/g)].map(m => m[1]));
  const usados = [...new Set(JSON.stringify(cena).match(/"ic-[a-z0-9-]+"/g) || [])].map(s => s.slice(1, -1));
  const faltando = usados.filter(i => !existentes.has(i));
  if (faltando.length) throw new Error(`Ícones do site inexistentes: ${faltando.join(', ')}`);
  return sprite;
}

export function montarHtml(cena, destDir) {
  fs.mkdirSync(path.join(destDir, 'assets'), { recursive: true });
  for (const f of fs.readdirSync(path.join(SLIDES, 'fonts'))) fs.copyFileSync(path.join(SLIDES, 'fonts', f), path.join(destDir, 'assets', f));
  fs.copyFileSync(path.join(SLIDES, 'logo.png'), path.join(destDir, 'assets', 'logo.png'));
  const sprite = idsDoSite(cena);
  const extra = simbolosLucide(cena);
  const html = fs.readFileSync(path.join(SLIDES, 'template.html'), 'utf-8')
    .replaceAll('/*ICONS*/', () => sprite + extra)
    .replaceAll('/*CENA*/', () => JSON.stringify(cena));
  const arq = path.join(destDir, 'slides.html');
  fs.writeFileSync(arq, html);
  return arq;
}

async function renderizarTrecho(browser, htmlPath, largura, altura, dirFrames, ini, fim) {
  const page = await browser.newPage({ viewport: { width: largura, height: altura } });
  await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  for (let i = ini; i < fim; i++) {
    await page.evaluate(t => window.render(t), i / FPS);
    await page.screenshot({ path: path.join(dirFrames, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 });
  }
  await page.close();
}

export async function renderizar({ cena, audio, outDir, maxSeg, workers, log = console.log }) {
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = montarHtml(cena, outDir);
  const vertical = cena.formato === 'short';
  const [W, H] = vertical ? [1080, 1920] : [1920, 1080];
  const total = cena.cortes[cena.cortes.length - 1];
  const durRender = maxSeg ? Math.min(total, maxSeg) : total;
  const nFrames = Math.round(durRender * FPS);
  const dirFrames = path.join(outDir, 'frames');
  fs.rmSync(dirFrames, { recursive: true, force: true });
  fs.mkdirSync(dirFrames, { recursive: true });

  const n = Math.max(1, Math.min(workers || os.cpus().length, 4));
  log(`Renderizando ${nFrames} quadros (${W}x${H}, ${FPS} fps) com ${n} navegador(es)...`);
  const t0 = Date.now();
  const launch = { args: ['--no-sandbox'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launch);
  try {
    const por = Math.ceil(nFrames / n);
    await Promise.all(Array.from({ length: n }, (_, k) => {
      const ini = k * por, fim = Math.min(nFrames, ini + por);
      return ini < fim ? renderizarTrecho(browser, htmlPath, W, H, dirFrames, ini, fim) : null;
    }));
  } finally { await browser.close(); }
  log(`Quadros prontos em ${Math.round((Date.now() - t0) / 1000)} s.`);

  const mp4 = path.join(outDir, 'video.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dirFrames, '%05d.jpg'),
    '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-maxrate', '8000k', '-bufsize', '16000k', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-t', String(durRender), '-movflags', '+faststart', mp4], { stdio: 'inherit' });

  // Capa = primeiro quadro (miniatura do YouTube em 1280x720 só no vídeo horizontal).
  let thumb = null;
  if (!vertical) {
    const b2 = await chromium.launch(launch);
    try {
      const pg = await b2.newPage({ viewport: { width: 1920, height: 1080 } });
      await pg.goto('file://' + path.resolve(htmlPath), { waitUntil: 'domcontentloaded' });
      await pg.evaluate(() => document.fonts.ready);
      await pg.waitForTimeout(500);
      await pg.evaluate(() => window.render(0));
      const grande = path.join(outDir, 'capa_1920.png');
      await pg.screenshot({ path: grande });
      thumb = path.join(outDir, 'thumbnail.png');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', grande, '-vf', 'scale=1280:720:flags=lanczos', thumb]);
    } finally { await b2.close(); }
  }
  return { mp4, thumbnail: thumb, htmlPath };
}

// CLI de teste
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = n => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : undefined; };
  const cena = JSON.parse(fs.readFileSync(arg('cena'), 'utf-8'));
  renderizar({ cena, audio: arg('audio'), outDir: arg('out'), maxSeg: arg('max-seg') ? Number(arg('max-seg')) : undefined, workers: arg('workers') ? Number(arg('workers')) : undefined })
    .then(r => console.log('OK', r)).catch(e => { console.error(e); process.exit(1); });
}
