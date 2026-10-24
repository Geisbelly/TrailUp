"""#522: quando áudio ou apresentação não saem, o motivo tem de aparecer.

A investigação da issue parou porque a mensagem dizia só QUAIS tipos faltavam
(`"midias obrigatorias nao geradas: audio, apresentacao"`) e nenhum log dizia por quê —
embora o registro tivesse `audio.metadata.status = "failed"` gravado ali do lado.

A função colapsava quatro causas diferentes no mesmo nome:

| causa | o que se via antes |
| --- | --- |
| material nunca persistido | "audio" |
| gerador falhou (`status: failed`) | "audio" |
| geração velha (`generation_key` diferente) | "audio" |
| versão do motor de deck mudou | "apresentacao" |

Separá-las é o conserto. Estes testes travam cada uma.
"""

import logging

import pytest

from app.services.personalizacao_jobs import (
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_DESIGN_VERSION,
    PRESENTATION_ENGINE_VERSION,
    _assert_brainhex_media_completed,
    _incomplete_brainhex_media_for_generation,
    _motivos_de_midia_incompleta,
)

CHAVE = "ciclo-1:hash-1"


def _material(**metadata):
    return {"metadata": {"generation_key": CHAVE, "status": "completed", **metadata}}


def _apresentacao_ok(**extra):
    # `extra` sobrescreve: e' assim que cada teste troca UM campo de versao.
    versoes = {
        "engine": PRESENTATION_ENGINE_VERSION,
        "design_system": PRESENTATION_DESIGN_VERSION,
        "media_pipeline_version": MEDIA_PIPELINE_VERSION,
    }
    return _material(**{**versoes, **extra})


def _registro(materiais):
    return {"id": 42, "materiais": materiais}


def _completo():
    return _registro(
        {"audio": _material(), "markdown": _material(), "apresentacao": _apresentacao_ok()}
    )


def test_tudo_pronto_nao_tem_motivo() -> None:
    assert _motivos_de_midia_incompleta(_completo(), generation_key=CHAVE) == {}


def test_gerador_que_falhou_diz_o_status_e_o_erro() -> None:
    """É o caso exato de #522: `status: failed` estava no registro e não aparecia em lugar
    nenhum. `media_pipeline` grava o motivo em `metadata["error"]` quando o conhece."""
    registro = _completo()
    registro["materiais"]["audio"] = _material(status="failed", error="TTS recusou a voz")

    motivos = _motivos_de_midia_incompleta(registro, generation_key=CHAVE)
    assert set(motivos) == {"audio"}
    assert "failed" in motivos["audio"]
    assert "TTS recusou a voz" in motivos["audio"]


def test_falha_sem_motivo_registrado_diz_que_nao_ha_motivo() -> None:
    # Pior que um motivo ruim e' um motivo vazio parecendo ausencia de problema.
    registro = _completo()
    registro["materiais"]["audio"] = _material(status="failed")

    motivo = _motivos_de_midia_incompleta(registro, generation_key=CHAVE)["audio"]
    assert "sem motivo registrado" in motivo


def test_material_que_nunca_foi_persistido_nao_se_confunde_com_falha() -> None:
    registro = _completo()
    del registro["materiais"]["apresentacao"]

    motivo = _motivos_de_midia_incompleta(registro, generation_key=CHAVE)["apresentacao"]
    assert "sem metadata" in motivo
    assert "status" not in motivo, "nao pode parecer que o gerador respondeu"


def test_geracao_antiga_diz_as_duas_chaves() -> None:
    """Sem as duas, quem le nao sabe se a velha e' a do registro ou a esperada."""
    registro = _completo()
    registro["materiais"]["audio"] = _material(generation_key="ciclo-0:hash-0")

    motivo = _motivos_de_midia_incompleta(registro, generation_key=CHAVE)["audio"]
    assert "ciclo-0:hash-0" in motivo and CHAVE in motivo


def test_versao_do_deck_diz_qual_campo_divergiu() -> None:
    registro = _completo()
    registro["materiais"]["apresentacao"] = _apresentacao_ok(engine="motor-antigo")

    motivo = _motivos_de_midia_incompleta(registro, generation_key=CHAVE)["apresentacao"]
    assert "engine" in motivo and "motor-antigo" in motivo
    assert "design_system" not in motivo, "so' o campo que divergiu entra"


def test_a_versao_so_e_cobrada_da_apresentacao() -> None:
    # Audio e markdown nao tem motor de deck; cobrar versao deles reprovaria material bom.
    registro = _completo()
    registro["materiais"]["audio"] = _material(engine="qualquer-coisa")
    assert _motivos_de_midia_incompleta(registro, generation_key=CHAVE) == {}


def test_a_lista_antiga_continua_funcionando() -> None:
    """Três pontos do código chamam a lista de tipos; o motivo é extra, não substituto."""
    registro = _completo()
    registro["materiais"]["audio"] = _material(status="failed")

    assert _incomplete_brainhex_media_for_generation(registro, generation_key=CHAVE) == ["audio"]


# --- A mensagem que a pessoa vê -------------------------------------------------------
#
# Os testes acima cobrem a função pura. Sem os dois abaixo, tirar o motivo DA MENSAGEM
# passaria despercebido — e a mensagem é justamente o que faltou em #522.

def _registro_para_assert(materiais):
    return {"id": 42, "ciclo_id": "ciclo-1", "source_hash": "hash-1", "status": "pronto", "materiais": materiais}


def test_a_excecao_carrega_o_motivo_e_nao_so_o_tipo() -> None:
    materiais = _completo()["materiais"]
    materiais["audio"] = _material(status="failed", error="TTS recusou a voz")

    with pytest.raises(RuntimeError) as erro:
        _assert_brainhex_media_completed(
            _registro_para_assert(materiais),
            ciclo_id="ciclo-1",
            source_hash="hash-1",
            generation_key=CHAVE,
        )

    mensagem = str(erro.value)
    assert "audio" in mensagem
    assert "failed" in mensagem, "a mensagem voltou a dizer so' o tipo"
    assert "TTS recusou a voz" in mensagem


def test_o_motivo_tambem_vai_para_o_log(caplog) -> None:
    """A exceção some no `error_count` do job; o log é o que fica para investigar depois."""
    materiais = _completo()["materiais"]
    materiais["apresentacao"] = _apresentacao_ok(engine="motor-antigo")

    with caplog.at_level(logging.WARNING, logger="app.services.personalizacao_jobs"):
        with pytest.raises(RuntimeError):
            _assert_brainhex_media_completed(
                _registro_para_assert(materiais),
                ciclo_id="ciclo-1",
                source_hash="hash-1",
                generation_key=CHAVE,
            )

    registrado = "\n".join(r.getMessage() for r in caplog.records)
    assert "apresentacao" in registrado
    assert "motor-antigo" in registrado, "o log precisa dizer o que divergiu"
