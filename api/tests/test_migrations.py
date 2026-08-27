from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url

from app.db import migrations

API_ROOT = Path(__file__).resolve().parents[1]


def _offline_alembic_config(output_buffer: StringIO | None = None) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"), output_buffer=output_buffer)
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["database_url_override"] = (
        "postgresql://user:password@localhost:5432/trailup"
    )
    return config


def test_upgrade_database_to_head_uses_project_alembic_config(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def upgrade_stub(config, revision: str) -> None:
        captured["config"] = config
        captured["revision"] = revision

    monkeypatch.setattr(migrations.command, "upgrade", upgrade_stub)

    database_url = "postgresql+asyncpg://user:secret@db.example.test:5432/trailup"
    migrations.upgrade_database_to_head(database_url)

    config = captured["config"]
    assert captured["revision"] == "head"
    assert Path(config.config_file_name).name == "alembic.ini"
    assert Path(config.get_main_option("script_location")).name == "alembic"
    assert config.attributes["database_url_override"] == database_url


def test_normalize_database_url_preserves_real_password() -> None:
    normalized = migrations.normalize_database_url_for_alembic(
        "postgresql+asyncpg://postgres.project:p%40ss%2Aword@db.example.test:6543/postgres"
    )

    parsed = make_url(normalized)
    assert parsed.drivername == "postgresql+psycopg"
    assert parsed.password == "p@ss*word"
    assert "***" not in normalized


def test_alembic_tem_uma_unica_cabeca_e_cadeia_continua() -> None:
    """Duas cabecas fazem `upgrade head` falhar -- e o nome antigo deste teste
    ("idempotent_generated_materials_is_the_only_alembic_head") ja nao dizia a
    verdade: ele fixava uma revisao qualquer, que virava divida a cada migracao
    nova. O invariante que importa e este: uma cabeca so, e caminho continuo
    dela ate a base.
    """
    scripts = ScriptDirectory.from_config(_offline_alembic_config())

    heads = scripts.get_heads()
    assert len(heads) == 1, f"cadeia ramificada: {heads}"

    visitadas = set()
    atual = scripts.get_revision(heads[0])
    while atual is not None:
        assert atual.revision not in visitadas, f"ciclo em {atual.revision}"
        visitadas.add(atual.revision)
        anterior = atual.down_revision
        if anterior is None:
            break
        assert isinstance(anterior, str), f"merge inesperado em {atual.revision}"
        atual = scripts.get_revision(anterior)

    # Toda migracao no diretorio precisa estar nesse caminho; uma solta nunca
    # roda e passa despercebida.
    todas = {revisao.revision for revisao in scripts.walk_revisions()}
    assert visitadas == todas, f"fora da cadeia: {sorted(todas - visitadas)}"


def test_personalizacao_jobs_conteudo_fk_renders_idempotent_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260801_01:20260803_01",
        sql=True,
    )
    rendered = output.getvalue()

    assert "fk_personalizacao_jobs_conteudo" in rendered
    assert "pg_constraint WHERE conname = 'fk_personalizacao_jobs_conteudo'" in rendered
    assert "FOREIGN KEY (conteudo_id) REFERENCES conteudos(id)" in rendered
    assert "UPDATE alembic_version SET version_num='20260803_01'" in rendered


def test_content_scoped_personalization_indexes_render_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260728_03:20260728_04",
        sql=True,
    )
    rendered = output.getvalue()

    assert "uq_conteudo_personalizado_aluno_topico_conteudo_perfil" in rendered
    assert "aluno_id,\n          topico_id,\n          conteudo_id" in rendered
    assert "conteudo_id IS NOT NULL" in rendered
    assert "uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo" in rendered
    assert "conteudo_id IS NULL" in rendered
    assert "DROP INDEX IF EXISTS uq_conteudo_personalizado_aluno_topico_perfil" in rendered
    assert "UPDATE alembic_version SET version_num='20260728_04'" in rendered


def test_generation_fencing_rpc_repair_renders_complete_idempotent_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260728_02:20260728_03",
        sql=True,
    )
    rendered = output.getvalue()

    assert (
        rendered.count(
            "CREATE OR REPLACE FUNCTION public.merge_personalizacao_materiais_v2"
        )
        == 1
    )
    assert (
        rendered.count(
            "CREATE OR REPLACE FUNCTION public.mark_personalizacao_failed_v2"
        )
        == 1
    )
    assert "pg_advisory_xact_lock(p_id)" in rendered
    assert "stale_generation para personalizacao" in rendered
    assert "ARRAY['audio', 'markdown', 'apresentacao']" in rendered
    assert "'generation_key', v_generation_key" in rendered
    assert "k <> 'apresentacao'" in rendered
    assert rendered.count("media_kind <> 'apresentacao'") == 2
    assert rendered.count("'puppeteer-html-v2'") == 3
    assert rendered.count("'2026-07-28.3'") == 3
    assert (
        "GRANT EXECUTE ON FUNCTION public.merge_personalizacao_materiais_v2"
        in rendered
    )
    assert (
        "GRANT EXECUTE ON FUNCTION public.mark_personalizacao_failed_v2"
        in rendered
    )
    assert "NOTIFY pgrst, 'reload schema'" in rendered
    assert "UPDATE alembic_version SET version_num='20260728_03'" in rendered
    assert "DROP FUNCTION" not in rendered
    assert "%%" not in rendered


def test_dynamic_generation_fencing_has_no_hardcoded_pipeline_version() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260728_04:20260728_05",
        sql=True,
    )
    rendered = output.getvalue()

    assert (
        rendered.count(
            "CREATE OR REPLACE FUNCTION public.merge_personalizacao_materiais_v2"
        )
        == 1
    )
    assert (
        rendered.count(
            "CREATE OR REPLACE FUNCTION public.mark_personalizacao_failed_v2"
        )
        == 1
    )
    assert "pg_advisory_xact_lock(p_id)" in rendered
    assert "stale_generation para personalizacao" in rendered
    assert "IS NOT DISTINCT FROM" in rendered
    assert "media_pipeline_version" in rendered
    assert "design_system" in rendered
    assert "puppeteer-html-v2" not in rendered
    assert "2026-07-28.3" not in rendered
    assert "UPDATE alembic_version SET version_num='20260728_05'" in rendered


def test_generated_material_history_is_idempotent_per_generation() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260728_05:20260728_06",
        sql=True,
    )
    rendered = output.getvalue()

    assert "ADD COLUMN IF NOT EXISTS generation_key TEXT" in rendered
    assert "GENERATED ALWAYS AS" in rendered
    assert "ROW_NUMBER() OVER" in rendered
    assert "uq_materiais_gerados_personalizacao_tipo_generation" in rendered
    assert "personalizacao_id,\n          tipo,\n          generation_key" in rendered
    assert "UPDATE alembic_version SET version_num='20260728_06'" in rendered


def test_sugestao_material_tables_render_idempotent_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(
        config,
        "20260821_01:20260825_01",
        sql=True,
    )
    rendered = output.getvalue()

    # As duas tabelas, e o log referenciando a sugestao com SET NULL: apagar a
    # sugestao atual nao pode apagar o historico, que e a base da metrica.
    assert "CREATE TABLE IF NOT EXISTS personalizacao_sugestao" in rendered
    assert "CREATE TABLE IF NOT EXISTS personalizacao_sugestao_log" in rendered
    assert "ON DELETE SET NULL" in rendered
    assert "CASCADE" not in rendered

    # Unico por alvo, com COALESCE porque NULL nao colide com NULL em UNIQUE.
    assert "personalizacao_sugestao_alvo_uidx" in rendered
    assert "COALESCE(conteudo_id, -1)" in rendered

    # Estados validos travados no banco, nao so no codigo.
    assert "origem IN ('inicial', 'revisao')" in rendered
    assert "acao IN ('criada', 'revisada', 'mantida')" in rendered

    assert "UPDATE alembic_version SET version_num='20260825_01'" in rendered


def test_notificacoes_via_banco_renders_idempotent_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(config, "20260826_02:20260826_03", sql=True)
    rendered = output.getvalue()

    # As tres tabelas sem as quais push, login e tempo de uso nao existem.
    assert "CREATE TABLE IF NOT EXISTS notificacoes_dispositivos" in rendered
    assert "CREATE TABLE IF NOT EXISTS aluno_sessoes_app" in rendered
    assert "CREATE TABLE IF NOT EXISTS aluno_atividade_diaria" in rendered

    # Configuracao numa tabela, nao espalhada por SQL.
    assert "CREATE TABLE IF NOT EXISTS notificacoes_config" in rendered
    assert "'max_por_dia'" in rendered

    # O dedupe que `resposta_hash` sempre prometeu e nunca entregou.
    assert "notificacoes_ia_resposta_hash_uidx" in rendered
    # O dedupe da fila NAO pode filtrar por status: filtrando, a linha sairia do
    # indice ao ser entregue e a rotina dispararia de novo no proximo poll.
    assert "notificacoes_pendentes_dedupe_uidx" in rendered
    assert "dedupe_key IS NOT NULL AND status" not in rendered

    assert "UPDATE alembic_version SET version_num='20260826_03'" in rendered


def test_notificacoes_motor_sql_renders_offline_sql() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(config, "20260826_03:20260826_04", sql=True)
    rendered = output.getvalue()

    # As RPCs que o app chama.
    for rpc in (
        "notificacoes_registrar_login",
        "notificacoes_heartbeat",
        "notificacoes_encerrar_sessao",
        "notificacoes_minhas_rotinas",
        "notificacoes_salvar_rotina",
        "notificacoes_desativar_dispositivo",
    ):
        assert f"GRANT EXECUTE ON FUNCTION public.{rpc}" in rendered, rpc

    # As internas NAO podem ser chamaveis pelo app: expo-las deixaria o aluno
    # disparar entrega em nome de qualquer outro.
    for interna in (
        "notificacoes_entregar",
        "notificacoes_processar_rotinas",
        "notificacoes_enviar_push",
        "notificacoes_varrer",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{interna}" in rendered, interna
        assert f"GRANT EXECUTE ON FUNCTION public.{interna}" not in rendered, interna

    # A API so insere a sugestao; o trigger faz o resto.
    assert "CREATE TRIGGER trg_notificacoes_ia_promover" in rendered

    # Push sai do proprio banco — e o que alcanca o app FECHADO.
    assert "net.http_post" in rendered

    # As policies abertas (`USING (true)` para `public`) precisam MORRER: elas
    # deixavam qualquer portador da chave anon ler e apagar notificacao alheia.
    assert 'DROP POLICY IF EXISTS "Enable read access for all users" ON notificacoes' in rendered
    assert "USING (aluno_id = auth.uid())" in rendered
    assert "WITH CHECK (aluno_id = auth.uid())" in rendered

    assert "UPDATE alembic_version SET version_num='20260826_04'" in rendered


def test_push_migra_para_expo_tokens_e_fecha_policies() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(config, "20260826_06:20260826_07", sql=True)
    rendered = output.getvalue()

    # O token e a identidade do aparelho para a Expo: precisa ser unico para o
    # upsert poder trocar o dono num celular compartilhado.
    assert "expo_tokens_token_uidx" in rendered
    # Os dados sao migrados ANTES do drop — a migracao nao pode depender de a
    # tabela nova estar vazia para estar correta.
    assert "INSERT INTO expo_tokens" in rendered
    assert rendered.index("INSERT INTO expo_tokens") < rendered.index(
        "DROP TABLE IF EXISTS notificacoes_dispositivos"
    )
    # As policies abertas de expo_tokens morrem.
    assert 'DROP POLICY IF EXISTS "Enable read access for all users" ON expo_tokens' in rendered
    assert "CREATE POLICY expo_tokens_aluno_sel" in rendered
    assert "USING (aluno_id = auth.uid())" in rendered

    assert "UPDATE alembic_version SET version_num='20260826_07'" in rendered


def test_rls_sem_anonimo_migra_policies_para_authenticated() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(config, "20260826_07:20260826_08", sql=True)
    rendered = output.getvalue()

    # `format()` esta fora de proposito: o Alembic duplica o marcador de
    # parametro ao renderizar offline (--sql), e o ALTER POLICY gerado sairia
    # invalido. `quote_ident` + concatenacao executa igual nos dois caminhos.
    assert "ALTER POLICY ' || quote_ident(r.policyname)" in rendered
    assert "EXECUTE format(" not in rendered
    assert "TO authenticated" in rendered
    # `{public}` exato: uma policy ja concedida a roles especificos nao pode ser
    # tocada, para nao remover acesso intencional.
    assert "roles::text = '{public}'" in rendered

    assert "UPDATE alembic_version SET version_num='20260826_08'" in rendered


def test_posse_por_tabela_usa_a_cadeia_de_classe() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(config, "20260826_08:20260826_09", sql=True)
    rendered = output.getvalue()

    # Helpers SECURITY DEFINER: uma policy em classe_aluno que consultasse
    # classe_aluno entraria em recursao de RLS.
    for fn in ("app_classes_do_professor", "app_classes_do_aluno",
               "app_alunos_do_professor", "app_colegas_de_turma"):
        assert f"FUNCTION public.{fn}" in rendered, fn
        assert f"REVOKE ALL ON FUNCTION public.{fn}" in rendered, fn

    # As policies herdadas `USING (true)` precisam morrer.
    assert 'DROP POLICY IF EXISTS "Enable read access for all users"' in rendered

    # Aluno matriculado LE o conteudo (trilha sem conteudo nao e trilha),
    # mas quem escreve e o professor dono.
    assert "app_minhas_classes()" in rendered
    assert "app_classes_do_professor()" in rendered

    # Sem policy de DELETE nas tabelas de progresso do aluno: apagar
    # `eventos_aluno` zeraria o ranking, e era o que a policy aberta permitia.
    assert "CREATE POLICY eventos_aluno_posse_del" not in rendered

    # Escalada de privilegio: so o professor do vinculo escreve.
    assert "CREATE POLICY professor_aluno_posse_ins" in rendered
    assert "WITH CHECK (professor_id = auth.uid())" in rendered

    assert "UPDATE alembic_version SET version_num='20260826_09'" in rendered


def test_views_deixam_de_contornar_o_rls() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(config, "20260826_09:20260826_10", sql=True)
    rendered = output.getvalue()

    # Uma view sem `security_invoker` roda como o DONO e ignora o RLS das
    # tabelas base — era um segundo bypass, paralelo ao das policies.
    assert "SET (security_invoker = on)" in rendered
    assert "vw_metricas_desempenho_aluno_classe" in rendered

    # O ranking mantem o bypass de proposito (soma eventos de varios alunos),
    # mas filtrado pelas classes do chamador.
    assert "vw_rank_posicoes_por_classe_todas" in rendered
    assert "app_minhas_classes()" in rendered

    # Professor ganha a telemetria dos alunos DELE — a posse que faltava.
    assert "telemetria_lotes_professor_sel" in rendered
    assert "app_alunos_do_professor()" in rendered

    assert "UPDATE alembic_version SET version_num='20260826_10'" in rendered


def test_recalculo_de_progresso_nao_coage_enum_nem_perde_acento() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(config, "20260826_10:20260826_11", sql=True)
    rendered = output.getvalue()

    # `conteudo_aluno.status` e `atividade_aluno.status` sao do enum
    # `status_atividade`. Sem o `::text`, o COALESCE resolve para o enum e o
    # Postgres tenta coagir '' a ele — o INSERT em `conteudos` abortava.
    assert "coalesce(ca.status::text, '')" in rendered
    assert "coalesce(aa.status::text, '')" in rendered
    # `personalizacao_item_progresso.status` e text de verdade: fica sem cast.
    assert "coalesce(pip.status, '')" in rendered

    # Os rotulos reais do enum tem acento; sem ele, todo topico com progresso
    # zero (o caso mais comum) falhava ao gravar.
    assert "não iniciado" in rendered
    assert "v_status := 'nao iniciado'" not in rendered

    # Guarda de codificacao: o projeto ja teve mojibake commitado, e este
    # arquivo carrega string acentuada dentro de SQL dentro de Python.
    assert "PERFORM 'não iniciado'::status_atividade" in rendered

    assert "UPDATE alembic_version SET version_num='20260826_11'" in rendered


def test_conciliacao_de_push_liga_ticket_ao_token() -> None:
    output = StringIO()
    config = _offline_alembic_config(output)

    migrations.command.upgrade(config, "20260826_14:20260826_15", sql=True)
    rendered = output.getvalue()

    # Sem guardar o id da requisicao nao ha o que conciliar: `pg_net` e
    # assincrono e a resposta so aparece depois, em `net._http_response`.
    assert "CREATE TABLE IF NOT EXISTS notificacoes_push_envios" in rendered
    assert "request_id" in rendered

    # A Expo responde um ticket por mensagem NA ORDEM do array enviado; sem a
    # ordem dos tokens nao da para saber qual ticket condena qual aparelho.
    assert "array_agg(d.token ORDER BY d.id)" in rendered
    assert "ORDER BY d.id" in rendered

    # So erro definitivo desativa. Um transitorio nao pode silenciar o
    # aparelho de um aluno.
    assert "v_erro IN ('DeviceNotRegistered', 'InvalidCredentials')" in rendered
    # A desativacao acontece DENTRO desse IF: qualquer outro erro passa reto.
    assert rendered.count("SET ativo = FALSE, desativado_motivo = v_erro") == 1

    # A conciliacao e interna: expo-la deixaria qualquer um marcar token alheio.
    assert "REVOKE ALL ON FUNCTION public.notificacoes_conciliar_push" in rendered

    assert "UPDATE alembic_version SET version_num='20260826_15'" in rendered
