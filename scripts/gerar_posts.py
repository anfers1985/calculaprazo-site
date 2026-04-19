# -*- coding: utf-8 -*-
# gerar_posts.py — Orquestrador do agente único CalculaPrazo
#
import sys, os, importlib

AGENTES_DIR = os.path.join(os.path.dirname(__file__), "agentes")
sys.path.insert(0, AGENTES_DIR)

def main():
    print("=" * 70)
    print("CalculaPrazo — Geração de Conteúdo Automática")
    print("=" * 70)

    keys = {
        "GEMINI_API_KEY":     ("Gemini",     "1º — 3 modelos, 4.500 req/dia"),
        "GROQ_API_KEY":       ("Groq",       "2º — llama-3.3-70b, 1.000 req/dia"),
        "GLM_API_KEY":        ("GLM",        "3º — glm-4-flash-250414"),
        "QWEN_API_KEY":       ("Qwen",       "4º — qwen-turbo"),
        "GROK_API_KEY":       ("Grok",       "5º — grok-3-mini"),
        "OPENROUTER_API_KEY": ("OpenRouter", "6º — 6 modelos :free"),
    }

    alguma = False
    for env, (nome, desc) in keys.items():
        val = os.environ.get(env, "")
        if val:
            print(f"OK {env} ({len(val)} chars) [{desc}]")
            alguma = True
        else:
            print(f"-- {env} não configurada")

    unsplash = os.environ.get("UNSPLASH_ACCESS_KEY", "")
    if unsplash:
        print(f"OK UNSPLASH_ACCESS_KEY ({len(unsplash)} chars)")
    else:
        print("AVISO: UNSPLASH_ACCESS_KEY ausente — imagem fallback será usada.")

    if not alguma:
        print("\nERRO CRÍTICO: nenhuma API de LLM configurada.")
        print("  Ação imediata: cadastre o Groq em console.groq.com (gratuito, sem cartão)")
        sys.exit(1)

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
