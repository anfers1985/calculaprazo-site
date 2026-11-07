// Apaga do Storage os arquivos dos jobs do admin depois da janela de retenção (o vídeo continua no YouTube).
// Publicados: RETENCAO_DIAS (padrão 5) contados a partir de publicado_em, a mesma janela da aba "Vídeos p/ Redes" e dos Shorts automáticos.
// Qualquer outro status (erro, ou job parado no meio do caminho que ninguém retomou): mesma janela, contada a partir da última atualização.
import { sb, TABELA, PREFIXO, listarArquivos, apagarArquivos } from './lib/db.mjs';

const DIAS = Number(process.env.RETENCAO_DIAS || 5);
const limite = new Date(Date.now() - DIAS * 86400000).toISOString();
const { data, error } = await sb.from(TABELA).select('id').is('arquivos_apagados_em', null)
  .or(`and(status.eq.publicado,publicado_em.lt.${limite}),and(status.eq.publicado,publicado_em.is.null,atualizado_em.lt.${limite}),and(status.neq.publicado,atualizado_em.lt.${limite})`)
  .limit(100);
if (error) { console.error('Limpeza: falha ao consultar:', error.message); process.exit(0); }
for (const j of data || []) {
  try {
    const n = await apagarArquivos(await listarArquivos(`${PREFIXO}/${j.id}`));
    await sb.from(TABELA).update({ arquivos_apagados_em: new Date().toISOString(), video_path: null, thumbnail_path: null, narracao_path: null }).eq('id', j.id);
    console.log(`Job ${j.id}: ${n} arquivo(s) apagado(s).`);
  } catch (e) { console.warn(`Job ${j.id}: ${e.message}`); }
}
console.log(`Limpeza concluída (retenção ${DIAS} dias).`);
