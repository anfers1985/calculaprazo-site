# -*- coding: utf-8 -*-
# gerar_posts.py — Orquestrador do agente único CalculaPrazo
#
# Execute a partir da raiz do projeto:
#   python scripts/gerar_posts.py
#
import sys, os, importlib

AGENTES_DIR = os.path.join(os.path.dirname(__file__), "agentes")
sys.path.insert(0, AGENTES_DIR)

def main():
    print("=" * 70)
    print("CalculaPrazo — Geração de Conteúdo Automática")
    print("=" * 70)

    gemini_key     = os.environ.get("GEMINI_API_KEY", "")
    glm_key        = os.environ.get("GLM_API_KEY", "")
    grok_key       = os.environ.get("GROK_API_KEY", "")
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
    unsplash_key   = os.environ.get("UNSPLASH_ACCESS_KEY", "")

    if not any([gemini_key, glm_key, grok_key, openrouter_key]):
        print("\nERRO CRÍTICO: nenhuma API de LLM configurada.")
        print("  Configure ao menos uma: GEMINI_API_KEY, GLM_API_KEY, GROK_API_KEY ou OPENROUTER_API_KEY")
        sys.exit(1)

    if gemini_key:
        print(f"OK GEMINI_API_KEY ({len(gemini_key)} chars) [1º — 3 modelos com quotas independentes]")
    if glm_key:
        print(f"OK GLM_API_KEY ({len(glm_key)} chars) [2º — glm-4-flash-250414]")
    if grok_key:
        print(f"OK GROK_API_KEY ({len(grok_key)} chars) [3º — grok-3-mini]")
    if openrouter_key:
        print(f"OK OPENROUTER_API_KEY ({len(openrouter_key)} chars) [4º — 6 modelos :free]")
    if unsplash_key:
        print(f"OK UNSPLASH_ACCESS_KEY ({len(unsplash_key)} chars)")
    else:
        print("AVISO: UNSPLASH_ACCESS_KEY ausente — imagem fallback será usada.")

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
