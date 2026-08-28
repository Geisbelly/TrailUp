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
    # As CTEs que tiravam representante da turma somem.
    assert "FROM classe_aluno ca" not in sql
    assert "representante AS" not in sql


def test_trigger_repete_o_predicado_do_indice_parcial_da_base():
    # ON CONFLICT sobre indice PARCIAL exige repetir o predicado, senao o
    # Postgres levanta "no unique or exclusion constraint matching".
    sql = _load_trigger_migration().FN_ENQUEUE
    assert "ON CONFLICT (job_id, topico_id, conteudo_id, brainhex_profile_key)" in sql
    assert "WHERE media_kind IS NULL AND aluno_id IS NULL" in sql


def test_trigger_nao_escreve_target_profile_map():
    # Chave e (aluno, topico, conteudo) e o perfil e o VALOR: sem aluno, os 7
    # perfis colapsariam numa chave so. Todo target do trigger e base.
    sql = _load_trigger_migration().FN_ENQUEUE
    assert "jsonb_object_agg" not in sql
