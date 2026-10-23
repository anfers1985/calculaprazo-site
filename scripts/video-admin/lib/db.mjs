// Acesso ao banco/Storage do pipeline de vídeos do admin.
// SEPARADO do pipeline antigo: usa a tabela video_admin_jobs e a pasta admin-videos/ do bucket "pipeline".
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
export const BUCKET = 'pipeline';
export const PREFIXO = 'admin-videos';
const TABELA = 'video_admin_jobs';

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar definidos.');
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export const caminhoStorage = (jobId, nome) => `${PREFIXO}/${jobId}/${nome}`;

export async function getJob(id) {
  const { data, error } = await sb.from(TABELA).select('*').eq('id', id).single();
  if (error) throw new Error(`Job ${id} não encontrado: ${error.message}`);
  return data;
}
export async function updateJob(id, campos) {
  const { error } = await sb.from(TABELA).update(campos).eq('id', id);
  if (error) throw new Error(`Falha ao atualizar o job ${id}: ${error.message}`);
}
export async function marcarErro(id, etapa, mensagem) {
  let tentativas = 0;
  try { tentativas = (await getJob(id)).tentativas || 0; } catch { /* segue */ }
  await sb.from(TABELA).update({ status: 'erro', erro_etapa: etapa, erro_mensagem: String(mensagem).slice(0, 1800), tentativas: tentativas + 1 }).eq('id', id);
}
export async function enviarArquivo(local, destino, contentType) {
  const { error } = await sb.storage.from(BUCKET).upload(destino, fs.readFileSync(local), { upsert: true, contentType });
  if (error) throw new Error(`Falha ao enviar ${destino}: ${error.message}`);
  return destino;
}
export async function baixarArquivo(origem, localDestino) {
  if (fs.existsSync(localDestino)) return localDestino;
  const { data, error } = await sb.storage.from(BUCKET).download(origem);
  if (error) throw new Error(`Falha ao baixar ${origem}: ${error.message}`);
  fs.mkdirSync(path.dirname(localDestino), { recursive: true });
  fs.writeFileSync(localDestino, Buffer.from(await data.arrayBuffer()));
  return localDestino;
}
export async function listarArquivos(pasta) {
  const { data, error } = await sb.storage.from(BUCKET).list(pasta, { limit: 200 });
  if (error) throw new Error(`Falha ao listar ${pasta}: ${error.message}`);
  return (data || []).filter(i => i.id !== null).map(i => `${pasta}/${i.name}`);
}
export async function apagarArquivos(caminhos) {
  if (!caminhos.length) return 0;
  const { error } = await sb.storage.from(BUCKET).remove(caminhos);
  if (error) throw new Error(`Falha ao apagar arquivos: ${error.message}`);
  return caminhos.length;
}
export { TABELA };
