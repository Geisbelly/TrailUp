# Paleta de cores — TrailUp (console do professor)

Extraído direto de `frontend/tailwind.config.ts` e `frontend/src/index.css`. Não é uma paleta nova — é a que já está em produção. Use como ponto de partida fiel; o objetivo do redesign é melhorar hierarquia, espaçamento e clareza, não reinventar a identidade visual.

## Conceito

Tema único (não tem modo claro) — "místico medieval": grimório + violeta arcano. O `--primary` foi calibrado por amostragem direta dos pixels do logo oficial (`trailup-logo.png`), não é uma cor escolhida arbitrariamente. Não existe dourado no sistema base (removido de propósito — não representa a identidade real do app). Os 7 perfis BrainHex têm cores próprias e não devem ser confundidos com os tokens do tema base.

## Tokens do tema (HSL)

| Token | HSL | Hex aprox. | Uso |
|---|---|---|---|
| `--background` | `225 32% 8%` | `#0e1016` | fundo geral, bem escuro |
| `--foreground` | `40 20% 94%` | `#f0ece4` | texto principal |
| `--card` | `226 28% 12%` | `#181b26` | fundo de cards |
| `--card-foreground` | `40 20% 94%` | `#f0ece4` | texto em cards |
| `--popover` | `225 32% 7%` | `#0c0e13` | fundo de popovers/dropdowns |
| `--primary` | `266 95% 66%` | `#a95cf5` | violeta do logo — cor de marca principal |
| `--primary-foreground` | `266 30% 10%` | `#1c1522` | texto sobre `--primary` |
| `--primary-light` | `266 90% 77%` | `#c496f9` | faceta clara do logo — gradientes, links, texto sobre fundo escuro |
| `--primary-dark` | `265 65% 50%` | `#6b35d1` | faceta escura do logo — gradientes |
| `--secondary` | `25 35% 26%` | `#5a4331` | bronze/cobre escuro, secundário |
| `--secondary-foreground` | `40 20% 94%` | `#f0ece4` | texto sobre `--secondary` |
| `--muted` | `226 20% 20%` | `#292d3d` | fundos neutros discretos (chips, code) |
| `--muted-foreground` | `230 10% 72%` | `#b0b0bd` | texto secundário |
| `--accent` | `239 84% 67%` | `#5b64ee` | indigo arcano — par frio complementar ao violeta |
| `--accent-foreground` | `226 30% 10%` | `#151621` | texto sobre `--accent` |
| `--destructive` | `0 70% 55%` | `#dc3d3d` | ações destrutivas, erro |
| `--destructive-foreground` | `40 20% 94%` | `#f0ece4` | texto sobre `--destructive` |
| `--border` | `226 20% 22%` | `#2d3142` | bordas |
| `--input` | `226 22% 16%` | `#1e212e` | fundo de input |
| `--ring` | `266 95% 66%` | `#a95cf5` | anel de foco (igual ao primary) |
| `--success` | `142 65% 50%` | `#2bc46a` | fixo — não deriva do primary/accent |
| `--warning` | `45 90% 58%` | `#eec034` | fixo |
| `--info` | `205 70% 58%` | `#4a9edb` | fixo |
| `--badge-bg` | `25 35% 22%` | `#4d3a2a` | fundo de badge hexagonal |
| `--badge-border` | `266 95% 66%` | `#a95cf5` | borda de badge hexagonal |

`--radius: 1.25rem` — cantos bem arredondados em todo o app (cards, botões, inputs).

**Regra importante herdada do app mobile:** ao ajustar contraste, sempre elevar a **luminosidade HSL** da cor (nunca misturar com branco) — misturar com branco desatura e "apaga" a cor. `--primary-light` é exatamente isso: o mesmo hue/saturação do `--primary`, luminosidade maior.

## As 7 cores dos perfis BrainHex

Fonte oficial: `microservice/src/constants/brainHex.ts`. Estas cores **não fazem parte do tema base** — aparecem especificamente onde o perfil de um aluno é mostrado (dashboard, personalizações, trilha visual do aluno).

| Perfil | Hex | Onde aparece hoje |
|---|---|---|
| Seeker (Buscador) | `#17a398` (teal) | perfil dominante do aluno |
| Survivor (Sobrevivente) | `#4e5a66` (slate) | idem |
| Daredevil (Aventureiro) | `#d7263d` (vermelho) | idem |
| Mastermind (Estrategista) | `#5b3fd9` (roxo) | idem |
| Conqueror (Conquistador) | `#1e4fd6` (azul) | idem |
| Socializer (Socializador) | `#f4623a` (laranja) | idem |
| Achiever (Realizador) | `#c9a227` (dourado/mostarda) | idem |

> Nota: `StudentTrailVisualization.tsx` usa uma segunda variante dessas cores em HSL, ligeiramente diferente (ex. Achiever aparece como verde `hsl(142 76% 36%)` ali, não dourado). É uma divergência real no código atual — ao redesenhar, escolha **uma fonte de verdade** (recomendo a tabela acima, que é a oficial) e aplique consistente nas duas telas.

## Tipografia

- **Corpo de texto:** Inter (400/500/600/700/800)
- **Títulos (h1–h4):** Cinzel (500/600/700/800) — serif ornamental, ecoa a identidade "grimório medieval" também usada no app mobile
- Carregadas via Google Fonts (`index.html`)

## Efeitos e utilitários já existentes

- `.glow-primary` / `.glow-secondary` — box-shadow duplo (halo) nas cores primary/accent
- `.gradient-primary` — `linear-gradient(135deg, --primary-dark, --primary-light)`
- `.gradient-card` — `linear-gradient(135deg, --card, --muted)`
- `.hexagon-clip` — clip-path hexagonal (usado nos badges de conquista e nos nós da trilha visual)
- Animações: `animate-float`, `animate-glow`, `animate-ember` (fagulhas subindo, usado no Hero), `animate-pulse-slow`
- Entrada de conteúdo: classes `.reveal` / `.reveal-in`, `.reveal-scale` / `.reveal-scale-in`, `.fade-up-in`, `.fade-scale-in` (fade + slide/scale ao montar ou entrar na viewport — substituem framer-motion)

## Biblioteca de componentes

shadcn/ui (Radix + Tailwind) — Card, Dialog, Tabs, Badge, Progress, Select, Switch, Alert, etc. já usados em todo o console. Gráficos com **Recharts** (Bar, Pie, Line — hoje só no Dashboard). Ícones: **lucide-react**.
