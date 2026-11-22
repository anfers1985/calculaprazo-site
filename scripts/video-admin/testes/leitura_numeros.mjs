// Confere lib/leitor-numeros.mjs com os mesmos casos do leitor_numeros.py (testes/leitura_numeros.json).
// Uso: node scripts/video-admin/testes/leitura_numeros.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerNumeros } from '../lib/leitor-numeros.mjs';
const aqui = path.dirname(fileURLToPath(import.meta.url));
const casos = JSON.parse(fs.readFileSync(path.join(aqui, 'leitura_numeros.json'), 'utf-8'));
let falhas = 0;
for (const c of casos) {
  const obtido = lerNumeros(c.entrada);
  if (obtido !== c.saida) { falhas++; console.log(`FALHOU: ${JSON.stringify(c.entrada)}\n   esperado: ${JSON.stringify(c.saida)}\n   obtido:   ${JSON.stringify(obtido)}`); }
}
console.log(falhas ? `${falhas} falha(s)` : 'OK');
process.exit(falhas ? 1 : 0);
