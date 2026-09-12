"""Job `partial` nao pode bloquear geracao nova.

Defeito real, em producao (30/08/2026): o job `23e37a82` da classe 54 terminou
`partial` em 28/08 as 21:43 - 5 alvos, 3 com falha. Durante mais de 27 horas,
todo clique em "gerar" no console reencontrou esse job e devolveu ele em vez de
criar outro: o console ficava em polling eterno e nenhuma chamada chegava aos
microservices.

A causa eram duas regras que so' fazem sentido separadas:

1. `partial` contava como job ABERTO na deduplicacao, mas e' terminal - ele tem
   `finished_at` e o worker so' reivindica `pending` (`claim_next_job`). Job
   morto para o worker bloqueando pedido novo para sempre.
2. Mesmo criando job novo, o circuit breaker `_falha_streak_excedido` pularia os
   alvos que ja' falharam 3x, e so' `manual_retry` o furava - o botao "gerar"
   nao.
"""

from __future__ import annotations

from pathlib import Path

from app.services.personalizacao_jobs import (
    JOB_KIND_CLASS_DELTA,
    JOB_KIND_MANUAL_PROFILE_GENERATE,
    JOB_KIND_MANUAL_PROFILE_GENERATE_ALL,
    JOB_KIND_MANUAL_RETRY,
    _falha_streak_excedido,
)

_APP = Path(__file__).resolve().parents[1] / "app"
CONSULTAS = _APP / "repositories" / "personalizacao_jobs.py"
SERVICO = _APP / "services" / "personalizacao_jobs.py"


def _fonte(caminho: Path) -> str:
    return caminho.read_text(encoding="utf-8")


def test_partial_nao_conta_como_job_aberto() -> None:
    """`partial` e terminal: tem finished_at e o worker nunca o reivindica.

    Se voltar para a lista de "aberto", o bloqueio de 27 horas volta junto.
    """
    fonte = _fonte(CONSULTAS)
    assert "status IN ('pending', 'processing')" in fonte
    assert "status IN ('pending', 'processing', 'partial')" not in fonte


def test_worker_so_reivindica_pending() -> None:
    """Prova a premissa do teste acima, em vez de assumi-la."""
    fonte = _fonte(CONSULTAS)
    assert "WHERE candidate.status = 'pending'" in fonte


def test_partial_recebe_finished_at() -> None:
    """Segunda metade da premissa: `partial` e' estado final, nao intermediario."""
    fonte = _fonte(CONSULTAS)
    assert "IN ('completed', 'partial', 'failed') THEN NOW()" in fonte


def test_todo_pedido_manual_fura_o_circuit_breaker() -> None:
    """O botao "gerar" e' pedido explicito tanto quanto o "tentar de novo".

    Sem isto, alvo que falhou 3x some de toda geracao manual e nunca mais e
    tentado - o professor pede, nada acontece e nada explica por que.
    """
    fonte = _fonte(SERVICO)
    # O conjunto e' unico: o mesmo `_KINDS_MANUAIS` governa o circuit breaker e
    # a retomada. Duas listas separadas divergiriam na primeira mudanca.
    definicao = fonte.split("_KINDS_MANUAIS = {")[1].split("}")[0]
    for kind in (
        "JOB_KIND_MANUAL_RETRY",
        "JOB_KIND_MANUAL_PROFILE_GENERATE",
        "JOB_KIND_MANUAL_PROFILE_GENERATE_ALL",
    ):
        assert kind in definicao, f"{kind} deveria contar como pedido manual"
    # Disparo automatico continua respeitando o breaker: sem isso, uma geracao
    # quebrada seria retentada em loop sem ninguem pedir.
    assert "JOB_KIND_CLASS_DELTA" not in definicao
    assert "is_pedido_manual = job.get(\"kind\") in _KINDS_MANUAIS" in fonte


def test_streak_so_conta_para_a_mesma_geracao() -> None:
    """Conteudo editado (generation_key novo) zera o contador naturalmente."""
    registro = {
        "materiais": {"_geracao_falhas": {"generation_key": "abc", "streak": 5}}
    }
    assert _falha_streak_excedido(registro, generation_key="abc", max_streak=3) is True
    assert _falha_streak_excedido(registro, generation_key="xyz", max_streak=3) is False


def test_streak_tolera_registro_malformado() -> None:
    for materiais in ({}, {"_geracao_falhas": None}, {"_geracao_falhas": {"streak": "x"}}):
        assert (
            _falha_streak_excedido(
                {"materiais": materiais}, generation_key="abc", max_streak=3
            )
            is False
        )


def test_retomada_so_vale_para_pedido_manual() -> None:
    """Reabrir automaticamente faria geracao quebrada girar em loop.

    O disparo automatico continua criando job novo e respeitando o breaker; a
    retomada exige que alguem tenha pedido.
    """
    fonte = _fonte(SERVICO)
    assert "if kind in _KINDS_MANUAIS:" in fonte
    assert "list_resumable_jobs_by_payload" in fonte


def test_retomada_nao_refaz_o_que_ja_deu_certo() -> None:
    """So `failed`/`pending` voltam para a fila.

    Reabrir `completed`/`skipped` transformaria "continuar de onde parou" em
    "comecar de novo", gastando cota de geracao a toa - que e justamente o
    recurso mais escasso hoje.
    """
    fonte = _fonte(CONSULTAS)
    trecho = fonte.split("async def reabrir_job_para_retomada")[1]
    assert "status IN ('failed', 'pending')" in trecho
    assert "'completed'" not in trecho.split("RETURNING")[0]


def test_retomada_zera_tentativas_do_alvo() -> None:
    """Sem zerar, o alvo que ja bateu o teto volta a `failed` na primeira
    passada do worker e a retomada nao tem efeito nenhum."""
    fonte = _fonte(CONSULTAS)
    trecho = fonte.split("async def reabrir_job_para_retomada")[1]
    assert "attempts = CASE WHEN :zerar THEN 0 ELSE attempts END" in trecho
    assert "zerar_tentativas=True" in _fonte(SERVICO)


def test_job_reaberto_volta_a_ser_reivindicavel() -> None:
    """O worker so pega `pending` com `finished_at` limpo - reabrir tem que
    desfazer as duas coisas, senao o job fica 'pending' mas invisivel."""
    fonte = _fonte(CONSULTAS)
    trecho = fonte.split("async def reabrir_job_para_retomada")[1]
    assert "SET status = 'pending'" in trecho
    assert "finished_at = NULL" in trecho


def test_kinds_manuais_sao_distintos_do_automatico() -> None:
    manuais = {
        JOB_KIND_MANUAL_RETRY,
        JOB_KIND_MANUAL_PROFILE_GENERATE,
        JOB_KIND_MANUAL_PROFILE_GENERATE_ALL,
    }
    assert JOB_KIND_CLASS_DELTA not in manuais
    assert len(manuais) == 3
