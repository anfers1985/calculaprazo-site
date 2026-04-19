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
    qwen_key       = os.environ.get("QWEN_API_KEY", "")
    grok_key       = os.environ.get("GROK_API_KEY", "")
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
    unsplash_key   = os.environ.get("UNSPLASH_ACCESS_KEY", "")

    # Ao menos uma API de LLM precisa estar configurada
    if not any([gemini_key, glm_key, qwen_key, grok_key, openrouter_key]):
        print("\nERRO CRÍTICO: nenhuma API de LLM configurada.")
        print("  Configure ao menos uma das seguintes secrets no GitHub:")
        print("  - GEMINI_API_KEY      (Google AI Studio — primário, 1.500 req/dia)")
        print("  - GLM_API_KEY         (Zhipu AI — secundário, 6M tokens/dia)")
        print("  - QWEN_API_KEY        (Alibaba Qwen — terciário, gratuito)")
        print("  - GROK_API_KEY        (xAI Grok — quaternário)")
        print("  - OPENROUTER_API_KEY  (OpenRouter :free — fallback)")
        sys.exit(1)

    if gemini_key:
        print(f"OK GEMINI_API_KEY configurada ({len(gemini_key)} chars) [PRIMÁRIO]")
    if glm_key:
        print(f"OK GLM_API_KEY configurada ({len(glm_key)} chars) [SECUNDÁRIO]")
    if qwen_key:
        print(f"OK QWEN_API_KEY configurada ({len(qwen_key)} chars) [TERCIÁRIO]")
    if grok_key:
        print(f"OK GROK_API_KEY configurada ({len(grok_key)} chars) [QUATERNÁRIO]")
    if openrouter_key:
        print(f"OK OPENROUTER_API_KEY configurada ({len(openrouter_key)} chars) [FALLBACK]")
    if unsplash_key:
        print(f"OK UNSPLASH_ACCESS_KEY configurada ({len(unsplash_key)} chars)")
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
