#!/usr/bin/env python3
"""
Gera o arquivo .srt a partir das durações reais de narração de cada cena
(preenchidas na etapa anterior pelo Piper). Sem depender de Whisper ou de
qualquer serviço externo — é só matemática sobre o que já foi gerado.

Uso:
    python 04-legendas.py <job_id>
"""
import os
import sys
from pathlib import Path

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

OUTPUT_DIR = Path("output/legendas")


def formatar_srt_timestamp(segundos: float) -> str:
    ms = int(round(segundos * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def gerar_srt(cenas: list[dict]) -> str:
    linhas = []
    inicio = 0.0
    for i, cena in enumerate(cenas, start=1):
        duracao = cena.get("duracao_seg", 3.0)
        fim = inicio + duracao
        linhas.append(str(i))
        linhas.append(f"{formatar_srt_timestamp(inicio)} --> {formatar_srt_timestamp(fim)}")
        linhas.append(cena.get("texto_tela") or cena["narracao"])
        linhas.append("")
        inicio = fim
    return "\n".join(linhas)


def main(job_id: str):
    job = sb.table("video_jobs").select("*").eq("id", job_id).single().execute().data
    cenas = job["roteiro"]["cenas"]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    srt_path = OUTPUT_DIR / "legendas.srt"
    srt_path.write_text(gerar_srt(cenas), encoding="utf-8")

    sb.table("video_jobs").update({
        "legendas_path": str(srt_path),
        "status": "legendas_ok",
    }).eq("id", job_id).execute()

    print(f"Legendas geradas: {srt_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python 04-legendas.py <job_id>")
        sys.exit(1)
    job_id_arg = sys.argv[1]
    try:
        main(job_id_arg)
    except Exception as e:
        sb.table("video_jobs").update({
            "status": "erro",
            "erro_etapa": "legendas",
            "erro_mensagem": str(e)[:2000],
        }).eq("id", job_id_arg).execute()
        raise
