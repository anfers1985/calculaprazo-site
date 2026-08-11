// ════════════════════════════════════════════════════════════════════════
// BUMP DE VERSÃO DOS ASSETS JS (app.min.js / blog.min.js)
// ════════════════════════════════════════════════════════════════════════
// Agora que app.min.js e blog.min.js têm cache de 1 ano (immutable) no
// _headers, a ÚNICA forma de forçar o navegador/CDN a buscar uma versão
// nova depois de você editar o arquivo é mudando a URL — e a URL muda
// através do "?v=N" que já existe em todas as tags <script>.
//
// Esse script troca o "?v=N" antigo pelo novo em TODAS as referências do
// site de uma vez (index.html, os 15 calculadoras, os 364 posts do blog,
// admin/index.html etc.) — pra evitar o que encontramos hoje: 15 páginas
// esquecidas numa versão antiga (?v=4) enquanto o resto do site já estava
// em ?v=10.
//
// COMO USAR (depois de editar e re-minificar app.js ou blog.js):
//   node scripts/11-bump-asset-version.mjs app 7
//   node scripts/11-bump-asset-version.mjs blog 11
//
// (o primeiro argumento é "app" ou "blog", o segundo é o novo número de versão)
// ════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

const asset = process.argv[2];
const newVersion = process.argv[3];

if (!['app', 'blog'].includes(asset) || !newVersion || !/^\d+$/.test(newVersion)) {
  console.error('Uso: node scripts/11-bump-asset-version.mjs <app|blog> <novo-numero-de-versao>');
  console.error('Exemplo: node scripts/11-bump-asset-version.mjs blog 11');
  process.exit(1);
}

const filename = `${asset}.min.js`;
const pattern = new RegExp(`${filename.replace('.', '\\.')}\\?v=\\d+`, 'g');
const replacement = `${filename}?v=${newVersion}`;

// Varre todo o repositório por arquivos .html (exceto node_modules e afins)
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

const files = walk(ROOT);
let changedFiles = 0;
let totalReplacements = 0;
const versionsFound = new Set();

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const matches = content.match(pattern);
  if (!matches) continue;
  matches.forEach(m => versionsFound.add(m));
  const updated = content.replace(pattern, replacement);
  if (updated !== content) {
    fs.writeFileSync(file, updated, 'utf-8');
    changedFiles++;
    totalReplacements += matches.length;
  }
}

console.log(`Versões antigas encontradas: ${[...versionsFound].join(', ') || '(nenhuma)'}`);
console.log(`Arquivos atualizados: ${changedFiles}`);
console.log(`Total de referências trocadas: ${totalReplacements}`);
console.log(`Agora todo mundo aponta pra ${replacement}`);
