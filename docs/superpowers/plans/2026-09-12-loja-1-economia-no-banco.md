# Loja, fatia 1: economia no banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O aluno passa a acumular moeda ao estudar, com saldo auditável e impossível de fabricar pelo cliente.

**Architecture:** Duas migrações Alembic. A primeira cria o livro-razão append-only `moedas_ledger` e as RPCs de leitura; a segunda liga o ganho, com `eventos_pontuacao` decidindo quanto cada evento paga, sobreposto por turma, e um gatilho idempotente em `eventos_aluno`. Nada na API: a fatia inteira é Postgres.

**Tech Stack:** Postgres (Supabase), Alembic, pytest. Os testes geram o SQL da migração em modo offline (`sql=True`) e afirmam sobre o texto — não precisam de banco vivo.

**Spec:** `docs/superpowers/specs/2026-09-12-loja-de-moedas-design.md`

## Global Constraints

- **Nada na API.** Saldo, preço e ganho não têm modelo de linguagem no meio. Nenhum arquivo em `api/app/` muda nesta fatia — só `api/alembic/` e `api/tests/`.
- **Encoding UTF-8 sem BOM, sempre.** Já houve mojibake commitado no repositório.
- **`ON CONFLICT` sobre índice PARCIAL exige repetir o predicado** — `ON CONFLICT (col) WHERE col IS NOT NULL`. Sem ele o Postgres levanta "no unique or exclusion constraint matching".
- **RLS é a autorização, não defesa extra.** `anon` e `authenticated` têm GRANT nas tabelas; a policy é a única barreira. Anônimo não lê nada.
- **Policy nova usa os helpers `SECURITY DEFINER`** (`app_classes_do_professor()`, `app_alunos_do_professor()`) em vez de repetir o `EXISTS` — uma policy que consulta a própria tabela entra em recursão de RLS.
- **Toda view nova nasce com `security_invoker = on`.** Sem isso ela roda como `postgres` e ignora as policies das tabelas base.
- **`COALESCE(coluna_enum, '')` estoura em tempo de execução.** Use `coluna::text` antes do COALESCE.
- **Função nova leva `SET search_path TO 'public', 'pg_temp'`**, seguindo `20260909_03`.
- Gasto **nunca** toca `eventos_aluno.valor` nem a posição no rank.

**Helpers que já existem e devem ser reusados, não reescritos:**
- `public.fn_eventos_aluno_resolve_classe_id(p_tipo text, p_referencia text) RETURNS bigint` — criado em `20260909_01`.
- `public.fn_evento_creditado(p_tipo text) RETURNS boolean` — criado em `20260909_03`.
- `public.app_classes_do_professor()` e `public.app_alunos_do_professor()` — criados em `20260826_08`..`20260826_10`.

---

### Task 1: A tabela do razão

**Files:**
- Create: `api/alembic/versions/20260912_01_moedas_razao.py`
- Create: `api/tests/test_moedas_razao.py`

**Interfaces:**
- Consumes: nada.
- Produces: tabela `public.moedas_ledger` com colunas `id bigserial`, `aluno_id uuid`, `delta numeric`, `motivo text`, `evento_tipo text`, `referencia text`, `classe_id bigint`, `compra_id bigint`, `criado_em timestamptz`; índice único parcial `moedas_ledger_ganho_unico`. Revisão `20260912_01`, `down_revision = "20260909_05"`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `api/tests/test_moedas_razao.py`:

```python
"""O saldo de moedas sai de um razao append-only, nao de uma coluna mutavel.

Coluna de saldo perde o historico: sem ele nao ha como auditar de onde veio a
moeda nem provar que ninguem a fabricou. E' o aceite do #142.
"""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260909_05:20260912_01", sql=True
    )
    return output.getvalue()


def test_o_razao_e_append_only_e_guarda_a_origem() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.moedas_ledger" in sql
    # `delta <> 0`: linha de valor zero e' ruido que nao muda saldo nenhum.
    assert "CHECK (delta <> 0)" in sql
    # A origem precisa sobreviver: sem motivo nao da' para auditar.
    assert "motivo" in sql and "'evento','dotacao','compra','estorno','concessao'" in sql


def test_o_mesmo_ganho_nao_paga_duas_vezes() -> None:
    """Sem isto, reabrir a mesma atividade e' a forma mais barata de enriquecer:
    sao 86 eventos de revisao num unico aluno de demonstracao."""
    sql = _sql()

    assert "CREATE UNIQUE INDEX" in sql
    assert "moedas_ledger_ganho_unico" in sql
    assert "(aluno_id, evento_tipo, referencia)" in sql
    # Parcial: so' o ganho e' idempotente. Duas compras iguais sao legitimas.
    assert "WHERE motivo = 'evento'" in sql


def test_o_cliente_nao_escreve_no_razao() -> None:
    """RLS e' a unica barreira, e moeda digitavel pelo cliente e' o mesmo
    defeito que o #164 corrigiu no rank."""
    sql = _sql()

    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE INSERT, UPDATE, DELETE ON public.moedas_ledger" in sql
    assert "FROM anon, authenticated" in sql


def test_o_aluno_le_so_o_proprio_extrato() -> None:
    sql = _sql()

    assert "CREATE POLICY moedas_ledger_sel_proprio" in sql
    assert "aluno_id = auth.uid()" in sql
    # Anonimo nao le nada.
    assert "TO authenticated" in sql


def test_o_professor_le_o_razao_dos_alunos_dele() -> None:
    """Via helper SECURITY DEFINER: policy que consulta a propria tabela
    entraria em recursao de RLS."""
    sql = _sql()

    assert "CREATE POLICY moedas_ledger_sel_professor" in sql
    assert "aluno_id IN (SELECT public.app_alunos_do_professor())" in sql
```

- [ ] **Step 2: Rode o teste para confirmar que falha**

```bash
cd api && .venv/bin/python -m pytest tests/test_moedas_razao.py -v
```

Esperado: FAIL. O Alembic não encontra a revisão `20260912_01`.

- [ ] **Step 3: Escreva a migração**

Crie `api/alembic/versions/20260912_01_moedas_razao.py`:

```python
"""o saldo de moedas sai de um razao append-only

XP mede, moeda gasta. O rank soma `eventos_aluno.valor`; se gastar reduzisse
XP, o placar se mexeria quando alguem comprasse uma dica, e a posicao deixaria
de significar esforco acumulado. Por isso a moeda e' uma tabela propria, e
nenhuma escrita daqui chega perto de `eventos_aluno`.

Saldo e' `SUM(delta)`, nunca uma coluna. Coluna de saldo perde o historico --
e sem historico nao ha como auditar de onde veio a moeda. Com 20 alunos num
piloto o custo do SUM e' irrelevante; se crescer vira indice ou vista
materializada sem mudar a interface publica.

O indice unico e' PARCIAL de proposito. Ganho e' idempotente: o mesmo acerto na
mesma questao paga uma vez na vida, senao reabrir a mesma atividade vira a
melhor fonte de renda do sistema (sao 86 eventos de revisao num unico aluno de
demonstracao). Compra nao entra na regra: comprar duas vezes o mesmo item e'
legitimo.

Revision ID: 20260912_01
Revises: 20260909_05
Create Date: 2026-09-12
"""

from alembic import op

revision = "20260912_01"
down_revision = "20260909_05"
branch_labels = None
depends_on = None


TABELA = """
CREATE TABLE IF NOT EXISTS public.moedas_ledger (
  id           bigserial   PRIMARY KEY,
  aluno_id     uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  delta        numeric     NOT NULL CHECK (delta <> 0),
  motivo       text        NOT NULL CHECK (motivo IN
                 ('evento','dotacao','compra','estorno','concessao')),
  evento_tipo  text        NULL,
  referencia   text        NULL,
  classe_id    bigint      NULL REFERENCES public.classe(id) ON DELETE SET NULL,
  compra_id    bigint      NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.moedas_ledger IS
  'Livro-razao append-only das moedas. Saldo e SUM(delta); nunca materializar.';

COMMENT ON COLUMN public.moedas_ledger.classe_id IS
  'De qual turma veio a moeda. Serve a metrica; nao participa do saldo.';

CREATE INDEX IF NOT EXISTS moedas_ledger_aluno_idx
  ON public.moedas_ledger (aluno_id, criado_em DESC);

CREATE UNIQUE INDEX IF NOT EXISTS moedas_ledger_ganho_unico
  ON public.moedas_ledger (aluno_id, evento_tipo, referencia)
  WHERE motivo = 'evento';
"""

RLS = """
ALTER TABLE public.moedas_ledger ENABLE ROW LEVEL SECURITY;

-- Escrita so' por RPC SECURITY DEFINER. Se o cliente pudesse inserir aqui, a
-- moeda seria digitavel -- o mesmo defeito que o #164 corrigiu no rank.
REVOKE INSERT, UPDATE, DELETE ON public.moedas_ledger FROM anon, authenticated;

DROP POLICY IF EXISTS moedas_ledger_sel_proprio ON public.moedas_ledger;
CREATE POLICY moedas_ledger_sel_proprio ON public.moedas_ledger
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid());

DROP POLICY IF EXISTS moedas_ledger_sel_professor ON public.moedas_ledger;
CREATE POLICY moedas_ledger_sel_professor ON public.moedas_ledger
  FOR SELECT TO authenticated
  USING (aluno_id IN (SELECT public.app_alunos_do_professor()));
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(RLS)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.moedas_ledger CASCADE;")
```

- [ ] **Step 4: Rode o teste para confirmar que passa**

```bash
cd api && .venv/bin/python -m pytest tests/test_moedas_razao.py -v
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Rode o teste de higiene das migrações**

```bash
cd api && .venv/bin/python -m pytest tests/test_migracoes_higiene.py -v
```

Esperado: PASS. Ele valida a cadeia de revisões; se `down_revision` estiver errado, falha aqui.

- [ ] **Step 6: Commit**

```bash
git add api/alembic/versions/20260912_01_moedas_razao.py api/tests/test_moedas_razao.py
git commit -m "feat(banco): livro-razao append-only das moedas"
```

---

### Task 2: Ler o saldo e o extrato

**Files:**
- Modify: `api/alembic/versions/20260912_01_moedas_razao.py`
- Modify: `api/tests/test_moedas_razao.py`

**Interfaces:**
- Consumes: `public.moedas_ledger` (Task 1).
- Produces: `public.loja_saldo() RETURNS numeric` e `public.loja_extrato(p_limite integer DEFAULT 50) RETURNS TABLE(criado_em timestamptz, delta numeric, motivo text, evento_tipo text, classe_id bigint)`.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente ao fim de `api/tests/test_moedas_razao.py`:

```python
def test_o_saldo_e_somado_no_banco_nunca_no_cliente() -> None:
    """Percentual do topico, tempo de estudo e ranking ja foram calculados no
    app, e nas tres vezes o numero do cliente passou por cima do certo."""
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.loja_saldo()" in sql
    assert "SUM(delta)" in sql
    # Sem linha nenhuma o saldo e' zero, nao NULL: NULL vira "—" na tela.
    assert "COALESCE(SUM(delta), 0)" in sql


def test_o_saldo_e_do_chamador_e_de_mais_ninguem() -> None:
    sql = _sql()

    assert "WHERE aluno_id = auth.uid()" in sql


def test_o_extrato_diz_de_onde_veio_cada_moeda() -> None:
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.loja_extrato" in sql
    assert "p_limite integer DEFAULT 50" in sql
```

- [ ] **Step 2: Rode o teste para confirmar que falha**

```bash
cd api && .venv/bin/python -m pytest tests/test_moedas_razao.py -k saldo -v
```

Esperado: FAIL, `assert "CREATE OR REPLACE FUNCTION public.loja_saldo()" in sql`.

- [ ] **Step 3: Escreva as funções**

Em `20260912_01_moedas_razao.py`, acrescente a constante e chame no `upgrade`:

```python
FUNCOES = """
-- SECURITY INVOKER de proposito: a RPC le o razao do proprio chamador, e as
-- policies de SELECT ja fazem o recorte. Definer aqui seria privilegio a mais
-- sem necessidade.
CREATE OR REPLACE FUNCTION public.loja_saldo()
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT COALESCE(SUM(delta), 0)
    FROM public.moedas_ledger
   WHERE aluno_id = auth.uid();
$fn$;

CREATE OR REPLACE FUNCTION public.loja_extrato(p_limite integer DEFAULT 50)
RETURNS TABLE (
  criado_em   timestamptz,
  delta       numeric,
  motivo      text,
  evento_tipo text,
  classe_id   bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT criado_em, delta, motivo, evento_tipo, classe_id
    FROM public.moedas_ledger
   WHERE aluno_id = auth.uid()
   ORDER BY criado_em DESC, id DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 50), 200));
$fn$;

GRANT EXECUTE ON FUNCTION public.loja_saldo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.loja_extrato(integer) TO authenticated;
"""
```

E no `upgrade`, depois de `op.execute(RLS)`:

```python
    op.execute(FUNCOES)
```

- [ ] **Step 4: Rode o teste para confirmar que passa**

```bash
cd api && .venv/bin/python -m pytest tests/test_moedas_razao.py -v
```

Esperado: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add api/alembic/versions/20260912_01_moedas_razao.py api/tests/test_moedas_razao.py
git commit -m "feat(banco): loja_saldo e loja_extrato leem o razao do chamador"
```

---

### Task 3: Quanto cada evento paga em moeda

**Files:**
- Create: `api/alembic/versions/20260912_02_ganho_de_moedas.py`
- Create: `api/tests/test_ganho_de_moedas.py`

**Interfaces:**
- Consumes: `public.eventos_pontuacao` (criada em `20260909_05`).
- Produces: coluna `public.eventos_pontuacao.moedas numeric NOT NULL DEFAULT 0`; dicionário `MOEDAS: dict[str, int]` no módulo da migração. Revisão `20260912_02`, `down_revision = "20260912_01"`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `api/tests/test_ganho_de_moedas.py`:

```python
"""O professor define o ganho; o banco decide o valor.

`eventos_pontuacao` ja decide quantos PONTOS vale cada evento desde
`20260909_05`. Aqui ela passa a decidir tambem quantas MOEDAS, com sobreposicao
por turma -- e o gatilho paga uma vez so' por (aluno, tipo, referencia).
"""

from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from types import ModuleType

from alembic.config import Config

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = API_ROOT / "alembic" / "versions" / "20260912_02_ganho_de_moedas.py"


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def _sql() -> str:
    output = StringIO()
    migrations.command.upgrade(
        _offline_alembic_config(output), "20260912_01:20260912_02", sql=True
    )
    return output.getvalue()


def _modulo() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_moedas", MIGRACAO)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_moeda_mora_ao_lado_do_ponto_nao_dentro_dele() -> None:
    """Moeda com valor proprio permite pagar moeda por algo que nao vale XP, e
    o contrario -- o professor calibra os dois separadamente."""
    sql = _sql()

    assert "ALTER TABLE public.eventos_pontuacao" in sql
    assert "ADD COLUMN IF NOT EXISTS moedas numeric NOT NULL DEFAULT 0" in sql
    assert "CHECK (moedas >= 0)" in sql


def test_revisar_nao_paga_moeda() -> None:
    """Sao 86 eventos de revisao num unico aluno de demonstracao. A 1 moeda
    cada, revisar seria a melhor fonte de renda do sistema."""
    modulo = _modulo()

    assert modulo.MOEDAS["atividade_revisada"] == 0


def test_errar_nao_tira_e_nao_da() -> None:
    """Errar faz parte de aprender; o saldo nao pode andar para tras por isso."""
    modulo = _modulo()

    assert modulo.MOEDAS["atividade_errada"] == 0


def test_estudar_paga_mais_que_abrir_a_tela() -> None:
    modulo = _modulo()

    assert modulo.MOEDAS["atividade_concluida"] > modulo.MOEDAS["conteudo_concluido"]
    assert modulo.MOEDAS["conteudo_concluido"] > 0
    assert modulo.MOEDAS["topico_aberto"] == 0
    assert modulo.MOEDAS["conteudo_aberto"] == 0


def test_o_ciclo_da_ia_nao_paga_moeda() -> None:
    """O ciclo e' da IA, nao do aluno -- era daqui que saiam 6466 dos 6470
    pontos antes do 20260909_05."""
    modulo = _modulo()

    assert modulo.MOEDAS["ciclo_iniciado"] == 0
    assert modulo.MOEDAS["ciclo_executado"] == 0
```

- [ ] **Step 2: Rode o teste para confirmar que falha**

```bash
cd api && .venv/bin/python -m pytest tests/test_ganho_de_moedas.py -v
```

Esperado: FAIL. A revisão `20260912_02` não existe.

- [ ] **Step 3: Escreva a migração**

Crie `api/alembic/versions/20260912_02_ganho_de_moedas.py`:

```python
"""o professor define o ganho em moedas; o banco aplica

`eventos_pontuacao` ja decidia quantos pontos vale cada evento. Ganha `moedas`
ao lado, porque XP e moeda medem coisas diferentes: XP e' esforco acumulado e
precisa ser monotonico; moeda e' o que se gasta. Ter valor proprio permite
pagar moeda por algo que nao vale XP, e o contrario.

`atividade_revisada` paga zero de proposito. Sao 86 eventos desse tipo num
unico aluno de demonstracao -- a 1 moeda cada, revisar seria a melhor fonte de
renda do sistema, e a estrategia dominante viraria reabrir a mesma atividade.

Revision ID: 20260912_02
Revises: 20260912_01
Create Date: 2026-09-12
"""

from alembic import op

revision = "20260912_02"
down_revision = "20260912_01"
branch_labels = None
depends_on = None


# tipo -> moedas. Semente, nao dogma: a tabela existe para ser ajustada sem
# migracao nova, e o professor sobrepoe por turma.
MOEDAS: dict[str, int] = {
    "conteudo_concluido": 2,
    "atividade_concluida": 3,
    "atividade_acertada": 1,
    # Errar faz parte de aprender: o saldo nao anda para tras.
    "atividade_errada": 0,
    # Zero de proposito: ver o cabecalho.
    "atividade_revisada": 0,
    # Abrir nao e' esforco.
    "topico_aberto": 0,
    "topico_iniciado": 0,
    "topico_pular_conteudo": 0,
    "conteudo_aberto": 0,
    "atividade_iniciada": 0,
    # O ciclo e' da IA, nao do aluno.
    "ciclo_iniciado": 0,
    "ciclo_executado": 0,
}


def _linhas_seed() -> str:
    return ",\n".join(f"    ('{tipo}', {moedas})" for tipo, moedas in MOEDAS.items())


COLUNA = f"""
ALTER TABLE public.eventos_pontuacao
  ADD COLUMN IF NOT EXISTS moedas numeric NOT NULL DEFAULT 0;

ALTER TABLE public.eventos_pontuacao
  DROP CONSTRAINT IF EXISTS eventos_pontuacao_moedas_check;

ALTER TABLE public.eventos_pontuacao
  ADD CONSTRAINT eventos_pontuacao_moedas_check CHECK (moedas >= 0);

INSERT INTO public.eventos_pontuacao (tipo, moedas)
VALUES
{_linhas_seed()}
ON CONFLICT (tipo) DO UPDATE SET moedas = EXCLUDED.moedas;
"""


def upgrade() -> None:
    op.execute(COLUNA)


def downgrade() -> None:
    op.execute("ALTER TABLE public.eventos_pontuacao DROP COLUMN IF EXISTS moedas;")
```

- [ ] **Step 4: Rode o teste para confirmar que passa**

```bash
cd api && .venv/bin/python -m pytest tests/test_ganho_de_moedas.py -v
```

Esperado: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add api/alembic/versions/20260912_02_ganho_de_moedas.py api/tests/test_ganho_de_moedas.py
git commit -m "feat(banco): eventos_pontuacao passa a dizer quantas moedas cada evento paga"
```

---

### Task 4: O professor sobrepõe o ganho na turma dele

**Files:**
- Modify: `api/alembic/versions/20260912_02_ganho_de_moedas.py`
- Modify: `api/tests/test_ganho_de_moedas.py`

**Interfaces:**
- Consumes: coluna `moedas` (Task 3), `public.app_classes_do_professor()`.
- Produces: tabela `public.eventos_pontuacao_classe (classe_id bigint, tipo text, pontos numeric NULL, moedas numeric NULL)`, PK `(classe_id, tipo)`.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente ao fim de `api/tests/test_ganho_de_moedas.py`:

```python
def test_a_turma_sobrepoe_o_padrao_global() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.eventos_pontuacao_classe" in sql
    assert "PRIMARY KEY (classe_id, tipo)" in sql


def test_nulo_significa_herda_o_global() -> None:
    """Quem nao mexe em nada continua com o padrao: nenhuma turma precisa ser
    configurada para funcionar."""
    sql = _sql()

    assert "pontos     numeric NULL" in sql
    assert "moedas     numeric NULL" in sql


def test_so_o_dono_da_classe_escreve_o_ganho_dela() -> None:
    """Via helper SECURITY DEFINER: o predicado que consultasse classe_aluno
    direto entraria em recursao de RLS."""
    sql = _sql()

    assert "CREATE POLICY eventos_pontuacao_classe_professor" in sql
    assert "classe_id IN (SELECT public.app_classes_do_professor())" in sql


def test_o_aluno_ve_quanto_rende_mas_nao_escreve() -> None:
    sql = _sql()

    assert "CREATE POLICY eventos_pontuacao_classe_sel" in sql
    assert (
        "REVOKE INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe FROM anon"
        in sql
    )
```

- [ ] **Step 2: Rode o teste para confirmar que falha**

```bash
cd api && .venv/bin/python -m pytest tests/test_ganho_de_moedas.py -k sobrepoe -v
```

Esperado: FAIL, `assert "CREATE TABLE IF NOT EXISTS public.eventos_pontuacao_classe" in sql`.

- [ ] **Step 3: Escreva a tabela e as policies**

Em `20260912_02_ganho_de_moedas.py`, acrescente:

```python
OVERRIDE = """
CREATE TABLE IF NOT EXISTS public.eventos_pontuacao_classe (
  classe_id  bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  tipo       text    NOT NULL,
  pontos     numeric NULL CHECK (pontos >= 0),
  moedas     numeric NULL CHECK (moedas >= 0),
  PRIMARY KEY (classe_id, tipo)
);

COMMENT ON TABLE public.eventos_pontuacao_classe IS
  'Sobreposicao por turma de eventos_pontuacao. NULL herda o valor global.';

ALTER TABLE public.eventos_pontuacao_classe ENABLE ROW LEVEL SECURITY;

-- O aluno precisa ver quanto cada acao rende na turma dele.
DROP POLICY IF EXISTS eventos_pontuacao_classe_sel ON public.eventos_pontuacao_classe;
CREATE POLICY eventos_pontuacao_classe_sel ON public.eventos_pontuacao_classe
  FOR SELECT TO authenticated
  USING (true);

-- Escrita e' do professor, e so' nas classes dele -- quem recorta e' a policy
-- abaixo, nao o GRANT. Pelo console, nao pela API.
REVOKE INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe FROM anon;
GRANT INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe TO authenticated;

DROP POLICY IF EXISTS eventos_pontuacao_classe_professor
  ON public.eventos_pontuacao_classe;
CREATE POLICY eventos_pontuacao_classe_professor ON public.eventos_pontuacao_classe
  FOR ALL TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));
"""
```

E no `upgrade`, depois de `op.execute(COLUNA)`:

```python
    op.execute(OVERRIDE)
```

E no `downgrade`, antes do `DROP COLUMN`:

```python
    op.execute("DROP TABLE IF EXISTS public.eventos_pontuacao_classe CASCADE;")
```

- [ ] **Step 4: Rode o teste para confirmar que passa**

```bash
cd api && .venv/bin/python -m pytest tests/test_ganho_de_moedas.py -v
```

Esperado: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add api/alembic/versions/20260912_02_ganho_de_moedas.py api/tests/test_ganho_de_moedas.py
git commit -m "feat(banco): professor sobrepoe o ganho da turma dele"
```

---

### Task 5: O gatilho que paga, uma vez só

**Files:**
- Modify: `api/alembic/versions/20260912_02_ganho_de_moedas.py`
- Modify: `api/tests/test_ganho_de_moedas.py`

**Interfaces:**
- Consumes: `public.moedas_ledger` (Task 1), coluna `moedas` (Task 3), `public.eventos_pontuacao_classe` (Task 4), `public.fn_eventos_aluno_resolve_classe_id(text, text)`, `public.fn_evento_creditado(text)`.
- Produces: `public.fn_moedas_do_evento(p_tipo text, p_classe_id bigint) RETURNS numeric` e gatilho `trg_eventos_aluno_paga_moeda AFTER INSERT ON public.eventos_aluno`.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente ao fim de `api/tests/test_ganho_de_moedas.py`:

```python
def test_a_turma_vence_o_global_quando_define() -> None:
    sql = _sql()

    assert "CREATE OR REPLACE FUNCTION public.fn_moedas_do_evento" in sql
    # COALESCE na ordem certa: turma primeiro, global depois, zero no fim.
    assert "COALESCE(v_moedas_classe, v_moedas_global, 0)" in sql


def test_tipo_desconhecido_vale_zero_e_nao_e_recusado() -> None:
    """Recusar quebraria o fluxo do aluno na cara dele se algum cliente
    emitisse um tipo novo. Valendo zero, o buraco fecha do mesmo jeito."""
    sql = _sql()

    assert "RETURNS numeric" in sql
    assert "COALESCE(v_moedas_classe, v_moedas_global, 0)" in sql


def test_o_pagamento_e_depois_do_insert_e_idempotente() -> None:
    """O DO NOTHING e' o que impede a faucet infinita: se moeda viesse de
    acerto em questao repetivel, a estrategia dominante seria chutar ate
    acertar."""
    sql = _sql()

    assert "AFTER INSERT ON public.eventos_aluno" in sql
    assert "trg_eventos_aluno_paga_moeda" in sql
    # Convencao do repo: ON CONFLICT sobre indice PARCIAL repete o predicado.
    assert (
        "ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'"
        in sql
    )
    assert "DO NOTHING" in sql


def test_o_gatilho_nao_toca_no_xp() -> None:
    """Gasto nunca altera XP nem posicao no rank -- aceite do #142. O gatilho
    e' AFTER e nao atribui NEW.valor em lugar nenhum."""
    sql = _sql()

    inicio = sql.find("FUNCTION public.fn_eventos_aluno_paga_moeda")
    fim = sql.find("$fn$;", inicio)
    corpo = sql[inicio:fim]

    assert "NEW.valor" not in corpo
    assert "UPDATE public.eventos_aluno" not in corpo


def test_evento_concedido_tambem_paga() -> None:
    """Presenca concedida pelo professor e' esforco do aluno tanto quanto
    concluir um conteudo: fn_evento_creditado separa quem define o VALOR em
    pontos, nao quem merece moeda."""
    sql = _sql()

    inicio = sql.find("FUNCTION public.fn_eventos_aluno_paga_moeda")
    fim = sql.find("$fn$;", inicio)
    corpo = sql[inicio:fim]

    assert "fn_evento_creditado" not in corpo
```

- [ ] **Step 2: Rode o teste para confirmar que falha**

```bash
cd api && .venv/bin/python -m pytest tests/test_ganho_de_moedas.py -k gatilho -v
```

Esperado: FAIL, `assert "AFTER INSERT ON public.eventos_aluno" in sql`.

- [ ] **Step 3: Escreva a função e o gatilho**

Em `20260912_02_ganho_de_moedas.py`, acrescente:

```python
GATILHO = """
CREATE OR REPLACE FUNCTION public.fn_moedas_do_evento(
  p_tipo      text,
  p_classe_id bigint
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_moedas_classe numeric;
  v_moedas_global numeric;
BEGIN
  IF p_classe_id IS NOT NULL THEN
    SELECT moedas INTO v_moedas_classe
      FROM public.eventos_pontuacao_classe
     WHERE classe_id = p_classe_id AND tipo = p_tipo;
  END IF;

  SELECT moedas INTO v_moedas_global
    FROM public.eventos_pontuacao
   WHERE tipo = p_tipo;

  -- Tipo desconhecido vale zero, nao e' recusado: recusar quebraria o fluxo do
  -- aluno na cara dele se algum cliente emitisse um tipo novo.
  RETURN COALESCE(v_moedas_classe, v_moedas_global, 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_paga_moeda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_classe_id bigint;
  v_moedas    numeric;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  v_moedas := public.fn_moedas_do_evento(NEW.tipo, v_classe_id);

  IF v_moedas <= 0 THEN
    RETURN NEW;
  END IF;

  -- O predicado do indice parcial precisa ser repetido no ON CONFLICT, senao o
  -- Postgres nao casa o indice e levanta "no unique or exclusion constraint
  -- matching".
  INSERT INTO public.moedas_ledger
    (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
  VALUES
    (NEW.aluno_id, v_moedas, 'evento', NEW.tipo, NEW.referencia, v_classe_id)
  ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'
  DO NOTHING;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_eventos_aluno_paga_moeda ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_paga_moeda
  AFTER INSERT ON public.eventos_aluno
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_eventos_aluno_paga_moeda();
"""
```

E no `upgrade`, depois de `op.execute(OVERRIDE)`:

```python
    op.execute(GATILHO)
```

E no `downgrade`, como primeira linha:

```python
    op.execute(
        "DROP TRIGGER IF EXISTS trg_eventos_aluno_paga_moeda ON public.eventos_aluno;"
    )
```

- [ ] **Step 4: Rode o teste para confirmar que passa**

```bash
cd api && .venv/bin/python -m pytest tests/test_ganho_de_moedas.py -v
```

Esperado: PASS, 14 testes.

- [ ] **Step 5: Rode a suíte inteira da API**

```bash
cd api && .venv/bin/python -m pytest -q
```

Esperado: o mesmo número de falhas que já existe em `origin/main` — hoje **36 falhas por falta do `greenlet` no venv local**, com o restante passando. Nenhuma falha nova. Se aparecer falha nova, ela é sua.

- [ ] **Step 6: Commit**

```bash
git add api/alembic/versions/20260912_02_ganho_de_moedas.py api/tests/test_ganho_de_moedas.py
git commit -m "feat(banco): evento de estudo paga moeda, uma vez por referencia"
```

---

## Fora desta fatia

Cada uma vira um plano próprio, na ordem do §10 da spec. Nenhuma começa antes desta terminar.

| fatia | conteúdo | bloqueio |
|---|---|---|
| 2 | `loja_itens`, `loja_config_classe`, `loja_dotacao`, `loja_compras`, `loja_comprar` com `troca_formato` | esta |
| 3 | `atividade_tentativa`, gate de revisão, `segunda_chance` com 90/10 | fatia 2 |
| 4 | `atividade_prazo_aluno`, `prazo_extra` | fatia 2 **e a issue #177** |
| 5 | métricas e painel do professor | fatia 3 |
| 6 | mobile: aba Social, vitrine, faixa de revisão | fatia 2 |

**A issue #186 não bloqueia esta fatia, mas bloqueia o piloto.** O índice parcial cobre a reentrada com a mesma referência; o #186 cobre o acerto que chega duas vezes com referências diferentes. Fechar antes de a economia valer alguma coisa para os alunos.
