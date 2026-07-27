# Nova Paleta BrainHex (Psicologia das Cores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a cor-assinatura oficial dos 7 perfis BrainHex (e todos os tons derivados dela) em todo o sistema — microservice, api, frontend, mobile, incluindo a arte dos guardiões — pela paleta definida em `docs/tcc/12-psicologia-das-cores-perfis.md`.

**Architecture:** `microservice/src/constants/brainHex.ts` é a fonte oficial; 8 arquivos de código espelham o hex puro ou uma variação calculada dele (fórmula já usada no código: `secondary = darken(primary, 0.35)`, `accent/destaque = blend(primary, white, 0.55)`, `background = darken(primary, 0.90)`). Depois de propagar o hex, a arte dos 7 guardiões (webp/png em frontend e mobile) é recolorida via hue-shift cirúrgico (`sharp`) para bater com a nova cor.

**Tech Stack:** Python (api), TypeScript (microservice/frontend/mobile), Node + `sharp` (script de recoloração de imagem, isolado em `scripts/guardian-recolor/`, sem virar dependência do microservice).

Spec completa: `docs/superpowers/specs/2026-07-26-paleta-brainhex-psicologia-cores-design.md`.

---

## Paleta de referência (usada em todas as tasks)

| Perfil | Novo hex (primary) | secondary | accent/destaque | background |
|---|---|---|---|---|
| mastermind | `#5B3FD9` | `#3B298D` | `#B5A9EE` | `#090616` |
| achiever | `#C9A227` | `#836919` | `#E7D59E` | `#141004` |
| seeker | `#17A398` | `#0F6A63` | `#97D6D1` | `#02100F` |
| survivor | `#4E5A66` | `#333A42` | `#AFB5BA` | `#08090A` |
| conqueror | `#1E4FD6` | `#14338B` | `#9AB0ED` | `#030815` |
| socializer | `#F4623A` | `#9F4026` | `#FAB8A6` | `#180A06` |
| daredevil | `#D7263D` | `#8C1928` | `#ED9DA8` | `#160406` |

`secondary`/`accent`/`background` foram calculados com a mesma fórmula que já produziu os valores antigos (verificado por engenharia reversa contra os hex atuais do repo): `secondary = primary * 0.65` (RGB), `accent = primary + (255-primary) * 0.55`, `background = primary * 0.10`, tudo arredondado.

---

## Task 1: Atualizar a fonte oficial — `microservice/src/constants/brainHex.ts`

**Files:**
- Modify: `microservice/src/constants/brainHex.ts:41-104`

- [ ] **Step 1: Substituir `color` e `gradient` de cada perfil**

Trocar cada bloco pelos novos valores (mantendo `icon`, `iconFocus`, `label`, `guideName`, `description`, `secondaryGuideName` intactos):

```ts
export const BRAIN_HEX_CONFIG: Record<BrainHexProfile, BrainHexConfig> = {
  seeker: {
    color: "#17a398",
    icon: Map,
    iconFocus: Telescope,
    label: "Explorador",
    guideName: "Amara",
    gradient: "from-teal-900/40 to-black",
    description: "Ama descobrir novos caminhos e segredos escondidos.",
  },
  survivor: {
    color: "#4e5a66",
    icon: Shield,
    iconFocus: Crosshair,
    label: "Sobrevivente",
    guideName: "Kenji",
    gradient: "from-slate-800/40 to-black",
    description: "Foca em superar desafios e proteger o que conquistou.",
  },
  daredevil: {
    color: "#d7263d",
    icon: Sword,
    iconFocus: Skull,
    label: "Aventureiro",
    guideName: "Ember",
    gradient: "from-red-900/40 to-black",
    description: "Vive pela adrenalina e riscos calculados.",
  },
  mastermind: {
    color: "#5b3fd9",
    icon: Compass,
    iconFocus: Brain,
    label: "Estrategista",
    guideName: "Idris",
    gradient: "from-indigo-900/40 to-black",
    description: "Resolve problemas complexos com lógica e sabedoria.",
  },
  conqueror: {
    color: "#1e4fd6",
    icon: Crown,
    iconFocus: ChevronRight,
    label: "Conquistador",
    guideName: "Amina",
    gradient: "from-blue-900/40 to-black",
    description: "Busca poder, influência e vitórias gloriosas.",
  },
  socializer: {
    color: "#f4623a",
    icon: Drama,
    iconFocus: Gem,
    label: "Socializador",
    guideName: "Mateo",
    gradient: "from-orange-900/40 to-black",
    description: "Valoriza conexões e histórias compartilhadas.",
    secondaryGuideName: "Zuri",
  },
  achiever: {
    color: "#c9a227",
    icon: Box,
    iconFocus: Gem,
    label: "Realizador",
    guideName: "Kwame",
    gradient: "from-amber-900/40 to-black",
    description: "Adora completar coleções e atingir metas.",
  },
};
```

- [ ] **Step 2: Verificar que não sobrou hex antigo no arquivo**

Run: `grep -in "720101\|1b6b1b\|707c88\|01808b\|6d15be\|ad6002\|a78c07" microservice/src/constants/brainHex.ts`
Expected: sem saída (nenhum match).

- [ ] **Step 3: Commit**

```bash
git add microservice/src/constants/brainHex.ts
git commit -m "feat(microservice): nova paleta oficial BrainHex baseada em psicologia das cores"
```

---

## Task 2: Atualizar `microservice/src/index.css` (gradiente do logo)

**Files:**
- Modify: `microservice/src/index.css:103`

- [ ] **Step 1: Trocar o hex do Mastermind no gradiente**

Antes:
```css
.logo-gradient {
  background: linear-gradient(135deg, #fff 0%, #707c88 100%);
```

Depois:
```css
.logo-gradient {
  background: linear-gradient(135deg, #fff 0%, #5b3fd9 100%);
```

- [ ] **Step 2: Commit**

```bash
git add microservice/src/index.css
git commit -m "feat(microservice): atualiza gradiente do logo para novo indigo do Mastermind"
```

---

## Task 3: Atualizar `api/app/api/v1/personalizacao.py` (`_PROFILE_COLOR_MAP`)

**Files:**
- Modify: `api/app/api/v1/personalizacao.py:77-86`

- [ ] **Step 1: Substituir o mapa**

```python
_PROFILE_COLOR_MAP: dict[str, str] = {
    "seeker": "#17a398",
    "survivor": "#4e5a66",
    "daredevil": "#d7263d",
    "mastermind": "#5b3fd9",
    "conqueror": "#1e4fd6",
    "socializer": "#f4623a",
    "socialiser": "#f4623a",
    "achiever": "#c9a227",
}
```

- [ ] **Step 2: Commit**

```bash
git add api/app/api/v1/personalizacao.py
git commit -m "feat(api): atualiza _PROFILE_COLOR_MAP com nova paleta BrainHex"
```

---

## Task 4: Atualizar `api/app/services/personalizacao.py`

**Files:**
- Modify: `api/app/services/personalizacao.py:106-141` (`_PROFILE_VISUAL_REFERENCES`)
- Modify: `api/app/services/personalizacao.py:223-275` (`_BRAINHEX_GUIDE_PERSONAS`, campo `guia_cor`)

- [ ] **Step 1: Substituir `cores` em `_PROFILE_VISUAL_REFERENCES`**

```python
_PROFILE_VISUAL_REFERENCES: dict[str, dict[str, Any]] = {
    "Seeker": {
        "cores": {"primaria": "#17A398", "secundaria": "#0F6A63", "destaque": "#97D6D1"},
        "icone": "rosa_dos_ventos",
        "imagem": "rosa_dos_ventos_filter.png",
    },
    "Survivor": {
        "cores": {"primaria": "#4E5A66", "secundaria": "#333A42", "destaque": "#AFB5BA"},
        "icone": "cacador",
        "imagem": "cacador_filter.png",
    },
    "Daredevil": {
        "cores": {"primaria": "#D7263D", "secundaria": "#8C1928", "destaque": "#ED9DA8"},
        "icone": "espada",
        "imagem": "espada_filter.png",
    },
    "Mastermind": {
        "cores": {"primaria": "#5B3FD9", "secundaria": "#3B298D", "destaque": "#B5A9EE"},
        "icone": "coruja",
        "imagem": "coruja_filter.png",
    },
    "Conqueror": {
        "cores": {"primaria": "#1E4FD6", "secundaria": "#14338B", "destaque": "#9AB0ED"},
        "icone": "coroa",
        "imagem": "coroa_filter.png",
    },
    "Socialiser": {
        "cores": {"primaria": "#F4623A", "secundaria": "#9F4026", "destaque": "#FAB8A6"},
        "icone": "coracao",
        "imagem": "coracao_filter.png",
    },
    "Achiever": {
        "cores": {"primaria": "#C9A227", "secundaria": "#836919", "destaque": "#E7D59E"},
        "icone": "arte",
        "imagem": "arte_filter.png",
    },
}
```

- [ ] **Step 2: Substituir `guia_cor` em `_BRAINHEX_GUIDE_PERSONAS`**

Trocar cada valor `guia_cor` mantendo os demais campos (`guia_nome`, `guia_voz`, `framing_narrativo`, e os campos secundários do Socialiser) intactos:

```python
    "Mastermind": {
        "guia_nome": "Idris",
        "guia_voz": "Charon",
        "guia_cor": "#5b3fd9",
        "framing_narrativo": "Arquitetura do Conceito",
    },
    "Seeker": {
        "guia_nome": "Amara",
        "guia_voz": "Puck",
        "guia_cor": "#17a398",
        "framing_narrativo": "Crônicas da Exploração",
    },
    "Survivor": {
        "guia_nome": "Kenji",
        "guia_voz": "Fenrir",
        "guia_cor": "#4e5a66",
        "framing_narrativo": "Diretrizes de Campo",
    },
    "Daredevil": {
        "guia_nome": "Ember",
        "guia_voz": "Zephyr",
        "guia_cor": "#d7263d",
        "framing_narrativo": "Código de Impacto",
    },
    "Conqueror": {
        "guia_nome": "Amina",
        "guia_voz": "Kore",
        "guia_cor": "#1e4fd6",
        "framing_narrativo": "Tratado de Soberania",
    },
    "Socialiser": {
        "guia_nome": "Mateo",
        "guia_voz": "Kore",
        "guia_cor": "#f4623a",
        "framing_narrativo": "Elo da Comunidade",
        "guia_nome_secundario": "Zuri",
        "guia_voz_secundario": "Aoede",
        "guia_relacao_secundaria": (
            "irma gemea de Mateo — cresceram contando e ouvindo juntos as mesmas "
            "historias da comunidade, entao conversam com intimidade e cumplicidade "
            "de quem se conhece a vida toda"
        ),
    },
    "Achiever": {
        "guia_nome": "Kwame",
        "guia_voz": "Puck",
        "guia_cor": "#c9a227",
        "framing_narrativo": "Caminho da Maestria",
    },
```

- [ ] **Step 3: Verificar que a linha 4142 (log de geração) segue usando o default certo**

Run: `grep -n "A78C07" api/app/services/personalizacao.py`
Expected: uma ocorrência na linha ~4142 (`primaria', '#A78C07')`), que é só um fallback de log — trocar manualmente para `'#17A398'` (novo default do Seeker) nessa mesma linha.

- [ ] **Step 4: Commit**

```bash
git add api/app/services/personalizacao.py
git commit -m "feat(api): atualiza cores e guia_cor por perfil na nova paleta BrainHex"
```

---

## Task 5: Atualizar `api/app/services/media_pipeline.py`

**Files:**
- Modify: `api/app/services/media_pipeline.py:26-77`

- [ ] **Step 1: Substituir `_DEFAULT_PROFILE_THEME` e `_PROFILE_THEME_MAP`**

Note: a entrada `"socialiser"` (linhas 65-70) está duplicada da `"socializer"` — nesta troca, mantenha as duas chaves (o código consulta por ambas as grafias) mas com o mesmo hex novo.

```python
_DEFAULT_PROFILE_THEME: dict[str, Any] = {
    "perfil": "Mastermind",
    "cores": {"primaria": "#5B3FD9", "secundaria": "#3B298D", "destaque": "#B5A9EE"},
    "imagem_referencia": "coruja_filter.png",
    "icone_referencia": "coruja",
}

_PROFILE_THEME_MAP: dict[str, dict[str, Any]] = {
    "seeker": {
        "perfil": "Seeker",
        "cores": {"primaria": "#17A398", "secundaria": "#0F6A63", "destaque": "#97D6D1"},
        "imagem_referencia": "rosa_dos_ventos_filter.png",
        "icone_referencia": "rosa_dos_ventos",
    },
    "survivor": {
        "perfil": "Survivor",
        "cores": {"primaria": "#4E5A66", "secundaria": "#333A42", "destaque": "#AFB5BA"},
        "imagem_referencia": "cacador_filter.png",
        "icone_referencia": "cacador",
    },
    "daredevil": {
        "perfil": "Daredevil",
        "cores": {"primaria": "#D7263D", "secundaria": "#8C1928", "destaque": "#ED9DA8"},
        "imagem_referencia": "espada_filter.png",
        "icone_referencia": "espada",
    },
    "mastermind": _DEFAULT_PROFILE_THEME,
    "conqueror": {
        "perfil": "Conqueror",
        "cores": {"primaria": "#1E4FD6", "secundaria": "#14338B", "destaque": "#9AB0ED"},
        "imagem_referencia": "coroa_filter.png",
        "icone_referencia": "coroa",
    },
    "socializer": {
        "perfil": "Socialiser",
        "cores": {"primaria": "#F4623A", "secundaria": "#9F4026", "destaque": "#FAB8A6"},
        "imagem_referencia": "coracao_filter.png",
        "icone_referencia": "coracao",
    },
    "socialiser": {
        "perfil": "Socialiser",
        "cores": {"primaria": "#F4623A", "secundaria": "#9F4026", "destaque": "#FAB8A6"},
        "imagem_referencia": "coracao_filter.png",
        "icone_referencia": "coracao",
    },
    "achiever": {
        "perfil": "Achiever",
        "cores": {"primaria": "#C9A227", "secundaria": "#836919", "destaque": "#E7D59E"},
        "imagem_referencia": "arte_filter.png",
        "icone_referencia": "arte",
    },
}
```

- [ ] **Step 2: Commit**

```bash
git add api/app/services/media_pipeline.py
git commit -m "feat(api): atualiza cores de media_pipeline para nova paleta BrainHex"
```

---

## Task 6: Atualizar `api/app/services/media_agents.py`

**Files:**
- Modify: `api/app/services/media_agents.py:216-222`

- [ ] **Step 1: Substituir o dicionário de perfis**

```python
    "mastermind": {"guia_nome": "Idris",  "guia_voz": "Charon", "guia_cor": "#5b3fd9", "framing": "Arquitetura do Conceito",   "label": "Estrategista"},
    "seeker":     {"guia_nome": "Amara",  "guia_voz": "Puck",   "guia_cor": "#17a398", "framing": "Crônicas da Exploração",    "label": "Explorador"},
    "survivor":   {"guia_nome": "Kenji",  "guia_voz": "Fenrir", "guia_cor": "#4e5a66", "framing": "Diretrizes de Campo",       "label": "Sobrevivente"},
    "daredevil":  {"guia_nome": "Ember",  "guia_voz": "Zephyr", "guia_cor": "#d7263d", "framing": "Código de Impacto",         "label": "Aventureiro"},
    "conqueror":  {"guia_nome": "Amina",  "guia_voz": "Kore",   "guia_cor": "#1e4fd6", "framing": "Tratado de Soberania",      "label": "Conquistador"},
    "socializer": {"guia_nome": "Mateo",  "guia_voz": "Kore",   "guia_cor": "#f4623a", "framing": "Elo da Comunidade",         "label": "Socializador", "guia_nome_secundario": "Zuri", "guia_voz_secundario": "Aoede"},
    "achiever":   {"guia_nome": "Kwame",  "guia_voz": "Puck",   "guia_cor": "#c9a227", "framing": "Caminho da Maestria",       "label": "Realizador"},
```

- [ ] **Step 2: Commit**

```bash
git add api/app/services/media_agents.py
git commit -m "feat(api): atualiza guia_cor em media_agents para nova paleta BrainHex"
```

---

## Task 7: Atualizar `api/app/services/slides_pdf.py`

**Files:**
- Modify: `api/app/services/slides_pdf.py:24-41`

- [ ] **Step 1: Substituir `_PROFILE_ACCENT`**

```python
_PROFILE_ACCENT = {
    "mastermind": "#5b3fd9",
    "seeker":     "#17a398",
    "survivor":   "#4e5a66",
    "daredevil":  "#d7263d",
    "conqueror":  "#1e4fd6",
    "socializer": "#f4623a",
    "achiever":   "#c9a227",
}
```

- [ ] **Step 2: Atualizar o fallback default na função que usa o mapa**

Run: `grep -n '_PROFILE_ACCENT.get' api/app/services/slides_pdf.py`

Trocar o fallback `"#707c88"` (linha ~41) por `"#5b3fd9"`:
```python
    return _hex_to_color(_PROFILE_ACCENT.get(perfil, "#5b3fd9"))
```

- [ ] **Step 3: Commit**

```bash
git add api/app/services/slides_pdf.py
git commit -m "feat(api): atualiza cores de slides_pdf para nova paleta BrainHex"
```

---

## Task 8: Atualizar `mobile/src/constants/profileImages.ts`

**Files:**
- Modify: `mobile/src/constants/profileImages.ts:170-225`

- [ ] **Step 1: Substituir `color` de cada perfil, preservando o formato original de cada linha (`rgb()` ou hex com/sem sufixo `ff`)**

```ts
  seeker: {
    color: "rgb(23, 163, 152)",
    icon: "map", // Mapa do tesouro
    icon_focus: "telescope", // Observação/Exploração
    label: "Explorador",
    imagemIndex: 9,
    image: bannerImages[9],
  },
  survivor: {
    color: "#4e5a66",
    icon: "shield-outline", // Escudo/Defesa
    icon_focus: "sword-cross", // Luta/Sobrevivência
    label: "Sobrevivente",
    imagemIndex: 2,
    image: bannerImages[2],
  },
  daredevil: {
    color: "#d7263d",
    icon: "sword-cross", // Luta/Ação
    icon_focus: "skull", // Velocidade/Risco
    label: "Aventureiro",
    imagemIndex: 7,
    image: bannerImages[7],
  },
  mastermind: {
    color: "#5b3fd9ff",
    icon: "chess-knight", // Estratégia
    icon_focus: "brain", // Intelecto
    label: "Estrategista",
    imagemIndex: 6,
    image: bannerImages[6],
  },
  conqueror: {
    color: "#1e4fd6ff",
    icon: "crown-outline", // Liderança/Vitória
    icon_focus: "fencing", // Força bruta
    label: "Conquistador",
    imagemIndex: 5,
    image: bannerImages[5],
  },
  socializer: {
    color: "rgb(244, 98, 58)",
    icon: "drama-masks", // Comunidade
    icon_focus: "redhat", // Comunicação
    label: "Socializador",
    imagemIndex: 4,
    image: bannerImages[4],
  },
  achiever: {
    color: "rgb(201, 162, 39)",
    icon: "cube-outline", // Conquista clássica
    icon_focus: "diamond-stone", // Tesouro/Riqueza
    label: "Realizador",
    imagemIndex: 1,
    image: bannerImages[1],
  },
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/constants/profileImages.ts
git commit -m "feat(mobile): atualiza cores de perfil BrainHex para nova paleta"
```

---

## Task 9: Atualizar `frontend/src/lib/personalizacao-theme-guide.ts`

**Files:**
- Modify: `frontend/src/lib/personalizacao-theme-guide.ts:16-67`

- [ ] **Step 1: Substituir `palette` de cada `PerfilTema`, mantendo `tom` e `diretrizes` intactos**

```ts
const PERFIS_TEMA: PerfilTema[] = [
  {
    perfil: "Achiever",
    palette: { primary: "#C9A227", secondary: "#836919", accent: "#E7D59E", background: "#141004" },
    tom: "objetivo, progressivo e orientado a metas claras",
    diretrizes: ["Estruturar em checklists.", "Destacar avanco e conclusao.", "Usar linguagem direta."],
  },
  {
    perfil: "Seeker",
    palette: { primary: "#17A398", secondary: "#0F6A63", accent: "#97D6D1", background: "#02100F" },
    tom: "curioso, exploratorio e investigativo",
    diretrizes: [
      "Trazer perguntas de descoberta.",
      "Conectar conceitos com exploracao.",
      "Incluir pistas e desafios progressivos.",
    ],
  },
  {
    perfil: "Mastermind",
    palette: { primary: "#5B3FD9", secondary: "#3B298D", accent: "#B5A9EE", background: "#090616" },
    tom: "analitico, logico e estrategico",
    diretrizes: [
      "Priorizar estrutura conceitual.",
      "Explicar relacoes causa-efeito.",
      "Usar exemplos com decisao tecnica.",
    ],
  },
  {
    perfil: "Conqueror",
    palette: { primary: "#1E4FD6", secondary: "#14338B", accent: "#9AB0ED", background: "#030815" },
    tom: "competitivo, desafiador e focado em performance",
    diretrizes: ["Propor metas comparativas.", "Valorizar precisao e velocidade.", "Usar chamadas de superacao."],
  },
  {
    perfil: "Socializer",
    palette: { primary: "#F4623A", secondary: "#9F4026", accent: "#FAB8A6", background: "#180A06" },
    tom: "colaborativo, acolhedor e dialogico",
    diretrizes: ["Incluir colaboracao e troca.", "Usar exemplos de trabalho em grupo.", "Estimular feedback entre pares."],
  },
  {
    perfil: "Daredevil",
    palette: { primary: "#D7263D", secondary: "#8C1928", accent: "#ED9DA8", background: "#160406" },
    tom: "dinamico, energetico e orientado a acao",
    diretrizes: ["Aplicar cenarios praticos.", "Usar linguagem de execucao.", "Evitar excesso de teoria abstrata."],
  },
  {
    perfil: "Survivor",
    palette: { primary: "#4E5A66", secondary: "#333A42", accent: "#AFB5BA", background: "#08090A" },
    tom: "resiliente, encorajador e focado em superacao",
    diretrizes: ["Quebrar desafios em etapas.", "Reforcar progresso incremental.", "Usar mensagens de persistencia."],
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/personalizacao-theme-guide.ts
git commit -m "feat(frontend): atualiza personalizacao-theme-guide com nova paleta BrainHex"
```

---

## Task 10: Atualizar os testes de `api/tests/test_personalizacao_service.py`

**Files:**
- Modify: `api/tests/test_personalizacao_service.py:78,124,1999-2005`

- [ ] **Step 1: Atualizar as asserções de hex**

Linha ~78:
```python
    assert materiais["documento"]["tema_visual"]["cores"]["primaria"] == "#C9A227"
```

Linha ~124:
```python
    assert materiais["imagem"]["payload"]["tema_visual"]["cores"]["primaria"] == "#17A398"
```

Linhas ~1999-2005:
```python
        ("Seeker", "Amara", "Puck", "#17a398", "Crônicas da Exploração"),
        ("Survivor", "Kenji", "Fenrir", "#4e5a66", "Diretrizes de Campo"),
        ("Daredevil", "Ember", "Zephyr", "#d7263d", "Código de Impacto"),
        ("Mastermind", "Idris", "Charon", "#5b3fd9", "Arquitetura do Conceito"),
        ("Conqueror", "Amina", "Kore", "#1e4fd6", "Tratado de Soberania"),
        ("Socialiser", "Mateo", "Kore", "#f4623a", "Elo da Comunidade"),
        ("Achiever", "Kwame", "Puck", "#c9a227", "Caminho da Maestria"),
```

- [ ] **Step 2: Rodar a suíte de testes de personalização**

Run: `cd api && python -m pytest tests/test_personalizacao_service.py -q`
Expected: todos os testes passam (`passed`, 0 `failed`).

- [ ] **Step 3: Commit**

```bash
git add api/tests/test_personalizacao_service.py
git commit -m "test(api): atualiza asserções de cor para a nova paleta BrainHex"
```

---

## Task 11: Varredura final por hex antigo no código

**Files:** nenhum (task de verificação)

- [ ] **Step 1: Rodar grep de varredura, excluindo docs/ (histórico, não precisa mudar)**

Run:
```bash
grep -rniE "#(720101|1b6b1b|707c88ff?|01808bff?|6d15be|ad6002|a78c07|788490|ec3c04|018e9a|aa60ed|ba863f|fb0202)" \
  --include='*.ts' --include='*.tsx' --include='*.py' --include='*.css' \
  api/ microservice/ frontend/ mobile/
```
Expected: sem saída, EXCETO `frontend/src/features/signup/brainhex.ts` e `frontend/src/components/BrainHexShowcase.tsx` — esses dois são tratados na Task 16 (dependem da arte recolorida).

- [ ] **Step 2: Se sobrar algo fora desses dois arquivos, corrigir manualmente e commitar**

```bash
git add -u
git commit -m "fix: corrige ocorrencia remanescente da paleta antiga"
```
(Só rodar se o Step 1 encontrar algo inesperado.)

---

## Task 12: Preparar o ambiente de recoloração da arte (script `sharp`)

**Files:**
- Create: `scripts/guardian-recolor/package.json`
- Create: `scripts/guardian-recolor/sample-hue.mjs`
- Create: `scripts/guardian-recolor/recolor.mjs`

Contexto: a recoloração anterior (commit `2aff09d`) usou um script `sharp` ad-hoc que não foi commitado. Recriamos a técnica aqui, isolada num pacote próprio (não vira dependência do microservice/frontend/mobile).

- [ ] **Step 1: Criar o pacote isolado**

```json
{
  "name": "guardian-recolor",
  "private": true,
  "type": "module",
  "dependencies": {
    "sharp": "^0.33.5"
  }
}
```

- [ ] **Step 2: Instalar**

Run: `cd scripts/guardian-recolor && npm install`
Expected: instala `sharp` sem erros (o pacote traz binário pré-compilado para Windows x64).

- [ ] **Step 3: Criar o script de amostragem (`sample-hue.mjs`)**

Lê uma imagem, converte cada pixel opaco para HSL e imprime um histograma de matiz (bucket de 10°) só para pixels com saturação >= 25% (ignora tons quase-cinza como pele/sombra neutra) e luminosidade entre 15% e 70% (ignora realces claros/dourados e sombras quase pretas) — isso tende a isolar a região do figurino/manto, que costuma ser a área mais saturada e de luminosidade média da arte.

```js
// scripts/guardian-recolor/sample-hue.mjs
import sharp from "sharp";

const [, , inputPath] = process.argv;
if (!inputPath) {
  console.error("uso: node sample-hue.mjs <caminho-da-imagem>");
  process.exit(1);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const buckets = new Array(36).fill(0);
let sampled = 0;

for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  if (a < 200) continue;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.25 || l < 0.15 || l > 0.70) continue;
  buckets[Math.floor(h / 10) % 36] += 1;
  sampled += 1;
}

console.log(`pixels amostrados (figurino provavel): ${sampled}`);
buckets
  .map((count, idx) => ({ range: `${idx * 10}-${idx * 10 + 10}`, count }))
  .filter((b) => b.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 8)
  .forEach((b) => console.log(`hue ${b.range}: ${b.count} px`));
```

- [ ] **Step 4: Criar o script de recoloração (`recolor.mjs`)**

Rotaciona o matiz de pixels dentro de `[hueMin, hueMax]` (com fallback suave de 5° nas bordas, pra não deixar corte abrupto) e `saturation >= satMin` para `targetHue`; opcionalmente também ajusta a saturação para `targetSat` (necessário pro Survivor, que vai de uma cor saturada pra um cinza-ardósia dessaturado — puro hue-shift não dessatura). Luminosidade não é tocada. Pixels fora da faixa (pele, cabelo, dourado, gemas, sombras/realces) ficam intactos.

```js
// scripts/guardian-recolor/recolor.mjs
import sharp from "sharp";

const [, , inputPath, outputPath, hueMinArg, hueMaxArg, satMinArg, targetHueArg, targetSatArg] = process.argv;
if (!inputPath || !outputPath || !hueMinArg || !hueMaxArg || !satMinArg || !targetHueArg) {
  console.error(
    "uso: node recolor.mjs <in> <out> <hueMin> <hueMax> <satMin0-1> <targetHue> [targetSat0-1]"
  );
  process.exit(1);
}

const hueMin = Number(hueMinArg);
const hueMax = Number(hueMaxArg);
const satMin = Number(satMinArg);
const targetHue = Number(targetHueArg);
const targetSat = targetSatArg !== undefined ? Number(targetSatArg) : null;
const FEATHER_DEG = 5;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hueInRange(h) {
  if (hueMin <= hueMax) return h >= hueMin && h <= hueMax;
  return h >= hueMin || h <= hueMax; // faixa que cruza 0/360
}

function featherWeight(h) {
  if (hueInRange(h)) return 1;
  const distToMin = Math.min(Math.abs(h - hueMin), 360 - Math.abs(h - hueMin));
  const distToMax = Math.min(Math.abs(h - hueMax), 360 - Math.abs(h - hueMax));
  const dist = Math.min(distToMin, distToMax);
  if (dist > FEATHER_DEG) return 0;
  return 1 - dist / FEATHER_DEG;
}

const image = sharp(inputPath).ensureAlpha();
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  if (a < 5) continue;
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < satMin) continue;
  const weight = featherWeight(h);
  if (weight <= 0) continue;

  const newHue = h + (targetHue - h) * weight;
  const newSat = targetSat !== null ? s + (targetSat - s) * weight : s;
  const [nr, ng, nb] = hslToRgb(newHue, newSat, l);
  data[i] = nr;
  data[i + 1] = ng;
  data[i + 2] = nb;
}

await sharp(data, { raw: info }).toFile(outputPath);
console.log(`recolorido: ${outputPath}`);
```

- [ ] **Step 5: Commit**

```bash
git add scripts/guardian-recolor/
git commit -m "chore: adiciona scripts de recoloracao da arte dos guardioes (sharp)"
```

---

## Task 13: Recolorir os 5 guardiões com precedente (seeker, survivor, conqueror, socializer, mastermind)

**Files:**
- Modify (binário): `frontend/src/assets/guardioes/{seeker,survivor,conqueror,socializer,mastermind}.webp`
- Modify (binário): `mobile/src/assets/guardioes/{seeker,survivor,conqueror,socializer,mastermind}.png`

Estes 5 já foram recoloridos com sucesso antes (commit `2aff09d`), então a técnica funciona neles — só muda o `targetHue`/`targetSat`.

- [ ] **Step 1: Amostrar cada personagem para achar a faixa de matiz do figurino**

Run para cada arquivo (frontend primeiro, mobile costuma ter a mesma arte em resolução diferente):
```bash
node scripts/guardian-recolor/sample-hue.mjs frontend/src/assets/guardioes/seeker.webp
node scripts/guardian-recolor/sample-hue.mjs frontend/src/assets/guardioes/survivor.webp
node scripts/guardian-recolor/sample-hue.mjs frontend/src/assets/guardioes/conqueror.webp
node scripts/guardian-recolor/sample-hue.mjs frontend/src/assets/guardioes/socializer.webp
node scripts/guardian-recolor/sample-hue.mjs frontend/src/assets/guardioes/mastermind.webp
```
Expected: cada chamada imprime os buckets de matiz mais frequentes. O bucket dominante (maior contagem) é a faixa do figurino/manto — anotar `hueMin`/`hueMax` (o bucket dominante ± 1 bucket vizinho, se a contagem dele também for alta) e o `satMin` aproximado (pegar o menor `s` observado visualmente plausível; começar com `0.25` e ajustar se o Step 3 pintar áreas demais/de menos).

- [ ] **Step 2: Rodar a recoloração com o novo alvo de matiz de cada perfil**

Valores de `targetHue` (matiz da nova cor oficial, já calculado): seeker `174°` (turquesa `#17A398`), survivor `206°` (ardósia `#4E5A66`), conqueror `228°` (royal `#1E4FD6`), socializer `14°` (coral `#F4623A`), mastermind `254°` (índigo `#5B3FD9`).

Survivor também precisa de `targetSat` (dessaturar, ver Step 1 da Task 12) — usar `0.13` (saturação de `#4E5A66`).

```bash
node scripts/guardian-recolor/recolor.mjs frontend/src/assets/guardioes/seeker.webp     frontend/src/assets/guardioes/seeker.webp     <hueMin> <hueMax> <satMin> 174
node scripts/guardian-recolor/recolor.mjs frontend/src/assets/guardioes/survivor.webp   frontend/src/assets/guardioes/survivor.webp   <hueMin> <hueMax> <satMin> 206 0.13
node scripts/guardian-recolor/recolor.mjs frontend/src/assets/guardioes/conqueror.webp  frontend/src/assets/guardioes/conqueror.webp  <hueMin> <hueMax> <satMin> 228
node scripts/guardian-recolor/recolor.mjs frontend/src/assets/guardioes/socializer.webp frontend/src/assets/guardioes/socializer.webp <hueMin> <hueMax> <satMin> 14
node scripts/guardian-recolor/recolor.mjs frontend/src/assets/guardioes/mastermind.webp frontend/src/assets/guardioes/mastermind.webp <hueMin> <hueMax> <satMin> 254
```
(Substituir `<hueMin>`/`<hueMax>`/`<satMin>` pelos valores achados no Step 1, por personagem. Sobrescrever o arquivo original — o git já versiona o estado anterior.)

- [ ] **Step 3: Conferir visualmente cada resultado**

Usar a ferramenta de leitura de imagem para abrir cada webp recolorido e comparar com a versão anterior (`git show HEAD:frontend/src/assets/guardioes/seeker.webp` extraído pra um arquivo temporário, se precisar comparar lado a lado). Confirmar que:
- o figurino/manto mudou pra cor nova;
- pele, cabelo, dourado e gemas continuam com a cor original;
- não sobraram bordas com halo de cor errada (se sobrar, reduzir `satMin` ou apertar `hueMin`/`hueMax` e rodar de novo a partir do arquivo original via `git checkout -- <arquivo>` antes de tentar de novo).

- [ ] **Step 4: Repetir Steps 1-3 para os equivalentes em `mobile/src/assets/guardioes/*.png`**

Mesmos 5 personagens, mesma técnica — a arte pode ter enquadramento/resolução diferente da versão frontend, então rodar a amostragem de novo em vez de reusar os parâmetros do frontend.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/assets/guardioes/seeker.webp frontend/src/assets/guardioes/survivor.webp frontend/src/assets/guardioes/conqueror.webp frontend/src/assets/guardioes/socializer.webp frontend/src/assets/guardioes/mastermind.webp
git add mobile/src/assets/guardioes/seeker.png mobile/src/assets/guardioes/survivor.png mobile/src/assets/guardioes/conqueror.png mobile/src/assets/guardioes/socializer.png mobile/src/assets/guardioes/mastermind.png
git commit -m "feat(arte): recolore 5 guardioes para a nova paleta BrainHex"
```

---

## Task 14: Recolorir Achiever (sem precedente, mas sem o problema de mistura de matiz)

**Files:**
- Modify (binário): `frontend/src/assets/guardioes/achiever.webp`
- Modify (binário): `mobile/src/assets/guardioes/achiever.png`

Achiever não precisou de ajuste na rodada anterior (a arte já batia com o hex antigo), então não há garantia de que o figurino seja isolável como nos 5 acima — mas também não há o problema documentado do Daredevil (cabelo/capa na mesma faixa de cor). Tratar como os 5 da Task 13: amostrar, recolorir, conferir.

- [ ] **Step 1: Amostrar**

```bash
node scripts/guardian-recolor/sample-hue.mjs frontend/src/assets/guardioes/achiever.webp
```

- [ ] **Step 2: Recolorir para o novo dourado (`targetHue` = `45°`, matiz de `#C9A227`)**

```bash
node scripts/guardian-recolor/recolor.mjs frontend/src/assets/guardioes/achiever.webp frontend/src/assets/guardioes/achiever.webp <hueMin> <hueMax> <satMin> 45
```

- [ ] **Step 3: Conferir visualmente (mesmos critérios da Task 13 Step 3)**

- [ ] **Step 4: Repetir Steps 1-3 para `mobile/src/assets/guardioes/achiever.png`**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/assets/guardioes/achiever.webp mobile/src/assets/guardioes/achiever.png
git commit -m "feat(arte): recolore Achiever para a nova paleta BrainHex"
```

---

## Task 15: Tentar recolorir Daredevil (caso conhecido de risco)

**Files:**
- Modify (binário, se der certo): `frontend/src/assets/guardioes/daredevil.webp`, `mobile/src/assets/guardioes/daredevil.png`

O Daredevil ficou de fora da rodada anterior porque cabelo e capa compartilham a mesma faixa de matiz+saturação ("fogo laranja" deliberado), e seleção automática por matiz pinta a pele/efeito de fogo junto. A cor oficial nova (escarlate `#D7263D`, hue ~350°) também está longe do laranja atual da arte (~15-20°) — ainda precisa mudar.

- [ ] **Step 1: Abrir a arte para inspeção visual**

Usar a ferramenta de leitura de imagem em `frontend/src/assets/guardioes/daredevil.webp` e confirmar se a capa ocupa uma região espacial isolável (ex.: só a parte inferior/lateral da imagem, sem sobrepor cabelo/efeito de fogo).

- [ ] **Step 2: Se a capa for isolável por região (crop retangular ou polígono simples), gerar uma máscara manual**

Criar `scripts/guardian-recolor/daredevil-mask.mjs`: usa `sharp().extract({ left, top, width, height })` para recortar só a região da capa (coordenadas obtidas inspecionando a imagem no Step 1), aplica `recolor.mjs` só nesse recorte (hue-shift pra `350°`, sem tocar em `satMin` além do necessário pra pegar o laranja da capa), e recompõe com `sharp().composite([{ input: recorteRecolorido, left, top }])` sobre a imagem original.

- [ ] **Step 3: Conferir visualmente o resultado**

Se cabelo ou efeito de fogo tiverem sido afetados, ou se a borda do recorte ficar visível (linha reta cortando o degradê da capa), **não prosseguir** — reverter (`git checkout -- frontend/src/assets/guardioes/daredevil.webp`) e ir para o Step 4.

- [ ] **Step 4: Se não for seguro automatizar, documentar a exceção mantida**

Sem editor de imagem manual (Photoshop/GIMP com seleção por camadas) não dá pra separar cabelo/capa/fogo com segurança — igual concluído da vez passada. Deixar a arte como está (laranja) e registrar a divergência:

Adicionar ao final do comentário existente em `frontend/src/features/signup/brainhex.ts` (próximo à linha 229, "Excecao: segue a cor da arte..."):
```ts
// Atualizacao 2026-07-26: a paleta oficial do Daredevil mudou de verde para
// vermelho escarlate (#D7263D), mas a arte continua laranja-fogo pelo mesmo
// motivo documentado acima (cabelo e capa compartilham a faixa de matiz+
// saturacao do efeito de fogo — nao e seguro isolar so a capa sem mascara
// manual em editor de imagem). O badge desta secao de signup segue a arte
// (laranja), nao o hex oficial.
```

- [ ] **Step 5: Commit (independente do resultado do Step 2-4)**

```bash
git add -A frontend/src/assets/guardioes/daredevil.webp mobile/src/assets/guardioes/daredevil.png frontend/src/features/signup/brainhex.ts
git commit -m "fix(arte): tenta recolorir Daredevil para escarlate; documenta excecao se nao for seguro"
```

---

## Task 16: Atualizar `frontend/src/features/signup/brainhex.ts` com as cores derivadas da arte nova

**Files:**
- Modify: `frontend/src/features/signup/brainhex.ts:238-311`

**Files:** depende das Tasks 13-15 estarem concluídas (precisa da cor real da arte recolorida).

- [ ] **Step 1: Para cada perfil recolorido (todos exceto Daredevil, que mantém `#ec3c04`), extrair a cor dominante do figurino da arte nova**

Usar a ferramenta de leitura de imagem para abrir cada `frontend/src/assets/guardioes/{perfil}.webp` recolorido e ler visualmente o tom do figurino, OU rodar `node scripts/guardian-recolor/sample-hue.mjs frontend/src/assets/guardioes/{perfil}.webp` (o hue dominante já deve bater com o `targetHue` usado na Task 13/14) para confirmar a matiz.

Para cada perfil, aplicar o mesmo critério já documentado no arquivo: pegar a cor-assinatura oficial nova (não a extraída pixel-a-pixel — a extração é só conferência) e elevar a luminosidade (HSL) o suficiente para ~4.5:1 de contraste contra o fundo do site, preservando matiz e saturação (mesmo critério de `_ensure_min_contrast`/`ensureMinContrast`, documentado no CLAUDE.md: nunca misturar com branco). Os valores abaixo já aplicam esse critério (mesma elevação percentual usada nos hex antigos do arquivo, ~15-20% de luminosidade a mais que o oficial):

```ts
export const PROFILES = {
  seeker: {
    key: "seeker",
    title: "Seeker (Explorador)",
    icon: Map,
    color: "text-[#1fc9bb] bg-[#1fc9bb]/10 border-[#1fc9bb]/20",
    textColor: "text-[#1fc9bb]",
    bgColor: "bg-[#1fc9bb]",
    cardStyle: "bg-[#1fc9bb]/10 border-[#1fc9bb]/20",
    text: "Motivado pela curiosidade. Gosta de explorar possibilidades, achar conteúdos extras e entender conexões além do básico.",
  },
  survivor: {
    key: "survivor",
    title: "Survivor (Sobrevivente)",
    icon: Shield,
    color: "text-[#7c8894] bg-[#7c8894]/10 border-[#7c8894]/20",
    textColor: "text-[#7c8894]",
    bgColor: "bg-[#7c8894]",
    cardStyle: "bg-[#7c8894]/10 border-[#7c8894]/20",
    text: "Prospera sob pressão. Curte prazos, intensidade e a sensação de superar limites difíceis.",
  },
  daredevil: {
    key: "daredevil",
    title: "Daredevil (Aventureiro)",
    icon: Sword,
    // Excecao mantida: segue a cor da arte (laranja-fogo), nao o hex oficial
    // (escarlate) — ver comentario acima do PROFILES (Task 15).
    color: "text-[#ec3c04] bg-[#ec3c04]/10 border-[#ec3c04]/20",
    textColor: "text-[#ec3c04]",
    bgColor: "bg-[#ec3c04]",
    cardStyle: "bg-[#ec3c04]/10 border-[#ec3c04]/20",
    text: "Gosta de ação e risco. Prefere aprender por tentativa e erro, com exploração rápida e sem medo de falhar.",
  },
  mastermind: {
    key: "mastermind",
    title: "Mastermind (Estrategista)",
    icon: Compass,
    color: "text-[#7a68e8] bg-[#7a68e8]/10 border-[#7a68e8]/20",
    textColor: "text-[#7a68e8]",
    bgColor: "bg-[#7a68e8]",
    cardStyle: "bg-[#7a68e8]/10 border-[#7a68e8]/20",
    text: "Curte planejar e entender o porquê. Aprende melhor com estrutura, lógica e visão geral do sistema.",
  },
  conqueror: {
    key: "conqueror",
    title: "Conqueror (Conquistador)",
    icon: Crown,
    color: "text-[#4c74e0] bg-[#4c74e0]/10 border-[#4c74e0]/20",
    textColor: "text-[#4c74e0]",
    bgColor: "bg-[#4c74e0]",
    cardStyle: "bg-[#4c74e0]/10 border-[#4c74e0]/20",
    text: "Motivado por performance. Gosta de rankings, metas claras e superar desafios comparativos.",
  },
  socializer: {
    key: "socializer",
    title: "Socializer (Socializador)",
    icon: Drama,
    color: "text-[#f68260] bg-[#f68260]/10 border-[#f68260]/20",
    textColor: "text-[#f68260]",
    bgColor: "bg-[#f68260]",
    cardStyle: "bg-[#f68260]/10 border-[#f68260]/20",
    text: "Valoriza interação. Aprende melhor em grupo, com troca de ideias e atividades cooperativas.",
  },
  achiever: {
    key: "achiever",
    title: "Achiever (Realizador)",
    icon: Box,
    color: "text-[#d4b355] bg-[#d4b355]/10 border-[#d4b355]/20",
    textColor: "text-[#d4b355]",
    bgColor: "bg-[#d4b355]",
    cardStyle: "bg-[#d4b355]/10 border-[#d4b355]/20",
    text: "Focado em completar tudo. Se motiva com checklists, badges e concluir 100% do conteúdo.",
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/signup/brainhex.ts
git commit -m "feat(frontend): atualiza cores do quiz de signup para a nova paleta BrainHex"
```

---

## Task 17: Verificação final

**Files:** nenhum (task de verificação)

- [ ] **Step 1: Rodar a suíte de testes da api de novo (garantir que nada mais quebrou)**

Run: `cd api && python -m pytest tests/test_personalizacao_service.py -q`
Expected: `passed`.

- [ ] **Step 2: Rodar o typecheck do microservice e do frontend**

Run: `cd microservice && npm run lint`
Expected: sem erros de tipo.

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros de tipo.

- [ ] **Step 3: Grep final de varredura (repetir Task 11, agora sem exceções)**

```bash
grep -rniE "#(720101|1b6b1b|707c88ff?|01808bff?|6d15be|ad6002|a78c07|788490|018e9a|aa60ed|ba863f|fb0202)" \
  --include='*.ts' --include='*.tsx' --include='*.py' --include='*.css' \
  api/ microservice/ frontend/ mobile/
```
Expected: sem saída (o único hex "antigo" que pode sobrar de propósito é `#ec3c04` do Daredevil, que não está nessa lista de busca).

- [ ] **Step 4: Subir o microservice e a api localmente e conferir visualmente uma tela que usa a paleta por perfil**

Run: `npm run dev` (na raiz, conforme `CLAUDE.md`) e abrir o console do professor (`frontend`, porta 8080) numa seção que renderize `PersonalizacoesSection` ou o showcase de perfis (`BrainHexShowcase`), alternando entre 2-3 perfis pra confirmar visualmente a nova paleta e o contraste AAA.

- [ ] **Step 5: Commit final (se o Step 4 revelar ajustes)**

Só commitar se algum ajuste visual for necessário; senão, task concluída sem commit adicional.
