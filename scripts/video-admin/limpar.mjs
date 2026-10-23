// Apaga do Storage os arquivos dos jobs do admin com mais de N dias (o vídeo continua no YouTube).
import { sb, TABELA, PREFIXO, listarArquivos, apagarArquivos } from './lib/db.mjs';

const DIAS = Number(process.env.RETENCAO_DIAS || 7);
const limite = new Date(Date.now() - DIAS * 86400000).toISOString();
const { data, error } = await sb.from(TABELA).select('id').is('arquivos_apagados_em', null).lt('atualizado_em', limite).in('status', ['publicado', 'erro']).limit(50);
if (error) { console.error('Limpeza: falha ao consultar:', error.message); process.exit(0); }
for (const j of data || []) {
  try {
    const n = await apagarArquivos(await listarArquivos(`${PREFIXO}/${j.id}`));
    await sb.from(TABELA).update({ arquivos_apagados_em: new Date().toISOString(), video_path: null, thumbnail_path: null, narracao_path: null }).eq('id', j.id);
    console.log(`Job ${j.id}: ${n} arquivo(s) apagado(s).`);
  } catch (e) { console.warn(`Job ${j.id}: ${e.message}`); }
}
console.log(`Limpeza concluída (retenção ${DIAS} dias).`);
