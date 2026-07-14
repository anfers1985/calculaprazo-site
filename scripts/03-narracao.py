#!/usr/bin/env python3
"""
Gera a narração de cada cena do roteiro usando Piper (TTS local, offline, MIT license).
Voz usada: pt_BR-faber-medium (única voz pt-BR estável disponível hoje no ecossistema Piper).

Antes de sintetizar, o texto passa por um normalizador que reescreve números,
siglas, datas, moeda e ordinais por extenso — é a rede de segurança para os
casos em que o roteiro gerado pela IA deixa passar algum dígito ou abreviação
(mesmo com a instrução para não fazer isso em config/prompts.json).

Requisitos (instalados no workflow do GitHub Actions, ver .github/workflows/video-pipeline.yml):
    pip install piper-tts
    ffmpeg (para concatenar os áudios e medir duração)

Uso:
    python 03-narracao.py <job_id>
"""
import json
import os
import re
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

# ---------------------------------------------------------------------------
# Normalizador de texto pt-BR para TTS
# ---------------------------------------------------------------------------

_UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"]
_DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis",
                    "dezessete", "dezoito", "dezenove"]
_DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta",
            "oitenta", "noventa"]
_CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
             "seiscentos", "setecentos", "oitocentos", "novecentos"]
_ESCALAS = [
    (1_000_000_000_000, "trilhão", "trilhões"),
    (1_000_000_000, "bilhão", "bilhões"),
    (1_000_000, "milhão", "milhões"),
    (1_000, "mil", "mil"),
]
_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
          "setembro", "outubro", "novembro", "dezembro"]

_LETRAS_PT = {
    "A": "á", "B": "bê", "C": "cê", "D": "dê", "E": "é", "F": "éfe", "G": "gê",
    "H": "agá", "I": "i", "J": "jota", "K": "cá", "L": "éle", "M": "ême", "N": "ène",
    "O": "ó", "P": "pê", "Q": "quê", "R": "érre", "S": "ésse", "T": "tê", "U": "u",
    "V": "vê", "W": "dábliu", "X": "xis", "Y": "ípsilon", "Z": "zê",
}

# Siglas jurídicas comuns -> nome completo (soa muito mais natural que soletrar).
# Qualquer sigla de 2-6 letras maiúsculas que não estiver aqui é soletrada letra a letra.
_ACRONIMOS = {
    "TST": "Tribunal Superior do Trabalho",
    "STF": "Supremo Tribunal Federal",
    "STJ": "Superior Tribunal de Justiça",
    "TRT": "Tribunal Regional do Trabalho",
    "TJ": "Tribunal de Justiça",
    "CLT": "Consolidação das Leis do Trabalho",
    "CPC": "Código de Processo Civil",
    "CF": "Constituição Federal",
    "OAB": "Ordem dos Advogados do Brasil",
    "MPT": "Ministério Público do Trabalho",
    "MTE": "Ministério do Trabalho e Emprego",
    "CNJ": "Conselho Nacional de Justiça",
    "CTPS": "carteira de trabalho",
}

_ORDINAIS = {
    1: "primeiro", 2: "segundo", 3: "terceiro", 4: "quarto", 5: "quinto",
    6: "sexto", 7: "sétimo", 8: "oitavo", 9: "nono", 10: "décimo",
    11: "décimo primeiro", 12: "décimo segundo", 13: "décimo terceiro",
    14: "décimo quarto", 15: "décimo quinto", 16: "décimo sexto",
    17: "décimo sétimo", 18: "décimo oitavo", 19: "décimo nono", 20: "vigésimo",
    21: "vigésimo primeiro", 22: "vigésimo segundo", 23: "vigésimo terceiro",
    24: "vigésimo quarto", 25: "vigésimo quinto", 26: "vigésimo sexto",
    27: "vigésimo sétimo", 28: "vigésimo oitavo", 29: "vigésimo nono", 30: "trigésimo",
}


def _cem_a_extenso(n: int) -> str:
    if n == 0:
        return ""
    if n == 100:
        return "cem"
    centena, resto = divmod(n, 100)
    partes = []
    if centena:
        partes.append(_CENTENAS[centena])
    if resto:
        if resto < 10:
            sub = _UNIDADES[resto]
        elif resto < 20:
            sub = _DEZ_A_DEZENOVE[resto - 10]
        else:
            dezena, unidade = divmod(resto, 10)
            sub = _DEZENAS[dezena] + (f" e {_UNIDADES[unidade]}" if unidade else "")
        partes.append(sub)
    return " e ".join(partes)


def numero_por_extenso(n: int) -> str:
    if n == 0:
        return "zero"
    negativo = n < 0
    n = abs(n)
    partes = []
    restante = n
    for valor, singular, plural in _ESCALAS:
        if restante >= valor:
            qtd, restante = divmod(restante, valor)
            if valor == 1_000:
                partes.append("mil" if qtd == 1 else f"{_cem_a_extenso(qtd)} mil")
            else:
                nome = singular if qtd == 1 else plural
                partes.append(f"um {nome}" if qtd == 1 else f"{_cem_a_extenso(qtd)} {nome}")
    if restante:
        ultimo = _cem_a_extenso(restante)
        if partes and (restante < 100 or restante % 100 == 0):
            partes.append(f"e {ultimo}")
        else:
            partes.append(ultimo)
    return ("menos " if negativo else "") + " ".join(partes)


def _soletrar(sigla: str) -> str:
    return " ".join(_LETRAS_PT.get(c, c) for c in sigla)


def _limpar_milhar(bruto: str) -> int:
    return int(bruto.replace(".", "").replace(",", ""))


def normalizar_texto(texto: str) -> str:
    """Reescreve números, siglas, datas e símbolos pra forma mais natural
    de ler em voz alta. Roda antes de mandar o texto pro Piper."""

    # datas dd/mm/aaaa -> "14 de julho de 2026"
    def _data(m):
        d, mes, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if not (1 <= mes <= 12):
            return m.group(0)
        return f"{numero_por_extenso(d)} de {_MESES[mes - 1]} de {numero_por_extenso(a)}"
    texto = re.sub(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", _data, texto)

    # moeda: R$ 38.000 | R$38.000,00
    def _moeda(m):
        bruto = m.group(1)
        if "," in bruto:
            inteiro, centavos = bruto.split(",")
            frase = f"{numero_por_extenso(_limpar_milhar(inteiro))} reais"
            c = int((centavos + "00")[:2])
            if c:
                frase += f" e {numero_por_extenso(c)} centavos"
            return frase
        return f"{numero_por_extenso(_limpar_milhar(bruto))} reais"
    texto = re.sub(r"R\$\s*([\d.,]+)", _moeda, texto)

    # percentual: 12% | 12,5%
    def _percentual(m):
        bruto = m.group(1)
        if "," in bruto:
            inteiro, decimal = bruto.split(",")
            digitos = " ".join(_UNIDADES[int(d)] for d in decimal)
            return f"{numero_por_extenso(int(inteiro))} vírgula {digitos} por cento"
        return f"{numero_por_extenso(int(bruto))} por cento"
    texto = re.sub(r"\b(\d+(?:,\d+)?)\s*%", _percentual, texto)

    # ordinais: 1º, 2ª, 13º
    def _ordinal(m):
        n = int(m.group(1))
        return _ORDINAIS.get(n, numero_por_extenso(n))
    texto = re.sub(r"\b(\d{1,2})[ºª°]", _ordinal, texto)

    # abreviações jurídicas: "art. 461" -> "artigo quatrocentos e sessenta e um"
    texto = re.sub(
        r"\bart\.?\s*(\d+)",
        lambda m: f"artigo {numero_por_extenso(int(m.group(1)))}",
        texto,
        flags=re.IGNORECASE,
    )
    texto = re.sub(r"§\s*(\d+)", lambda m: f"parágrafo {numero_por_extenso(int(m.group(1)))}", texto)

    # siglas: conhecidas viram nome completo; desconhecidas são soletradas
    texto = re.sub(
        r"\b[A-ZÀ-Ú]{2,6}\b",
        lambda m: _ACRONIMOS.get(m.group(0), _soletrar(m.group(0))),
        texto,
    )

    # qualquer número solto que tenha sobrado (com milhar, decimal ou simples)
    def _numero_solto(m):
        bruto = m.group(0)
        if "," in bruto:
            inteiro, decimal = bruto.split(",")
            digitos = " ".join(_UNIDADES[int(d)] for d in decimal)
            return f"{numero_por_extenso(_limpar_milhar(inteiro))} vírgula {digitos}"
        return numero_por_extenso(_limpar_milhar(bruto))
    texto = re.sub(r"\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+(?:,\d+)?\b", _numero_solto, texto)

    return texto


# ---------------------------------------------------------------------------
# Pipeline de síntese (Piper)
# ---------------------------------------------------------------------------

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
    # length_scale > 1 deixa a fala um pouco mais devagar (mais clara).
    # sentence_silence adiciona uma pausa curta depois de cada frase, pra
    # não soar corrido. Ajuste esses dois valores por ouvido se precisar
    # (rode `piper --help` pra confirmar se sua versão aceita essas flags).
    subprocess.run(
        [
            "piper", "--model", str(onnx_path), "--output_file", str(destino_wav),
            "--length_scale", "1.08",
            "--sentence_silence", "0.35",
        ],
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
        texto_normalizado = normalizar_texto(cena["narracao"])
        sintetizar(texto_normalizado, onnx_path, wav_path)
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
