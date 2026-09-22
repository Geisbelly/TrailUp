# Paleta de Cores — Fase 2

> Extraída **visualmente** dos 6 prints (Visão geral, Trilhas, Turmas, Personalizações, Rankings, Meus Dados). Todos os valores HEX/RGB abaixo são **aproximados** — obtidos por estimativa visual a partir de screenshot, não por leitura de código ou de arquivo de design. Não tratar como idênticos aos valores reais do sistema. Onde uma cor tem função clara mas o print não permite estimar o tom com confiança (ex. estados de hover/active/disabled, que não aparecem em nenhum print), isso é declarado como não observado.

## Base / superfícies

| Nome | HEX aproximado | Uso |
|---|---|---|
| `background` | `#0d0b16` | fundo geral da página, por trás de tudo |
| `surface-header-sidebar` | `#120e1c` | fundo do header e da sidebar — visualmente quase idêntico ao `background`, sem transição perceptível |
| `card` | `#1b1728` | fundo de cards, inputs de destaque e blocos elevados |
| `border` | `#2b2438` | bordas finas de cards, inputs, divisórias de header/sidebar |

## Texto

| Nome | HEX aproximado | Uso |
|---|---|---|
| `text-primary` | `#f4f2f8` | títulos, valores numéricos grandes, texto de maior ênfase |
| `text-secondary` (muted) | `#a29cb3` | subtítulos, labels, legendas, texto auxiliar ("Console do professor", "id:131", contadores) |

## Cor de marca

| Nome | HEX aproximado | Uso |
|---|---|---|
| `primary` | `#9b5de5` | botões primários (preenchimento sólido), avatar do usuário, aba ativa, borda/texto do chip de disciplina, ícone de documento nos cards de tópico |
| `primary-foreground` | `#ffffff` (ou muito próximo) | texto sobre `primary` |

Não há evidência nos prints de uma variante clara/escura do `primary` (gradiente, hover, etc.) — se for necessário um tom mais claro ou mais escuro para estado de hover/foco, **elevar a luminosidade do próprio `primary`** em vez de introduzir uma cor nova, seguindo a mesma lógica já documentada na Fase 1 (nunca misturar com branco puro, para não desaturar o tom).

## Acento secundário (bronze/cobre)

| Nome | HEX aproximado | Uso |
|---|---|---|
| `secondary` | `#9c6b4f` | botão "Salvar dependências" (Trilhas) — única ocorrência observada; reservar para ações secundárias de peso, não para uso decorativo genérico |

## Acento de navegação (teal/menta)

| Nome | HEX aproximado | Uso |
|---|---|---|
| `nav-active` | `#4fd1c5` | ícone/realce do item de sidebar ativo (estado de repouso) e o anel de foco retangular que aparece ao redor do item recém-selecionado |

## Cores de gráfico

| Nome | HEX aproximado | Uso |
|---|---|---|
| `chart-accent` | `#f2a29c` | barras do gráfico "Abandono por Perfil" e fatia do gráfico "Distribuição de Notas" — tom coral/salmão uniforme, não as cores por perfil BrainHex |
| `chart-label-danger` | `#e2574c` | texto do rótulo "baixa: 100.0%" junto ao gráfico de rosca — mais saturado/vermelho que o `chart-accent` das formas |

Esta cor de gráfico é uma mudança em relação à Fase 1: os protótipos anteriores não usavam um tom coral/salmão como acento de dados. Tratar como uma decisão nova da Fase 2, não como erro.

## Alerta / estado de falha

| Nome | HEX aproximado | Uso |
|---|---|---|
| `danger-bg` | `#3a1e22` | fundo do banner "⚠ Personalização com falha" (Trilhas) |
| `danger-text` | `#f0847c` | ícone e texto dentro do banner de alerta |

Não há evidência de um tom de sucesso (`success`) ou de aviso não-crítico (`warning`) distinto nos prints — não inventar valores para eles; se necessários, usar os mesmos princípios de saturação/luminosidade do `danger` até haver referência visual real.

## Conectores do mapa de trilha

| Nome | HEX aproximado | Uso |
|---|---|---|
| `connector-dep` (azul) | `#3b82c4` | círculo "D" e traço do conector esquerdo (pré-requisito) |
| `connector-next` (verde) | `#34c77b` | círculo "N" e traço do conector direito (próximo) |
| `connector-chip-bg` | `#1f3a3d` aprox. | fundo do chip de texto (ex. "SPD - Aula 2") dentro dos indicadores DEP/NEXT — tom ciano-esverdeado escuro |
| `connector-chip-text` | `#7fb8c9` aprox. | texto dentro desse chip |

## Estados não observados

Os prints não mostram, para nenhum componente: `hover`, `active` (pressionado), `disabled` visualmente distinto (exceto o campo "Email" em Meus Dados, que aparenta um leve esmaecimento — sem confiança suficiente para extrair um HEX separado), nem `focus` de input. Ao gerar as telas, **não inventar valores específicos** para esses estados — usar variações de luminosidade das cores acima (mais clara para hover, mais escura para active) como prática padrão, deixando claro que é uma inferência, não uma observação.
