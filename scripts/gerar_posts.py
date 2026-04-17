# -*- coding: utf-8 -*-
# gerar_posts.py — Orquestrador do agente único CalculaPrazo
#
# Execute a partir da raiz do projeto:
#   python scripts/gerar_posts.py
#
import sys, os, time, importlib

AGENTES_DIR = os.path.join(os.path.dirname(__file__), "agentes")
sys.path.insert(0, AGENTES_DIR)

def main():
    print("=" * 70)
    print("CalculaPrazo — Geração de Conteúdo Automática")
    print("=" * 70)

    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
    unsplash_key   = os.environ.get("UNSPLASH_ACCESS_KEY", "")

    if not openrouter_key:
        print("\nERRO CRÍTICO: OPENROUTER_API_KEY não configurada.")
        print("  Verifique: GitHub repo → Settings → Secrets and variables → Actions")
        print("  Nome exato: OPENROUTER_API_KEY")
        sys.exit(1)

    print(f"OK OPENROUTER_API_KEY configurada ({len(openrouter_key)} chars)")

    if not unsplash_key:
        print("AVISO: UNSPLASH_ACCESS_KEY não configurada — imagem fallback será usada.")
    else:
        print(f"OK UNSPLASH_ACCESS_KEY configurada ({len(unsplash_key)} chars)")

    print("\n" + "=" * 70)
    try:
        mod = importlib.import_module("agente_unico")
        mod.main()
    except Exception as e:
        import traceback
        print("ERRO no agente_unico: " + str(e))
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
