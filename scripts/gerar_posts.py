# -*- coding: utf-8 -*-
# gerar_posts.py — Orquestrador do agente único CalculaPrazo v2
#
# Execute a partir da raiz do projeto:
#   python scripts/gerar_posts.py
#
import sys, os, importlib

AGENTES_DIR = os.path.join(os.path.dirname(__file__), "agentes")
sys.path.insert(0, AGENTES_DIR)

def main():
    print("=" * 70)
    print("CalculaPrazo — Geração de Conteúdo Automática v2")
    print("=" * 70)

    gemini_key     = os.environ.get("GEMINI_API_KEY", "")
    grok_key       = os.environ.get("GROK_API_KEY", "")
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
    unsplash_key   = os.environ.get("UNSPLASH_ACCESS_KEY", "")

    # Ao menos uma API de LLM precisa estar configurada
    if not gemini_key and not grok_key and not openrouter_key:
        print("\nERRO CRÍTICO: nenhuma API de LLM configurada.")
        print("  Configure ao menos uma das seguintes secrets no GitHub:")
        print("  - GEMINI_API_KEY     (Google AI Studio — recomendado, gratuito)")
        print("  - GROK_API_KEY       (xAI Grok — gratuito)")
        print("  - OPENROUTER_API_KEY (OpenRouter modelos :free)")
        sys.exit(1)

    if gemini_key:
        print("OK GEMINI_API_KEY configurada (" + str(len(gemini_key)) + " chars) [PRIMÁRIO]")
    else:
        print("-- GEMINI_API_KEY não configurada (primário ausente)")

    if grok_key:
        print("OK GROK_API_KEY configurada (" + str(len(grok_key)) + " chars) [SECUNDÁRIO]")
    else:
        print("-- GROK_API_KEY não configurada")

    if openrouter_key:
        print("OK OPENROUTER_API_KEY configurada (" + str(len(openrouter_key)) + " chars) [TERCIÁRIO]")
    else:
        print("-- OPENROUTER_API_KEY não configurada")

    if unsplash_key:
        print("OK UNSPLASH_ACCESS_KEY configurada (" + str(len(unsplash_key)) + " chars)")
    else:
        print("AVISO: UNSPLASH_ACCESS_KEY não configurada — imagem fallback será usada.")

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
