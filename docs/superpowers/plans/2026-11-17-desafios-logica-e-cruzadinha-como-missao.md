# Desafios de lógica e cruzadinha como missão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sugestão por conteúdo do console propõe 2 desafios de lógica e 2 cruzadinhas. O que o
professor seleciona vira missão por perfil, o aluno resolve no app e o banco corrige e paga moedas
e pontos no rank, uma vez por desafio. De carona, o prêmio de toda missão passa a somar no rank e o
aluno deixa de conseguir gravar o próprio prêmio.

**Architecture:** O banco faz tudo o que não é IA:
- colunas `desafio`/`conteudo_id`/`desafio_grupo` em `missoes`;
- gabarito em tabela que o aluno não lê;
- as RPCs `missao_desafio_criar` e `missao_desafio_responder`;
- o prêmio pelo mesmo caminho do laço de missão.

A edge `generate-content-ai` ganha o modo `desafios`, que só escreve a proposta. A grade é montada
por código (`montarCruzadinha`). O console mostra e aplica a proposta, e o mobile lê, mostra e
responde pela RPC.

**Tech Stack:** Postgres/plpgsql via Alembic (`api/alembic/versions`) e pytest (estrutura e e2e com
`tests/_f5_banco.py`). A edge roda em Deno/Gemini e é testada com vitest pelo `frontend`. Console
em React + supabase-js. Mobile em Expo/React Native + `node --test` (`mobile/testes/*.txt`).

**Spec:** `docs/superpowers/specs/2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`.
Leia a spec inteira antes da primeira tarefa: ela traz os achados com `arquivo:linha`.

## Restrições globais

- **Cada PR parte de `origin/main`**, numa worktree própria. O checkout principal
  (`feat/email-apps-script`) tem edições não commitadas em `GenerateTrailDialog.tsx` e
  `generate-content-ai`: não mexer nele. Não empilhar PR sobre a branch de outro PR.
- **Só abrir PR, nunca mesclar** (CLAUDE.md). Conta `gh` da Geisbelly.
- **Não aplicar migration em produção.** Medir em produção só com `BEGIN READ ONLY … ROLLBACK`,
  sem `SET` (por causa do pooler).
- **Revisão da migration:** a próxima livre depois de `alembic heads` da `origin/main` no dia (hoje
  a cabeça é `20261116_02`). Conferir de novo antes de abrir o PR, porque PRs abertos colidem no
  número. Nome: `AAAAMMDD_NN_<assunto>.py`.
- **Mudar o corpo de uma função que já existe é troca por âncora** sobre o texto vigente, no padrão
  de `20261103_06`/`_07` (`_modulo` + `_trocar`, falha no import se a âncora sumir). O texto
  vigente de `fn_missoes_guarda` e do gatilho de eventos foi reconstruído em `guarda.sql` e
  `gatilho20.sql` (scratchpad da sessão de design). Use como referência, mas a fonte é a cadeia de
  migrations.
- **Tabela nova nasce com policy no mesmo commit.** A tabela só de RPC diz isso no docstring.
- **Perfis em minúsculas**: `seeker, survivor, daredevil, mastermind, conqueror, socializer, achiever`.
- **Perfis padrão:** lógica para `mastermind` e `achiever`; cruzadinha para `seeker` e `mastermind`.
- **Recompensas** `desafio_logica` e `desafio_cruzadinha`: os mesmos `pontos` e `moedas` de
  `missao_concluida`, copiados no momento da migration (`INSERT … SELECT … ON CONFLICT DO NOTHING`).
- **Limites:** 20 tentativas por hora por `(aluno, desafio_grupo)`; cruzadinha com 4 a 10
  palavras; a IA propõe 6 a 10 palavras por cruzadinha.
- **Normalização de resposta:** minúsculas, sem acento, espaços colapsados e aparados. Na resposta
  curta, `,` decimal vira `.`. O mesmo vale no banco (`unaccent` se a extensão existir; senão
  `translate` com a tabela de acentos PT-BR) e no app, que só usa isso para exibir.
- **Rodar os passos do CI** do pacote inteiro antes de subir:
  - `api`: `ruff check .`, `pytest` e `TRAILUP_TEST_DOCKER=1 pytest tests/test_migrations_postgres.py`;
  - `frontend`: `npm run lint`, `npm run typecheck` e `npm test`;
  - `mobile`: `npm run lint`, `npm run typecheck`, `npm test` e os 5 grupos isolados.
- **Encoding:** UTF-8 sem BOM. Mensagens ao usuário em PT-BR com acento.
- **Não rodar `graphify update`**: ele apaga o cache. Se precisar, desfazer antes do commit.

## Foco da revisão

O que os testes das tarefas mais facilmente deixariam passar:

1. **Uma escrita legítima de evento passa a ser recusada pelo gatilho novo.**
   - Exemplo: o laço de missão chamado de dentro de um INSERT do próprio aluno.
   - O esperado é que o estudo do aluno continue gravando evento e que o prêmio continue saindo.
   - Teste na Tarefa 1: e2e "aluno insere `atividade_concluida`, a missão conclui e o prêmio entra".
2. **Aluno com dois perfis representativos troca o perfil ativo e resolve de novo.** O esperado
   é `ja_concluida`, sem segundo pagamento. Teste na Tarefa 4.
3. **Conteúdo apagado depois de o aluno ter resolvido.** O esperado é que a missão e o gabarito
   somam e que o prêmio já pago fique no razão. Teste na Tarefa 2 (cascade não apaga
   `eventos_aluno`).
4. **Cruzadinha com palavra de acento ou espaço** ("CORAÇÃO", "BANCO DE DADOS").
   - A grade usa letras sem acento e sem espaço, e a resposta com acento é aceita.
   - Testes na Tarefa 5 (`montarCruzadinha`) e na Tarefa 4 (normalização no banco).
5. **App sem rede ao "Conferir".** O esperado é erro legível, o preenchimento parcial mantido e
   nenhum prêmio mostrado. Teste na Tarefa 11 (`conferirDesafio` com falha de rede).

---

## PR 1 — prêmio de missão na turma e prêmio só pelo banco

### Task 1: migration `…_premio_de_missao_na_turma`

**Files:**
- Create: `api/alembic/versions/<REV_A>_premio_de_missao_na_turma.py`
- Test: `api/tests/test_migration_premio_de_missao_na_turma.py` (estrutura)
- Test: `api/tests/test_e2e_premio_de_missao_na_turma.py` (com `tests/_f5_banco.py`)

**Interfaces:**
- Produces: função `public.fn_eventos_aluno_premio_so_do_banco()` e gatilho
  `trg_eventos_aluno_premio_so_do_banco` (BEFORE INSERT em `eventos_aluno`). Os INSERTs de prêmio
  do laço de missão e de `fn_missao_guilda_avaliar` passam a ter a coluna `classe_id`. As Tarefas
  2 e 4 dependem disto.

- [ ] **Passo 1: medir em produção (só leitura)** e colar o resultado no docstring da migration:
  - (a) `SELECT tipo, count(*), sum(valor), count(*) FILTER (WHERE classe_id IS NULL) FROM eventos_aluno WHERE referencia LIKE 'missao:%' GROUP BY tipo;`
  - (b) os tipos de `eventos_aluno` gravados pelo app nos últimos 30 dias (`via`/claims, se houver
    coluna; senão `tipo` × `count` fora dos prefixos de prêmio);
  - (c) `SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('trg_eventos_aluno_after_iud','fn_missao_guilda_avaliar');`.
  - (d) Conferir também no código do mobile (`git grep "eventos_aluno" origin/main -- mobile/src`)
    que o app não grava `missao_concluida`, `missao_diaria_concluida` nem nenhum `recompensa_tipo`
    de `missoes`.
  - Se (a) mostrar valor maior que 0 com turma nula, a premissa da spec está errada: parar e avisar.
  - Ler `fn_fator_de_atraso` e o caminho das moedas (`20261020_03`) com `classe_id` preenchido:
    se algum deles reduzir ou duplicar o prêmio de missão, registrar no docstring e cobrir no e2e.
- [ ] **Passo 2: testes que falham.**
  - Estrutura:
    - `test_cadeia` (`revision`/`down_revision`);
    - `test_premio_grava_a_turma`: o SQL do upgrade contém
      `INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)`
      nos dois laços de missão e em `fn_missao_guilda_avaliar`, e nenhum INSERT de prêmio
      `'missao:'` sem `classe_id` sobra;
    - `test_downgrade_restaura`.
  - e2e:
    - `test_missao_concluida_soma_no_rank`: depois de a missão concluir, a linha de prêmio tem
      `classe_id = TURMA` e `valor = pontos de eventos_pontuacao` (semear `missao_concluida` com
      10 pontos);
    - `test_aluno_nao_grava_premio`: `como(c, A)` e INSERT `tipo='missao_concluida'` levanta
      `42501`;
    - `test_aluno_continua_gravando_estudo`: `como(c, A)` e INSERT `atividade_concluida` passa, e o
      prêmio da missão que ele conclui entra (Foco da revisão 1);
    - `test_service_role_grava_premio`: sem `como`, o INSERT passa.
- [ ] **Passo 3: rodar** `cd api && pytest tests/test_migration_premio_de_missao_na_turma.py tests/test_e2e_premio_de_missao_na_turma.py -v`. Esperado: FAIL (migration ausente).
- [ ] **Passo 4: implementar a migration.**
  - **Troca por âncora** nos INSERTs de prêmio: acrescentar `classe_id` com `v_missao.classe_id`
    no laço do aluno e no de `item_no_dia`, e com a turma da guilda em `fn_missao_guilda_avaliar`.
  - **Gatilho novo** `SECURITY INVOKER`, recusando com `ERRCODE '42501'` quando as quatro
    condições valem ao mesmo tempo:
    - `current_user IN ('authenticated','anon')`;
    - `coalesce(current_setting('app.missao_premiando', true), '') <> 'on'`;
    - `NEW.tipo` está em `('missao_concluida','missao_diaria_concluida','desafio_logica','desafio_cruzadinha')`;
    - ou `NEW.tipo` está em `SELECT recompensa_tipo FROM missoes`.
  - Seguir o padrão de `20261102_04`. Se o Passo 1(c) mostrar o gatilho de eventos como
    `SECURITY INVOKER`, o sinal `app.missao_premiando` é o que libera o caminho legítimo. Escrever
    no docstring qual dos dois vale.
  - Downgrade: volta os corpos anteriores e remove o gatilho.
- [ ] **Passo 5: rodar** os testes do Passo 3 e mais `TRAILUP_TEST_DOCKER=1 pytest tests/test_migrations_postgres.py`. Esperado: PASS.
- [ ] **Passo 6: commit** `fix(banco): prêmio de missão grava a turma e só o banco grava prêmio`, e abrir o PR 1 (corpo com a medição do Passo 1).

---

## PR 2 — banco dos desafios

### Task 2: migration `…_desafio_na_missao` (colunas, tabelas, guarda, avaliador)

**Files:**
- Create: `api/alembic/versions/<REV_B>_desafio_na_missao.py` (`down_revision = <REV_A>`)
- Test: `api/tests/test_migration_desafio_na_missao.py`
- Test: `api/tests/test_e2e_desafio_na_missao.py`

**Interfaces:**
- Consumes: Tarefa 1.
- Produces:
  - em `missoes`: `desafio jsonb`, `conteudo_id bigint`, `desafio_grupo uuid`;
  - as tabelas `missao_desafio_gabarito(desafio_grupo uuid PK, resposta jsonb NOT NULL, atualizado_em timestamptz)`
    e `missao_desafio_tentativa(id bigint identity PK, missao_id bigint, desafio_grupo uuid, aluno_id uuid, acertou boolean, palavras_certas smallint NULL, palavras_total smallint NULL, criado_em timestamptz default now())`;
  - as linhas `desafio_logica`/`desafio_cruzadinha` em `eventos_pontuacao`;
  - a métrica `desafio` aceita pela guarda;
  - o sinal de sessão `app.desafio_gravando` (`'on'` libera escrever `desafio`).

- [ ] **Passo 1: testes que falham.**
  - Estrutura:
    - `test_cadeia`;
    - `test_check_do_desafio`: `desafio IS NULL OR (escopo = 'aluno' AND conteudo_id IS NOT NULL AND desafio_grupo IS NOT NULL)`
      e `desafio->>'tipo' IN ('logica','cruzadinha')`;
    - `test_tabelas_nascem_com_policy`: há `CREATE POLICY` nas duas tabelas novas no mesmo
      upgrade;
    - `test_recompensas_copiam_missao_concluida`: há `INSERT INTO public.eventos_pontuacao … SELECT … FROM public.eventos_pontuacao WHERE tipo = 'missao_concluida'`.
  - e2e:
    - `test_aluno_nao_le_gabarito`: `como(c, A)` e `count(*) FROM missao_desafio_gabarito` dá 0
      com uma linha semeada;
    - `test_aluno_le_so_as_proprias_tentativas`;
    - `test_professor_de_outra_turma_nao_le`;
    - `test_professor_nao_grava_desafio_direto`: o professor dono faz `INSERT` em `missoes` com
      `desafio` e recebe erro, e o `UPDATE` de `desafio`/`criterio`/`conteudo_id`/`escopo`/`desafio_grupo`
      é congelado pela guarda (valor antigo mantido);
    - `test_professor_muda_perfil_e_desativa`: `perfil_alvo` e `ativa` mudam;
    - `test_avaliador_ignora_desafio`: a missão-desafio semeada, com eventos de estudo do aluno,
      continua sem `missao_aluno` concluída;
    - `test_apagar_conteudo_mantem_premio`: apagar o conteúdo leva a missão e o gabarito, e a linha
      de `eventos_aluno` fica (Foco da revisão 3).
- [ ] **Passo 2: rodar** `cd api && pytest tests/test_migration_desafio_na_missao.py tests/test_e2e_desafio_na_missao.py -v`. Esperado: FAIL.
- [ ] **Passo 3: implementar.**
  - Colunas e CHECKs.
  - FK `conteudo_id → conteudos(id) ON DELETE CASCADE`, e `missao_desafio_gabarito` sem FK para
    `missoes`, apagada por gatilho `AFTER DELETE` em `missoes` quando o grupo fica sem linha.
  - **Policies:**
    - gabarito: `FOR SELECT` só para o professor, via
      `EXISTS (SELECT 1 FROM missoes m WHERE m.desafio_grupo = … AND m.classe_id IN (SELECT app_classes_do_professor()))`,
      e nenhuma policy de escrita (a escrita é da RPC);
    - tentativa: SELECT do aluno (`aluno_id = auth.uid()`) e do professor (turma da missão), e
      nenhuma de escrita.
  - **Guarda (troca por âncora em `fn_missoes_guarda`):**
    - em INSERT, `NEW.desafio IS NOT NULL` sem `current_setting('app.desafio_gravando', true) = 'on'`
      levanta `42501`;
    - em UPDATE, com `OLD.desafio IS NOT NULL`, ficam congelados `desafio`, `criterio`,
      `conteudo_id`, `escopo` e `desafio_grupo`;
    - a métrica `desafio` passa na validação de `criterio`.
  - **Avaliador (troca por âncora):** `AND m.desafio IS NULL` nos SELECTs de missão do laço do
    aluno e do de `item_no_dia`.
  - **Índices:** `(classe_id, conteudo_id) WHERE desafio IS NOT NULL` e
    `missao_desafio_tentativa (aluno_id, desafio_grupo, criado_em)`.
- [ ] **Passo 4: rodar** os testes do Passo 2 e `test_migrations_postgres`. Esperado: PASS.
- [ ] **Passo 5: commit** `feat(banco): missão pode guardar um desafio, com gabarito que o aluno não lê`.

### Task 3: RPC `missao_desafio_criar`

**Files:**
- Create: `api/alembic/versions/<REV_C>_missao_desafio_criar.py`
- Test: `api/tests/test_e2e_missao_desafio_criar.py` (+ `test_cadeia` no mesmo arquivo)

**Interfaces:**
- Consumes: Tarefa 2.
- Produces: `public.missao_desafio_criar(p_conteudo_id bigint, p_desafio jsonb, p_resposta jsonb, p_perfis text[]) RETURNS TABLE (missao_id bigint, perfil_alvo text, desafio_grupo uuid)`,
  `SECURITY DEFINER`, `SET search_path = public`, EXECUTE para `authenticated`.
  - Formato de `p_desafio`: o da spec. Formato de `p_resposta`: lógica `{"aceitas": text[]}`,
    cruzadinha `{"palavras": {"<numero><h|v>": text}}`.
  - Erros com `ERRCODE '22023'` e mensagem PT-BR. Posse: `42501`.

- [ ] **Passo 1: testes que falham.**
  - `test_cria_uma_por_perfil`: 2 perfis dão 2 missões com o mesmo `desafio_grupo`, mais 1 linha
    de gabarito, com `origem='ia'`, `aprovacao='aprovada'`, `escopo='aluno'`,
    `categoria='secundaria'`, `criterio = {"metrica":"desafio"}` e
    `recompensa_tipo = 'desafio_' || tipo`.
  - `test_professor_de_outra_turma_recusado` (`42501`, nada gravado).
  - `test_grade_inconsistente_recusada`: dois cruzamentos com letras diferentes dão `22023`.
  - `test_palavra_fora_da_grade_recusada`.
  - `test_cruzadinha_com_3_palavras_recusada` e `…_com_11_recusada`.
  - `test_logica_multipla_resposta_fora_das_alternativas_recusada`.
  - `test_perfil_invalido_recusado` e `test_sem_perfis_recusado`.
  - `test_titulo_e_descricao`: título `Desafio de lógica: <título do conteúdo>` ou
    `Cruzadinha: <título do conteúdo>`, cortado em 120.
- [ ] **Passo 2: rodar** e ver FAIL.
- [ ] **Passo 3: implementar.**
  - Conferir a posse antes de ler:
    `NOT EXISTS (SELECT 1 FROM conteudos c JOIN topicos t ON … WHERE c.id = p_conteudo_id AND t.classe_id IN (SELECT app_classes_do_professor()))`.
  - Validar e, na cruzadinha, conferir cada palavra: ela cabe na grade, o comprimento é igual a
    `tamanho` e toda célula compartilhada tem a mesma letra.
  - `set_config('app.desafio_gravando','on', true)`, INSERTs e `set_config(…, '', true)`; o
    `EXCEPTION` também limpa o sinal.
- [ ] **Passo 4: rodar** e ver PASS.
- [ ] **Passo 5: commit** `feat(banco): missao_desafio_criar grava o desafio por perfil numa transação`.

### Task 4: RPC `missao_desafio_responder`

**Files:**
- Create: `api/alembic/versions/<REV_D>_missao_desafio_responder.py`
- Test: `api/tests/test_e2e_missao_desafio_responder.py`

**Interfaces:**
- Consumes: Tarefas 1 a 3.
- Produces: `public.missao_desafio_responder(p_missao_id bigint, p_resposta jsonb) RETURNS jsonb`,
  `SECURITY DEFINER`, EXECUTE para `authenticated`.
  - Retorno `{"acertou": bool, "ja_concluida": bool, "palavras_certas": int|null, "palavras_total": int|null}`.
  - Erros: `42501` (sem acesso) e `P0001` com `MESSAGE = 'limite_de_tentativas'` (21ª tentativa
    na hora).
  - `p_resposta`: lógica `{"resposta": text}`, cruzadinha `{"palavras": {"1h": text, …}}`.

- [ ] **Passo 1: testes que falham.**
  - `test_acerto_paga_uma_vez`: acertar dá `acertou=true`; `missao_aluno` fica `concluida`; o
    prêmio tem `classe_id` e o valor de `desafio_logica`.
  - `test_segundo_acerto_ja_concluida`: não grava um segundo prêmio.
  - `test_outra_linha_do_grupo_nao_paga`: o aluno tem `mastermind` e `achiever` representativos;
    resolve pela linha `mastermind`, troca o ativo e chama pela linha `achiever`. O resultado é
    `ja_concluida=true` e um prêmio só (Foco da revisão 2).
  - `test_paralelo_paga_uma_vez`: duas conexões chamam ao mesmo tempo, com
    `pg_advisory_xact_lock`, e sai um prêmio.
  - `test_erro_grava_tentativa_sem_premio`.
  - `test_cruzadinha_conta_palavras_certas`: 2 de 5 certas dão `palavras_certas=2`,
    `palavras_total=5`, e o retorno não tem chave de resposta.
  - `test_normaliza`: `"Coração "` aceita `CORACAO`, e `"3,5"` aceita `3.5` (Foco da revisão 4).
  - `test_resposta_nunca_volta`: nenhuma chave do retorno contém o texto do gabarito.
  - `test_outra_turma_recusada`, `test_perfil_que_nao_e_do_aluno_recusado`,
    `test_missao_inativa_recusada`.
  - `test_limite_por_hora`: a 21ª tentativa na janela levanta `limite_de_tentativas` sem gravar.
- [ ] **Passo 2: rodar** e ver FAIL.
- [ ] **Passo 3: implementar.**
  - **Acesso:** a missão `ativa`, com `aprovacao IN ('nao_requer','aprovada')` e
    `classe_id IN (SELECT app_classes_do_aluno())`, e
    `EXISTS (missão do mesmo grupo com perfil_alvo ∈ perfis representativos do aluno)`. Os perfis
    representativos são a mesma regra de `fn_perfil_da_missao`, sem o "ativo primeiro". Ler a
    função e reaproveitar o CTE `representativos`, sem reescrever a regra.
  - **Trava** `pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_grupo::text, 0))`.
  - **Limite** por `count(*)` em `missao_desafio_tentativa` com `criado_em > now() - interval '1 hour'`.
  - **Prêmio:** o INSERT em `eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)`
    com `referencia = 'missao:' || id` e `valor = 0` (o gatilho de valor resolve), sob
    `app.missao_premiando`, como a Tarefa 1.
  - **`missao_aluno`:** `INSERT … ON CONFLICT (aluno_id, missao_id) DO UPDATE SET status='concluida', progresso=100, concluida_em=now()`.
- [ ] **Passo 4: rodar** e ver PASS; depois toda a suíte `api` dos passos do CI.
- [ ] **Passo 5: commit** `feat(banco): missao_desafio_responder corrige, limita e paga uma vez por desafio`, e abrir o PR 2.

---

## PR 3 — edge `generate-content-ai`, modo `desafios`

### Task 5: `montarCruzadinha`

**Files:**
- Create: `frontend/supabase/functions/generate-content-ai/montarCruzadinha.ts`
- Test: `frontend/supabase/functions/generate-content-ai/montarCruzadinha.test.ts`

**Interfaces:**
- Produces:
  - `type PalavraComPista = { palavra: string; pista: string }`;
  - `type PalavraNaGrade = { numero: number; direcao: "h" | "v"; linha: number; coluna: number; tamanho: number; pista: string }`;
  - `type Cruzadinha = { linhas: number; colunas: number; palavras: PalavraNaGrade[]; resposta: Record<string, string> }`;
    a chave da resposta é `${numero}${direcao}`, e o valor é a palavra em MAIÚSCULAS sem acento
    nem espaço;
  - `export function montarCruzadinha(entrada: PalavraComPista[], opcoes?: { maxLado?: number }): Cruzadinha | null`;
  - `export function letrasDaGrade(palavra: string): string`, a normalização para a grade.
  - O app (Tarefa 10) e o banco (Tarefa 3) usam o mesmo formato.

- [ ] **Passo 1: testes que falham.**
  - `devolve null com menos de 4 palavras posicionadas`.
  - `toda célula compartilhada tem a mesma letra`: percorrer `palavras` e montar o mapa
    célula → letra pela `resposta`.
  - `descarta palavra que não cruza e mantém as outras`.
  - `normaliza acento e espaço`: `CORAÇÃO` vira `CORACAO` e `banco de dados` vira `BANCODEDADOS`
    (Foco da revisão 4).
  - `ignora palavra repetida e palavra com menos de 3 letras`.
  - `numeração em ordem de leitura`: a mesma célula inicial tem o mesmo número para h e v.
  - `grade cabe em maxLado` (padrão 15) e é aparada sem borda vazia.
  - `determinística`: a mesma entrada dá a mesma saída.
- [ ] **Passo 2: rodar** `cd frontend && npx vitest run supabase/functions/generate-content-ai/montarCruzadinha.test.ts` e ver FAIL.
- [ ] **Passo 3: implementar** o algoritmo guloso:
  - ordenar por comprimento decrescente (empate pela ordem de entrada);
  - a primeira palavra vai na horizontal;
  - para cada palavra seguinte, tentar todo cruzamento letra a letra com as já postas, em direção
    perpendicular;
  - rejeitar se colidir, se encostar lado a lado numa palavra paralela ou se passar de `maxLado`;
  - escolher o cruzamento com mais interseções e, no empate, o primeiro;
  - no fim, aparar a grade e numerar.
  - Sem dependência externa: o arquivo é importado pela edge (Deno) e pelo console (Vite).
- [ ] **Passo 4: rodar** e ver PASS.
- [ ] **Passo 5: commit** `feat(edge): monta a grade da cruzadinha por código`.

### Task 6: modo `desafios`

**Files:**
- Create: `frontend/supabase/functions/generate-content-ai/desafios.ts` (schema, prompt e normalização, sem rede)
- Test: `frontend/supabase/functions/generate-content-ai/desafios.test.ts`
- Modify: `frontend/supabase/functions/generate-content-ai/index.ts` (o modo novo no `serve`, ao lado de `content`; `RequestBody.mode` ganha `"desafios"`)

**Interfaces:**
- Consumes: `montarCruzadinha`, `criarFiltroDeRepetidas` (de `repetidas.ts`) e a montagem de
  contexto e material que o modo `content` já usa.
- Produces: o corpo de entrada é igual ao do modo `content` mais `mode: "desafios"`. A resposta
  é `{ desafios: PropostaDeDesafio[]; descartados: number }`, com
  `type PropostaDeDesafio = { tipo: "logica" | "cruzadinha"; titulo: string; desafio: DesafioPublico; resposta: { aceitas: string[] } | { palavras: Record<string,string> }; perfis: string[] }`,
  em que `DesafioPublico` é o formato público da spec. Exportar os tipos: o console os importa.
  - `export const DESAFIOS_SCHEMA` (Gemini `responseSchema`);
  - `export function promptDeDesafios(ctx): string`;
  - `export function normalizarDesafios(bruto: unknown, filtro: FiltroDeRepetidas): { desafios: PropostaDeDesafio[]; descartados: number }`.

- [ ] **Passo 1: testes que falham** (`desafios.test.ts`):
  - `aceita 2 lógicas e 2 cruzadinhas e põe os perfis padrão`;
  - `cruzadinha que não monta é descartada e contada`;
  - `lógica múltipla com resposta fora das alternativas é descartada`;
  - `lógica curta junta resposta e sinônimos em aceitas, sem repetir forma normalizada`;
  - `corta em 2 por tipo`;
  - `enunciado repetido do tópico é descartado pelo filtro`;
  - `desafio público não contém a resposta` (serializar `desafio` e procurar cada palavra e cada
    `aceita`);
  - `DESAFIOS_SCHEMA exige os campos que normalizarDesafios lê`.
- [ ] **Passo 2: rodar** `cd frontend && npx vitest run supabase/functions/generate-content-ai/desafios.test.ts` e ver FAIL.
- [ ] **Passo 3: implementar `desafios.ts`.**
  - O prompt pede, sobre o material do conteúdo:
    - 2 desafios de lógica que exijam raciocínio sobre o que o texto ensinou (sequência, dedução,
      padrão), não lembrança literal, com formato `multipla` (4 alternativas) ou `curta`;
    - 2 listas de 6 a 10 termos do próprio conteúdo, com pista de até 80 caracteres que não
      contenha o termo.
  - Inclui `REGRAS_DE_TERMOS` e o bloco do material.
- [ ] **Passo 4: ligar em `index.ts`.**
  - Ramo `mode === "desafios"`: mesma autenticação, contexto, material e rotação Gemini do modo
    `content`; `responseSchema: DESAFIOS_SCHEMA`; até `CONTENT_GEN_ATTEMPTS`; responde
    `jsonResponse(normalizarDesafios(...))`.
  - Não tocar nos modos que já existem.
- [ ] **Passo 5: rodar** `cd frontend && npm run lint && npm run typecheck && npm test`. Esperado: PASS.
- [ ] **Passo 6: medir uma vez com o modelo real**, dentro da cota: um conteúdo de uma turma de QA.
  Registrar no PR quantas propostas vieram e quantas foram descartadas.
- [ ] **Passo 7: commit** `feat(edge): modo desafios propõe lógica e cruzadinha por conteúdo`, e abrir o PR 3. No corpo, o passo de deploy manual da edge (memória "Deploy de edge function": cópia limpa e comparar com a `main` antes e depois). O deploy é com o OK da Geisbelly.

---

## PR 4 — console

### Task 7: desafios na fila de sugestões do `TopicEditDrawer`

**Files:**
- Create: `frontend/src/components/console/trilha/desafiosApi.ts`, `desafiosApi.test.ts`
- Create: `frontend/src/components/console/trilha/ListaDeDesafios.tsx` (a lista selecionável e a miniatura da grade)
- Modify: `frontend/src/components/console/trilha/TopicEditDrawer.tsx` (`handleGenerateForContent` e `handleApplySuggestions`)

**Interfaces:**
- Consumes: `PropostaDeDesafio` (Tarefa 6) e a RPC `missao_desafio_criar` (Tarefa 3).
- Produces:
  - `export async function gerarDesafios(corpo: Record<string, unknown>): Promise<PropostaDeDesafio[]>`;
  - `export async function criarDesafios(conteudoId: number, propostas: PropostaDeDesafio[]): Promise<{ criados: number; falhas: string[] }>`,
    que chama uma RPC por proposta, sem parar na primeira falha.

- [ ] **Passo 1: testes que falham** (`desafiosApi.test.ts`, com o mock de supabase no padrão de `missoesApi.test.ts`):
  - `criarDesafios chama a RPC com p_conteudo_id, p_desafio, p_resposta e p_perfis`;
  - `uma falha não impede as outras e volta em falhas com a mensagem do banco`;
  - `gerarDesafios manda mode desafios e devolve a lista`.
- [ ] **Passo 2: rodar** `cd frontend && npx vitest run src/components/console/trilha/desafiosApi.test.ts` e ver FAIL.
- [ ] **Passo 3: implementar `desafiosApi.ts` e ligar no drawer.**
  - Com `alvoId` salvo, `handleGenerateForContent` dispara `gerarDesafios` em paralelo com
    `content`, e os desafios entram no item da fila (`sugestao.desafios`).
  - Com `alvoId = null`, aparece o aviso "Salve o conteúdo para gerar desafios."
  - Se `gerarDesafios` falhar, aparece o toast "Os desafios não vieram desta vez; os cards e as
    atividades estão abaixo." e o resto segue.
  - `ListaDeDesafios` mostra:
    - o tipo e o enunciado, ou a miniatura da grade feita com `montarCruzadinha`;
    - a resposta e os perfis, em chips editáveis com os 7 perfis e o padrão marcado;
    - a recompensa ("moedas e pontos de missão").
  - "Aplicar" chama `criarDesafios` só para os selecionados e o toast diz quantos foram criados.
- [ ] **Passo 4: rodar** `npm run lint && npm run typecheck && npm test` e ver PASS.
- [ ] **Passo 5: verificar no navegador** com o dev server local (`preview_start`):
  - o drawer mostra os desafios;
  - aplicar cria as missões (banco local do Docker);
  - tirar captura.
- [ ] **Passo 6: commit** `feat(console): sugestão por conteúdo traz desafios para virar missão`.

### Task 8: aba Missões e métrica da IA

**Files:**
- Modify: `frontend/src/components/console/missoes/missoesApi.ts` (ler `desafio`, `desafio_grupo`, `conteudo_id`), `missao.ts` (agrupar), `CartaoDaMissao.tsx` (selo e perfis), `aprovacao.ts` (`podeEditar` falso para desafio)
- Modify: `frontend/src/components/console/recomendacoes/missoesIaApi.ts` (`.is("desafio", null)` nas leituras do painel e da taxa)
- Test: `missao.test.ts`, `aprovacao.test.ts`, `missoesIa.test.ts`

**Interfaces:**
- Produces:
  - `export function agruparDesafios(missoes: Missao[]): Missao[]`: uma entrada por
    `desafio_grupo`, com `perfis: string[]`;
  - "Desativar" atualiza `ativa=false` em todas as linhas do grupo;
  - mudar o perfil é UPDATE de `perfil_alvo` só nas linhas que já existem, sem inserir nem apagar
    linha. Acrescentar perfil fica fora da v1, e o cartão diz isso.

- [ ] **Passo 1: testes que falham:**
  - `agruparDesafios junta as linhas do mesmo grupo e mantém as comuns`;
  - `podeEditar é falso para missão com desafio`;
  - `a taxa de aprovação da IA ignora desafios`.
- [ ] **Passo 2: rodar** e ver FAIL.
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: rodar** `npm run lint && npm run typecheck && npm test` e ver PASS. Conferir no navegador.
- [ ] **Passo 5: commit** `feat(console): aba Missões mostra o desafio uma vez, com selo e perfis`, e abrir o PR 4.

---

## PR 5 — mobile

### Task 9: o app passa a ver missão da IA (pode ir antes, em PR próprio)

**Files:**
- Modify: `mobile/src/services/missoes/missaoModel.ts` (`OrigemDaMissao` ganha `"ia"`; `montarMissoes` mantém `ia`; `ordenarMissoes` dá a `ia` o peso de `professor`; rótulo "Sugerida")
- Modify: `mobile/src/services/missoes/missoesDoDia.ts` (o `or` inclui `origem.eq.ia`)
- Modify: `mobile/src/components/missoes/MissoesDoDia.tsx` e `RastreadorDeMissoes.tsx` (rótulo de origem)
- Test: `mobile/src/services/missoes/missaoModel.test.ts`

- [ ] **Passo 1: testes que falham:**
  - `montarMissoes mantém origem ia`;
  - `ordenarMissoes não põe ia junto da diária`;
  - `missão ia com prazo vencido sai, como a do professor`.
- [ ] **Passo 2: rodar** `cd mobile && npm test` e ver FAIL.
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: rodar** `npm run lint && npm run typecheck && npm test` e os 5 grupos isolados, e ver PASS.
- [ ] **Passo 5: commit** `fix(mobile): missão sugerida pela IA e aprovada aparece para o aluno`.

### Task 10: leitura dos desafios e núcleo da cruzadinha

**Files:**
- Create: `mobile/src/services/missoes/desafio.core.ts` + `desafio.core.test.ts` (tipos, `respostaDaGrade`, `palavraDaCelula`, `proximaCelula`, `estaCompleta`)
- Create: `mobile/src/services/missoes/desafios.ts` (leitura e RPC)
- Modify: `missoesDoDia.ts` (`desafio IS NULL` na consulta comum; nova `carregarDesafiosDoTopico`), `rastreadorDeMissoes.core.ts` (`DestinoDaMissao` ganha `{ tipo: "desafio"; missaoId: number }`; `rotaDoDestino` leva a `/desafio/[id]`, na pilha raiz; ver a nota da Tarefa 11), `rastreadorDeMissoes.ts` (recompensa de `eventos_pontuacao`, não da turma)
- Modify: `mobile/testes/principal.txt` (os testes novos)

**Interfaces:**
- Produces:
  - `export async function carregarDesafiosDoTopico(classeId: number, topicoIds: number[], perfis: string[]): Promise<MissaoComDesafio[]>`,
    uma por `desafio_grupo`, filtrada por `.in('perfil_alvo', perfis)` e por conteúdo dos tópicos;
  - `export async function conferirDesafio(missaoId: number, resposta: RespostaDoAluno): Promise<ResultadoDoDesafio>`,
    que mapeia `limite_de_tentativas` e erro de rede para `{ erro: "limite" | "rede" | "outro" }`;
  - os tipos `DesafioPublico`, `RespostaDoAluno` e `ResultadoDoDesafio`, iguais ao formato da
    spec e da RPC (Tarefa 4).

- [ ] **Passo 1: testes que falham** (`desafio.core.test.ts`, rastreador):
  - `palavraDaCelula escolhe a horizontal e o segundo toque troca para a vertical`;
  - `proximaCelula pula célula preenchida e para no fim da palavra`;
  - `respostaDaGrade monta {"1h": …} a partir das células`;
  - `estaCompleta é falso com célula vazia`;
  - `destino de missão com desafio é a tela do desafio`;
  - `um desafio por grupo e nunca mais do que as missões comuns cabem no limite`.
- [ ] **Passo 2: rodar** e ver FAIL.
- [ ] **Passo 3: implementar.**
  - Os tópicos lidos são o da vez e o anterior (`topicoDaVez`, e o de `sequence` imediatamente
    menor).
  - `perfis` = `perfisRepresentativos(...)` do aluno.
  - Fallback `42703` se as colunas não existirem.
- [ ] **Passo 4: rodar** `npm test` e os grupos isolados, e ver PASS.
- [ ] **Passo 5: commit** `feat(mobile): lê os desafios do tópico da vez como missão`.

### Task 11: tela do desafio

> **Nota (revisão final, 19/11):** duas coisas desta tarefa mudaram depois da execução, e o texto
> abaixo fica como estava. A tela foi para a pilha raiz, `mobile/src/app/desafio/[id].tsx` (rota
> `/desafio/[id]`): dentro da aba Social, o "Resolver" do rastreador passava por cima do cadeado
> da aba e a deixava sem "voltar". E a chave do rascunho é `desafio:<alunoId>:<grupo>`, não
> `desafio:<desafio_grupo>`: sem o aluno, a resposta vazava entre alunos no mesmo aparelho.

**Files:**
- Create: `mobile/src/app/(tabs)/social/desafio/[id].tsx`
- Create: `mobile/src/components/missoes/DesafioDeLogica.tsx`, `Cruzadinha.tsx`, `PremioDoDesafio.tsx`
- Create: `mobile/src/services/missoes/rascunhoDoDesafio.ts` + teste (o parcial salvo no aparelho, chave `desafio:<desafio_grupo>`, AsyncStorage com try/catch)
- Modify: `MissoesDoDia.tsx` (botão "Resolver"), `RastreadorDeMissoes.tsx` ("Ir" do desafio)

**Interfaces:**
- Consumes: `conferirDesafio`, `desafio.core.ts` (Tarefa 10).

- [ ] **Passo 1: testes que falham** (puros):
  - `rascunho salva e relê o parcial`;
  - `rascunho é apagado ao acertar`;
  - `conferirDesafio com falha de rede devolve erro rede e mantém o rascunho` (Foco da revisão 5).
- [ ] **Passo 2: rodar** e ver FAIL.
- [ ] **Passo 3: implementar a tela.**
  - **Textos fixos:**
    - "Conferir";
    - errou: "Ainda não. Tente de novo.";
    - na cruzadinha, "{n} de {total} palavras certas";
    - limite: "Muitas tentativas seguidas. Tente de novo daqui a pouco.";
    - rede: "Sem conexão. Sua resposta continua aqui.";
    - concluída: só leitura, com "Desafio resolvido".
  - **Acessibilidade:** cada célula com `accessibilityLabel` ("linha 2, coluna 3, palavra 4
    horizontal") e as pistas como lista.
- [ ] **Passo 4: rodar** `npm run lint && npm run typecheck && npm test` e os grupos isolados, e ver PASS.
- [ ] **Passo 5: verificar no emulador Android** com o APK de dev (memória "Testar layout do
  mobile no Android"):
  - lógica e cruzadinha, acerto, erro, limite e modo avião;
  - capturas.
  - Um passo por vez, sem navegação em rajada em produção.
- [ ] **Passo 6: commit** `feat(mobile): o aluno resolve o desafio de lógica e a cruzadinha na missão`, e abrir o PR 5.

---

## Depois dos merges (o time mescla)

- Abrir o sync no espelho `Geisbelly/TrailUp` a cada avanço da `main` do Lab, no formato de
  sempre, listando as migrations novas.
- Deploy manual da edge (PR 3), com o OK da Geisbelly.
- Conferir no ar, logado, com uma turma de QA:
  - gerar os desafios de um conteúdo, aplicar e resolver como aluno do perfil;
  - ver o prêmio no rank.
