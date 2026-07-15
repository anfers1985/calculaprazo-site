#!/usr/bin/env python3
"""
Gera a narração de cada cena do roteiro usando Kokoro-82M (TTS local, offline,
Apache 2.0, gratuito e comercial) — muito mais natural que o Piper.
Voz usada: pf_dora (feminina, pt-BR). Para trocar de voz, mude VOICE abaixo
(outras opções pt-BR: pm_alex, pm_santa — masculinas).

Requisitos (instalados no workflow do GitHub Actions):
    pip install kokoro-onnx soundfile
    ffmpeg (para concatenar os áudios e medir duração)

Uso:
    python 03-narracao.py <job_id>
"""
import os
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import requests
import soundfile as sf
from kokoro_onnx import Kokoro
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

VOICE = os.environ.get("KOKORO_VOICE", "pf_dora")
LANG = "pt-br"
MODEL_DIR = Path("kokoro-model")
OUTPUT_DIR = Path("output/audio")

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"


def baixar_modelo_se_necessario():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    modelo = MODEL_DIR / "kokoro-v1.0.onnx"
    vozes = MODEL_DIR / "voices-v1.0.bin"
    for url, destino in [(MODEL_URL, modelo), (VOICES_URL, vozes)]:
        if not destino.exists():
            print(f"Baixando {destino.name}...")
            resp = requests.get(url, timeout=180)
            resp.raise_for_status()
            destino.write_bytes(resp.content)
    return modelo, vozes


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

    modelo, vozes = baixar_modelo_se_necessario()
    kokoro = Kokoro(str(modelo), str(vozes))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    wavs = []
    for i, cena in enumerate(cenas):
        samples, sample_rate = kokoro.create(
            cena["narracao"], voice=VOICE, speed=1.0, lang=LANG
        )
        wav_path = OUTPUT_DIR / f"cena_{i:02d}.wav"
        sf.write(str(wav_path), samples, sample_rate)
        cena["duracao_seg"] = round(len(samples) / sample_rate, 2)
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
