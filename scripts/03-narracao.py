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
import re
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

# Pausas reais entre frases/orações. O Kokoro não interpreta pontuação como pausa de
# forma confiável quando o texto inteiro da cena é sintetizado de uma vez só — por isso
# quebramos em frases e inserimos silêncio de verdade (em segundos) entre elas.
PAUSA_PONTO_FINAL = 0.38   # depois de "." "!" "?"
PAUSA_VIRGULA = 0.16       # depois de ","
PAUSA_ENTRE_CENAS = 0.55   # respiro extra no fim de cada cena, além da pausa de ponto final

# Pequena variação de velocidade por posição da cena: o gancho (1ª cena) fica um pouco
# mais ágil pra prender atenção, o CTA (última) fica um pouco mais lento e claro.
SPEED_GANCHO = 1.04
SPEED_CTA = 0.94
SPEED_PADRAO = 1.0

_SPLIT_FRASES = re.compile(r"(?<=[.!?])\s+")
_SPLIT_VIRGULA = re.compile(r",\s*")


def dividir_em_trechos(texto: str):
    """Divide o texto da cena em (trecho, pausa_depois_em_seg), respeitando pontuação."""
    trechos = []
    frases = [f.strip() for f in _SPLIT_FRASES.split(texto.strip()) if f.strip()]
    for frase in frases:
        partes_virgula = [p.strip() for p in _SPLIT_VIRGULA.split(frase) if p.strip()]
        for idx, parte in enumerate(partes_virgula):
            ultima_da_frase = idx == len(partes_virgula) - 1
            pausa = PAUSA_PONTO_FINAL if ultima_da_frase else PAUSA_VIRGULA
            trechos.append((parte, pausa))
    return trechos

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


def silencio(duracao_seg: float, sample_rate: int) -> np.ndarray:
    return np.zeros(int(duracao_seg * sample_rate), dtype=np.float32)


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
        if i == 0:
            speed = SPEED_GANCHO
        elif i == len(cenas) - 1:
            speed = SPEED_CTA
        else:
            speed = SPEED_PADRAO

        trechos = dividir_em_trechos(cena["narracao"])
        pedacos = []
        sample_rate = None
        for texto_trecho, pausa_depois in trechos:
            samples, sample_rate = kokoro.create(
                texto_trecho, voice=VOICE, speed=speed, lang=LANG
            )
            pedacos.append(samples)
            pedacos.append(silencio(pausa_depois, sample_rate))
        # Respiro extra entre cenas (além da pausa de ponto final já incluída acima).
        pedacos.append(silencio(PAUSA_ENTRE_CENAS, sample_rate))

        cena_audio = np.concatenate(pedacos)
        wav_path = OUTPUT_DIR / f"cena_{i:02d}.wav"
        sf.write(str(wav_path), cena_audio, sample_rate)
        cena["duracao_seg"] = round(len(cena_audio) / sample_rate, 2)
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
