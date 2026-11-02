"""Resumo das tentativas e a regra que desliga o cronômetro (#136, fase 4). Tudo puro."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.tentativas_atividade import (
    decidir_desligar_cronometro,
    resumir_tentativas,
    resumir_tentativas_da_turma,
    texto_para_o_professor,
)

T0 = datetime(2026, 11, 1, 10, tzinfo=UTC)
LIGADO = {"ligado": True, "origem": "perfil"}


def _t(atividade=1, numero=1, minuto=0, cronometrada=True, no_tempo=True, acertos=80, maximo=None):
    return {
        "atividade_id": atividade,
        "numero": numero,
        "respondida_em": T0 + timedelta(minutes=minuto),
        "cronometrada": cronometrada,
        "no_tempo": no_tempo if cronometrada else None,
        "acertos_percentual": acertos,
        "tentativas_max": maximo,
    }


def test_resumo_separa_primeira_e_ultima_tentativa_e_conta_esgotadas() -> None:
    r = resumir_tentativas(
        [
            _t(atividade=1, numero=2, minuto=5, acertos=90, maximo=2),
            _t(atividade=1, numero=1, minuto=1, acertos=40, maximo=2),
            _t(atividade=2, numero=1, minuto=3, cronometrada=False, acertos=60),
        ],
        LIGADO,
    )
    assert r["respondidas"] == 3 and r["atividades"] == 2
    assert r["media_por_atividade"] == 1.5
    assert r["atividades_esgotadas"] == 1  # a 1 tinha 2 e o aluno fez as 2
    assert r["media_acertos_primeira"] == 50.0  # (40 + 60) / 2
    assert r["media_acertos_ultima"] == 75.0  # (90 + 60) / 2
    assert (r["cronometradas"], r["no_tempo_pct"]) == (2, 100.0)
    assert r["cronometro"] == LIGADO


def test_resumo_sem_tentativa_e_sem_dado_nao_zero() -> None:
    r = resumir_tentativas([])
    assert r["respondidas"] == 0
    assert r["media_acertos_primeira"] is None and r["no_tempo_pct"] is None and r["media_por_atividade"] is None
    assert r["ultimas_cronometradas_no_tempo"] == []


def test_janela_de_cronometradas_e_da_mais_recente_para_a_mais_antiga() -> None:
    linhas = [_t(atividade=i, minuto=i, no_tempo=(i % 2 == 0)) for i in range(8)]
    r = resumir_tentativas(linhas, LIGADO)
    # minutos 7, 6, 5, 4, 3: fora, no tempo, fora, no tempo, fora
    assert r["ultimas_cronometradas_no_tempo"] == [False, True, False, True, False]


def test_tres_das_ultimas_cinco_fora_do_tempo_desliga() -> None:
    r = resumir_tentativas([_t(atividade=i, minuto=i, no_tempo=i < 2) for i in range(5)], LIGADO)
    decisao = decidir_desligar_cronometro(r)
    assert decisao is not None
    assert (decisao.criterio, decisao.ocorrencias) == ("fora_do_tempo", 3)
    assert "3 das últimas 5" in decisao.motivo


def test_duas_fora_do_tempo_nao_bastam() -> None:
    r = resumir_tentativas([_t(atividade=i, minuto=i, no_tempo=i < 3) for i in range(5)], LIGADO)
    assert decidir_desligar_cronometro(r) is None


def test_sem_tentativa_fora_do_tempo_nao_desliga() -> None:
    # DAT-45: "ansiedade" recorrente nao e mais criterio; so a pressao de tempo medida conta.
    assert decidir_desligar_cronometro(resumir_tentativas([], LIGADO)) is None


def test_escolha_do_aluno_vence_e_desligado_fica_como_esta() -> None:
    fora = [_t(atividade=i, minuto=i, no_tempo=False) for i in range(5)]
    assert decidir_desligar_cronometro(resumir_tentativas(fora, {"ligado": True, "origem": "aluno"})) is None
    assert decidir_desligar_cronometro(resumir_tentativas(fora, {"ligado": False, "origem": "perfil"})) is None
    # Sem saber o estado de agora (tabela ausente, leitura falhou), a IA não mexe.
    assert decidir_desligar_cronometro(resumir_tentativas(fora)) is None


def test_texto_ao_professor_cita_o_motivo_e_que_a_nota_nao_muda() -> None:
    fora = [_t(atividade=i, minuto=i, no_tempo=False) for i in range(5)]
    decisao = decidir_desligar_cronometro(resumir_tentativas(fora, LIGADO))
    texto = texto_para_o_professor(decisao)
    assert decisao.motivo in texto and "nota não muda" in texto and len(texto) <= 400


def test_agregado_da_turma_pondera_por_atividade() -> None:
    a = resumir_tentativas([_t(atividade=1, acertos=40), _t(atividade=2, minuto=1, acertos=60)])  # 2 atividades
    b = resumir_tentativas([_t(atividade=3, no_tempo=False, acertos=100, maximo=1)])  # 1 atividade, esgotada
    vazio = resumir_tentativas([])
    t = resumir_tentativas_da_turma({"a": a, "b": b, "c": vazio})
    assert t["alunos_com_tentativa"] == 2
    assert t["respondidas"] == 3 and t["media_por_atividade"] == 1.0
    assert t["no_tempo_pct"] == 66.7
    assert t["alunos_com_atividade_esgotada"] == 1
    assert t["media_acertos_primeira"] == 66.7  # (50 * 2 + 100 * 1) / 3
