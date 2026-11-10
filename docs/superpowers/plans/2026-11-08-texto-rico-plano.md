# Plano: texto rico com fórmulas e código (spec A)

Data: 2026-11-08 · Spec: `docs/superpowers/specs/2026-11-08-texto-rico-formulas-e-codigo-design.md`

**Objetivo.** Enunciado, alternativas, gabarito, descrição da atividade, card e material
passam a desenhar fórmula (MathJax em SVG, com mhchem) e código (realce por Prism), no app e no
console, sem mudar a aparência do que já existe e sem deixar a alternativa rica ser corrigida
errado.

**Arquitetura.**

- Uma marca `formato_texto` por registro.
- Um pré-processamento puro (`prepararTextoRico`), igual nos dois pacotes, que normaliza os
  delimitadores e protege o cifrão de dinheiro.
- O markdown de cada lado (`react-native-markdown-display` / `react-markdown`) ganha regras de
  fórmula e de código.
- `formulaParaSvg` (mathjax-full) e `tokensDoCodigo` (prismjs), iguais nos dois pacotes.
- No banco, a alternativa rica é conferida pela posição.

**Três PRs, todos a partir da `main`, sem empilhar:**

| PR | Pacote | Depende de |
|---|---|---|
| 1. Banco | `api/` (migration + testes) | nada |
| 2. App | `mobile/` | PR 1 **aplicado** em produção para valer, mas lê a marca com tolerância (sem coluna, vale `'texto'`), então pode entrar antes |
| 3. Console | `frontend/` | PR 1 **aplicado** em produção: o `select` de `formato_texto` falha sem a coluna |

O PR 2 e o PR 3 não dependem um do outro. A paridade entre eles é garantida por um arquivo de
casos idêntico nos dois pacotes (tarefa 2.1 e 3.1), conferido byte a byte por um teste no
console.

**Regras de sempre:** UTF-8 sem BOM; nada de SET pela 6543 (leitura em produção só com
`BEGIN READ ONLY`, pela conexão direta); não aplicar a migration em produção; rodar os passos do
`ci.yml` do pacote antes de subir; layout conferido no emulador Android; só abrir PR.

---

## PR 1: banco

Branch `feat/texto-rico-banco`, a partir de `origin/main`.

### 1.1 Medir produção antes de escrever (só leitura)

Na conexão direta (não a 6543), dentro de `BEGIN READ ONLY; … ROLLBACK;`:

```sql
SELECT pg_get_functiondef('public.fn_questao_confere(bigint,text)'::regprocedure);
SELECT pg_get_functiondef('public.duplicar_classe(bigint)'::regprocedure);
SELECT pg_get_functiondef('public.duplicar_topico(bigint)'::regprocedure);
SELECT pg_get_functiondef('public.duplicar_atividade(bigint, bigint)'::regprocedure);
SELECT pg_get_functiondef('public.fn_texto_comparavel(text)'::regprocedure);
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN ('questoes', 'atividades', 'cards')
   AND column_name = 'formato_texto';                                             -- tem de vir vazio
```

Comparar cada corpo com o do Alembic (`20261108_01` e `20261011_01/_03/_04`). **Se divergir, a
migration parte do corpo de produção**, e a divergência é descrita no docstring, como a
`20260921_02` fez. Guardar a saída no scratchpad, não no repo.

### 1.2 Escolher o número da migration

```bash
git fetch origin main && git log --oneline -1 origin/main
cd api && python -c "from alembic.config import Config; from alembic.script import ScriptDirectory; print(ScriptDirectory.from_config(Config('alembic.ini')).get_heads())"
```

Uma cabeça só. A nova revisa essa cabeça, com o próximo número livre do dia (hoje seria
`20261108_03`). Conferir de novo antes de abrir o PR: dois PRs já pegaram o mesmo número sem
conflito no git.

### 1.3 Testes de estrutura primeiro (falham)

Arquivo `api/tests/test_migration_texto_rico.py`, no molde de
`test_migration_duplicar_atividade.py` (SQL offline do Alembic):

```python
REV = "20261108_03"   # ajustar ao número escolhido em 1.2
ANT = "20261108_02"


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), f"{ANT}:{REV}", sql=True)
    return output.getvalue()


def test_marca_nas_tres_tabelas_com_padrao_e_check() -> None:
    sql = _upgrade_sql()
    for tabela in ("questoes", "atividades", "cards"):
        assert f"ALTER TABLE public.{tabela} ADD COLUMN IF NOT EXISTS formato_texto text NOT NULL DEFAULT 'texto'" in sql
        assert f"{tabela}_formato_texto_check" in sql
    assert "formato_texto IN ('texto', 'rico')" in sql


def test_as_tres_copias_levam_a_marca() -> None:
    sql = _upgrade_sql()
    # Cada cópia tem o seu INSERT: duplicar_classe e duplicar_topico copiam atividades, questões
    # e cards; duplicar_atividade, atividades e questões. TODOS precisam da coluna.
    for tabela, minimo in (("atividades", 3), ("questoes", 3), ("cards", 2)):
        listas = re.findall(rf"INSERT INTO public\.{tabela} \(([^)]*)\)", sql)
        assert len(listas) >= minimo, f"faltou cópia de {tabela}"
        for lista in listas:
            assert "formato_texto" in {c.strip() for c in lista.split(",")}, lista
    # O resto do contrato das cópias continua (posse antes de ler, sem dado de aluno).
    for proibido in ("atividade_aluno", "questao_aluno", "telemetria"):
        assert proibido not in sql


def test_alternativa_rica_e_conferida_pela_posicao() -> None:
    sql = _upgrade_sql()
    confere = sql[sql.index("CREATE OR REPLACE FUNCTION public.fn_questao_confere"):]
    assert "v_formato = 'rico'" in confere
    assert "fn_questao_posicao_rica(v_alts, p_resposta)" in confere
    assert "fn_questao_posicao_rica(v_alts, v_gabarito)" in confere
    # O oráculo continua fechado.
    assert "REVOKE ALL ON FUNCTION public.fn_questao_confere(bigint, text) FROM PUBLIC, anon, authenticated" in sql


def test_downgrade_tira_a_marca_e_volta_as_funcoes() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), f"{REV}:{ANT}", sql=True)
    down = output.getvalue()
    assert "DROP FUNCTION IF EXISTS public.fn_questao_posicao_rica(jsonb, text)" in down
    for tabela in ("questoes", "atividades", "cards"):
        assert f"ALTER TABLE public.{tabela} DROP COLUMN IF EXISTS formato_texto" in down
```

Para as cópias, o `_upgrade_sql` de cada um dos três `test_migration_duplicar_*.py` aponta para
a migration de origem. Não mexer neles: o teste novo cobre a redefinição.

```bash
cd api && pytest tests/test_migration_texto_rico.py -q   # esperado: falha (revisão não existe)
```

### 1.4 A migration

`api/alembic/versions/20261108_03_texto_rico.py`. O docstring diz por que (o spec), o que mediu
em 1.1 e o downgrade.

1. **Colunas:**

   ```sql
   ALTER TABLE public.questoes ADD COLUMN IF NOT EXISTS formato_texto text NOT NULL DEFAULT 'texto';
   ALTER TABLE public.questoes ADD CONSTRAINT questoes_formato_texto_check
     CHECK (formato_texto IN ('texto', 'rico'));
   -- o mesmo para atividades e cards
   ```

   `ADD COLUMN … DEFAULT` constante não reescreve a tabela no Postgres 11+.

2. **Posição da alternativa rica:**

   ```sql
   -- Exato (o app 1.0.x manda o texto da alternativa), depois letra, depois índice.
   CREATE OR REPLACE FUNCTION public.fn_questao_posicao_rica(p_alts jsonb, p_valor text)
   RETURNS integer
   LANGUAGE plpgsql IMMUTABLE
   SET search_path = public, pg_temp
   AS $$
   DECLARE
     v_valor text := btrim(COALESCE(p_valor, ''));
     v_n integer := CASE WHEN jsonb_typeof(p_alts) = 'array' THEN jsonb_array_length(p_alts) ELSE 0 END;
     i integer;
   BEGIN
     IF v_valor = '' OR v_n = 0 THEN RETURN NULL; END IF;
     FOR i IN 0 .. v_n - 1 LOOP
       IF btrim(p_alts ->> i) = v_valor THEN RETURN i; END IF;
     END LOOP;
     IF v_valor ~* '^[a-z]$' AND ascii(lower(v_valor)) - 97 < v_n THEN
       RETURN ascii(lower(v_valor)) - 97;
     END IF;
     IF v_valor ~ '^[0-9]+$' AND v_valor::integer < v_n THEN RETURN v_valor::integer; END IF;
     RETURN NULL;
   END;
   $$;
   REVOKE ALL ON FUNCTION public.fn_questao_posicao_rica(jsonb, text) FROM PUBLIC, anon, authenticated;
   ```

   **Lacuna rica**: `fn_texto_rico_comparavel(text)` = `lower`, sem espaço, sem `\(`, `\)`,
   `\[`, `\]` e `$`, mantendo os símbolos. Comparação exata, sem Levenshtein: em fórmula, um
   caractere muda o sentido.

3. **`fn_questao_confere`:** o corpo medido em 1.1 com:
   - o `SELECT` passando a trazer `q.formato_texto` em `v_formato`;
   - antes do bloco de dissertativa e lacuna:

     ```sql
     IF v_formato = 'rico' AND jsonb_typeof(v_alts) = 'array' AND jsonb_array_length(v_alts) > 0
        AND public.fn_texto_comparavel(COALESCE(v_tipo, '')) IN ('multipla', 'quiz', 'multipla escolha', 'multipla_escolha') THEN
       RETURN public.fn_questao_posicao_rica(v_alts, p_resposta) IS NOT NULL
          AND public.fn_questao_posicao_rica(v_alts, p_resposta) = public.fn_questao_posicao_rica(v_alts, v_gabarito);
     END IF;
     ```

     A lista de tipos tem de ser a que `fn_texto_comparavel` devolve para os apelidos de
     múltipla, conferida em 1.1;
   - no bloco de lacuna, quando `v_formato = 'rico'`, `fn_texto_rico_comparavel` no lugar de
     `fn_texto_parecido`;
   - o `REVOKE`/`GRANT` de `20261108_01` repetidos no fim.

   O `questao_responder` não muda: ele chama `fn_questao_confere`.

4. **Cópias:** `duplicar_classe`, `duplicar_topico` e `duplicar_atividade` redefinidas com o
   corpo medido em 1.1, acrescentando `formato_texto` na lista de colunas e no `SELECT` de cada
   `INSERT` em `atividades`, `questoes` e `cards`. Nada mais muda nelas. *(A falta de
   `dificuldade` nas cópias é anterior e fica fora deste PR: registrar na descrição do PR.)*

5. **Downgrade:**
   - volta as três cópias e `fn_questao_confere` ao corpo anterior;
   - `DROP FUNCTION IF EXISTS` das duas funções novas;
   - `DROP COLUMN IF EXISTS formato_texto` nas três tabelas.

Cuidados que já custaram caro:

- **`%` no plpgsql:** o SQL offline do Alembic dobra para `%%`. Usar `op.execute` com o texto
  cru, como a `20261108_01`.
- **`:palavra` dentro de `op.execute`** vira bind no `text()`. Conferir com
  `text(bloco).compile().params == {}`.
- **`COALESCE(coluna_enum, '')`** estoura em tempo de execução. `formato_texto` é `text`, mas
  `atividades.tipo` comparado tem de ir com `::text`.

```bash
cd api && pytest tests/test_migration_texto_rico.py tests/test_migration_duplicar_*.py -q
```

### 1.5 Teste ponta a ponta no Postgres (Docker)

`api/tests/test_e2e_texto_rico.py`, no molde de `test_e2e_questao_corrigida_no_banco.py`. Roda
com os gatilhos de verdade: uma fixture sem os gatilhos dá verde em código que aborta no primeiro
uso.

Casos, com `SET LOCAL ROLE authenticated` e `request.jwt.claims` do aluno matriculado:

1. Questão rica `multipla`, alternativas `["\\ce{Co}", "\\ce{CO}", …]`, gabarito `\ce{CO}`
   (medido em 08/11: o texto comparável empata maiúscula, não símbolo):
   - a letra de `\ce{Co}` → `correta = false`; a de `\ce{CO}` → `correta = true`;
   - o texto `\ce{Co}` (caminho do app 1.0.x) → `correta = false`;
   - o gatilho `trg_questoes_alternativas_canonicas` grava `\ce{CO}` em `questao_gabarito`, e
     não a primeira alternativa parecida (defeito achado na medição, corrigido no mesmo PR).
2. A mesma questão com `formato_texto = 'texto'` mantém o comportamento de hoje (registrar o
   resultado no teste, seja qual for: é a regressão que a marca evita).
3. Lacuna rica, gabarito `x^2+1`: `x^2 + 1` certo; `x^2-1` errado.
4. `duplicar_atividade` de uma atividade rica com questão rica: as duas cópias vêm `'rico'`.
5. O aluno não tem EXECUTE em `fn_questao_posicao_rica` nem em `fn_questao_confere`.

```bash
cd api && TRAILUP_TEST_DOCKER=1 pytest tests/test_e2e_texto_rico.py tests/test_migrations_postgres.py -q
```

### 1.6 CI do pacote e PR

```bash
python scripts/verifica_encoding_docs.py
cd api && ruff check . && pytest && TRAILUP_TEST_DOCKER=1 pytest tests/test_migrations_postgres.py
```

- PR `feat(banco): marca de texto rico e alternativa rica conferida pela posição`.
- Na descrição:
  - o que foi medido em 1.1;
  - que a migration não foi aplicada;
  - que o corte da fase 3 precisa pôr `formato_texto` no GRANT por coluna de `questoes`;
  - a falta de `dificuldade` nas cópias, como dívida.
- `graphify update .` e desfazer o cache antes do commit (memória: o 0.9.100 suja o cache).

---

## PR 2: app

Branch `feat/texto-rico-app`, a partir de `origin/main`.

### 2.0 Prova de viabilidade no Android (antes de qualquer outra coisa)

O spec aposta em duas coisas que só o aparelho confirma: mathjax-full roda sob o Hermes, e um
`SvgXml` dentro de `<Text>` alinha na linha do texto no Android.

1. Instalar as versões exatas, conferidas no npm na hora, sem `^`, pelo menos duas semanas
   antigas: `mathjax-full` (3.2.x) e `prismjs` (1.30.x).
2. Tela de rascunho fora do repo, ou um `__DEV__` temporário, com:
   - `Calcule \(\frac{\Delta v}{\Delta t}\) para \(v = 20\,\text{m/s}\)`;
   - `\ce{2H2 + O2 -> 2H2O}`;
   - um bloco Python de 30 linhas.
3. APK de dev no emulador. Metro do scratchpad não vê edição, e a porta 8081 costuma estar
   ocupada: ver a memória de layout no Android.
4. Medir:
   - o tempo da primeira fórmula (carga do MathJax) e da segunda;
   - o aumento do bundle (`npx expo export --platform android` antes e depois).

**Se o Hermes falhar ou o inline ficar quebrado, parar e voltar à Geisbelly** com a medida. A
alternativa registrada no spec era KaTeX em WebView, e trocar o motor muda o spec. Não seguir com
outro motor por conta própria.

### 2.1 Núcleo puro, com testes primeiro

Pasta `mobile/src/utils/textoRico/`, sem React, testável no `node --test`. Os arquivos entram em
`mobile/testes/principal.txt`.

- `casos.json`: a lista de casos de paridade (texto de entrada → saída esperada de
  `prepararTextoRico`), a mesma do console.
- `prepararTextoRico.ts`:
  - `\( … \)` vira `$…$` e `\[ … \]` vira `$$…$$`;
  - todo `$` que não abre fórmula vira `\$`, pela regra de `pareceMatematica`
    (`matematicaLegivel.ts`), com `R$` nunca abrindo;
  - dentro de bloco e de trecho de código, nada muda.
- `markdownItFormula.ts`: plugin do markdown-it que gera os tokens `math_inline` e `math_block` a
  partir de `$` e `$$` já preparados.
- `formulaParaSvg.ts`:
  - `mathjax-full` com `TeX({ packages: ['base', 'ams', 'newcommand', 'noerrors', 'noundefined', 'mhchem', 'physics', 'boldsymbol'] })`,
    `SVG({ fontCache: 'none' })` e `liteAdaptor`;
  - devolve `{ svg, largura, altura, alinhamento }` ou `{ erro }`;
  - cache LRU de 200 por `(tex, bloco)`;
  - carga preguiçosa (`require` dentro da função).
- `tokensDoCodigo.ts`:
  - linguagens python, javascript, typescript, java, c, cpp, csharp, sql, markup (html) e css;
  - devolve uma lista plana `{ texto, tipo }`;
  - linguagem desconhecida dá um token só.

Testes (`*.test.ts`):

- os `casos.json`;
- `R$ 1.200,00 e R$ 50` não muda;
- `$x^2$` vira fórmula;
- código cercado com `$` dentro não muda;
- `formulaParaSvg('\\frac{a}{b}')` tem `<svg` e `formulaParaSvg('\\frac{a')` não lança e devolve
  `erro`;
- `\ce{H2O}` gera SVG;
- `tokensDoCodigo('print(1)', 'python')` junta de volta o texto original, e a indentação com tab
  se preserva.

```bash
cd mobile && npm test
```

### 2.2 Componentes

`mobile/src/components/textoRico/`:

- `Formula.tsx`:
  - `SvgXml` com `currentColor` trocado pela cor do texto do perfil;
  - o tamanho em `ex`, convertido pelo `fontSize`;
  - em bloco, um `ScrollView` horizontal quando passa da largura;
  - `accessibilityLabel` com `matematicaLegivel` do trecho;
  - com erro, o LaTeX em monoespaçado.
- `BlocoDeCodigo.tsx`:
  - `ScrollView` horizontal;
  - fonte monoespaçada da plataforma;
  - tokens em `<Text>` com uma paleta de realce de contraste AAA sobre a superfície do perfil,
    conferida com a função de contraste que o app já usa;
  - rótulo da linguagem.
- `TextoRico.tsx`:
  - com `formato === 'texto'` (ou ausente), `<Text>` como hoje, byte a byte;
  - com `'rico'`, `Markdown` com um `MarkdownIt` **fora do componente** (a biblioteca memoiza
    pela identidade, ver `MarkdownBlock.tsx`), com `markdownItFormula`, `html: false` e as regras
    `math_inline`, `math_block`, `fence` e `code_inline`;
  - aceita `estiloDoTexto` para herdar a fonte do lugar onde entra (botão de alternativa).

Teste de tela (`TextoRico.tela.test.tsx`, no molde de `QuestionActivity.visibility.test.tsx`, com
`renderToString`):

- `'texto'` com `*a*` e quebra de linha simples sai igual a um `<Text>`;
- `'rico'` com fórmula gera o `Formula`;
- `'rico'` com cerca gera o `BlocoDeCodigo`.

### 2.3 Ler a marca

- `mobile/src/models/Questao.ts`: campo `formato_texto: 'texto' | 'rico'` (padrão `'texto'`).
- `mobile/src/models/Classe.ts`:
  - na hidratação que já lê `atividades.metadata`, passar a `select('id, metadata, formato_texto')`;
  - acrescentar a mesma hidratação para `questoes` (`select('id, formato_texto')`, `in('id', questaoIds)`);
  - **sem coluna ou com erro, tudo fica `'texto'`**, como a hidratação de metadata já faz;
  - não mexer na `vw_aluno_classe_detalhado`: a fase 3 vai reescrevê-la.
- Cards: localizar a leitura dos cards do professor (`grep -rn "imagem_url" mobile/src`; o
  `StudyCardsBlock` recebe `descricao`) e trazer `formato_texto` pelo mesmo caminho.

Teste: `Classe` com a hidratação devolvendo erro mantém `'texto'`.

### 2.4 Onde desenha

- `QuestionActivity.tsx`:
  - enunciado (perto da linha 825), alternativas (o `map` perto da 1026), gabarito revelado e
    explicação usam `TextoRico` com `questao.formato_texto`;
  - a lacuna (`formatFillBlankStatement`) continua texto puro neste PR. Registrar na descrição.
- **Resposta da alternativa rica**:
  - com `formato_texto === 'rico'`, `respostaSelecionada` passa a ser a letra
    (`String.fromCharCode(97 + idx)`), e não o texto;
  - onde o app mostra a resposta já gravada (revisão, `resposta_aluno`), letra vira alternativa
    pelo índice;
  - teste no `QuestionActivity.visibility.test.tsx`: questão rica manda `'b'` a `responderQuestao`;
    questão texto manda o texto, como hoje.
- Descrição da atividade (`grep -rn "descricao" mobile/src/components/ActivityScreen.tsx mobile/src/components/ActivityRenderer.tsx`)
  e `StudyCardsBlock.tsx`: `TextoRico` com a marca.
- `MarkdownBlock.tsx`:
  - mesmo `MarkdownIt` com `markdownItFormula`, e as regras de fórmula e código;
  - o texto passa por `prepararTextoRico` **no lugar de** `matematicaLegivel`;
  - `matematicaLegivel` continua no rótulo acessível e quando `formulaParaSvg` devolve erro.

### 2.5 Android, CI e PR

- **Emulador Android, APK de dev**, nas mesmas telas da 2.0, agora reais:
  - questão rica com fração nas alternativas;
  - enunciado com fórmula em bloco mais larga que a tela;
  - card com `\ce{}`;
  - material personalizado com LaTeX;
  - questão antiga com quebra de linha simples, que tem de continuar igual.
- Capturas de tela no PR.
- CI:

  ```bash
  cd mobile && npm ci && npm run lint && npm run typecheck && npm test
  ```

- Versão: subir `mobile/app.json` (`version`, `versionCode`) para o build que leva o
  renderizador, **com a Geisbelly confirmando o número**. É esse número que o console compara na
  tarefa 3.4.
- PR `feat(mobile): fórmulas e código desenhados no app (texto rico, spec A)`, dizendo que, sem
  a migration, nada muda.

---

## PR 3: console

Branch `feat/texto-rico-console`, a partir de `origin/main`. **Só mesclar depois de a migration do
PR 1 estar em produção.** Dizer isso no topo da descrição.

### 3.1 Núcleo puro, com testes primeiro

`frontend/src/lib/textoRico/`:

- `casos.json`, `prepararTextoRico.ts`, `formulaParaSvg.ts` e `tokensDoCodigo.ts`, com o mesmo
  conteúdo do app (mesmas versões de `mathjax-full` e `prismjs`).
- `paridade.test.ts`: se `../../../../mobile/src/utils/textoRico/casos.json` existir, ele é
  idêntico byte a byte ao daqui. Se não existir (PR 2 ainda não entrou), o teste é pulado com o
  motivo.
- Os mesmos testes da 2.1, em vitest.

```bash
cd frontend && npm test -- textoRico
```

### 3.2 Componentes

`frontend/src/components/textoRico/`:

- `TextoRico.tsx`:
  - `react-markdown` com `remark-gfm` (já é dependência) e `remark-math`, com versão exata;
  - o `code` com classe `math-inline`/`math-display` vira `<Formula>` (SVG de `formulaParaSvg`,
    inserido por `dangerouslySetInnerHTML` **só** com a saída do MathJax);
  - `pre > code.language-x` vira `<BlocoDeCodigo>` com `tokensDoCodigo`;
  - HTML cru desligado (o padrão do react-markdown, sem `rehype-raw`);
  - `'texto'` sai em `whitespace-pre-wrap`, como hoje.
- `CampoTextoRico.tsx`:
  - um `Textarea` do design system, a barra (Fórmula, Química, Código) e a prévia abaixo, com o
    `TextoRico` no formato do campo;
  - **Fórmula/Química**: popover com o LaTeX, a paleta (fração, raiz, potência, índice, vetor,
    somatório, integral, `\ce{}`, `\pu{}`, setas de reação) e a prévia ao vivo. Insere
    `\( … \)` na posição do cursor (ou `\[ … \]` se marcado "em bloco");
  - **Código**: escolhe a linguagem e insere a cerca, com a seleção dentro dela;
  - inserir fórmula ou código chama `onFormatoChange('rico')`, e um interruptor "texto rico" desfaz
    (com confirmação se houver fórmula ou cerca).
- Testes: inserir fórmula marca `'rico'`; a prévia do `CampoTextoRico` e o `TextoRico` dão o mesmo
  HTML para os `casos.json`.

### 3.3 Ler e gravar a marca

- `trilha/types.ts`: `formato_texto?: 'texto' | 'rico'` em `Atividade`, `Questao` e `CardItem`.
- `topicsApi.ts`:
  - `fetchQuestions`, `fetchActivities` e `fetchCards` passam a selecionar `formato_texto`;
  - `saveQuestion`, `saveActivity` e `saveCard` gravam a coluna. `undefined` não mexe nela,
    como `pontuacao_maxima`.
- `saveAiSuggestionsBatch`: com `formato_texto === 'rico'`, `enunciado`, alternativas e resposta
  só levam `trim`, e não `normalizeWhitespace`. Teste em `topicsApi.sugestoesIa.test.ts`:
  indentação de código sobrevive no rico e é achatada no texto, como hoje.
- `useTopicCrud.ts` e formulários: o estado do formulário leva `formato_texto`.

### 3.4 Onde edita

- `TopicEditDrawer.tsx`:
  - enunciado (linha ~1323), alternativas (~1332), gabarito (~1362/1375), descrição da atividade
    (~1277) e card (~1741) usam `CampoTextoRico`;
  - **um formato por registro**: o da questão vale para enunciado, alternativas e gabarito.
- **Alternativas repetidas:** em questão rica, aviso ao salvar quando duas alternativas têm o
  mesmo texto depois de `trim`, porque a posição passa a ser a única diferença.
- **Gabarito da múltipla rica** é escolhido entre as alternativas (o texto exato), nunca digitado,
  para casar com `fn_questao_posicao_rica`.
- **Aviso do app desatualizado:** ao salvar registro `'rico'`:
  - ler `app_config.app_versao_minima`. Se o professor não puder ler a chave (RLS por
    `publico`), medir com o papel de verdade e tratar como "sem versão mínima";
  - se ela for menor que `VERSAO_DO_APP_COM_TEXTO_RICO` (constante com o número confirmado na
    2.5) ou vazia, mostrar o toast "Alunos com o app desatualizado verão este texto sem
    formatação.";
  - salvar normalmente.
- Visualizações do console que mostram enunciado ou card (`PerfilConteudoView.tsx`, a revisão de
  sugestões IA) usam `TextoRico`.

### 3.5 Conferir, CI e PR

- Console local (`npm run docker:up` ou o dev server via `preview_start`) contra o banco local
  com a migration:
  - criar questão rica com fórmula, química e código;
  - duplicar a atividade e conferir a marca na cópia;
  - abrir a mesma questão no app (PR 2) e comparar a prévia.
  - Capturas no PR.
- CI:

  ```bash
  cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build
  ```

  (`npm run typecheck`, nunca `npx tsc --noEmit`.)
- PR `feat(console): editor de fórmula e código com prévia (texto rico, spec A)`.

---

## Depois dos três

- O sync do espelho, na mesma hora em que a `main` do Lab avançar, listando a migration nova e se
  produção já a tem.
- **Fase 3 do gabarito:** o GRANT por coluna de `questoes` inclui `formato_texto`. Avisar quem
  pegar a fase 3, na nota de passagem da pasta compartilhada.
- O spec B começa por cima disto: `CampoTextoRico`, `TextoRico` e `BlocoDeCodigo` são as peças
  dos editores de resposta.

## O que este plano não cobre

- Lacuna com fórmula no enunciado (`formatFillBlankStatement`).
- Os prompts da IA emitindo LaTeX e código: spec C.
- `dificuldade` nas cópias (dívida anterior, registrada no PR 1).
