# -*- coding: utf-8 -*-
"""
gerar_posts.py — Orquestrador dos agentes do CalculaPrazo.
Execute a partir da raiz do projeto:
  python scripts/gerar_posts.py

Variaveis de ambiente necessarias:
  ANTHROPIC_API_KEY
  PEXELS_API_KEY
"""
import sys, os, time, importlib

# Garante que agente_base seja encontrado
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
    print("CalculaPrazo — Geracao de Conteudo Automatica")
    print("=" * 70)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("\nERRO: ANTHROPIC_API_KEY nao configurada.")
        print("  export ANTHROPIC_API_KEY='sk-ant-...'")
        sys.exit(1)

    if not os.environ.get("PEXELS_API_KEY"):
        print("\nAVISO: PEXELS_API_KEY nao configurada — imagens padrao serao usadas.")

    resultados = {}
    for nome in AGENTES:
        print(f"\n{'='*70}")
        try:
            mod = importlib.import_module(nome)
            mod.main()
            resultados[nome] = "OK"
        except Exception as e:
            print(f"  ERRO no agente {nome}: {e}")
            resultados[nome] = f"ERRO: {e}"
        time.sleep(10)  # Pausa entre agentes

    print(f"\n{'='*70}")
    print("RESUMO:")
    for nome, status in resultados.items():
        print(f"  {nome}: {status}")

if __name__ == "__main__":
    main()
