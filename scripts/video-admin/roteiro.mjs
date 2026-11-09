// Etapa 1 — gera o roteiro em slides (cenas com narração + visual) a partir do artigo.
import { getJob, updateJob } from './lib/db.mjs';
import { lerArtigo } from './lib/artigo.mjs';
import { gerarRoteiroPara, finalizarRoteiro } from './lib/roteiro-core.mjs'; // fonte única da geração (também usada pelo app local)
import { gerarRoteiroIlustrado } from './lib/roteiro-ilustrado.mjs';
import { gerarTextoComFallback } from '../lib/ia-texto.mjs'; // somente leitura: reaproveita a cadeia de fallback (Gemini → OpenRouter → NVIDIA)

export { gerarRoteiroPara, finalizarRoteiro };

export async function etapaRoteiro(jobId) {
  const job = await getJob(jobId);
  await updateJob(jobId, { etapa_atual: 'roteiro' });
  const artigo = await lerArtigo(job.post_url);
  console.log(`Artigo: "${artigo.titulo}" — ${artigo.palavras} palavras; referências no texto: ${JSON.stringify(artigo.refs)}`);
  // Short ilustrado usa o roteiro próprio (narração + prompt de imagem por cena); o resto usa o roteiro em slides.
  const ilustrado = job.tipo === 'short' && job.estilo === 'ilustrado';
  const { roteiro, tentativas } = ilustrado
    ? await gerarRoteiroIlustrado({ artigo, durSeg: job.duracao_alvo_seg, tom: job.tom, chamarIA: gerarTextoComFallback })
    : await gerarRoteiroPara({ artigo, tipo: job.tipo, durSeg: job.duracao_alvo_seg, tom: job.tom, chamarIA: gerarTextoComFallback });
  roteiro.artigo_palavras = artigo.palavras;
  roteiro.tentativas = tentativas;
  await updateJob(jobId, { roteiro, post_titulo: artigo.titulo, status: 'roteiro_ok', erro_etapa: null, erro_mensagem: null });
  console.log(`Roteiro pronto: ${roteiro.cenas.length} cenas.`);
}
