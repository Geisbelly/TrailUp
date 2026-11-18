"""`20261117_04`: `missao_desafio_responder` corrige, limita e paga uma vez por desafio (estrutura).

O comportamento é medido no e2e (`test_e2e_missao_desafio_responder.py`, banco local). Aqui fica o que tem
de valer mesmo sem banco: a cadeia, a assinatura, os GRANTs, a ordem trava → limite → comparação, o
sinal do prêmio, o reaproveitamento das regras que já existem e o downgrade.
"""

from __future__ import annotations

import importlib.util
import re
import types
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
ARQUIVO = "20261117_04_missao_desafio_responder.py"


def _mod():
    spec = importlib.util.spec_from_file_location("m_responder_20261117_04", VERSOES / ARQUIVO)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _comandos(fn: str = "upgrade") -> list[str]:
    mod = _mod()
    coletados: list[str] = []
    mod.op = types.SimpleNamespace(execute=lambda sql: coletados.append(str(sql)))
    getattr(mod, fn)()
    return coletados


def _sql(fn: str = "upgrade") -> str:
    return "\n".join(_comandos(fn))


def _compacto(sql: str) -> str:
    return re.sub(r"\s+", " ", sql)


def _rpc() -> str:
    return _mod().RPC


def test_cadeia() -> None:
    mod = _mod()
    assert (mod.revision, mod.down_revision) == ("20261117_04", "20261117_03")


def test_assinatura_definer_e_grant() -> None:
    sql = _compacto(_sql())
    assert "CREATE OR REPLACE FUNCTION public.missao_desafio_responder(p_missao_id bigint, p_resposta jsonb)" in sql
    assert "RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp" in sql
    assert "REVOKE ALL ON FUNCTION public.missao_desafio_responder(bigint, jsonb) FROM PUBLIC, anon;" in sql
    assert "GRANT EXECUTE ON FUNCTION public.missao_desafio_responder(bigint, jsonb) TO authenticated;" in sql


def test_acesso_reaproveita_as_regras_que_existem() -> None:
    """Turma pelo helper do aluno; perfil pela regra única do vetor (`20261111_01`), sem reescrevê-la."""
    rpc = _compacto(_rpc())
    assert "m.classe_id IN (SELECT public.app_classes_do_aluno())" in rpc
    # A própria linha chamada tem o perfil do aluno (não basta uma linha irmã).
    assert "AND lower(btrim(m.perfil_alvo)) = ANY (public.app_perfis_representativos(v_aluno));" in rpc
    assert "public.missoes g" not in rpc.split("v_ja_concluida")[0]
    # A regra do vetor não é repetida aqui.
    assert "afinidade" not in rpc and "aluno_perfil" not in rpc
    assert "m.aprovacao IN ('nao_requer', 'aprovada')" in rpc
    assert "ERRCODE = '42501'" in rpc


def test_ordem_acesso_trava_limite_comparacao() -> None:
    rpc = _rpc()
    acesso = rpc.index("public.app_classes_do_aluno()")
    retida = rpc.index("IF public.estudo_personalizacao_retida(v_missao.classe_id) THEN")
    publicado = rpc.index("RAISE EXCEPTION 'topico_nao_publicado' USING ERRCODE = '42501';")
    trava = rpc.index("pg_advisory_xact_lock(hashtextextended(v_aluno::text || v_grupo::text, 0))")
    limite = rpc.index("RAISE EXCEPTION 'limite_de_tentativas'")
    ja = rpc.index("v_ja_concluida := EXISTS")
    tentativa = rpc.index("INSERT INTO public.missao_desafio_tentativa")
    conclui = rpc.index("INSERT INTO public.missao_aluno")
    premio = rpc.index("INSERT INTO public.eventos_aluno")
    assert acesso < retida < publicado < trava < limite < ja < tentativa < conclui < premio
    assert "interval '1 hour'" in rpc
    assert f">= {_mod().LIMITE_POR_HORA}" in rpc and _mod().LIMITE_POR_HORA == 20
    assert "ERRCODE = 'P0001'" in _compacto(rpc[limite : limite + 300])


def test_conclusao_e_premio() -> None:
    rpc = _rpc()
    c = _compacto(rpc)
    assert (
        "ON CONFLICT (aluno_id, missao_id) DO UPDATE SET status = 'concluida', progresso = 100, concluida_em = now(),"
        " updated_at = now() WHERE public.missao_aluno.status <> 'concluida'" in c
    )
    assert (
        "INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)"
        " VALUES (v_aluno, v_missao.classe_id, v_missao.recompensa_tipo, 'missao:' || v_missao.id::text, 0, now());"
        in c
    )
    liga = rpc.index("PERFORM set_config('app.missao_premiando', 'on', true);")
    premio = rpc.index("INSERT INTO public.eventos_aluno")
    desliga = rpc.index("PERFORM set_config('app.missao_premiando', '', true);")
    excecao = rpc.index("EXCEPTION WHEN OTHERS THEN")
    assert liga < premio < desliga < excecao
    assert _compacto(rpc[excecao:]).startswith(
        "EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.missao_premiando', '', true); RAISE;"
    )
    assert rpc.count("set_config('app.missao_premiando', 'on', true)") == 1


def test_compara_pelas_funcoes_do_desafio() -> None:
    mod = _mod()
    rpc = mod.RPC
    assert "public.fn_missao_desafio_letras(" in rpc
    assert "public.fn_missao_desafio_comparavel(" in rpc
    aux = _compacto(mod.AUXILIARES)
    # A da lógica parte da normalização da 20261117_03, sem redefini-la.
    assert "public.fn_missao_desafio_normalizar(p_texto)" in aux
    assert "CREATE OR REPLACE FUNCTION public.fn_missao_desafio_normalizar" not in _sql()
    assert "CREATE OR REPLACE FUNCTION public.fn_missao_desafio_letras" not in _sql()
    assert "translate(" not in rpc and "unaccent" not in _sql()
    assert "REVOKE ALL ON FUNCTION public.fn_missao_desafio_comparavel(text, boolean) FROM PUBLIC, anon, authenticated;" in aux


def test_retorno_sem_gabarito() -> None:
    rpc = _compacto(_rpc())
    retorno = rpc[rpc.rindex("RETURN jsonb_build_object(") :]
    retorno = retorno[: retorno.index(";")]
    assert re.findall(r"'(\w+)'", retorno) == ["acertou", "ja_concluida", "palavras_certas", "palavras_total"]
    assert "v_gabarito" not in retorno


def test_nenhum_bind_escondido() -> None:
    """`text()` lê `:palavra` como parâmetro; nenhum comando da migration pode ter um."""
    for fn in ("upgrade", "downgrade"):
        for comando in _comandos(fn):
            assert text(comando).compile().params == {}, comando[:120]


def test_downgrade_desfaz() -> None:
    sql = _sql("downgrade")
    assert "DROP FUNCTION IF EXISTS public.missao_desafio_responder(bigint, jsonb);" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_missao_desafio_comparavel(text, boolean);" in sql


def test_tentativa_fica_quando_a_missao_sai() -> None:
    """A tentativa é a prova do pagamento único: a FK vira SET NULL e o NOT NULL da `_03` sai."""
    mod = _mod()
    sql = _compacto(_sql())
    assert (
        "ADD CONSTRAINT missao_desafio_tentativa_missao_id_fkey FOREIGN KEY (missao_id)"
        " REFERENCES public.missoes(id) ON DELETE SET NULL;" in sql
    )
    assert "ALTER TABLE public.missao_desafio_tentativa ALTER COLUMN missao_id DROP NOT NULL;" in sql
    assert "DROP INDEX" not in sql
    # O professor lê pelo grupo, não pela linha.
    politica = _compacto(mod.TENTATIVA)
    assert "WHERE m.desafio_grupo = missao_desafio_tentativa.desafio_grupo" in politica
    assert "m.id = missao_desafio_tentativa.missao_id" not in politica
    # `ja_concluida` lê a tentativa certa do grupo, dentro da trava.
    rpc = _compacto(_rpc())
    ja = rpc[rpc.index("v_ja_concluida := EXISTS") :]
    ja = ja[: ja.index(";")]
    assert "public.missao_desafio_tentativa t" in ja
    assert "t.aluno_id = v_aluno AND t.desafio_grupo = v_grupo AND t.acertou" in ja
    assert "missao_aluno" not in ja
    assert rpc.index("pg_advisory_xact_lock") < rpc.index("v_ja_concluida := EXISTS")


def test_teto_da_cruzadinha() -> None:
    rpc = _compacto(_rpc())
    assert "(SELECT count(*) FROM jsonb_object_keys(v_palavras)) > 20" in rpc
    assert "char_length(e.value #>> '{}') > 100" in rpc
    assert rpc.index("> 20") < rpc.index("pg_advisory_xact_lock")


def test_downgrade_devolve_a_tentativa() -> None:
    mod = _mod()
    sql = _compacto(_sql("downgrade"))
    assert _compacto(mod.POLICY_PROFESSOR_ANTES) in sql
    assert "WHERE m.id = missao_desafio_tentativa.missao_id" in sql
    assert "DELETE FROM public.missao_desafio_tentativa WHERE missao_id IS NULL;" in sql
    assert "REFERENCES public.missoes(id) ON DELETE CASCADE;" in sql
    assert sql.index("WHERE missao_id IS NULL") < sql.index("ALTER COLUMN missao_id SET NOT NULL")


def test_portoes_do_estudo_e_da_visibilidade() -> None:
    rpc = _compacto(_rpc())
    assert "RAISE EXCEPTION 'personalizacao_retida' USING ERRCODE = '42501';" in rpc
    assert (
        "SELECT 1 FROM public.conteudos co JOIN public.topicos t ON t.id = co.topico_id"
        " WHERE co.id = v_missao.conteudo_id AND public.app_topico_liberado(t.publicacao, t.publicar_em)" in rpc
    )


def test_policy_restritiva_de_missoes() -> None:
    mod = _mod()
    sql = _compacto(mod.VISIBILIDADE)
    assert (
        "CREATE POLICY missoes_desafio_visivel_sel ON public.missoes AS RESTRICTIVE FOR SELECT TO authenticated"
        in sql
    )
    assert "coalesce(conteudo_id <> ALL (ARRAY(SELECT public.app_conteudos_ocultos_para_mim())), true)" in sql
    assert (
        "AND (desafio IS NULL OR classe_id IN (SELECT public.app_classes_do_professor())"
        " OR NOT (classe_id IN (SELECT public.app_classes_retidas_do_aluno())))" in sql
    )
    assert mod.VISIBILIDADE in _sql()


def test_indice_da_cascata_do_conteudo() -> None:
    sql = _compacto(_sql())
    assert "CREATE INDEX IF NOT EXISTS missoes_conteudo_idx ON public.missoes (conteudo_id) WHERE conteudo_id IS NOT NULL;" in sql
    down = _sql("downgrade")
    assert "DROP INDEX IF EXISTS public.missoes_conteudo_idx;" in down
    assert "DROP POLICY IF EXISTS missoes_desafio_visivel_sel ON public.missoes;" in down
