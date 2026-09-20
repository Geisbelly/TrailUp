"""Guardas da `20260920_06` -- guilda contra guilda, e o farm de vitoria fechado.

O fluxo foi exercitado no banco em transacao revertida. O que fica aqui e o que
quebraria calado numa proxima edicao -- em especial a deducao de "cooperativo"
a partir do placar, que era o furo.
"""

import importlib.util
import re
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
VERSOES = API_ROOT / "alembic" / "versions"
MIGRACAO = "20260920_06_arena_guilda_contra_guilda.py"


def _carregar():
    spec = importlib.util.spec_from_file_location("migration_arena_pvp", VERSOES / MIGRACAO)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _stmts(direcao: str = "upgrade") -> list[str]:
    module = _carregar()
    executado: list[str] = []

    class FakeOp:
        def execute(self, sql):
            executado.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return executado


def _sql(direcao: str = "upgrade") -> str:
    return "\n".join(_stmts(direcao))


def _sem_comentarios(sql: str) -> str:
    return " ".join(linha.split("--", 1)[0] for linha in sql.splitlines())


def test_cadeia_de_revisao():
    module = _carregar()
    assert module.revision == "20260920_06"
    assert module.down_revision == "20260920_05"


def test_nenhum_literal_vira_bind_parameter():
    for direcao in ("upgrade", "downgrade"):
        suspeitos = re.findall(r"(?<![:\w\$]):([\w\$]+)", _sql(direcao))
        assert suspeitos == [], f"{direcao}: {suspeitos}"


def test_cooperativo_sai_da_identidade_e_nunca_do_placar():
    # ESTE era o furo. `arena_encerrar` deduzia "cooperativo" de
    # "integrantes da equipe 2 = 0", entao desafiar alguem que nunca aceitasse
    # caia no ramo cooperativo e pagava a vitoria. Medido antes da correcao:
    # 12 pontos por rodada, contra qualquer colega, sem a participacao dele.
    executavel = _sem_comentarios(_sql())
    assert (
        "v_cooperativo := (v_d.formato = 'guilda' AND v_d.guilda_rival_id IS NULL)"
        in executavel
    )
    # e o teste de placar nao pode voltar a decidir isso
    assert "IF v_n2 = 0 THEN" not in executavel


def test_disputa_sem_os_dois_lados_nao_paga_vitoria_nem_empate():
    executavel = _sem_comentarios(_sql())
    assert "ELSIF v_jog1 = 0 OR v_jog2 = 0 THEN" in executavel
    assert "v_resultado := 'sem_adversario'" in executavel
    # o CASE dos eventos so conhece empate e vitoria: `sem_adversario` cai no
    # ELSE e paga so a participacao.
    assert "WHEN v_resultado = 'empate' THEN ARRAY['desafio_empate']" in executavel
    assert "'sem_adversario' THEN ARRAY" not in executavel


def test_quem_jogou_sai_do_placar_cru_e_nao_do_filtro_de_modo():
    # Em `todos`, quem respondeu parcial nao pontua -- mas apareceu, e
    # "apareceu" e o que decide se houve adversario. Usar `fn_arena_equipes`
    # aqui faria uma rodada disputada virar `sem_adversario`.
    executavel = _sem_comentarios(_sql())
    trecho = executavel.split("INTO v_jog1, v_jog2")[0]
    assert "estado = 'aceito' AND respondidas > 0" in trecho
    assert "FROM public.fn_arena_placar(p_desafio_id)" in executavel


def test_o_placar_compara_aproveitamento_e_nao_acerto_bruto():
    # Pontuacao de equipe e SOMA: uma guilda de 5 bateria uma de 2 so por ser
    # maior. Medido: 4 acertos em 2 jogadores (50%) perde para 3 acertos em 1
    # jogador (75%). A multiplicacao cruzada mantem a conta no inteiro.
    executavel = _sem_comentarios(_sql())
    assert "ELSIF v_p1 * v_n2 > v_p2 * v_n1 THEN" in executavel
    assert "ELSIF v_p2 * v_n1 > v_p1 * v_n2 THEN" in executavel
    # e o desempate de velocidade usa tempo MEDIO, pela mesma razao
    assert "v_t1 * v_n2 <> v_t2 * v_n1" in executavel
    assert "v_t1 * v_n2 < v_t2 * v_n1" in executavel


def test_o_desempate_de_tempo_exige_ter_havido_acerto():
    # Premiar o mais rapido num placar de zero a zero e premiar quem chutou
    # mais depressa.
    executavel = _sem_comentarios(_sql())
    assert "v_d.modo = 'velocidade' AND v_p1 > 0 AND" in executavel


def test_rival_e_so_do_formato_guilda_e_nunca_a_propria_guilda():
    # Sem a segunda metade, um desafio da guilda contra ela mesma poria os
    # mesmos alunos nas duas equipes.
    # `_sem_comentarios` preserva a indentacao de cada linha, entao o CHECK
    # multilinha chega com espacos a mais -- normaliza antes de comparar.
    executavel = re.sub(r"\s+", " ", _sem_comentarios(_sql()))
    assert (
        "CHECK (guilda_rival_id IS NULL OR (formato = 'guilda' "
        "AND guilda_rival_id <> guilda_id))" in executavel
    )


def test_a_rival_precisa_estar_viva_na_mesma_turma_e_com_gente():
    executavel = _sem_comentarios(_sql())
    assert "g.id = p_guilda_rival AND g.ativa" in executavel
    assert "g.classe_id = p_classe_id" in executavel
    assert "arena_rival_sem_membros" in executavel


def test_dupla_e_solo_recusam_guilda_rival():
    # Sem isto, `p_guilda_rival` num duelo solo gravaria uma coluna que o CHECK
    # recusaria -- erro de constraint em vez de erro de dominio.
    executavel = _sem_comentarios(_sql())
    assert executavel.count("p_guilda_rival IS NOT NULL") >= 3


def test_cada_membro_da_rival_responde_por_si():
    # Nao ha papel de lider no dominio (`criado_por` e quem criou, nao quem
    # manda). Deixar uma pessoa comprometer a guilda inteira num desafio que
    # paga ponto seria inventar um governo que nao existe.
    executavel = _sem_comentarios(_sql())
    assert "SELECT v_id, m.aluno_id, 2, 'convidado'" in executavel
    assert "m.guilda_id = p_guilda_rival AND m.left_at IS NULL" in executavel


def test_a_rival_e_avisada_no_chat_dela():
    # Sem isto o unico sinal seria o convite individual, e guilda parada nunca
    # saberia que foi desafiada.
    executavel = _sem_comentarios(_sql())
    assert "Sua guilda foi desafiada!" in executavel
    assert "VALUES (p_guilda_rival, p_classe_id, v_me, 'desafio'," in executavel


def test_a_assinatura_antiga_de_sete_argumentos_e_derrubada():
    # Duas candidatas deixariam o PostgREST escolher, e a ambiguidade so
    # aparece em producao -- `guilda_criar` ja tem esse defeito.
    executavel = _sem_comentarios(_sql())
    assert (
        "DROP FUNCTION IF EXISTS public.arena_desafio_criar"
        "(bigint, text, text, integer, uuid, uuid, uuid[])" in executavel
    )


def test_as_funcoes_trocadas_saem_do_alcance_do_anon():
    sql = _sql()
    module = _carregar()
    for assinatura in module._FUNCOES:
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated" in sql
    assert "alcancavel por anon ou sem search_path" in _sem_comentarios(sql)


def test_toda_funcao_trocada_redeclara_o_search_path():
    # `CREATE OR REPLACE` nao preserva `SET search_path`.
    for statement in _stmts():
        if "CREATE OR REPLACE FUNCTION" not in statement:
            continue
        assert "SET search_path TO 'public', 'pg_temp'" in statement, statement[:120]


def test_o_downgrade_nao_apaga_ponto_de_quem_jogou():
    volta = _sem_comentarios(_sql("downgrade"))
    assert "DELETE FROM public.eventos_aluno" not in volta
    # desafio de guilda contra guilda nao cabe no esquema anterior e some junto
    assert "DELETE FROM public.guilda_desafios WHERE guilda_rival_id IS NOT NULL" in volta
