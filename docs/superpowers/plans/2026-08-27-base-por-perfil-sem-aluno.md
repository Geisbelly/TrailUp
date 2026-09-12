# Base por perfil sem aluno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a camada base por perfil BrainHex existir sem depender de aluno matriculado, para que uma turma vazia gere conteúdo em vez de produzir um job `0/0`.

**Architecture:** `aluno_id` passa a aceitar `NULL` nas quatro tabelas de *artefato* (`conteudo_personalizado`, `personalizacao_job_targets`, `materiais_gerados`, `cards_personalizados`), onde `NULL` significa "base da classe para este perfil". As tabelas de *comportamento* (`personalizacao_item_progresso`, `personalizacao_sugestao`) seguem `NOT NULL`. `_build_targets` e o trigger `fn_enqueue_class_delta_job` passam a emitir sempre 7 targets base; o job `enrollment` deriva a linha do aluno a partir da base.

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy Core (`text()`) · Alembic · Postgres (Supabase) · pytest/pytest-asyncio

**Spec:** `docs/superpowers/specs/2026-08-27-base-por-perfil-sem-aluno-design.md`

---

## Ordem e por quê

A migração vem primeiro porque tudo depende do schema aceitar `NULL`. A correção
do `_upsert_targets` (Task 2) vem **antes** de `_build_targets` (Task 3): se
inverter, o primeiro target base gerado duplica a cada chamada e o bug fica
escondido atrás de dados sujos.

---

## Task 1: Migração — `aluno_id` nullable, unicidade da base e policy de `materiais_gerados`

**Files:**
- Create: `api/alembic/versions/20260827_04_base_por_perfil_sem_aluno.py`
- Create: `api/tests/test_migrations_base_por_perfil.py`

- [ ] **Step 1: Confirmar a revisão de topo antes de encadear**

Run: `cd api && .venv/Scripts/python -m alembic heads`
Expected: `20260827_03 (head)`

Se não for `20260827_03`, pare e ajuste `down_revision` para o head real.

- [ ] **Step 2: Escrever o teste que falha**

Create `api/tests/test_migrations_base_por_perfil.py`:

```python
import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260827_04_base_por_perfil_sem_aluno.py"
    )
    spec = importlib.util.spec_from_file_location("migration_20260827_04", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sql(direcao: str = "upgrade") -> str:
    module = _load_migration()
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return "\n".join(executado)


def test_migration_revision_chain():
    module = _load_migration()
    assert module.revision == "20260827_04"
    assert module.down_revision == "20260827_03"


def test_apenas_tabelas_de_artefato_ficam_nullable():
    # Comportamento e' de gente: progresso e sugestao nunca podem perder o dono.
    sql = _sql()

    for tabela in (
        "conteudo_personalizado",
        "personalizacao_job_targets",
        "materiais_gerados",
        "cards_personalizados",
    ):
        assert f"ALTER TABLE {tabela} ALTER COLUMN aluno_id DROP NOT NULL" in sql

    assert "personalizacao_item_progresso ALTER COLUMN aluno_id" not in sql
    assert "personalizacao_sugestao ALTER COLUMN aluno_id" not in sql


def test_unicidade_da_base_e_chaveada_em_classe_nao_em_aluno():
    # Indice unico trata NULL como distinto: sem indice proprio, duas bases
    # identicas passariam pelas uniques atuais e a base duplicaria em silencio.
    sql = _sql()

    assert "uq_conteudo_personalizado_base_topico_conteudo_perfil" in sql
    assert "uq_conteudo_personalizado_base_topico_perfil_sem_conteudo" in sql
    assert "(classe_id, topico_id, conteudo_id, brainhex_profile_key)" in sql
    assert "WHERE aluno_id IS NULL" in sql


def test_uniques_por_aluno_passam_a_excluir_a_base():
    sql = _sql()
    assert "aluno_id IS NOT NULL" in sql


def test_dedup_de_target_cobre_a_base():
    # Sem isto, uq_job_target_legado deixa de deduplicar justamente a base.
    sql = _sql()
    assert "uq_job_target_base" in sql


def test_professor_enxerga_material_de_nivel_topico():
    # A policy exigia conteudo_id, mas material de topico grava conteudo_id nulo.
    sql = _sql()
    assert "professor_all_materiais_gerados" in sql
    assert "personalizacao_id" in sql
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_migrations_base_por_perfil.py -v`
Expected: FAIL — `FileNotFoundError` ou `ModuleNotFoundError` (a migração ainda não existe)

- [ ] **Step 4: Escrever a migração**

Create `api/alembic/versions/20260827_04_base_por_perfil_sem_aluno.py`:

```python
"""Base por perfil deixa de depender de aluno matriculado

Turma sem aluno nao gerava nada: `_build_targets` tira todo alvo de
`classe_aluno`, entao a lista vinha vazia, o job nascia com zero target e
fechava `completed` sem erro -- o pior tipo de falha, porque parece sucesso.

A camada base por perfil que o CLAUDE.md descreve ja existia no codigo, so nao
tinha onde morar: ela era simulada elegendo um aluno representante e marcando
`is_profile_template`, e o proprio worker ja tratava essa linha como nao sendo
material de aluno (pula `_seed_progress`). O `aluno_id` dela ja era vestigial --
servia de cabide porque a coluna era NOT NULL. Esta migration tira o cabide.

A linha de corte e entre ARTEFATO e COMPORTAMENTO. Artefato pode ser da classe;
comportamento e de gente e continua exigindo dono.

## O ponto que mais pode morder

Indice unico trata NULL como distinto. As uniques atuais sao todas ancoradas em
`aluno_id`, entao duas bases identicas passariam pelas duas -- cada NULL e
unico -- e a base duplicaria EM SILENCIO, aparecendo so depois como material
repetido no console. Por isso as uniques por aluno passam a excluir a base
(`aluno_id IS NOT NULL`) e a base ganha as suas, chaveadas em `classe_id`.

O mesmo vale para `uq_job_target_legado`: sem o par para a base, o dedup de
target para de funcionar justamente onde nao ha aluno para diferenciar.

Revision ID: 20260827_04
Revises: 20260827_03
Create Date: 2026-08-27
"""

from alembic import op

revision = "20260827_04"
down_revision = "20260827_03"
branch_labels = None
depends_on = None

ARTEFATOS = (
    "conteudo_personalizado",
    "personalizacao_job_targets",
    "materiais_gerados",
    "cards_personalizados",
)


def upgrade() -> None:
    for tabela in ARTEFATOS:
        op.execute(f"ALTER TABLE {tabela} ALTER COLUMN aluno_id DROP NOT NULL")

    # Uniques por aluno passam a governar SO a camada por aluno.
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_conteudo_perfil")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_aluno_topico_conteudo_perfil
          ON conteudo_personalizado (aluno_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL
        """
    )
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo
          ON conteudo_personalizado (aluno_id, topico_id, brainhex_profile_key)
          WHERE aluno_id IS NOT NULL AND topico_id IS NOT NULL AND conteudo_id IS NULL
        """
    )

    # Uniques da base: mesma forma, chaveadas em classe_id no lugar do aluno.
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_base_topico_conteudo_perfil
          ON conteudo_personalizado (classe_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_base_topico_perfil_sem_conteudo
          ON conteudo_personalizado (classe_id, topico_id, brainhex_profile_key)
          WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NULL
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_job_target_legado")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_job_target_legado
          ON personalizacao_job_targets (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE media_kind IS NULL AND aluno_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_job_target_base
          ON personalizacao_job_targets (job_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE media_kind IS NULL AND aluno_id IS NULL
        """
    )

    # A policy exigia conteudo_id, mas material de nivel topico grava
    # conteudo_id nulo (o microservice escreve `conteudo_id ?? null`), entao o
    # professor ja nao enxergava essas linhas. A base por topico torna isso
    # comum, entao o caminho por personalizacao_id entra como alternativa.
    op.execute("DROP POLICY IF EXISTS professor_all_materiais_gerados ON materiais_gerados")
    op.execute(
        """
        CREATE POLICY professor_all_materiais_gerados ON materiais_gerados
          FOR ALL TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM conteudos co
              JOIN topicos t ON t.id = co.topico_id
              JOIN classe c ON c.id = t.classe_id
              WHERE co.id = materiais_gerados.conteudo_id
                AND c.professor_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM conteudo_personalizado cp
              WHERE cp.id = materiais_gerados.personalizacao_id
                AND cp.classe_id IN (SELECT public.app_classes_do_professor())
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM conteudos co
              JOIN topicos t ON t.id = co.topico_id
              JOIN classe c ON c.id = t.classe_id
              WHERE co.id = materiais_gerados.conteudo_id
                AND c.professor_id = auth.uid()
            )
            OR EXISTS (
              SELECT 1 FROM conteudo_personalizado cp
              WHERE cp.id = materiais_gerados.personalizacao_id
                AND cp.classe_id IN (SELECT public.app_classes_do_professor())
            )
          )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS professor_all_materiais_gerados ON materiais_gerados")
    op.execute(
        """
        CREATE POLICY professor_all_materiais_gerados ON materiais_gerados
          FOR ALL TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM conteudos co
              JOIN topicos t ON t.id = co.topico_id
              JOIN classe c ON c.id = t.classe_id
              WHERE co.id = materiais_gerados.conteudo_id
                AND c.professor_id = auth.uid()
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1 FROM conteudos co
              JOIN topicos t ON t.id = co.topico_id
              JOIN classe c ON c.id = t.classe_id
              WHERE co.id = materiais_gerados.conteudo_id
                AND c.professor_id = auth.uid()
            )
          )
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_job_target_base")
    op.execute("DROP INDEX IF EXISTS uq_job_target_legado")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_job_target_legado
          ON personalizacao_job_targets (job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE media_kind IS NULL
        """
    )

    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_base_topico_perfil_sem_conteudo")
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_base_topico_conteudo_perfil")
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo
          ON conteudo_personalizado (aluno_id, topico_id, brainhex_profile_key)
          WHERE topico_id IS NOT NULL AND conteudo_id IS NULL
        """
    )
    op.execute("DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_conteudo_perfil")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_conteudo_personalizado_aluno_topico_conteudo_perfil
          ON conteudo_personalizado (aluno_id, topico_id, conteudo_id, brainhex_profile_key)
          WHERE topico_id IS NOT NULL AND conteudo_id IS NOT NULL
        """
    )

    # DROP NOT NULL nao e revertido: linhas base (aluno_id NULL) podem existir e
    # o ALTER falharia. Apagar material do professor para reverter schema seria
    # pior que a divergencia.
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_migrations_base_por_perfil.py -v`
Expected: PASS — 6 testes

- [ ] **Step 6: Aplicar no banco e conferir**

Run: `cd api && .venv/Scripts/python -m alembic upgrade head`
Expected: `Running upgrade 20260827_03 -> 20260827_04`

Conferir via MCP do Supabase (ou psql):

```sql
select table_name, is_nullable from information_schema.columns
where table_schema='public' and column_name='aluno_id'
  and table_name in ('conteudo_personalizado','personalizacao_job_targets',
                     'materiais_gerados','cards_personalizados',
                     'personalizacao_item_progresso','personalizacao_sugestao')
order by table_name;
```

Expected: `YES` para as quatro de artefato, `NO` para `personalizacao_item_progresso` e `personalizacao_sugestao`.

- [ ] **Step 7: Commit**

```bash
git add api/alembic/versions/20260827_04_base_por_perfil_sem_aluno.py api/tests/test_migrations_base_por_perfil.py
git commit -m "feat(base): aluno_id nullable nas tabelas de artefato, com unicidade propria da base"
```

---

## Task 2: `_upsert_targets` — casar `aluno_id` nulo

**Files:**
- Modify: `api/app/repositories/personalizacao_jobs.py:283` (o `WHERE` do UPDATE)
- Test: `api/tests/test_personalizacao_jobs_loop.py`

O UPDATE de conciliação casa com `AND aluno_id = CAST(:aluno_id AS UUID)`.
Comparação com `NULL` nunca é verdadeira, então para todo target base o UPDATE
não casa, o código cai no INSERT e **duplica o target a cada chamada**. A tabela
já usa `IS NOT DISTINCT FROM` para `conteudo_id` — é o mesmo remédio.

- [ ] **Step 1: Escrever o teste que falha**

Append em `api/tests/test_personalizacao_jobs_loop.py`:

```python
def test_upsert_target_casa_base_sem_aluno() -> None:
    """Target base tem aluno_id NULL. `= NULL` nunca casa, entao o UPDATE de
    conciliacao erraria e cada chamada inseriria uma duplicata."""
    import inspect
    from app.repositories.personalizacao_jobs import PersonalizacaoJobsRepository

    fonte = inspect.getsource(PersonalizacaoJobsRepository)
    assert "aluno_id IS NOT DISTINCT FROM CAST(:aluno_id AS UUID)" in fonte
    assert "AND aluno_id = CAST(:aluno_id AS UUID)" not in fonte
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_personalizacao_jobs_loop.py::test_upsert_target_casa_base_sem_aluno -v`
Expected: FAIL — `assert "aluno_id IS NOT DISTINCT FROM CAST(:aluno_id AS UUID)" in fonte`

- [ ] **Step 3: Corrigir o WHERE**

Em `api/app/repositories/personalizacao_jobs.py`, no UPDATE de `_upsert_targets`, trocar:

```python
                    WHERE job_id = CAST(:job_id AS UUID)
                      AND aluno_id = CAST(:aluno_id AS UUID)
```

por:

```python
                    WHERE job_id = CAST(:job_id AS UUID)
                      -- Target base tem aluno_id NULL, e `= NULL` nunca casa:
                      -- sem isto o UPDATE erra e cada chamada duplica o target.
                      AND aluno_id IS NOT DISTINCT FROM CAST(:aluno_id AS UUID)
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_personalizacao_jobs_loop.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/app/repositories/personalizacao_jobs.py api/tests/test_personalizacao_jobs_loop.py
git commit -m "fix(fila): upsert de target casa aluno_id nulo, senao a base duplica a cada chamada"
```

---

## Task 3: `_build_targets` — sempre 7 targets base

**Files:**
- Modify: `api/app/services/personalizacao_jobs.py:664-800` (`_build_targets`)
- Test: `api/tests/test_personalizacao_jobs_loop.py:594-660` (testes existentes mudam)

- [ ] **Step 1: Escrever o teste que falha**

Append em `api/tests/test_personalizacao_jobs_loop.py`:

```python
@pytest.mark.asyncio
async def test_build_targets_gera_base_em_turma_sem_aluno(monkeypatch) -> None:
    """Era o bug: turma vazia devolvia lista vazia, o job nascia 0/0 e fechava
    `completed` sem erro."""
    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository.listar_alunos_classe_com_perfil_dominante",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository.mapear_todos_conteudos_por_topicos",
        AsyncMock(return_value={117: [125]}),
    )

    targets, topics, _profile_map = await _build_targets(
        session=object(),
        kind="full_class_sync",
        classe_id=54,
        topico_ids=[117],
    )

    assert topics == [117]
    assert len(targets) == 7
    assert {item["aluno_id"] for item in targets} == {None}
    assert all(item["is_profile_template"] for item in targets)
    assert {item["brainhex_profile_key"] for item in targets} == {
        "seeker", "survivor", "daredevil", "mastermind",
        "conqueror", "socializer", "achiever",
    }
    # A base NAO entra no target_profile_map: a chave e (aluno, topico,
    # conteudo) e o perfil e o valor, entao os 7 perfis colapsariam numa
    # chave so e o mapa guardaria apenas o ultimo. Para a base o mapa e
    # desnecessario -- brainhex_profile_key ja vem na linha do target.
    assert _profile_map == {}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_personalizacao_jobs_loop.py::test_build_targets_gera_base_em_turma_sem_aluno -v`
Expected: FAIL — `assert 0 == 7` (a função retorna `[]` no early-return)

- [ ] **Step 3: Trocar o representante por base sem dono**

Em `api/app/services/personalizacao_jobs.py`, dentro do bloco
`if kind in {JOB_KIND_ENROLLMENT, JOB_KIND_CLASS_DELTA, ...}`, remover o
early-return e a eleição de representante:

```python
        if not alunos:
            return [], resolved_topicos, {}

        representative_by_profile: dict[str, str] = {}

        for profile_key in (brainhex_profile_keys or _BRAINHEX_PROFILE_KEYS):
            candidate = next(
                (
                    aluno
                    for aluno in alunos
                    if profile_by_aluno.get(aluno) == profile_key
                ),
                None,
            )
            if candidate is None:
                candidate = str(aluno_id) if aluno_id and str(aluno_id) in alunos else alunos[0]
            representative_by_profile[profile_key] = candidate
```

e substituir o laço de emissão por:

```python
        # A base nao tem dono: ela e material de (classe x topico x conteudo x
        # perfil), e existe com ou sem aluno matriculado. Antes, cada perfil era
        # pendurado num aluno representante -- e turma sem aluno nao gerava nada.
        for current_topico_id in resolved_topicos:
            scoped_conteudo_ids: list[int | None] = list(
                conteudos_por_topico.get(current_topico_id) or [None]
            )
            for current_conteudo_id in scoped_conteudo_ids:
                for profile_key in (brainhex_profile_keys or _BRAINHEX_PROFILE_KEYS):
                    _append_target(
                        owner_aluno_id=None,
                        topico_id=current_topico_id,
                        conteudo_id=current_conteudo_id,
                        profile_key=profile_key,
                    )
        return targets, resolved_topicos, target_profile_map
```

Ajustar `_append_target` para aceitar dono nulo e marcar toda base como template:

```python
    def _append_target(
        *,
        owner_aluno_id: str | None,
        topico_id: int,
        conteudo_id: int | None,
        profile_key: str,
    ) -> None:
        target = {
            "aluno_id": owner_aluno_id,
            "topico_id": topico_id,
            "conteudo_id": conteudo_id,
            "brainhex_profile_key": _normalize_profile_key(profile_key),
            # Sem dono, e base -- e base e sempre template. Com dono, so e
            # template se o material nao for do perfil do proprio aluno.
            "is_profile_template": (
                owner_aluno_id is None
                or profile_by_aluno.get(owner_aluno_id) != _normalize_profile_key(profile_key)
            ),
            "status": "pending",
        }
        targets.append(target)
        # So a camada por aluno entra no mapa. A chave e (aluno, topico,
        # conteudo) e o perfil e o VALOR: sem aluno, os 7 perfis colapsariam
        # na mesma chave e 6 seriam perdidos silenciosamente. A base nao
        # precisa do mapa -- `brainhex_profile_key` vem na propria linha do
        # target, que e a fonte primaria em _process_media_render_target.
        if owner_aluno_id is not None:
            target_profile_map[
                _target_profile_map_key(
                    aluno_id=owner_aluno_id,
                    topico_id=topico_id,
                    conteudo_id=conteudo_id,
                )
            ] = _normalize_profile_key(profile_key)
```

`_target_profile_map_key` **não muda** — ela continua recebendo `aluno_id: str`.

- [ ] **Step 4: Atualizar os testes que codificam o comportamento antigo**

`test_build_targets_generates_all_seven_profiles_with_one_student` afirma
`{item["aluno_id"]} == {student_id}` e `sum(not is_profile_template) == 1`.
Sob o design novo os 7 são base, sem dono. Substituir as três asserções finais:

```python
    assert {item["aluno_id"] for item in targets} == {None}
    assert {item["conteudo_id"] for item in targets} == {125}
    assert all(item["is_profile_template"] for item in targets)
    assert profile_map == {}
```

Em `test_build_targets_generates_seven_profiles_for_each_content`, a tupla de
unicidade continua válida (o `aluno_id` nulo é constante e os demais campos
diferenciam), então **não precisa mudar**.

- [ ] **Step 5: Impedir que `aluno_id` nulo vire a string `"None"`**

`_process_media_render_target` (linha ~1007) abre com:

```python
    aluno_id = str(target["aluno_id"])
```

`str(None)` devolve a **string literal `"None"`**, não um nulo. A partir do Task 3
todo target base chega aqui com `aluno_id` nulo, e esse `"None"` seguiria para
consultas e para o payload do microservice como se fosse um UUID. Trocar por:

```python
    # Target base nao tem dono. str(None) devolveria a string "None" e ela
    # viajaria adiante como se fosse UUID.
    aluno_id = str(target["aluno_id"]) if target.get("aluno_id") is not None else None
```

Escrever o teste antes:

```python
def test_target_base_nao_vira_string_none() -> None:
    import inspect
    from app.services import personalizacao_jobs

    fonte = inspect.getsource(personalizacao_jobs._process_media_render_target)
    assert 'aluno_id = str(target["aluno_id"])\n' not in fonte
    assert 'if target.get("aluno_id") is not None else None' in fonte
```

Run: `cd api && .venv/Scripts/python -m pytest tests/test_personalizacao_jobs_loop.py::test_target_base_nao_vira_string_none -v`
Expected: FAIL antes da troca, PASS depois

- [ ] **Step 6: Rodar a suíte e confirmar**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_personalizacao_jobs_loop.py -v`
Expected: PASS — incluindo os testes novos e os dois ajustados

- [ ] **Step 7: Commit**

```bash
git add api/app/services/personalizacao_jobs.py api/tests/test_personalizacao_jobs_loop.py
git commit -m "feat(base): _build_targets emite base por perfil sem depender de matricula"
```

---

## Task 4: Trigger `fn_enqueue_class_delta_job` — base sem `classe_aluno`

**Files:**
- Create: `api/alembic/versions/20260827_05_trigger_class_delta_base.py`
- Test: `api/tests/test_migrations_base_por_perfil.py`

O trigger criado em `20260827_03` monta a CTE `representante` a partir de
`classe_aluno` e filtra `WHERE r.aluno_id IS NOT NULL`. Em turma vazia ele cria
o job e zero target — o mesmo `0/0` pelo caminho automático.

- [ ] **Step 1: Escrever o teste que falha**

Append em `api/tests/test_migrations_base_por_perfil.py`:

```python
def _load_trigger_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260827_05_trigger_class_delta_base.py"
    )
    spec = importlib.util.spec_from_file_location("migration_20260827_05", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_trigger_nao_depende_mais_de_classe_aluno():
    module = _load_trigger_migration()
    assert module.revision == "20260827_05"
    assert module.down_revision == "20260827_04"

    sql = module.FN_ENQUEUE
    assert "WHERE r.aluno_id IS NOT NULL" not in sql
    assert "NULL::uuid" in sql
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_migrations_base_por_perfil.py::test_trigger_nao_depende_mais_de_classe_aluno -v`
Expected: FAIL — `FileNotFoundError`

- [ ] **Step 3: Escrever a migração**

Create `api/alembic/versions/20260827_05_trigger_class_delta_base.py`.

Copiar `FN_ENQUEUE` de `20260827_03_class_delta_no_banco.py` **inteiro** e trocar
apenas o bloco de targets. As CTEs `alunos`, `dominante` e `representante` saem;
`escopo` fica igual; o INSERT passa a ser:

```sql
  WITH perfis(chave) AS (
    VALUES ('seeker'), ('survivor'), ('daredevil'), ('mastermind'),
           ('conqueror'), ('socializer'), ('achiever')
  ),
  escopo AS (
    SELECT t.id AS topico_id, c.id AS conteudo_id
    FROM topicos t
    JOIN conteudos c ON c.topico_id = t.id
    WHERE t.id = ANY(v_topico_ids)
      AND (cardinality(v_conteudo_ids) = 0 OR c.id = ANY(v_conteudo_ids))
    UNION ALL
    SELECT t.id, NULL::bigint
    FROM topicos t
    WHERE t.id = ANY(v_topico_ids)
      AND NOT EXISTS (
        SELECT 1 FROM conteudos c2
        WHERE c2.topico_id = t.id
          AND (cardinality(v_conteudo_ids) = 0 OR c2.id = ANY(v_conteudo_ids))
      )
  )
  INSERT INTO personalizacao_job_targets (
    job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key, is_profile_template, status
  )
  SELECT v_job_id, NULL::uuid, e.topico_id, e.conteudo_id, p.chave, true, 'pending'
  FROM escopo e CROSS JOIN perfis p
  ON CONFLICT (job_id, topico_id, conteudo_id, brainhex_profile_key)
    WHERE media_kind IS NULL AND aluno_id IS NULL
  DO NOTHING;
```

Note o `ON CONFLICT` repetindo o predicado do índice parcial `uq_job_target_base`
— sem isso o Postgres levanta "no unique or exclusion constraint matching"
(convenção registrada no `CLAUDE.md`).

O `target_profile_map` do trigger passa a ser sempre `'{}'::jsonb`. Todo target
dele é base, e base não entra no mapa (mesma razão do Task 3: a chave não tem o
perfil, então os 7 colapsariam num só). Trocar o `SELECT ... jsonb_object_agg`
por:

```sql
  SELECT COUNT(*)::integer, '{}'::jsonb
    INTO v_total, v_profile_map
  FROM personalizacao_job_targets t
  WHERE t.job_id = v_job_id
    AND t.media_kind IS NULL;
```

`upgrade()` executa `FN_ENQUEUE` (os triggers de `20260827_03` continuam válidos,
pois só a função muda). `downgrade()` restaura a `FN_ENQUEUE` da `20260827_03`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_migrations_base_por_perfil.py -v`
Expected: PASS

- [ ] **Step 5: Aplicar e verificar em turma vazia**

Run: `cd api && .venv/Scripts/python -m alembic upgrade head`

Verificar no banco, numa transação descartável, que salvar tópico em turma sem
aluno agora cria targets. **A turma precisa ter `geracao_automatica = true`**;
com `false` o trigger toma o atalho do modo manual e não cria nada.

- [ ] **Step 6: Commit**

```bash
git add api/alembic/versions/20260827_05_trigger_class_delta_base.py api/tests/test_migrations_base_por_perfil.py
git commit -m "feat(base): trigger de class-delta gera base sem depender de classe_aluno"
```

---

## Task 5: Derivação da linha do aluno no job `enrollment`

**Files:**
- Modify: `api/app/services/personalizacao_jobs.py` (nova função + chamada em `_process_media_render_target`)
- Test: `api/tests/test_personalizacao_jobs_loop.py`

- [ ] **Step 1: Localizar o ponto de entrada**

Run: `cd api && grep -n "async def _process_media_render_target" -A 40 app/services/personalizacao_jobs.py | head -50`

Confirmar onde o target é resolvido em `aluno_id`/`topico_id`/`conteudo_id`.
A derivação entra **antes** da geração: se há base, copia; se não há, gera.

- [ ] **Step 2: Escrever o teste que falha**

Append em `api/tests/test_personalizacao_jobs_loop.py`:

```python
@pytest.mark.asyncio
async def test_derivar_do_base_copia_materiais_sem_regerar() -> None:
    """Enrollment nao deve regerar midia: a base ja tem o material do perfil."""
    from app.services.personalizacao_jobs import derivar_personalizacao_do_base

    executed: list[str] = []

    class FakeResult:
        def scalar(self):
            return 4242

    class FakeSession:
        async def execute(self, sql, params=None):
            executed.append(str(sql))
            return FakeResult()

    novo_id = await derivar_personalizacao_do_base(
        session=FakeSession(),
        aluno_id="b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        classe_id=32,
        topico_id=117,
        conteudo_id=125,
        brainhex_profile_key="seeker",
    )

    assert novo_id == 4242
    sql = "\n".join(executed)
    assert "INSERT INTO conteudo_personalizado" in sql
    assert "FROM conteudo_personalizado base" in sql
    assert "base.aluno_id IS NULL" in sql
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_personalizacao_jobs_loop.py::test_derivar_do_base_copia_materiais_sem_regerar -v`
Expected: FAIL — `ImportError: cannot import name 'derivar_personalizacao_do_base'`

- [ ] **Step 4: Implementar a derivação**

Em `api/app/services/personalizacao_jobs.py`, após `_seed_progress`:

```python
async def derivar_personalizacao_do_base(
    *,
    session: AsyncSession,
    aluno_id: str,
    classe_id: int,
    topico_id: int,
    conteudo_id: int | None,
    brainhex_profile_key: str,
) -> int | None:
    """Copia a base do perfil para uma linha do aluno.

    A geracao pesada acontece uma vez, na base. Matricular alguem nao deve
    disparar OpenAI/TTS de novo para material que ja existe: 30 alunos do mesmo
    perfil viram 30 derivacoes de uma geracao, nao 30 geracoes.

    Devolve o id da linha do aluno, ou None quando ainda nao ha base -- nesse
    caso o chamador segue pelo caminho de geracao normal.
    """
    result = await session.execute(
        text(
            """
            INSERT INTO conteudo_personalizado (
              aluno_id, classe_id, topico_id, conteudo_id, brainhex_profile_key,
              ciclo_id, plano, materiais, formato_prioritario, formatos_gerados,
              status, source_hash, gerado_em, updated_at
            )
            SELECT
              CAST(:aluno_id AS UUID), base.classe_id, base.topico_id, base.conteudo_id,
              base.brainhex_profile_key, base.ciclo_id, base.plano, base.materiais,
              base.formato_prioritario, base.formatos_gerados,
              base.status, base.source_hash, NOW(), NOW()
            FROM conteudo_personalizado base
            WHERE base.aluno_id IS NULL
              AND base.classe_id = :classe_id
              AND base.topico_id = :topico_id
              AND base.conteudo_id IS NOT DISTINCT FROM :conteudo_id
              AND base.brainhex_profile_key = :brainhex_profile_key
            ON CONFLICT DO NOTHING
            RETURNING id
            """
        ),
        {
            "aluno_id": aluno_id,
            "classe_id": classe_id,
            "topico_id": topico_id,
            "conteudo_id": conteudo_id,
            "brainhex_profile_key": brainhex_profile_key,
        },
    )
    return result.scalar()
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd api && .venv/Scripts/python -m pytest tests/test_personalizacao_jobs_loop.py -v`
Expected: PASS

- [ ] **Step 6: Ligar no fluxo de enrollment**

Em `_process_media_render_target`, logo **após** o bloco
`if job.get("kind") == JOB_KIND_CLEANUP:` (que já retorna cedo), inserir:

```python
    # Enrollment nao regera: a base do perfil ja tem o material. Derivar e
    # copiar linha -- 30 alunos do mesmo perfil viram 30 derivacoes de UMA
    # geracao. So quando ha base; sem ela, segue o caminho de geracao abaixo.
    if job.get("kind") == JOB_KIND_ENROLLMENT and aluno_id is not None:
        derivado_id = await derivar_personalizacao_do_base(
            session=session,
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            brainhex_profile_key=target_profile_key,
        )
        if derivado_id is not None:
            record = await ConteudoPersonalizadoRepository(session).buscar_por_id(
                int(derivado_id)
            ) or {}
            if record:
                await _seed_progress(session=session, record=record)
            await session.commit()
            return {
                "status": "completed",
                "personalizacao_id": int(derivado_id),
                "derivado_do_base": True,
            }
```

Confirmar que `ConteudoPersonalizadoRepository` já está importado no módulo:

Run: `cd api && grep -n "ConteudoPersonalizadoRepository" app/services/personalizacao_jobs.py | head -3`
Expected: pelo menos um `import` ou uso existente. Se não houver, adicionar
`from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository`
junto aos demais imports de repositório no topo do arquivo.

Conferir também que o dicionário devolvido casa com o que o chamador espera:

Run: `cd api && grep -n "_process_media_render_target(" -A 12 app/services/personalizacao_jobs.py | grep -n "status\|personalizacao_id" | head`
Expected: o chamador lê `status` do retorno. Se ele esperar outras chaves
obrigatórias, acrescentá-las ao `return` acima com os mesmos valores que o
caminho de sucesso normal usa.

- [ ] **Step 7: Rodar a suíte inteira da API**

Run: `cd api && .venv/Scripts/python -m pytest -q`
Expected: PASS — nenhuma regressão

- [ ] **Step 8: Commit**

```bash
git add api/app/services/personalizacao_jobs.py api/tests/test_personalizacao_jobs_loop.py
git commit -m "feat(base): enrollment deriva a linha do aluno da base em vez de regerar"
```

---

## Task 6: Verificação fim a fim

- [ ] **Step 1: Suíte completa da API**

Run: `cd api && .venv/Scripts/python -m pytest -q`
Expected: PASS

- [ ] **Step 2: Lint**

Run: `cd api && .venv/Scripts/python -m ruff check app tests`
Expected: sem erros

- [ ] **Step 3: Confirmar que o `0/0` acabou**

Com a API de pé e `geracao_automatica = true` no professor da turma vazia,
disparar geração manual pelo console e conferir:

```sql
select id::text, kind, status, total_targets, processed_targets
from personalizacao_jobs
where classe_id = 54
order by created_at desc limit 1;
```

Expected: `total_targets = 7 × (tópicos × conteúdos)`, não `0`.

- [ ] **Step 4: Confirmar que a base não duplicou**

```sql
select classe_id, topico_id, conteudo_id, brainhex_profile_key, count(*)
from conteudo_personalizado
where aluno_id is null
group by 1,2,3,4
having count(*) > 1;
```

Expected: zero linhas. Se vier alguma, o Task 2 não foi aplicado.

- [ ] **Step 5: Registrar no `CLAUDE.md`**

Acrescentar na seção "Tabelas Supabase (personalização)", logo após o item de
`conteudo_personalizado`:

```markdown
> **`aluno_id` nulo = base da classe por perfil.** Em `conteudo_personalizado`,
> `personalizacao_job_targets`, `materiais_gerados` e `cards_personalizados` a
> coluna aceita NULL, e NULL significa material de `(classe × tópico × conteúdo
> × perfil)` — sem dono. É a camada base das duas descritas acima, e ela existe
> com ou sem aluno matriculado: antes era simulada elegendo um aluno
> representante, e por isso turma vazia não gerava nada (job `0/0`).
>
> `personalizacao_item_progresso` e `personalizacao_sugestao` seguem `NOT NULL`:
> a linha de corte é entre **artefato** (pode ser da classe) e **comportamento**
> (é de gente). O worker já pulava as duas para `is_profile_template`.
>
> Ao escrever consulta nova sobre essas quatro tabelas, lembre que
> `aluno_id = :x` **não** casa com a base, e que índice único trata NULL como
> distinto — a unicidade da base é por `classe_id`, em índices parciais
> próprios (`20260827_04`).
```

- [ ] **Step 6: Atualizar o grafo e commitar**

```bash
graphify update .
git add CLAUDE.md
git commit -m "docs(claude): registra a base por perfil como camada sem dono"
```

---

## Riscos conhecidos

**A derivação depende da API estar de pé.** Foi a escolha registrada no spec, por
reaproveitar o job `enrollment`. É a mesma classe de acoplamento que derrubou o
console quando a API caiu; a alternativa (trigger em `classe_aluno`) está
documentada no spec se isso incomodar depois.

**As linhas `is_profile_template` atuais não são promovidas para base.** Promover
colidiria com a unique nova sempre que dois representantes diferentes tivessem
gerado a mesma combinação, e escolher qual material sobrevive não é decisão de
migração. Elas seguem servindo quem as consome.

A base é uma **chave nova** (`aluno_id IS NULL`), então ela não colide com
`_has_completed_current_generation` das linhas existentes e deve ser gerada no
primeiro job após o deploy, sem precisar de bump de
`_PERSONALIZACAO_PIPELINE_VERSION`. Isso é expectativa, não fato verificado —
o Step 3 do Task 6 é o que confirma. Se a base **não** aparecer, o bump vira
necessário e entra como tarefa própria.
