"""Guardas da `20260830_01` — tempo por lote e dedup por constraint.

Os testes de migracao deste repo inspecionam o SQL gerado, sem Postgres
(`test_migrations_progresso_no_banco.py` faz o mesmo). O que da para garantir
aqui e o que mais custou caro nesta area: a premissa da conta, e a ORDEM entre
deduplicar e trocar a conta.
"""

import importlib.util
import re
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _carregar(nome: str):
    caminho = VERSOES / nome
    spec = importlib.util.spec_from_file_location(f"migration_{nome}", caminho)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sql(direcao: str = "upgrade") -> str:
    module = _carregar("20260830_01_tempo_por_lote_e_dedup.py")
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return "\n".join(executado)


def _sem_comentarios(sql: str) -> str:
    return " ".join(linha.split("--", 1)[0] for linha in sql.splitlines())


def test_cadeia_de_revisao():
    module = _carregar("20260830_01_tempo_por_lote_e_dedup.py")
    assert module.revision == "20260830_01"
    assert module.down_revision == "20260829_03"


def test_a_conta_e_soma_direta_do_dwell():
    # O coletor zera o acumulador a cada flush (`buildEmptyBatch`), entao
    # `dwell_sec` e o tempo daquele lote. Somar e a conta certa.
    executavel = _sem_comentarios(_sql())
    assert "sum(e.dwell_sec)" in executavel


def test_a_regra_de_incremento_sai_do_upgrade():
    # `lag(...) OVER (...)` so faz sentido para contador cumulativo. Se ela
    # sobreviver ao upgrade, o bug voltou: era ela que descartava ate 80 por
    # cento do tempo do aluno.
    executavel = _sem_comentarios(_sql("upgrade"))
    assert "lag(" not in executavel
    assert "PARTITION BY" not in executavel


def test_downgrade_restaura_a_regra_de_incremento():
    # O downgrade tem de devolver o banco ao comportamento de `20260827_02`,
    # senao ele nao e um downgrade.
    executavel = _sem_comentarios(_sql("downgrade"))
    assert "lag(" in executavel


def test_dedup_entra_antes_de_a_conta_mudar():
    # A ordem e a razao de A1 e A5 serem a MESMA migracao. Hoje o ramo `ELSE 0`
    # da regra antiga engole a duplicata por acidente; trocar para `sum()` com a
    # duplicata ainda possivel converteria um erro para baixo num erro para
    # cima.
    sql = _sql()
    fim_do_indice = sql.index("CREATE UNIQUE INDEX")
    inicio_da_soma = sql.index("sum(e.dwell_sec)")
    assert fim_do_indice < inicio_da_soma, (
        "a chave unica precisa existir antes de a funcao passar a somar"
    )

    # E o DELETE das duplicatas ja gravadas vem antes da propria chave, senao a
    # criacao do indice falha no historico.
    assert sql.index("DELETE FROM telemetria_time_metric_entries") < fim_do_indice


def test_chave_de_dedup_nao_usa_item_key_sozinho():
    # Entradas de escopo `topic` nascem com `item_key` nulo, e no Postgres NULL
    # nao colide com NULL: um unique sobre ele nao deduplicaria nada justamente
    # no escopo que alimenta o percentual do topico.
    sql = _sql()
    indice = re.search(
        r"CREATE UNIQUE INDEX[^(]+\(([^)]+)\)", sql, re.IGNORECASE
    )
    assert indice is not None, "o indice unico sumiu"
    colunas = [c.strip() for c in indice.group(1).split(",")]
    assert colunas == ["lote_id", "scope", "entry_key"]


def test_entry_key_e_preenchido_pelo_banco():
    # Derivar no cliente deixaria de fora os apps JA PUBLICADOS, que escrevem
    # direto no Supabase pelo fallback — que e exatamente o caminho que gera a
    # duplicata.
    sql = _sql()
    assert "NEW.entry_key := CASE" in sql
    assert "telemetria_resolver_entidade" in sql


def test_entry_key_nunca_funde_linha_que_nao_soube_identificar():
    # O ELSE final precisa ser unico por linha. Um valor constante ali faria a
    # dedup apagar linhas legitimas que so nao tinham como ser identificadas.
    sql = _sql()
    assert "gen_random_uuid()" in sql


def test_rebackfill_recalcula_os_tres_escopos():
    # Sem isto o valor errado fica no banco ate o aluno voltar ao item.
    executavel = _sem_comentarios(_sql())
    for tabela in ("topico_aluno", "conteudo_aluno", "atividade_aluno"):
        assert f"UPDATE {tabela}" in executavel


def test_sql_nao_usa_por_cento():
    # `sa.text()` escapa `%` para `%%` pro paramstyle do driver; sem parametros
    # na execucao o `%%` chega literal ao Postgres. Mesmo guard de
    # `test_migrations_progresso_no_banco.py`.
    for direcao in ("upgrade", "downgrade"):
        assert "%" not in _sem_comentarios(_sql(direcao)), (
            f"{direcao} tem % no SQL executavel"
        )
