import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { getJob, updateJob, marcarErro, enviarArquivo } from './lib/supabase.mjs';

const OUTPUT_DIR = 'output/imagens';

const ESTILO_FIXO =
  ' Identidade visual: fundo azul marinho, acentos em dourado/azul claro, ' +
  'fotografia editorial ou ilustração 3D limpa, alta definição, iluminação profissional, ' +
  'foco nítido, estilo institucional. Proibido: texto, letras, números, palavras, ' +
  'tipografia, placas, documentos com escrita, legendas, marca d\'água.';

const NEGATIVO =
  'texto, letras, números, palavras, tipografia, escrita, placas, documentos, ' +
  'legendas, marca d\'água, borrado, baixa qualidade, distorcido, deformado';

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function gerarImagem(prompt, destino, { width = 1350, height = 2400 } = {}) {
  const promptCompleto = encodeURIComponent(prompt + ESTILO_FIXO);
  const seed = Math.floor(Math.random() * 1_000_000);
  const url =
    `https://image.pollinations.ai/prompt/${promptCompleto}` +
    `?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}` +
    `&enhance=true&negative=${encodeURIComponent(NEGATIVO)}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Pollinations respondeu ${r.status}: ${await r.text().catch(() => '')}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length < 1000) throw new Error('Resposta da Pollinations veio vazia/pequena demais, provável falha.');
  fs.writeFileSync(destino, buffer);
}

// Tela final (CTA) é sempre renderizada por código, nunca por IA — garante
// texto correto e visual nítido/on-brand, já que a mensagem é sempre a mesma.
async function gerarCenaFinal(destino) {
  const html = `<!doctype html><html><head><style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
    body{margin:0;width:1080px;height:1920px;position:relative;overflow:hidden;
      background:radial-gradient(circle at 50% 40%, #0D2154 0%, #0A1628 70%);
      font-family:'Outfit',sans-serif;display:flex;align-items:center;justify-content:center;}
    .glow{position:absolute;width:900px;height:900px;border-radius:50%;
      background:radial-gradient(circle, rgba(244,197,66,0.18) 0%, transparent 70%);}
    .conteudo{position:relative;text-align:center;padding:0 90px;}
    .marca{font-size:78px;font-weight:800;color:#F4C542;letter-spacing:-1px;}
    .sub{margin-top:28px;font-size:40px;font-weight:600;color:#fff;line-height:1.4;}
    .botao{margin-top:56px;display:inline-block;padding:22px 48px;border-radius:100px;
      background:#F4C542;color:#0A1628;font-size:36px;font-weight:800;}
  </style></head><body>
    <div class="glow"></div>
    <div class="conteudo">
      <div class="marca">calculaprazo.com.br</div>
      <div class="sub">Conheça seus direitos<br/>trabalhistas de graça</div>
      <div class="botao">Acesse agora</div>
    </div>
  </body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html);
  await page.waitForTimeout(300); // dá tempo da fonte web carregar
  await page.screenshot({ path: destino });
  await browser.close();
}

async function gerarFallback(destino) {
  const html = `<!doctype html><html><head><style>
    body{margin:0;width:1080px;height:1920px;background:linear-gradient(160deg,#0A1628,#0D2154);
    display:flex;align-items:center;justify-content:center;}
    .marca{font-family:'Outfit',sans-serif;font-size:56px;color:#fff;opacity:.35;}
  </style></head><body><div class="marca">Calcula Prazo</div></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html);
  await page.screenshot({ path: destino });
  await browser.close();
}

async function main(jobId) {
  const job = await getJob(jobId);
  const cenas = job.roteiro.cenas;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const caminhosStorage = [];
  for (let i = 0; i < cenas.length; i++) {
    const nomeArquivo = `cena_${String(i).padStart(2, '0')}.png`;
    const destinoLocal = path.join(OUTPUT_DIR, nomeArquivo);
    const ehCenaFinal = i === cenas.length - 1;

    if (ehCenaFinal) {
      await gerarCenaFinal(destinoLocal);
      console.log(`Cena final (CTA) renderizada por código: ${destinoLocal}`);
    } else {
      try {
        await gerarImagem(cenas[i].prompt_imagem, destinoLocal);
        console.log(`Imagem gerada: ${destinoLocal}`);
      } catch (e1) {
        console.warn(`Falhou 1ª tentativa (cena ${i}): ${e1.message}. Aguardando e tentando de novo...`);
        await aguardar(16000);
        try {
          await gerarImagem(cenas[i].prompt_imagem, destinoLocal);
          console.log(`Imagem gerada na 2ª tentativa: ${destinoLocal}`);
        } catch (e2) {
          console.warn(`Falhou de novo (cena ${i}): ${e2.message}. Usando fallback de marca.`);
          await gerarFallback(destinoLocal);
        }
      }
    }

    const caminhoStorage = `jobs/${jobId}/imagens/${nomeArquivo}`;
    await enviarArquivo(destinoLocal, caminhoStorage);
    caminhosStorage.push(caminhoStorage);
    await aguardar(16000);
  }

  await updateJob(jobId, { imagens: caminhosStorage, status: 'imagens_ok' });
}

const jobId = process.argv[2];
if (!jobId) {
  console.error('Uso: node 05-imagens.mjs <job_id>');
  process.exit(1);
}
main(jobId).catch(async err => {
  console.error(err);
  await marcarErro(jobId, 'imagens', err.message);
  process.exit(1);
});
