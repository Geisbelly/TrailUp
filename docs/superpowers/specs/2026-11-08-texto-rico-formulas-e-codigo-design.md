# Texto rico: fórmulas e código no console e no app (spec A de 3)

Data: 2026-11-08 · Status: design aprovado, sem implementação

Parte A de um pedido em três: (A) texto rico com fórmulas e código, (B) o aluno responder com
código ou fórmula, (C) gerar atividades e questões a partir de PDF. A vem primeiro porque B e C
gravam e mostram texto rico: sem a base, a questão extraída do PDF com fórmula não teria como ser
mostrada.

## Por quê

- O enunciado, as alternativas e o gabarito são texto puro. No app, `QuestionActivity` os desenha
  com `<Text>`. No console, `TopicEditDrawer` os edita em `textarea` e grava por
  `normalizeWhitespace`, que junta os espaços e achata a indentação de qualquer código.
- O material gerado pela IA já vem com LaTeX. `mobile/src/utils/matematicaLegivel.ts` (#522) troca
  o LaTeX por Unicode na leitura (`\frac{a}{b}` vira `a/b`). Isso dá conta do básico do ensino
  médio e não dá conta de química (`\ce{}`), de fração dentro de fração, de vetor nem de unidade.
- `react-native-markdown-display` (app) e `react-markdown` (console) não desenham matemática.

## Decisões (Geisbelly, 08/11)

1. **Três specs, a base primeiro.** Cada parte tem o seu spec, plano e PRs.
2. **No app, MathJax em JavaScript gera SVG**, e o `react-native-svg` desenha. Sem módulo nativo,
   igual em Android, iOS e web do Expo.
3. **Marca por registro.** Coluna `formato_texto` (`'texto'` | `'rico'`). Só o `'rico'` passa
   pelo markdown, LaTeX e código. Nada que já existe muda de aparência.
4. **App antigo:** o recurso pega carona no corte da fase 3 do gabarito
   (`docs/analises/2026-11-08-gabarito-fora-do-app-do-aluno.md`), que já sobe
   `app_versao_minima` para um build novo. Até lá, o console avisa.
5. **Editor do console:** textarea, barra de inserção e prévia. Sem editor WYSIWYG e sem MathLive.
6. **Vale em:** questões, descrição da atividade, conteúdo e material, e cards.

## 1. Banco

Migration aditiva, sem tabela nova.

```sql
ALTER TABLE public.questoes   ADD COLUMN formato_texto text NOT NULL DEFAULT 'texto'
  CHECK (formato_texto IN ('texto', 'rico'));
ALTER TABLE public.atividades ADD COLUMN formato_texto text NOT NULL DEFAULT 'texto' CHECK (...);
ALTER TABLE public.cards      ADD COLUMN formato_texto text NOT NULL DEFAULT 'texto' CHECK (...);
```

- **Cópia.** `duplicar_classe`, `duplicar_topico` e `duplicar_atividade` copiam as colunas uma a
  uma. Elas passam a copiar `formato_texto`, e o teste de estrutura de cada uma
  (`api/tests/test_migration_duplicar_*.py`) passa a exigir a coluna. Sem isso, a cópia de uma
  questão rica volta a `'texto'` e o aluno vê LaTeX cru.
- **Corte da fase 3.** Quando o GRANT de `questoes` for por coluna, `formato_texto` entra na
  lista do aluno. Não é segredo, e sem ela o app não sabe como desenhar.
- **Gatilhos do editor.** `fn_enqueue_class_delta_job` e o registro de `alteracao_professor` já
  disparam por UPDATE nessas tabelas. Mudar só o formato é alteração cosmética, e quem decide
  isso é a IA, como hoje. Nada muda neles.
- **Alternativa rica é conferida pela posição.** O app manda o texto da alternativa escolhida
  (`QuestionActivity`, `respostaSelecionada`), e `fn_questao_confere` compara textos depois de
  `fn_texto_comparavel`. **Medido em produção (08/11):** ela tira acento, passa para minúsculas
  e corta as pontas, mas **não tira símbolos**. `\(a+b\)` e `\(a-b\)` continuam diferentes. O
  empate real é de maiúscula: `\ce{CO}` (monóxido de carbono) e `\ce{Co}` (cobalto), ou `M` e
  `m`. Escolher a errada dá acerto.

  **O gabarito também chegava trocado.** O gatilho `trg_questoes_alternativas_canonicas`
  reescreve o gabarito ao salvar (`fn_questao_gabarito_em_texto`) e fica com a **primeira**
  alternativa igual pelo texto comparável. Com `["\ce{Co}", "\ce{CO}"]` e gabarito `\ce{CO}`, o
  banco gravava `\ce{Co}`. A função passa a tentar o texto exato antes, para toda questão.

  Para `formato_texto = 'rico'`:
  - o app manda a **letra** (`a`, `b`…) da alternativa;
  - o banco acha a posição do gabarito (`questao_gabarito.resposta_correta`) por igualdade exata
    depois de `btrim`, depois por letra ou índice, e compara posições;
  - a questão `'texto'` segue o caminho de hoje, sem mudança;
  - **lacuna rica** tem o mesmo problema: `fn_texto_estrito` tira os símbolos, e `a+b` empata
    com `a-b`. Em `'rico'`, a lacuna compara sem espaço e sem delimitadores, mantendo os símbolos,
    e sem Levenshtein (em fórmula, um caractere muda o sentido).

  **A marca chega ao app sem mexer na `vw_aluno_classe_detalhado`.** `Classe.ts` já lê
  `atividades.metadata` à parte da view e passa a ler `formato_texto` junto, e o mesmo para
  `questoes`. A fase 3 do gabarito vai reescrever essa view, e as duas mudanças não podem
  disputar o mesmo `CREATE OR REPLACE VIEW`.

  Os corpos de produção foram lidos em 08/11 (`BEGIN READ ONLY`, sem SET) e conferidos contra o
  Alembic antes de a migration (`20261108_03`) partir deles.
- **Material da IA.** `conteudos` do tipo markdown, `conteudo_personalizado.materiais`,
  `cards_personalizados` e `questoes_personalizadas` já são markdown escrito pela IA. Passam a ser
  lidos como rico sem coluna, com a guarda do cifrão de `matematicaLegivel` (`pareceMatematica`:
  `R$` nunca abre fórmula).

## 2. Sintaxe do texto rico

- Markdown CommonMark, com tabela GFM.
- Fórmula inline: `\( … \)` ou `$ … $`. Em bloco: `\[ … \]` ou `$$ … $$`. O cifrão simples só abre
  fórmula quando o miolo parece fórmula, com a regra de `pareceMatematica`.
- Química: `\ce{…}`. Unidades: `\pu{…}`. As duas vêm da extensão mhchem do MathJax.
- Código: bloco cercado ```` ```linguagem ````, de uma lista fechada de linguagens (sai no spec B).
  Código inline com crase simples.
- HTML cru desligado, nos dois lados. Imagens como hoje.

O console insere `\( \)` e `\[ \]`, que não têm ambiguidade com dinheiro. O cifrão é aceito
porque é o que o modelo e quem já escreve LaTeX usam.

## 3. App

Módulo novo `mobile/src/components/textoRico/`:

- **`TextoRico`** recebe `texto` e `formato`. Com `'texto'`, desenha como hoje. Com `'rico'`, usa
  `react-native-markdown-display` com regras de fórmula (bloco e inline) e de código.
- **`Formula`** usa mathjax-full (entrada TeX com mhchem, saída SVG, `liteAdaptor`) e desenha com
  `SvgXml`. Detalhes:
  - a cor é a do texto do perfil, trocando `currentColor`;
  - cache por `(tex, bloco|inline, cor)`;
  - o MathJax só é carregado na primeira fórmula;
  - LaTeX inválido aparece cru, em monoespaçado, e nunca derruba a tela;
  - o rótulo de acessibilidade é a saída de `matematicaLegivel` para o mesmo trecho.
- **`BlocoDeCodigo`** é monoespaçado, rola na horizontal, preserva espaços e tabulação e tem
  realce de sintaxe por tokenização em JavaScript puro, com tokens virando `<Text>` coloridos com a
  paleta do perfil e contraste AAA.
- **Onde entra.**
  - `QuestionActivity`: enunciado, alternativas (dentro do botão), gabarito revelado e a
    explicação, quando a questão é `'rico'`.
  - A descrição da atividade e os cards, pela coluna.
  - `MarkdownBlock`: as mesmas regras de fórmula e de código. `matematicaLegivel` deixa de ser a
    exibição e continua como rótulo acessível e como reserva quando o MathJax falhar.
- **Layout.** Fórmula em bloco maior que a largura rola na horizontal, e não encolhe até ficar
  ilegível. Conferir no emulador Android, além da web.

## 4. Console

Módulo novo `frontend/src/components/textoRico/`:

- **`TextoRico`** usa `react-markdown` com `remark-math`, `remark-gfm` e MathJax SVG (via rehype,
  com mhchem) e o mesmo realce. O motor é o mesmo do app, para a prévia sair igual ao que o aluno
  vê.
- **`CampoTextoRico`** substitui o `textarea` do enunciado, das alternativas, do gabarito, da
  descrição da atividade e do card:
  - barra com Fórmula, Química e Código;
  - **Fórmula** e **Química** abrem um popover com o LaTeX, uma paleta (fração, raiz, potência,
    índice, vetor, somatório, integral, `\ce{}`, `\pu{}`, setas de reação) e a prévia ao vivo;
  - **Código** insere o bloco cercado com a linguagem escolhida;
  - prévia do campo inteiro, abaixo dele;
  - usar fórmula ou código marca o registro como `'rico'`, e um interruptor desfaz.
- **Salvamento.** Quem achata é `saveAiSuggestionsBatch` (`normalizeWhitespace` no enunciado,
  nas alternativas, na resposta e no card). Em `'rico'`, ele só tira espaço das pontas. O
  `'texto'` segue como hoje. `saveQuestion`, `saveActivity` e `saveCard` não normalizam: só
  passam a gravar `formato_texto`.
- **Aviso até o corte.** Ao salvar registro `'rico'` enquanto `app_versao_minima` for menor que o
  build com o renderizador: "Alunos com o app desatualizado verão este texto sem formatação."
- **Alternativas repetidas.** Em questão rica, o console avisa quando duas alternativas têm o
  mesmo texto exato, já que a posição passa a ser a única diferença.

## 5. Fora deste spec

- O aluno responder com código ou fórmula, e como isso é corrigido: spec B.
- Os prompts da IA (edge function, microservice e Python) emitirem LaTeX e código e marcarem
  `'rico'`: spec C, junto com a extração do PDF.

## Testes

- Banco: a marca tem CHECK e padrão; as três funções de cópia levam a coluna; em questão rica,
  escolher `\ce{Co}` quando o gabarito é `\ce{CO}` dá erro, e escolher a certa dá acerto; o
  gatilho grava o gabarito exato mesmo com o empate; tudo com o
  papel `authenticated` de verdade (`SET LOCAL ROLE` dentro de `BEGIN/ROLLBACK`).
- App: `TextoRico` com `'texto'` desenha igual a hoje (teste de tela); LaTeX inválido não lança;
  `R$ 50` não vira fórmula; código preserva indentação.
- Console: a prévia do `CampoTextoRico` bate com o `TextoRico`; salvar `'rico'` preserva quebras e
  indentação; `npm run typecheck`.
- Android: enunciado com fórmula em bloco larga, alternativa com fração e bloco de código longo,
  no emulador.
