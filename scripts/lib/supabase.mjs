import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key, nunca a anon key

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar definidos (secrets do GitHub Actions).');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/** Busca o job pelo id passado via variável de ambiente/step anterior. */
export async function getJob(jobId) {
  const { data, error } = await supabase.from('video_jobs').select('*').eq('id', jobId).single();
  if (error) throw new Error(`Falha ao buscar job ${jobId}: ${error.message}`);
  return data;
}

/** Atualiza status e/ou campos do job. Usado ao final de cada etapa da pipeline. */
export async function updateJob(jobId, fields) {
  const { error } = await supabase.from('video_jobs').update(fields).eq('id', jobId);
  if (error) throw new Error(`Falha ao atualizar job ${jobId}: ${error.message}`);
}

/** Marca o job como erro, registrando em qual etapa falhou, para permitir retomar dali. */
export async function marcarErro(jobId, etapa, mensagem) {
  await updateJob(jobId, {
    status: 'erro',
    erro_etapa: etapa,
    erro_mensagem: String(mensagem).slice(0, 2000),
  });
}
