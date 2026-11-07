"""QA da narração: transcreve o áudio de cada cena (Azure Speech-to-Text) e compara com o texto que deveria ter sido falado.

Por que existe: a voz sintética erra de forma imprevisível (lê "jornada" como "rornada", engole "a"/"de", corta o fim de uma frase)
e ninguém ouve todos os vídeos que o pipeline gera por dia. A cena que diverge além do limite é regenerada (até QA_TENTATIVAS vezes,
variando a velocidade); o que continuar divergente entra no relatório (qa-voz.json), e as trocas que se repetem viram candidatas a
entrar em pronuncias.json (dicionário de respelling que o narracao.py aplica a qualquer voz).

Env: TTS_QA=0 desliga | QA_LIMITE (padrão 0.22, fração ponderada de palavras erradas) | QA_TENTATIVAS (padrão 2) | QA_TOLERANCIA (0.90).
A transcrição também erra: por isso o limite é folgado, o QA nunca derruba o job (se o STT falhar, a narração segue sem a checagem)
e uma cena só é trocada quando a nova versão for melhor que a anterior.
"""
import difflib
import io
import os
import re
import time
import unicodedata

import requests
from pydub import AudioSegment
from pydub.silence import split_on_silence

QA_LIMITE = float(os.environ.get("QA_LIMITE") or 0.22)
QA_TENTATIVAS = int(os.environ.get("QA_TENTATIVAS") or 2)
QA_TOLERANCIA = float(os.environ.get("QA_TOLERANCIA") or 0.90)  # semelhança mínima para duas grafias contarem como a mesma palavra
QA_QUASE = float(os.environ.get("QA_QUASE") or 0.60)             # semelhança a partir da qual uma troca parece palavra mal pronunciada ("jornada" → "rornada")
QA_FUNCIONAIS = int(os.environ.get("QA_FUNCIONAIS") or 2)         # quantas palavras curtas ("a", "de", "e") engolidas reprovam a cena
DELTAS_VELOCIDADE = (-4, 3)  # variação (em %) aplicada em cada nova tentativa da cena

FUNCIONAIS = {
    "a", "o", "as", "os", "um", "uma", "uns", "umas", "e", "ou", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
    "ao", "aos", "pelo", "pela", "pelos", "pelas", "por", "para", "com", "sem", "que", "se", "ao", "à", "às", "como", "mas",
}


class QAIndisponivel(Exception):
    """O serviço de transcrição não respondeu (chave, rede, cota): o QA se desliga e a narração segue sem ele."""


def _sem_acento(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def tokens(texto: str):
    t = _sem_acento(str(texto or "").lower())
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return [w for w in t.split() if w]


def _parecidas(a: str, b: str) -> bool:
    return a == b or difflib.SequenceMatcher(None, a, b).ratio() >= QA_TOLERANCIA


def comparar(esperado: str, ouvido: str, ignorar=frozenset()) -> dict:
    """Compara o texto esperado com o transcrito. Devolve score (0 = igual), trocas, faltas e se o final parece cortado."""
    e, o = tokens(esperado), tokens(ouvido)
    if not o:
        return {"sem_transcricao": True}
    sm = difflib.SequenceMatcher(None, e, o, autojunk=False)
    trocas, faltas, quase, engolidas, erros = [], [], [], 0, 0.0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("equal", "insert"):
            continue  # palavra a mais no transcrito: ruído do STT, não do TTS
        exp, ou = e[i1:i2], o[j1:j2]
        for k, w in enumerate(exp):
            if w in ignorar:
                continue
            peso = 0.5 if w in FUNCIONAIS else 1.0
            ouvida = ou[k] if (tag == "replace" and k < len(ou)) else None
            if ouvida is None:
                faltas.append(w)
                erros += peso
                engolidas += 1 if w in FUNCIONAIS else 0
            elif not _parecidas(w, ouvida):
                trocas.append((w, ouvida))
                erros += peso
                # quase igual (mesma palavra com um som trocado) é a assinatura de má pronúncia; troca por palavra bem diferente tende a ser erro do STT
                if w not in FUNCIONAIS and len(w) >= 4 and difflib.SequenceMatcher(None, w, ouvida).ratio() >= QA_QUASE:
                    quase.append((w, ouvida))
    validas = [w for w in e if w not in ignorar]
    n = max(len(validas), 1)
    conteudo = [w for w in validas if w not in FUNCIONAIS]
    fim = conteudo[-2:]
    cauda = o[-6:]
    truncado = bool(fim) and len(o) >= 3 and not any(_parecidas(w, c) for w in fim for c in cauda)
    return {"score": round(erros / n, 3), "trocas": trocas, "faltas": faltas, "quase": quase, "engolidas": engolidas, "truncado": truncado, "palavras": n}


# ------------------------------------------------------------------ Azure STT (REST, áudio curto)
def _wav16k(seg: AudioSegment) -> bytes:
    buf = io.BytesIO()
    seg.set_frame_rate(16000).set_channels(1).set_sample_width(2).export(buf, format="wav")
    return buf.getvalue()


def _pedacos(seg: AudioSegment):
    """Divide a cena nas pausas (o STT de áudio curto reconhece uma fala por vez e aceita até 60 s)."""
    partes = split_on_silence(seg, min_silence_len=350, silence_thresh=-45, keep_silence=150)
    partes = [p for p in partes if len(p) > 120]
    saida = []
    for p in partes:
        while len(p) > 50000:  # raríssimo: trecho contínuo acima de 50 s
            saida.append(p[:50000]); p = p[50000:]
        saida.append(p)
    return saida or ([seg] if len(seg) > 120 else [])


def transcrever_azure(seg: AudioSegment, chave: str, regiao: str) -> str:
    url = f"https://{regiao}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"
    cab = {"Ocp-Apim-Subscription-Key": chave, "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000", "Accept": "application/json"}
    textos = []
    for parte in _pedacos(seg):
        ultimo = None
        for tentativa in (1, 2, 3):
            try:
                r = requests.post(url, params={"language": "pt-BR", "format": "detailed"}, headers=cab, data=_wav16k(parte), timeout=60)
            except requests.RequestException as ex:
                ultimo = ex; time.sleep(2 * tentativa); continue
            if r.status_code in (401, 403):
                raise QAIndisponivel(f"Azure STT recusou a chave (HTTP {r.status_code}); confira AZURE_SPEECH_KEY/REGION e se o recurso tem Speech-to-Text.")
            if r.status_code == 200:
                j = r.json()
                if j.get("RecognitionStatus") == "Success" and j.get("NBest"):
                    nb = j["NBest"][0]
                    textos.append(nb.get("Lexical") or nb.get("Display") or "")
                ultimo = None
                break
            ultimo = RuntimeError(f"HTTP {r.status_code}: {r.text[:120]}")
            time.sleep(2 * tentativa)
        if ultimo is not None:
            raise QAIndisponivel(f"Azure STT indisponível ({str(ultimo)[:140]})")
    return " ".join(t for t in textos if t).strip()


class QAVoz:
    def __init__(self, transcritor, ignorar=frozenset()):
        self.transcritor = transcritor
        self.ignorar = frozenset(ignorar)
        self.desativado = False
        self.relatorio = []
        self.observadas = []  # TODAS as trocas vistas, inclusive as de tentativas depois corrigidas: é o que a voz erra de verdade

    @classmethod
    def criar(cls, chave: str, regiao: str, ignorar=frozenset()):
        if (os.environ.get("TTS_QA") or "1") == "0" or not (chave and regiao):
            return None
        return cls(lambda seg: transcrever_azure(seg, chave, regiao), ignorar)

    def _avaliar(self, seg: AudioSegment, esperado: str) -> dict:
        try:
            ouvido = self.transcritor(seg)
        except QAIndisponivel as ex:
            print(f"  QA da voz desligado: {ex}")
            self.desativado = True
            return {"sem_transcricao": True}
        r = comparar(esperado, ouvido, self.ignorar)
        r["ouvido"] = ouvido
        self.observadas += [t for t in r.get("trocas", []) if len(t[0]) >= 4 and len(t[1]) >= 3]
        if not r.get("sem_transcricao"):
            r["reprovada"] = bool(r["truncado"] or r["score"] >= QA_LIMITE or r["quase"] or r["engolidas"] >= QA_FUNCIONAIS)
        return r

    @staticmethod
    def _pior(av: dict) -> float:
        """Quanto pior a versão: nota + peso fixo por final cortado, palavra mal lida e palavras curtas engolidas."""
        return av["score"] + (1.0 if av["truncado"] else 0) + 0.5 * len(av["quase"]) + 0.2 * av["engolidas"]

    def garantir(self, i: int, esperado: str, seg: AudioSegment, regerar) -> AudioSegment:
        """Avalia a fala da cena i; se reprovar, regenera (até QA_TENTATIVAS) e fica com a melhor versão. `regerar(delta_pct)` devolve um AudioSegment ou None."""
        if self.desativado or not esperado.strip() or len(seg) == 0:
            return seg
        melhor, av = seg, self._avaliar(seg, esperado)
        if av.get("sem_transcricao"):
            self.relatorio.append({"cena": i + 1, "esperado": esperado, "sem_transcricao": True})
            return seg
        tentativas = 1
        while av["reprovada"] and tentativas <= QA_TENTATIVAS and not self.desativado:
            delta = DELTAS_VELOCIDADE[min(tentativas - 1, len(DELTAS_VELOCIDADE) - 1)]
            print(f"  QA voz cena {i + 1}: score {av['score']:.2f}{' (final cortado)' if av['truncado'] else ''}{' palavra mal lida: ' + ', '.join(f'{a}→{b}' for a, b in av['quase'][:3]) if av['quase'] else ''}{' (' + str(av['engolidas']) + ' palavras curtas engolidas)' if av['engolidas'] >= QA_FUNCIONAIS else ''}; refazendo ({delta:+d}% de velocidade)...")
            novo = regerar(delta)
            tentativas += 1
            if novo is None or len(novo) == 0:
                break
            av2 = self._avaliar(novo, esperado)
            if av2.get("sem_transcricao"):
                break
            if self._pior(av) > self._pior(av2):
                melhor, av = novo, av2
        self.relatorio.append({
            "cena": i + 1, "esperado": esperado, "ouvido": av.get("ouvido", ""), "score": av.get("score"),
            "trocas": [list(t) for t in av.get("trocas", [])], "quase": [list(t) for t in av.get("quase", [])], "faltas": av.get("faltas", []), "engolidas": av.get("engolidas", 0), "truncado": av.get("truncado", False),
            "tentativas": tentativas, "reprovada_final": bool(av.get("reprovada")),
        })
        return melhor

    def resumo(self) -> dict:
        """Totais e as trocas que mais aparecem (candidatas a pronuncias.json)."""
        contagem = {}
        for esp, ouv in self.observadas:
            contagem[(esp, ouv)] = contagem.get((esp, ouv), 0) + 1
        top = sorted(contagem.items(), key=lambda kv: -kv[1])[:15]
        avaliadas = [c for c in self.relatorio if not c.get("sem_transcricao")]
        return {
            "cenas_avaliadas": len(avaliadas),
            "cenas_refeitas": sum(1 for c in avaliadas if c["tentativas"] > 1),
            "cenas_reprovadas_final": sum(1 for c in avaliadas if c["reprovada_final"]),
            "trocas_top": [{"esperado": e, "ouvido": o, "vezes": n} for (e, o), n in top],
            "qa_desligado": self.desativado,
        }
