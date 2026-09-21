"""Guardas da `20260920_05` -- a arena por formato e a pontuacao no rank.

Como os outros testes de migracao deste repo, inspeciona o SQL gerado sem subir
Postgres. O fluxo em si foi exercitado no banco, em transacao revertida; o que
fica aqui e o que quebraria calado numa proxima edicao.
"""

import importlib.util
import re
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
VERSOES = API_ROOT / "alembic" / "versions"
MIGRACAO = "20260920_05_arena_guilda_dupla_solo.py"


def _carregar():
    caminho = VERSOES / MIGRACAO
    spec = importlib.util.spec_from_file_location("migration_arena", caminho)
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
    assert module.revision == "20260920_05"
    assert module.down_revision == "20260920_04"


def test_nenhum_literal_vira_bind_parameter():
    # `text()` do SQLAlchemy varre a string CRUA: `:desafio` dentro de literal
    # (ou de comentario) derruba a migracao com "A value is required for bind
    # parameter". Por isso a referencia do evento e montada por concatenacao.
    for direcao in ("upgrade", "downgrade"):
        suspeitos = re.findall(r"(?<![:\w\$]):([\w\$]+)", _sql(direcao))
        assert suspeitos == [], f"{direcao}: {suspeitos}"


def test_a_referencia_do_evento_comeca_pela_classe():
    # `fn_eventos_aluno_resolve_classe_id` so conhece topico/conteudo/atividade/
    # classe/conquista. Referencia que comecasse pelo desafio resolveria classe
    # NULL, e classe nula tira o evento do rank inteiro -- foi assim que a
    # presenca concedida nunca contou, ate a `20260911_05`.
    executavel = _sem_comentarios(_sql())
    assert "v_ref := 'classe' || ':' || v_d.classe_id::text" in executavel
    assert "|| ':' || 'desafio' || ':' || p_desafio_id::text" in executavel


def test_os_tipos_nao_comecam_com_prefixo_creditado():
    # `fn_evento_creditado` casa por PREFIXO (presenca*/participacao*/conquista*)
    # e devolve o valor que o CHAMADOR mandou. Um tipo `participacao_desafio`
    # deixaria o aluno escolher quanto vale a propria vitoria.
    module = _carregar()
    tipos = [linha[0] for linha in module._PONTUACAO]
    assert tipos == ["desafio_vencido", "desafio_empate", "desafio_participou"]
    for tipo in tipos:
        for prefixo in ("presenca", "participacao", "conquista"):
            assert not tipo.startswith(prefixo), tipo


def test_o_valor_do_evento_nao_vem_do_chamador():
    # O INSERT manda zero de proposito: quem decide e o gatilho, lendo
    # `fn_pontos_do_evento`.
    executavel = _sem_comentarios(_sql())
    assert "SELECT pl.aluno_id, t.tipo, v_ref, 0, now()," in executavel


def test_a_chave_de_idempotencia_e_derivada_e_nao_gerada():
    # Chave gerada na hora de reenviar duplica ponto -- e a mesma licao de
    # `eventos_aluno.idempotencia_key` (`20260911_02`). Derivada de
    # (desafio, tipo, aluno), a segunda entrega bate no indice unico.
    executavel = _sem_comentarios(_sql())
    assert "md5(p_desafio_id::text || t.tipo || pl.aluno_id::text)::uuid" in executavel
    assert "gen_random_uuid()" not in _sem_comentarios(
        [s for s in _stmts() if "eventos_aluno" in s][0]
    )


def test_o_encerramento_trava_a_linha_antes_de_pagar():
    executavel = _sem_comentarios(_sql())
    assert "WHERE id = p_desafio_id FOR UPDATE" in executavel
    # e sai sem pagar se ja estava encerrado
    assert "IF v_d.status = 'encerrado' THEN" in executavel


def test_resposta_repetida_nao_sobrescreve():
    # A RPC antiga fazia `DO UPDATE`, o que num desafio que paga ponto e tentar
    # ate acertar.
    executavel = _sem_comentarios(_sql())
    assert (
        "ON CONFLICT (desafio_id, questao_id, aluno_id) DO NOTHING" in executavel
    )
    assert "DO UPDATE SET resposta" not in executavel


def test_o_array_vazio_do_formato_guilda_nao_acusa_repetido():
    # `array_length` de array VAZIO devolve NULL, nao zero. Sem o COALESCE a
    # comparacao virava `NULL IS DISTINCT FROM 0` e o formato guilda -- que nao
    # convoca ninguem -- morria com `arena_participante_repetido`. Medido: a
    # primeira versao quebrou exatamente assim.
    executavel = _sem_comentarios(_sql())
    assert "COALESCE(array_length(v_convocados, 1), 0)" in executavel


def test_o_pool_exige_questao_liberada_para_todos():
    # Sortear pelo que o CRIADOR abriu daria ao adversario questao que a trilha
    # dele nao liberou.
    executavel = _sem_comentarios(_sql())
    assert "NOT public.fn_questao_liberada_para(dp.aluno_id, q.id)" in executavel
    # e o sorteio vem ANTES do corte: a RPC antiga cortava em 30 e so entao
    # embaralhava, ou seja, embaralhava sempre as mesmas 30.
    assert re.search(r"ORDER BY random\(\)\s+LIMIT v_qtd", executavel)


def test_fn_questao_liberada_delega_em_vez_de_copiar():
    executavel = _sem_comentarios(_sql())
    assert (
        "SELECT public.fn_questao_liberada_para(auth.uid(), p_questao_id);"
        in executavel
    )


def test_o_gabarito_so_sai_depois_de_responder():
    executavel = _sem_comentarios(_sql())
    assert "CASE WHEN r.questao_id IS NULL THEN NULL" in executavel
    assert "ELSE q.resposta_correta END" in executavel


def test_formato_e_modo_sao_colunas_diferentes():
    module = _carregar()
    assert module._FORMATOS == ("guilda", "dupla", "solo")
    assert module._MODOS == ("todos", "velocidade", "precisao")
    # duelo/duplo saem do CHECK de modo: viraram formato
    executavel = _sem_comentarios(_sql())
    check = re.search(
        r"guilda_desafios_modo_check\s+CHECK \(modo IN \(([^)]*)\)\)", executavel
    )
    assert check is not None
    assert "duelo" not in check.group(1)
    assert "duplo" not in check.group(1)


def test_o_upgrade_confere_antes_de_estreitar_o_check():
    # CHECK que nao valida derruba a migracao no meio. A guarda mede primeiro.
    executavel = _sem_comentarios(_sql())
    assert "modo que sai do CHECK" in executavel


def test_guilda_id_e_rotulo_amarrado_ao_formato():
    executavel = _sem_comentarios(_sql())
    assert "ALTER COLUMN guilda_id DROP NOT NULL" in executavel
    assert "CHECK ((formato = 'guilda') = (guilda_id IS NOT NULL))" in executavel


def test_toda_funcao_nova_sai_do_alcance_do_anon():
    # Funcao nova NASCE executavel por PUBLIC no Supabase -- e a divida que
    # chegou a 74 em `20260920_04`.
    sql = _sql()
    module = _carregar()
    for assinatura in module._FUNCOES:
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated" in sql
    assert "alcancavel por anon ou sem search_path" in _sem_comentarios(sql)


def test_toda_funcao_nova_nasce_com_search_path_fixo():
    for statement in _stmts():
        if "CREATE OR REPLACE FUNCTION" not in statement:
            continue
        assert "SET search_path TO 'public', 'pg_temp'" in statement, statement[:120]


def test_o_downgrade_nao_apaga_ponto_de_quem_jogou():
    # Apagar linha de `eventos_aluno` tiraria ponto de aluno que jogou -- o
    # mesmo dano que a classe deduzida na leitura causava (`20260910_06`).
    volta = _sem_comentarios(_sql("downgrade"))
    assert "DELETE FROM public.eventos_aluno" not in volta
    # e o preco so volta atras se ninguem tiver pontuado por ele
    assert "NOT EXISTS (SELECT 1 FROM public.eventos_aluno e" in volta


def test_o_downgrade_devolve_fn_questao_liberada_inteira():
    # Ela e anterior a esta migracao e tem chamador vivo
    # (`guilda_chat_questao_responder`): derrubar sem restaurar quebraria o
    # chat de guilda.
    volta = _sem_comentarios(_sql("downgrade"))
    assert "CREATE OR REPLACE FUNCTION public.fn_questao_liberada(p_questao_id bigint)" in volta
    assert "fn_questao_liberada_para" not in volta.split("CREATE OR REPLACE FUNCTION public.fn_questao_liberada(p_questao_id bigint)")[1]
