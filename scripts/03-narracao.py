#!/usr/bin/env python3
"""
Gera a narração de cada cena do roteiro usando Edge TTS — vozes neurais da
Microsoft (as mesmas do Azure Speech, acessadas de graça pelo mesmo canal do
"Ler em voz alta" do navegador Edge). Gratuito, sem chave de API. Muito mais
natural e com pronúncia pt-BR confiável do que o Kokoro (TTS comunitário, que
foi a causa da narração saindo com sotaque/pronúncia errada).

Voz padrão: pt-BR-FranciscaNeural (feminina). Para trocar, mude EDGE_VOICE
abaixo ou a env var EDGE_TTS_VOICE (outras opções pt-BR: pt-BR-AntonioNeural,
pt-BR-BrendaNeural, pt-BR-DonatoNeural, pt-BR-GiovannaNeural, pt-BR-HumbertoNeural).

Como as pausas são feitas: o edge-tts não interpreta tags de pausa (<break>)
de forma confiável quando embutidas no texto simples, então — como já fazíamos
com o Kokoro — quebramos a narração em frases/orações e inserimos silêncio de
verdade entre elas. Isso continua garantindo que ponto final e vírgula virem
pausa real na fala, independente do motor de TTS por baixo.

Requisitos (instalados no workflow do GitHub Actions):
    pip install edge-tts pydub soundfile supabase requests
    ffmpeg (usado pelo pydub e para concatenar/medir os áudios)

Uso:
    python 03-narracao.py <job_id>
"""
import asyncio
import os
import re
import sys
from pathlib import Path

import edge_tts
from pydub import AudioSegment
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

EDGE_VOICE = os.environ.get("EDGE_TTS_VOICE", "pt-BR-FranciscaNeural")
VOZES_PT_BR_VALIDAS = {
    "pt-BR-FranciscaNeural", "pt-BR-AntonioNeural", "pt-BR-BrendaNeural",
    "pt-BR-DonatoNeural", "pt-BR-ElzaNeural", "pt-BR-FabioNeural",
    "pt-BR-GiovannaNeural", "pt-BR-HumbertoNeural", "pt-BR-JulioNeural",
    "pt-BR-LeilaNeural", "pt-BR-LeticiaNeural", "pt-BR-ManuelaNeural",
    "pt-BR-NicolauNeural", "pt-BR-ValerioNeural", "pt-BR-YaraNeural",
}
OUTPUT_DIR = Path("output/audio")

# Pausas reais entre frases/orações (em milissegundos).
PAUSA_PONTO_FINAL = 380   # depois de "." "!" "?"
PAUSA_VIRGULA = 160       # depois de ","
PAUSA_ENTRE_CENAS = 550   # respiro extra no fim de cada cena

# Variação de ritmo por posição da cena, em % de velocidade pro parâmetro
# `rate` do edge-tts (ex: "+4%" fala mais rápido, "-6%" mais devagar).
RATE_GANCHO = "+4%"
RATE_CTA = "-6%"
RATE_PADRAO = "+0%"

_SPLIT_FRASES = re.compile(r"(?<=[.!?])\s+")
_SPLIT_VIRGULA = re.compile(r",\s*")


def dividir_em_trechos(texto: str):
    """Divide o texto da cena em (trecho, pausa_depois_em_ms), respeitando pontuação."""
    trechos = []
    frases = [f.strip() for f in _SPLIT_FRASES.split(texto.strip()) if f.strip()]
    for frase in frases:
        partes_virgula = [p.strip() for p in _SPLIT_VIRGULA.split(frase) if p.strip()]
        for idx, parte in enumerate(partes_virgula):
            ultima_da_frase = idx == len(partes_virgula) - 1
            pausa = PAUSA_PONTO_FINAL if ultima_da_frase else PAUSA_VIRGULA
            trechos.append((parte, pausa))
    return trechos


async def sintetizar_trecho(texto: str, rate: str, destino_mp3: Path):
    comunicador = edge_tts.Communicate(texto, voice=EDGE_VOICE, rate=rate)
    await comunicador.save(str(destino_mp3))


def main(job_id: str):
    job = sb.table("video_jobs").select("*").eq("id", job_id).single().execute().data
    roteiro = job["roteiro"]
    cenas = roteiro["cenas"]

    if EDGE_VOICE not in VOZES_PT_BR_VALIDAS:
        print(
            f"AVISO: voz '{EDGE_VOICE}' não está na lista de vozes pt-BR conhecidas "
            f"do Edge TTS. Confira o nome em EDGE_TTS_VOICE — nomes têm que ser "
            f"exatamente iguais aos da Microsoft (ex: 'pt-BR-FranciscaNeural')."
        )
    print(f"Gerando narração com voice='{EDGE_VOICE}' ({len(cenas)} cenas)")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_dir = OUTPUT_DIR / "_tmp_trechos"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    wavs = []
    for i, cena in enumerate(cenas):
        if i == 0:
            rate = RATE_GANCHO
        elif i == len(cenas) - 1:
            rate = RATE_CTA
        else:
            rate = RATE_PADRAO

        trechos = dividir_em_trechos(cena["narracao"])
        cena_audio = AudioSegment.empty()
        for j, (texto_trecho, pausa_depois_ms) in enumerate(trechos):
            trecho_mp3 = tmp_dir / f"cena_{i:02d}_trecho_{j:02d}.mp3"
            asyncio.run(sintetizar_trecho(texto_trecho, rate, trecho_mp3))
            cena_audio += AudioSegment.from_file(trecho_mp3, format="mp3")
            cena_audio += AudioSegment.silent(duration=pausa_depois_ms)
        cena_audio += AudioSegment.silent(duration=PAUSA_ENTRE_CENAS)

        wav_path = OUTPUT_DIR / f"cena_{i:02d}.wav"
        cena_audio.export(str(wav_path), format="wav")
        cena["duracao_seg"] = round(len(cena_audio) / 1000, 2)
        wavs.append(wav_path)

    narracao_final = OUTPUT_DIR / "narracao_completa.mp3"
    completa = AudioSegment.empty()
    for w in wavs:
        completa += AudioSegment.from_file(w, format="wav")
    completa.export(str(narracao_final), format="mp3", bitrate="128k")

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
