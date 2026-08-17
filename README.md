# Opera-o Secure

Portal de teste multiusuario com autorizacao previa, Supabase Auth, Row Level Security e atualizacao em tempo real. O projeto nao contem cardapios, nomes de restaurantes, credenciais iniciais, e-mail administrativo nem telefone administrativo.

## Nome recomendado do repositorio
`opera-o-secure`

## Seguranca importante
- O repositorio pode ser privado, mas o GitHub Pages normalmente entrega os arquivos estaticos do site aos visitantes. Nunca coloque dados sigilosos no HTML/JS.
- A `SUPABASE_ANON_KEY` pode existir no navegador; a protecao real e feita pelas politicas RLS.
- Nunca use `service_role` no frontend, no GitHub ou em `config.js`.
- E-mail, celular, Resend e Twilio devem ficar somente em Supabase Edge Function Secrets.

## 1. Criar Supabase
1. Crie um projeto em https://supabase.com.
2. Em SQL Editor, execute `supabase/schema.sql`.
3. Em Authentication > Providers > Email, mantenha Email habilitado. Para producao, mantenha confirmacao por e-mail.
4. Copie Project URL e a chave `anon` para `config.js`.

## 2. Criar a primeira administradora
1. Publique temporariamente ou abra localmente e use `Pedir autorizacao` com seu proprio e-mail.
2. No SQL Editor execute, substituindo pelo seu e-mail:
```sql
update public.profiles set status='approved', role='admin' where email='SEU_EMAIL_DE_ADMIN';
```
3. A partir disso, todas as novas pessoas ficam pendentes e somente o perfil admin pode aprovar/rejeitar no painel.

## 3. Notificacao por e-mail ou SMS (opcional)
Implante a funcao `notify-admin` e configure secrets; nao escreva os valores no repositorio:
```bash
supabase functions deploy notify-admin
supabase secrets set ADMIN_EMAIL="seu-email" RESEND_API_KEY="..." FROM_EMAIL="Acesso <acesso@seu-dominio>"
```
Para SMS, configure uma conta Twilio e execute:
```bash
supabase secrets set ADMIN_PHONE="+55..." TWILIO_ACCOUNT_SID="..." TWILIO_AUTH_TOKEN="..." TWILIO_FROM="+..."
```
Sem Resend/Twilio, a solicitacao continua aparecendo em tempo real no painel da administradora.

## 4. Colocar no GitHub
1. No repositorio privado `opera-o-secure`, clique em **Adicionar arquivo > Carregar arquivos**.
2. Envie todos os arquivos e pastas desta pasta, mantendo `.github/workflows/pages.yml`.
3. Confirme que a branch se chama `main`.
4. Abra **Configuracoes > Pages** e selecione **GitHub Actions** como fonte.
5. Abra a aba **Acoes** e aguarde o workflow concluir.

## 5. Teste simultaneo
1. Administradora entra em um navegador.
2. Outra pessoa abre a URL e pede autorizacao.
3. A solicitacao aparecera no painel administrativo em tempo real.
4. Depois de aprovada, a outra pessoa atualiza a pagina e entra.
5. Registros criados por usuarios autorizados aparecem para os demais em tempo real.

## Limitacao de privacidade do GitHub Pages
Repositorio privado e site privado nao sao a mesma coisa. Restricao nativa de acesso a Pages privado depende de GitHub Enterprise Cloud. Neste projeto, a pagina de login pode ser publica, mas os dados ficam protegidos no Supabase por Auth + RLS. Para esconder ate a pagina de login, use Azure Static Web Apps/Cloudflare Access ou GitHub Enterprise Pages privado.
