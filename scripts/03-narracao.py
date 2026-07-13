#!/usr/bin/env python3
"""
Gera a narração de cada cena do roteiro usando Piper (TTS local, offline, MIT license).
Voz usada: pt_BR-faber-medium (única voz pt-BR estável disponível hoje no ecossistema Piper).

Requisitos (instalados no workflow do GitHub Actions, ver .github/workflows/video-pipeline.yml):
    pip install piper-tts
    ffmpeg (para concatenar os áudios e medir duração)

Uso:
    python 03-narracao.py <job_id>
"""
import json
import os
import subprocess
import sys
import wave
from pathlib import Path

import requests
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

VOICE_NAME = "pt_BR-faber-medium"
VOICE_DIR = Path("voices")
OUTPUT_DIR = Path("output/audio")

VOICE_BASE_URL = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium"
)


def baixar_voz_se_necessario():
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    onnx = VOICE_DIR / f"{VOICE_NAME}.onnx"
    cfg = VOICE_DIR / f"{VOICE_NAME}.onnx.json"
    for nome, destino in [
        (f"{VOICE_NAME}.onnx", onnx),
        (f"{VOICE_NAME}.onnx.json", cfg),
    ]:
        if not destino.exists():
            print(f"Baixando {nome}...")
            resp = requests.get(f"{VOICE_BASE_URL}/{nome}", timeout=60)
            resp.raise_for_status()
            destino.write_bytes(resp.content)
    return onnx


def sintetizar(texto: str, onnx_path: Path, destino_wav: Path):
    subprocess.run(
        ["piper", "--model", str(onnx_path), "--output_file", str(destino_wav)],
        input=texto.encode("utf-8"),
        check=True,
    )


def duracao_wav(caminho: Path) -> float:
    with wave.open(str(caminho), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def concatenar_wavs(caminhos: list[Path], destino: Path):
    lista_path = destino.with_suffix(".txt")
    lista_path.write_text("\n".join(f"file '{c.resolve()}'" for c in caminhos))
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lista_path),
         "-c:a", "libmp3lame", "-q:a", "2", str(destino)],
        check=True,
    )


def main(job_id: str):
    job = sb.table("video_jobs").select("*").eq("id", job_id).single().execute().data
    roteiro = job["roteiro"]
    cenas = roteiro["cenas"]

    onnx_path = baixar_voz_se_necessario()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    wavs = []
    for i, cena in enumerate(cenas):
        wav_path = OUTPUT_DIR / f"cena_{i:02d}.wav"
        sintetizar(cena["narracao"], onnx_path, wav_path)
        cena["duracao_seg"] = round(duracao_wav(wav_path), 2)
        wavs.append(wav_path)

    narracao_final = OUTPUT_DIR / "narracao_completa.mp3"
    concatenar_wavs(wavs, narracao_final)

    caminho_storage = f"jobs/{job_id}/narracao.mp3"
    with open(narracao_final, "rb") as f:
        sb.storage.from_("pipeline").upload(
            caminho_storage, f.read(), {"upsert": "true", "content-type": "audio/mpeg"}
        )

    sb.table("video_jobs").update({
        "narracao_path": caminho_storage,
        "roteiro": roteiro,
        "status": "narracao_ok",
    }).eq("id", job_id).execute()

    print(f"Narração gerada e enviada: {caminho_storage} ({len(cenas)} cenas)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python 03-narracao.py <job_id>")
        sys.exit(1)
    job_id_arg = sys.argv[1]
    try:
        main(job_id_arg)
    except Exception as e:
        sb.table("video_jobs").update({
            "status": "erro",
            "erro_etapa": "narracao",
            "erro_mensagem": str(e)[:2000],
        }).eq("id", job_id_arg).execute()
        raise
