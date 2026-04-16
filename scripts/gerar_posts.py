# -*- coding: utf-8 -*-
# gerar_posts.py - Orquestrador dos agentes do CalculaPrazo
#
# Execute a partir da raiz do projeto:
#   python scripts/gerar_posts.py
#
# Variaveis de ambiente necessarias:
#   OPENROUTER_API_KEY   -> sua chave OpenRouter
#   UNSPLASH_ACCESS_KEY  -> sua chave Unsplash
#
import sys, os, time, importlib

AGENTES_DIR = os.path.join(os.path.dirname(__file__), "agentes")
sys.path.insert(0, AGENTES_DIR)

AGENTES = [
    "agente_tst_stf",
    "agente_trts",
    "agente_mte",
    "agente_mpt",
    "agente_noticias_gerais",
]

def main():
    print("=" * 70)
    print("CalculaPrazo -- Geracao de Conteudo Automatica")
    print("=" * 70)

    if not os.environ.get("OPENROUTER_API_KEY"):
        print("\nERRO: OPENROUTER_API_KEY nao configurada.")
        print("  export OPENROUTER_API_KEY='sk-or-v1-...'")
        sys.exit(1)

    if not os.environ.get("UNSPLASH_ACCESS_KEY"):
        print("\nAVISO: UNSPLASH_ACCESS_KEY nao configurada -- imagem fallback sera usada.")

    resultados = {}
    for nome in AGENTES:
        print("\n" + "=" * 70)
        try:
            mod = importlib.import_module(nome)
            mod.main()
            resultados[nome] = "OK"
        except Exception as e:
            print("  ERRO no agente " + nome + ": " + str(e))
            resultados[nome] = "ERRO: " + str(e)
        time.sleep(10)

    print("\n" + "=" * 70)
    print("RESUMO:")
    for nome, status in resultados.items():
        print("  " + nome + ": " + status)

if __name__ == "__main__":
    main()
