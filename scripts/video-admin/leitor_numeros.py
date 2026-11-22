#!/usr/bin/env python3
"""
Leitor de números da narração (pt-BR): transforma dígitos e símbolos em texto falado do jeito que se lê no Brasil.

Cobre (todas as vozes, vale para qualquer vídeo):
  ordinais       13º → décimo terceiro · 1ª → primeira · art. 7º → sétimo · art. 10º → dez (a partir do 10 o artigo é cardinal)
  frações        1/12 → um doze avos · 2/3 → dois terços · 1/2 → um meio ("metade de/do" quando segue "de/do/da")
  escalas        5x2 → cinco por dois · 12x36 → doze por trinta e seis · 3x → três vezes
  horas          8h24 → oito horas e vinte e quatro minutos · 1h → uma hora · 22h → vinte e duas horas
  concordância   1 hora → uma hora · 42 horas → quarenta e duas horas · 200 horas → duzentas horas · 2 mil parcelas → duas mil parcelas
  dinheiro       R$ 1.412,00 → mil quatrocentos e doze reais · R$ 1,00 → um real · R$ 2,5 milhões → dois vírgula cinco milhões de reais
  decimais       0,05 → zero vírgula zero cinco · 3,2% → três vírgula dois por cento
  leis           Lei 8.213/91 → Lei oito mil duzentos e treze de mil novecentos e noventa e um
  incisos        inciso XIII → inciso treze

A mesma lógica existe em lib/leitor-numeros.mjs (roteiro dos vídeos em slides). Os dois são conferidos com os mesmos casos
em testes/leitura_numeros.json (python3 testes/leitura_numeros.py  |  node testes/leitura_numeros.mjs).
"""
import re

try:
    from num2words import num2words as _n2w
except ImportError:  # sem a biblioteca, os números ficam como dígitos (a voz lê sozinha)
    _n2w = None

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

_UN_M = ["", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono"]
_UN_F = ["", "primeira", "segunda", "terceira", "quarta", "quinta", "sexta", "sétima", "oitava", "nona"]
_DEZ_M = ["", "décimo", "vigésimo", "trigésimo", "quadragésimo", "quinquagésimo", "sexagésimo", "septuagésimo", "octogésimo", "nonagésimo"]
_CEN_M = ["", "centésimo", "ducentésimo", "trecentésimo", "quadringentésimo", "quingentésimo", "sexcentésimo", "septingentésimo", "octingentésimo", "nongentésimo"]


def ordinal(n: int, fem: bool = False) -> str:
    """Ordinal por extenso de 1 a 999 (13 → décimo terceiro). Acima disso devolve o cardinal."""
    if not 1 <= n <= 999:
        return cardinal(n)
    c, resto = divmod(n, 100)
    d, u = divmod(resto, 10)
    fm = (lambda x: x[:-1] + "a" if x else x) if fem else (lambda x: x)  # "décimo" → "décima", "centésimo" → "centésima"
    partes = [fm(_CEN_M[c]), fm(_DEZ_M[d]), (_UN_F if fem else _UN_M)[u]]
    return " ".join(p for p in partes if p)


def _feminino_palavra(p: str) -> str:
    if p == "um":
        return "uma"
    if p == "dois":
        return "duas"
    if p.endswith("entos"):  # duzentos, trezentos, quatrocentos, quinhentos, seiscentos, setecentos, oitocentos, novecentos
        return p[:-2] + "as"
    return p


def cardinal(n: int, fem: bool = False) -> str:
    if _n2w is None:
        return str(n)
    texto = _n2w(int(n), lang="pt_BR").replace(",", "")
    if fem and n < 1_000_000:
        texto = " ".join(_feminino_palavra(p) for p in texto.split())
    return texto


def _int(s: str) -> int:
    return int(s.replace(".", ""))


def decimais(parte: str) -> str:
    """Parte depois da vírgula: zeros à esquerda são ditos (05 → zero cinco)."""
    zeros = len(parte) - len(parte.lstrip("0"))
    resto = parte.lstrip("0")
    return " ".join(["zero"] * zeros + ([cardinal(int(resto))] if resto else []))


# ---------------------------------------------------------------- substantivos femininos (o número vem ANTES deles)
_FEM = (
    "hora horas semana semanas parcela parcelas vez vezes falta faltas diária diárias folga folgas multa multas faixa faixas instância instâncias "
    "turma turmas vara varas audiência audiências prestação prestações cota cotas quinzena quinzenas jornada jornadas causa causas pessoa pessoas "
    "empresa empresas trabalhadora trabalhadoras empregada empregadas doméstica domésticas mulher mulheres gestante gestantes cláusula cláusulas "
    "decisão decisões ação ações súmula súmulas tese teses lei leis norma normas hipótese hipóteses situação situações etapa etapas fase fases regra regras "
    "condição condições verba verbas quantia quantias vaga vagas reunião reuniões convenção convenções madrugada madrugadas noite noites tarde tardes "
    "manhã manhãs semana-base remuneração remunerações contribuição contribuições competência competências infração infrações penalidade penalidades "
    "demissão demissões contratação contratações compensação compensações hora-extra horas-extras"
).split()
_RE_FEM = re.compile(r"^(?:" + "|".join(re.escape(x) for x in _FEM) + r")\b", re.I)

_RE_NUM = r"\d{1,3}(?:\.\d{3})+|\d+"
_ROMANOS = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def _romano(s: str):
    s = s.upper()
    if not s or any(c not in _ROMANOS for c in s):
        return None
    total = 0
    for i, c in enumerate(s):
        v = _ROMANOS[c]
        total += -v if i + 1 < len(s) and _ROMANOS[s[i + 1]] > v else v
    return total if 0 < total <= 200 else None


_TERMO_PL = {3: "terço", 4: "quarto", 5: "quinto", 6: "sexto", 7: "sétimo", 8: "oitavo", 9: "nono", 10: "décimo"}


def _fracao(m, texto):
    n, d = _int(m.group(1)), _int(m.group(2))
    if d == 0:
        return m.group(0)
    if n < d:  # fração
        if d == 2:
            resto = texto[m.end():]
            if n == 1 and re.match(r"\s+(?:de|do|da|dos|das)\b", resto, re.I):
                return "metade"
            if n == 1 and re.match(r"\s+hora\b", resto, re.I):
                return "meia"
            return f"{cardinal(n)} meio" + ("s" if n > 1 else "")
        if d in _TERMO_PL:
            t = _TERMO_PL[d]
            return f"{cardinal(n)} {t}" + ("s" if n > 1 else "")
        return f"{cardinal(n)} {cardinal(d)} avos"
    if d <= 12 and n <= 31:  # data sem ano: 20/12 → 20 de dezembro
        return ("primeiro" if n == 1 else str(n)) + f" de {MESES[d - 1]}"
    return f"{n} {d}"  # sem leitura segura: como antes, só separa


def converter_numeros(t: str) -> str:
    """Recebe o texto (já com as abreviações expandidas) e devolve tudo por extenso."""
    if _n2w is None:
        return t
    # Lei/decreto/etc. com ano de 2 dígitos: "Lei 8.213/91" → "Lei 8.213 de 1991" (o ano completo é lido adiante)
    def _lei(m):
        ano = m.group(3)
        if len(ano) == 2:
            ano = ("19" if int(ano) >= 40 else "20") + ano
        return f"{m.group(1)} {m.group(2)} de {ano}"
    t = re.sub(r"(?i)\b(lei(?:\s+complementar)?|lc|decreto(?:-lei)?|portaria|mp|medida provisória|resolução|instrução normativa|emenda constitucional|ec)\s+(?:n[ºo°]\.?\s*)?(\d[\d.]*)/(\d{2}|\d{4})\b", _lei, t)
    # Datas completas: 1/5/2026 → primeiro de maio de 2026
    t = re.sub(r"(?<![\d/])(\d{1,2})/(\d{1,2})/(\d{4})(?!\d)", lambda m: (f"{'primeiro' if int(m.group(1)) == 1 else int(m.group(1))} de {MESES[int(m.group(2)) - 1]} de {m.group(3)}" if 1 <= int(m.group(2)) <= 12 else m.group(0)), t)
    # Escalas: 5x2, 12x36, 6 x 1 → "cinco por dois"
    t = re.sub(r"(?<![\w.,])(\d{1,3})\s*[xX×]\s*(\d{1,3})(?![\w])", lambda m: f"{m.group(1)} por {m.group(2)}", t)
    # 3x / 2x (vezes)
    t = re.sub(r"(?<![\w.,])(\d{1,3})\s*[xX×](?=[\s.,;:!?)]|$)", lambda m: f"{m.group(1)} vezes", t)
    # Horas: 8h24, 8h, 22h30min, 30min
    def _hora(m):
        h, mi = int(m.group(1)), m.group(2)
        s = f"{h} " + ("hora" if h == 1 else "horas")
        if mi and int(mi):
            s += f" e {int(mi)} " + ("minuto" if int(mi) == 1 else "minutos")
        return s
    t = re.sub(r"(?<![\w.,])(\d{1,2})h(\d{2})?(?:min)?(?![\w])", _hora, t)
    t = re.sub(r"(?<![\w.,])(\d{1,3})\s?min(?![\wá-ú])", lambda m: f"{m.group(1)} " + ("minuto" if int(m.group(1)) == 1 else "minutos"), t)
    # Frações e datas sem ano (1/12, 2/3, 20/12)
    t = re.sub(r"(?<![\d/.,])(\d{1,3})/(\d{1,3})(?![\d/])", lambda m: _fracao(m, t), t)
    # Dinheiro
    t = re.sub(r"R\$\s*(\d+(?:\.\d{3})*(?:,\d+)?)\s+(mil|milh[ãõ]o|milh[õo]es|bilh[ãõ]o|bilh[õo]es)\b",
               lambda m: f"{m.group(1)} {m.group(2).lower()}" + ("" if m.group(2).lower() == "mil" else " de") + " reais", t)
    def _reais(m):
        inteiro, cent = _int(m.group(1)), m.group(2)
        s = f"{inteiro} " + ("real" if inteiro == 1 else "reais")
        if cent and int(cent):
            c = int(cent.ljust(2, "0")[:2])
            s += f" e {c} " + ("centavo" if c == 1 else "centavos")
        return s
    t = re.sub(r"R\$\s*(\d+(?:\.\d{3})*)(?:,(\d{1,2}))?(?!\d)", _reais, t)
    # Porcentagem e decimais
    t = re.sub(r"(\d+),(\d+)\s*%", lambda m: f"{cardinal(int(m.group(1)))} vírgula {decimais(m.group(2))} por cento", t)
    t = re.sub(r"(\d+)\s*%", lambda m: f"{m.group(1)} por cento", t)
    t = re.sub(r"(?<![\d.,])(\d+),(\d+)(?!\d)", lambda m: f"{cardinal(int(m.group(1)))} vírgula {decimais(m.group(2))}", t)
    # Ordinais: 13º → décimo terceiro; em artigo/parágrafo só até 9º (depois é cardinal: "artigo dez")
    def _ord(m):
        n, fem = int(m.group(1)), m.group(2) == "ª"
        antes = t[max(0, m.start() - 24):m.start()].lower()
        legal = re.search(r"(?:artigos?|art\.?|par[áa]grafos?|§|incisos?|al[ií]neas?)\s*$", antes)
        if legal and n >= 10:
            return str(n)
        return ordinal(n, fem)
    t = re.sub(r"(?<![\d.,])(\d{1,3})\.?\s*([ºª°])", _ord, t)
    # Incisos em romano: inciso XIII → inciso treze
    t = re.sub(r"(?i)\b(incisos?)\s+([IVXLC]{1,6})\b", lambda m: f"{m.group(1)} {_romano(m.group(2))}" if _romano(m.group(2)) else m.group(0), t)
    # Cardinais restantes, com concordância (1 hora → uma hora; 42 horas → quarenta e duas horas)
    def _card(m):
        n = _int(m.group(0))
        resto = t[m.end():]
        mm = re.match(r"\s+(?:(?:mil|milh[ãõ]o|milh[õo]es)\s+)?(\S+)", resto)
        fem = bool(mm and _RE_FEM.match(mm.group(1).strip(".,;:!?)")) and n < 1_000_000)
        return cardinal(n, fem)
    t = re.sub(_RE_NUM, _card, t)
    return re.sub(r"\s+", " ", t).strip()
