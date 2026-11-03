// Imagens do Short ilustrado de um job: reaproveita o que já está no Storage (nova tentativa não refaz o que deu certo)
// e gera só as que faltam, enviando cada uma ao Storage assim que fica pronta.
import path from 'node:path';
import { listarArquivos, baixarArquivo, enviarArquivo, caminhoStorage, PREFIXO } from './db.mjs';
import { gerarImagensDoRoteiro } from './ia-imagem.mjs';
import { montarPromptImagem } from './roteiro-ilustrado.mjs';

const RE_IMG = /img_(\d{2})\.(png|jpg|webp)$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

export async function imagensDoJob(job, dirLocal, log = console.log) {
  const cenas = job.roteiro.cenas;
  const noStorage = {};
  for (const caminho of await listarArquivos(`${PREFIXO}/${job.id}`)) {
    const m = path.basename(caminho).match(RE_IMG);
    if (m) noStorage[Number(m[1]) - 1] = caminho;
  }
  const existentes = [];
  for (let i = 0; i < cenas.length; i++) existentes[i] = noStorage[i] ? await baixarArquivo(noStorage[i], path.join(dirLocal, path.basename(noStorage[i]))) : null;
  const prontas = existentes.filter(Boolean).length;
  if (prontas) log(`Imagens: ${prontas} de ${cenas.length} já estavam prontas (reaproveitadas).`);
  if (prontas === cenas.length) return existentes;
  const { arquivos, falhas } = await gerarImagensDoRoteiro({
    cenas, dir: dirLocal, existentes, log,
    montarPrompt: c => montarPromptImagem(c, job.roteiro.personagem),
    aoGerar: async (i, arquivo) => { const ext = path.extname(arquivo).slice(1); await enviarArquivo(arquivo, caminhoStorage(job.id, path.basename(arquivo)), MIME[ext] || 'image/jpeg'); },
  });
  if (falhas) log(`Atenção: ${falhas} cena(s) sem imagem — o vídeo usa um cartão de papel nelas.`);
  return arquivos;
}
