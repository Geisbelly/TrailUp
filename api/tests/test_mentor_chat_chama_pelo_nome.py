"""O guia do aluno chama pelo primeiro nome de vez em quando, sem o nome ir ao modelo.

O modelo escreve `{{nome}}` e a API troca pelo primeiro nome na volta (`restaurar_nome`). O prompt
já permitia, mas não pedia, e o guia quase nunca usava.
"""

from pathlib import Path

from app.services.pseudonimizacao import pseudonimizar_nome_proprio, restaurar_nome

PROMPT = Path(__file__).resolve().parents[1] / "app" / "agent" / "prompts" / "mentor_personalizacao_chat.txt"


def test_prompt_pede_o_nome_as_vezes_e_nao_sempre() -> None:
    texto = PROMPT.read_text(encoding="utf-8")
    assert "DE VEZ EM QUANDO" in texto
    assert "Tudo bem, {{nome}}?" in texto
    assert "No maximo uma vez por resposta" in texto
    assert "nao em respostas seguidas" in texto


def test_saudacao_com_placeholder_vira_o_primeiro_nome() -> None:
    assert restaurar_nome("Tudo bem, {{nome}}?", "Ana Clara Souza") == "Tudo bem, Ana?"


def test_historico_com_o_nome_volta_ao_modelo_como_placeholder() -> None:
    # A regra "nao em respostas seguidas" depende disso: o modelo ve que ja usou.
    assert pseudonimizar_nome_proprio("Tudo bem, Ana?", "Ana Clara Souza", None) == "Tudo bem, {{nome}}?"
