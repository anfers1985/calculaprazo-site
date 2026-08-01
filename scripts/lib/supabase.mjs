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
