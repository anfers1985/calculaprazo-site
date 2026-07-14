// RODAR UMA ÚNICA VEZ, NO SEU NOTEBOOK (não no GitHub Actions).
// Gera o refresh_token que vai para o secret YOUTUBE_REFRESH_TOKEN.
//
// Antes de rodar:
// 1. No Google Cloud Console, crie um projeto, ative a "YouTube Data API v3".
// 2. Crie uma credencial OAuth2 do tipo "App para computador (Desktop app)".
// 3. Copie o Client ID e o Client Secret e exporte como variáveis de ambiente:
//      set YOUTUBE_CLIENT_ID=xxxx        (Windows cmd)
//      set YOUTUBE_CLIENT_SECRET=xxxx
// 4. Rode: node scripts/gerar-refresh-token-youtube.mjs
// 5. Abra o link que aparecer, faça login com a conta DONA do canal Calcula Prazo,
//    autorize. O navegador volta sozinho pra esse script (não precisa copiar nada).

import { google } from 'googleapis';
import http from 'node:http';

const PORTA = 8080;
const REDIRECT_URI = `http://127.0.0.1:${PORTA}`;

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  REDIRECT_URI
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent select_account', // força escolher a conta e gerar refresh_token novo
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
});

console.log('\nAbra este link, autorize com a conta do canal Calcula Prazo:\n');
console.log(url + '\n');
console.log(`Aguardando você autorizar no navegador (escutando em ${REDIRECT_URI})...\n`);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, REDIRECT_URI);
  const code = reqUrl.searchParams.get('code');

  if (!code) {
    res.end('Nenhum código recebido. Pode fechar esta aba e tentar de novo.');
    return;
  }

  res.end('Autorizado! Pode fechar esta aba e voltar pro terminal.');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\nGuarde este valor como secret YOUTUBE_REFRESH_TOKEN no GitHub:\n');
    console.log(tokens.refresh_token);
  } catch (e) {
    console.error('\nFalha ao trocar o código pelo token:', e.message);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORTA);
