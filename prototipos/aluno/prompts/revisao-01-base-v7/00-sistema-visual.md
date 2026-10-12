PROMPT MESTRE — área web do aluno (TrailUp), revisão 01 sobre a base do V7 do professor.
Cole isto inteiro, numa conversa nova, ANTES de qualquer prompt de tela. Os prompts de `telas/` vêm depois, na mesma conversa, um por mensagem.

---

Vou prototipar a **área web do aluno** do TrailUp: 12 telas HTML estáticas e navegáveis (`<a href>` reais entre os arquivos). Já existe um protótipo do **console do professor (V7)**, e esta área precisa parecer do **mesmo produto**, com a mesma estrutura, geometria, tipografia e padrões de componente. A diferença é uma só: **a cor vem do perfil BrainHex do aluno**, não de um violeta fixo.

Não invente componentes, cores, textos ou comportamentos fora deste documento e dos prompts de tela. Quando um prompt de tela não disser um valor, use o valor daqui. Quando disser, o prompt de tela vence.

## 0. O produto em 5 linhas

- TrailUp personaliza estudo pelo "perfil de jogador" BrainHex do aluno (7 perfis: Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever).
- O professor monta a trilha (tópicos → conteúdos + atividades). Uma IA gera, por tópico e por perfil, texto, áudio e apresentação.
- O aluno percorre a trilha, estuda dentro do tópico, faz atividades, ganha pontos e conquistas, compete em rankings e se conecta com colegas.
- A área do aluno hoje é o app mobile (Expo) rodando no navegador. Este protótipo define como ela deve ficar numa tela larga.
- Sessões de estudo são longas e frequentes. A interface sustenta uso contínuo; não é um site de consulta.

## 1. Quadro de referência e grade

- **Quadro:** 1440×900 px. Toda medida abaixo é para esse quadro.
- **Mínimo suportado:** 1024 px de largura. Entre 1024 e 1279 px, a sidebar recolhe para 76px (só ícones, com tooltip). Abaixo de 1024 px vale o layout do app mobile, fora do escopo.
- **Unidade de espaçamento:** múltiplos de 2, preferencialmente 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 60.
- **Área útil do conteúdo** no quadro: 1440 − 264 (sidebar) − 2×40 (padding) = **1096 px** de largura.
- **Grades internas usadas nas telas:** 12 colunas de 1096px com gap de 20px (coluna = 73,67px). Os prompts de tela citam spans (ex.: "8/12 + 4/12" = 721,33px + 354,67px com 20px entre eles).

## 2. Tokens de cor — a fórmula (não é paleta fixa)

Implementação real: `mobile/src/utils/profileShellPalette.ts`. Dada a cor-assinatura do perfil, no mesmo matiz H e com saturação limitada a 55%:

| Token | Regra |
|---|---|
| `background` | L = 10% |
| `surface` | L = 16% |
| `surfaceElevated` | L = 22% |
| `border` | L = 35% |
| `borderStrong` | L = 55% |
| `text` | mesmo H, S ≤ 18%, L = 96% |
| `textMuted` | `text` a 82% de opacidade |
| `textSubtle` | `text` a 62% de opacidade |
| `accent` | cor-assinatura com **só a luminosidade HSL elevada**, em passos de 4%, até contraste ≥ 4,5:1 contra `surfaceElevated`. Nunca misturar com branco |
| `accentStrong` | cor-assinatura escurecida 8% |
| `accentSoft` | `accent` a 18% |
| `accentMuted` | `accent` a 12% |
| `inactive` | mix de 16% da cor-assinatura em `text`, a 60% |

### 2.1 Valores calculados (rodando a fórmula com `tinycolor2`, não estimados)

| Perfil (assinatura) | background | surface | surfaceElevated | border | borderStrong | text | accent | accentStrong |
|---|---|---|---|---|---|---|---|---|
| **Conqueror** `#1e4fd6` — exemplo padrão | `#0b1328` | `#121e3f` | `#192a57` | `#28428a` | `#4d6fcb` | `#f3f4f7` | `#6f90eb` | `#1942b2` |
| Seeker `#17a398` | `#0b2825` | `#123f3c` | `#195752` | `#288a83` | `#4dcbc1` | `#f3f7f6` | `#1fd9ca` | `#127f77` |
| Survivor `#4e5a66` | `#16191d` | `#23292e` | `#313840` | `#4d5965` | `#7d8c9c` | `#f3f5f6` | `#95a1ae` | `#3c464f` |
| Daredevil `#d7263d` | `#280b0f` | `#3f1218` | `#571921` | `#8a2835` | `#cb4d5e` | `#f7f3f3` | `#e87b89` | `#b42033` |
| Mastermind `#5b3fd9` | `#110b28` | `#1b123f` | `#241957` | `#3a288a` | `#644dcb` | `#f4f3f7` | `#9583e6` | `#4528c8` |
| Socializer `#f4623a` | `#28120b` | `#3f1c12` | `#572719` | `#8a3d28` | `#cb684d` | `#f7f4f3` | `#f68161` | `#f24313` |
| Achiever `#c9a227` | `#28210b` | `#3f3412` | `#574819` | `#8a7328` | `#cbad4d` | `#f7f6f3` | `#dab43f` | `#a78620` |
| **Pré-login** (marca `#c1a1ff`, tema "mágica") | `#150b28` | `#22123f` | `#2e1957` | `#4a288a` | `#784dcb` | `#f4f3f7` | `#c1a1ff` | `#a678ff` |

Antes do login (Entrada, Login, Recuperar senha) não existe perfil. Use a linha **Pré-login**. É o único lugar onde esse roxo é cor de tema; depois do login, roxo é só a cor do Mastermind.

### 2.2 Como cada papel de cor do V7 vira token do aluno

| Papel no V7 (HEX do professor) | Token no aluno |
|---|---|
| fundo da página `#0d0b16` | `background` |
| header `#23192e` | `surface` |
| sidebar `#170e24` | `background` + camada `rgba(0,0,0,.18)` (sidebar ligeiramente mais escura que a página) |
| card `#1b1728` | `surface` |
| superfície interna / input / cabeçalho de tabela `#231d33` | `surfaceElevated` |
| esqueleto, 2º tom `#2b2542` | `surfaceElevated` com L +4% (só no brilho do shimmer) |
| borda de card e divisória `#2b2438` | **`--line` = `border` a 55%** (derivado, ver decisão D6) |
| borda de input / botão secundário | `border` (100%) |
| texto principal `#f4f2f8` | `text` |
| texto de corpo `#c9c4d4` / `#e5e1ec` | `textMuted` |
| texto secundário/legenda `#a29cb3` | `textSubtle` |
| placeholder / cabeçalho de tabela `#7a7488` | `inactive` |
| violeta de marca `#9b5de5` (botão primário, aba ativa, destaque) | `accent` |
| violeta claro `#c1a7ec` (texto de destaque, valor do 1º lugar) | `accent` |
| teal `#4fd1c5` (item ativo da sidebar) | `accent` (decisão D3) |
| bronze `#9c6b4f`/`#c9924f` (assistente Escriba) | **não existe no aluno**. O assistente do aluno é o guardião do perfil (ver §7.10) |

### 2.3 Cores de estado — fixas, iguais para os 7 perfis (V7)

| Token | HEX | Uso |
|---|---|---|
| `success` | `#5fd99a` | acerto, concluído, salvo |
| `success-bg` | `rgba(95,217,154,.14)` | fundo de chip/aviso de sucesso |
| `warning` | `#e0b34d` | atenção, tempo acabando, pendente de sincronizar |
| `warning-bg` | `rgba(224,179,77,.14)` | |
| `info` | `#6fb3e0` | informativo, dica |
| `info-bg` | `rgba(111,179,224,.14)` | |
| `danger` | `#e2574c` | **só preenchimento, ponto ou barra, nunca texto** (3,2 a 4,7:1) |
| `danger-text` | `#f0847c` | texto e ícone de erro (≥ 4,6:1 em qualquer `surface`) |
| `danger-bg` | `#3a1e22` | fundo de card/banner de erro |
| `danger-border` | `#7a3a3a` | borda de card de erro e de modal destrutivo |
| `danger-body` | `#f0d5d5` | texto corrido dentro de `danger-bg` |

**Regra de colisão:** o accent do Daredevil (`#e87b89`) parece `danger`, o do Achiever (`#dab43f`) parece `warning` e o do Seeker (`#1fd9ca`) fica perto de `success`. Por isso **todo estado semântico leva ícone + rótulo de texto**, nunca só cor.

### 2.4 Contraste conferido (fórmula aplicada, pior caso entre os 7 perfis)

- Botão primário (`accent` com texto `background`): 6,03:1 (Conqueror) a 8,83:1. **Passa em todos.**
- `accent` como texto sobre `surface`: ≥ 5,35:1. `textSubtle` sobre `surface`: ≥ 5,20:1. `textMuted`: ≥ 7,84:1.
- `danger-text` sobre `surface`: ≥ 4,60:1 (Seeker). `danger` como texto: reprova (3,16:1), por isso só vale como fill.
- Botão destrutivo sólido: fundo `danger` com texto `#2a0d0d` (4,91:1). **Não** usar texto branco (3,68:1).

## 3. Tipografia

- `--font-title`: **Cinzel** 600/700 (Google Fonts), fallback `Georgia, serif`. Só em: wordmark, título de página, título de card/seção, título de modal, título de estado vazio, número do pódio.
- `--font-body`: **Inter** 400/500/600/700, fallback `system-ui, "Segoe UI", Roboto, sans-serif`. Todo o resto.
- Import: `https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&display=swap`.

| Estilo | Fonte / peso | Tamanho / altura de linha | Cor | Extra |
|---|---|---|---|---|
| wordmark | Cinzel 700 | 22 / 1 | `text` | |
| título de página (H1) | Cinzel 700 | 32 / 1.1 | `text` | |
| eyebrow | Inter 600 | 12 / 1.2 | `accent` | caixa alta, `letter-spacing: .1em`, 10px acima do H1 |
| subtítulo de página | Inter 400 | 15 / 1.6 | `textSubtle` | largura máx. 640, 8px abaixo do H1 |
| título de card (H2) | Cinzel 700 | 18 / 1.25 | `text` | |
| título de modal | Cinzel 700 | 19 / 1.25 | `text` | |
| título de estado vazio | Cinzel 700 | 24 / 1.2 | `text` | |
| título de item (H3) | Inter 600 | 15 / 1.35 | `text` | |
| corpo | Inter 400 | 14 / 1.6 | `textMuted` | |
| corpo de leitura (Tópico) | Inter 400 | 17 / 1.75 | `text` | largura máx. 720 |
| legenda | Inter 400 | 13 / 1.5 | `textSubtle` | |
| micro | Inter 500 | 11.5 / 1.4 | `textSubtle` | |
| cabeçalho de tabela | Inter 600 | 10.5 / 1.2 | `inactive` | caixa alta, `letter-spacing: .08em` |
| valor de KPI | Inter 700 | 32 / 1 | `text` | `font-variant-numeric: tabular-nums` |
| unidade de KPI | Inter 500 | 13 / 1 | `textSubtle` | 6px à direita do valor |
| rótulo de botão | Inter 700 (primário) / 600 (demais) | 14 / 1 | | |
| rótulo de nav | Inter 400 (600 se ativo) | 14.5 / 1 | | |

Números sempre com `tabular-nums`. Decimais em PT-BR com vírgula ("7,4"), milhar com ponto ("3.180").

## 4. Raios, bordas, sombras

| Elemento | Raio |
|---|---|
| card, modal, painel, card de estado vazio/erro | 20 |
| bloco interno de card, item de lista destacado, célula de pódio (só topo: `14px 14px 0 0`) | 16 / 14 |
| input, select, textarea, toast | 14 |
| item de nav | 12 |
| botão, chip, aba segmentada, seletor, badge | 999 (pílula) |
| avatar | 50% |
| nó da trilha | hexágono (`clip-path: polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)`) |

- Borda padrão de card: `1px solid var(--line)`. Sem sombra em card (V7).
- Sombra só em flutuantes: modal e popover `0 20px 50px rgba(0,0,0,.5)`; botão flutuante `0 12px 30px rgba(0,0,0,.45)`.
- Brilho de destaque (V7 "glow"): `0 0 30px` em `accent` a 35%. Um por tela no máximo (1º lugar do pódio, nó atual da trilha, conquista recém-desbloqueada).

## 5. Estrutura fixa das telas autenticadas (shell)

```
┌──────────────────────────────── header 68px (fixo, 100% largura) ───────────────────────────────┐
├── sidebar 264px (fixa) ──┬────────────── main (margin-left 264, padding 108 40 60) ─────────────┤
│                          │  [seletor de estado — só protótipo]                                    │
│                          │  eyebrow / H1 / subtítulo ........................ ações da página    │
│                          │  conteúdo                                                              │
└──────────────────────────┴───────────────────────────────────────────────────────────────────────┘
```

### 5.1 Header (`<header>`)
- `position: fixed; top: 0; left: 0; right: 0; height: 68px; z-index: 30; padding: 0 32px;` fundo `surface`, `border-bottom: 1px solid var(--line)`. Flex, `justify-content: space-between`, `align-items: center`.
- **Esquerda** (gap 14): logo `assets/trailup-brand-logo.png` 28×28 → "TrailUp" (wordmark) → divisória 1×20 `--line` (margem 0 6px) → "Área do aluno" Inter 400 14 `textSubtle`.
- **Direita** (gap 14): avatar 38×38 (foto do aluno em círculo, anel `2px solid accent`, sem foto = retrato do guardião do perfil `assets/rosto-<perfil>.png`) → bloco de 2 linhas (nome Inter 700 14 `text` / "Conqueror · Matemática" Inter 400 12 `textSubtle`, `line-height: 1.3`) → botão "Sair" (ícone porta-com-seta 18px `textSubtle`, área de toque 36×36 circular, `margin-left: 6px`, hover fundo `surfaceElevated` e ícone `text`, `title="Sair"`).

### 5.2 Sidebar (`<nav aria-label="Seções da área do aluno">`)
- `position: fixed; top: 68px; left: 0; bottom: 0; width: 264px; z-index: 20; padding: 24px 16px;` fundo `background` + `rgba(0,0,0,.18)`, `border-right: 1px solid var(--line)`. Coluna com gap 4.
- **Itens, nesta ordem** (a ordem real das abas em `mobile/src/app/(tabs)/_layout.tsx`):
  1. **Trilha**: ícone mapa dobrado → `03-trilha.html`
  2. **Notificações**: ícone sino → `07-notificacoes.html` (com contador)
  3. **Social**: ícone grupo de pessoas → `06-social.html` (**portão**)
  4. **Ranking**: ícone pódio/barras → `05-ranking.html` (**portão**)
  5. **Perfil**: ícone pessoa → `08-perfil-hub.html`
- Item: `<a>` flex, gap 12, `padding: 11px 14px`, raio 12, ícone 20×20 (traço 1.6, linear, estilo lucide), rótulo Inter 14.5, `white-space: nowrap`.
  - Inativo: ícone e texto `textSubtle`, sem fundo. Hover: texto `text`, fundo `rgba(255,255,255,.04)`.
  - **Ativo:** ícone e texto `accent`, fundo `accentMuted`, peso 600, `aria-current="page"`.
  - Foco de teclado (`:focus-visible`): `outline: 2px solid accent; outline-offset: 2px;` raio 12.
  - Contador (Notificações): `margin-left: auto`, altura 20, `min-width: 20`, `padding: 0 6px`, raio 999, fundo `accent`, texto `background` Inter 700 11, centralizado. Some quando zero.
  - **Portão fechado** (Social/Ranking ainda não liberados): cadeado 14px `inactive` em `margin-left: auto`. Rótulo continua `textSubtle`. Clique **não navega**: abre o modal de desbloqueio (§7.8). No protótipo, Social e Ranking estão **abertos**. Mostre o cadeado só na variação "Portão fechado" do seletor de estado dessas telas.
- **Rodapé da sidebar** (`margin-top: auto`, separado por `border-top: 1px solid var(--line)`, `padding-top: 16px`): bloco "Turma atual". Eyebrow "TURMA ATUAL" (Inter 600 11, `.1em`, `inactive`), nome da matéria Inter 600 14 `text`, legenda "6º ano B · Prof. Helena Duarte" 12 `textSubtle`, link "Trocar turma" Inter 600 13 `accent` (só aparece se o aluno tem mais de uma turma; leva à lista "Escolha sua turma" de `03-trilha.html`). Adaptação web: no app, a escolha de turma é uma tela-portão (`SelecionarTurmaScreen`).
- **Recolhida (1024 a 1279px):** largura 76, só ícones centralizados em botões 44×44, rótulo vira `title`/tooltip, rodapé some, contador vira ponto de 8px no canto do ícone.

### 5.3 Main
- `margin-left: 264px; padding: 108px 40px 60px; position: relative; z-index: 1;`
- **Cabeçalho de página** (padrão V7): flex, `justify-content: space-between`, `align-items: flex-end`, gap 20, `margin-bottom: 28px`, com `flex-wrap`. Esquerda: eyebrow + H1 + subtítulo. Direita: ações da página (botões/seletor) alinhadas ao pé do bloco.
- Pilha de seções: gap 24. Grades internas: gap 20.

### 5.4 Fundo atmosférico (todas as telas)
Camada `position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: .5`, com:
```
radial-gradient(ellipse 900px 500px at 75% 10%, <accent a 10%>, transparent 60%),
repeating-linear-gradient(115deg, rgba(255,255,255,.012) 0 1px, transparent 1px 90px)
```
**Cenário por contexto (específico do aluno):** Trilha usa `trail-<perfil>.webp`, Ranking usa `arena-<perfil>.webp` e Perfil usa `world-<perfil>.webp`. Entra como **faixa de cabeçalho** de 280px de altura atrás do cabeçalho da página, `object-fit: cover`, `opacity: .35`, com máscara `linear-gradient(to bottom, #000 0%, #000 40%, transparent 100%)`. Nunca atrás de tabela, formulário ou texto de leitura.

## 6. Seletor de pré-visualização (só protótipo, padrão V7)

Primeira coisa dentro do `main`, `margin-bottom: 20px`:
- Pílula `inline-flex`, gap 6, `padding: 6px`, fundo `surface`, `1px solid var(--line)`, raio 999, fonte 11.
- Rótulo "Pré-visualização de estado:" `textSubtle`, `padding: 0 8px`.
- Opções (`padding: 6px 12px`, raio 999, Inter 600 11): ativa = fundo `accent` + texto `background`; inativa = `textSubtle`. As opções de cada tela estão no prompt da tela; a padrão é sempre **"Com dados"**.
- À direita, separado por 12px, **seletor de perfil**: rótulo "Perfil:" e 7 bolinhas 18×18 com a cor-assinatura, borda `2px solid transparent` (ativa = `2px solid text`). Trocar o perfil troca todos os tokens da §2.1 **e** as regras dependentes de perfil (modo da trilha, chat, timer, batalha, guardião). Só nas telas autenticadas.
- Implementação: estado em JS puro, tokens como CSS custom properties no `:root`, reaplicados ao trocar.

## 7. Componentes

### 7.1 Botões (altura 44, raio 999, `padding: 12px 22px`, ícone 16px à esquerda com gap 8)
| Variante | Fundo | Texto | Borda | Hover | Uso |
|---|---|---|---|---|---|
| Primário | `accent` | `background`, 700 | — | L do accent +6% | uma ação principal por área |
| Secundário | transparente | `text`, 600 | `1px solid border` | fundo `surfaceElevated` | ações neutras |
| Fantasma | transparente | `accent`, 600 | — | fundo `accentMuted` | links de ação ("Trocar turma", "Ver tudo") |
| Destrutivo contorno | transparente | `danger-text`, 600 | `1px solid danger-border` | fundo `danger-bg` | abrir confirmação destrutiva |
| Destrutivo sólido | `danger` | `#2a0d0d`, 700 | — | L −6% | confirmar dentro do modal destrutivo |

- Pequeno: altura 34, `padding: 8px 14px`, fonte 13. Ícone-botão: 40×40 circular, ícone 18.
- Desabilitado: opacidade .45, `cursor: not-allowed`, sem hover. Carregando: rótulo troca pelo gerúndio real ("Entrando...", "Enviando...", "Salvando...") com spinner 14px à esquerda. Largura travada para não pular.
- Pressionado: `transform: scale(.98)`. Transições de 140ms.

### 7.2 Inputs
- Altura 46, `padding: 12px 15px`, raio 14, fundo `surfaceElevated`, `1px solid border`, texto Inter 14 `text`, placeholder `inactive`.
- Rótulo acima: Inter 600 13 `text`, `margin-bottom: 8px`. Ajuda abaixo: 12 `textSubtle`, `margin-top: 6px`.
- Foco: borda `accent` + `box-shadow: 0 0 0 3px accentSoft`.
- Erro: borda `danger` + mensagem 12 `danger-text` com ícone de alerta 14 (gap 6).
- Campo de busca: ícone lupa 16 `textSubtle` à esquerda (`padding-left: 42px`), botão "Limpar busca" (X 14) à direita quando há texto.
- Campo de senha: botão olho 18 à direita (`aria-label` "Mostrar senha" / "Ocultar senha").

### 7.3 Toggle (padrão V7)
Trilho 44×24, raio 999. Desligado: fundo `surfaceElevated`, `1px solid border`, bolinha 18 `textSubtle` a 3px da esquerda. Ligado: fundo `accent`, bolinha 18 `background` a 3px da direita. Transição 160ms. Sempre com rótulo textual ao lado ("Ativo" / "Desativado", Inter 600 12) e `role="switch"` + `aria-checked`.

### 7.4 Abas e segmentados
- **Abas de seção** (trocam o conteúdo da página): container `padding: 4px`, gap 4, fundo `surface`, `1px solid var(--line)`, raio 999. Opção `padding: 8px 18px`, Inter 600 13.5, raio 999. Ativa: fundo `accent`, texto `background`. Inativa: `textSubtle`. Com contador: `margin-left: 8px`, pílula `padding: 1px 7px`, 11/700 (ativa: fundo `background` a 25% e texto `background`; inativa: fundo `surfaceElevated` e texto `textMuted`).
- **Filtros segmentados** (só filtram a lista): mesmo container. Opção `padding: 7px 15px`, 13/600. Ativa: fundo `surfaceElevated`, texto `text`. Inativa: `textSubtle`.

### 7.5 Chips e badges
`padding: 4px 10px`, raio 999, Inter 600 11.5, ícone 12 opcional (gap 5).
- accent: fundo `accentMuted`, texto `accent`, borda `1px solid accentSoft`.
- neutro: fundo `surfaceElevated`, texto `textMuted`.
- success / warning / info / danger: fundo `*-bg`, texto na cor (danger usa `danger-text`), sempre com ícone.
- Chip de perfil BrainHex de **outro** aluno (ranking, social): ponto 8px na cor-assinatura daquele perfil + nome do perfil em `textMuted`. **Nunca** pinte o chip inteiro com a cor de outro perfil: a tela tem o tema de quem olha.

### 7.6 Card, KPI e lista
- **Card:** fundo `surface`, `1px solid var(--line)`, raio 20, `padding: 24px 26px`. Cabeçalho do card: H2 à esquerda, ação fantasma/secundária pequena à direita, `margin-bottom: 18px`.
- **KPI** (padrão V7 "ícone fixo no canto"): card de altura 150, ícone 20 em quadrado 40×40 raio 12 fundo `accentMuted` no **canto superior direito**. Rótulo (Inter 500 13 `textSubtle`) no topo à esquerda, valor + unidade 12px abaixo, legenda 12 `textSubtle` no pé. Barra opcional de 6px no pé, trilho `background`, preenchimento `accent`.
- **Linha de lista:** altura mínima 64, `padding: 14px 16px`, raio 16, gap 14 entre avatar/ícone e texto. Hover: fundo `surfaceElevated`. Separadas por 8px de espaço, sem linha.
- **Tabela** (V7): cabeçalho em faixa `surfaceElevated`, `padding: 11px 24px`, estilo "cabeçalho de tabela". Linhas `padding: 13px 24px`, separadas por `border-top: 1px solid var(--line)`. Números à direita.

### 7.7 Modal (padrão V7)
- Camada: `position: fixed; inset: 0; z-index: 60; background: rgba(5,3,10,.8); backdrop-filter: blur(6px); padding: 32px;` conteúdo centralizado.
- Caixa: largura máx. 520 (P), 720 (M) ou 960 (G). Raio 20, fundo `surface`, `1px solid var(--line)` (destrutivo: `1px solid danger-border`), sombra flutuante, `overflow: hidden`.
- Cabeçalho `padding: 22px 26px 18px`, `border-bottom: 1px solid var(--line)`: ícone em círculo 32 (fundo `accentMuted`; destrutivo: `rgba(224,87,76,.18)` + borda `danger-border`) → título de modal → botão fechar 30×30 circular fundo `surfaceElevated` com X 14 `textMuted` (`margin-left: auto`, `aria-label="Fechar"`).
- Corpo `padding: 22px 26px 24px`. Rodapé de ações: flex, gap 12, `margin-top: 18px`, botão de **manter/cancelar primeiro** (secundário) e o de confirmar depois.
- Fecha com Esc e clique fora (exceto modal destrutivo, que só fecha pelos botões). Foco preso dentro, foco inicial no botão seguro.

### 7.8 Portões: modal "bloqueado" e cerimônia de liberação (`DesbloqueioModal`, `utils/portoes.ts`)
Modal P, conteúdo centralizado, ilustração/emblema 72×72 no topo (`assets/emblem-<perfil>.png`), título Cinzel 700 20 em `accent`, corpo 14/1.6 `textMuted`, um botão primário largo (100% da caixa).
- **Bloqueado** (clique na aba fechada). Título: "Amizades liberadas indisponível" (Social) ou "Ranking liberado indisponível" (Ranking), que é o texto que o app monta (`${titulo} indisponível`). Corpo: "Conclua seu primeiro conteúdo para liberar." (Social) / "Conclua o primeiro bloco de conteúdo para liberar." (Ranking). Botão: "Fechar". O ícone é um cadeado sobre o emblema.
- **Cerimônia** (aparece uma vez, quando o portão abre). Título: "Amizades liberadas" / "Ranking liberado". Corpo (promessa):
  - Social: "Agora você pode se conectar com colegas da turma e acompanhar o avanço de quem você escolher."
  - Ranking: "Sua posição na turma já estava sendo contada desde o começo. Agora ela aparece — e você chega nela com os pontos que já fez."
  Abaixo, lista de 3 passos (cada um com check 14 `accent`, texto Inter 500 13/1.45 `textMuted`, gap 10, bloco com fundo `surfaceElevated` raio 14 `padding: 14px 16px`):
  - Social: "Envie um convite para um colega da turma." · "A amizade só existe quando os dois aceitam." · "Você pode desfazer ou bloquear quando quiser."
  - Ranking: "A aba Ranking mostra as primeiras posições da turma." · "Sua posição aparece sempre, mesmo fora do topo." · "Estudar é o que move o ranking — presença e atividades contam."
  Botão: "Entendi". Brilho de destaque (§4) no emblema.

### 7.8b Nó bloqueado (`LockedNodeModal`, `utils/lockedNodeMessage.ts`)
Modal P centralizado. Eyebrow "CONTEÚDO SELADO" (`accent`). Título Cinzel 700 20 `text`: "<título do tópico> está bloqueado". Corpo 14 `textSubtle`: "Conclua os módulos anteriores para liberar este conteúdo." Bloco de requisito (cadeado 16 + texto Inter 500 13 `text`, fundo `surfaceElevated`, raio 14, `padding: 12px 14px`): "Pré-requisitos: <tópico A> e <tópico B>." Sem pré-requisito cadastrado: corpo "Este conteúdo ainda não foi liberado para a sua jornada." e requisito "Continue avançando na trilha para desbloqueá-lo." Botão primário "Entendi" (o app escreve "ENTENDI" em caixa alta; na web, caixa normal).

### 7.9 Estados: carregando, vazio, erro, toast
- **Carregando (esqueleto):** blocos com a forma e o raio do conteúdo real, `background: linear-gradient(90deg, surface 0%, <surfaceElevated +4% L> 50%, surface 100%); background-size: 600px 100%; animation: shimmer 1.4s linear infinite;` com atraso escalonado de .15s. Abaixo, faixa de mensagem: flex centralizado, gap 12, `padding: 18px`, raio 16, `1px dashed var(--line)`, texto 14 `textSubtle`, ícone estrela 18 `accent` pulsando (opacidade .55↔1, 1.3s). O texto é o do app (cada prompt de tela diz qual).
- **Vazio:** card centralizado, `padding: 80px 40px`, gap 16, ícone linear 46 (traço 1.4) `textSubtle`, título de estado vazio, corpo 15/1.6 `textSubtle` com largura máx. 480, até 2 botões (primário + secundário) com gap 12. Textos reais em cada prompt.
- **Erro:** card flex, gap 20, `padding: 30px`, raio 20, fundo `danger-bg`, `1px solid danger-border`. Ícone em círculo 40 fundo `rgba(224,87,76,.18)` com alerta 18 `danger-text`. Título Inter 700 16 `text`, corpo 14/1.6 `danger-body`, botão secundário "Tentar novamente" com ícone de recarregar (borda `danger-border`). Nunca mostrar mensagem técnica crua (código, stack, nome de tabela).
- **Toast** (`ToastContainer` do app): `position: fixed; bottom: 28px;` centralizado na área do main. Largura 360–480, raio 14, fundo `surfaceElevated`, `1px solid border`, barra de 4px à esquerda na cor semântica, ícone 18, título Inter 700 14 `text`, corpo 13 `textMuted`. Some em 4s. `role="status"` (erro: `role="alert"`).

### 7.10 Guardião do perfil (substitui o "Escriba" do V7)
Cada perfil tem um guardião: Amara (Seeker), Kenji (Survivor), Ember (Daredevil), Idris (Mastermind), Amina (Conqueror), Mateo e Zuri juntos (Socializer), Kwame (Achiever). Retrato: `assets/rosto-<perfil>.png`, corpo inteiro: `assets/guardiao-<perfil>.png`.

Dois recursos **diferentes**, não confundir:
1. **Guia (todos os perfis):** botão "?" do cabeçalho da Trilha e do Tópico (`ModuleHeaderGuideButton`). Abre um passo a passo (popover ancorado, largura 360) que explica os elementos da tela: título "Guia tutorial da trilha" ou "Guia tutorial do módulo", texto, botões "Voltar" / "Próximo" / "Pular".
2. **Mentor de IA (`IAMentorPanel`, recurso `mentor_character`, ligado por padrão para os 7 perfis):** botão flutuante no canto, **no lugar do Escriba do V7**, na Trilha e no Tópico: `position: fixed; right: 32px; bottom: 28px;` círculo 56, fundo `linear-gradient(135deg, accent, accentStrong)`, sombra flutuante, com o retrato do guardião 44×44 dentro (o avatar é sempre o guardião do perfil). Painel acima (`bottom: 70px`), largura 380, altura máx. `min(76vh, 620px)`, raio 20, fundo `surface`, `1px solid var(--line)`, sombra.
   - Cabeçalho: `padding: 16px 18px`, `border-bottom: 1px solid var(--line)`, faixa de 3px `accent` no topo, retrato 34. Título Cinzel 700 14 `text`: "**Amina na trilha**" (na Trilha) ou "**Amina no módulo**" (no Tópico), com o nome do guardião do perfil. Legenda 11 `textSubtle`: nome de quem fala.
   - **Quem fala depende do perfil** (`inferProfileDefaultPatches` em `mobile/src/context/IAContext.tsx`):
     - Seeker e Socializer (`CHAT_PROFILES`): fala como o guardião (ex.: "Amara"), com prioridade maior. Mensagem de abertura do Socializer: "Vou priorizar a conversa para explicar personalização, progresso e estratégia sem entregar respostas." Seeker: "Estou acompanhando você. Se travar, eu apareço com uma dica."
     - Os outros 5 (inclui o Conqueror do protótipo): quem fala é "**Guia**", mensagem "Estou acompanhando você. Se travar, eu apareço com uma dica."
   - Corpo: balões (de quem fala: fundo `surfaceElevated`, raio `14px 14px 14px 4px`; do aluno: fundo `accentMuted`, raio `14px 14px 4px 14px`, alinhado à direita), 13/1.5, altura máx. das mensagens `min(42vh, 360px)`. Chips de atalho "Personalização" e "Métricas" (chip neutro).
   - Aviso fixo acima do campo, 11.5 `textSubtle`: "Eu posso orientar, resumir métricas e explicar a personalização, mas não entrego respostas de atividades."
   - Campo pílula (fundo `background`, placeholder "Pergunte sobre a trilha, métricas ou personalização"; no Tópico, "Responda ao guia ou pergunte sobre este módulo") + botão enviar 32 circular `accent` (`aria-label="Enviar mensagem"`).
   - Menu do cabeçalho: "Silenciar guia". Silenciado, o botão flutuante vira pílula compacta "Reativar guia".
   - **Dica proativa (cue):** quando existe módulo personalizado com justificativa, o mentor abre sozinho um balão curto acima do botão (largura 300, mesmo estilo de balão), com o título do tópico e a justificativa (ou "Eu adaptei um módulo para combinar melhor com seu perfil. Se quiser, eu explico essa decisão.") e o botão fantasma "Conversar". Fecha com X.
   - Erro de resposta: balão com borda `danger-border` e texto "Estou aqui para conversar com você sobre personalização, métricas e estratégia de estudo, mas falhei ao responder agora."

### 7.11 Nó da trilha (hexágono)
64×64, recorte hexagonal (§4), ícone 26 central. Anel = `box-shadow: 0 0 0 3px background, 0 0 0 4px <cor do anel>`. Rótulo abaixo (gap 8): Inter 600 13 `text`, centralizado, largura máx. 132, até 2 linhas. Sub-rótulo 11.5 `textSubtle`.
| Estado | Fundo do hexágono | Ícone | Anel | Rótulo |
|---|---|---|---|---|
| concluído | `linear-gradient(160deg, accent, accentStrong)` | check `background` | `borderStrong` | `text` |
| atual ("Você parou aqui") | `surfaceElevated` | relógio/play `accent` | `accent` + brilho `0 0 24px 4px accentSoft`, pulso 2.4s | `text` + sub-rótulo "Continuar" em `accent` |
| disponível | `surface` | play `textMuted` | `borderStrong` | `text` |
| bloqueado | `rgba(255,255,255,.04)` | cadeado `inactive` | `border` | `textSubtle`, `cursor: help` |

Hover (exceto bloqueado): `transform: translateY(-2px)` e anel `accent`. Clique no bloqueado abre `LockedNodeModal` (explicação, não navega).

### 7.12 Barra de progresso da trilha (`GameHeader`)
Trilho altura 8, raio 999, fundo `background`, `1px solid var(--line)`. Preenchimento `linear-gradient(90deg, accentStrong, accent)`. Rótulo à direita (gap 12): "56% concluído" Inter 600 13 `textMuted`. Se o progresso veio do cache e ainda não sincronizou: chip warning "progresso desatualizado" ao lado.

## 8. Regras gerais

1. **Texto real, sempre.** Os textos entre aspas nos prompts de tela saem do código do app. Não reescreva. Onde o app diz "Toque", a web diz "Clique" (única adaptação de texto permitida, sempre marcada no prompt).
2. **Dados fictícios coerentes, iguais em todas as telas:** aluna "Lívia Moraes" (apelido "livi"), perfil dominante Conqueror (afinidade 78%), 2º perfil representativo Achiever (64%). Turma "Matemática · 6º ano B", professora "Prof. Helena Duarte", instituição "Ulbra", 28 alunos. Trilha com 8 tópicos, 4 concluídos, **56% concluída**, tópico atual "5. Equações do 1º grau" (lista completa em `telas/03-trilha.md`). Pontos da aluna: 1.240. 3ª posição no ranking de Pontos.
3. **Tema de quem olha:** os dados de outros alunos (ranking, social) nunca mudam o tema da tela.
4. **Nada de mensagem técnica ao aluno.** Erro diz o que aconteceu e o que fazer.
5. **Acessibilidade:** todo ícone-botão com `aria-label`; foco visível em tudo que é clicável; alvos ≥ 40×40; nenhuma informação só por cor; `lang="pt-BR"` e `translate="no"` no `<html>` (a tradução do navegador quebra o React).
6. **Arquivos:** um `.html` por tela, CSS em `<style>` no próprio arquivo, JS puro no fim do `<body>`, UTF-8 sem BOM. Links entre telas por caminho relativo (`05-ranking.html`).
7. **Não copie do V7** o que é do professor: Escriba (bronze), gráficos coral, filtros de turma, textos de turma/matrícula.

Confirme que entendeu respondendo só com a lista de tokens do Conqueror e a ordem dos itens da sidebar. Depois eu mando a primeira tela.
