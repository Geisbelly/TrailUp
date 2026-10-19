import re
from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_01:20261021_02", sql=True)
    return output.getvalue()


def _sem_comentarios(sql: str) -> str:
    """SQL com os comentarios `--` removidos. Assercao de AUSENCIA tem de olhar o codigo, nao
    a documentacao: esta migration menciona `status_atividade` e `atividade_aluno` em
    comentario de proposito, justamente para registrar que NAO os usa."""
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_02:20261021_01", sql=True)
    return output.getvalue()


def test_as_duas_tabelas_nascem_com_rls_e_policy() -> None:
    """Tabela nova nasce com RLS pelo event trigger `ensure_rls` e, sem policy, devolve lista
    vazia em vez de excecao. Por isso tabela e policy no mesmo commit."""
    sql = _upgrade_sql()

    for tabela in ("missoes", "missao_aluno"):
        assert f"CREATE TABLE IF NOT EXISTS public.{tabela}" in sql
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in sql

    assert "CREATE POLICY missoes_professor_all ON public.missoes FOR ALL TO authenticated" in sql
    assert "CREATE POLICY missoes_aluno_sel ON public.missoes FOR SELECT TO authenticated" in sql
    assert "CREATE POLICY missao_aluno_posse_sel ON public.missao_aluno FOR SELECT TO authenticated" in sql


def test_missao_pendente_nao_existe_para_o_aluno() -> None:
    sql = _upgrade_sql()

    pos = sql.index("CREATE POLICY missoes_aluno_sel")
    policy = sql[pos : pos + 420]
    assert "ativa" in policy
    assert "aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])" in policy
    assert "app_classes_do_aluno()" in policy


def test_progresso_nao_tem_policy_de_escrita_e_isso_e_decisao() -> None:
    """Progresso e derivado, igual a `tempo_gasto_min` e `percentual_concluido`: quem escreve
    e a fase 3, por trigger DEFINER. A ausencia esta registrada no docstring para nao ser
    lida como esquecimento."""
    sql = _upgrade_sql()

    escritas = re.findall(r"CREATE POLICY (\w+) ON public\.missao_aluno FOR (\w+)", sql)
    assert escritas == [("missao_aluno_posse_sel", "SELECT")]
    assert "GRANT SELECT ON public.missao_aluno TO authenticated;" in sql
    assert "GRANT SELECT, INSERT, UPDATE, DELETE ON public.missao_aluno" not in sql


def test_indice_da_diaria_tem_slot_e_e_parcial() -> None:
    """O spec dizia `(classe_id, perfil_alvo, dia)`, o que contradiz 2-3 missoes por dia. Com
    `slot` cabem 2-3 e o gerador da fase 5 fica idempotente. `coalesce` porque varios NULL
    nao colidem num indice unico."""
    sql = _upgrade_sql()

    assert "ON public.missoes (classe_id, coalesce(perfil_alvo, ''), dia, slot)" in sql
    assert "WHERE dia IS NOT NULL" in sql
    assert "CHECK ((dia IS NULL) = (slot IS NULL))" in sql


def test_unique_que_conquistas_aluno_nao_tem() -> None:
    sql = _upgrade_sql()

    assert "CONSTRAINT missao_aluno_unica UNIQUE (aluno_id, missao_id)" in sql


def test_status_nao_e_o_enum_acentuado() -> None:
    """`status_atividade` tem rotulos irregulares (`não iniciado`, `concluido` sem acento no
    i). Missao nao herda a armadilha."""
    sql = _upgrade_sql()

    codigo = _sem_comentarios(sql)
    assert "status_atividade" not in codigo
    assert "'concluida'::text" in codigo
    assert "não iniciado" not in codigo
    assert "concluído" not in codigo


def test_guarda_congela_o_que_a_ia_escreveu() -> None:
    sql = _upgrade_sql()

    assert "IF OLD.origem <> 'professor' THEN" in sql
    # Espaco normalizado: o alinhamento das atribuicoes nao e contrato.
    compacto = re.sub(r"[ \t]+", " ", sql)
    for coluna in ("titulo", "descricao", "criterio", "recompensa_tipo", "janela_inicio", "janela_fim"):
        assert f"NEW.{coluna} := OLD.{coluna};" in compacto
    # Imutaveis sempre, independentemente da origem.
    for coluna in ("classe_id", "origem", "criado_por", "dia", "slot", "perfil_alvo", "criado_em"):
        assert f"NEW.{coluna} := OLD.{coluna};" in compacto


def test_valida_metrica_e_recompensa_no_trigger_nao_em_rpc() -> None:
    """O console escreve `missoes` direto, como ja escreve `atividades`. Validacao em RPC nao
    cobriria esse caminho."""
    sql = _upgrade_sql()

    assert "fn_conquista_metrica_suportada(v_metrica)" in sql
    assert "FROM public.eventos_pontuacao ep WHERE ep.tipo = NEW.recompensa_tipo" in sql
    assert "BEFORE INSERT OR UPDATE ON public.missoes" in sql


def test_semeia_os_tipos_de_recompensa_valendo_zero() -> None:
    """O trigger exige que `recompensa_tipo` exista, e a migracao usa `missao_concluida` — que
    o spec coloca na fase 4. Sem semear, a migracao quebraria em ambiente com missao."""
    sql = _upgrade_sql()

    assert "INSERT INTO public.eventos_pontuacao (tipo, pontos, descricao, moedas) VALUES" in sql
    assert "('missao_concluida',        0," in sql
    assert "('missao_diaria_concluida', 0," in sql
    assert "ON CONFLICT (tipo) DO NOTHING" in sql
    # O seed precede a migracao que o usa.
    assert sql.index("missao_concluida") < sql.index("INSERT INTO public.missoes (")


def test_migracao_preserva_o_vinculo_e_nao_move_entregas() -> None:
    sql = _upgrade_sql()

    assert "WHERE a.tipo = 'missao'" in sql
    assert "atividade_origem_id" in sql
    assert "'atividade_especifica'" in sql
    # Nao apaga a atividade original nem toca nas entregas.
    codigo = _sem_comentarios(sql)
    assert "DELETE FROM public.atividades" not in codigo
    assert "atividade_aluno" not in codigo
    # Reexecutar nao duplica.
    assert "NOT EXISTS (SELECT 1 FROM public.missoes m WHERE m.atividade_origem_id = a.id)" in sql


def test_aprovacao_obrigatoria_so_para_guilda_da_ia() -> None:
    sql = _upgrade_sql()

    assert "CONSTRAINT missoes_guilda_da_ia_exige_aprovacao" in sql
    assert "CHECK (aprovacao <> 'nao_requer' OR origem = 'professor' OR escopo <> 'guilda')" in sql
    assert "CONSTRAINT missoes_recusa_tem_motivo" in sql


def test_downgrade_nao_apaga_pontuacao_ja_usada() -> None:
    """Apagar linha de `eventos_pontuacao` que `eventos_aluno` referenciou mudaria pontuacao
    historica em silencio."""
    sql = _downgrade_sql()

    assert "DROP TABLE IF EXISTS public.missao_aluno" in sql
    assert "DROP TABLE IF EXISTS public.missoes" in sql
    assert "NOT EXISTS (SELECT 1 FROM public.eventos_aluno e WHERE e.tipo = ep.tipo)" in sql
