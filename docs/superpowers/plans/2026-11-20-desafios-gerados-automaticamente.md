# Desafios gerados automaticamente — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendada) ou
> superpowers:executing-plans, tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** todo conteúdo publicado e parado há 1 hora, de professor com geração automática, ganha
2 desafios de lógica e 2 cruzadinhas gerados no servidor. Eles esperam a aprovação do professor na
aba Missões.

**Arquitetura:**
- O banco decide quem entra, reivindica, grava como `pendente`, avisa o professor e guarda as
  tentativas.
- A API só faz o laço: pede ao banco o material de um conteúdo, chama a edge `generate-content-ai`
  (`mode: "desafios"`) com a chave de serviço e devolve a resposta ao banco.
- O console mostra o grupo pendente e decide por uma RPC.

**Stack:**
- Postgres/Supabase com migration Alembic;
- FastAPI com laço `asyncio` e `httpx`;
- edge Deno com testes em vitest;
- console em Vite/React/TS com vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-desafios-gerados-automaticamente-design.md` (e a de
17/11, `2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`, no que esta não muda).

**Branch:** `feat/desafios-automaticos` no worktree `.worktrees/desafios-auto`, a partir da `main`.
Um PR só, aberto pela conta `Geisbelly`. Nunca mesclar.

## Restrições globais

- A migration é `api/alembic/versions/20261120_03_desafios_gerados_automaticamente.py`, com
  `revision = "20261120_03"` e `down_revision = "20261120_02"` (na `main`, a `20261120_01` é
  `premio_de_conquista_idempotente` e a `20261120_02` é `notificacao_rotina_com_o_topico_do_aluno`). Antes do PR, conferir na `main`
  que `alembic heads` ainda dá uma cabeça só.
- **Nada é aplicado em produção daqui.** Os testes de banco rodam no Postgres local do
  `tests/_f5_banco.py`, com os gatilhos de verdade.
- **Nenhum teste chama o Gemini de verdade.** A geração real contra um conteúdo de teste exige o
  OK da autora.
- A edge não é publicada daqui. O deploy é manual, com OK, depois do merge.
- Funções novas são `SECURITY DEFINER` e `SET search_path = public, pg_temp`, com `REVOKE ALL ...
  FROM PUBLIC, anon, authenticated`. Só a RPC do console tem `GRANT ... TO authenticated`.
- `desafios_auto_tentativas` nasce sem policy, e o docstring da migration diz que isso é de
  propósito: a tabela é só do servidor.
- As chaves de `app_config` são `publico = false` e têm `descricao`. Padrões:
  - `desafios_auto_ligado` = `true`;
  - `desafios_auto_por_passada` = `2`;
  - `desafios_auto_intervalo_seg` = `600`;
  - `desafios_auto_por_dia` = `20`;
  - `desafios_auto_carencia_min` = `60`.
- Perfis padrão (minúsculos, como em `missoes.perfil_alvo`): lógica → `mastermind`, `achiever`;
  cruzadinha → `seeker`, `mastermind`.
- No SQLAlchemy, `text()` usa `CAST(:p AS tipo)`, nunca `:p::tipo`. `COALESCE` de enum leva `::text`.
- Todo texto em PT-BR, UTF-8 sem BOM. Não rodar `graphify update`.

## Foco da revisão

1. **Professor aplica pelo botão enquanto o worker grava o mesmo conteúdo.** Sai um grupo do
   worker *ou* nenhum, nunca os dois por cima. Coberto pelo teste de trava da Tarefa 1.
2. **API cai no meio de uma geração** e a linha fica `gerando`. Passada a trava (10 min), outro
   laço reivindica de novo, sem contar como falha. Teste na Tarefa 1.
3. **A edge devolve 429 de limite por minuto em toda chamada.** Nenhum conteúdo vira `falhou`
   definitivo por isso. A passada para, e o conteúdo volta em 15 min. Teste na Tarefa 3.
4. **O professor desliga a geração automática depois do desafio gerado.** O que já foi gerado fica
   pendente; ele aprova ou recusa. Nada novo nasce. Teste na Tarefa 1.
5. **Conteúdo editado depois de entrar na lista e antes de ser reivindicado.** A reivindicação
   confere a carência de novo e não pega. Teste na Tarefa 1.

---

### Task 1: banco (migration + testes e2e)

**Arquivos:**
- Criar: `api/alembic/versions/20261120_03_desafios_gerados_automaticamente.py`
- Criar: `api/tests/test_migration_desafios_gerados_automaticamente.py` (estrutura, sem banco)
- Criar: `api/tests/test_e2e_desafios_gerados_automaticamente.py` (Postgres local, molde de
  `test_e2e_missao_desafio_criar.py`, mesma cadeia `t1._cadeia()` + `20261117_02` + `_03`, e a
  `20261102_20` e a `20261102_17`/`_23` para `missao_ia_pedir` e o sino)

**Interfaces:**
- Produz, para a Tarefa 3 (chamadas como `service_role`):
  - `fn_desafios_auto_config() RETURNS jsonb`. Devolve `{ligado bool, por_passada int,
    intervalo_seg int, por_dia int, carencia_min int}`; valor ausente ou inválido em `app_config`
    vira o padrão.
  - `fn_desafios_auto_candidatos(p_limite int, p_classes bigint[] DEFAULT NULL) RETURNS TABLE
    (conteudo_id bigint, classe_id bigint)`. Só lê.
  - `fn_desafios_auto_reivindicar(p_limite int, p_trava_seg int, p_classes bigint[] DEFAULT NULL)
    RETURNS SETOF bigint`. Devolve os `conteudo_id` reivindicados, que ficam `gerando`.
  - `fn_desafios_auto_contexto(p_conteudo_id bigint) RETURNS jsonb`. Devolve o corpo da edge
    quase pronto (abaixo), ou `NULL` se o conteúdo sumiu.
  - `fn_missao_desafio_registrar_auto(p_conteudo_id bigint, p_desafios jsonb) RETURNS jsonb`.
    Devolve `{estado: 'gerado'|'sem_desafio'|'ja_tinha', gravados int, pulados int}`.
  - `fn_desafios_auto_falhou(p_conteudo_id bigint, p_erro text, p_espera_min int) RETURNS text`.
    Devolve o estado em que a linha ficou (`'falhou'` ou `'esperando'`).
- Produz, para a Tarefa 4 (`authenticated`):
  - `missao_desafio_decidir(p_grupo uuid, p_aprovar boolean, p_motivo text DEFAULT NULL) RETURNS
    integer`, com o número de linhas mudadas.
- Produz, para a Tarefa 4: `professor_notificacoes.tipo` aceita `'desafio_para_aprovar'`, e
  `destino` aceita `'missoes'`.

**O que a migration faz**, na ordem do `upgrade()`:

1. **`conteudos.atualizado_em timestamptz NOT NULL`.**
   - Backfill com `created_at`.
   - Gatilho `trg_conteudos_atualizado_em` (BEFORE INSERT OR UPDATE) põe `now()` sempre; o
     cliente não escolhe o valor.
   - Um UPDATE que não muda nada (`NEW IS NOT DISTINCT FROM OLD`, ignorando a própria coluna)
     não conta.
2. **`desafios_auto_tentativas`:**
   - colunas `conteudo_id bigint PK REFERENCES conteudos ON DELETE CASCADE`, `estado text NOT NULL
     CHECK (estado IN ('gerando','gerado','sem_desafio','falhou','esperando'))`, `tentativas int
     NOT NULL DEFAULT 0`, `proxima_em timestamptz`, `iniciada_em timestamptz NOT NULL`, `erro
     text`, `atualizado_em timestamptz NOT NULL DEFAULT now()`;
   - `esperando` é o limite por minuto: não conta como falha (o nome é decisão do plano);
   - índice em `iniciada_em`, para o teto do dia.
3. **`app_config`:** as cinco chaves, com `ON CONFLICT (chave) DO NOTHING`.
4. **O sino:** troca os CHECKs `professor_notificacoes_tipo_ck` e `_destino_ck`, partindo dos
   valores de produção (`20261102_23`) e somando `'desafio_para_aprovar'` e `'missoes'`.
5. **`fn_missao_desafio_gravar(p_conteudo_id bigint, p_desafio jsonb, p_resposta jsonb, p_perfis
   text[], p_aprovacao text, p_criado_por uuid) RETURNS TABLE (missao_id bigint, perfil_alvo
   text, desafio_grupo uuid)`.**
   - O texto sai de `M17_03.RPC` por âncoras (`_trocar`, que falha se a âncora sumir):
     - renomear a função;
     - tirar o bloco de posse;
     - `'ia', 'aprovada'` → `'ia', p_aprovacao`;
     - `auth.uid()` → `p_criado_por`;
     - trocar o REVOKE/GRANT por REVOKE de `PUBLIC, anon, authenticated`.
   - A validação e o sinal `app.desafio_gravando` continuam iguais.
6. **`missao_desafio_criar`:** recriada como posse (o mesmo bloco de antes) +
   `pg_advisory_xact_lock(hashtextextended('missao_desafio:' || p_conteudo_id::text, 0))` +
   `RETURN QUERY SELECT * FROM fn_missao_desafio_gravar(..., 'aprovada', auth.uid())`. Mesma
   assinatura e GRANT de antes.
7. **`fn_desafios_auto_config`**, como na interface acima.
8. **`fn_desafios_auto_candidatos`.** Conteúdo entra quando valem todas as regras do item 1 da
   spec:
   - tópico da turma;
   - `professor.geracao_automatica`;
   - ≥ 1 linha em `classe_aluno`;
   - nenhuma `missoes` com `desafio IS NOT NULL AND conteudo_id = c.id`;
   - sem tentativa em `gerado`/`sem_desafio`, nem em `falhou` com `tentativas >= 3`;
   - sem `proxima_em > now()`;
   - `app_topico_liberado(t.publicacao, t.publicar_em)`;
   - `c.atualizado_em <= now() - carencia`;
   - com material. Material é `btrim(c.conteudo) <> ''`, uma `fontes_personalizacao` com
     `conteudo_id = c.id`, ou `c.metadata ? 'media_storage_path'`;
   - com `p_classes`, só essas turmas.

   Ordem: `t.ordem, c.created_at, c.id`.
9. **`fn_desafios_auto_reivindicar`:**
   - lê a config;
   - se `ligado = false`, devolve vazio;
   - calcula a sobra do dia: `por_dia` menos as tentativas com `iniciada_em` desde a meia-noite
     de `America/Los_Angeles`, a mesma virada da cota;
   - pega até `least(p_limite, sobra)` candidatos;
   - para cada um, faz `INSERT ... ON CONFLICT (conteudo_id) DO UPDATE SET estado='gerando',
     iniciada_em=now(), atualizado_em=now() WHERE <a linha não está gerando, ou está há mais de
     p_trava_seg>`. A trava da linha impede dois laços no mesmo conteúdo;
   - **confere a carência de novo** dentro da reivindicação (Foco 5).
10. **`fn_desafios_auto_contexto`.** Devolve o corpo da edge em jsonb:
    - `mode: "desafios"`;
    - `topicName` = título do conteúdo;
    - `topicoNome`, `topicoDescricao`, `classeNome` (`classe.descricao`) e `materiaNome`;
    - `contents`: `[{titulo, tipo, conteudo}]` do conteúdo da vez;
    - `fileContents`: textos de `fontes_personalizacao.metadata` (`texto_extraido`,
      `transcricao`, `transcript`, `text`, nessa ordem) e `descricao`, das fontes de
      `visibilidade = 'classe'` desse conteúdo, juntos com `\n\n` e cortados em 20 000
      caracteres;
    - `fileNames`: os `nome_arquivo`;
    - `orientacao`: `{pedir, evitar}` de `classe_orientacao_ia`, ou ausente;
    - `existentes`: `{questoes: [...], cards: [...]}`. Em `questoes` vão os enunciados das
      questões do tópico e os textos dos desafios do tópico (`desafio->>'enunciado'` da lógica e
      as pistas da cruzadinha), sem repetir; em `cards`, os títulos dos cards dos conteúdos do
      tópico. Teto de 60 em cada lista;
    - `tipoConteudo` e `corpoConteudo`, para a API tirar `videoUrl`/`linkUrl` (Tarefa 3).

    Nenhum dado de aluno vai no contexto.
11. **`fn_missao_desafio_registrar_auto`:**
    - pega a mesma trava consultiva;
    - se já existe desafio do conteúdo, marca a tentativa `gerado` e devolve `ja_tinha`;
    - senão, para cada item `{desafio, resposta, perfis?}`, chama `fn_missao_desafio_gravar(...,
      'pendente', <classe.professor_id>)` num bloco `BEGIN ... EXCEPTION WHEN SQLSTATE '22023'`.
      Um item inválido é pulado, e o resto grava. `perfis` ausente ou vazio usa o padrão do tipo;
    - se gravou ≥ 1, marca `gerado` e chama `fn_professor_notificar(prof, classe,
      'desafio_para_aprovar', 'Desafios esperando aprovação', '<N> desafios esperando aprovação em
      <classe.descricao>', 'missoes', 'desafios_auto:' || classe || ':' || <data de hoje>)`;
    - se não gravou nenhum, marca `sem_desafio`.
12. **`fn_desafios_auto_falhou`:**
    - com `p_espera_min` não nulo, a linha fica `esperando`, com `proxima_em = now() +
      espera`, sem somar tentativa;
    - nulo, soma 1 em `tentativas`, fica `falhou` e `proxima_em = now() + 2^tentativas horas`.
      Com `tentativas >= 3`, `proxima_em = NULL` e para de vez (o candidato exclui);
    - `erro` guarda só a primeira linha, cortada em 300 caracteres.
13. **`missao_ia_pedir`:** recriada a partir do texto da `20261102_20` por âncora, somando
    `AND desafio IS NULL` nas duas consultas de `missoes` (o teto de pendentes, `:301-307`, e os
    títulos ao modelo, `:451-452`).
14. **`missao_desafio_decidir`:**
    - posse por `NOT EXISTS (... app_classes_do_professor())` sobre a classe do grupo, senão
      `42501`;
    - muda todas as linhas do grupo com `aprovacao = 'pendente'` para `aprovada`, ou para
      `recusada` com `motivo_recusa = COALESCE(NULLIF(btrim(p_motivo), ''), 'Recusado pelo
      professor')`, porque o CHECK exige motivo (o texto padrão é decisão do plano);
    - grupo já decidido devolve 0, sem erro.
15. `NOTIFY pgrst, 'reload schema'`.

O `downgrade()` desfaz na ordem inversa. Ele recria `missao_desafio_criar` e `missao_ia_pedir` com
o texto das migrations de origem e volta os CHECKs com os valores da `_23`.

- [ ] **Passo 1: escrever os testes de estrutura.** Em `test_migration_desafios_gerados_automaticamente.py`:
  - `test_revisao_encadeada` (`down_revision == "20261120_02"`);
  - `test_funcoes_de_servidor_sem_grant_de_cliente` (cada `fn_desafios_auto_*`,
    `fn_missao_desafio_gravar` e `fn_missao_desafio_registrar_auto` com REVOKE de `authenticated`
    e sem GRANT para ele);
  - `test_decidir_e_criar_com_grant_authenticated`;
  - `test_tabela_sem_policy_dita_no_docstring` (o docstring cita `desafios_auto_tentativas` e
    "sem policy");
  - `test_chaves_privadas` (as 5 chaves com `publico` false);
  - `test_missao_ia_pedir_filtra_desafio` (as duas âncoras trocadas: o texto final tem
    `desafio IS NULL` duas vezes a mais que o original);
  - `test_trava_igual_nas_duas_funcoes` (a mesma expressão `hashtextextended('missao_desafio:'`
    em `missao_desafio_criar` e em `fn_missao_desafio_registrar_auto`);
  - `test_sem_param_com_dois_pontos` (nenhum `:palavra` fora de string que o `text()` leia como
    bind: `text(bloco).compile().params == {}` para cada bloco).
- [ ] **Passo 2: rodar e ver falhar.** `cd api && pytest tests/test_migration_desafios_gerados_automaticamente.py -v` → FAIL (o módulo não existe).
- [ ] **Passo 3: escrever os testes e2e.** Em `test_e2e_desafios_gerados_automaticamente.py`, com
  dados sintéticos e marcador `e2e`:
  - `test_candidato_entra_com_todas_as_regras` e um teste por regra que tira o conteúdo:
    - `test_fora_se_geracao_automatica_desligada`;
    - `test_fora_sem_aluno`;
    - `test_fora_com_desafio_em_qualquer_estado` (pendente, recusada, inativa);
    - `test_fora_com_tentativa_gerado_ou_sem_desafio`;
    - `test_fora_em_rascunho_e_agendado_futuro`;
    - `test_dentro_agendado_vencido`;
    - `test_fora_editado_ha_menos_de_carencia`;
    - `test_fora_so_com_titulo`;
    - `test_fora_de_p_classes`;
  - `test_ordem_por_topico_e_antiguidade`;
  - `test_atualizado_em_ignora_valor_do_cliente`: um UPDATE com `atualizado_em = '2000-01-01'`
    grava `now()`;
  - `test_reivindicar_respeita_teto_do_dia_e_ligado`;
  - `test_reivindicar_nao_pega_quem_esta_gerando` e `test_reivindicar_retoma_trava_vencida`
    (Foco 2);
  - `test_reivindicar_confere_carencia_de_novo` (Foco 5);
  - `test_registrar_grava_pendente_ativa_e_criado_por_dono`: 4 itens dão 8 linhas `pendente`,
    `ativa`, com 4 grupos e gabarito;
  - `test_registrar_pula_item_invalido`: 1 válido e 1 com grade errada → `gravados 1, pulados 1`;
  - `test_registrar_nenhum_valido_marca_sem_desafio`;
  - `test_registrar_depois_do_botao_devolve_ja_tinha` e `test_botao_e_worker_concorrentes_gravam_um_so`.
    Este último usa duas conexões: a A chama `missao_desafio_criar` sem commit, a B chama
    `registrar_auto` em thread e fica presa na trava; depois do commit de A, B devolve `ja_tinha`
    (Foco 1);
  - `test_pendente_invisivel_ao_aluno` (`SET LOCAL ROLE authenticated` com as claims do aluno:
    0 linhas de `missoes` e de `missao_desafio_gabarito`);
  - `test_notifica_uma_vez_por_turma_e_dia`: dois conteúdos da mesma turma dão 1 linha em
    `professor_notificacoes`, com `contagem` 2, `tipo 'desafio_para_aprovar'` e `destino 'missoes'`;
  - `test_falhou_espera_2_elevado_n_e_para_na_terceira` e `test_esperando_nao_conta_falha`;
  - `test_missao_ia_pedir_ignora_desafio_pendente`: 8 desafios pendentes não bloqueiam o pedido
    de missões da IA;
  - `test_decidir_aprova_grupo_inteiro`, `test_decidir_recusa_com_motivo_padrao` e
    `test_decidir_recusa_outro_professor_42501`;
  - `test_desligar_depois_nao_apaga_pendente` (Foco 4);
  - `test_contexto_sem_dado_de_aluno_e_com_existentes`.
- [ ] **Passo 4: rodar e ver falhar.** `cd api && pytest tests/test_e2e_desafios_gerados_automaticamente.py -v -m e2e` → FAIL.
- [ ] **Passo 5: escrever a migration** como descrito acima.
- [ ] **Passo 6: rodar os dois arquivos até passar**, e mais
  `pytest tests/test_e2e_missao_desafio_criar.py tests/test_e2e_desafio_na_missao.py tests/test_migration_missao_desafio_criar.py -v`,
  para o botão continuar igual. Esperado: tudo PASS.
- [ ] **Passo 7: rodar os passos do CI da API** (os comandos exatos do `ci.yml`: ruff, mypy se
  houver e pytest do pacote inteiro). Esperado: limpo.
- [ ] **Passo 8: commit.** `feat(banco): desafios gerados sozinhos esperam a aprovação do professor`

### Task 2: edge aceita o servidor no modo desafios

**Arquivos:**
- Criar: `frontend/supabase/functions/generate-content-ai/pedidoDoServidor.ts`
- Criar: `frontend/supabase/functions/generate-content-ai/pedidoDoServidor.test.ts`
- Modificar: `frontend/supabase/functions/generate-content-ai/index.ts`. Mexer no portão de
  autenticação em `serve` (~1706) e em `tentativas` (~1862).

**Interfaces:**
- Produz, para a Tarefa 3: um `POST /functions/v1/generate-content-ai` com
  `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` e `mode: "desafios"` responde como para o
  console, `{desafios, descartados}` ou `{error, code, details}`. Faz uma tentativa só.
- `ehChaveDeServico(authHeader: string, chave: string): boolean` compara em tempo constante e
  aceita com ou sem `Bearer `. Chave vazia dá sempre `false`.
- `autorizar(p: { servidor: boolean; usuario: boolean; mode: string }): "ok" | "recusado"`
  devolve `ok` com `usuario`, ou com `servidor && mode === "desafios"`.

- [ ] **Passo 1: escrever os testes.**
  - `ehChaveDeServico`: igual com `Bearer `, igual sem, diferente, chave vazia, header vazio.
  - `autorizar`: servidor em `desafios` → `ok`; servidor em `content`, `trail` e `all` →
    `recusado`; usuário em qualquer modo → `ok`; nenhum → `recusado`.
- [ ] **Passo 2:** `cd frontend && npx vitest run supabase/functions/generate-content-ai/pedidoDoServidor.test.ts` → FAIL.
- [ ] **Passo 3: implementar e ligar no `serve`.**
  - Com a chave de serviço no header, ler o corpo antes do portão e chamar `autorizar`. Sem ela,
    o caminho de hoje (`requireAuthenticatedUser`).
  - O corpo lido uma vez é reaproveitado no `try`.
  - `const tentativas = servidor || materialPesado ? 1 : CONTENT_GEN_ATTEMPTS`.
  - Recusa continua `401 {error: "unauthorized"}`.
- [ ] **Passo 4:** rodar o teste novo e `desafios.test.ts` → PASS. Depois `npm run lint` e
  `npm run typecheck` no `frontend/` → limpos (a edge passa no eslint do front).
- [ ] **Passo 5: commit.** `feat(edge): generate-content-ai aceita o servidor só no modo desafios`

### Task 3: o laço da API

**Arquivos:**
- Criar: `api/app/services/desafios_auto.py`
- Criar: `api/tests/test_desafios_auto.py` (molde de `test_missoes_ia.py`, com sessão falsa e
  edge falsa por `httpx.MockTransport`)
- Modificar: `api/app/core/settings.py`. Ao lado de `missoes_ia_*`, entram
  `desafios_auto_enabled: bool = True`, `desafios_auto_trava_seconds: int = 600`,
  `desafios_auto_timeout_seconds: int = 150` e `desafios_auto_classe_ids: list[int] = []`.
- Modificar: `api/app/main.py`. Registrar `desafios_auto_loop` no `lifespan` como o
  `missoes_ia_task`, com cancelamento no `finally`.
- Modificar: `api/.env.example`, com as quatro variáveis comentadas.

**Interfaces:**
- Consome: as funções da Tarefa 1 e a edge da Tarefa 2.
- Produz:
  - `classificar_erro(status: int, corpo: Any) -> Literal["cota_do_dia", "por_minuto", "outro"]`:
    - `cota_do_dia` com `details.upstream_status == 402`, ou com algum `quotaId` contendo
      `PerDay` em `details.response.error.details[].violations[]`;
    - `por_minuto` para os outros 429;
    - `outro` para o resto, incluindo timeout e 5xx.
  - `proxima_virada_do_pacifico(agora: datetime) -> datetime`: a próxima meia-noite de
    `America/Los_Angeles`, com `zoneinfo`, em UTC.
  - `enderecos(tipo: str, corpo: str) -> dict[str, str]`: porte de `enderecosDoConteudo`. Vídeo
    do YouTube vira `videoUrl` `https://www.youtube.com/watch?v=<id>`; `link` com URL única vira
    `linkUrl`; o resto dá `{}`. Os ids do YouTube saem pelos formatos que `videoDoConteudo.ts`
    reconhece (`watch?v=`, `youtu.be/`, `embed/`, `shorts/`).
  - `corpo_do_pedido(contexto: dict) -> dict`: tira `tipoConteudo`/`corpoConteudo`, soma
    `enderecos(...)` e descarta os nulos.
  - `processar_uma_vez(app, cliente: httpx.AsyncClient | None = None) -> dict[str, int]`, com as
    chaves `gerado`, `sem_desafio`, `ja_tinha`, `falhou`, `esperando`, `sumiu`, e mais
    `pausa_ate` (epoch) quando a cota do dia acaba.
  - `desafios_auto_loop(app) -> None`.

O comportamento de uma passada:
1. Lê `fn_desafios_auto_config()`. Com `ligado` falso, dorme `intervalo_seg`.
2. Reivindica um por vez, até `por_passada`.
3. Para cada um: contexto → `corpo_do_pedido` → POST na edge (timeout configurado, header
   `Authorization: Bearer <supabase_service_key>` e `apikey`).
4. Resposta 200 com `desafios`: `fn_missao_desafio_registrar_auto(id, desafios)`.
5. Com erro:
   - `por_minuto`: `fn_desafios_auto_falhou(id, erro, 15)` e a passada termina;
   - `cota_do_dia`: `falhou(id, erro, <minutos até a virada>)`, e o laço dorme até
     `proxima_virada_do_pacifico`;
   - `outro`: `falhou(id, erro, NULL)` e segue.
6. Contexto `NULL` conta como `sumiu`.

O erro registrado é `"<status> <code>"`, sem o material. Sem `supabase_url` ou
`supabase_service_key`, o laço loga uma vez e dorme o intervalo. Exceção de banco não derruba o
laço (`noqa: BLE001`, como no molde). `asyncio.CancelledError` sobe.

- [ ] **Passo 1: escrever os testes.**
  - `test_classificar_402_e_perday_sao_cota_do_dia`, `test_classificar_429_sem_perday_e_por_minuto`
    e `test_classificar_timeout_e_502_sao_outro`;
  - `test_virada_do_pacifico_no_horario_de_verao_e_fora` (2026-07-01 e 2026-12-01);
  - `test_enderecos_youtube_link_e_texto`;
  - `test_corpo_sem_campos_internos_nem_nulos`;
  - `test_passada_sucesso_registra_lista_inteira`: o `registrar_auto` recebe exatamente os 4 da
    edge;
  - `test_passada_lista_vazia_vai_ao_banco` (o banco decide `sem_desafio`);
  - `test_passada_429_por_minuto_espera_15_e_para` (Foco 3);
  - `test_passada_402_pausa_ate_a_virada`;
  - `test_passada_timeout_conta_falha`;
  - `test_banco_fora_nao_derruba_o_laco`;
  - `test_desligado_nao_reivindica`;
  - `test_header_leva_a_chave_de_servico` (a edge falsa confere `Authorization`);
  - `test_respeita_classe_ids` (o `p_classes` chega ao `reivindicar`).
- [ ] **Passo 2:** `cd api && pytest tests/test_desafios_auto.py -v` → FAIL.
- [ ] **Passo 3: implementar** `desafios_auto.py`, os settings e o registro no `main.py`.
- [ ] **Passo 4:** os testes → PASS. Depois os passos do CI da API → limpos.
- [ ] **Passo 5: commit.** `feat(api): laço que pede os desafios dos conteúdos parados`

### Task 4: o console aprova o grupo pendente

**Arquivos:**
- Modificar: `frontend/src/components/console/missoes/missoesApi.ts`, com
  `decidirDesafio(grupo: string, aprovar: boolean, motivo?: string): Promise<number>` via
  `supabase.rpc("missao_desafio_decidir", …)`. Ler `aprovacao` e `motivo_recusa` nos desafios em
  `mapearMissao`, se ainda não lê.
- Modificar: `frontend/src/components/console/missoes/missao.ts`. `agruparDesafios` passa a levar
  `aprovacao` do grupo (todas as linhas do grupo têm a mesma).
- Modificar: `frontend/src/components/console/missoes/aprovacao.ts`. `separarPorDecisao` põe o grupo
  de desafio pendente entre os que esperam decisão, uma vez só.
- Modificar: `frontend/src/components/console/missoes/CartaoDaMissao.tsx` (ou o cartão de desafio
  que ele usa). Selos "Desafio" e "Esperando aprovação"; o enunciado e a resposta (lida de
  `missao_desafio_gabarito`, que o professor lê); os perfis com a troca que já existe; os botões
  "Aprovar" e "Recusar", este com motivo opcional.
- Modificar: `frontend/src/components/console/missoes/MissoesSection.tsx`, para ligar as ações e
  recarregar.
- Modificar: `frontend/src/components/console/notificacoes/notificacoesProfessor.ts`.
  `TipoDeNotificacao` ganha `"desafio_para_aprovar"`, `DestinoDeNotificacao` ganha `"missoes"`, e
  `VIEW_DO_DESTINO.missoes = "missoes"`.
- Testes: `missoesApi.test.ts`, `aprovacao.test.ts` (ou o teste de `missao.ts`) e o teste de
  `notificacoesProfessor`.

**Interfaces:**
- Consome: `missao_desafio_decidir` e o novo tipo/destino da Tarefa 1.

- [ ] **Passo 1: escrever os testes.**
  - `decidirDesafio chama a rpc com p_grupo, p_aprovar e p_motivo`;
  - `decidirDesafio propaga o erro`;
  - `separarPorDecisao põe o grupo pendente uma vez entre os que esperam`;
  - `desafio aprovado não aparece como pendente`;
  - `caminhoDaNotificacao com destino missoes abre a aba Missões`.
- [ ] **Passo 2:** `cd frontend && npx vitest run src/components/console/missoes src/components/console/notificacoes` → FAIL.
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4:** os testes → PASS; `npm run lint`, `npm run typecheck` e `npm test` no
  `frontend/` → limpos.
- [ ] **Passo 5: conferir na tela** (console local contra o Postgres do Docker, `npm run docker:up`,
  nunca produção). Com um grupo pendente semeado: aprovar, recusar com e sem motivo e trocar
  perfil. Tirar uma captura.
- [ ] **Passo 6: commit.** `feat(console): professor aprova ou recusa o desafio gerado sozinho`

### Task 5: custos, documentação e verificação final

**Arquivos:**
- Modificar: `docs/custos.md`. A linha da geração automática de desafios: no máximo
  `desafios_auto_por_dia` pedidos por dia, uma tentativa por pedido, nas chaves da edge; o número
  exato de chamadas está PENDENTE de medição.
- Modificar: `CLAUDE.md`, um parágrafo em "Tabelas Supabase (personalização)":
  - quem decide é o banco, quem gera é a API;
  - `desafios_auto_tentativas` não tem policy de propósito;
  - o desafio automático nasce `pendente`;
  - a trava é compartilhada com `missao_desafio_criar`;
  - `missao_ia_pedir` ignora desafios.
- Modificar: a spec, no item 4. O texto extraído mora em `fontes_personalizacao.metadata` (não há
  coluna `texto_extraido`), e a leitura do material é `fn_desafios_auto_contexto`, no banco. Medido
  em 20/11: os 65 conteúdos de produção têm texto próprio e nenhuma das 7 fontes tem texto extraído.

- [ ] **Passo 1:** escrever as três mudanças.
- [ ] **Passo 2:** rodar de novo os passos do CI de `api/` e `frontend/` num checkout limpo
  (`npm ci`, porque o CI do GitHub está sem cota). Esperado: tudo limpo.
- [ ] **Passo 3: commit.** `docs: custos e regras dos desafios gerados sozinhos`
- [ ] **Passo 4:** push e PR no Lab (conta `Geisbelly`). O corpo diz que:
  - a migration não foi aplicada;
  - a edge precisa de deploy manual com OK;
  - a geração real espera o OK da autora.

  Não mesclar.
