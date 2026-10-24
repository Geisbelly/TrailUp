# Parte 1 — Entrada, login e recuperar senha (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/00-entrada.html`, `01-login.html` e `02-recuperar-senha.html`.

## De onde vem

- **v4:** `00-entrada.html` (cena + frase + dois botões, e o estado "Bem-vindo(a) de volta"), `01-login.html` e `02-recuperar-senha.html` (estilo imersivo do site: floresta roxa `journey-dawn.webp`, borboletas, folhas e vagalumes em `forest-life.webp`, painel de vidro escuro).
- **App hoje:** `app/(auth)/index.tsx` (entrada), `tela.tsx` (bem-vindo de volta, ~2s), `login.tsx` e `recuperarSenha.tsx`. No celular, o login ainda usa o "salão" antigo (`HallBackground`, ornamento dourado, "Entrar com Google" sem ícone, "Esqueceu a senha? Recuperar senha" abaixo dos botões). Na web larga já usa o estilo do v4 (`components/web/AuthDesktop.tsx`). **O celular passa a seguir o v4**, para as duas versões falarem a mesma língua.

## O que fica igual ao v4 (não mude)

- Textos: "Sua próxima conquista começa aqui.", "Já tenho conta", "Criar conta", "Acesse sua conta", "Continue de onde você parou", "Esqueci minha senha", "Entrar", "ou", "Continuar com Google", "Não tem uma conta? Cadastre-se ↗", "Recuperar senha", "Informe seu e-mail para receber o link de redefinição.", "Enviar link", "Lembrou da senha? Fazer login", "Link enviado", "BEM VINDO(A) DE VOLTA!".
- Mensagens de erro e os estados do seletor: login (Vazio, Preenchido, Entrando..., Erro de credenciais, Dados inválidos, Erro de conexão); recuperar (Formulário, Enviando..., E-mail inválido, Link enviado).
- Regra do botão "Entrar": desabilitado até o e-mail ter formato válido e a senha não estar vazia (`dadosValidos` do app).
- "Criar conta" e "Cadastre-se" **abrem o site** (o cadastro não acontece no app). No celular, mostre o ↗ e diga "abre no navegador".
- Paleta da marca (sem perfil): é antes do login.

## O que muda no celular

### 00 — Entrada
- A cena `entry-world.webp` ocupa a tela inteira, com o degradê para o fundo na parte de baixo, como no app hoje.
- Marca (estrela + "TrailUp") no topo, centralizada, abaixo da barra de status.
- A frase e os dois botões ficam **no terço de baixo**, ao alcance do polegar (no v4 web a frase fica no meio). Botões de 56px, largura total menos 24px de margem.
- Estado **Bem-vindo(a) de volta** (~2s, aparece quando já há sessão): a mesma cena, a frase e o anel com a estrela no centro. Sem botões.

### 01 — Login
- A cena da floresta fica **no topo, como faixa de ~36% da altura**, com a natureza animada (folhagem, borboletas, folhas, vagalumes). A frase do herói do v4 ("Sua próxima conquista começa aqui.") vai sobre a cena, em Georgia 28, sem o parágrafo de apoio (cabe pouco).
- O painel de vidro vira uma **folha que sobe de baixo** e ocupa o resto da tela (cantos de 20px só em cima), com a estrela, "Acesse sua conta" e o formulário. A folha rola se precisar; a cena não.
- Botão de voltar (para a Entrada) no canto superior esquerdo, sobre a cena.
- Campos de 52px, fonte 16px, com o ícone à esquerda e o olho na senha (alvo de 48px).
- "Esqueci minha senha" à direita, logo abaixo da senha, como no v4, com altura de toque de 48px.
- **Estado novo: "Teclado aberto".** A cena encolhe para uma faixa de 72px só com a marca, a folha sobe, aparece um teclado falso de 290px embaixo, e "Entrar" fica visível logo acima dele. A natureza pausa enquanto o aluno digita (como no site).

### 02 — Recuperar senha
- Mesmo arranjo do login: cena no topo com "Todo caminho tem volta." e folha embaixo.
- O "Voltar para o login" do v4 (link dentro do painel) vira o **botão de voltar do canto superior esquerdo**, com o rótulo "Login".
- **Link enviado** substitui o formulário dentro da folha (ícone de confirmação, texto com o e-mail em negrito, "Voltar para o login" como botão secundário de largura total), como no v4.
- Estado "Teclado aberto", como no login.

## Fora do escopo

- Cadastro e questionário BrainHex (acontecem no site).
- Login por biometria: o app não tem.
