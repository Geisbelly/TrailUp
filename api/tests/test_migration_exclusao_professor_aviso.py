"""Estatico da `20261024_07` (#195): cadeia, ids e o que a migracao promete."""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from tests.test_e2e_retencao_expurgo import _modulo, _sql_de

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
M07 = _modulo("20261024_07_exclusao_professor_e_aviso_inatividade.py")


def test_cadeia_do_dia_sem_id_duplicado() -> None:
    ids = Counter()
    pares = {}
    for arquivo in VERSOES.glob("2*.py"):
        texto = arquivo.read_text(encoding="utf-8")
        rev = re.search(r"^revision\b[^=\n]*=\s*['\"]([^'\"]+)['\"]", texto, re.M).group(1)
        down = re.search(r"^down_revision\b[^=\n]*=\s*(.+)$", texto, re.M).group(1).strip().strip("\"'")
        ids[rev] += 1
        pares[rev] = down
    assert [r for r, n in ids.items() if n > 1] == []
    assert pares["20261024_05"] == "20261024_04"
    assert pares["20261024_06"] == "20261024_05"
    assert pares["20261024_07"] == "20261024_06"
    # Uma cabeca so (o `alembic heads` diz o mesmo).
    assert pares["20261024_08"] == "20261024_07"
    assert pares["20261024_09"] == "20261024_08"
    assert pares["20261024_10"] == "20261024_09"
    assert pares["20261024_11"] == "20261024_10"
    assert set(pares) - set(pares.values()) == {"20261024_11"}


# Sem FK (ficariam orfas), FK SET NULL (ficariam soltas) e FK NO ACTION/RESTRICT
# (seguram o DELETE da turma): a funcao apaga cada uma explicitamente. O e2e
# confere o resto (todas as tabelas dependentes, semeadas uma a uma).
APAGADAS_A_MAO = (
    "classe_aluno", "personalizacao_percurso", "personalizacao_item_progresso", "personalizacao_sugestao_log",
    "personalizacao_sugestao", "professor_intervencoes_passo", "intervencoes", "economia_auditoria", "rag_chunks",
    "rag_openai_files", "loja_uso_log", "loja_formato_escolhido", "loja_dica_liberada", "questao_gabarito_revelado",
    "telemetria_agregado_turma_dia", "telemetria_lotes", "telemetria_time_metric_entries", "moedas_ledger",
    "eventos_aluno", "telemetria_eventos_app", "ia_decision_logs", "bag_itens", "guilda_evento_snapshot",
    "classe_perfil_summary", "cards_personalizados", "fontes_personalizacao", "materiais_gerados",
    "conteudo_personalizado", "atividade_conteudos", "questao_aluno", "trilha_aluno", "classe",
    "classe_aluno_saidas",
)  # fmt: skip


def test_turmas_do_professor_sao_apagadas_com_tudo() -> None:
    sql = "\n".join(_sql_de(M07, "upgrade"))
    assert "REFERENCES public.professor (id) ON DELETE CASCADE" in sql
    assert "ON DELETE SET NULL" not in sql
    assert "REFERENCES auth.users (id) ON DELETE CASCADE" in sql
    assert "BEFORE DELETE ON public.professor" in sql
    assert "PERFORM public.trailup_apagar_turma_inteira(r.id)" in sql
    for tabela in APAGADAS_A_MAO:
        assert re.search(rf"DELETE FROM public\.{tabela}\s", sql), tabela
    # O que deixou de fazer sentido com a turma apagada.
    for velho in ("professor_removido_em", "turmas_sem_professor", "professores_para_turma", "fn_reatribuir_turma"):
        assert velho not in sql, velho
    # Arquivos: Storage e R2, pela fila do worker (nunca antes do commit).
    assert "CROSS JOIN (VALUES ('storage'), ('r2'))" in sql
    # Funcao interna: nenhum cliente chama.
    assert (
        "REVOKE EXECUTE ON FUNCTION public.trailup_apagar_turma_inteira(bigint) FROM PUBLIC, anon, authenticated" in sql
    )
    assert "GRANT EXECUTE ON FUNCTION public.trailup_apagar_turma_inteira" not in sql


def test_exclusao_so_depois_do_email_aceito() -> None:
    sql = "\n".join(_sql_de(M07, "upgrade"))
    assert sql.count("AND v.email_enviado_em IS NOT NULL") >= 2
    assert "vault.decrypted_secrets WHERE name = 'brevo_api_key'" in sql
    assert "'*/30 * * * *'" in sql


def test_texto_do_email_em_portugues_com_link() -> None:
    sql = "\n".join(_sql_de(M07, "upgrade"))
    assert "Sua conta no TrailUp será apagada se você não entrar até" in sql
    assert "'retencao_aviso_link', 'https://trailup.vercel.app'" in sql
