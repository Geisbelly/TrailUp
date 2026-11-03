# Envio de e-mail pelo Google Apps Script

Substitui a Brevo nos três envios do banco: contato do app (`fn_enviar_contato`), contato do site
(`fn_enviar_contato_publico`) e aviso de conta inativa (`retencao_avisos_email`). Quem chama é o
Postgres, por `net.http_post`, através de `fn_email_apps_script` (migration `20261101_14`).

O projeto publicado chama **"TrailUp - envio de e-mail"** no Apps Script da conta Google dona do
projeto. `Code.gs` e `appsscript.json` aqui são a fonte; o editor do Apps Script é cópia.

## Publicar (uma vez)

1. Em script.google.com, criar o projeto e colar `Code.gs` e `appsscript.json` (Configurações do
   projeto → "Mostrar arquivo de manifesto"). O manifesto limita a permissão a
   `script.send_mail`: o script não lê a caixa de e-mail.
2. **Executar → `gerarSegredo`**, autorizar, e copiar o valor do registro de execução.
3. **Implantar → Nova implantação → App da Web**, executar como **Eu**, acesso **Qualquer
   pessoa**. Copiar a URL que termina em `/exec`.
4. No Supabase (SQL editor), gravar os dois segredos no Vault:

   ```sql
   SELECT vault.create_secret('<URL /exec>', 'apps_script_email_url');
   SELECT vault.create_secret('<segredo do passo 2>', 'apps_script_email_segredo');
   ```

   Segredo não entra em migration nem em commit.

Ao mudar o código depois: **Implantar → Gerenciar implantações → editar → Nova versão** na mesma
implantação. Uma implantação nova muda a URL, e aí o Vault precisa ser atualizado.

## Como o banco sabe que o e-mail saiu

Medido em produção em 01/11/2026:

| caso | o que o pg_net guarda |
|---|---|
| e-mail enviado | **200** com `{"ok":true,"cota_restante":…}` (o app da web responde 302 para `script.googleusercontent.com`, e o pg_net 0.20 segue) |
| script levantou (segredo errado, JSON inválido, corpo vazio) | **200** com a página HTML de erro do Google |

O código HTTP é o mesmo nos dois casos, então "2xx" não diz nada. `fn_email_apps_script_aceito` só
aceita 2xx com `"ok": true` no corpo (ou o 302 para `script.googleusercontent.com`, se o pg_net
deixar de seguir o redirecionamento). Por isso o script **levanta erro** em toda falha em vez de
devolver `{ok: false}`. Um 302 para `accounts.google.com` quer dizer implantação sem acesso
"Qualquer pessoa", e o script nem rodou.

Só o aviso de conta inativa confere a resposta: o prazo de exclusão conta a partir do e-mail
aceito. Os dois contatos enfileiram e seguem, como faziam com a Brevo.

## Limites

- **Cota:** a do `MailApp` na conta que publicou (conta Gmail comum: cerca de 100 destinatários por
  dia; Workspace: mais). Esgotada, o script levanta e o aviso tenta de novo depois.
- **Remetente:** a própria conta Google. O nome exibido vem de `nome_remetente`.
- **Visual:** todo e-mail sai no tema do TrailUp (`montarHtml_`): fundo e cartão roxos, título em
  Cinzel, botão no verde de destaque e a estrela do ícone do app
  (`trailup.vercel.app/trailup-app-icon.png`). As cores em `TEMA` são os tokens de
  `frontend/src/index.css` em hex; mudou lá, muda aqui (e publica nova versão). O texto puro vai
  junto, para cliente que não mostra HTML.
- **Gmail em modo escuro (iPhone e Android):** inverte as cores de todo e-mail e ignora
  `color-scheme: dark` (o fundo roxo chegava lilás-claro, 03/11). Os fundos vão também como
  `background-image` e os textos dentro de `.gs`/`.gd` (`mix-blend-mode`), que só valem no Gmail.
  Depois de mexer no visual: **Executar → `enviarTeste`** manda uma amostra para a conta do script;
  conferir no Gmail do celular com o modo escuro ligado e desligado.
- **LGPD:** cópia de cada envio fica na pasta Enviados dessa conta. Conta pessoal não tem DPA; ver a
  linha 8 de `docs/lgpd/transferencias-internacionais.md`.
