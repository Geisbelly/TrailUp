"""`20261117_02`: a missão guarda um desafio, com gabarito que o aluno não lê.

Banco local com o esqueleto de produção e o caminho real do prêmio, montado como o e2e da
`20261117_01` (`test_e2e_premio_de_missao_na_turma`, que tem a lista e os dublês). Por cima dele:

- a `20261117_01` aplicada (a migration daqui troca texto que ela deixa);
- a guarda de `missoes` como a cadeia a deixa (`20261103_06`) e o gatilho dela (`20261021_02`);
- as policies de `missoes` da `20261021_02` (`missoes_professor_all` e `missoes_aluno_sel`);
- dublê de `fn_conquista_metrica_suportada` (catálogo de produção fora do teste). Ele recusa
  `desafio`, para provar que é a guarda que aceita a métrica, e não o dublê.

Quem escreve como cliente usa `SET LOCAL ROLE authenticated` e as claims, como o PostgREST faria.
O desafio é semeado pelo dono com o sinal `app.desafio_gravando`, que é o que a RPC da Tarefa 3 fará.
Dados sintéticos.
"""

from __future__ import annotations

import json
import re
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_premio_de_missao_na_turma as t1

pytestmark = f5.e2e

M = f5.modulo("20261117_02_desafio_na_missao.py")
M_T1 = f5.modulo("20261117_01_premio_de_missao_na_turma.py")
M_ENTIDADE = f5.modulo("20261021_02_missoes_entidade.py")
_RETENCAO = (f5.VERSOES / "20261024_03_retencao_e_expurgo.py").read_text(encoding="utf-8")
_INICIO = "CREATE TABLE IF NOT EXISTS public.retencao_politica ("
TABELA_RETENCAO = _RETENCAO[_RETENCAO.index(_INICIO) : _RETENCAO.index(");", _RETENCAO.index(_INICIO)) + 2]

TURMA = f5.TURMA
TURMA_2 = 2  # outra turma do mesmo professor
TURMA_OUTRA = 3  # turma de outro professor
PROF_2 = uuid.UUID(int=12)
CONTEUDO = t1.CONTEUDO
CONTEUDO_2 = 901
GRUPO = uuid.UUID(int=700)
GRUPO_2 = uuid.UUID(int=701)
DESAFIO = {"tipo": "logica", "enunciado": "Qual é o próximo número? 2, 4, 8", "formato": "curta"}
GABARITO = {"aceitas": ["16"]}

GATILHO_GUARDA = """
DROP TRIGGER IF EXISTS trg_missoes_guarda ON public.missoes;
CREATE TRIGGER trg_missoes_guarda
  BEFORE INSERT OR UPDATE ON public.missoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_missoes_guarda();
"""

METRICAS = """
CREATE OR REPLACE FUNCTION public.fn_conquista_metrica_suportada(p_metrica text)
  RETURNS boolean LANGUAGE sql IMMUTABLE
  AS $$ SELECT p_metrica IN ('atividades_concluidas', 'eventos_totais', 'eventos_do_tipo') $$;
"""


def _policies_de_missoes() -> list[str]:
    achadas = re.findall(r"CREATE POLICY missoes_\w+ ON public\.missoes .*?;", M_ENTIDADE.SQL, re.S)
    assert {re.match(r"CREATE POLICY (\w+)", p).group(1) for p in achadas} == {
        "missoes_professor_all",
        "missoes_aluno_sel",
    }
    return ["ALTER TABLE public.missoes ENABLE ROW LEVEL SECURITY", *achadas]


def _banco(com_migration: bool = True):
    return f5.banco(
        *t1._cadeia(),
        *f5.sql_de(M_T1),
        METRICAS,
        TABELA_RETENCAO,
        M.M06.guarda(),
        GATILHO_GUARDA,
        *_policies_de_missoes(),
        *(f5.sql_de(M) if com_migration else []),
    )


def _semear(c) -> None:
    t1._semear(c)
    f5.afrouxa(c, "classe")
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{PROF_2}', 'prof2@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF_2}', 'Prof 2');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  ({TURMA_2}, 1, '{f5.PROF}', 'T2'), ({TURMA_OUTRA}, 1, '{PROF_2}', 'T3');
INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES
  (20, {TURMA_2}, 'Outro', 1);
INSERT INTO public.conteudos (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES ({CONTEUDO_2}, 10, 'C2');
"""
    )
    # Os prêmios dos desafios vêm da migration; sem ela (controle), o dono os põe aqui.
    c.execute(
        "INSERT INTO public.eventos_pontuacao (tipo, pontos, moedas) VALUES"
        " ('desafio_logica', 10, 2), ('desafio_cruzadinha', 10, 2) ON CONFLICT (tipo) DO NOTHING"
    )


def _desafio(c, *, perfil: str = "mastermind", grupo: uuid.UUID = GRUPO, conteudo: int = CONTEUDO,
             criterio: dict | None = None) -> int:
    """O que a RPC da Tarefa 3 fará: o dono, com o sinal ligado e devolvido a vazio."""
    with c.transaction():
        c.execute("SELECT set_config('app.desafio_gravando', 'on', true)")
        mid = c.execute(
            "INSERT INTO public.missoes (classe_id, origem, aprovacao, escopo, categoria, titulo, criterio,"
            " recompensa_tipo, perfil_alvo, desafio, conteudo_id, desafio_grupo, janela_inicio)"
            " VALUES (%s, 'ia', 'aprovada', 'aluno', 'secundaria', 'Desafio de lógica: C', %s, 'desafio_logica',"
            " %s, %s, %s, %s, now() - interval '1 day') RETURNING id",
            (TURMA, json.dumps(criterio or {"metrica": "desafio"}), perfil, json.dumps(DESAFIO), conteudo, grupo),
        ).fetchone()[0]
        c.execute(
            "INSERT INTO public.missao_desafio_gabarito (desafio_grupo, resposta) VALUES (%s, %s)"
            " ON CONFLICT (desafio_grupo) DO NOTHING",
            (grupo, json.dumps(GABARITO)),
        )
        c.execute("SELECT set_config('app.desafio_gravando', '', true)")
    return mid


def _tentativa(c, missao: int, aluno: uuid.UUID, grupo: uuid.UUID = GRUPO, acertou: bool = False) -> None:
    c.execute(
        "INSERT INTO public.missao_desafio_tentativa (missao_id, desafio_grupo, aluno_id, acertou)"
        " VALUES (%s, %s, %s, %s)",
        (missao, grupo, aluno, acertou),
    )


def _como(c, uid: uuid.UUID) -> None:
    t1._como_cliente(c, uid)


def _conta(c, uid: uuid.UUID, consulta: str, params: tuple = ()) -> int:
    with c.transaction():
        _como(c, uid)
        return c.execute(consulta, params).fetchone()[0]


def _linha(c, missao: int, colunas: str) -> tuple:
    return c.execute(f"SELECT {colunas} FROM public.missoes WHERE id = %s", (missao,)).fetchone()


# ------------------------------------------------------------------------------------------- RLS


def test_aluno_nao_le_gabarito() -> None:
    with _banco() as c:
        _semear(c)
        _desafio(c)
        assert c.execute("SELECT count(*) FROM public.missao_desafio_gabarito").fetchone()[0] == 1
        assert _conta(c, f5.A, "SELECT count(*) FROM public.missao_desafio_gabarito") == 0
        # Controle positivo: o professor dono lê.
        assert _conta(c, f5.PROF, "SELECT count(*) FROM public.missao_desafio_gabarito") == 1


def test_aluno_le_o_desafio_na_missao() -> None:
    """`missoes` tem SELECT por tabela (medido em produção em 17/11), e as colunas novas chegam ao aluno."""
    with _banco() as c:
        _semear(c)
        m = _desafio(c)
        with c.transaction():
            _como(c, f5.A)
            linha = c.execute(
                "SELECT desafio, conteudo_id, desafio_grupo FROM public.missoes WHERE id = %s", (m,)
            ).fetchone()
        assert linha == (DESAFIO, CONTEUDO, GRUPO)


def test_aluno_le_so_as_proprias_tentativas() -> None:
    with _banco() as c:
        _semear(c)
        m = _desafio(c)
        _tentativa(c, m, f5.A)
        _tentativa(c, m, f5.A, acertou=True)
        _tentativa(c, m, f5.B)
        with c.transaction():
            _como(c, f5.A)
            alunos = c.execute("SELECT DISTINCT aluno_id FROM public.missao_desafio_tentativa").fetchall()
        assert alunos == [(f5.A,)]
        assert _conta(c, f5.PROF, "SELECT count(*) FROM public.missao_desafio_tentativa") == 3


def test_aluno_nao_escreve_tentativa_nem_gabarito() -> None:
    with _banco() as c:
        _semear(c)
        m = _desafio(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                _como(c, f5.A)
                _tentativa(c, m, f5.A, acertou=True)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                _como(c, f5.A)
                c.execute(
                    "INSERT INTO public.missao_desafio_gabarito (desafio_grupo, resposta) VALUES (%s, '{}')",
                    (GRUPO_2,),
                )


def test_professor_de_outra_turma_nao_le() -> None:
    with _banco() as c:
        _semear(c)
        m = _desafio(c)
        _tentativa(c, m, f5.A)
        assert _conta(c, PROF_2, "SELECT count(*) FROM public.missao_desafio_gabarito") == 0
        assert _conta(c, PROF_2, "SELECT count(*) FROM public.missao_desafio_tentativa") == 0


def test_professor_nao_escreve_gabarito() -> None:
    with _banco() as c:
        _semear(c)
        _desafio(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                _como(c, f5.PROF)
                c.execute("UPDATE public.missao_desafio_gabarito SET resposta = '{}'")


# ------------------------------------------------------------------------------------------ guarda


def test_professor_nao_grava_desafio_direto() -> None:
    with _banco() as c:
        _semear(c)
        inserir = (
            "INSERT INTO public.missoes (classe_id, origem, escopo, titulo, criterio, recompensa_tipo,"
            " desafio, conteudo_id, desafio_grupo) VALUES (%s, 'professor', 'aluno', 'Desafio', %s,"
            " 'desafio_logica', %s, %s, %s)"
        )
        params = (TURMA, json.dumps({"metrica": "desafio"}), json.dumps(DESAFIO), CONTEUDO, GRUPO_2)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="missao_desafio_criar"):
            with c.transaction():
                _como(c, f5.PROF)
                c.execute(inserir, params)
        # Nem com o sinal: ele só vale dentro de função do dono (o PostgREST não expõe `set_config`).
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                _como(c, f5.PROF)
                c.execute("SELECT set_config('app.desafio_gravando', 'on', true)")
                c.execute(inserir, params)

        m = _desafio(c)
        antes = _linha(c, m, "desafio, criterio, conteudo_id, escopo, desafio_grupo, classe_id")
        with c.transaction():
            _como(c, f5.PROF)
            c.execute(
                "UPDATE public.missoes SET desafio = %s, criterio = %s, conteudo_id = %s, escopo = 'turma',"
                " desafio_grupo = %s, classe_id = %s WHERE id = %s",
                (
                    json.dumps({"tipo": "logica", "enunciado": "Outro", "formato": "curta"}),
                    json.dumps({"metrica": "atividades_concluidas", "minimo": 1}),
                    CONTEUDO_2,
                    GRUPO_2,
                    TURMA_2,
                    m,
                ),
            )
        assert _linha(c, m, "desafio, criterio, conteudo_id, escopo, desafio_grupo, classe_id") == antes


def test_professor_nao_poe_desafio_em_missao_comum() -> None:
    with _banco() as c:
        _semear(c)
        m = t1._missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        with c.transaction():
            _como(c, f5.PROF)
            c.execute(
                "UPDATE public.missoes SET desafio = %s, conteudo_id = %s, desafio_grupo = %s WHERE id = %s",
                (json.dumps(DESAFIO), CONTEUDO, GRUPO_2, m),
            )
        assert _linha(c, m, "desafio, conteudo_id, desafio_grupo") == (None, None, None)


def test_professor_muda_perfil_e_desativa() -> None:
    with _banco() as c:
        _semear(c)
        m = _desafio(c)
        with c.transaction():
            _como(c, f5.PROF)
            c.execute("UPDATE public.missoes SET perfil_alvo = 'achiever', ativa = false WHERE id = %s", (m,))
        assert _linha(c, m, "perfil_alvo, ativa, desafio") == ("achiever", False, DESAFIO)


def test_metrica_desafio_so_na_missao_com_desafio() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="desafio"):
            t1._missao(c, {"metrica": "desafio"}, "missao_concluida")
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="desafio"):
            _desafio(c, criterio={"metrica": "atividades_concluidas", "minimo": 1})


def test_forma_do_desafio() -> None:
    with _banco() as c:
        _semear(c)

        def grava(desafio: dict) -> None:
            with c.transaction():
                c.execute("SELECT set_config('app.desafio_gravando', 'on', true)")
                c.execute(
                    "INSERT INTO public.missoes (classe_id, origem, aprovacao, escopo, titulo, criterio,"
                    " recompensa_tipo, desafio, conteudo_id, desafio_grupo) VALUES (%s, 'ia', 'aprovada',"
                    " 'aluno', 'Desafio', '{\"metrica\": \"desafio\"}', 'desafio_cruzadinha', %s, %s, %s)",
                    (TURMA, json.dumps(desafio), CONTEUDO, uuid.uuid4()),
                )

        palavra = {"numero": 1, "direcao": "h", "linha": 0, "coluna": 0, "tamanho": 5, "pista": "p"}
        grava({"tipo": "cruzadinha", "linhas": 9, "colunas": 9, "palavras": [palavra] * 4})
        for ruim in (
            {"tipo": "cruzadinha", "linhas": 9, "colunas": 9, "palavras": [palavra] * 3},
            {"tipo": "cruzadinha", "linhas": 9, "colunas": 9, "palavras": [palavra] * 11},
            {"tipo": "cruzadinha", "linhas": 9, "colunas": 9, "palavras": "x"},
            {"tipo": "sudoku"},
            {"tipo": "logica", "enunciado": "  ", "formato": "curta"},
            {"tipo": "logica", "enunciado": "E?", "formato": "multipla"},
            {**DESAFIO, "aceitas": ["16"]},
            {"tipo": "cruzadinha", "linhas": 9, "colunas": 9, "palavras": [{**palavra, "palavra": "BANCO"}] * 4},
        ):
            with pytest.raises(psycopg.errors.CheckViolation):
                grava(ruim)


def test_colunas_do_desafio_so_existem_juntas() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute(
                "INSERT INTO public.missoes (classe_id, origem, escopo, titulo, criterio, recompensa_tipo, conteudo_id)"
                " VALUES (%s, 'professor', 'aluno', 'Missão', '{\"metrica\": \"eventos_totais\"}', 'missao_concluida', %s)",
                (TURMA, CONTEUDO),
            )


def test_recompensa_so_da_lista_de_premio() -> None:
    """Ruling da Tarefa 1: a recusa de `eventos_aluno` protege só `TIPOS_DE_PREMIO`. Missão que pagasse
    outro tipo pagaria um prêmio que o próprio aluno conseguiria gravar."""
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="prêmio de missão"):
            with c.transaction():
                _como(c, f5.PROF)
                t1._missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "conteudo_concluido")
        m = t1._missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "missao_concluida")
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="prêmio de missão"):
            with c.transaction():
                _como(c, f5.PROF)
                c.execute("UPDATE public.missoes SET recompensa_tipo = 'atividade_concluida' WHERE id = %s", (m,))
        for tipo in M_T1.TIPOS_DE_PREMIO:
            with c.transaction():
                _como(c, f5.PROF)
                c.execute("UPDATE public.missoes SET recompensa_tipo = %s WHERE id = %s", (tipo, m))
        # Missão antiga com tipo fora da lista: editar outra coisa não a derruba.
        c.execute("SET session_replication_role = replica")
        velha = t1._missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "conteudo_concluido")
        c.execute("SET session_replication_role = origin")
        with c.transaction():
            _como(c, f5.PROF)
            c.execute("UPDATE public.missoes SET titulo = 'Novo título' WHERE id = %s", (velha,))
        assert _linha(c, velha, "titulo") == ("Novo título",)


# --------------------------------------------------------------------------------------- avaliador


def test_avaliador_ignora_desafio() -> None:
    with _banco() as c:
        _semear(c)
        # O dublê do avaliador diz "cumpriu" sempre, e o perfil do aluno é o da missão.
        c.execute(
            "CREATE OR REPLACE FUNCTION public.fn_perfil_da_missao(p_aluno uuid)"
            " RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'mastermind'::text $$"
        )
        m = _desafio(c)
        # Defesa contra `criterio` editado por fora: o laço de item também ignora o desafio.
        c.execute("SET session_replication_role = replica")
        m_item = _desafio(
            c, grupo=GRUPO_2, criterio={"metrica": "item_no_dia", "item": "conteudo", "item_id": CONTEUDO, "dia": "2026-11-17"}
        )
        c.execute("SET session_replication_role = origin")
        t1._estudo_do_servidor(c)
        t1._cliente_insere(c, f5.A, "atividade_concluida", "atividade:1")
        c.execute(
            "INSERT INTO public.conteudo_aluno (aluno_id, conteudo_id, status) VALUES (%s, %s, 'concluido')",
            (f5.A, CONTEUDO),
        )
        assert c.execute(
            "SELECT count(*) FROM public.missao_aluno WHERE missao_id = ANY(%s)", ([m, m_item],)
        ).fetchone()[0] == 0
        assert t1._premios(c, m) == [] and t1._premios(c, m_item) == []


def test_controle_sem_a_migration_o_laco_conclui_o_desafio() -> None:
    """Sem `AND m.desafio IS NULL`, o laço fecharia a missão-desafio no primeiro evento de estudo."""
    with _banco() as c:
        _semear(c)
        c.execute(
            "CREATE OR REPLACE FUNCTION public.fn_perfil_da_missao(p_aluno uuid)"
            " RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'mastermind'::text $$"
        )
        m = _desafio(c)
        # Volta só o laço ao texto da 20261117_01, mantendo colunas e guarda.
        c.execute(M.gatilho(aplicar=False))
        t1._estudo_do_servidor(c)
        assert t1._premios(c, m) == [(f5.A, TURMA, 10)]


# ---------------------------------------------------------------------------------- apagar conteúdo


def test_apagar_conteudo_mantem_premio() -> None:
    """Foco da revisão 3: a missão e o gabarito vão com o conteúdo; o prêmio pago fica no razão."""
    with _banco() as c:
        _semear(c)
        m = _desafio(c)
        outro = _desafio(c, perfil="achiever")
        _tentativa(c, m, f5.A, acertou=True)
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia) VALUES (%s, %s, 'desafio_logica', %s)",
            (f5.A, TURMA, f"missao:{m}"),
        )
        assert t1._premios(c, m) == [(f5.A, TURMA, 10)]
        c.execute("DELETE FROM public.conteudos WHERE id = %s", (CONTEUDO,))
        assert c.execute("SELECT count(*) FROM public.missoes WHERE id = ANY(%s)", ([m, outro],)).fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM public.missao_desafio_gabarito").fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM public.missao_desafio_tentativa").fetchone()[0] == 0
        assert t1._premios(c, m) == [(f5.A, TURMA, 10)]


def test_gabarito_fica_enquanto_o_grupo_tem_linha() -> None:
    with _banco() as c:
        _semear(c)
        m = _desafio(c)
        outro = _desafio(c, perfil="achiever")
        with c.transaction():
            _como(c, f5.PROF)
            c.execute("DELETE FROM public.missoes WHERE id = %s", (m,))
        assert c.execute("SELECT count(*) FROM public.missao_desafio_gabarito").fetchone()[0] == 1
        with c.transaction():
            _como(c, f5.PROF)
            c.execute("DELETE FROM public.missoes WHERE id = %s", (outro,))
        assert c.execute("SELECT count(*) FROM public.missao_desafio_gabarito").fetchone()[0] == 0


def test_tentativa_tem_prazo_de_retencao() -> None:
    with _banco() as c:
        assert c.execute(
            "SELECT acao, coluna_aluno FROM public.retencao_politica WHERE tabela = 'missao_desafio_tentativa'"
        ).fetchall() == [("vida_da_conta", "aluno_id")]


# ------------------------------------------------------------------------------- upgrade e downgrade

FUNCOES = ("fn_missoes_guarda", "trg_eventos_aluno_after_iud", "trg_missao_item_concluido")


def _corpos(c) -> dict:
    return dict(
        c.execute(
            "SELECT proname, prosrc FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY(%s)",
            (list(FUNCOES),),
        ).fetchall()
    )


def test_upgrade_repete_sem_erro() -> None:
    with _banco() as c:
        antes = _corpos(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert _corpos(c) == antes


def test_downgrade_restaura() -> None:
    with _banco(com_migration=False) as c:
        antes = _corpos(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert all(_corpos(c)[f] != antes[f] for f in FUNCOES)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert _corpos(c) == antes
        assert c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'missoes'"
            " AND column_name IN ('desafio', 'conteudo_id', 'desafio_grupo')"
        ).fetchone()[0] == 0
        assert c.execute("SELECT to_regclass('public.missao_desafio_gabarito')").fetchone()[0] is None
        assert c.execute("SELECT count(*) FROM public.retencao_politica").fetchone()[0] == 0
        assert c.execute(
            "SELECT count(*) FROM public.eventos_pontuacao WHERE tipo LIKE 'desafio_%'"
        ).fetchone()[0] == 0
