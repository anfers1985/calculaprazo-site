"""Gera amostras da voz Francisca com variações de pronúncia de UMA palavra, para você OUVIR e escolher (não gera vídeo).
Uso (workflow 'Testar pronúncia'): TEXTO="Para jornadas superiores a seis horas." PALAVRA=jornadas python3 testar_pronuncia.py
Saída: pasta amostras/ com um mp3 por variação. A que soar certa vira entrada em pronuncias.json."""
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import narracao as n  # noqa: E402

TEXTO = os.environ.get("TEXTO") or "Para jornadas superiores a seis horas, a lei prevê intervalo mínimo de uma hora."
PALAVRA = (os.environ.get("PALAVRA") or "jornadas").strip()
VOZ = os.environ.get("VOZ") or "pt-BR-FranciscaNeural"
saida = Path("amostras"); saida.mkdir(exist_ok=True)
ipa_base = (os.environ.get("IPA") or "ʒoɾˈnadɐs").strip()
variantes = [
    ("1-original", None, None),
    ("2-ipa-r-fraco", ipa_base, None),
    ("3-ipa-r-forte", ipa_base.replace("ɾ", "ʁ"), None),
    ("4-ipa-r-velar", ipa_base.replace("ɾ", "x"), None),
    ("5-grafia-com-hifen", None, "-".join([PALAVRA[:3], PALAVRA[3:]]) if len(PALAVRA) > 4 else PALAVRA),
    ("6-grafia-acentuada", None, PALAVRA.replace("o", "ô", 1)),
]
for nome, ipa, grafia in variantes:
    n.FONEMAS_AZURE = {PALAVRA: ipa} if ipa else {}
    texto = re.sub(rf"\b{re.escape(PALAVRA)}\b", grafia, TEXTO, flags=re.I) if grafia else TEXTO
    n.sintetizar_azure(texto, "+0%", saida / f"{nome}.mp3", VOZ)
    print(f"{nome}: {texto}")
print(f"Pronto: {len(variantes)} amostras em {saida}/")
