"""`20261117_03`: `missao_desafio_criar` grava o desafio por perfil numa transação.

Banco local montado como o e2e da `20261117_02` (`test_e2e_desafio_na_missao`): o caminho real do
prêmio (`test_e2e_premio_de_missao_na_turma._cadeia()`), a `20261117_01`, a guarda de `missoes` da
`20261103_06` com o gatilho, as policies de `missoes`, a `20261117_02` e, por cima, a migration daqui.

O professor chama a RPC como `authenticated`, com as claims dele, como o PostgREST faria. É assim que
se vê a guarda deixar passar a escrita: dentro da função `SECURITY DEFINER`, `current_user` é o dono.
Dados sintéticos.
"""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_desafio_na_missao as t2
from tests import test_e2e_premio_de_missao_na_turma as t1

e2e = f5.e2e

M = f5.modulo("20261117_03_missao_desafio_criar.py")
M_T2 = f5.modulo("20261117_02_desafio_na_missao.py")
M_T1 = f5.modulo("20261117_01_premio_de_missao_na_turma.py")
M_IA = f5.modulo("20261102_20_missoes_sugeridas_pela_ia.py")

TURMA = f5.TURMA
CONTEUDO = t2.CONTEUDO
PROF_2 = t2.PROF_2

LOGICA = {"tipo": "logica", "enunciado": "Qual é o próximo número? 2, 4, 8", "formato": "curta"}
LOGICA_RESPOSTA = {"aceitas": ["16", " dezesseis "]}
MULTIPLA = {
    "tipo": "logica",
    "enunciado": "Qual estrutura guarda pares chave e valor?",
    "formato": "multipla",
    "alternativas": ["Lista", "Dicionário", "Tupla", "Conjunto"],
}

# Grade 4 x 5, contando de 0:
#   B A N C O
#   O . A . R
#   L . D . A
#   A L A . .
GRADE = [
    {"numero": 1, "direcao": "h", "linha": 0, "coluna": 0, "tamanho": 5, "pista": "Guarda os dados"},
    {"numero": 1, "direcao": "v", "linha": 0, "coluna": 0, "tamanho": 4, "pista": "Rola no campo"},
    {"numero": 2, "direcao": "v", "linha": 0, "coluna": 2, "tamanho": 4, "pista": "Coisa nenhuma"},
    {"numero": 3, "direcao": "v", "linha": 0, "coluna": 4, "tamanho": 3, "pista": "Reza"},
    {"numero": 4, "direcao": "h", "linha": 3, "coluna": 0, "tamanho": 3, "pista": "Parte do prédio"},
]
CRUZADINHA = {"tipo": "cruzadinha", "linhas": 4, "colunas": 5, "palavras": GRADE}
PALAVRAS = {"1h": "BANCO", "1v": "BOLA", "2v": "NADA", "3v": "ORA", "4h": "ALA"}
CRUZADINHA_RESPOSTA = {"palavras": PALAVRAS}


def _banco(com_migration: bool = True):
    return f5.banco(
        *t1._cadeia(),
        *f5.sql_de(M_T1),
        t2.METRICAS,
        t2.TABELA_RETENCAO,
        M_T2.M06.guarda(),
        t2.GATILHO_GUARDA,
        *t2._policies_de_missoes(),
        M_IA.LOG,  # tabela, função e gatilho do log das missões da IA (#151)
        *f5.sql_de(M_T2),
        *(f5.sql_de(M) if com_migration else []),
    )


def _semear(c) -> None:
    t2._semear(c)
    c.execute("UPDATE public.conteudos SET titulo = 'Estruturas de dados' WHERE id = %s", (CONTEUDO,))


def _criar(c, quem: uuid.UUID, desafio: dict, resposta: dict, perfis, conteudo: int = CONTEUDO) -> list[tuple]:
    """A chamada do console: `authenticated`, com as claims de quem chama."""
    with c.transaction():
        t1._como_cliente(c, quem)
        return c.execute(
            "SELECT missao_id, perfil_alvo, desafio_grupo FROM public.missao_desafio_criar(%s, %s, %s, %s::text[])",
            (conteudo, json.dumps(desafio), json.dumps(resposta), perfis),
        ).fetchall()


def _conta_desafios(c) -> tuple[int, int]:
    return (
        c.execute("SELECT count(*) FROM public.missoes WHERE desafio IS NOT NULL").fetchone()[0],
        c.execute("SELECT count(*) FROM public.missao_desafio_gabarito").fetchone()[0],
    )


def _recusa(c, desafio: dict, resposta: dict, perfis=("mastermind",), match: str | None = None) -> None:
    with pytest.raises(psycopg.errors.InvalidParameterValue, match=match):
        _criar(c, f5.PROF, desafio, resposta, list(perfis))
    assert _conta_desafios(c) == (0, 0)


def test_cadeia() -> None:
    assert (M.revision, M.down_revision) == ("20261117_03", "20261117_02")


# ------------------------------------------------------------------------------------------ criar


@e2e
def test_cria_uma_por_perfil() -> None:
    with _banco() as c:
        _semear(c)
        linhas = _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        assert sorted(p for _, p, _ in linhas) == ["achiever", "mastermind"]
        grupos = {g for _, _, g in linhas}
        assert len(grupos) == 1 and None not in grupos
        (grupo,) = grupos
        missoes = c.execute(
            "SELECT classe_id, origem, aprovacao, escopo, categoria, criterio, recompensa_tipo, ativa, desafio,"
            " conteudo_id, criado_por FROM public.missoes WHERE desafio_grupo = %s ORDER BY id",
            (grupo,),
        ).fetchall()
        assert len(missoes) == 2
        for m in missoes:
            assert m == (
                TURMA, "ia", "aprovada", "aluno", "secundaria", {"metrica": "desafio"}, "desafio_logica", True,
                LOGICA, CONTEUDO, f5.PROF,
            )
        assert c.execute(
            "SELECT resposta FROM public.missao_desafio_gabarito WHERE desafio_grupo = %s", (grupo,)
        ).fetchall() == [({"aceitas": ["16", "dezesseis"]},)]
        assert _conta_desafios(c) == (2, 1)
        # O sinal voltou a vazio: nada mais na transação do professor escreve desafio.
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            c.execute(
                "SELECT * FROM public.missao_desafio_criar(%s, %s, %s, %s::text[])",
                (CONTEUDO, json.dumps(CRUZADINHA), json.dumps(CRUZADINHA_RESPOSTA), ["seeker"]),
            )
            assert c.execute("SELECT current_setting('app.desafio_gravando', true)").fetchone()[0] == ""
        assert c.execute(
            "SELECT recompensa_tipo FROM public.missoes WHERE perfil_alvo = 'seeker'"
        ).fetchall() == [("desafio_cruzadinha",)]


@e2e
def test_cruzadinha_guarda_a_grade_sem_resposta() -> None:
    with _banco() as c:
        _semear(c)
        desafio = {**CRUZADINHA, "solucao": "BANCO"}  # chave estranha: não vai para o que o aluno lê
        ((mid, _, grupo),) = _criar(c, f5.PROF, desafio, CRUZADINHA_RESPOSTA, ["seeker"])
        publico = c.execute("SELECT desafio FROM public.missoes WHERE id = %s", (mid,)).fetchone()[0]
        assert publico == CRUZADINHA
        for palavra in PALAVRAS.values():
            assert palavra not in json.dumps(publico)
        assert c.execute(
            "SELECT resposta FROM public.missao_desafio_gabarito WHERE desafio_grupo = %s", (grupo,)
        ).fetchone()[0] == CRUZADINHA_RESPOSTA
        # O aluno não lê o gabarito.
        assert t2._conta(c, f5.A, "SELECT count(*) FROM public.missao_desafio_gabarito") == 0


@e2e
def test_cruzadinha_com_acento_e_espaco() -> None:
    """Foco da revisão 4: a grade é sem acento e sem espaço; a resposta com acento vale."""
    with _banco() as c:
        _semear(c)
        palavras = {**PALAVRAS, "1h": " bânco ", "4h": "A-LA"}
        ((_, _, grupo),) = _criar(c, f5.PROF, CRUZADINHA, {"palavras": palavras}, ["seeker"])
        assert c.execute(
            "SELECT resposta -> 'palavras' ->> '1h' FROM public.missao_desafio_gabarito WHERE desafio_grupo = %s",
            (grupo,),
        ).fetchone()[0] == "bânco"
        assert c.execute("SELECT public.fn_missao_desafio_letras('Coração de mãe')").fetchone()[0] == "CORACAODEMAE"


@e2e
def test_logica_multipla_guarda_a_alternativa() -> None:
    with _banco() as c:
        _semear(c)
        ((mid, _, grupo),) = _criar(c, f5.PROF, MULTIPLA, {"aceitas": ["  dicionário "]}, ["mastermind"])
        assert c.execute("SELECT desafio FROM public.missoes WHERE id = %s", (mid,)).fetchone()[0] == MULTIPLA
        assert c.execute(
            "SELECT resposta FROM public.missao_desafio_gabarito WHERE desafio_grupo = %s", (grupo,)
        ).fetchone()[0] == {"aceitas": ["Dicionário"]}


@e2e
def test_normalizar() -> None:
    with _banco() as c:
        assert c.execute(
            "SELECT public.fn_missao_desafio_normalizar(%s)", ("  DICIONÁRIO   de\tDados  Ção ",)
        ).fetchone()[0] == "dicionario de dados cao"
        assert c.execute("SELECT public.fn_missao_desafio_normalizar(NULL)").fetchone()[0] is None


@e2e
def test_multipla_aceita_sem_acento() -> None:
    with _banco() as c:
        _semear(c)
        ((_, _, grupo),) = _criar(c, f5.PROF, MULTIPLA, {"aceitas": ["DICIONARIO", "dicionário"]}, ["mastermind"])
        assert c.execute(
            "SELECT resposta FROM public.missao_desafio_gabarito WHERE desafio_grupo = %s", (grupo,)
        ).fetchone()[0] == {"aceitas": ["Dicionário"]}


@e2e
def test_curta_deduplica_sem_acento() -> None:
    with _banco() as c:
        _semear(c)
        ((_, _, grupo),) = _criar(c, f5.PROF, LOGICA, {"aceitas": ["Coração", "coracao", " CORAÇÃO "]}, ["mastermind"])
        assert c.execute(
            "SELECT resposta FROM public.missao_desafio_gabarito WHERE desafio_grupo = %s", (grupo,)
        ).fetchone()[0] == {"aceitas": ["Coração"]}


@e2e
def test_alternativas_iguais_sem_acento_recusadas() -> None:
    with _banco() as c:
        _semear(c)
        _recusa(
            c, {**MULTIPLA, "alternativas": ["Dicionário", "Dicionario", "Lista"]}, {"aceitas": ["Lista"]},
            match="alternativas diferentes",
        )


@e2e
def test_titulo_e_descricao() -> None:
    with _banco() as c:
        _semear(c)
        ((m1, _, _),) = _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind"])
        ((m2, _, _),) = _criar(c, f5.PROF, CRUZADINHA, CRUZADINHA_RESPOSTA, ["seeker"])
        assert c.execute("SELECT titulo FROM public.missoes WHERE id = %s", (m1,)).fetchone()[0] == (
            "Desafio de lógica: Estruturas de dados"
        )
        t, d = c.execute("SELECT titulo, descricao FROM public.missoes WHERE id = %s", (m2,)).fetchone()
        assert t == "Cruzadinha: Estruturas de dados"
        assert "5 palavras" in d and 0 < len(d) <= 500
        # Título do conteúdo comprido: corta em 120.
        c.execute("UPDATE public.conteudos SET titulo = %s WHERE id = %s", ("x" * 300, CONTEUDO))
        ((m3, _, _),) = _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["achiever"])
        titulo = c.execute("SELECT titulo FROM public.missoes WHERE id = %s", (m3,)).fetchone()[0]
        assert len(titulo) == 120 and titulo.startswith("Desafio de lógica: xxx")


@e2e
def test_perfis_repetidos_viram_um() -> None:
    with _banco() as c:
        _semear(c)
        linhas = _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["Mastermind", "mastermind ", "achiever"])
        assert sorted(p for _, p, _ in linhas) == ["achiever", "mastermind"]


# ----------------------------------------------------------------------------------------- recusas


@e2e
def test_professor_de_outra_turma_recusado() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _criar(c, PROF_2, LOGICA, LOGICA_RESPOSTA, ["mastermind"])
        # Nem conteúdo inexistente, nem aluno.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind"], conteudo=999_999)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _criar(c, f5.A, LOGICA, LOGICA_RESPOSTA, ["mastermind"])
        assert _conta_desafios(c) == (0, 0)


@e2e
def test_anon_nao_executa() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                c.execute("SET LOCAL ROLE anon")
                c.execute(
                    "SELECT * FROM public.missao_desafio_criar(%s, %s, %s, %s::text[])",
                    (CONTEUDO, json.dumps(LOGICA), json.dumps(LOGICA_RESPOSTA), ["mastermind"]),
                )


@e2e
def test_grade_inconsistente_recusada() -> None:
    with _banco() as c:
        _semear(c)
        # 4h termina em (3, 2), onde 2v põe "A".
        _recusa(c, CRUZADINHA, {"palavras": {**PALAVRAS, "4h": "ALE"}}, match="linha 4, coluna 3")


@e2e
def test_palavra_fora_da_grade_recusada() -> None:
    with _banco() as c:
        _semear(c)
        grade = [*GRADE[:4], {**GRADE[4], "linha": 4}]
        _recusa(c, {**CRUZADINHA, "palavras": grade}, CRUZADINHA_RESPOSTA, match="sai da grade")
        _recusa(c, {**CRUZADINHA, "colunas": 4}, CRUZADINHA_RESPOSTA, match="sai da grade")


@e2e
def test_comprimento_diferente_do_tamanho_recusado() -> None:
    with _banco() as c:
        _semear(c)
        _recusa(c, CRUZADINHA, {"palavras": {**PALAVRAS, "3v": "OR"}}, match="2 letras")


@e2e
def test_resposta_tem_de_casar_com_as_palavras() -> None:
    with _banco() as c:
        _semear(c)
        sem_uma = {k: v for k, v in PALAVRAS.items() if k != "3v"}
        _recusa(c, CRUZADINHA, {"palavras": sem_uma}, match="3v")
        _recusa(c, CRUZADINHA, {"palavras": {**PALAVRAS, "9h": "EXTRA"}}, match="9h")
        _recusa(c, CRUZADINHA, {"aceitas": ["BANCO"]})


@e2e
def test_cruzadinha_com_3_palavras_recusada() -> None:
    with _banco() as c:
        _semear(c)
        _recusa(c, {**CRUZADINHA, "palavras": GRADE[:3]}, CRUZADINHA_RESPOSTA, match="4 a 10")


@e2e
def test_cruzadinha_com_11_palavras_recusada() -> None:
    with _banco() as c:
        _semear(c)
        grade = [{**GRADE[0], "numero": n, "linha": 0} for n in range(1, 12)]
        _recusa(c, {**CRUZADINHA, "palavras": grade}, CRUZADINHA_RESPOSTA, match="4 a 10")


@e2e
def test_palavra_repetida_recusada() -> None:
    with _banco() as c:
        _semear(c)
        _recusa(c, {**CRUZADINHA, "palavras": [*GRADE, GRADE[0]]}, CRUZADINHA_RESPOSTA, match="duas vezes")


@e2e
def test_logica_multipla_resposta_fora_das_alternativas_recusada() -> None:
    with _banco() as c:
        _semear(c)
        _recusa(c, MULTIPLA, {"aceitas": ["Árvore"]}, match="alternativas")
        _recusa(c, {**MULTIPLA, "alternativas": ["Só uma"]}, {"aceitas": ["Só uma"]})


@e2e
def test_logica_mal_formada_recusada() -> None:
    with _banco() as c:
        _semear(c)
        _recusa(c, {**LOGICA, "enunciado": "   "}, LOGICA_RESPOSTA, match="enunciado")
        _recusa(c, {**LOGICA, "formato": "aberta"}, LOGICA_RESPOSTA, match="formato")
        _recusa(c, LOGICA, {"aceitas": []})
        _recusa(c, LOGICA, {"aceitas": [" "]})
        _recusa(c, LOGICA, {"resposta": "16"})
        _recusa(c, {"tipo": "sudoku"}, LOGICA_RESPOSTA, match="Tipo de desafio")


@e2e
def test_perfil_invalido_recusado() -> None:
    with _banco() as c:
        _semear(c)
        _recusa(c, LOGICA, LOGICA_RESPOSTA, perfis=("mastermind", "gamer"), match="gamer")


@e2e
def test_sem_perfis_recusado() -> None:
    with _banco() as c:
        _semear(c)
        _recusa(c, LOGICA, LOGICA_RESPOSTA, perfis=(), match="perfil")
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="perfil"):
            _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, None)


@e2e
def test_falha_no_meio_nao_grava_nada_e_desliga_o_sinal() -> None:
    """O EXCEPTION da RPC devolve o sinal a vazio; a transação do professor segue sem ele."""
    with _banco() as c:
        _semear(c)
        c.execute(
            "CREATE FUNCTION public.t_falha() RETURNS trigger LANGUAGE plpgsql AS"
            " $$ BEGIN RAISE EXCEPTION 'falha de teste'; END $$;"
            " CREATE TRIGGER t_falha BEFORE INSERT ON public.missao_desafio_gabarito"
            " FOR EACH ROW EXECUTE FUNCTION public.t_falha();"
        )
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            with pytest.raises(psycopg.errors.RaiseException, match="falha de teste"):
                with c.transaction():
                    c.execute(
                        "SELECT * FROM public.missao_desafio_criar(%s, %s, %s, %s::text[])",
                        (CONTEUDO, json.dumps(LOGICA), json.dumps(LOGICA_RESPOSTA), ["mastermind"]),
                    )
            assert c.execute("SELECT current_setting('app.desafio_gravando', true)").fetchone()[0] in ("", None)
        assert _conta_desafios(c) == (0, 0)


# ------------------------------------------------------------------- carried da revisão da Tarefa 2


@e2e
def test_recompensa_presa_ao_desafio() -> None:
    with _banco() as c:
        _semear(c)
        # Missão comum não paga prêmio de desafio.
        with pytest.raises(psycopg.errors.CheckViolation):
            t1._missao(c, {"metrica": "atividades_concluidas", "minimo": 1}, "desafio_logica")
        # Desafio de lógica não paga como cruzadinha.
        with pytest.raises(psycopg.errors.CheckViolation):
            with c.transaction():
                c.execute("SELECT set_config('app.desafio_gravando', 'on', true)")
                c.execute(
                    "INSERT INTO public.missoes (classe_id, origem, aprovacao, escopo, titulo, criterio,"
                    " recompensa_tipo, perfil_alvo, desafio, conteudo_id, desafio_grupo) VALUES (%s, 'ia',"
                    " 'aprovada', 'aluno', 'Desafio', '{\"metrica\": \"desafio\"}', 'desafio_cruzadinha',"
                    " 'mastermind', %s, %s, %s)",
                    (TURMA, json.dumps(LOGICA), CONTEUDO, uuid.uuid4()),
                )


@e2e
def test_professor_nao_troca_a_recompensa_do_desafio() -> None:
    with _banco() as c:
        _semear(c)
        ((mid, _, _),) = _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind"])
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            c.execute(
                "UPDATE public.missoes SET recompensa_tipo = 'missao_concluida', titulo = 'Outro título' WHERE id = %s",
                (mid,),
            )
        assert t2._linha(c, mid, "recompensa_tipo, titulo") == ("desafio_logica", "Outro título")


@e2e
def test_perfil_unico_no_grupo() -> None:
    with _banco() as c:
        _semear(c)
        linhas = _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        por_perfil = {p: m for m, p, _ in linhas}
        # O professor muda o perfil de uma linha para o da outra: seriam dois "mastermind" no grupo.
        with pytest.raises(psycopg.errors.UniqueViolation):
            with c.transaction():
                t1._como_cliente(c, f5.PROF)
                c.execute(
                    "UPDATE public.missoes SET perfil_alvo = 'mastermind' WHERE id = %s", (por_perfil["achiever"],)
                )
        # Para um perfil que o grupo não tem, pode.
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            c.execute("UPDATE public.missoes SET perfil_alvo = 'seeker' WHERE id = %s", (por_perfil["achiever"],))
        assert t2._linha(c, por_perfil["achiever"], "perfil_alvo") == ("seeker",)


@e2e
def test_desafio_exige_perfil() -> None:
    with _banco() as c:
        _semear(c)
        ((mid, _, _),) = _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind"])
        with pytest.raises(psycopg.errors.CheckViolation, match="missoes_desafio_tem_perfil"):
            with c.transaction():
                t1._como_cliente(c, f5.PROF)
                c.execute("UPDATE public.missoes SET perfil_alvo = NULL WHERE id = %s", (mid,))
        assert t2._linha(c, mid, "perfil_alvo") == ("mastermind",)


@e2e
def test_desafio_fora_do_log_da_ia() -> None:
    with _banco() as c:
        _semear(c)
        linhas = _criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"])
        assert c.execute(
            "SELECT count(*) FROM public.missoes_ia_log WHERE missao_id = ANY(%s)", ([m for m, _, _ in linhas],)
        ).fetchone()[0] == 0
        # Controle: a missão da IA comum continua no log.
        comum = c.execute(
            "INSERT INTO public.missoes (classe_id, origem, aprovacao, escopo, titulo, criterio, recompensa_tipo)"
            " VALUES (%s, 'ia', 'pendente', 'turma', 'Missão da IA', '{\"metrica\": \"eventos_totais\", \"minimo\": 3}',"
            " 'missao_concluida') RETURNING id",
            (TURMA,),
        ).fetchone()[0]
        assert c.execute(
            "SELECT evento FROM public.missoes_ia_log WHERE missao_id = %s", (comum,)
        ).fetchall() == [("proposta",)]
        c.execute("UPDATE public.missoes SET aprovacao = 'aprovada' WHERE id = %s", (comum,))
        assert c.execute(
            "SELECT count(*) FROM public.missoes_ia_log WHERE missao_id = %s AND evento = 'aprovada'", (comum,)
        ).fetchone()[0] == 1


@e2e
def test_tentativa_exige_missao() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.NotNullViolation):
            c.execute(
                "INSERT INTO public.missao_desafio_tentativa (missao_id, desafio_grupo, aluno_id, acertou)"
                " VALUES (NULL, %s, %s, false)",
                (uuid.uuid4(), f5.A),
            )


# ------------------------------------------------------------------------------- upgrade e downgrade


def _estado(c) -> dict:
    return {
        "guarda": c.execute(
            "SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_missoes_guarda()'::regprocedure"
        ).fetchone()[0],
        "funcoes": c.execute(
            "SELECT array_agg(proname ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace"
            " AND proname IN ('missao_desafio_criar', 'fn_missao_desafio_letras', 'fn_missao_desafio_inteiro',"
            " 'fn_missao_desafio_normalizar')"
        ).fetchone()[0],
        "constraints": c.execute(
            "SELECT array_agg(conname ORDER BY conname) FROM pg_constraint WHERE conrelid = 'public.missoes'::regclass"
        ).fetchone()[0],
        "indices": c.execute(
            "SELECT array_agg(indexname ORDER BY indexname) FROM pg_indexes WHERE schemaname = 'public'"
            " AND tablename IN ('missoes', 'missao_desafio_tentativa')"
        ).fetchone()[0],
        "gatilho_log": c.execute(
            "SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_missoes_ia_log'"
        ).fetchone()[0],
        "nulo": c.execute(
            "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'missao_desafio_tentativa'"
            " AND column_name = 'missao_id'"
        ).fetchone()[0],
    }


@e2e
def test_upgrade_repete_sem_erro() -> None:
    with _banco() as c:
        antes = _estado(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert _estado(c) == antes


@e2e
def test_downgrade_restaura() -> None:
    with _banco(com_migration=False) as c:
        antes = _estado(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        depois = _estado(c)
        assert depois["guarda"] != antes["guarda"] and depois["nulo"] == "NO"
        assert depois["funcoes"] == [
            "fn_missao_desafio_inteiro", "fn_missao_desafio_letras", "fn_missao_desafio_normalizar", "missao_desafio_criar",
        ]
        assert "WHEN ((new.desafio IS NULL))" in depois["gatilho_log"]
        assert "WHEN" not in antes["gatilho_log"]
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert _estado(c) == antes
