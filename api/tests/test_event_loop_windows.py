"""A API nao subia no Windows sem `--reload` (#173).

`psycopg` v3 async recusa `ProactorEventLoop`, que e o padrao do Python no
Windows. O caminho so e tocado quando `LANGGRAPH_DB_URL` esta preenchida -- quem
roda sem a variavel nunca ve, quem a tem nao sobe.

## O diagnostico da issue estava incompleto

Ela afirma que "nada no `api/app` chama `asyncio.set_event_loop_policy`".
Chamava: `app/main.py` tinha `_configure_windows_event_loop_policy()` desde o
commit inicial, chamada no import. **Nao adiantava**, e a razao e especifica do
uvicorn 0.43:

    def run(self, sockets=None):
        return asyncio_run(self.serve(sockets=sockets),
                           loop_factory=self.config.get_loop_factory())

Passar `loop_factory` para `asyncio.run` ignora a politica. A funcao era codigo
morto com cara de solucao -- pior que ausencia, porque quem lesse `main.py`
concluiria que o caso do Windows ja estava tratado.

## Medido nesta maquina

    python -m uvicorn app.main:app                  -> InterfaceError, startup failed
    python -m uvicorn app.main:app --reload         -> Application startup complete
    python -m app                                   -> Application startup complete

O `--reload` funciona por acidente: `asyncio_loop_factory(use_subprocess=True)`
devolve `SelectorEventLoop`. E por isso que o `scripts/dev.ps1` sempre
funcionou enquanto o comando cru da documentacao falhava.
"""

from __future__ import annotations

import asyncio

from app.event_loop import (
    explicar_incompatibilidade,
    fabrica_de_loop_compativel,
    loop_incompativel_com_psycopg,
    nome_do_loop_em_uso,
)


def test_reconhece_o_loop_que_o_psycopg_recusa() -> None:
    assert loop_incompativel_com_psycopg("ProactorEventLoop") is True
    assert loop_incompativel_com_psycopg("_WindowsProactorEventLoop") is True


def test_nao_acusa_o_loop_compativel() -> None:
    assert loop_incompativel_com_psycopg("SelectorEventLoop") is False
    assert loop_incompativel_com_psycopg("_UnixSelectorEventLoop") is False
    assert loop_incompativel_com_psycopg("uvloop.Loop") is False


def test_fora_de_loop_nao_acusa_incompatibilidade() -> None:
    """A deteccao roda no startup, dentro de um loop. Fora de um, nao ha o que
    acusar -- e acusar impediria importar o modulo em contexto sincrono."""
    assert nome_do_loop_em_uso() == ""
    assert loop_incompativel_com_psycopg("") is False


def test_a_comparacao_e_por_nome_e_nao_por_isinstance() -> None:
    """`ProactorEventLoop` so existe no Windows: importa-lo para comparar
    quebraria no Linux, que e onde a maior parte dos testes roda."""
    import inspect

    from app import event_loop

    fonte = inspect.getsource(event_loop)
    # A assercao busca a CHAMADA, nao a palavra: o proprio docstring do modulo
    # explica por que `isinstance` esta fora, e casar com o nome solto acusaria
    # o comentario. Mesmo erro que ja custou caro neste repo.
    assert "isinstance(" not in fonte
    assert "Proactor" in fonte


def test_a_mensagem_diz_o_que_fazer_e_nao_so_o_que_quebrou() -> None:
    """O erro cru do psycopg diz o problema e nao diz a saida; quem o encontra
    no startup nao tem por que saber que `--reload` muda o loop."""
    texto = explicar_incompatibilidade("ProactorEventLoop")

    assert "python -m app" in texto
    assert "--reload" in texto
    assert "LANGGRAPH_DB_URL" in texto
    assert "ProactorEventLoop" in texto


def test_a_mensagem_ordena_as_saidas() -> None:
    """`MemorySaver` e a ultima porque nao persiste o estado do grafo entre
    reinicios -- serve para depurar, nao como configuracao."""
    texto = explicar_incompatibilidade("ProactorEventLoop")

    assert texto.index("python -m app") < texto.index("--reload")
    assert texto.index("--reload") < texto.index("LANGGRAPH_DB_URL")


def test_a_fabrica_devolve_um_loop_selector() -> None:
    loop = fabrica_de_loop_compativel()
    try:
        assert loop_incompativel_com_psycopg(type(loop).__name__) is False
    finally:
        loop.close()


def test_a_fabrica_serve_ao_asyncio_run() -> None:
    """E o contrato: `asyncio.run(..., loop_factory=...)` chama a fabrica sem
    argumento e espera um loop novo."""

    async def quem_sou_eu() -> str:
        return nome_do_loop_em_uso()

    nome = asyncio.run(quem_sou_eu(), loop_factory=fabrica_de_loop_compativel)
    assert loop_incompativel_com_psycopg(nome) is False


def test_a_politica_morta_saiu_do_main() -> None:
    """Ela nunca teve efeito, e codigo morto com cara de solucao e pior que
    ausencia: quem lesse `main.py` concluiria que o Windows ja estava tratado."""
    import inspect

    from app import main

    fonte = inspect.getsource(main)
    # Idem: `set_event_loop_policy(` e a chamada; o comentario que substituiu a
    # funcao cita o nome de proposito, para quem ler saber por que ela nao esta
    # mais la.
    assert "_configure_windows_event_loop_policy()" not in fonte
    assert "set_event_loop_policy(" not in fonte


def test_o_checkpointer_confere_antes_de_conectar() -> None:
    """Conferir depois seria deixar o psycopg falar primeiro, e a mensagem dele
    e' a que nao ajuda."""
    import inspect

    from app.agent.graph import checkpointer

    fonte = inspect.getsource(checkpointer)
    guarda = fonte.index("loop_incompativel_com_psycopg()")
    conecta = fonte.index("AsyncConnection.connect(")
    assert guarda < conecta


def test_a_entrada_delega_o_reload_em_vez_de_recriar() -> None:
    """O supervisor de reload do uvicorn ja escolhe SelectorEventLoop e ja sabe
    respawnar processo filho. Reimplementar seria uma segunda copia."""
    import inspect

    from app import __main__ as entrada

    fonte = inspect.getsource(entrada)
    assert "uvicorn.run(" in fonte
    assert "loop_factory=fabrica_de_loop_compativel" in fonte
