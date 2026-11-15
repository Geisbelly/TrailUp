"""Estrutura da `20261110_04` (corte do gabarito, fase 3). O comportamento está no e2e."""

from __future__ import annotations

from tests import _f5_banco as f5

M = f5.modulo("20261110_04_corte_do_gabarito.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_cabeca_da_main():
    # Nasceu como 20261110_02; a #1083 (respostas ricas) e depois a #1087 (fila de notas) pegaram
    # o número antes do merge. O número fica `_04`, mas a cadeia vai para a cabeça da `main`
    # (hoje a `20261115_03`, geração em lote, #1136), senão o Alembic teria duas cabeças e a API
    # não subiria. Nenhuma migration entre a `_05` e a `20261115_03` mexe em
    # `atividade_responder_tentativa`, na guarda de `questao_aluno` nem no GRANT de `questoes`, e
    # as funções da arena que leem `questoes.resposta_correta` são `SECURITY DEFINER` (o corte não
    # as alcança).
    assert M.revision == "20261110_04"
    assert M.down_revision == "20261115_03"


def test_avisa_que_nao_se_aplica_antes_da_versao_minima():
    # O merge aplica (a API roda `alembic upgrade head` ao subir).
    assert "Não aplicar antes de `app_versao_minima` >= 1.0.8" in M.__doc__


def test_grant_por_coluna_le_a_lista_do_banco_e_tira_so_o_gabarito():
    assert "REVOKE SELECT ON public.questoes FROM authenticated, anon;" in M.GRANT_POR_COLUNA
    assert "REVOKE SELECT (resposta_correta) ON public.questoes FROM authenticated, anon;" in M.GRANT_POR_COLUNA
    assert "information_schema.columns" in M.GRANT_POR_COLUNA
    assert "c.column_name <> 'resposta_correta'" in M.GRANT_POR_COLUNA
    # Nada para anon: ele não lia `questoes` antes do corte.
    assert "TO anon" not in M.GRANT_POR_COLUNA


def test_view_sem_gabarito_e_com_security_invoker():
    assert "NULL::text AS questao_resposta_correta," in UP
    assert "q.resposta_correta" not in UP
    assert "SET (security_invoker = on)" in UP


def test_guarda_e_invoker_e_decide_por_current_user():
    # DEFINER faria o current_user ser sempre o dono, e a guarda nunca dispararia (20261029_06).
    assert "SECURITY INVOKER" in M.GUARDA
    assert "current_user NOT IN ('authenticated', 'anon')" in M.GUARDA
    assert "BEFORE INSERT OR UPDATE ON public.questao_aluno" in M.GUARDA


def test_sem_porcentagem_no_que_e_novo():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro. O `LIKE` do bônus de
    # tempo é o mesmo da `20261101_13`, que já roda assim.
    assert "%" not in M.GRANT_POR_COLUNA
    assert "%" not in M.GUARDA
    assert M.RESPONDER.count("%") == M._responder_de_antes().count("%")


def test_responder_mantem_a_assinatura_e_os_grants():
    assert "public.atividade_responder_tentativa(bigint, numeric, numeric, jsonb) FROM PUBLIC, anon;" in M.RESPONDER
    assert "public.atividade_responder_tentativa(bigint, numeric, numeric, jsonb) TO authenticated;" in M.RESPONDER
    assert "SECURITY DEFINER" in M.RESPONDER


def test_downgrade_devolve_os_corpos_anteriores():
    assert "GRANT SELECT ON public.questoes TO authenticated;" in DOWN
    assert "q.resposta_correta AS questao_resposta_correta," in DOWN
    assert "fn_questao_aluno_recusa(NEW.questao_id, NEW.atividade_id)" in DOWN
    assert "v_acertos := greatest(0, least(100, COALESCE(p_acertos_percentual, 0)));" in DOWN
