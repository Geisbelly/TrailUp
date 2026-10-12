Tela 01 — **Login** (e, por consequência, 02 — Recuperar senha). Arquivo: `v2/01-login.html` (edite o atual, que anexo). Sem shell: é tela de antes do login.

## 1. Feedback
> "É mobile ou web? Tá mal adaptado para web."

No print, o formulário é uma coluna estreita no centro de uma tela de 1440px, com o cenário esticado em volta, e o erro aparece como um aviso solto no pé da tela, longe do formulário. É o layout do app, só que ampliado.

## 2. Fica como está
- Cenário `entry-world.webp` e a paleta **pré-login** (roxo da marca: `bg #150b28`, `surface #22123f`, `elev #2e1957`, `border #4a288a`, `borderStrong #784dcb`, `text #f4f3f7`, `accent #c1a1ff`). Depois do login, roxo é só a cor do Mastermind; aqui ele é a cor da marca.
- "TrailUp" em Cinzel, "Acesse sua conta", o ornamento de linhas.
- Campos E-mail e Senha, botões **"Entrar"** e **"Entrar com Google"**, "Esqueceu a senha? **Recuperar senha**" → `02-recuperar-senha.html`, "Não tem uma conta? **Cadastre-se.**" (site externo).
- O texto do erro: **"Erro no login"** / "E-mail ou senha incorretos. Confira os dados e tente novamente."
- "Entrar" leva a `03-trilha.html`.

## 3. O que muda

### 3.1 Dois painéis
```
┌ painel do mundo (minmax(0,1fr) = 880 no quadro) ─────────────┐┌ painel de acesso (560) ──────────┐
│ entry-world.webp em cover, nítido                             ││                                  │
│                                                               ││   bloco central de 400px:        │
│  [logo] TrailUp                              (topo, 40px)     ││   TrailUp / Acesse sua conta     │
│                                                               ││   ornamento                      │
│                                                               ││   E-mail  (rótulo visível)       │
│  "Sua próxima conquista                                       ││   Senha   (rótulo + olho)        │
│   começa aqui."           (Cinzel 700 44, pé, 56px)           ││   Esqueceu a senha? Recuperar    │
│  Estude do seu jeito: a trilha se adapta ao seu perfil.       ││   [Entrar]                       │
│                                                               ││   ── ou ──                       │
│                                                               ││   [Entrar com Google]            │
│                                                               ││   Não tem uma conta? Cadastre-se │
└───────────────────────────────────────────────────────────────┘└──────────────────────────────────┘
```
- `display: grid; grid-template-columns: minmax(0,1fr) 560px; height: 100vh`.
- **Painel do mundo:** o cenário deixa de ser fundo esticado atrás do formulário e vira um painel próprio, **sem** o véu escuro por cima (só um degradê de `bg` a 70% nos 240px de baixo, para o texto). Em cima, marca (logo 32 + "TrailUp" Georgia 700 20). Embaixo, a frase da Entrada **"Sua próxima conquista começa aqui."** (Cinzel 700 44, `#fff`) e uma linha 16 `rgba(255,255,255,.8)`: "Estude do seu jeito: a trilha se adapta ao seu perfil." (proposta).
- **Painel de acesso:** fundo `surface`, `border-left: 1px solid var(--line)`, conteúdo centrado na vertical, bloco de **400px**. Na web o formulário tem largura de formulário de desktop, não de celular.

### 3.2 Formulário
- **Rótulos visíveis** acima dos campos ("E-mail", "Senha"), 13/600 `textMuted`. No app são só placeholders; na web o rótulo fica. Placeholder do e-mail: "voce@escola.com".
- Campos de 48px, raio 12, fundo `bg`, borda `border`; foco com borda `accent` e anel `accentSoft` 3px.
- `autocomplete="username"` / `"current-password"`, `autofocus` no e-mail, Enter envia. Botão de olho na senha (`aria-label="Mostrar senha"`).
- "Esqueceu a senha? Recuperar senha" alinhado à direita, logo abaixo da senha.
- **"Entrar"**: primário, 100%, 50px. Desabilitado até e-mail válido e senha preenchida (regra `dadosValidos` do app).
- Separador **"ou"** (duas linhas `line` com "ou" 12 `textSubtle`) entre "Entrar" e "Entrar com Google".
- **"Entrar com Google"**: secundário, 100%, 50px, com o "G" colorido 18.
- "Cadastre-se" com ícone de nova aba 12, porque abre o site externo.

### 3.3 Erro perto do formulário
O aviso solto no pé da tela sai. O erro vira um **banner inline, acima do botão "Entrar"**: `padding: 14px 16px`, raio 14, fundo `danger-bg #3a1e22`, borda `1px solid #7a3a3a`, ícone alerta 16 `#f0847c`, título Inter 700 14 "Erro no login", texto 13 `#f0d5d5`. O campo Senha ganha borda `danger` e recebe o foco. O formulário continua visível.

## 4. Estados (seletor flutuante, na paleta pré-login)
"Vazio" · "Preenchido" · "Entrando..." · "Erro de credenciais" · "Dados inválidos" · "Erro de conexão"
- **Entrando...:** botão com spinner + "Entrando...", campos `readonly` a .7, Google desabilitado.
- **Dados inválidos:** banner em `warning` (`#e0b34d`, fundo a 14%): "Dados inválidos" / "Preencha os dados corretamente." (texto do app).
- **Erro de conexão:** banner de erro "Não foi possível entrar" / "Verifique sua conexão e tente novamente."

## 5. Aplicar o mesmo esqueleto em `02-recuperar-senha.html`
Senão Login e Recuperar senha ficam com linguagens diferentes. Mesmo painel do mundo, mesmo painel de acesso de 560px; só o bloco de 400px muda:
- Link "← Voltar para o login" no topo do bloco (→ `01-login.html`).
- "Recuperar senha" (Cinzel 700 28), "Informe seu e-mail para receber o link de redefinição." (texto do v1).
- Campo E-mail com rótulo, botão **"Enviar link"**.
- **Sucesso:** o formulário é **substituído** por: check 46 `success`, "Link enviado", "Um link de recuperação foi enviado para **aluno@escola.edu.br**. Confira também a caixa de spam." e o botão secundário "Voltar para o login". Não usar aviso solto no pé da tela.
- Rodapé: "Lembrou da senha? **Fazer login**".

## 6. Não fazer
- Não deixar o formulário flutuando no meio do cenário.
- Não usar modal nem aviso no pé da tela para erro.
- Não mexer na Entrada (`00`), que não foi comentada.

## 7. Aceite
- [ ] Dois painéis na largura toda; nenhum elemento com cara de tela de celular ampliada.
- [ ] Rótulos visíveis, `autocomplete` certo, Enter envia.
- [ ] Erro inline acima do botão, com foco na Senha.
- [ ] Recuperar senha no mesmo esqueleto, com sucesso no lugar do formulário.
