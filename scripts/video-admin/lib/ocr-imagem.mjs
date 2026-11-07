// Detecta LETRAS dentro de uma imagem gerada por IA (o gerador desenha palavras mesmo quando o pedido diz "sem texto":
// "Law", "FINAL JUDGEMEON", rabiscos que parecem escrita). Usa o Tesseract (CLI) no próprio runner do GitHub.
// Se o Tesseract não estiver instalado, não bloqueia nada: devolve { disponivel: false } e o pipeline segue como antes.
//
// Regras (calibradas em quadros reais: "Law" lido com confiança 96, ruído de desenho limpo no máximo 66):
//   A) palavra só de letras, ≥ 3 letras, confiança ≥ IMG_OCR_CONF (80)
//   B) palavra só de letras, ≥ 5 letras, confiança ≥ 60
//   C) ≥ 3 palavras só de letras (≥ 3 letras) com confiança ≥ 50: escrita ilegível/rabiscada
// Env: IMG_OCR=0 desliga | IMG_OCR_CONF ajusta a regra A | OCR_LANGS (padrão: eng+por, o que estiver instalado)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONF_A = Number(process.env.IMG_OCR_CONF) || 80;
let _langs, _aviso = false;

function idiomas() {
  if (_langs !== undefined) return _langs;
  const r = spawnSync('tesseract', ['--list-langs'], { encoding: 'utf8', timeout: 15000 });
  if (r.error || r.status !== 0) return (_langs = null);
  const instalados = new Set(r.stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const pedidos = (process.env.OCR_LANGS || 'eng+por').split('+').filter((l) => instalados.has(l));
  return (_langs = pedidos.length ? pedidos.join('+') : null);
}

export function ocrDisponivel() { return process.env.IMG_OCR !== '0' && !!idiomas(); }

export function classificarPalavras(palavras) {
  const so = (t) => /^[A-Za-zÀ-ÿ]+$/.test(t);
  const letras = palavras.filter((p) => so(p.texto));
  const a = letras.filter((p) => p.texto.length >= 3 && p.conf >= CONF_A);
  const b = letras.filter((p) => p.texto.length >= 5 && p.conf >= 60);
  const c = letras.filter((p) => p.texto.length >= 3 && p.conf >= 50);
  const achadas = new Map();
  for (const p of [...a, ...b, ...(c.length >= 3 ? c : [])]) achadas.set(p.texto.toLowerCase(), p);
  return { temTexto: achadas.size > 0, palavras: [...achadas.values()].map((p) => p.texto), pontuacao: [...achadas.values()].reduce((s, p) => s + p.conf, 0) };
}

/** { disponivel, temTexto, palavras, pontuacao } para o arquivo de imagem (png/jpg/webp). */
export function detectarTexto(arquivo) {
  if (process.env.IMG_OCR === '0') return { disponivel: false };
  const lang = idiomas();
  if (!lang) {
    if (!_aviso) { _aviso = true; console.warn('    OCR das imagens indisponível (Tesseract não instalado): imagens seguem sem checagem de texto.'); }
    return { disponivel: false };
  }
  const tmp = path.join(os.tmpdir(), `ocr_${process.pid}_${Date.now()}.png`);
  try {
    // converte para PNG (o Tesseract nem sempre lê webp) e amplia imagens pequenas
    const c = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', arquivo, '-vf', "scale='max(iw,1200)':-2,format=gray", tmp], { timeout: 60000 });
    const origem = c.status === 0 && fs.existsSync(tmp) ? tmp : arquivo;
    const r = spawnSync('tesseract', [origem, 'stdout', '-l', lang, '--psm', '11', 'tsv'], { encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024 });
    if (r.error || r.status !== 0) return { disponivel: false };
    const palavras = [];
    for (const linha of r.stdout.split(/\r?\n/).slice(1)) {
      const col = linha.split('\t');
      if (col.length < 12 || col[0] !== '5') continue;
      const conf = parseFloat(col[10]); const texto = (col[11] || '').trim();
      if (texto && Number.isFinite(conf) && conf >= 0) palavras.push({ texto, conf });
    }
    return { disponivel: true, ...classificarPalavras(palavras) };
  } finally { try { fs.unlinkSync(tmp); } catch { /* sem arquivo temporário */ } }
}
