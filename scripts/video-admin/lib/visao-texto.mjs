// Segunda checagem de ESCRITA nas imagens geradas por IA, com um modelo que enxerga (Gemini). O Tesseract só lê letra "de impressora": palavras
// desenhadas à mão, tortas ou estilizadas ("Termination", "PAYRLID", "November") passam por ele e acabam no vídeo, em inglês ou garrafais.
// Só roda DEPOIS que o Tesseract aprovou a imagem. Qualquer problema (sem chave, cota, timeout, resposta estranha) NÃO bloqueia: devolve { disponivel:false }.
// Env: IMG_VISAO=0 desliga | IMG_VISAO_MODELO (padrão gemini-3.5-flash-lite, o mesmo do roteiro) | chaves GEMINI_API_KEY / GEMINI_API_KEY_2
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODELO = process.env.IMG_VISAO_MODELO || 'gemini-3.5-flash-lite';
const PROMPT = 'You are checking an AI-generated illustration for writing. Does the image contain ANY visible writing: words, letters, numbers, captions, labels, ' +
  'signs, stamps, page titles, or letter-like scribbles (even if misspelled, garbled, handwritten, curved, tilted, tiny or in the background, in any language)? ' +
  'Digits on a clock face or calculator keys do NOT count. Answer ONLY with JSON: {"escrita": true or false, "palavras": ["up to 5 words you can read"]}.';
let desligado = process.env.IMG_VISAO === '0';
let avisou = false;

export function visaoDisponivel() { return !desligado && !!(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2); }

export function interpretarRespostaVisao(texto) {
  const m = String(texto || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (typeof j.escrita !== 'boolean') return null;
    return { temTexto: j.escrita, palavras: (Array.isArray(j.palavras) ? j.palavras : []).map(String).filter(Boolean).slice(0, 5) };
  } catch { return null; }
}

/** { disponivel, temTexto, palavras } para o arquivo de imagem (png/jpg/webp). */
export async function visaoTemEscrita(arquivo) {
  if (!visaoDisponivel()) return { disponivel: false };
  const tmp = path.join(os.tmpdir(), `visao_${process.pid}_${Date.now()}.jpg`);
  try {
    const c = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', arquivo, '-vf', "scale='min(iw,1024)':-2", '-q:v', '3', tmp], { timeout: 60000 });
    const origem = c.status === 0 && fs.existsSync(tmp) ? tmp : arquivo;
    const mime = origem === tmp ? 'image/jpeg' : (/\.png$/i.test(arquivo) ? 'image/png' : /\.webp$/i.test(arquivo) ? 'image/webp' : 'image/jpeg');
    const b64 = fs.readFileSync(origem).toString('base64');
    const corpo = {
      contents: [{ parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: PROMPT }] }],
      generationConfig: { maxOutputTokens: 300, responseMimeType: 'application/json', ...(MODELO.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : /2\.5/.test(MODELO) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    };
    for (const chave of [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean)) {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 40000);
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave }, body: JSON.stringify(corpo), signal: ctl.signal });
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          const v = interpretarRespostaVisao((data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' '));
          if (v) return { disponivel: true, ...v };
          continue;
        }
        if (r.status === 404 || r.status === 400) { desligado = true; if (!avisou) { avisou = true; console.warn(`    Checagem visual das imagens desligada: ${String(data?.error?.message || r.status).slice(0, 140)}`); } return { disponivel: false }; }
        // 429/5xx/401: tenta a outra chave; se nenhuma serve, segue sem a checagem (não trava o vídeo)
      } catch { /* timeout/rede: próxima chave */ } finally { clearTimeout(to); }
    }
    return { disponivel: false };
  } catch { return { disponivel: false }; } finally { try { fs.unlinkSync(tmp); } catch { /* sem temporário */ } }
}
