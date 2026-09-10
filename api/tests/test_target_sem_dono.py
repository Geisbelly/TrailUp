"""`str(target["aluno_id"])` sem guarda transforma None na string "None".

O material BASE nao tem dono: `_targets_para_job` cria os alvos com
`owner_aluno_id=None` para seis kinds, de proposito -- a base e material de
(classe x topico x conteudo x perfil) e existe com ou sem aluno matriculado.

`str(None)` devolve a STRING "None", e ela viaja adiante como se fosse UUID.
`fetch_personalizacao_context` tem um `if aluno_id is None` para pular o
contexto de aluno, e a string passa por ele: cai no `else` e consulta
`alunos WHERE id = 'None'`.

Medido em producao, job 6d21ec28 (topico 128, classe 32): 0 completos / 7 falhas
de 7 alvos, com

    invalid input for query argument $1: 'None' (invalid UUID 'None')

e ZERO chamadas de geracao ao microservice -- o pre-aquecimento do cache de
contexto estoura antes.

A guarda existia em `_process_media_render_target`, com o comentario explicando
exatamente este caso, e faltava em `_prepare`. Este teste cobre o arquivo todo,
nao so os dois pontos: e um descuido de uma linha que reaparece a cada caminho
novo que le `target["aluno_id"]`.
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

# `str(target["aluno_id"])` ou `str(target.get("aluno_id"))`, em qualquer forma.
USO_DE_STR = re.compile(r"""str\(\s*target(?:\[|\.get\(\s*)["']aluno_id["']""")


def _linhas_com_str_de_aluno() -> list[tuple[int, str]]:
    texto = FONTE.read_text(encoding="utf-8")
    return [
        (numero, linha)
        for numero, linha in enumerate(texto.splitlines(), start=1)
        if USO_DE_STR.search(linha)
    ]


def test_existe_pelo_menos_um_uso_para_o_teste_valer() -> None:
    """Se alguem reescrever o modulo e os usos desaparecerem, o teste passa a
    nao verificar nada -- e passaria em silencio."""
    assert _linhas_com_str_de_aluno(), (
        "nenhum `str(target[\"aluno_id\"])` encontrado: o teste perdeu o alvo"
    )


def test_todo_str_de_aluno_id_e_guardado() -> None:
    """Cada uso precisa checar `is not None` na MESMA linha (a forma que o
    modulo usa), senao um alvo base grava a string "None"."""
    sem_guarda = [
        (numero, linha.strip())
        for numero, linha in _linhas_com_str_de_aluno()
        if "is not None" not in linha
    ]

    assert not sem_guarda, (
        "str(target['aluno_id']) sem guarda de None em: "
        + "; ".join(f"linha {n}: {t}" for n, t in sem_guarda)
    )


def test_o_prepare_tem_a_guarda() -> None:
    """O ponto que faltava. `_prepare` pre-aquece o cache de contexto e roda
    ANTES do processamento, entao era ele que derrubava os alvos."""
    texto = FONTE.read_text(encoding="utf-8")
    inicio = texto.index("async def _prepare(target:")
    corpo = texto[inicio : inicio + 1800]

    assert 'str(target["aluno_id"]) if target.get("aluno_id") is not None else None' in corpo


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
