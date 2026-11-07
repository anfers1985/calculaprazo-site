#!/usr/bin/env python3
"""
Etapa 2 do pipeline de vídeos do admin — narração, SEPARADA do 03-narracao.py do pipeline antigo.

Gera a voz cena a cena, mede a duração real de cada cena (é ela que define o tempo dos slides) e
envia a narração completa ao Storage.

Vozes (campo `voz` do job):
  francisca   -> Azure Speech, voz neural pt-BR-FranciscaNeural (reserva: Edge TTS)
  thalita-hd  -> Azure Speech, voz HD pt-BR-Thalita:DragonHDLatestNeural (reserva: Francisca)
  gemini      -> Gemini 3.8 Flash TTS do Google (modelo gemini-3.8-flash-tts; gratuito no plano free da API, com limites
                 que só aparecem no seu AI Studio). Usa a GEMINI_API_KEY (e a GEMINI_API_KEY_2, se houver, em rodízio).
                 Nunca mistura vozes: se falhar, a narração PARA e "Tentar de novo" continua nas cenas que faltam
                 (GEMINI_TTS_RESERVA=francisca refaz o vídeo INTEIRO com a Francisca em vez de parar).
  clonada     -> a SUA voz clonada, rodando no seu computador (reserva: Francisca). Configure UM destes:
                   VOZ_CLONADA_URL  = servidor de TTS compatível com a API da OpenAI (POST .../v1/audio/speech),
                                      ex.: http://localhost:8000  (+ VOZ_CLONADA_MODEL, VOZ_CLONADA_VOICE, VOZ_CLONADA_KEY opcionais)
                   (se a voz clonada falhar, a narração é interrompida para não misturar vozes; VOZ_CLONADA_ESTRITA=0 aceita a Francisca de reserva)
                   VOZ_CLONADA_CMD  = comando que gera o áudio, com os marcadores {texto_arquivo} (txt UTF-8 de entrada)
                                      e {saida} (arquivo de saída .wav/.mp3), ex.: python minha_voz.py {texto_arquivo} {saida}
Qualquer falha numa voz melhor cai automaticamente na Francisca, para o job nunca ficar travado.

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, GEMINI_API_KEY
     (opcionais: GEMINI_TTS_MODEL [gemini-3.8-flash-tts | gemini-3.8-flash-lite-tts], GEMINI_TTS_VOICE [Kore, Puck... ou voice_... da sua voz replicada],
      GEMINI_TTS_STYLE, GEMINI_TTS_INTERVALO_S, GEMINI_TTS_TENTATIVAS, GEMINI_TTS_TIMEOUT_S, GEMINI_TTS_RESERVA, TTS_FAKE=1 só para testes sem rede)
Uso: python narracao.py <job_id>
     python narracao.py --testar-gemini "texto" --saida amostra.mp3     |     python narracao.py --listar-vozes-gemini
     python narracao.py --local roteiro.json --voz clonada|francisca --saida pasta   (sem Supabase; atualiza o roteiro.json)
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qa_voz import QAVoz  # noqa: E402  (QA da voz: transcreve cada cena e compara com o texto esperado)

VOZ_PADRAO = "pt-BR-FranciscaNeural"
VOZ_HD = {"thalita-hd": "pt-BR-Thalita:DragonHDLatestNeural"}
AZURE_KEY = (os.environ.get("AZURE_SPEECH_KEY") or "").strip()
AZURE_REGION = (os.environ.get("AZURE_SPEECH_REGION") or "").strip().lower()
AZURE_OK = bool(AZURE_KEY and AZURE_REGION)
FAKE = os.environ.get("TTS_FAKE") == "1"

def _ms(nome, padrao):
    try:
        return int(os.environ.get(nome) or padrao)
    except ValueError:
        return padrao


PAUSA_PONTO = _ms("TTS_PAUSA_PONTO", 320)            # entre frases da mesma cena
PAUSA_INTERROGACAO = _ms("TTS_PAUSA_PERGUNTA", 520)
PAUSA_ENTRE_CENAS = _ms("TTS_PAUSA_CENA", 450)       # entre cenas comuns
PAUSA_TOPICO = _ms("TTS_PAUSA_TOPICO", 950)          # ANTES de um novo tópico (capítulo ou cena de pergunta): respiro maior
RATE_CTA = "-6%"
TEMPO_LEITURA = float(os.environ.get("TTS_TEMPO_LEITURA") or 1.0)   # multiplica o tempo mínimo de tela por slide; 0 desliga
MAX_EXTRA_LEITURA = 4.0                                             # segundos de silêncio acrescentados, no máximo, por cena


def minimo_tela(c: dict) -> float:
    """Tempo mínimo (s) que o slide precisa ficar na tela para dar tempo de ler (infográficos têm vários itens)."""
    t = str(c.get("tipo") or "")
    if not TEMPO_LEITURA or t in ("", "capa", "encerramento", "ilustracao"):
        return 0.0
    n = len(c.get("cards") or c.get("passos") or c.get("itens") or [])
    if t == "grade":
        base = 3.2 + 1.6 * n
    elif t == "passos":
        base = 3.2 + 1.7 * n
    elif t == "lista":
        base = 3.2 + 1.4 * n
    else:
        base = {"decisao": 8.0, "comparacao": 6.5, "numero": 5.5, "afirmacao": 4.5, "destaque": 4.5, "citacao": 4.5, "pergunta": 3.8}.get(t, 0.0)
    return base * TEMPO_LEITURA

TTS_CORTE_DBFS = float(os.environ.get("TTS_CORTE_DBFS") or -50)      # silêncio nas pontas (era -42: raspava finais suaves de palavra)
TTS_MARGEM_FIM_MS = int(os.environ.get("TTS_MARGEM_FIM_MS") or 120)  # folga que sobra depois da última sílaba
TTS_FONEMAS = (os.environ.get("TTS_FONEMAS") or "0") == "1"          # SSML <phoneme> na Francisca: DESLIGADO por padrão (IPA não validado de ouvido); ligue com TTS_FONEMAS=1
# Palavras que a Francisca lê errado ("jornada" saía "rornada"): IPA pt-BR. Só vozes Azure sem Dragon (HD não aceita phoneme).
FONEMAS_AZURE = {
    "jornadas": "ʒoɾˈnadɐs", "jornada": "ʒoɾˈnadɐ",
    "intrajornada": "ĩtɾɐʒoɾˈnadɐ", "interjornada": "ĩteɾʒoɾˈnadɐ",
}
def _carregar_pronuncias_aprendidas():
    """pronuncias.json: respelling por palavra, valendo para QUALQUER voz. É alimentado pelo relatório do QA (qa-voz.json):
    as trocas que se repetem lá são as candidatas; entra aqui o que você aprovar."""
    caminho = Path(__file__).resolve().parent / "pronuncias.json"
    try:
        import json
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        return {k: v for k, v in dados.items() if not str(k).startswith("_") and isinstance(v, str) and v.strip()}
    except (OSError, ValueError):
        return {}


PRONUNCIAS_APRENDIDAS = _carregar_pronuncias_aprendidas()
RATE_TOPICO = os.environ.get("TTS_RATE_TOPICO") or "-6%"  # 1ª frase do tópico: um pouco mais devagar, soa como abertura

_SPLIT = re.compile(r"(?<=[.!?])\s+")
PRONUNCIAS = {
    "TST": "Tribunal Superior do Trabalho", "TRT": "Tribunal Regional do Trabalho",
    "FGTS": "éfe gê tê ésse", "INSS": "í ene ésse ésse", "CLT": "cê éle tê",
    "CCT": "Convenção Coletiva de Trabalho", "ACT": "Acordo Coletivo de Trabalho",
    "MTE": "Ministério do Trabalho e Emprego", "ADCT": "á dê cê tê", "CF": "Constituição Federal",
    "STF": "Supremo Tribunal Federal", "STJ": "Superior Tribunal de Justiça", "OJ": "Orientação Jurisprudencial",
    "SDI": "ésse dê í", "NR": "norma regulamentadora", "EPI": "é pê í", "EPIs": "é pê ís", "CTPS": "cê tê pê ésse", "CPC": "cê pê cê",
    "OIT": "ó í tê", "DSR": "dê ésse érre", "PLR": "pê éle érre", "IRR": "í érre érre", "CNJ": "cê ene jota", "PJe": "pê jota é",
    "eSocial": "é-social", "LC": "Lei Complementar", "DAE": "dê á é", "CAGED": "Caged", "CIPA": "Cipa", "PPP": "pê pê pê", "LTCAT": "éle tê cê á tê",
}
# Abreviações que a voz lê errado ("art" soletrado, "§" mudo...). Aplicadas ANTES de converter números.
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def _data_falada(m):
    d, mes, ano = int(m.group(1)), int(m.group(2)), m.group(3)
    return f"{d} de {MESES[mes - 1]} de {ano}" if 1 <= mes <= 12 else m.group(0)


ABREVIACOES = [
    (r"\barts\.?(?=\s)", "artigos"), (r"\bart\.?(?=\s)", "artigo"), (r"§§\s*", "parágrafos "), (r"§\s*", "parágrafo "),
    (r"\bincs\.(?=\s)", "incisos"), (r"\binc\.(?=\s)", "inciso"), (r"\bal[ií]n\.(?=\s)", "alínea"), (r"\bsúm\.(?=\s)", "súmula"),
    (r"\bex\.:?(?=\s)", "por exemplo,"), (r"\bp\.\s?ex\.", "por exemplo"), (r"\betc\.", "etcétera"),
    (r"\bSDI[-\s]?(\d)\b", r"SDI \1"), (r"\bNR[-\s]?(\d+)", r"NR \1"),
    (r"\bCF/(\d{2})\b", r"Constituição Federal de 19\1"), (r"\bCLT/\d{2}\b", "CLT"),
    (r"\b(\d+)\s*[-–]\s*(\d+)\b(?=\s*(?:dias|meses|anos|horas))", r"\1 a \2"),
    (r"\be/ou\b", "e ou"),
    (r"\bCalcula\s?Prazo\b", "Calcula Prazo"),
    (r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", _data_falada),
    (r"(?<=\w)/(?=\w)", " "),
]


def normalizar_texto_fala(texto: str, siglas: bool = True) -> str:
    """Rede de segurança: números/R$/% viram extenso e siglas ganham pronúncia clara. siglas=False devolve só o texto falado
    (sem respelling), que é o que o QA compara com a transcrição do áudio."""
    try:
        from num2words import num2words
    except ImportError:
        num2words = None
    t = texto
    # Conectores raros que a voz lê mal ("Aliás" virou "Elias"): troca por equivalentes comuns, mantendo a maiúscula inicial.
    _raros = {"aliás": "além disso", "alias": "além disso", "outrossim": "além disso", "ademais": "além disso", "destarte": "assim", "porquanto": "pois"}
    t = re.sub(r"\b(ali[aá]s|outrossim|destarte|ademais|porquanto)\b",
               lambda m: (_raros[m.group(0).lower()].capitalize() if m.group(0)[0].isupper() else _raros[m.group(0).lower()]), t, flags=re.I)
    # Marcadores/placeholders e formatação que a voz leria em voz alta ("*número*", "[número]", "**negrito**"): somem.
    t = re.sub(r"[*_`#~<>\[\]{}|]+\s*n[úu]meros?\s*[*_`#~<>\[\]{}|]+", " ", t, flags=re.I)
    t = re.sub(r"[*_`#~<>\[\]{}|\\]+", " ", t)
    # "Tema número 171", "Tema nº 171", "artigo n.º 189": a voz lê "número"; o jeito natural é "Tema cento e setenta e um".
    t = re.sub(r"\b(tema|s[úu]mula|artigos?|art\.?|lei|oj|orienta[çc][ãa]o jurisprudencial|precedente|inciso|par[áa]grafo)\s+(?:n[úu]meros?|n\.?\s*[º°o]\.?)\s+", r"\1 ", t, flags=re.I)
    t = re.sub(r"\bn(?:[úu]mero|\.?\s*[º°])\s*(?=\d)", "", t, flags=re.I)
    # "150/2015" (lei/ano): "cento e cinquenta de dois mil e quinze" (a barra viraria espaço e a voz leria dois números soltos)
    t = re.sub(r"(?<![\d/])(\d{1,4})/(\d{4})(?![\d/])", r"\1 de \2", t)
    for padrao, troca in ABREVIACOES:
        t = re.sub(padrao, troca, t, flags=re.I)
    t = re.sub(r"R\$\s*(\d+(?:\.\d{3})*),(\d{2})", lambda m: f"{m.group(1)} reais e {m.group(2)} centavos", t)
    t = re.sub(r"R\$\s*(\d+(?:\.\d{3})*)", lambda m: f"{m.group(1)} reais", t)
    t = re.sub(r"(\d+),(\d+)\s*%", r"\1 vírgula \2 por cento", t)  # 3,2% → "3 vírgula 2 por cento" (antes saía "três,dois")
    t = re.sub(r"(\d+)\s*%", r"\1 por cento", t)
    t = re.sub(r"(?<![\d.,])(\d+),(\d+)(?!\d)", r"\1 vírgula \2", t)  # decimais soltos: 0,8 → "zero vírgula oito"
    t = re.sub(r"(\d+)\s*[ºª°]", r"\1", t)
    if num2words:
        def _n(m):
            try:
                return num2words(int(m.group(0).replace(".", "")), lang="pt_BR").replace(",", "")
            except Exception:
                return m.group(0)
        t = re.sub(r"\d+(?:\.\d{3})*", _n, t)
    if siglas:
        for sigla, falado in PRONUNCIAS.items():
            t = re.sub(rf"\b{sigla}\b", falado, t)
        for palavra, falado in PRONUNCIAS_APRENDIDAS.items():
            t = re.sub(rf"\b{re.escape(palavra)}\b", falado, t, flags=re.I)
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
    if TTS_FONEMAS and "Dragon" not in voz:
        for palavra, ipa in FONEMAS_AZURE.items():
            corpo = re.sub(rf"\b{palavra}\b", lambda m, ipa=ipa: f"<phoneme alphabet='ipa' ph='{ipa}'>{m.group(0)}</phoneme>", corpo, flags=re.I)
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


class CotaGeminiEsgotada(RuntimeError):
    """Cota DIÁRIA (ou zero) do Gemini TTS: esperar minutos não adianta."""


class ReservaFrancisca(RuntimeError):
    """Sinaliza que a narração deve ser refeita INTEIRA com a Francisca (GEMINI_TTS_RESERVA=francisca)."""


GEMINI_ESTILO_PADRAO = "narração clara, calma e profissional, em português do Brasil"
_gem = {"ultimo": 0.0, "intervalo": None, "k": 0}


def _gemini_chaves():
    return [k.strip() for k in (os.environ.get("GEMINI_API_KEY"), os.environ.get("GEMINI_API_KEY_2")) if k and k.strip()]


def _gemini_base():
    return (os.environ.get("GEMINI_API_BASE") or "https://generativelanguage.googleapis.com").rstrip("/")


def _atraso_sugerido(r) -> float:
    """Segundos que a API pediu para esperar (cabeçalho Retry-After ou 'retryDelay': '34s' no corpo)."""
    try:
        if r.headers.get("Retry-After"):
            return float(r.headers["Retry-After"])
    except ValueError:
        pass
    m = re.search(r"retry\w*delay\W+(\d+(?:\.\d+)?)\s*s", r.text or "", re.I) or re.search(r"retry in (\d+(?:\.\d+)?)\s*s", r.text or "", re.I)
    return float(m.group(1)) if m else 0.0


def _audio_para_segmento(dados: bytes) -> AudioSegment:
    """O Gemini 3.8 devolve WAV (com cabeçalho RIFF) em chamadas normais; PCM cru 24 kHz mono 16 bits em streaming."""
    if dados[:4] == b"RIFF":
        return AudioSegment.from_file(io.BytesIO(dados), format="wav")
    return AudioSegment(data=dados, sample_width=2, frame_rate=24000, channels=1)


def _extrair_audio_gemini(j: dict) -> bytes:
    """Resposta da Interactions API: steps[].content[] com {type:'audio', data:<base64>}; pega o último bloco de áudio."""
    achados = []
    for step in j.get("steps") or []:
        for c in step.get("content") or []:
            if isinstance(c, dict) and c.get("type") == "audio" and c.get("data"):
                achados.append(c["data"])
    if not achados:  # tolera variações de formato
        for o in j.get("outputs") or []:
            if isinstance(o, dict) and o.get("type") == "audio" and o.get("data"):
                achados.append(o["data"])
    if not achados:
        raise RuntimeError(f"Gemini TTS respondeu sem áudio (campos: {list(j.keys())[:8]}).")
    return base64.b64decode(achados[-1])


def sintetizar_gemini(texto: str, destino: Path):
    """Gemini 3.8 Flash TTS (Interactions API). Modelos antigos (2.5/3.1) usam o caminho legado."""
    chaves = _gemini_chaves()
    if not chaves:
        raise RuntimeError("GEMINI_API_KEY ausente.")
    modelo = (os.environ.get("GEMINI_TTS_MODEL") or "gemini-3.8-flash-tts").strip()
    if not modelo.startswith("gemini-3.8"):
        return _gemini_legado(texto, destino, modelo, chaves[0])
    voz = (os.environ.get("GEMINI_TTS_VOICE") or "Kore").strip()
    estilo = (os.environ.get("GEMINI_TTS_STYLE") or "").strip()  # vazio = estilo padrão; "nenhum" = sem estilo
    estilo = GEMINI_ESTILO_PADRAO if not estilo else ("" if estilo.lower() in ("nenhum", "-") else estilo)
    limpo = re.sub(r"<[^>]*>", " ", texto)  # <...> e |...| são comandos do modelo (tags/backchannel), nunca devem vir do roteiro
    limpo = re.sub(r"[<>|]", " ", limpo)
    limpo = re.sub(r"\s+", " ", limpo).strip()
    anot = [{"type": "speech_metadata", "style": estilo}] if estilo else []
    item = {"type": "text", "text": limpo}
    if anot:
        item["annotations"] = anot
    corpo = {"model": modelo, "input": [{"type": "user_input", "content": [item]}], "response_format": {"type": "audio"},
             "generation_config": {"speech_config": [{"voice": voz}]}}
    tentativas = int(os.environ.get("GEMINI_TTS_TENTATIVAS") or 8)
    timeout = int(os.environ.get("GEMINI_TTS_TIMEOUT_S") or 180)
    if _gem["intervalo"] is None:
        _gem["intervalo"] = float(os.environ.get("GEMINI_TTS_INTERVALO_S") or 2)
    url = f"{_gemini_base()}/v1beta/interactions"
    ultimo = None
    for n in range(tentativas):
        folga = _gem["intervalo"] - (time.time() - _gem["ultimo"])  # espaçamento entre chamadas (sobe sozinho se vier 429)
        if folga > 0:
            time.sleep(folga)
        chave = chaves[_gem["k"] % len(chaves)]
        espera = 0.0
        try:
            r = requests.post(url, headers={"x-goog-api-key": chave, "Content-Type": "application/json"}, json=corpo, timeout=timeout)
            _gem["ultimo"] = time.time()
            if r.status_code == 200:
                seg = _audio_para_segmento(_extrair_audio_gemini(r.json()))
                if len(seg) < 200:
                    raise RuntimeError("Gemini TTS devolveu áudio vazio.")
                seg.export(str(destino), format="mp3")
                return
            msg = (r.text or "")[:300]
            baixo = msg.lower()
            if r.status_code == 429:
                if "perday" in baixo.replace(" ", "").replace("_", "") or "per day" in baixo or "daily" in baixo or "limit: 0" in baixo:
                    if len(chaves) > 1 and n < len(chaves) - 1:  # outra chave (outro projeto) pode ter cota
                        _gem["k"] += 1
                        ultimo = RuntimeError(f"Cota diária da chave {n + 1} esgotada; tentando a outra chave.")
                        continue
                    raise CotaGeminiEsgotada("A cota diária do Gemini TTS (plano gratuito) acabou para esta chave/projeto. Ela renova à meia-noite (horário do Pacífico), "
                                             "ou use outra chave (GEMINI_API_KEY_2, de outro projeto), o modelo gemini-3.8-flash-lite-tts, ou o plano pago.")
                _gem["intervalo"] = max(_gem["intervalo"], float(os.environ.get("GEMINI_TTS_INTERVALO_429_S") or 21))  # ≈ 3 pedidos/min: o plano gratuito é apertado
                if len(chaves) > 1:
                    _gem["k"] += 1  # tenta a outra chave antes de esperar
                    espera = 0.0 if n % len(chaves) != len(chaves) - 1 else max(_atraso_sugerido(r), 15.0)
                else:
                    sug = _atraso_sugerido(r)  # a própria API diz quanto esperar; sem isso, espera crescente
                    espera = (sug + 1.0) if sug else min(15.0 * (2 ** min(n, 3)), 120.0)
                ultimo = RuntimeError(f"Gemini TTS HTTP 429 (limite por minuto): {msg[:120]}")
            elif r.status_code in (500, 502, 503, 504):
                ultimo = RuntimeError(f"Gemini TTS HTTP {r.status_code}: {msg[:120]}")
                espera = min(6.0 * (n + 1), 60.0)
            elif r.status_code in (401, 403):
                raise RuntimeError(f"O Google recusou a GEMINI_API_KEY (HTTP {r.status_code}): {msg[:160]}")
            elif r.status_code == 404:
                raise RuntimeError(f"Modelo/rota não encontrado (HTTP 404): confira GEMINI_TTS_MODEL={modelo}. {msg[:160]}")
            else:
                raise RuntimeError(f"Gemini TTS HTTP {r.status_code}: {msg[:200]}")
        except (CotaGeminiEsgotada,):
            raise
        except requests.RequestException as e:
            ultimo = e
            espera = min(6.0 * (n + 1), 60.0)
        except RuntimeError as e:
            if str(e).startswith(("O Google recusou", "Modelo/rota", "Gemini TTS HTTP")) and "HTTP 5" not in str(e) and "429" not in str(e):
                raise
            ultimo = e
            espera = 4.0
        if n < tentativas - 1 and espera > 0:
            print(f"    Gemini TTS: {str(ultimo)[:110]} — aguardando {espera:.0f}s (tentativa {n + 1}/{tentativas})")
            time.sleep(espera)
    raise RuntimeError(f"Gemini TTS falhou após {tentativas} tentativas: {str(ultimo)[:200]}")


def _gemini_legado(texto: str, destino: Path, modelo: str, chave: str):
    """Modelos antigos (gemini-2.5-*-preview-tts, gemini-3.1-flash-tts-preview): API generateContent, PCM 24 kHz mono."""
    voz = os.environ.get("GEMINI_TTS_VOICE") or "Kore"
    corpo = {"contents": [{"parts": [{"text": "Narre em português do Brasil, com naturalidade, clareza e ritmo de apresentador de vídeo educativo: " + texto}]}],
             "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}}}}}
    ultimo = None
    for tentativa in range(1, 4):
        try:
            r = requests.post(f"{_gemini_base()}/v1beta/models/{modelo}:generateContent",
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


def listar_vozes_gemini(idioma: str = "pt-BR"):
    """Vozes do Extended Voice Library para o idioma (GET /v1beta/voices). Devolve lista de dicts."""
    chaves = _gemini_chaves()
    if not chaves:
        raise RuntimeError("GEMINI_API_KEY ausente.")
    out, token = [], None
    for _ in range(10):
        params = [("language_code", idioma), ("page_size", "100")] + ([("page_token", token)] if token else [])
        r = requests.get(f"{_gemini_base()}/v1beta/voices", headers={"x-goog-api-key": chaves[0]}, params=params, timeout=60)
        if r.status_code != 200:
            raise RuntimeError(f"Listar vozes: HTTP {r.status_code}: {r.text[:200]}")
        j = r.json()
        for v in j.get("voices") or []:
            out.append({"id": v.get("id") or v.get("name"), "nome": v.get("display_name") or v.get("displayName") or v.get("id"),
                        "genero": v.get("gender"), "sotaque": v.get("accent"), "tom": v.get("pitch"), "descricao": v.get("description")})
        token = j.get("next_page_token") or j.get("nextPageToken")
        if not token:
            break
    return out


def sintetizar_clonada(texto: str, destino: Path):
    """Voz clonada local: servidor compatível com OpenAI (VOZ_CLONADA_URL) ou comando próprio (VOZ_CLONADA_CMD)."""
    import shlex
    import subprocess
    import tempfile
    timeout = int(os.environ.get("VOZ_CLONADA_TIMEOUT_S") or 600)  # vozes clonadas locais podem demorar (CPU/GPU)
    cmd = (os.environ.get("VOZ_CLONADA_CMD") or "").strip()
    url = (os.environ.get("VOZ_CLONADA_URL") or "").strip().rstrip("/")
    if cmd:
        with tempfile.TemporaryDirectory() as d:
            txt = Path(d) / "texto.txt"
            saida = Path(d) / "saida.wav"
            txt.write_text(texto, encoding="utf-8")
            linha = cmd.replace("{texto_arquivo}", str(txt)).replace("{saida}", str(saida))
            r = subprocess.run(linha if os.name == "nt" else shlex.split(linha), shell=(os.name == "nt"),
                               capture_output=True, text=True, timeout=timeout)
            if r.returncode != 0 or not saida.exists() or saida.stat().st_size < 1000:
                raise RuntimeError(f"VOZ_CLONADA_CMD falhou (código {r.returncode}): {(r.stderr or r.stdout)[-300:]}")
            AudioSegment.from_file(str(saida)).export(str(destino), format="mp3")
        return
    if not url:
        raise RuntimeError("Voz clonada não configurada (defina VOZ_CLONADA_URL ou VOZ_CLONADA_CMD).")
    endpoint = url if url.endswith("/audio/speech") else (url + "/audio/speech" if url.endswith("/v1") else url + "/v1/audio/speech")
    headers = {"Content-Type": "application/json"}
    if os.environ.get("VOZ_CLONADA_KEY"):
        headers["Authorization"] = "Bearer " + os.environ["VOZ_CLONADA_KEY"]
    corpo = {"model": os.environ.get("VOZ_CLONADA_MODEL") or "tts-1", "input": texto,
             "voice": os.environ.get("VOZ_CLONADA_VOICE") or "clonada", "response_format": "mp3"}
    ultimo = None
    for tentativa in range(1, 3):
        try:
            r = requests.post(endpoint, headers=headers, json=corpo, timeout=timeout)
            if r.status_code == 200 and len(r.content) > 1000:
                destino.write_bytes(r.content)
                return
            ultimo = RuntimeError(f"Voz clonada HTTP {r.status_code}: {r.text[:150]}")
        except requests.RequestException as e:
            ultimo = e
        time.sleep(3 * tentativa)
    raise ultimo


class Vozes:
    """Escolhe o motor e cai para a Francisca se a voz pedida falhar."""
    def __init__(self, voz: str):
        self.voz = voz if voz in ("francisca", "thalita-hd", "gemini", "clonada") else "francisca"
        self.rebaixada = False
        self.azure_ok = AZURE_OK

    @property
    def cena_inteira(self):  # vozes "contextuais" recebem a cena toda de uma vez
        return not self.rebaixada and self.voz in ("thalita-hd", "gemini", "clonada")

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
        elif not self.rebaixada and self.voz == "clonada":
            try:
                return sintetizar_clonada(texto, destino)
            except Exception as e:  # noqa: BLE001
                # Padrão: NÃO misturar duas vozes no mesmo vídeo. Interrompe; rodar de novo tenta outra vez.
                # Para aceitar a Francisca como reserva: VOZ_CLONADA_ESTRITA=0
                if (os.environ.get("VOZ_CLONADA_ESTRITA") or "1") != "0":
                    raise RuntimeError(f"A voz clonada falhou ({str(e)[:200]}). Nada foi misturado com outra voz; rode de novo para tentar outra vez "
                                       "(ou defina VOZ_CLONADA_ESTRITA=0 para aceitar a Francisca como reserva).") from e
                print(f"  Voz clonada falhou ({str(e)[:160]}). Usando a Francisca neste vídeo.")
                self.rebaixada = True
        elif not self.rebaixada and self.voz == "gemini":
            try:
                return sintetizar_gemini(texto, destino)
            except Exception as e:  # noqa: BLE001
                # Nunca mistura vozes no mesmo vídeo. Reserva opcional: refaz o vídeo INTEIRO com a Francisca.
                if (os.environ.get("GEMINI_TTS_RESERVA") or "").lower() == "francisca":
                    raise ReservaFrancisca(str(e)) from e
                raise RuntimeError(f"A voz Gemini falhou: {str(e)[:260]}\n  Nada foi misturado com outra voz. Rode de novo para continuar nas cenas que faltam "
                                   "(ou defina GEMINI_TTS_RESERVA=francisca para refazer o vídeo inteiro com a Francisca).") from e
        return self._padrao(texto, rate, destino)


def _rate_mais(rate: str, delta: int) -> str:
    """"+0%" com delta -4 → "-4%" (variação de velocidade das tentativas do QA)."""
    m = re.fullmatch(r"([+-]?\d+)%", str(rate).strip())
    return f"{int(m.group(1)) + int(delta):+d}%" if m else rate


def cortar_pontas(seg: AudioSegment, limiar=None) -> AudioSegment:
    limiar = TTS_CORTE_DBFS if limiar is None else limiar
    ini = max(0, detect_leading_silence(seg, silence_threshold=limiar) - 40)
    fim = max(0, detect_leading_silence(seg.reverse(), silence_threshold=limiar) - TTS_MARGEM_FIM_MS)
    c = seg[ini: len(seg) - fim]
    return c if len(c) > 50 else seg


class _VozesReserva:
    """Resultado quando o vídeo inteiro foi refeito com a Francisca (voz de reserva)."""
    voz = "francisca"
    rebaixada = True


def narrar_roteiro(roteiro: dict, voz: str, saida: Path, qa=None):
    """Gera o áudio. Preenche cena['duracao_seg'] e devolve (mp3_final, duracao_total_seg)."""
    saida.mkdir(parents=True, exist_ok=True)
    tmp = saida / "_trechos"
    tmp.mkdir(exist_ok=True)
    vozes = Vozes(voz)
    cenas = roteiro["cenas"]
    print(f"Narração: voz={vozes.voz} ({len(cenas)} cenas)")
    total = AudioSegment.empty()
    # Início de tópico: cena listada em "capitulos" (vídeo longo) ou cena de pergunta (abre um assunto novo).
    topicos = set()
    for c in (roteiro.get("capitulos") or []):
        try:
            topicos.add(int(c.get("cena")) - 1)
        except (TypeError, ValueError, AttributeError):
            pass
    topicos |= {i for i, c in enumerate(cenas) if str(c.get("tipo") or "") == "pergunta"}
    if len(cenas) > 1:
        topicos.add(len(cenas) - 1)  # o convite final também ganha um respiro maior (não cai direto do último ponto)
    topicos.discard(0)
    for i, cena in enumerate(cenas):
        rate = RATE_CTA if i == len(cenas) - 1 else "+0%"

        def gerar_fala(delta=0, refazer=False, i=i, cena=cena, rate=rate):
            """Sintetiza a fala da cena (sem a pausa final). delta = variação de velocidade (%) das novas tentativas do QA; refazer ignora o cache."""
            seg_cena = AudioSegment.empty()
            if vozes.cena_inteira:
                mp3 = tmp / f"c{i:03d}.mp3"
                texto_cena = normalizar_texto_fala(cena["narracao"])
                # Cache por cena (vozes lentas/limitadas): numa nova execução reaproveita o que já foi gerado com a MESMA voz e texto.
                marca = tmp / f"c{i:03d}.txt"
                chave = f"{vozes.voz}|{os.environ.get('GEMINI_TTS_MODEL', '')}|{os.environ.get('GEMINI_TTS_VOICE', '')}|{os.environ.get('GEMINI_TTS_STYLE', '')}|{texto_cena}"
                guardavel = (not FAKE) and vozes.voz in ("gemini", "clonada") and not refazer
                if guardavel and mp3.exists() and mp3.stat().st_size > 1000 and marca.exists() and marca.read_text(encoding="utf-8") == chave:
                    print(f"  cena {i + 1}/{len(cenas)}: reaproveitada de uma execução anterior")
                else:
                    if guardavel:
                        print(f"  cena {i + 1}/{len(cenas)}: gerando...")
                    vozes.sintetizar(texto_cena, _rate_mais(rate, delta), mp3)   # ReservaFrancisca sobe para o chamador
                    if guardavel and mp3.exists():
                        marca.write_text(chave, encoding="utf-8")
                seg_cena += cortar_pontas(AudioSegment.from_file(mp3, format="mp3"))
            if not vozes.cena_inteira or len(seg_cena) == 0:  # inclui o caso em que a voz melhor foi rebaixada no meio
                for j, (frase, pausa) in enumerate(dividir_em_frases(cena["narracao"])):
                    mp3 = tmp / f"c{i:03d}_{j:02d}.mp3"
                    base = RATE_TOPICO if (j == 0 and i in topicos and rate == "+0%") else rate
                    vozes.sintetizar(frase, _rate_mais(base, delta), mp3)
                    time.sleep(0.2 if not FAKE else 0)
                    seg_cena += cortar_pontas(AudioSegment.from_file(mp3, format="mp3")) + AudioSegment.silent(duration=pausa)
            return seg_cena

        try:
            seg_cena = gerar_fala()
        except ReservaFrancisca as e:
            print(f"  Gemini TTS indisponível ({str(e)[:140]}). GEMINI_TTS_RESERVA=francisca: refazendo a narração INTEIRA com a Francisca.")
            return narrar_roteiro(roteiro, "francisca", saida, qa)[:2] + (_VozesReserva(),)
        if qa:
            def _regerar(delta, gerar=gerar_fala):
                try:
                    return gerar(delta, True)
                except ReservaFrancisca:
                    return None
            seg_cena = qa.garantir(i, normalizar_texto_fala(cena["narracao"], siglas=False), seg_cena, _regerar)
        _chars = len(normalizar_texto_fala(cena["narracao"])); _fala = max(len(seg_cena) / 1000, 0.1)
        if _chars >= 40 and _chars / _fala > float(os.environ.get("TTS_MAX_CHARS_SEG") or 22):
            print(f"  AVISO cena {i + 1}: {_chars} caracteres em {_fala:.1f}s ({_chars / _fala:.0f} car/s): possível áudio truncado ou palavras engolidas; ouça este trecho.")
        seg_cena += AudioSegment.silent(duration=PAUSA_TOPICO if (i + 1) in topicos else PAUSA_ENTRE_CENAS)  # respiro maior antes de um novo tópico
        falta = minimo_tela(cena) - len(seg_cena) / 1000
        if falta > 0.05:   # slide com informação demais para a fala curta: segura a tela um pouco mais (silêncio)
            seg_cena += AudioSegment.silent(duration=int(min(falta, MAX_EXTRA_LEITURA) * 1000))
        cena["duracao_seg"] = round(len(seg_cena) / 1000, 2)
        total += seg_cena
    final = saida / "narracao.mp3"
    total.export(str(final), format="mp3", bitrate="128k")
    return final, round(len(total) / 1000, 2), vozes


def _relatar_qa(sb, job_id: str, qa, roteiro: dict):
    """Guarda o relatório do QA da voz (por cena) e soma as trocas observadas ao dicionário de candidatas (pasta fora do job: não é apagada na limpeza)."""
    import json
    from datetime import datetime, timezone
    resumo = qa.resumo()
    roteiro["qa_voz"] = resumo
    print(f"QA da voz: {resumo['cenas_avaliadas']} cena(s) avaliada(s), {resumo['cenas_refeitas']} refeita(s), {resumo['cenas_reprovadas_final']} ainda divergente(s).")
    for t in resumo["trocas_top"][:8]:
        print(f"  voz trocou \"{t['esperado']}\" por \"{t['ouvido']}\" ({t['vezes']}x)")
    try:
        corpo = json.dumps({"job": job_id, "resumo": resumo, "cenas": qa.relatorio}, ensure_ascii=False, indent=1).encode("utf-8")
        sb.storage.from_("pipeline").upload(f"admin-videos/{job_id}/qa-voz.json", corpo, {"upsert": "true", "content-type": "application/json"})
        caminho = "admin-videos/_pronuncias/observadas.json"
        try:
            obs = json.loads(sb.storage.from_("pipeline").download(caminho).decode("utf-8"))
        except Exception:  # noqa: BLE001  (primeira vez ou arquivo ilegível)
            obs = {}
        agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for esp, ouv in qa.observadas:
            e = obs.setdefault(f"{esp} -> {ouv}", {"vezes": 0})
            e["vezes"] += 1
            e["ultima"] = agora
        sb.storage.from_("pipeline").upload(caminho, json.dumps(obs, ensure_ascii=False, indent=1).encode("utf-8"), {"upsert": "true", "content-type": "application/json"})
    except Exception as e:  # noqa: BLE001  (o relatório nunca derruba o job)
        print(f"  Aviso: não consegui guardar o relatório do QA ({str(e)[:140]}).")


def main(job_id: str):
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    job = sb.table("video_admin_jobs").select("*").eq("id", job_id).single().execute().data
    sb.table("video_admin_jobs").update({"etapa_atual": "narracao"}).eq("id", job_id).execute()
    roteiro = job["roteiro"]
    qa = None if FAKE else QAVoz.criar(AZURE_KEY, AZURE_REGION, {k.lower() for k in PRONUNCIAS})
    final, dur, vozes = narrar_roteiro(roteiro, job.get("voz") or "francisca", Path("output/audio"), qa)
    alvo = job["duracao_alvo_seg"]
    desvio = round((dur - alvo) / alvo * 100, 1)
    roteiro["duracao_real_seg"] = dur
    roteiro["desvio_duracao_pct"] = desvio
    roteiro["voz_usada"] = "francisca (reserva)" if vozes.rebaixada else vozes.voz
    print(f"Duração real {dur}s (alvo {alvo}s, desvio {desvio:+.1f}%)")
    if abs(desvio) > 25:
        print("AVISO: a duração real ficou a mais de 25% do alvo.")
    if qa:
        _relatar_qa(sb, job_id, qa, roteiro)
    caminho = f"admin-videos/{job_id}/narracao.mp3"
    sb.storage.from_("pipeline").upload(caminho, final.read_bytes(), {"upsert": "true", "content-type": "audio/mpeg"})
    sb.table("video_admin_jobs").update({"narracao_path": caminho, "roteiro": roteiro, "duracao_real_seg": dur,
                                         "status": "narracao_ok", "erro_etapa": None, "erro_mensagem": None}).eq("id", job_id).execute()
    print(f"Narração enviada: {caminho}")


def main_local(argv):
    """Modo local, sem Supabase: lê/atualiza o roteiro.json e grava <saida>/narracao.mp3."""
    import argparse
    import json
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", required=True, help="caminho do roteiro.json")
    ap.add_argument("--voz", default="francisca")
    ap.add_argument("--saida", required=True)
    a = ap.parse_args(argv)
    caminho = Path(a.local)
    roteiro = json.loads(caminho.read_text(encoding="utf-8"))
    qa = None if FAKE else QAVoz.criar(AZURE_KEY, AZURE_REGION, {k.lower() for k in PRONUNCIAS})
    final, dur, vozes = narrar_roteiro(roteiro, a.voz, Path(a.saida), qa)
    if qa:
        roteiro["qa_voz"] = qa.resumo()
        print(f"QA da voz: {roteiro['qa_voz']}")
    roteiro["duracao_real_seg"] = dur
    roteiro["voz_usada"] = "francisca (reserva)" if vozes.rebaixada else vozes.voz
    caminho.write_text(json.dumps(roteiro, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Narração pronta: {final} ({dur}s, voz {roteiro['voz_usada']})")


def main_testar_gemini(argv):
    """Amostra de voz: python narracao.py --testar-gemini "texto" --saida amostra.mp3 (usa GEMINI_TTS_MODEL/VOICE/STYLE do ambiente)."""
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--testar-gemini", required=True)
    ap.add_argument("--saida", required=True)
    a = ap.parse_args(argv)
    destino = Path(a.saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    sintetizar_gemini(a.testar_gemini, destino)
    print(f"Amostra pronta: {destino} ({len(AudioSegment.from_file(destino)) / 1000:.1f}s)")


def main_listar_vozes(argv):
    import json
    idioma = argv[1] if len(argv) > 1 else "pt-BR"
    print(json.dumps(listar_vozes_gemini(idioma), ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--local":
        main_local(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == "--testar-gemini":
        main_testar_gemini(sys.argv[1:])
    elif len(sys.argv) > 1 and sys.argv[1] == "--listar-vozes-gemini":
        main_listar_vozes(sys.argv[1:])
    elif len(sys.argv) != 2:
        print("Uso: python narracao.py <job_id>   |   python narracao.py --local roteiro.json --voz clonada --saida pasta")
        sys.exit(1)
    else:
        main(sys.argv[1])
