"""`str(target["aluno_id"])` sem guarda transforma None na string "None".

O material BASE nao tem dono: `_targets_para_job` cria os alvos com
`owner_aluno_id=None` para seis kinds, de proposito -- a base e material de
(classe x topico x conteudo x perfil) e existe com ou sem aluno matriculado.

`str(None)` devolve a STRING "None", e ela viaja adiante como se fosse UUID.
`fetch_personalizacao_context` tem um `if aluno_id is None` para pular o
contexto de aluno, e a string passa por ele: cai no `else` e consulta
`alunos WHERE id = 'None'`.

Medido em producao, duas vezes, em jobs diferentes:

- job 6d21ec28 (topico 128, classe 32): 0 completos / 7 falhas de 7 alvos, com
  `invalid input for query argument $1: 'None' (invalid UUID 'None')` e ZERO
  chamadas de geracao ao microservice -- o pre-aquecimento do cache de contexto
  estoura antes;
- varredura de `personalizacao_job_targets` em 2026-09-20: **268 alvos** com a
  mesma mensagem, a ultima em 13/09 -- ou seja, DEPOIS de `e4d50ae`, que
  acrescentou a guarda `if aluno_id is None` no consumidor.

Esse "depois" e a licao, e e por isso que a forma exigida mudou: guarda por
IDENTIDADE nao pega TEXTO. Enquanto a conversao fosse escrita a mao em cada
ponto (`str(x) if x is not None else None`), ela protegia so aquele ponto, e
nada impedia que o valor chegasse ja convertido de outro lugar -- que e
exatamente o que acontecia. Hoje a conversao e uma so, `dono_de` em
`app.core.identidade`, e ela trata `'None'`/`'null'`/vazio como ausencia.

Este arquivo e o DONO da regra de forma. O comportamento (a base nao busca
aluno) e provado em `test_base_sem_dono_nao_vira_string_none.py`, por execucao,
nao por leitura de fonte.
"""

from __future__ import annotations

import re
from pathlib import Path

FONTE = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "services"
    / "personalizacao_jobs.py"
)

# `str(<algo>["aluno_id"])` ou `str(<algo>.get("aluno_id"))`, em qualquer forma
# e sobre QUALQUER linha -- target, record, job, item. A primeira versao desta
# regra olhava so `target`, e o defeito reapareceu por `record` e por `job`.
USO_DE_STR = re.compile(r"""str\(\s*\w+(?:\[|\.get\(\s*)["']aluno_id["']""")


def _linhas_de_codigo() -> list[tuple[int, str]]:
    """Comentario nao executa. A regra antiga contava a linha comentada que
    EXPLICA o defeito como se fosse o defeito."""
    texto = FONTE.read_text(encoding="utf-8")
    return [
        (numero, linha)
        for numero, linha in enumerate(texto.splitlines(), start=1)
        if not linha.strip().startswith("#")
    ]


def test_nenhuma_conversao_de_dono_e_feita_na_mao() -> None:
    ofensores = [
        (numero, linha.strip())
        for numero, linha in _linhas_de_codigo()
        if USO_DE_STR.search(linha)
    ]

    assert not ofensores, (
        "use `dono_de(linha)` de app.core.identidade em vez de converter a mao: "
        + "; ".join(f"linha {n}: {t}" for n, t in ofensores)
    )


def test_o_conversor_esta_importado_e_em_uso() -> None:
    """Sem isto, apagar todos os usos deixaria o teste acima verde sem que
    nada estivesse protegido -- ele passaria a nao verificar coisa nenhuma."""
    texto = FONTE.read_text(encoding="utf-8")

    assert "from app.core.identidade import dono_de" in texto
    usos = len(re.findall(r"\bdono_de\(", texto))
    assert usos >= 4, f"esperava o conversor nos caminhos de dono, achei {usos}"


def test_o_prepare_tem_a_guarda() -> None:
    """O ponto que faltava. `_prepare` pre-aquece o cache de contexto e roda
    ANTES do processamento, entao era ele que derrubava os alvos."""
    texto = FONTE.read_text(encoding="utf-8")
    inicio = texto.index("async def _prepare(target:")
    corpo = texto[inicio : inicio + 1800]

    assert "aluno_id = dono_de(target)" in corpo


def test_a_chave_de_cache_continua_compativel() -> None:
    """`_process_media_render_target` e `_prepare` compartilham o cache de
    contexto. Se um monta a chave com None e o outro com "None", cada caminho
    aquece um balde diferente e o pre-aquecimento deixa de servir para nada."""
    texto = FONTE.read_text(encoding="utf-8")
    # Os dois caminhos nomeiam a variavel diferente (`context_cache_key` e
    # `context_key`); o que tem de ser igual e a FORMA da chave.
    chaves = re.findall(
        r'context_(?:cache_)?key = f"\{aluno_id\}:\{topico_id\}:\{conteudo_id or 0\}"',
        texto,
    )

    assert len(chaves) >= 2, (
        f"esperava a mesma forma de chave nos dois caminhos, achei {len(chaves)}"
    )
