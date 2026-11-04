"""`20261104_05` (#632): o arquivo do conteúdo vai para a fila do Storage e do R2 junto com a linha.

Banco descartável com o esqueleto da produção, a `retencao_fila_externa` (da `20261024_03`) e
`trailup_caminho_arquivo` como está em produção (`20261024_07`). O que se prova:

- apagar conteúdo, mídia, questão, card e personalização enfileira cada arquivo, nos dois destinos;
- a cascata (apagar o tópico) também enfileira;
- trocar a imagem enfileira só a antiga; editar outra coluna não enfileira nada;
- imagem citada dentro do texto do conteúdo entra; URL de fora não entra;
- item já processado (`ainda_referenciado`) é reaberto; item pendente fica como está;
- o cliente não chama as funções internas; o downgrade tira os gatilhos.
"""

from __future__ import annotations

import json

import pytest

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import _trecho

M = f5.modulo("20261104_05_arquivos_saem_com_o_conteudo.py")

FILA = _trecho(
    "20261024_03_retencao_e_expurgo.py", "CREATE TABLE IF NOT EXISTS public.retencao_fila_externa (", "\n);"
)
# Como em produção. No arquivo da migration o ":" do regex vem escapado para o `text()` do
# SQLAlchemy; aqui o SQL vai direto ao psycopg, então o escape sai.
CAMINHO = _trecho(
    "20261024_07_exclusao_professor_e_aviso_inatividade.py",
    "CREATE OR REPLACE FUNCTION public.trailup_caminho_arquivo(p text)",
    "$function$;",
).replace("\\:", ":")

GATEWAY = "https://x.supabase.co/functions/v1/storage-redirect?path="


def _banco(*depois: str):
    return f5.banco(FILA, CAMINHO, *f5.sql_de(M), *depois)


def _semear(c) -> None:
    f5.semear_turma(c)
    for tabela in ("conteudos", "midias", "cards", "questoes", "atividades", "conteudo_personalizado"):
        f5.afrouxa(c, tabela)
    c.execute("INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (500, 10, 'Quiz')")


def _conteudo(c, id_: int, conteudo: str | None, metadata: dict | None = None, topico: int = 10) -> None:
    c.execute(
        "INSERT INTO public.conteudos (id, topico_id, titulo, tipo, conteudo, metadata) OVERRIDING SYSTEM VALUE"
        " VALUES (%s, %s, 't', 'arquivo', %s, %s)",
        (id_, topico, conteudo, json.dumps(metadata) if metadata is not None else None),
    )


def _fila(c) -> set[tuple[str, str, str]]:
    return {
        (r[0], r[1], r[2])
        for r in c.execute("SELECT destino, bucket, caminho FROM public.retencao_fila_externa WHERE processado_em IS NULL")
    }


def _nos_dois(caminho: str, bucket: str = "conteudos") -> set[tuple[str, str, str]]:
    return {("storage", bucket, caminho), ("r2", "", caminho)}


@f5.e2e
def test_apagar_conteudo_enfileira_cada_arquivo() -> None:
    with _banco() as c:
        _semear(c)
        _conteudo(
            c, 1, "prof/10/aula.pdf",
            {"files": [{"path": "prof/10/anexo.docx"}, {"path": f"{GATEWAY}prof/10/via-gateway.png"}],
             "media_storage_path": "prof/10/video.mp4"},
        )
        texto = (
            "Veja ![fig](" + GATEWAY + "prof/10/figura.png) e"
            " ![b](https://x.supabase.co/storage/v1/object/public/conteudos/prof/10/antiga.jpg)"
            " e ![fora](https://outro.site/imagem.png)"
        )
        _conteudo(c, 2, texto)
        assert _fila(c) == set()

        c.execute("DELETE FROM public.conteudos WHERE id IN (1, 2)")

        esperado = set()
        for caminho in ("prof/10/aula.pdf", "prof/10/anexo.docx", "prof/10/via-gateway.png", "prof/10/video.mp4",
                        "prof/10/figura.png", "prof/10/antiga.jpg"):
            esperado |= _nos_dois(caminho)
        assert _fila(c) == esperado
        ref = c.execute("SELECT DISTINCT ref FROM public.retencao_fila_externa").fetchall()
        assert ref == [({"tabela": "conteudos", "motivo": "conteudo_apagado"},)]


@f5.e2e
def test_cascata_do_topico_enfileira_midia_card_e_conteudo() -> None:
    with _banco() as c:
        _semear(c)
        _conteudo(c, 1, "prof/10/aula.pdf")
        c.execute("INSERT INTO public.midias (conteudo_id, tipo, url) VALUES (1, 'imagem', 'prof/10/midia.png')")
        c.execute("INSERT INTO public.cards (conteudo_id, imagem_url) VALUES (1, %s)", (GATEWAY + "prof/10/card.png",))

        c.execute("DELETE FROM public.topicos WHERE id = 10")

        assert _fila(c) == (
            _nos_dois("prof/10/aula.pdf") | _nos_dois("prof/10/midia.png") | _nos_dois("prof/10/card.png")
        )


@f5.e2e
def test_trocar_a_imagem_enfileira_so_a_antiga() -> None:
    with _banco() as c:
        _semear(c)
        _conteudo(c, 1, "prof/10/aula.pdf")
        c.execute("INSERT INTO public.cards (id, conteudo_id, imagem_url, titulo) VALUES (7, 1, 'prof/10/v1.png', 'a')")
        c.execute(
            "INSERT INTO public.questoes (id, atividade_id, enunciado, midia_url) OVERRIDING SYSTEM VALUE"
            " VALUES (900, 500, 'Q', 'prof/q/som.mp3')"
        )

        c.execute("UPDATE public.cards SET titulo = 'b' WHERE id = 7")
        c.execute("UPDATE public.conteudos SET titulo = 'outro' WHERE id = 1")
        assert _fila(c) == set()

        c.execute("UPDATE public.cards SET imagem_url = 'prof/10/v2.png' WHERE id = 7")
        c.execute("UPDATE public.questoes SET midia_url = NULL WHERE id = 900")
        assert _fila(c) == _nos_dois("prof/10/v1.png") | _nos_dois("prof/q/som.mp3")


@f5.e2e
def test_personalizacao_vai_para_o_bucket_do_aluno() -> None:
    with _banco() as c:
        _semear(c)
        materiais = {
            "audio": {"storage_path": "aluno/1/audio.mp3", "revisao": 1},
            "apresentacao": {"partes": [{"storage_path": "aluno/1/deck-1.html"}, {"storage_path": "aluno/1/deck-2.html"}]},
            "markdown": {"conteudo": "texto sem arquivo"},
        }
        c.execute(
            "INSERT INTO public.conteudo_personalizado (classe_id, topico_id, ciclo_id, materiais)"
            " VALUES (1, 10, 'c', %s)",
            (json.dumps(materiais),),
        )
        # Regerar no mesmo caminho (só a revisão muda) não enfileira nada.
        materiais["audio"]["revisao"] = 2
        c.execute("UPDATE public.conteudo_personalizado SET materiais = %s", (json.dumps(materiais),))
        assert _fila(c) == set()

        materiais["apresentacao"]["partes"] = [{"storage_path": "aluno/1/deck-novo.html"}]
        c.execute("UPDATE public.conteudo_personalizado SET materiais = %s", (json.dumps(materiais),))
        assert _fila(c) == _nos_dois("aluno/1/deck-1.html", "conteudo_aluno") | _nos_dois(
            "aluno/1/deck-2.html", "conteudo_aluno"
        )

        c.execute("DELETE FROM public.conteudo_personalizado")
        assert ("storage", "conteudo_aluno", "aluno/1/audio.mp3") in _fila(c)
        assert ("r2", "", "aluno/1/deck-novo.html") in _fila(c)


@f5.e2e
def test_item_processado_e_reaberto_e_pendente_fica_como_esta() -> None:
    with _banco() as c:
        _semear(c)
        _conteudo(c, 1, "prof/10/compartilhado.pdf")
        _conteudo(c, 2, "prof/10/pendente.pdf")
        # A turma original saiu antes e o arquivo estava na cópia: o worker marcou "ainda_referenciado".
        c.execute(
            "INSERT INTO public.retencao_fila_externa (destino, bucket, caminho, criado_em, tentativas, processado_em,"
            " resultado) VALUES ('storage', 'conteudos', 'prof/10/compartilhado.pdf', now() - interval '9 days', 1,"
            " now() - interval '9 days', 'ainda_referenciado'),"
            " ('r2', '', 'prof/10/pendente.pdf', now() - interval '1 hour', 3, NULL, NULL)"
        )

        c.execute("DELETE FROM public.conteudos")

        reaberto = c.execute(
            "SELECT processado_em, resultado, tentativas, criado_em > now() - interval '1 minute'"
            " FROM public.retencao_fila_externa WHERE destino = 'storage' AND caminho = 'prof/10/compartilhado.pdf'"
        ).fetchone()
        assert reaberto == (None, None, 0, True)
        pendente = c.execute(
            "SELECT tentativas, criado_em < now() - interval '30 minutes'"
            " FROM public.retencao_fila_externa WHERE destino = 'r2' AND caminho = 'prof/10/pendente.pdf'"
        ).fetchone()
        assert pendente == (3, True)


@pytest.mark.parametrize("papel", ["anon", "authenticated"])
@f5.e2e
def test_cliente_nao_chama_as_funcoes_internas(papel: str) -> None:
    import psycopg

    with _banco() as c:
        for sql in (
            "SELECT public.trailup_enfileirar_arquivos(ARRAY['x/y'], 'conteudos', 't')",
            "SELECT * FROM public.trailup_caminhos_do_conteudo('x/y', NULL)",
            "SELECT * FROM public.trailup_caminhos_da_personalizacao('{}'::jsonb)",
        ):
            c.execute("BEGIN")
            c.execute(f"SET LOCAL ROLE {papel}")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(sql)
            c.execute("ROLLBACK")


@f5.e2e
def test_downgrade_tira_os_gatilhos() -> None:
    with _banco(*f5.sql_de(M, "downgrade")) as c:
        _semear(c)
        _conteudo(c, 1, "prof/10/aula.pdf")
        c.execute("DELETE FROM public.conteudos")
        assert _fila(c) == set()
        assert c.execute("SELECT to_regprocedure('public.trailup_enfileirar_arquivos(text[], text, text)')").fetchone() == (
            None,
        )
