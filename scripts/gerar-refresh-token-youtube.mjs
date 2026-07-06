// RODAR UMA ÚNICA VEZ, NO SEU NOTEBOOK (não no GitHub Actions).
// Gera o refresh_token que vai para o secret YOUTUBE_REFRESH_TOKEN.
//
// Antes de rodar:
// 1. No Google Cloud Console, crie um projeto, ative a "YouTube Data API v3".
// 2. Crie uma credencial OAuth2 do tipo "App para computador (Desktop app)".
// 3. Copie o Client ID e o Client Secret e exporte como variáveis de ambiente:
//      export YOUTUBE_CLIENT_ID=xxxx
//      export YOUTUBE_CLIENT_SECRET=xxxx
// 4. Rode: node scripts/gerar-refresh-token-youtube.mjs
// 5. Abra o link que aparecer, faça login com a conta DONA do canal Calcula Prazo,
//    autorize, e cole o código que a Google mostrar de volta no terminal.

import { google } from 'googleapis';
import readline from 'node:readline';

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
});

console.log('\nAbra este link, autorize com a conta do canal Calcula Prazo, e cole o código aqui:\n');
console.log(url + '\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Código: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code.trim());
  console.log('\nGuarde este valor como secret YOUTUBE_REFRESH_TOKEN no GitHub:\n');
  console.log(tokens.refresh_token);
  rl.close();
});
