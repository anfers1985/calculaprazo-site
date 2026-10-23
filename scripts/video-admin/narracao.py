#!/usr/bin/env python3
"""
Etapa 2 do pipeline de vídeos do admin — narração, SEPARADA do 03-narracao.py do pipeline antigo.

Gera a voz cena a cena, mede a duração real de cada cena (é ela que define o tempo dos slides) e
envia a narração completa ao Storage.

Vozes (campo `voz` do job):
  francisca   -> Azure Speech, voz neural pt-BR-FranciscaNeural (reserva: Edge TTS)
  thalita-hd  -> Azure Speech, voz HD pt-BR-Thalita:DragonHDLatestNeural (reserva: Francisca)
  gemini      -> Gemini TTS (EXPERIMENTAL; reserva: Francisca)
Qualquer falha numa voz melhor cai automaticamente na Francisca, para o job nunca ficar travado.

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, GEMINI_API_KEY
     (opcionais: GEMINI_TTS_MODEL, GEMINI_TTS_VOICE, TTS_FAKE=1 só para testes sem rede)
Uso: python narracao.py <job_id>
"""
import asyncio
import base64
import io
import os
import re
import sys
import time
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

import requests
from pydub import AudioSegment
from pydub.generators import Sine
from pydub.silence import detect_leading_silence

VOZ_PADRAO = "pt-BR-FranciscaNeural"
VOZ_HD = {"thalita-hd": "pt-BR-Thalita:DragonHDLatestNeural"}
AZURE_KEY = (os.environ.get("AZURE_SPEECH_KEY") or "").strip()
AZURE_REGION = (os.environ.get("AZURE_SPEECH_REGION") or "").strip().lower()
AZURE_OK = bool(AZURE_KEY and AZURE_REGION)
FAKE = os.environ.get("TTS_FAKE") == "1"

PAUSA_PONTO = 260
PAUSA_INTERROGACAO = 420
PAUSA_ENTRE_CENAS = 380
RATE_CTA = "-6%"

_SPLIT = re.compile(r"(?<=[.!?])\s+")
PRONUNCIAS = {
    "TST": "Tribunal Superior do Trabalho", "TRT": "Tribunal Regional do Trabalho",
    "FGTS": "éfe gê tê ésse", "INSS": "í ene ésse ésse", "CLT": "cê éle tê",
    "CCT": "Convenção Coletiva de Trabalho", "ACT": "Acordo Coletivo de Trabalho",
    "MTE": "Ministério do Trabalho e Emprego", "ADCT": "á dê cê tê", "CF": "Constituição Federal",
}


def normalizar_texto_fala(texto: str) -> str:
    """Rede de segurança: números/R$/% viram extenso e siglas ganham pronúncia clara."""
    try:
        from num2words import num2words
    except ImportError:
        num2words = None
    t = texto
    t = re.sub(r"R\$\s*(\d+(?:\.\d{3})*),(\d{2})", lambda m: f"{m.group(1)} reais e {m.group(2)} centavos", t)
    t = re.sub(r"R\$\s*(\d+(?:\.\d{3})*)", lambda m: f"{m.group(1)} reais", t)
    t = re.sub(r"(\d+)\s*%", r"\1 por cento", t)
    t = re.sub(r"(\d+)\s*[ºª°]", r"\1", t)
    if num2words:
        def _n(m):
            try:
                return num2words(int(m.group(0).replace(".", "")), lang="pt_BR")
            except Exception:
                return m.group(0)
        t = re.sub(r"\d+(?:\.\d{3})*", _n, t)
    for sigla, falado in PRONUNCIAS.items():
        t = re.sub(rf"\b{sigla}\b", falado, t)
    return re.sub(r"\s+", " ", t).strip()


def dividir_em_frases(texto: str):
    out = []
    for f in [x.strip() for x in _SPLIT.split(normalizar_texto_fala(texto)) if x.strip()]:
        if f[-1] not in ".!?":
            f += "."
        out.append((f, PAUSA_INTERROGACAO if f.endswith("?") else PAUSA_PONTO))
    return out


# ------------------------------------------------------------------ motores
def sintetizar_fake(texto: str, destino: Path):
    """Só para testes sem rede: tom de duração proporcional ao texto."""
    ms = max(600, int(len(texto.split()) * 380))
    Sine(220).to_audio_segment(duration=ms).apply_gain(-24).export(str(destino), format="mp3")


def sintetizar_azure(texto: str, rate: str, destino: Path, voz: str = VOZ_PADRAO):
    url = f"https://{AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
    corpo = xml_escape(texto)
    if "Dragon" not in voz:  # vozes HD não aceitam ajuste de velocidade
        corpo = f"<prosody rate='{rate}'>{corpo}</prosody>"
    ssml = ("<speak version='1.0' xml:lang='pt-BR' xmlns='http://www.w3.org/2001/10/synthesis'>"
            f"<voice xml:lang='pt-BR' name='{voz}'>{corpo}</voice></speak>")
    headers = {"Ocp-Apim-Subscription-Key": AZURE_KEY, "Content-Type": "application/ssml+xml",
               "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "calculaprazo-video-admin"}
    ultimo = None
    for tentativa in range(1, 4):
        try:
            r = requests.post(url, headers=headers, data=ssml.encode("utf-8"), timeout=60)
            if r.status_code == 200 and r.content:
                destino.write_bytes(r.content)
                return
            if r.status_code in (401, 403):
                raise RuntimeError(f"Azure Speech recusou a chave (HTTP {r.status_code}); confira AZURE_SPEECH_KEY/REGION.")
            ultimo = RuntimeError(f"Azure Speech HTTP {r.status_code}: {r.text[:150]}")
            if r.status_code == 400 and "Dragon" in voz:
                raise ultimo  # voz HD indisponível na região: não adianta repetir
        except requests.RequestException as e:
            ultimo = e
        if tentativa < 3:
            time.sleep([2, 5][tentativa - 1])
    raise ultimo


async def sintetizar_edge(texto: str, rate: str, destino: Path):
    import edge_tts
    ultimo = None
    for tentativa in range(1, 3):
        try:
            await edge_tts.Communicate(texto, voice=VOZ_PADRAO, rate=rate).save(str(destino))
            if destino.exists() and destino.stat().st_size > 0:
                return
            raise RuntimeError("Edge TTS devolveu áudio vazio.")
        except Exception as e:  # noqa: BLE001
            ultimo = e
            time.sleep(3 * tentativa)
    raise ultimo


def sintetizar_gemini(texto: str, destino: Path):
    """EXPERIMENTAL. Gemini TTS devolve PCM 24 kHz mono (base64)."""
    chave = os.environ.get("GEMINI_API_KEY")
    if not chave:
        raise RuntimeError("GEMINI_API_KEY ausente.")
    modelo = os.environ.get("GEMINI_TTS_MODEL") or "gemini-2.5-flash-preview-tts"
    voz = os.environ.get("GEMINI_TTS_VOICE") or "Kore"
    corpo = {"contents": [{"parts": [{"text": "Narre em português do Brasil, com naturalidade, clareza e ritmo de apresentador de vídeo educativo: " + texto}]}],
             "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}}}}}
    ultimo = None
    for tentativa in range(1, 4):
        try:
            r = requests.post(f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
                              headers={"x-goog-api-key": chave, "Content-Type": "application/json"}, json=corpo, timeout=120)
            if r.status_code == 200:
                pcm = base64.b64decode(r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
                AudioSegment(data=pcm, sample_width=2, frame_rate=24000, channels=1).export(str(destino), format="mp3")
                return
            ultimo = RuntimeError(f"Gemini TTS HTTP {r.status_code}: {r.text[:150]}")
        except Exception as e:  # noqa: BLE001
            ultimo = e
        time.sleep(4 * tentativa)
    raise ultimo


class Vozes:
    """Escolhe o motor e cai para a Francisca se a voz pedida falhar."""
    def __init__(self, voz: str):
        self.voz = voz if voz in ("francisca", "thalita-hd", "gemini") else "francisca"
        self.rebaixada = False
        self.azure_ok = AZURE_OK

    @property
    def cena_inteira(self):  # vozes "contextuais" recebem a cena toda de uma vez
        return not self.rebaixada and self.voz in ("thalita-hd", "gemini")

    def _padrao(self, texto, rate, destino):
        if FAKE:
            return sintetizar_fake(texto, destino)
        if self.azure_ok:
            try:
                return sintetizar_azure(texto, rate, destino)
            except Exception as e:  # noqa: BLE001
                print(f"  Azure padrão falhou ({str(e)[:120]}); tentando Edge TTS...")
        asyncio.run(sintetizar_edge(texto, rate, destino))

    def sintetizar(self, texto: str, rate: str, destino: Path):
        if FAKE:
            return sintetizar_fake(texto, destino)
        if not self.rebaixada and self.voz == "thalita-hd" and self.azure_ok:
            try:
                return sintetizar_azure(texto, rate, destino, VOZ_HD["thalita-hd"])
            except Exception as e:  # noqa: BLE001
                print(f"  Voz HD indisponível ({str(e)[:140]}). Usando a Francisca neste job.")
                self.rebaixada = True
        elif not self.rebaixada and self.voz == "gemini":
            try:
                return sintetizar_gemini(texto, destino)
            except Exception as e:  # noqa: BLE001
                print(f"  Gemini TTS falhou ({str(e)[:140]}). Usando a Francisca neste job.")
                self.rebaixada = True
        return self._padrao(texto, rate, destino)


def cortar_pontas(seg: AudioSegment, limiar=-42) -> AudioSegment:
    ini = detect_leading_silence(seg, silence_threshold=limiar)
    fim = detect_leading_silence(seg.reverse(), silence_threshold=limiar)
    c = seg[ini: len(seg) - fim]
    return c if len(c) > 50 else seg


def narrar_roteiro(roteiro: dict, voz: str, saida: Path):
    """Gera o áudio. Preenche cena['duracao_seg'] e devolve (mp3_final, duracao_total_seg)."""
    saida.mkdir(parents=True, exist_ok=True)
    tmp = saida / "_trechos"
    tmp.mkdir(exist_ok=True)
    vozes = Vozes(voz)
    cenas = roteiro["cenas"]
    print(f"Narração: voz={vozes.voz} ({len(cenas)} cenas)")
    total = AudioSegment.empty()
    for i, cena in enumerate(cenas):
        rate = RATE_CTA if i == len(cenas) - 1 else "+0%"
        seg_cena = AudioSegment.empty()
        if vozes.cena_inteira:
            mp3 = tmp / f"c{i:03d}.mp3"
            vozes.sintetizar(normalizar_texto_fala(cena["narracao"]), rate, mp3)
            seg_cena += cortar_pontas(AudioSegment.from_file(mp3, format="mp3"))
        if not vozes.cena_inteira or len(seg_cena) == 0:  # inclui o caso em que a voz melhor foi rebaixada no meio
            for j, (frase, pausa) in enumerate(dividir_em_frases(cena["narracao"])):
                mp3 = tmp / f"c{i:03d}_{j:02d}.mp3"
                vozes.sintetizar(frase, rate, mp3)
                time.sleep(0.2 if not FAKE else 0)
                seg_cena += cortar_pontas(AudioSegment.from_file(mp3, format="mp3")) + AudioSegment.silent(duration=pausa)
        seg_cena += AudioSegment.silent(duration=PAUSA_ENTRE_CENAS)
        cena["duracao_seg"] = round(len(seg_cena) / 1000, 2)
        total += seg_cena
    final = saida / "narracao.mp3"
    total.export(str(final), format="mp3", bitrate="128k")
    return final, round(len(total) / 1000, 2), vozes


def main(job_id: str):
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    job = sb.table("video_admin_jobs").select("*").eq("id", job_id).single().execute().data
    sb.table("video_admin_jobs").update({"etapa_atual": "narracao"}).eq("id", job_id).execute()
    roteiro = job["roteiro"]
    final, dur, vozes = narrar_roteiro(roteiro, job.get("voz") or "francisca", Path("output/audio"))
    alvo = job["duracao_alvo_seg"]
    desvio = round((dur - alvo) / alvo * 100, 1)
    roteiro["duracao_real_seg"] = dur
    roteiro["desvio_duracao_pct"] = desvio
    roteiro["voz_usada"] = "francisca (reserva)" if vozes.rebaixada else vozes.voz
    print(f"Duração real {dur}s (alvo {alvo}s, desvio {desvio:+.1f}%)")
    if abs(desvio) > 25:
        print("AVISO: a duração real ficou a mais de 25% do alvo.")
    caminho = f"admin-videos/{job_id}/narracao.mp3"
    sb.storage.from_("pipeline").upload(caminho, final.read_bytes(), {"upsert": "true", "content-type": "audio/mpeg"})
    sb.table("video_admin_jobs").update({"narracao_path": caminho, "roteiro": roteiro, "duracao_real_seg": dur,
                                         "status": "narracao_ok", "erro_etapa": None, "erro_mensagem": None}).eq("id", job_id).execute()
    print(f"Narração enviada: {caminho}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python narracao.py <job_id>")
        sys.exit(1)
    main(sys.argv[1])
