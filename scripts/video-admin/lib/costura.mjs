// Costura da narração: o roteiro sai cena a cena (frases soltas). Esta etapa pede UMA segunda passada à IA só para
// reescrever as narrações como um discurso contínuo (conectores, retomadas), sem mexer em fatos nem na quantidade de cenas.
// Falha "fechada": se a resposta não passar na MESMA validação do roteiro, o roteiro original é mantido.
import { extrairJson, numerosPorExtenso, numerosParaTela, TOM } from './roteiro-regras.mjs';

export async function costurarNarracao({ r, chamarIA, validar, tom, textoArtigo = '', log = console.log, manterNumeros = false }) {
  if (process.env.ROTEIRO_COSTURA === '0') return r;
  const cenas = r.cenas || [];
  const n = cenas.length - 1; // a última cena (encerramento) tem texto fixo
  if (n < 4) return r;
  try {
    const antes = validar(r);
    const originais = cenas.slice(0, n).map(c => String(c.narracao || ''));
    const systemPrompt = [
      'Você é editor de roteiros de narração falada, em português do Brasil, para vídeos educativos de Direito do Trabalho.',
      'Você recebe a narração de um vídeo dividida em cenas e a reescreve para soar como UM discurso fluente, falado por uma pessoa, em que cada cena continua a anterior.',
      TOM[tom] || TOM.neutro,
      'Responda SOMENTE com um objeto JSON válido (sem markdown e sem texto antes ou depois).',
    ].join('\n');
    const userPrompt = `NARRAÇÃO ATUAL (${n} cenas, em ordem):
${JSON.stringify(originais, null, 1)}

${textoArtigo ? `ARTIGO-FONTE (única fonte de fatos permitida):\n${String(textoArtigo).slice(0, 7000)}\n\n` : ''}TAREFA: reescreva cada narração para que o conjunto flua como um único texto falado.
REGRAS:
- Devolva EXATAMENTE ${n} textos, na mesma ordem, um por cena, no JSON {"narracoes":["…", …]}.
- Mantenha os fatos, números e referências de cada cena. Não acrescente normas, valores ou prazos que não estejam no artigo e não mude o sentido.
- REPETIÇÃO: se duas ou mais cenas dizem a mesma ideia com palavras diferentes (comum no fim do vídeo, em várias cenas de "conclusão", e quando um critério aparece duas vezes), mantenha a ideia só na primeira vez e TROQUE as repetições por outro ponto do artigo-fonte que ainda não foi dito (condição, exemplo, exceção ou consequência), com o mesmo tamanho. A conclusão resume o essencial uma única vez.
- RITMO: alterne frases curtas (6 a 10 palavras) com frases mais longas; não deixe todas as cenas com a mesma estrutura.
- Cada cena (exceto a primeira) começa emendando a anterior, com conector natural da fala (Mas, Por isso, Nesse caso, Na prática, Ou seja, Além disso, Já, Com isso, Por outro lado…), variados. A primeira cena é o gancho e dá o contexto.
- Quando a cena seguinte abre um tópico novo, a cena atual termina anunciando-o de forma natural (ex.: "Vamos ver como isso funciona.").
- Evite repetir o assunto-título em toda cena: use "essa regra", "nesse caso", "o tribunal" etc.
- Tamanho: cada texto com quase o mesmo número de palavras do original (variação de no máximo 25%); o total não pode passar do original em mais de 10%.
- Terceira pessoa (nunca "você"). ${manterNumeros ? 'Escreva números, artigos, leis, temas, prazos e porcentagens em ALGARISMOS ("Tema 176", "art. 227", "LC 150/2015", "25 horas", "50%", "3,2%"): a voz lê por extenso sozinha. Sem "R$" solto e sem símbolos.' : 'Sem dígitos, "R$", "%" ou símbolos: tudo por extenso.'} Sem listas, sem aspas, sem emojis.
- Cada texto é uma frase (ou duas) COMPLETA: começa com maiúscula e termina com ponto, "?" ou "!". Nunca termine ou comece uma cena no meio de uma frase.
- A última cena da lista fecha o raciocínio e conduz ao convite final, sem repetir o convite (o convite é acrescentado depois).`;
    const resp = await chamarIA({ systemPrompt, userPrompt, logPrefix: 'roteiro-costura', rapido: true });
    const novas = extrairJson(resp.text)?.narracoes;
    if (!Array.isArray(novas) || novas.length !== n || novas.some(x => typeof x !== 'string' || x.trim().length < 8)) throw new Error(`resposta com ${Array.isArray(novas) ? novas.length : 'formato inválido de'} textos; esperava ${n}`);
    const copia = JSON.parse(JSON.stringify(r));
    copia.cenas.slice(0, n).forEach((c, i) => { c.narracao = (manterNumeros ? numerosParaTela(numerosPorExtenso(novas[i], { manterNumeros: true })) : numerosPorExtenso(novas[i])).trim(); });
    // cada cena precisa manter tamanho parecido (evita a IA fundir ideias ou inflar uma cena)
    const fora = copia.cenas.slice(0, n).findIndex((c, i) => { const a = originais[i].split(/\s+/).length, b = c.narracao.split(/\s+/).length; return b < a * 0.6 || b > a * 1.5; });
    if (fora >= 0) throw new Error(`a cena ${fora + 1} mudou demais de tamanho`);
    const depois = validar(copia);
    if (depois.erros.length) throw new Error(`reprovada na validação: ${depois.erros[0]}`);
    const alvo = depois.metas.palavras;
    if (Math.abs(depois.totalPalavras - alvo) > Math.abs(antes.totalPalavras - alvo) + 0.05 * alvo) throw new Error(`contagem de palavras piorou (${antes.totalPalavras} → ${depois.totalPalavras})`);
    log(`  costura da narração aplicada (${antes.totalPalavras} → ${depois.totalPalavras} palavras)`);
    return copia;
  } catch (e) {
    log(`  costura da narração ignorada (${e.message}); mantendo o roteiro original.`);
    return r;
  }
}
