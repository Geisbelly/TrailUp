"""Job que termina nao pode deixar alvo dizendo que ainda esta em voo.

`claim_next_job` reivindica job em tres hipoteses -- `pending`, `partial` ou
`processing`. `failed` e `completed` NAO entram em nenhuma delas. Entao um alvo
que ficou em `pending`/`processing` no instante em que o job foi finalizado
nunca mais e tocado: nem pelo worker, nem por retentativa. A unica saida era
mexer no banco na mao.

Medido em producao: 2 alvos `pending` de um job `failed` em 2026-08-28,
parados havia duas semanas. E o job do topico 128 caiu nisso tres vezes no
mesmo dia, com 6 alvos em `processing` de cada vez.

`partial` de proposito NAO varre: e exatamente o estado que o `claim_next_job`
reivindica de volta para retomar de onde parou (o SELECT exige
`EXISTS (... target.status NOT IN ('completed','failed','skipped'))`), entao
varrer ali destruiria a retomada.
"""

from __future__ import annotations

import re
from pathlib import Path

FONTE = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "repositories"
    / "personalizacao_jobs.py"
)


def _corpo_do_metodo(nome: str) -> str:
    """Do `async def <nome>(` ate a proxima definicao no mesmo nivel.

    `finalize_job` e o ultimo metodo da classe, entao "proxima definicao" pode
    nao existir -- nesse caso vai ate o fim do arquivo."""
    texto = FONTE.read_text(encoding="utf-8")
    assinatura = f"    async def {nome}("
    inicio = texto.index(assinatura)
    resto = texto[inicio + len(assinatura) :]
    proxima = resto.find("\n    async def ")
    if proxima == -1:
        return texto[inicio:]
    return texto[inicio : inicio + len(assinatura) + proxima]


def _corpo_do_finalize() -> str:
    return _corpo_do_metodo("finalize_job")


def _corpo_do_claim() -> str:
    return _corpo_do_metodo("claim_next_job")


def test_finalize_varre_alvo_nao_terminal() -> None:
    corpo = _corpo_do_finalize()

    assert "UPDATE personalizacao_job_targets" in corpo, (
        "finalize_job precisa resolver os alvos, nao so a linha do job"
    )
    assert "status NOT IN ('completed', 'failed', 'skipped')" in corpo
    assert "SET status = 'failed'" in corpo


def test_varre_so_em_status_terminal_nunca_em_partial() -> None:
    """`partial` e o estado de retomada. Varrer ali marcaria como falha
    justamente os alvos que faltam processar, e o job voltaria sem trabalho."""
    corpo = _corpo_do_finalize()

    assert 'if status in ("completed", "failed"):' in corpo
    # A guarda tem de vir ANTES do UPDATE dos alvos.
    assert corpo.index('if status in ("completed", "failed"):') < corpo.index(
        "UPDATE personalizacao_job_targets"
    )
    assert '"partial"' not in corpo.split("UPDATE personalizacao_job_targets")[0][-400:]


def test_preserva_o_erro_que_o_alvo_ja_tinha() -> None:
    """O `last_error` do alvo diz o motivo REAL da falha. Sobrescrever com o
    texto generico da varredura apagaria a informacao boa."""
    corpo = _corpo_do_finalize()

    assert "last_error = COALESCE(last_error, :motivo)" in corpo


def test_a_linha_do_job_e_lida_antes_da_varredura() -> None:
    """`result.mappings().first()` depois de outro `execute` na mesma sessao
    vem vazio -- o cursor anterior ja foi fechado. Foi um bug que eu introduzi
    e que este teste tranca."""
    corpo = _corpo_do_finalize()

    posicao_leitura = corpo.index("row = result.mappings().first()")
    posicao_varredura = corpo.index("UPDATE personalizacao_job_targets")

    assert posicao_leitura < posicao_varredura, (
        "a linha do job tem de ser lida antes do UPDATE dos alvos"
    )
    # E o retorno usa a variavel, nao uma releitura do cursor morto.
    assert "return self._hydrate_job(dict(row)) if row else None" in corpo


def test_claim_next_job_nao_reivindica_failed() -> None:
    """A premissa do teste acima: se um dia `failed` passar a ser reivindicavel,
    a varredura deixa de ser necessaria e este arquivo precisa ser revisto."""
    corpo = _corpo_do_claim()

    hipoteses = re.findall(r"candidate\.status = '(\w+)'", corpo)

    assert set(hipoteses) == {"pending", "partial", "processing"}, (
        f"as hipoteses de reivindicacao mudaram: {sorted(set(hipoteses))}"
    )
    # O que torna o alvo orfao: nenhuma hipotese cobre job terminal.
    assert "'failed'" not in " ".join(
        re.findall(r"candidate\.status = '\w+'", corpo)
    )
