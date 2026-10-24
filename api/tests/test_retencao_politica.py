"""Portao do item (2) da #195: tabela com dado de pessoa precisa de prazo.

Estatico (roda sempre, sem banco):

- toda tabela com coluna de pessoa no esqueleto da producao
  (`fixtures/schema_prod_esqueleto_20261024.sql`) ou criada por migracao tem
  linha em `retencao_politica` (semeada pela `20261024_03`) ou esta em
  `retencao_isentas.txt`;
- migracao DEPOIS da `20261024_03` que cria tabela com coluna de pessoa
  registra a politica no mesmo arquivo (`INSERT INTO public.retencao_politica`);
- a lista de isentas so diminui.

O portao vivo (catalogo de um Postgres de verdade) esta em
`test_e2e_retencao_expurgo.py`.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

AQUI = Path(__file__).resolve().parent
VERSOES = AQUI.parent / "alembic" / "versions"
ESQUELETO = AQUI / "fixtures" / "schema_prod_esqueleto_20261024.sql"
ISENTAS = AQUI / "retencao_isentas.txt"
MIGRACAO = "20261024_03_retencao_e_expurgo.py"

# Quantas isentas existem hoje. Diminuir aqui e bem-vindo; aumentar, nao.
MAX_ISENTAS = 3

COLUNA_DE_PESSOA = re.compile(
    r"^(aluno_id|aluno_[ab]_id|user_id|professor_id|criado_por|registrado_por|autor_id"
    r"|remetente_id|destinatario_id|convidante_id|convidado_id|solicitante_id|blocked_by_id"
    r"|ator_id|email|device_id|nome_aluno|aluno_nome|nome_responsavel|thread_id)$"
)

CREATE_TABLE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\"?([A-Za-z_][A-Za-z0-9_]*)\"?\s*\((.*?)\n\s*\)",
    re.IGNORECASE | re.DOTALL,
)


def _modulo():
    spec = importlib.util.spec_from_file_location("retencao_03", VERSOES / MIGRACAO)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _colunas(corpo: str) -> set[str]:
    nomes = set()
    for linha in corpo.splitlines():
        m = re.match(r'\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s+\S', linha)
        if m and m.group(1).upper() not in {"CONSTRAINT", "PRIMARY", "UNIQUE", "FOREIGN", "CHECK"}:
            nomes.add(m.group(1))
    return nomes


def _tabelas_com_pessoa(sql: str) -> set[str]:
    return {
        nome for nome, corpo in CREATE_TABLE.findall(sql) if any(COLUNA_DE_PESSOA.match(c) for c in _colunas(corpo))
    }


def _isentas() -> dict[str, str]:
    saida = {}
    for linha in ISENTAS.read_text(encoding="utf-8").splitlines():
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        tabela, _, motivo = linha.partition("|")
        saida[tabela.strip()] = motivo.strip()
    return saida


def _migracoes() -> list[Path]:
    return sorted(VERSOES.glob("2*.py"))



def _tabelas_registradas_por_insert(sql: str) -> set[str]:
    """Lê os VALUES explícitos das migrações posteriores, sem contar simples menções.

    O inventário original considerava só POLITICAS da migração 03: rejeitava
    tabelas novas mesmo quando a própria migração registrava sua política.
    """
    tabelas = set()
    for bloco in re.findall(
        r"INSERT\s+INTO\s+public\.retencao_politica\s*\(\s*tabela\s*,(?:'(?:''|[^'])*'|[^;'])*;",
        sql, re.IGNORECASE | re.DOTALL,
    ):
        valores = re.split(r"\bVALUES\b", bloco, maxsplit=1, flags=re.IGNORECASE)
        if len(valores) == 2:
            tabelas.update(re.findall(r"\(\s*'([A-Za-z_][A-Za-z0-9_]*)'\s*,", valores[1]))
    return tabelas


def test_inventario_inclui_politica_adicionada_por_migracao_posterior() -> None:
    sql = """INSERT INTO public.retencao_politica (tabela, acao, categoria, motivo) VALUES
      ('diario', 'vida_da_conta', 'vida_da_conta', 'uso; sai com a conta'),
      ('introducao', 'vida_da_conta', 'vida_da_conta', 'uso')
    ON CONFLICT (tabela, acao) DO NOTHING;"""
    assert _tabelas_registradas_por_insert(sql) == {"diario", "introducao"}
    assert not _tabelas_registradas_por_insert("SELECT 'diario' FROM public.retencao_politica;")

def test_esqueleto_existe_e_tem_as_tabelas() -> None:
    sql = ESQUELETO.read_text(encoding="utf-8")
    assert 'CREATE TABLE public."alunos"' in sql
    assert len(_tabelas_com_pessoa(sql)) > 50


def test_isentas_tem_motivo_e_so_diminui() -> None:
    isentas = _isentas()
    assert all(isentas.values()), "toda isenta precisa de motivo"
    assert len(isentas) <= MAX_ISENTAS, (
        "retencao_isentas.txt cresceu: tabela nova com dado de pessoa entra em "
        "retencao_politica, nao na lista de isentas"
    )


def test_toda_tabela_com_pessoa_tem_politica_ou_e_isenta() -> None:
    registradas = {p[0] for p in _modulo().POLITICAS}
    for arquivo in _migracoes():
        if arquivo.name > MIGRACAO:
            registradas |= _tabelas_registradas_por_insert(arquivo.read_text(encoding="utf-8"))
    isentas = _isentas()
    tabelas = _tabelas_com_pessoa(ESQUELETO.read_text(encoding="utf-8"))
    for arquivo in _migracoes():
        if arquivo.name.startswith("2026") and arquivo.name >= "20261024":
            tabelas |= _tabelas_com_pessoa(arquivo.read_text(encoding="utf-8"))
    faltando = sorted(tabelas - registradas - set(isentas))
    assert not faltando, f"tabela com dado de pessoa sem prazo em retencao_politica: {faltando}"
    sobrando = sorted(set(isentas) & registradas)
    assert not sobrando, f"isenta que ja tem politica (tire da lista): {sobrando}"


def test_migracao_nova_com_tabela_de_pessoa_registra_politica() -> None:
    faltando = []
    for arquivo in _migracoes():
        if arquivo.name <= MIGRACAO:
            continue
        texto = arquivo.read_text(encoding="utf-8")
        for tabela in _tabelas_com_pessoa(texto):
            registra = re.search(
                r"INSERT\s+INTO\s+public\.retencao_politica.*?['\"]" + re.escape(tabela) + r"['\"]",
                texto,
                re.IGNORECASE | re.DOTALL,
            )
            if not registra:
                faltando.append(f"{arquivo.name}: {tabela}")
    assert not faltando, "migracao cria tabela com dado de pessoa sem INSERT em retencao_politica: " + ", ".join(
        faltando
    )


def test_detector_pega_tabela_nova_sem_politica() -> None:
    # O portao nao pode ser decorativo: uma tabela inventada com aluno_id e pega.
    sql = "CREATE TABLE IF NOT EXISTS public.diario_secreto (\n  id bigint,\n  aluno_id uuid NOT NULL\n)"
    assert _tabelas_com_pessoa(sql) == {"diario_secreto"}
    assert _tabelas_com_pessoa("CREATE TABLE public.x (\n  id bigint\n)") == set()


def test_prazos_da_decisao() -> None:
    m = _modulo()
    por_chave = {(p[0], p[1]): p for p in m.POLITICAS}
    assert por_chave[("telemetria_eventos_app", "apagar")][3:5] == (90, 180)
    assert por_chave[("telemetria_lotes", "redigir")][3:5] == (90, 180)
    assert por_chave[("telemetria_lotes", "apagar")][3:5] == (395, 730)
    assert por_chave[("telemetria_time_metric_entries", "agregar_e_apagar")][3:5] == (395, 730)
    assert por_chave[("aluno_mental_state_history", "apagar")][3:5] == (30, None)
    for t in m.CONSENTIMENTOS:
        assert por_chave[(t, "apagar")][3] == 1826
        assert por_chave[(t, "apagar")][5] == "t.aluno_id IS NULL"


def test_job_nasce_em_simulacao() -> None:
    m = _modulo()
    assert "('retencao_modo', 'simular'" in m.CONFIG_SQL
    assert "ON CONFLICT (chave) DO NOTHING" in m.CONFIG_SQL


def test_encadeamento() -> None:
    m = _modulo()
    assert (m.revision, m.down_revision) == ("20261024_03", "20261024_02")
