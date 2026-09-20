"""Guardas da `20260921_01` e da `20260921_02` -- o gabarito fora do aluno.

O vazamento foi medido no banco assumindo a role `authenticated` com o JWT do
aluno: `SELECT resposta_correta FROM questoes` devolvia o gabarito de todas as
questoes das turmas dele.
"""

import importlib.util
import re
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
VERSOES = API_ROOT / "alembic" / "versions"
M1 = "20260921_01_gabarito_fora_do_alcance_do_aluno.py"
M2 = "20260921_02_correcao_no_servidor.py"


def _carregar(nome: str):
    spec = importlib.util.spec_from_file_location(f"mig_{nome}", VERSOES / nome)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _stmts(nome: str, direcao: str = "upgrade") -> list[str]:
    module = _carregar(nome)
    saida: list[str] = []

    class FakeOp:
        def execute(self, sql):
            saida.append(str(sql))

    module.op = FakeOp()
    getattr(module, direcao)()
    return saida


def _sql(nome: str, direcao: str = "upgrade") -> str:
    return "\n".join(_stmts(nome, direcao))


def _sem_comentarios(sql: str) -> str:
    return " ".join(linha.split("--", 1)[0] for linha in sql.splitlines())


def test_cadeia_de_revisao():
    assert _carregar(M1).revision == "20260921_01"
    assert _carregar(M1).down_revision == "20260920_07"
    assert _carregar(M2).revision == "20260921_02"
    assert _carregar(M2).down_revision == "20260921_01"


def test_nenhum_literal_vira_bind_parameter():
    for nome in (M1, M2):
        for direcao in ("upgrade", "downgrade"):
            assert re.findall(r"(?<![:\w\$]):([\w\$]+)", _sql(nome, direcao)) == []


def test_revoga_a_TABELA_e_nao_so_a_coluna():
    # ESTE foi o erro da primeira tentativa, e a guarda da propria migracao o
    # pegou: privilegio de coluna e ADITIVO. `authenticated` tinha SELECT na
    # tabela inteira, que ja implica todas as colunas, e um
    # `REVOKE SELECT (resposta_correta)` por cima nao tira nada.
    executavel = _sem_comentarios(_sql(M1))
    assert "REVOKE SELECT ON public.questoes FROM anon, authenticated" in executavel
    assert "REVOKE SELECT (resposta_correta)" not in executavel


def test_concede_todas_as_colunas_menos_o_gabarito():
    module = _carregar(M1)
    assert "resposta_correta" not in module._COLUNAS_VISIVEIS
    # o enunciado e as alternativas TEM de continuar: sem eles nao ha questao
    for essencial in ("id", "atividade_id", "enunciado", "tipo", "alternativas"):
        assert essencial in module._COLUNAS_VISIVEIS


def test_a_escrita_do_professor_continua():
    # INSERT e UPDATE nao sao revogados: o professor escreve o gabarito, e
    # escrever nao vaza.
    executavel = _sem_comentarios(_sql(M1))
    assert "REVOKE INSERT" not in executavel
    assert "REVOKE UPDATE" not in executavel
    assert "o professor perdeu a escrita do gabarito" in executavel


def test_o_espelho_mantem_os_escritores_intactos():
    # E o que segura o raio pequeno: console, API e pipeline continuam gravando
    # em `questoes`; so as LEITURAS mudaram de lugar.
    executavel = _sem_comentarios(_sql(M1))
    assert "AFTER INSERT OR UPDATE OF resposta_correta ON public.questoes" in executavel
    assert "fn_questoes_espelha_gabarito" in executavel


def test_o_aluno_nao_tem_policy_no_gabarito():
    # A tabela tem UMA policy, e ela e do professor. Aluno sem policy nao ve
    # linha -- entao nao ha coluna a vazar.
    executavel = _sem_comentarios(_sql(M1))
    assert "CREATE POLICY questao_gabarito_professor" in executavel
    assert "app_classes_do_professor" in executavel
    assert executavel.count("CREATE POLICY") == 1


def test_a_rpc_confere_matricula():
    # Ela roda como DONO, entao a RLS nao a segura: sem esta checagem
    # responderia questao de turma alheia.
    executavel = _sem_comentarios(_sql(M1))
    assert "questao_sem_permissao" in executavel
    assert "JOIN public.classe_aluno ca ON ca.classe_id = t.classe_id" in executavel


def test_o_gabarito_so_volta_depois_de_responder():
    # O INSERT em `questao_aluno` vem ANTES do RETURN: nao ha caminho que
    # devolva a resposta sem registrar a tentativa.
    executavel = _sem_comentarios(_sql(M1))
    corpo = executavel.split("FUNCTION public.questao_responder")[1]
    assert corpo.index("INSERT INTO public.questao_aluno") < corpo.index("'resposta_correta', v_gabarito")


def test_a_tolerancia_do_servidor_cobre_o_que_o_cliente_cobria():
    # Comparacao ingenua reprovaria resposta certa: o gabarito pode estar
    # gravado como o TEXTO da opcao enquanto o aluno manda "A" ou "1".
    executavel = _sem_comentarios(_sql(M2))
    assert "lower(chr(65 + v_i))" in executavel, "letra"
    assert "v_resp = v_i::text" in executavel, "indice"
    assert "'v','true','verdadeiro','sim','certo'" in executavel, "verdadeiro"
    assert "'f','false','falso','nao','errado'" in executavel, "falso"


def test_acento_por_tabela_explicita_e_nao_por_combining_marks():
    # Range de combining marks gravado literalmente no fonte e INVISIVEL: um
    # replace acidental apaga a regra e o diff nao mostra nada.
    module = _carregar(M2)
    assert len(module._DE) == len(module._PARA), "as duas tabelas tem de casar"
    assert "normalize" not in _sql(M2)
    for par in (("á", "a"), ("ç", "c"), ("õ", "o")):
        assert module._PARA[module._DE.index(par[0])] == par[1]


def test_resposta_vazia_e_sempre_errada():
    executavel = _sem_comentarios(_sql(M2))
    assert "IF v_gabarito IS NULL OR v_resp = '' THEN RETURN false" in executavel


def test_toda_funcao_nova_sai_do_alcance_do_anon():
    for nome in (M1, M2):
        sql = _sql(nome)
        for assinatura in _carregar(nome)._FUNCOES:
            assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon" in sql
            assert f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated" in sql


def test_toda_funcao_nova_tem_search_path():
    for nome in (M1, M2):
        for statement in _stmts(nome):
            if "CREATE OR REPLACE FUNCTION" not in statement:
                continue
            assert "SET search_path TO 'public', 'pg_temp'" in statement


def test_o_downgrade_devolve_a_leitura():
    volta = _sem_comentarios(_sql(M1, "downgrade"))
    assert "GRANT SELECT ON public.questoes TO anon, authenticated" in volta


def test_o_downgrade_da_correcao_nao_derruba_a_rpc():
    # Derruba-la deixaria a `20260921_01` sem a RPC que ela pressupoe, e o
    # cliente sem como corrigir.
    volta = _sem_comentarios(_sql(M2, "downgrade"))
    assert "DROP FUNCTION IF EXISTS public.questao_responder" not in volta
