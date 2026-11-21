# Modo de cuidado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o app percebe quando o aluno está em crise ou sobrecarregado e reage na hora. Ele tira a
pressão do estudo, sugere descanso, oferece técnicas e o CVV 188, e grava cada momento, com
consentimento, para o professor ver no painel do aluno.

**Architecture:**
- **Banco:** o consentimento tem versão própria, no molde da pesquisa. Cada momento vira uma linha
  em `aluno_momento_cuidado`, que só RPCs `SECURITY DEFINER` escrevem; o cronômetro do servidor
  respeita o modo de cuidado.
- **App:** detecta os sinais de uso pelo barramento `subscribeToSignals` e liga o modo de cuidado
  (cronômetros e batalha desligados com `disabledReason = "modo_cuidado"`).
- **API:** só classifica o que o aluno diz ao Guia (`bem_estar`, na mesma chamada) e garante o CVV
  com uma barreira de texto fixo.
- **Console:** lê os momentos por RPC, sem o nível.

**Tech Stack:**
- Postgres e Supabase (Alembic, RLS, plpgsql);
- FastAPI e Pydantic (API);
- Expo / React Native com TypeScript (app);
- Vite / React com TypeScript (console).

**Spec:** [`docs/superpowers/specs/2026-11-20-modo-de-cuidado-design.md`](../specs/2026-11-20-modo-de-cuidado-design.md)

## Global Constraints

- O sinal de uso nunca vira "ansiedade", "crise" ou "você parece ansioso" em tela, card, painel ou
  log. O texto fala do uso: "Você está há um tempo nisso." (DAT-45).
- O professor nunca lê o texto do aluno nem o `nivel`. "O Guia indicou o CVV 188" chega a ele como
  ação.
- CVV e técnica valem para todos, com ou sem consentimento, e não gravam nada. Texto fixo:
  "CVV 188 (ligação gratuita, 24 h, também por chat em cvv.org.br)"; em perigo imediato,
  "SAMU 192".
- Uma pergunta só para o consentimento: `public.aluno_cuidado_permitido(uuid)`.
- Versão do consentimento: `CONSENTIMENTO_CUIDADO_VERSAO = "2026-11-20-cuid-v1"` (app) e
  `public.consentimento_cuidado_versao_vigente()` (banco), com o mesmo valor.
- O modo de cuidado não mexe em nota, prazo da tentativa (#136) nem conteúdo. Com o cronômetro
  desligado, os bônus `atividade_no_tempo_*` não saem, e não há XP de compensação.
- `aluno_momento_cuidado` fica fora de nota, XP, rank, risco de reprovação, coortes do estudo (#13)
  e `aluno_mental_state_history`.
- Valores de `app_config`, **propostos na spec; a autora confirma antes do merge**:
  - `cuidado_erros_seguidos` = 5;
  - `cuidado_minutos_sem_parar` = 50;
  - `cuidado_abandonos` = 2;
  - `cuidado_intervalo_min` = 120;
  - `cuidado_duracao_min` = 120.
  As cinco são `publico = true`, porque o app precisa delas antes de decidir.
- Retenção de `aluno_momento_cuidado`: 180 dias. Revogar o consentimento apaga os momentos do aluno.
- Tabela nova nasce com RLS e policy no mesmo commit. Nada de `SET` de sessão pela 6543.
- Migration que regrava função existente (`fn_cronometro_ligado`) parte do **texto vivo em
  produção** (`pg_get_functiondef`), não do arquivo antigo.
- Ordem do payload é cache: nenhum campo novo na frente do pedido ao Guia.
- Mensagens, PR e textos de tela em PT-BR. Arquivos em UTF-8 sem BOM.

## Review Focus

1. **Aluno sem consentimento em crise:** o Guia responde com técnica e CVV, o app alivia na tela,
   `cuidado_registrar` devolve `sem_consentimento` e nenhuma linha é gravada. Teste: Task 2
   (`test_sem_consentimento_nao_grava`) e Task 4 (`test_risco_sem_consentimento_tem_cvv_e_nao_grava`).
2. **API fora do ar quando o aluno escreve "não quero mais viver":** a barreira de texto fixo não
   depende do modelo, e a resposta de reserva também leva o CVV. Teste: Task 3
   (`test_reserva_com_risco_leva_o_cvv`).
3. **Aluno reabre o app no meio do modo de cuidado:** o alívio continua até `expira_em`, porque o
   app pergunta `cuidado_ativo` ao abrir. Teste: Task 6 (`restaura o modo de cuidado ao abrir`).
4. **"Risco" logo depois de um sinal de uso:** não é descartado pelo intervalo de 2 h; atualiza o
   momento aberto e o painel mostra "o Guia indicou o CVV 188". Teste: Task 2
   (`test_nivel_mais_alto_atualiza_o_momento_aberto`).
5. **Professor de outra turma ou aluno lendo colega:** `cuidado_da_turma` recusa, e a tabela base
   não tem policy para o professor. Teste: Task 2 (`test_professor_de_outra_turma_nao_le`,
   `test_professor_nao_le_a_tabela_base`).

---

### Task 1: Consentimento do modo de cuidado (banco)

**Files:**
- Create: `api/alembic/versions/20261120_04_consentimento_cuidado.py` (`down_revision = "20261120_03"`, renumerada de `_01` porque a `main` já tinha `_01` a `_03`; confira `alembic heads` na `main` antes)
- Test: `api/tests/test_migration_consentimento_cuidado.py` (estrutura, sem Docker)
- Test: `api/tests/test_e2e_consentimento_cuidado.py` (Postgres real, `TRAILUP_TEST_DOCKER=1`, no molde de `test_e2e_consentimento_responsavel.py`)

**Interfaces:**
- Produces:
  - tabela `public.consentimento_cuidado (id bigserial, aluno_id uuid FK alunos ON DELETE CASCADE, versao text, status text CHECK accepted|rejected, decidido_em timestamptz, registrado_em timestamptz, origem jsonb)`, com carimbo `trg_consentimento_carimbo`, RLS `consentimento_cuidado_aluno_sel` (`aluno_id = auth.uid()`) e só SELECT para `authenticated`, igual a `consentimento_pesquisa` em `20261024_02`;
  - coluna `public.consentimento_responsavel.cuidado_versao text`;
  - `public.consentimento_cuidado_versao_vigente() RETURNS text`, que devolve `'2026-11-20-cuid-v1'`;
  - `public.aluno_cuidado_permitido(p_aluno uuid) RETURNS boolean` (`SECURITY DEFINER`, sem EXECUTE para cliente);
  - `public.aluno_meu_cuidado_permitido() RETURNS boolean` (cliente, só `auth.uid()`);
  - `public.aluno_registrar_consentimento_cuidado(p_aceito boolean, p_versao text, p_decidido_em timestamptz, p_origem jsonb) RETURNS jsonb` (cliente);
  - `public.responsavel_registrar_cuidado(p_aceito boolean, p_nome text, p_relacao text, p_declaracao boolean, p_decidido_em timestamptz) RETURNS jsonb` (cliente).

- [ ] **Step 1: Escrever os testes e2e que falham**

```python
def test_adulto_sem_aceite_nao_tem_cuidado(db, adulto): assert not permitido(db, adulto)
def test_adulto_com_aceite_vigente_tem_cuidado(db, adulto):
    registrar(db, adulto, aceito=True, versao="2026-11-20-cuid-v1"); assert permitido(db, adulto)
def test_aceite_de_versao_antiga_nao_vale(db, adulto):
    registrar(db, adulto, aceito=True, versao="2026-01-01-cuid-v0")  # a RPC recusa versão diferente da vigente
    assert not permitido(db, adulto)
def test_modo_restrito_barra_mesmo_com_aceite(db, menor_sem_responsavel): assert not permitido(db, menor_sem_responsavel)
def test_menor_precisa_do_proprio_aceite_e_do_responsavel(db, menor_com_responsavel):
    registrar(db, menor_com_responsavel, aceito=True); assert not permitido(db, menor_com_responsavel)
    responsavel_cuidado(db, menor_com_responsavel, aceito=True); assert permitido(db, menor_com_responsavel)
def test_responsavel_cuidado_nao_muda_as_outras_finalidades(db, menor_com_responsavel):
    antes = finalidades(db, menor_com_responsavel); responsavel_cuidado(db, menor_com_responsavel, aceito=True)
    assert {k: v for k, v in finalidades(db, menor_com_responsavel).items() if k != "cuidado"} == antes
    assert not modo_restrito(db, menor_com_responsavel)
def test_responsavel_cuidado_recusa_sem_aceite_vigente(db, menor_sem_responsavel):
    assert responsavel_cuidado(db, menor_sem_responsavel, aceito=True)["ok"] is False
def test_revogar_apaga_os_momentos(db, adulto_com_momento):
    registrar(db, adulto_com_momento, aceito=False); assert contar_momentos(db, adulto_com_momento) == 0
```

`test_revogar_apaga_os_momentos` depende da tabela da Task 2. Marque `xfail(strict=True)` aqui e
tire a marca na Task 2.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && TRAILUP_TEST_DOCKER=1 pytest tests/test_e2e_consentimento_cuidado.py -v`
Expected: FAIL (`function aluno_cuidado_permitido does not exist`).

- [ ] **Step 3: Escrever a migration**

- `aluno_cuidado_permitido` tem a mesma ordem do ramo `pesquisa` de `aluno_finalidade_permitida`:
  1. `aluno_modo_restrito` → `false`;
  2. último `consentimento_cuidado` do aluno `accepted` e na versão vigente, senão `false`;
  3. adulto → `true`;
  4. menor → `(consentimento_responsavel_ultimo(...).finalidades ->> 'cuidado') = 'true' AND cuidado_versao = vigente`.
- `responsavel_registrar_cuidado` insere uma linha nova em `consentimento_responsavel`. Ela copia
  da última linha `accepted` na versão vigente:
  - `versao`, `metodo = 'aparelho'` e `finalidades`, mais `{"cuidado": p_aceito}`;
  - `cuidado_versao = vigente`, `nome_responsavel`, `relacao` e `declaracao` dos parâmetros;
  - `registrado_por = auth.uid()`.
  Sem última linha aceita e vigente, devolve `{"ok": false, "motivo": "sem_aceite_do_responsavel"}`.
  Não reescreve `responsavel_registrar_no_aparelho`.
- `aluno_registrar_consentimento_cuidado`:
  - recusa `p_versao` diferente da vigente (`22023`);
  - grava a linha;
  - com `p_aceito = false`, faz `DELETE FROM aluno_momento_cuidado WHERE aluno_id = auth.uid()` dentro de um `IF to_regclass('public.aluno_momento_cuidado') IS NOT NULL` (a tabela nasce na Task 2).
- Os GRANTs seguem a tabela "Quem pode o que" de `20261024_02`. O docstring repete essa tabela para
  as funções novas.

- [ ] **Step 4: Teste de estrutura**

Em `test_migration_consentimento_cuidado.py`: a migration declara `revision = "20261120_04"`, liga
RLS em `consentimento_cuidado`, cria a policy no mesmo arquivo e não dá EXECUTE de
`aluno_cuidado_permitido` a `authenticated`.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd api && TRAILUP_TEST_DOCKER=1 pytest tests/test_e2e_consentimento_cuidado.py tests/test_migration_consentimento_cuidado.py -v && ruff check .`
Expected: PASS, menos o `xfail` estrito.

- [ ] **Step 6: Commit**

```bash
git add api/alembic/versions/20261120_04_consentimento_cuidado.py api/tests/test_*consentimento_cuidado.py
git commit -m "feat(banco): consentimento do modo de cuidado com versão própria"
```

---

### Task 2: Momentos de cuidado e cronômetro (banco)

**Files:**
- Create: `api/alembic/versions/20261120_05_momentos_de_cuidado.py` (`down_revision = "20261120_04"`)
- Test: `api/tests/test_e2e_momentos_de_cuidado.py`, `api/tests/test_migration_momentos_de_cuidado.py`
- Modify: `api/tests/test_e2e_consentimento_cuidado.py` (tirar o `xfail`)

**Interfaces:**
- Consumes: `aluno_cuidado_permitido(uuid)` (Task 1).
- Produces:
  - tabela `public.aluno_momento_cuidado`, com as colunas da spec §5: `id`, `aluno_id`, `classe_id`, `topico_id NULL`, `criado_em`, `origem text CHECK aluno_disse|sinais_de_uso`, `nivel text NULL CHECK desconforto|crise|risco`, `fatos jsonb`, `acoes jsonb`, `expira_em timestamptz`;
  - `public.fn_cuidado_registrar(p_aluno uuid, p_classe_id bigint, p_topico_id bigint, p_origem text, p_nivel text, p_fatos jsonb, p_acoes jsonb) RETURNS jsonb` (interna, sem EXECUTE para cliente; a API a chama);
  - `public.cuidado_registrar(p_classe_id bigint, p_topico_id bigint, p_origem text, p_fatos jsonb, p_acoes jsonb) RETURNS jsonb` (cliente; usa `auth.uid()`; o nível é sempre nulo aqui, porque o aparelho não declara nível);
  - as duas funções de registro devolvem `{"ok": true, "momento_id": bigint, "expira_em": ts, "atualizado": bool}`, ou `{"ok": false, "motivo": text}`;
  - coluna `resposta text NULL CHECK (resposta IN ('pausou','continuou'))` e `public.cuidado_responder(p_momento_id bigint, p_resposta text) RETURNS boolean` (cliente; só o próprio momento, uma vez). É o que a seção "Medir" da spec conta;
  - `public.cuidado_ativo(p_classe_id bigint) RETURNS jsonb` (cliente), que devolve `{"ativo": bool, "expira_em": ts|null, "origem": text|null}`;
  - `public.cuidado_da_turma(p_classe_id bigint, p_aluno_id uuid) RETURNS TABLE(criado_em timestamptz, topico_id bigint, origem text, fatos jsonb, acoes jsonb, resposta text, tentativas_antes int, acerto_antes_pct numeric, tentativas_depois int, acerto_depois_pct numeric)` (cliente, professor; **sem `nivel`**);
  - as chaves de `app_config` da seção Global Constraints;
  - a linha em `retencao_politica` (`'aluno_momento_cuidado', 'apagar', 'aluno_id', 'criado_em', 180, 180`).
  A pesquisa não estende o prazo de dado sensível.

- [ ] **Step 1: Escrever os testes e2e que falham**

```python
def test_sem_consentimento_nao_grava(db, adulto_matriculado):
    r = cuidado_registrar(db, adulto_matriculado, origem="sinais_de_uso", fatos={"erros_seguidos": 5})
    assert r == {"ok": False, "motivo": "sem_consentimento"} and contar(db) == 0
def test_grava_com_consentimento_e_devolve_expira_em(db, adulto_com_cuidado): ...  # expira_em ≈ now() + 120 min
def test_fato_fora_da_lista_e_recusado(db, adulto_com_cuidado):
    assert cuidado_registrar(..., fatos={"texto": "oi"})["motivo"] == "fato_invalido"
def test_intervalo_vale_por_origem(db, adulto_com_cuidado):
    cuidado_registrar(..., origem="sinais_de_uso"); assert cuidado_registrar(..., origem="sinais_de_uso")["motivo"] == "intervalo"
    assert fn_cuidado_registrar(..., origem="aluno_disse", nivel="desconforto")["ok"] is True
def test_nivel_mais_alto_atualiza_o_momento_aberto(db, adulto_com_cuidado):
    fn_cuidado_registrar(..., origem="aluno_disse", nivel="desconforto")
    r = fn_cuidado_registrar(..., origem="aluno_disse", nivel="risco", acoes={"cvv_indicado": True})
    assert r["atualizado"] is True and contar(db) == 1 and ultimo(db)["nivel"] == "risco"
def test_aluno_de_outra_turma_e_recusado(db, adulto_com_cuidado, outra_turma): ...  # motivo "sem_matricula"
def test_cuidado_ativo_respeita_expira_em(db, adulto_com_cuidado): ...  # ativo antes; inativo depois de mover expira_em para o passado
def test_cronometro_desligado_durante_o_cuidado_mesmo_ligado_pelo_aluno(db, adulto_com_cuidado):
    definir_cronometro(db, adulto_com_cuidado, ligado=True); cuidado_registrar(...)
    assert fn_cronometro_ligado(db, adulto_com_cuidado) is False
    expirar(db); assert fn_cronometro_ligado(db, adulto_com_cuidado) is True
    assert ler_aluno_cronometro(db, adulto_com_cuidado)["origem"] == "aluno"  # a escolha dele não foi tocada
def test_professor_le_a_turma_sem_nivel(db, professor, adulto_com_momento_risco):
    linhas = cuidado_da_turma(db, professor, ...); assert "nivel" not in linhas[0] and linhas[0]["acoes"]["cvv_indicado"]
def test_professor_de_outra_turma_nao_le(db, outro_professor, ...): ...  # 42501
def test_professor_nao_le_a_tabela_base(db, professor, ...):
    assert select_como(db, professor, "SELECT count(*) FROM public.aluno_momento_cuidado") == 0
def test_aluno_le_os_proprios_com_nivel(db, adulto_com_momento_risco): ...
def test_resposta_ao_aviso_grava_uma_vez_e_so_do_proprio(db, adulto_com_cuidado, colega):
    m = cuidado_registrar(...)["momento_id"]; assert cuidado_responder(db, adulto_com_cuidado, m, "pausou") is True
    assert cuidado_responder(db, adulto_com_cuidado, m, "continuou") is False
    assert cuidado_responder(db, colega, m, "pausou") is False
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && TRAILUP_TEST_DOCKER=1 pytest tests/test_e2e_momentos_de_cuidado.py -v`
Expected: FAIL (`relation aluno_momento_cuidado does not exist`).

- [ ] **Step 3: Escrever a migration**

- **Fatos aceitos:** `erros_seguidos`, `minutos_sem_parar` e `abandonos`, todos inteiros entre 0
  e 1000. **Ações aceitas:** `pausa_sugerida`, `cronometro_desligado`, `tecnica_oferecida` e
  `cvv_indicado`, todas booleanas. Qualquer outra chave → `fato_invalido` / `acao_invalida`.
- **Ordem do nível:** `desconforto` < `crise` < `risco`. Momento aberto é o da mesma origem com
  `criado_em > now() - cuidado_intervalo_min`. Com nível maior, atualiza o momento aberto (nível,
  `acoes || p_acoes`, `expira_em`) e devolve `{"ok": true, "atualizado": true}`; com nível igual ou
  menor, devolve `intervalo`.
- **Matrícula:** `classe_aluno` do aluno na `p_classe_id`. Com `p_topico_id`, o tópico precisa ser
  da turma.
- **`fn_cronometro_ligado`:** parte do texto vivo e acrescenta, antes do `COALESCE`, `CASE WHEN
  EXISTS (momento com expira_em > now()) THEN false`. `aluno_cronometro` não é tocado.
- **`cuidado_da_turma`:** confere a posse com `NOT EXISTS (... app_classes_do_professor())` antes
  de ler. O acerto antes e depois usa a mesma conta de `vw_chat_guia_aluno_topico` em
  `20261118_01`, com o instante do momento no lugar da primeira conversa.
- **RLS:** policy de SELECT só para o próprio aluno (`aluno_id = auth.uid()`), e nenhuma para o
  professor. O docstring registra isso como decisão (CLAUDE.md, tabela sem policy).
- `REVOKE ALL ... FROM anon, authenticated` e depois `GRANT SELECT TO authenticated`. A escrita é
  só por RPC.

- [ ] **Step 4: Tirar o `xfail` de `test_revogar_apaga_os_momentos` e rodar tudo**

Run: `cd api && TRAILUP_TEST_DOCKER=1 pytest tests/test_e2e_momentos_de_cuidado.py tests/test_e2e_consentimento_cuidado.py tests/test_migration_momentos_de_cuidado.py tests/test_e2e_cronometro_pelas_questoes_e_pausa.py -v && ruff check .`
Expected: PASS, inclusive o teste antigo do cronômetro.

- [ ] **Step 5: Commit**

```bash
git add api/alembic/versions/20261120_05_momentos_de_cuidado.py api/tests/test_*momentos_de_cuidado.py api/tests/test_e2e_consentimento_cuidado.py
git commit -m "feat(banco): momentos de cuidado, RPCs e cronômetro que respeita o cuidado"
```

---

### Task 3: Barreira de risco no Guia (API)

**Files:**
- Create: `api/app/services/risco_no_chat.py`
- Modify: `api/app/api/v1/personalizacao.py` (rota `POST /personalizar/chat`: antes de `resposta_sem_modelo`, e na resposta de reserva)
- Test: `api/tests/test_risco_no_chat.py`

**Interfaces:**
- Produces:
  - `def sinal_de_risco(mensagem: str) -> bool`;
  - `TEXTO_DO_CVV: str`, com o texto fixo da seção Global Constraints;
  - `def garantir_cvv(reply: str) -> str`, que acrescenta `TEXTO_DO_CVV` em parágrafo próprio quando ainda não está no texto.

- [ ] **Step 1: Escrever os testes que falham**

```python
@pytest.mark.parametrize("frase", ["não quero mais viver", "nao quero mais viver", "vou me matar", "quero me machucar", "Pensei em acabar com tudo"])
def test_frases_de_risco(frase): assert sinal_de_risco(frase)
@pytest.mark.parametrize("frase", ["essa questão me mata de rir", "não entendi o mmc", "quero acabar a trilha hoje"])
def test_nao_e_risco(frase): assert not sinal_de_risco(frase)
def test_garantir_cvv_nao_duplica(): assert garantir_cvv("x\n\n" + TEXTO_DO_CVV).count("188") == 1
def test_reserva_com_risco_leva_o_cvv(app, monkeypatch): ...  # modelo com ProvedorIndisponivelError → reply contém "188" e "192"
def test_resposta_do_modelo_com_risco_leva_o_cvv(app, monkeypatch): ...  # modelo responde sem CVV → a rota acrescenta
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && pytest tests/test_risco_no_chat.py -v`
Expected: FAIL (`ModuleNotFoundError: app.services.risco_no_chat`).

- [ ] **Step 3: Implementar**

- Normalize sem acento e em minúsculas, como `respostas_do_guia.py`. A lista de frases fica numa
  constante no topo do módulo, com um comentário: **"revisada pela autora antes de ir ao ar"**.
- Na rota, `sinal_de_risco(payload.mensagem)` vale antes das checagens de idade e de modo restrito.
  O CVV é informação de segurança, não IA. Para quem a IA está barrada, a resposta 403 de hoje
  ganha `TEXTO_DO_CVV` no `detail` só quando `sinal_de_risco` é verdadeiro.
- Depois de `gerar_validado` (resposta do modelo ou de reserva), aplique `garantir_cvv` ao `reply`
  e à última seção quando `sinal_de_risco` for verdadeiro. A assinatura (`assinatura_chat`) é
  calculada **depois** disso, sobre o texto final.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && pytest tests/test_risco_no_chat.py tests/test_chat_assinatura_rota.py tests/test_chat_guia_registros_rota.py -v && ruff check .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/risco_no_chat.py api/app/api/v1/personalizacao.py api/tests/test_risco_no_chat.py
git commit -m "feat(api): o Guia sempre indica o CVV quando o aluno fala em risco"
```

---

### Task 4: `bem_estar` na resposta do Guia e momento gravado pela API

**Files:**
- Modify: `api/app/schemas/mentor_chat.py` (`RegistroDaConversa.bem_estar`)
- Modify: `api/app/schemas/personalizacao.py` (`MentorChatResponse.modo_cuidado`)
- Modify: `api/app/agent/prompts/mentor_personalizacao_chat.txt` e `api/app/agent/prompts/mentor_grounding_check.txt`
- Modify: `api/app/services/mascaramento_chat.py` (`normalizar_registro` descarta `bem_estar`)
- Create: `api/app/repositories/cuidado.py`
- Modify: `api/app/api/v1/personalizacao.py`
- Test: `api/tests/test_cuidado_no_chat.py`

**Interfaces:**
- Consumes: `fn_cuidado_registrar(...)` e `aluno_cuidado_permitido(uuid)` (Tasks 1 e 2); `sinal_de_risco` (Task 3).
- Produces:
  - `RegistroDaConversa.bem_estar: str = "nenhum"` (`nenhum | desconforto | crise | risco`, normalizado; fora da lista vira `nenhum`), obrigatório no `json_schema_extra`;
  - `MentorChatResponse.modo_cuidado: ModoCuidadoDoGuia | None = None`, com `ModoCuidadoDoGuia(BaseModel): nivel: Literal["desconforto","crise","risco"]; expira_em: datetime | None`. `None` quando `bem_estar == "nenhum"`. App antigo ignora o campo;
  - `class CuidadoRepository: async def permitido(self, aluno_id: str) -> bool; async def registrar_pelo_guia(self, *, aluno_id: str, classe_id: int, topico_id: int | None, nivel: str, acoes: dict[str, bool]) -> dict`.

- [ ] **Step 1: Escrever os testes que falham**

```python
def test_crise_liga_o_modo_e_grava_com_consentimento(app, monkeypatch):
    # modelo devolve registro.bem_estar="crise"; permitido=True
    assert r.json()["modo_cuidado"]["nivel"] == "crise"
    assert registrar.await_args.kwargs["acoes"] == {"pausa_sugerida": True, "tecnica_oferecida": True, "cvv_indicado": False}
def test_risco_sem_consentimento_tem_cvv_e_nao_grava(app, monkeypatch):
    assert "188" in r.json()["reply"] and r.json()["modo_cuidado"]["nivel"] == "risco" and registrar.await_count == 0
def test_barreira_de_texto_eleva_para_risco(app, monkeypatch):  # modelo diz "nenhum", mensagem casa sinal_de_risco
    assert r.json()["modo_cuidado"]["nivel"] == "risco"
def test_bem_estar_nao_vai_para_chat_guia_registros(app, monkeypatch):
    assert "bem_estar" not in gravar.await_args.args[0].__dict__
def test_nenhum_nao_liga_o_modo(app, monkeypatch): assert r.json()["modo_cuidado"] is None
def test_falha_ao_gravar_o_momento_nao_derruba_a_resposta(app, monkeypatch): assert r.status_code == 200
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && pytest tests/test_cuidado_no_chat.py -v`
Expected: FAIL (`modo_cuidado` ausente na resposta).

- [ ] **Step 3: Implementar**

- **Prompt do Guia:** nova linha em `registro`, com os quatro níveis e a definição de cada um,
  copiada da spec §2. Mais um bloco curto de conduta para `crise`/`risco`: acolher sem
  diagnosticar, uma técnica (respiração 4-4-6 ou 5-4-3-2-1) e sugerir parar. Em `risco`, CVV 188
  e SAMU 192. O bloco entra junto das regras fixas, no começo do prompt: o prompt é estático e não
  mexe na ordem do payload.
- **Prompt do juiz:** exceção explícita. Fala de acolhimento, técnica de calma, pausa e CVV não é
  "fora da base do tópico".
- **Nível final:** `"risco"` se `sinal_de_risco(mensagem)`; senão, o `bem_estar` do modelo. A
  resposta de reserva e a de navegação contam como `"nenhum"`, salvo a barreira.
- **Ações gravadas:** `pausa_sugerida` e `tecnica_oferecida` são `True` em `crise` e `risco`;
  `cvv_indicado = (nivel == "risco")`. Em `desconforto`, só `pausa_sugerida`.
- **Gravação:** `CuidadoRepository.registrar_pelo_guia` roda numa transação própria, depois do
  registro do chat. Falhar fica no log (`cuidado.`) e não leva a resposta junto, o mesmo princípio
  de `chat_guia_registros`. Só grava se `permitido(aluno_id)`.
- **`expira_em`:** vem da RPC. Sem consentimento, a rota devolve `expira_em = None` e o app usa
  `cuidado_duracao_min` localmente.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && pytest tests/test_cuidado_no_chat.py tests/test_chat_guia_registros_rota.py tests/test_guardrails.py -v && pytest -q && ruff check .`
Expected: PASS (suíte inteira).

- [ ] **Step 5: Commit**

```bash
git add api/app api/tests/test_cuidado_no_chat.py
git commit -m "feat(api): o Guia reconhece crise e liga o modo de cuidado, sem gravar o nível no registro do chat"
```

---

### Task 5: Detector de sinais de sobrecarga (app)

**Files:**
- Create: `mobile/src/utils/sinaisDeSobrecarga.ts`
- Test: `mobile/src/utils/sinaisDeSobrecarga.test.ts`

**Interfaces:**
- Consumes: `IATriggerSignal` (`mobile/src/interfaces/personalizacao/IAContracts.ts`).
- Produces:
  - `export type LimitesDeSobrecarga = { errosSeguidos: number; minutosSemParar: number; abandonos: number }`;
  - `export type FatosDeSobrecarga = { erros_seguidos?: number; minutos_sem_parar?: number; abandonos?: number }`;
  - `export function criarDetectorDeSobrecarga(limites: LimitesDeSobrecarga): DetectorDeSobrecarga`, com:
    - `registrarSinal(s: IATriggerSignal): FatosDeSobrecarga | null`;
    - `registrarMinutosNaTrilha(minutosSemParar: number): FatosDeSobrecarga | null`;
    - `pausou(): void`;
    - `zerar(): void`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it("dispara no 5º erro seguido do mesmo tópico", ...)      // 4× activity_wrong → null; 5º → { erros_seguidos: 5 }
it("acerto zera a sequência", ...)                         // 4 erros, 1 activity_correct, 4 erros → null
it("erro de outro tópico recomeça a contagem", ...)
it("abandono = activity_start sem activity_complete antes de outro activity_start ou content_open", ...)  // 2º abandono → { abandonos: 2 }
it("50 minutos sem parar dispara; pausou() zera", ...)
it("dispara uma vez só até zerar()", ...)                  // 6º erro depois do disparo → null
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd mobile && npx jest src/utils/sinaisDeSobrecarga.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

O módulo é puro, sem React e sem relógio próprio: o tempo entra por `registrarMinutosNaTrilha`, que
quem usa alimenta com o tempo visível. Os limites vêm de quem chama; não há constante numérica no
módulo.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd mobile && npx jest src/utils/sinaisDeSobrecarga.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/utils/sinaisDeSobrecarga.ts mobile/src/utils/sinaisDeSobrecarga.test.ts
git commit -m "feat(mobile): detector puro de sinais de sobrecarga"
```

---

### Task 6: Modo de cuidado no aparelho (app)

**Files:**
- Create: `mobile/src/services/cuidadoNoBanco.ts` (RPCs `cuidado_registrar`, `cuidado_ativo`; leitura das chaves `cuidado_*` de `app_config`)
- Create: `mobile/src/context/ModoDeCuidadoContext.tsx` (estado, `expira_em`, detector da Task 5 ligado a `subscribeToSignals` e ao tempo na trilha)
- Create: `mobile/src/components/cuidado/AvisoDeCuidado.tsx` e `mobile/src/components/cuidado/TecnicasDeCalma.tsx`
- Modify: `mobile/src/context/IAContext.tsx` (cronômetros e batalha desligados com `disabledReason: "modo_cuidado"`)
- Modify: `mobile/src/interfaces/personalizacao/IAContracts.ts` (o tipo de `disabledReason` ganha `"modo_cuidado"`)
- Modify: `mobile/src/app/(tabs)/_layout.tsx` (monta o provider)
- Test: `mobile/src/context/ModoDeCuidadoContext.test.tsx`, `mobile/src/components/cuidado/AvisoDeCuidado.test.tsx`

**Interfaces:**
- Consumes: `criarDetectorDeSobrecarga` (Task 5); RPCs `cuidado_registrar` e `cuidado_ativo` (Task 2).
- Produces:
  - `export function useModoDeCuidado(): { ativo: boolean; expiraEm: number | null; origem: "aluno_disse" | "sinais_de_uso" | null; ligarPeloGuia(nivel: "desconforto" | "crise" | "risco", expiraEmIso: string | null): void }`;
  - `export const COPY_AVISO_USO = { titulo: "Você está há um tempo nisso. 🌿", corpo: "Que tal uma pausa de 5 minutos?", pausar: "Fazer uma pausa", continuar: "Continuar" }`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it("sinal de uso liga o modo, chama cuidado_registrar com os fatos e mostra o aviso", ...)
it("sem consentimento (motivo sem_consentimento) alivia mesmo assim, só no aparelho", ...)
it("restaura o modo de cuidado ao abrir", ...)                  // cuidado_ativo → ativo, expira_em futuro
it("expira sozinho em expira_em", ...)
it("Continuar fecha o aviso e o alívio continua", ...)
it("Fazer uma pausa e Continuar chamam cuidado_responder com o momento_id; sem momento gravado, não chamam", ...)
it("o aviso do sinal de uso não usa as palavras ansiedade, crise nem ansioso", ...)  // varre COPY_AVISO_USO e o texto renderizado
it("com o modo ativo, activity_timer, reading_timer e battle_mode ficam disabledReason modo_cuidado", ...)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd mobile && npx jest src/context/ModoDeCuidadoContext.test.tsx src/components/cuidado`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- **No IAContext:** a checagem `modo_cuidado` entra logo depois da de `mental_state`, nas três
  chaves. O resto do `IAContext` não muda.
- **Cronômetro da atividade:** o servidor já responde `cronometrada === false` durante o cuidado,
  pela Task 2. O app só repete na tela.
- **Técnicas:** texto fixo.
  - Respiração 4-4-6 com animação de círculo: 4 s inspira, 4 s segura, 6 s solta, 4 ciclos.
  - 5-4-3-2-1: cinco coisas que vê, quatro que toca, três que ouve, duas que cheira, uma que sente
    o gosto.
  - "Levante, beba água, volte em 5 minutos."
- **Aviso:** sem vermelho (use a paleta do perfil, `ProfileShellPalette`). Conforme o
  CLAUDE.md, "Um ícone, um significado": procure o ícone escolhido em `mobile/src` antes de usar.
- **"Fazer uma pausa":** abre `TecnicasDeCalma` e chama `pausou()` no detector.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd mobile && npx jest && npm run typecheck && npm run lint`
Expected: PASS, incluindo os 5 grupos isolados do CI (`npm run test:trail-resume` e os demais do `package.json`).

- [ ] **Step 5: Commit**

```bash
git add mobile/src
git commit -m "feat(mobile): modo de cuidado tira a pressão do estudo e oferece técnicas de calma"
```

---

### Task 7: Consentimento e Guia no app

**Files:**
- Modify: `mobile/src/utils/consentimentoResponsavel.ts` (`CONSENTIMENTO_CUIDADO_VERSAO = "2026-11-20-cuid-v1"`)
- Modify: `mobile/src/services/consentimentoResponsavelApi.ts` (`registrarConsentimentoCuidado(aceito: boolean)`, `registrarCuidadoDoResponsavel(params)`, `lerCuidadoPermitido(): Promise<boolean>`)
- Create: `mobile/src/components/consentimento/ItemNovoDoTermo.tsx` (o "o termo mudou", só com o item novo)
- Modify: `mobile/src/components/TelemetryConsentGate.tsx` (mostra `ItemNovoDoTermo` ao adulto sem decisão na versão vigente)
- Modify: `mobile/src/components/consentimento/ResponsavelConsentForm.tsx` (item `cuidado`, e modo "só o item novo" para quem já tem aceite)
- Modify: `mobile/src/app/(tabs)/perfil/coleta-dados.tsx` (interruptor do modo de cuidado; o menor vê "precisa do responsável")
- Modify: `mobile/src/components/ia/IAMentorPanel.tsx` (resposta com `modo_cuidado` chama `ligarPeloGuia`)
- Test: `mobile/src/components/consentimento/ItemNovoDoTermo.test.tsx`, `mobile/src/components/ia/IAMentorPanel.cuidado.test.tsx`

**Interfaces:**
- Consumes: RPCs da Task 1; `useModoDeCuidado().ligarPeloGuia` (Task 6); `MentorChatResponse.modo_cuidado` (Task 4).

- [ ] **Step 1: Escrever os testes que falham**

```ts
it("o adulto sem decisão na versão vigente vê só o item novo, e aceitar chama a RPC com a versão", ...)
it("decisão já tomada na versão vigente não mostra de novo", ...)
it("leitura que falha não mostra o item", ...)                  // o mesmo princípio de AceiteDosTermos
it("o texto do item diz que o professor vê o que aconteceu, nunca o que o aluno escreveu", ...)
it("resposta do Guia com modo_cuidado liga o modo; sem o campo, nada muda", ...)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd mobile && npx jest src/components/consentimento/ItemNovoDoTermo.test.tsx src/components/ia/IAMentorPanel.cuidado.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

O texto do item segue a spec §1, em linguagem simples. Leve-o à autora antes do merge, com a lista
de frases de risco da Task 3.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd mobile && npx jest && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src
git commit -m "feat(mobile): consentimento do modo de cuidado e o Guia ligando o modo"
```

---

### Task 8: Momentos de cuidado no console

**Files:**
- Create: `frontend/src/components/console/dashboard/aluno/AbaCuidado.tsx`, `cuidado.ts`, `useCuidadoDoAluno.ts`
- Modify: `frontend/src/components/console/dashboard/aluno/DetalheAluno.tsx` (aba `"cuidado"`, rótulo "Momentos de cuidado")
- Test: `frontend/src/components/console/dashboard/aluno/cuidado.test.ts`, `AbaCuidado.test.tsx`

**Interfaces:**
- Consumes: `cuidado_da_turma(p_classe_id, p_aluno_id)` (Task 2).
- Produces:
  - `export function textoDaOrigem(m: MomentoDeCuidado): string`: `aluno_disse` vira "O aluno disse ao Guia que não estava bem"; `sinais_de_uso` vira "Sinais de uso: " mais os fatos (ex.: "6 erros seguidos, 52 min sem parar");
  - `export function textoDasAcoes(acoes: Record<string, boolean>): string` (ex.: "O app sugeriu pausa, desligou o cronômetro e ofereceu uma técnica de respiração"; com `cvv_indicado`, acrescenta "o Guia indicou o CVV 188");
  - `export function textoDaResposta(r: "pausou" | "continuou" | null): string`: "Fez a pausa", "Preferiu continuar" ou "";
  - `textoAntesDepois` reaproveitado de `dashboard/guia.ts`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it("origem e ações viram as frases da spec", ...)
it("nenhuma frase contém ansiedade, crise, estresse nem nível", ...)  // varre as saídas de todos os casos
it("aba vazia diz que nenhum momento foi registrado e que só aparece quem consentiu", ...)
it("RPC ausente (42883) mostra 'ainda não disponível', não erro", ...)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run src/components/console/dashboard/aluno/cuidado.test.ts src/components/console/dashboard/aluno/AbaCuidado.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`useCuidadoDoAluno` chama `supabase.rpc("cuidado_da_turma", ...)` com `createRequestGuard`, como
`useGuiaDaTurma`. Visual e estados (carregando, vazio, indisponível, erro) seguem `AbaGuia.tsx`.
Sem destaque alarmante no CVV.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npm run typecheck && npm run lint && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/console/dashboard/aluno
git commit -m "feat(console): momentos de cuidado no detalhe do aluno"
```

---

### Task 9: Documentação

**Files:**
- Modify: `CLAUDE.md` (bullet novo em "Tabelas Supabase": `aluno_momento_cuidado` e `consentimento_cuidado`, com as regras que não são óbvias)
- Modify: `docs/custos.md` (nenhuma chamada nova de modelo: `bem_estar` sai na chamada que já existe; dizer isso com a data)
- Modify: `docs/superpowers/specs/2026-11-20-modo-de-cuidado-design.md` (Estado: implementado, com as migrations)

As regras que entram no bullet do `CLAUDE.md`:
- versão própria do consentimento;
- professor sem policy na tabela base;
- `fn_cronometro_ligado` consulta o cuidado;
- `chat_guia_registros` não guarda o nível;
- a barreira do CVV vem antes do modo restrito.

- [ ] **Step 1: Escrever, rodar `python scripts/site_docs/rotas.py` só se alguma rota mudou (não deve), e commitar**

```bash
git add CLAUDE.md docs
git commit -m "docs: modo de cuidado no CLAUDE.md, custos e spec"
```

---

## Antes do merge (com a autora)

- Confirmar os cinco valores de `app_config`.
- Revisar a lista de frases de risco (Task 3) e o texto do item novo do termo (Task 7).
- As duas migrations precisam de `alembic upgrade head` em produção, e não são aplicadas daqui.
  Avisar que a API só reinicia depois que o código delas estiver no espelho.
- O app só ganha a função com build novo (não há OTA).
