// Roda SEMPRE no fim do workflow (if: always()). Se a execução foi cancelada ou caiu no meio, os jobs ficam "em andamento"
// no banco e ocupam as vagas (limite de 3). Aqui eles viram "erro" (com "Tentar de novo") — só os que ainda estão em andamento.
// Sem dependências (só fetch): funciona mesmo que o cancelamento tenha pegado o job antes do "npm ci".
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
const ids = String(process.argv[2] || process.env.IDS || '').split(',').map((x) => x.trim()).filter(Boolean);
if (!url || !key || !ids.length) { console.log('liberar-travados: nada a fazer (sem credenciais ou ids).'); process.exit(0); }

const ativos = ['na_fila', 'roteiro_ok', 'narracao_ok', 'render_ok'];
const filtro = `id=in.(${ids.join(',')})&status=in.(${ativos.join(',')})`;
const r = await fetch(`${url}/rest/v1/video_admin_jobs?${filtro}`, {
  method: 'PATCH',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ status: 'erro', erro_etapa: 'interrompido', erro_mensagem: 'A execução no GitHub foi cancelada ou interrompida antes de terminar. Use "Tentar de novo".' }),
});
if (!r.ok) { console.warn(`liberar-travados: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(0); }
const liberados = await r.json();
console.log(liberados.length ? `Jobs liberados (marcados como erro, prontos para "Tentar de novo"): ${liberados.map((j) => j.id).join(', ')}` : 'Nenhum job ficou preso.');
