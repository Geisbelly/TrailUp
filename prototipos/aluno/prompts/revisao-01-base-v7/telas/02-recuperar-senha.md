Tela 02 — **Recuperar senha**. Arquivo de saída: `v2/02-recuperar-senha.html`.

Pré-login, paleta **Pré-login**, mesmo esqueleto de dois painéis do Login.

## 1. Fonte da verdade
`mobile/src/app/(auth)/recuperarSenha.tsx`.

## 2. Objetivo
Tela de passagem, de baixa frequência. O aluno precisa sair dela sabendo **exatamente o próximo passo**: abrir o e-mail.

## 3. Painel de ação (bloco central de 400px)
1. "Voltar" (fantasma pequeno, seta) → `01-login.html`. `margin-bottom: 28px`.
2. "TrailUp" em Cinzel 700 34 `#ffffff`, centralizado.
3. **"Recuperar Senha"** em Cinzel 700 24 `text`, centralizado, `margin-top: 18px`. (O app escreve "Recuperar Senha", com S maiúsculo; mantenha.)
4. Subtítulo "Informe seu e-mail para receber o link de redefinição." em 15/1.6 `textMuted`, centralizado, `margin-top: 8px`, `margin-bottom: 28px`.
5. Campo **E-mail**: rótulo "E-mail", placeholder "Digite seu e-mail", `autofocus`, `type="email"`.
6. Botão primário **"Enviar Link"** (com L maiúsculo, como no botão do app), largura 100%, altura 50, `margin-top: 16px`. Desabilitado até o e-mail ser válido.
7. Linha centralizada, `margin-top: 20px`, 13: "Lembrou da senha? " (`textMuted`, 600) + **"Fazer login"** (700, `#e9deff`, sublinhado) → `01-login.html`.
8. Rodapé "Não tem uma conta? Cadastre-se." igual ao do Login.

## 4. Estados (seletor: "Vazio" · "Enviando..." · "Link enviado" · "E-mail inválido" · "Erro ao enviar")
- **Vazio:** botão desabilitado.
- **Enviando...:** spinner + "Enviando...", campo `readonly`.
- **Link enviado:** o formulário **é substituído** (não coberto) por um card de sucesso no mesmo bloco de 400px: ícone envelope-com-check 46 em `success` num círculo 72 `success-bg`, título Cinzel 700 22 **"Link enviado"**, corpo 15/1.6 `textMuted` **"Um link de recuperação foi enviado para seu e-mail."**, e, em destaque abaixo, o e-mail digitado em Inter 700 14 `text` num chip neutro. Depois a legenda 13 `textSubtle`: "Não chegou? Confira o spam ou envie de novo em 60 s." (adaptação web; o app volta sozinho para a tela anterior). Botões: primário "Voltar para o login" e fantasma "Reenviar link" (desabilitado com contador "Reenviar em 0:58").
- **E-mail inválido:** banner `warning` inline acima do botão, título **"E-mail inválido"**, corpo **"Digite um e-mail válido."**. Borda `danger` no campo.
- **Erro ao enviar:** banner de erro inline, título **"Erro ao enviar"**, corpo **"Não foi possível enviar o e-mail."**, e um botão fantasma pequeno "Tentar novamente" dentro do banner.

## 5. Não fazer
- Não usar diálogo modal para sucesso nem erro. O app usa alerta nativo; na web o retorno fica no próprio bloco.
- Não dizer se o e-mail existe ou não na base.

## 6. Aceite
- [ ] Textos exatos do app nos 5 estados.
- [ ] Sucesso substitui o formulário, mostra o e-mail digitado e o próximo passo.
- [ ] "Reenviar" com espera visível.
