import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key, nunca a anon key
const BUCKET = 'pipeline';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar definidos (secrets do GitHub Actions).');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function getJob(jobId) {
  const { data, error } = await supabase.from('video_jobs').select('*').eq('id', jobId).single();
  if (error) throw new Error(`Falha ao buscar job ${jobId}: ${error.message}`);
  return data;
}

export async function updateJob(jobId, fields) {
  const { error } = await supabase.from('video_jobs').update(fields).eq('id', jobId);
  if (error) throw new Error(`Falha ao atualizar job ${jobId}: ${error.message}`);
}

export async function marcarErro(jobId, etapa, mensagem) {
  const jobAtual = await getJob(jobId).catch(() => null);
  const tentativas = (jobAtual?.tentativas || 0) + 1;
  await updateJob(jobId, {
    status: 'erro',
    erro_etapa: etapa,
    erro_mensagem: String(mensagem).slice(0, 2000),
    tentativas,
  });
}

export async function enviarArquivo(caminhoLocal, caminhoStorage) {
  const buffer = fs.readFileSync(caminhoLocal);
  const { error } = await supabase.storage.from(BUCKET).upload(caminhoStorage, buffer, { upsert: true });
  if (error) throw new Error(`Falha ao enviar ${caminhoStorage} pro Storage: ${error.message}`);
  return caminhoStorage;
}

export async function garantirArquivoLocal(caminhoStorage, caminhoLocalDestino) {
  if (fs.existsSync(caminhoLocalDestino)) return caminhoLocalDestino;
  const { data, error } = await supabase.storage.from(BUCKET).download(caminhoStorage);
  if (error) throw new Error(`Falha ao baixar ${caminhoStorage} do Storage: ${error.message}`);
  fs.mkdirSync(path.dirname(caminhoLocalDestino), { recursive: true });
  fs.writeFileSync(caminhoLocalDestino, Buffer.from(await data.arrayBuffer()));
  return caminhoLocalDestino;
}

// Lista recursivamente todos os arquivos dentro de uma pasta do bucket (o SDK do
// Supabase Storage só lista 1 nível por chamada, então descemos manualmente em
// cada subpasta encontrada). Retorna os caminhos completos (relativos ao bucket),
// prontos pra passar direto pro `.remove()`.
async function listarArquivosRecursivo(pasta) {
  const { data, error } = await supabase.storage.from(BUCKET).list(pasta, { limit: 1000 });
  if (error) throw new Error(`Falha ao listar ${pasta} no Storage: ${error.message}`);

  const arquivos = [];
  for (const item of data || []) {
    const caminho = `${pasta}/${item.name}`;
    // Itens sem metadata (id/size) são subpastas na API do Supabase Storage.
    if (item.id === null) {
      arquivos.push(...await listarArquivosRecursivo(caminho));
    } else {
      arquivos.push(caminho);
    }
  }
  return arquivos;
}

// Apaga todos os arquivos de um job (áudio, imagens das cenas, thumbnail, vídeo
// renderizado) depois que ele já foi publicado no YouTube — nada disso é
// reaproveitado entre jobs, então não faz sentido continuar ocupando o Storage.
// Falha aqui nunca deve derrubar o pipeline (o vídeo já está publicado, o que
// importa), então quem chama deve envolver isso num try/catch e só logar o erro.
export async function apagarArquivosDoJob(jobId) {
  const pasta = `jobs/${jobId}`;
  const arquivos = await listarArquivosRecursivo(pasta);
  if (!arquivos.length) {
    console.log(`Limpeza: nenhum arquivo encontrado em ${pasta}/ (já estava limpo).`);
    return;
  }
  const { error } = await supabase.storage.from(BUCKET).remove(arquivos);
  if (error) throw new Error(`Falha ao apagar arquivos de ${pasta}: ${error.message}`);
  console.log(`Limpeza: ${arquivos.length} arquivo(s) apagado(s) de ${pasta}/.`);
}
