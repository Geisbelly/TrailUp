# Design: nova paleta BrainHex baseada em psicologia das cores

**Data:** 2026-07-26
**Fonte da decisão:** `docs/tcc/12-psicologia-das-cores-perfis.md` (revisão de Elliot & Maier e correlatos sobre psicologia das cores, aplicada aos 7 perfis BrainHex).

## Motivação

A paleta oficial atual dos 7 perfis BrainHex não foi escolhida com base em evidência — por exemplo, o Daredevil (ação/risco/adrenalina) é verde, e o Achiever (conquista/recompensa) é laranja-queimado. O documento de pesquisa em `docs/tcc/12-psicologia-das-cores-perfis.md` propõe uma paleta alinhada aos traços de cada perfil, com embasamento em Color-in-Context Theory (Elliot & Maier, 2012) e estudos correlatos. Esta spec adota essa paleta como nova cor-assinatura oficial dos 7 perfis, em todo o sistema (microservice, api, frontend, mobile), incluindo a arte dos guardiões.

## Paleta nova (fonte da verdade)

| Perfil | Cor antiga (hex) | Nova cor | Novo hex | Racional (pesquisa) |
|---|---|---|---|---|
| Mastermind | Slate `#707c88` | Índigo | `#5B3FD9` | competência, racionalidade, confiança |
| Achiever | Laranja-queimado `#ad6002` | Ouro | `#C9A227` | recompensa, sucesso, realização |
| Seeker | Ocre `#a78c07` | Turquesa | `#17A398` | exploração, crescimento, novidade |
| Survivor | Vermelho `#720101` | Cinza-ardósia | `#4E5A66` | solidez, confiança, controle |
| Conqueror | Teal `#01808b` | Azul Royal | `#1E4FD6` | autoridade, competência, credibilidade |
| Socializer | Roxo `#6d15be` | Laranja Coral | `#F4623A` | sociabilidade, acolhimento, entusiasmo |
| Daredevil | Verde `#1b6b1b` | Vermelho Escarlate | `#D7263D` | risco, ação, adrenalina |

Escolhas de desambiguação já validadas com o usuário (a pesquisa dava duas opções):
- Survivor: cinza-ardósia (não azul petróleo) — fica desaturado o bastante para não competir com os dois azuis (Mastermind, Conqueror).
- Conqueror: azul royal (não azul marinho) — mais saturado, destaca melhor no fundo escuro do app.

**Risco conhecido, aceito:** Índigo (Mastermind, ~254° de matiz) e Azul Royal (Conqueror, ~228°) ficam a ~26° de distância de matiz — os dois "azuis" da paleta. É uma tensão inerente à própria pesquisa (competência vs. liderança). Mitigado por diferença de saturação/luminosidade; deve ser conferido visualmente lado a lado durante a implementação.

Ícones (Lucide), nomes de guias/guardiões, e as cores semânticas fixas (`success`/`warning`/`info`/`locked`) **não mudam**.

## O que muda (fonte única → espelhos)

A cor-assinatura oficial vive em `microservice/src/constants/brainHex.ts` (`BRAIN_HEX_CONFIG[perfil].color`). Todo o resto deriva dela, direta ou indiretamente. Ordem de propagação:

### 1. Fonte oficial
- `microservice/src/constants/brainHex.ts` — campo `color` de cada perfil (tabela acima) e campo `gradient` (classes Tailwind `from-*/to-*`) recalibrado para a família de cor nova de cada perfil (ex.: Seeker deixa de usar `yellow`/`amber` e passa a usar tons de `teal`/`cyan`).

### 2. Espelhos de hex puro (cópia direta do valor oficial)
- `api/app/api/v1/personalizacao.py` — `_PROFILE_COLOR_MAP` (usada por `_build_design_tokens`; a derivação de `background`/`surface`/`surface_elevated`/`accent` via `_ensure_min_contrast` continua igual, só o `accent_base` de entrada muda).
- `api/app/services/personalizacao.py` — blocos `"cores": {"primaria", "secundaria", "destaque"}` por perfil e os `"guia_cor"` por perfil. `secundaria`/`destaque` são tons fixos derivados à mão do `primaria` (mesmo padrão de escurecer/clarear preservando matiz) — recalcular com a mesma lógica.
- `api/app/services/media_pipeline.py` — mesmos blocos `"cores"` (nota: hoje `socializer` está duplicado com uma chave repetida na linha 67; ao corrigir, usar a nova cor do Socializer em ambas as entradas).
- `api/app/services/media_agents.py` — `guia_cor` por perfil.
- `api/app/services/slides_pdf.py` — `_PROFILE_ACCENT` por perfil (accent usado nos slides/PDF gerados).
- `mobile/src/constants/profileImages.ts` — `color` por perfil (fonte de `getBrainHexConfig()`, usada por `mobile/src/utils/profileShellTheme.ts:buildProfileShellPaletteFromAccent()` — essa função já deriva `background`/`surface`/`accent`/etc. automaticamente a partir do `accentBase`, então não precisa de tons calculados à mão ali).
- `microservice/src/index.css` — gradiente hardcoded que referencia `#707c88` (Mastermind) na linha 103.

### 3. Tons calculados à mão (fórmula existente, recalcular por perfil)
- `frontend/src/lib/personalizacao-theme-guide.ts` — `PERFIS_TEMA[].palette` (`primary`/`secondary`/`accent`/`background`). Seguir o mesmo padrão já documentado no arquivo: `primary` = cor-assinatura nova; `secondary` = `primary` escurecida; `accent` = `primary` clareada; `background` = `primary` quase-preta.

### 4. Variante "segue a arte" (depende do passo de recoloração da arte, seção abaixo)
- `frontend/src/features/signup/brainhex.ts` — objeto `PROFILES`, campos `color`/`textColor`/`bgColor`/`cardStyle` (classes Tailwind com hex arbitrário). Hoje alguns perfis já usam um hex diferente do oficial porque seguem a cor real da arte recolorida (ver comentário no próprio arquivo, linhas 211–237) — só o Daredevil segue a arte por decisão explícita (exceção documentada). Depois de recolorir a arte (seção seguinte) com a nova paleta, extrair a nova cor dominante do figurino de cada personagem e usar aqui, com luminosidade elevada o necessário para ~4.5:1 de contraste contra o fundo do site (mesmo critério já usado, sem misturar com branco).
- `frontend/src/components/BrainHexShowcase.tsx` — não tem cor própria, extrai o hex de `brainhex.ts` via regex (linha 93); atualiza sozinho quando o passo acima for feito.

### 5. Testes
- `api/tests/test_personalizacao_service.py` — todas as asserções de hex esperado (linhas ~78, ~124, ~1999–2005) trocam para os novos valores oficiais.

## Recoloração da arte dos guardiões

Assets afetados: `frontend/src/assets/guardioes/*.webp` (+ `socializer.png`) e os equivalentes em `mobile/src/assets/guardioes/*.png`.

Técnica (reaproveitada do commit `2aff09d`, que não deixou o script commitado): script Node usando `sharp`, fazendo hue-shift isolado nos pixels do figurino/manto de cada personagem (identificados por faixa de matiz+saturação numa região do torso, com fallback suave nas bordas da faixa), preservando pele/cabelo/dourado/gemas intactos. Alvo do hue-shift = matiz da nova cor oficial do perfil.

Recoloração necessária para os 7 perfis (todos mudam de matiz nesta troca, diferente da rodada anterior onde Mastermind/Achiever não precisaram de ajuste):
- **Seeker, Survivor, Conqueror, Socializer, Mastermind**: já têm precedente funcional (foram recoloridos com sucesso na rodada anterior) — reaplicar a mesma técnica com o novo alvo de matiz.
- **Achiever**: não precisou de ajuste antes (arte já batia com o hex antigo); agora precisa, mesma técnica das anteriores.
- **Daredevil**: exceção conhecida — cabelo e capa compartilham a mesma faixa de matiz/saturação (tema "fogo laranja" deliberado na arte), o que impede isolar só a capa por matiz/posição sem also pintar pele ou o efeito de fogo. Nesta rodada, tentar isolamento por **máscara manual da região da capa** (em vez de seleção automática por cor) antes de desistir; se não for viável com segurança, manter a arte como está (laranja) e a divergência entre badge (escarlate) e arte continua documentada como pendência, igual está hoje.

Cada personagem recolorido é conferido visualmente (screenshot antes/depois) antes de aceitar o resultado.

## Fora de escopo

- Mudar ícones Lucide por perfil.
- Mudar nomes/gênero/etnia dos guias e guardiões.
- Mudar a lógica de contraste AAA (`_ensure_min_contrast` / `ensureMinContrast`) em si — só os hex de entrada.
- Regenerar conteúdo já personalizado e persistido no Supabase (`conteudo_personalizado`, materiais já gerados) — a nova paleta vale para conteúdo gerado dali pra frente.
- Cores semânticas fixas (`success`/`warning`/`info`/`locked`).

## Verificação

- `api/tests/test_personalizacao_service.py` passando com os novos hex.
- Conferência visual da arte recolorida (7 personagens, frontend + mobile).
- Conferência visual da UI (frontend console do professor, mobile) com a nova paleta aplicada por perfil, checando contraste AAA nos elementos que já usam `_ensure_min_contrast`/`ensureMinContrast`.
- Grep de varredura pelos hex antigos (`720101`, `1b6b1b`, `707c88`, `01808b`, `6d15be`, `ad6002`, `a78c07`, e as variantes derivadas em maiúsculas/minúsculas) para garantir que nenhuma ocorrência de código (fora de `docs/`) ficou pra trás.
