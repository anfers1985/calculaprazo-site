# Guia de Deploy — Newsletter do Calcula Prazo

Siga na ordem. Cada passo diz exatamente onde clicar/colar. No final você vai ter: banco configurado, e-mails saindo, disparo automático rodando, e o admin funcionando.

---

## 1. Resend (conta + domínio + chave)

1. Crie uma conta grátis em **resend.com**.
2. No painel, vá em **Domains → Add Domain** e cadastre `calculaprazo.com.br`.
3. O Resend vai te mostrar 2-3 registros DNS (geralmente TXT e/ou CNAME, para SPF e DKIM). Copie exatamente o que ele mostrar.
4. Cole esses registros no **Cloudflare** (onde você já gerencia o DNS do domínio): Dashboard → seu domínio → DNS → Adicionar registro, um de cada vez, com o nome/tipo/valor exatos que o Resend informou.
5. Volte no Resend e clique em **Verify** — pode levar de alguns minutos a algumas horas pra propagar. Só continue pro próximo passo quando aparecer "Verified".
6. Vá em **API Keys → Create API Key**, dê um nome (ex.: "calculaprazo-newsletter") e **guarde essa chave** — você vai usar no passo 4.

---

## 2. Rodar o SQL no Supabase (tabelas)

1. Abra o painel do seu projeto Supabase (o mesmo que você já usa pro pipeline de vídeo).
2. Vá em **SQL Editor → New query**.
3. Abra o arquivo `supabase/migrations/001_newsletter.sql` deste pacote, copie o conteúdo inteiro, cole no editor, e clique em **Run**.
4. Confira: em **Table Editor**, devem aparecer 3 tabelas novas: `newsletter_subscribers`, `newsletter_campaigns`, `newsletter_sends_log`.

*(O cron job — SQL 002 — só vem depois do passo 4, porque ele depende da Edge Function já estar publicada.)*

---

## 3. Instalar a CLI do Supabase (se ainda não tiver)

No terminal, na pasta raiz do projeto (`calculaprazo-site-main`):

```bash
npm install -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
```

O `SEU_PROJECT_REF` aparece na URL do painel do Supabase (algo como `https://abcdefghijklmnop.supabase.co` → o ref é `abcdefghijklmnop`).

---

## 4. Configurar os secrets e publicar as Edge Functions

Ainda no terminal, na raiz do projeto:

```bash
# Gere duas strings aleatórias pra usar como secrets (qualquer texto longo e aleatório serve).
# No Mac/Linux, por exemplo: openssl rand -hex 32

supabase secrets set RESEND_API_KEY=<a chave que você copiou no passo 1.6>
supabase secrets set CRON_SECRET=<uma string aleatória sua — anote em local seguro>
supabase secrets set ADMIN_SECRET=<outra string aleatória, diferente da anterior — anote também>

supabase functions deploy newsletter-subscribe --no-verify-jwt
supabase functions deploy newsletter-unsubscribe --no-verify-jwt
supabase functions deploy newsletter-send --no-verify-jwt
supabase functions deploy newsletter-admin --no-verify-jwt
```

Depois de rodar, você deve ver 4 functions publicadas em **Edge Functions** no painel do Supabase.

---

## 5. Configurar o Cron Job (disparo automático)

1. Abra `supabase/migrations/002_newsletter_cron.sql` deste pacote.
2. Troque `SEU_PROJECT_REF` pelo ref do seu projeto (mesmo valor do passo 3).
3. Troque `SEU_CRON_SECRET` pelo **mesmo valor** que você usou em `CRON_SECRET` no passo 4.
4. Cole o conteúdo inteiro no **SQL Editor** do Supabase e clique em **Run**.
5. Confira que funcionou: `select * from cron.job;` deve mostrar uma linha chamada `newsletter-dispatch`.

A partir daqui, o Supabase verifica sozinho, todo dia às 09h e 15h (Brasília), se tem alguma campanha agendada pra aquele horário.

---

## 6. Conectar o admin

1. Abra `admin/index.html` no navegador (como você já faz normalmente) → **Configurações**.
2. Na seção **📧 Newsletter (Supabase)**:
   - **URL do Projeto Supabase**: `https://SEU_PROJECT_REF.supabase.co`
   - **Newsletter Admin Secret**: o mesmo valor de `ADMIN_SECRET` que você configurou no passo 4.
3. Clique em **Salvar**, depois em **Testar Conexão** — deve aparecer "✓ Conexão OK!".
4. Se der erro, confira: (a) se o secret bate exatamente com o que foi configurado no Supabase, (b) se a function `newsletter-admin` está mesmo publicada (passo 4).

---

## 7. Conectar o formulário do site (rodapé)

Isso é a única parte que precisa editar arquivo à mão (não tem como fazer pelo admin, porque afeta o site publicado inteiro).

1. Abra o arquivo `app.js` na raiz do projeto. Procure a linha:
   ```js
   const NEWSLETTER_SUBSCRIBE_URL = 'https://SEU-PROJETO.supabase.co/functions/v1/newsletter-subscribe';
   ```
   Troque `SEU-PROJETO` pelo seu project ref real.

2. Faça o mesmo no arquivo `blog.js` (mesma linha, mesmo formato).

3. Depois de editar os dois, **re-minifique e re-versione** (senão a mudança não aparece no site, já que ele carrega os `.min.js`):
   ```bash
   npm install terser --no-save
   npx terser app.js -o app.min.js -c -m
   npx terser blog.js -o blog.min.js -c -m
   node scripts/11-bump-asset-version.mjs app 10
   node scripts/11-bump-asset-version.mjs blog 13
   rm -rf node_modules package-lock.json
   ```
   (os números de versão acima — `10` e `13` — são só exemplo; use o próximo número depois do que já está em uso hoje. Se não tiver certeza de qual é o número atual, rode `grep -o "app.min.js?v=[0-9]*" index.html` e `grep -o "blog.min.js?v=[0-9]*" index.html` primeiro, e some 1.)

4. **Repita o mesmo passo 1 e 2 também dentro de cada arquivo de post do blog** — não, espera: isso NÃO é necessário. Os posts do blog já têm a função duplicada com o placeholder `SEU-PROJETO` neles também (porque são páginas autocontidas). Você vai precisar trocar esse placeholder ali também. Como são 364 arquivos, o jeito prático é rodar este comando (Mac/Linux/Git Bash) na raiz do projeto, trocando `SEU_PROJECT_REF` pelo valor real:

   ```bash
   find blog -name "*.html" -exec sed -i "s#https://SEU-PROJETO.supabase.co/functions/v1/newsletter-subscribe#https://SEU_PROJECT_REF.supabase.co/functions/v1/newsletter-subscribe#g" {} +
   ```

   Confira depois: `grep -rl "SEU-PROJETO" blog/*.html | wc -l` deve retornar `0`.

---

## 8. Testar de ponta a ponta

1. Abra o site publicado (ou local), role até o rodapé, digite um e-mail seu no formulário da newsletter, clique em Inscrever. Deve aparecer "✓ Inscrito!".
2. Confira no admin (**Newsletter → Assinantes**) que seu e-mail apareceu.
3. No admin (**Newsletter → Campanhas**), clique em **Nova Campanha**, preencha um assunto e um texto de teste, marque "Enviar agora" (ou deixe como rascunho), salve.
4. Se quiser testar o envio de verdade, abra a campanha e clique em **Enviar agora**. Confira sua caixa de entrada.
5. No e-mail recebido, clique no link "Cancelar inscrição" — deve te levar pra página `/newsletter/cancelar` com a mensagem de confirmação, e o e-mail deve sumir da lista de "ativos" no admin.

---

## Onde cada coisa fica, se precisar mexer depois

| O quê | Onde |
|---|---|
| Tabelas do banco | Supabase → Table Editor |
| Ver campanhas/assinantes direto no banco | Supabase → Table Editor → `newsletter_campaigns` / `newsletter_subscribers` |
| Logs de erro das Edge Functions | Supabase → Edge Functions → clique na function → Logs |
| Histórico de execução do cron | SQL Editor: `select * from cron.job_run_details order by start_time desc limit 20;` |
| Trocar o texto/limites de envio (100/dia no free tier do Resend) | resend.com → Settings |
| Adicionar uma calculadora nova na lista da newsletter | `supabase/functions/_shared/calculators-list.ts` **e** `admin/index.html` (array `NL_CALCULATORS`) — os dois, se não os dois lugares ficam dessincronizados |
