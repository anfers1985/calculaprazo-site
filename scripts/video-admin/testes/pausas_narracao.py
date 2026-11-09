"""Pausas entre cenas da narração, com voz SIMULADA (sem rede nem chaves):  TTS_FAKE=1 python3 scripts/video-admin/testes/pausas_narracao.py
Garante que: (1) a última frase de cada cena não soma a pausa de frase à pausa da cena; (2) cena que emenda a anterior ("Mas…") tem pausa curta;
(3) a duração só da fala (fala_seg) é gravada em cada cena, para a legenda do Short ilustrado."""
import os, sys, tempfile
os.environ.setdefault("TTS_FAKE", "1")
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import narracao as n  # noqa: E402

cenas = [
    {"tipo": "capa", "narracao": "O trabalhador tem direito automático a dano moral por atraso?"},
    {"tipo": "afirmacao", "narracao": "Não, em regra. O tribunal definiu que o atraso isolado não basta."},
    {"tipo": "afirmacao", "narracao": "Mas é preciso comprovar uma lesão concreta aos direitos da personalidade."},
    {"tipo": "afirmacao", "narracao": "Vamos ver como isso funciona na prática do dia a dia."},
    {"tipo": "encerramento", "narracao": "Para se aprofundar no assunto, leia o artigo completo."},
]
roteiro = {"cenas": cenas}
topicos = {len(cenas) - 1}
final, dur, _ = n.narrar_roteiro(roteiro, "francisca", Path(tempfile.mkdtemp()), None)
erros = []
for i, c in enumerate(cenas):
    if "fala_seg" not in c: erros.append(f"cena {i + 1}: sem fala_seg")
    else:
        pausa = round((c["duracao_seg"] - c["fala_seg"]) * 1000)
        esperada = n.pausa_entre_cenas(cenas, i, topicos | {len(cenas) - 1})
        if abs(pausa - esperada) > 30: erros.append(f"cena {i + 1}: pausa {pausa} ms, esperada {esperada} ms")
if n.pausa_entre_cenas(cenas, 1, topicos) != n.PAUSA_CONTINUA: erros.append("a cena que começa com 'Mas' deveria usar a pausa curta")
if n.pausa_entre_cenas(cenas, 2, topicos) != n.PAUSA_ENTRE_CENAS: erros.append("cena seguinte sem conector deveria usar a pausa padrão")
print("OK" if not erros else "FALHA: " + "; ".join(erros), f"(total {dur}s, fala_seg {[c.get('fala_seg') for c in cenas]})")
sys.exit(1 if erros else 0)
