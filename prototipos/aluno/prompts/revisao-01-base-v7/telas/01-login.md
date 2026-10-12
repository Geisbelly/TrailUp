Tela 01 — **Login**. Arquivo de saída: `v2/01-login.html`.

Pré-login: paleta **Pré-login**, mesmo esqueleto de dois painéis da Entrada (`00-entrada.html`). Só o painel de ação muda.

## 1. Fonte da verdade
`mobile/src/app/(auth)/login.tsx`. Validação: e-mail com formato válido **e** senha não vazia habilitam o botão (`dadosValidos`).

## 2. Objetivo
Porta de uso diário. O menor atrito possível: foco automático no e-mail, Enter envia, erro específico e perto do campo.

## 3. Grade
Igual à Entrada: `grid-template-columns: minmax(0,1fr) 640px`. O painel de cenário repete a Entrada, sem a legenda. O painel de ação tem bloco central de 400px.

## 4. Blocos do painel de ação (de cima para baixo)
1. **Voltar** (`margin-bottom: 28px`): botão fantasma pequeno com seta para a esquerda: "Voltar", que leva a `00-entrada.html`. Adaptação web (no app, é o gesto de voltar).
2. **Nome do app** "TrailUp" em Cinzel 700 34 `#ffffff` (como no app), centralizado.
3. **"Acesse sua conta"** em Inter 400 16 `rgba(255,255,255,.78)`, centralizado, `margin-top: 6px`.
4. **Ornamento** (`margin: 20px 0 28px`): linha de 1px `accent` a 55%, com 120px de largura, losango 8×8 `accent` no centro e duas linhas de 48px saindo dele (padrão `HallTheme`/`ornamentRow`).
5. **Formulário** (`<form>`, gap 16):
   - Campo **E-mail** (`type="email"`, `autocomplete="username"`, `autofocus`). Rótulo "E-mail" visível (no app é só placeholder; na web o rótulo fica acima). Placeholder "voce@escola.com".
   - Campo **Senha** (`type="password"`, `autocomplete="current-password"`) com botão de olho. Rótulo "Senha".
   - Linha abaixo da senha, alinhada à direita: "Esqueceu a senha? " (Inter 600 13 `textMuted`) + link **"Recuperar senha"** (Inter 700 13, cor = `accent` com L +12%, que o app chama de `gold` e aqui dá `#e9deff`, sublinhado) → `02-recuperar-senha.html`.
6. **Botão "Entrar"** (primário, largura 100%, altura 50, `margin-top: 8px`). Desabilitado até os dados serem válidos (o app troca a cor do texto para `textSubtle` e esmaece; aqui use o desabilitado padrão do mestre).
7. **Separador "ou"** (`margin: 20px 0`): duas linhas 1px `--line` com "ou" (12 `textSubtle`) no meio. Adaptação web.
8. **"Entrar com Google"**: botão secundário, largura 100%, altura 50, logo "G" multicolor 18 à esquerda. Texto `text`.
9. **Rodapé** (`margin-top: 28px`, centralizado, 13 `textSubtle`): "Não tem uma conta? " + **"Cadastre-se"** (700, `accent`, sublinhado, ícone de nova aba 12). Link externo, como na Entrada.

## 5. Estados (seletor: "Vazio" · "Preenchido" · "Entrando..." · "Erro de credenciais" · "Dados inválidos" · "Erro desconhecido")
- **Vazio:** campos vazios, "Entrar" desabilitado.
- **Preenchido:** `livia.moraes@escola.com` / senha mascarada (10 pontos), "Entrar" habilitado.
- **Entrando...:** botão com spinner + "Entrando...", campos em `readonly` com opacidade .7, "Entrar com Google" desabilitado.
- **Erro de credenciais** (`invalid_credentials`): banner de erro **acima do botão** (não um diálogo que cobre o formulário). Card de erro compacto (`padding: 14px 16px`, raio 14, `danger-bg`, `1px solid danger-border`, ícone alerta 16 `danger-text`, gap 10). Título Inter 700 14 `text`: **"Erro no login"**. Corpo 13 `danger-body`: "E-mail ou senha incorretos. Confira e tente de novo." Borda `danger` no campo Senha, e o foco volta para ele. O app mostra um alerta nativo com o título "Erro no login"; o corpo exato vem do Supabase ("Invalid login credentials"), que o app não traduz. Este corpo é a tradução proposta; marque-o com um comentário HTML `<!-- texto proposto: o app mostra a mensagem crua do provedor -->`.
- **Dados inválidos:** aviso **"Dados inválidos"** / "Preencha os dados corretamente." no mesmo formato de banner, mas em `warning` (ícone alerta, fundo `warning-bg`, borda `1px solid rgba(224,179,77,.4)`).
- **Erro desconhecido** (`unknown_error`): banner de erro, título **"Não foi possível entrar"**, corpo "Verifique sua conexão e tente novamente." (esse corpo é o de `SelecionarTurmaScreen`, reaproveitado).

## 6. Interações
- Enter em qualquer campo envia se válido. Tab na ordem: e-mail → senha → olho → recuperar → Entrar → Google → Cadastre-se.
- Validação do e-mail só no `blur` (sem erro enquanto digita). Erro de campo: "Digite um e-mail válido." (texto do app, de `recuperarSenha.tsx`).
- Sucesso: leva a `03-trilha.html`.

## 7. Não fazer
- Não usar modal para o erro de credencial. Banner inline, e o formulário continua visível.
- Não culpar o aluno de forma vaga ("algo deu errado"). Diga o que conferir.

## 8. Aceite
- [ ] Textos exatos: "Acesse sua conta", "Entrar", "Entrando...", "Entrar com Google", "Esqueceu a senha? Recuperar senha", "Não tem uma conta? Cadastre-se".
- [ ] Botão desabilitado até dados válidos. Os 6 estados no seletor.
- [ ] Erro inline, com foco devolvido ao campo, e borda de erro no campo.
- [ ] Rótulos visíveis e `autocomplete` corretos.
