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
import time
from pathlib import Path

import edge_tts
from pydub import AudioSegment
from pydub.silence import detect_leading_silence
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

EDGE_VOICE = os.environ.get("EDGE_TTS_VOICE") or "pt-BR-FranciscaNeural"
VOZES_PT_BR_VALIDAS = {
    "pt-BR-FranciscaNeural", "pt-BR-AntonioNeural", "pt-BR-BrendaNeural",
    "pt-BR-DonatoNeural", "pt-BR-ElzaNeural", "pt-BR-FabioNeural",
    "pt-BR-GiovannaNeural", "pt-BR-HumbertoNeural", "pt-BR-JulioNeural",
    "pt-BR-LeilaNeural", "pt-BR-LeticiaNeural", "pt-BR-ManuelaNeural",
    "pt-BR-NicolauNeural", "pt-BR-ValerioNeural", "pt-BR-YaraNeural",
}
OUTPUT_DIR = Path("output/audio")

# Pausas reais entre frases/orações (em milissegundos). Valores mais baixos que antes
# porque agora cortamos o silêncio que o próprio Edge TTS já embute em cada trecho — sem
# esse corte, esses valores se somavam ao silêncio nativo e o áudio saía bem mais pausado
# do que o configurado (medido: 1,2 a 2,9s reais contra 380/550ms configurados).
PAUSA_PONTO_FINAL = 260   # depois de "." "!" "?"
PAUSA_INTERROGACAO = 420  # depois de "?" — respiro maior pra pergunta "assentar"
PAUSA_ENTRE_CENAS = 380   # respiro extra no fim de cada cena

# Variação de ritmo por posição da cena, em % de velocidade pro parâmetro
# `rate` do edge-tts (ex: "+4%" fala mais rápido, "-6%" mais devagar).
RATE_GANCHO = "+0%"
RATE_CTA = "-6%"
RATE_PADRAO = "+0%"

_SPLIT_FRASES = re.compile(r"(?<=[.!?])\s+")

# Siglas que o TTS costuma ler soletrando de forma estranha ou errada.
PRONUNCIAS = {
    "TST": "Tribunal Superior do Trabalho",
    "TRT": "Tribunal Regional do Trabalho",
    "FGTS": "éfe gê tê ésse",
    "INSS": "í ene ésse ésse",
    "CLT": "cê éle tê",
    "CCT": "Convenção Coletiva de Trabalho",
    "ACT": "Acordo Coletivo de Trabalho",
    "MTE": "Ministério do Trabalho e Emprego",
}


def normalizar_texto_fala(texto: str) -> str:
    """Rede de segurança: se o roteiro vier com dígitos/R$/%/ª/º apesar do prompt,
    converte pra extenso em pt-BR e ajusta siglas que o TTS lê errado."""
    try:
        from num2words import num2words
    except ImportError:
        num2words = None

    t = texto
    t = re.sub(r"R\$\s*(\d+(?:\.\d{3})*),(\d{2})", lambda m: f"{m.group(1)} reais e {m.group(2)} centavos", t)
    t = re.sub(r"R\$\s*(\d+(?:\.\d{3})*)", lambda m: f"{m.group(1)} reais", t)
    t = re.sub(r"\b13\s*[ºª°]?\s*(?=sal[áa]rio)", "décimo terceiro ", t, flags=re.I)
    t = re.sub(r"(\d+)\s*%", r"\1 por cento", t)
    t = re.sub(r"(\d+)\s*[ºª]", r"\1", t)
    if num2words:
        def _num(m):
            bruto = m.group(0).replace(".", "")
            try:
                return num2words(int(bruto), lang="pt_BR")
            except Exception:
                return m.group(0)
        t = re.sub(r"\d+(?:\.\d{3})*", _num, t)
    for sigla, falado in PRONUNCIAS.items():
        t = re.sub(rf"\b{sigla}\b", falado, t)
    return re.sub(r"\s+", " ", t).strip()


def dividir_em_trechos(texto: str):
    """Divide a cena em frases COMPLETAS (terminadas em . ! ?).

    CORREÇÃO da entonação de interrogação: antes cada frase era quebrada também nas
    vírgulas e cada pedaço virava uma chamada separada ao TTS. O trecho final (que
    carrega o '?') chegava ao motor como um fragmento solto, sem o contexto da pergunta,
    e a voz lia com entonação de afirmação. Agora a frase inteira vai de uma vez — a vírgula
    continua dentro do texto e o próprio motor faz a pausa/curva melódica certa, e o '?' final
    muda a entonação de verdade. A pausa entre frases continua sendo controlada aqui.
    """
    trechos = []
    frases = [f.strip() for f in _SPLIT_FRASES.split(normalizar_texto_fala(texto)) if f.strip()]
    for frase in frases:
        if frase[-1] not in ".!?":
            frase += "."
        if frase.endswith("?"):
            pausa = PAUSA_INTERROGACAO
        elif frase.endswith("!"):
            pausa = PAUSA_PONTO_FINAL
        else:
            pausa = PAUSA_PONTO_FINAL
        trechos.append((frase, pausa))
    return trechos


# O Edge TTS é um canal gratuito "emprestado" do navegador Edge, sem contrato: a Microsoft
# às vezes responde 403/429/5xx de forma intermitente (principalmente a IPs de datacenter,
# como o runner do GitHub Actions). Por isso cada trecho é tentado algumas vezes, com espera
# crescente, antes de o job falhar. O IP do runner muda a cada execução, então uma nova
# tentativa tem boa chance de passar.
TENTATIVAS_TTS = 5
ESPERAS_TTS_SEG = [3, 6, 12, 20]   # espera antes da 2ª, 3ª, 4ª e 5ª tentativa
PAUSA_ENTRE_CHAMADAS_SEG = 0.4     # respiro entre trechos pra não rajadar o serviço


async def sintetizar_trecho(texto: str, rate: str, destino_mp3: Path):
    ultimo_erro = None
    for tentativa in range(1, TENTATIVAS_TTS + 1):
        try:
            comunicador = edge_tts.Communicate(texto, voice=EDGE_VOICE, rate=rate)
            await comunicador.save(str(destino_mp3))
            if destino_mp3.exists() and destino_mp3.stat().st_size > 0:
                return
            raise RuntimeError("Edge TTS devolveu áudio vazio.")
        except Exception as e:  # noqa: BLE001 — qualquer falha de rede/serviço entra na repetição
            ultimo_erro = e
            if tentativa == TENTATIVAS_TTS:
                break
            espera = ESPERAS_TTS_SEG[min(tentativa - 1, len(ESPERAS_TTS_SEG) - 1)]
            print(
                f"  Edge TTS falhou (tentativa {tentativa}/{TENTATIVAS_TTS}): "
                f"{type(e).__name__}: {str(e)[:120]} — nova tentativa em {espera}s"
            )
            await asyncio.sleep(espera)
    raise ultimo_erro


def cortar_silencio_das_pontas(segmento: AudioSegment, limiar_db: int = -42) -> AudioSegment:
    """Remove o silêncio que o Edge TTS deixa no início/fim de cada trecho sintetizado,
    pra quem controlar a pausa entre falas seja só o PAUSA_* daqui, não o motor de TTS."""
    inicio = detect_leading_silence(segmento, silence_threshold=limiar_db)
    fim = detect_leading_silence(segmento.reverse(), silence_threshold=limiar_db)
    duracao = len(segmento)
    cortado = segmento[inicio: duracao - fim]
    return cortado if len(cortado) > 50 else segmento  # nunca corta o áudio inteiro


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
            time.sleep(PAUSA_ENTRE_CHAMADAS_SEG)
            audio_trecho = AudioSegment.from_file(trecho_mp3, format="mp3")
            audio_trecho = cortar_silencio_das_pontas(audio_trecho)
            cena_audio += audio_trecho
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
