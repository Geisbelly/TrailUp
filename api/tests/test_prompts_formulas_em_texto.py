"""Os prompts que escrevem material do aluno pedem fórmula em texto corrido (#652).

O mobile já converte LaTeX na leitura (#588), mas o roteiro de áudio vai para o
TTS e a apresentação para o BrainHexPDF, que não passam por aquele conversor.
Pedir texto corrido na origem cobre os três formatos. O microservice tem a mesma
regra em `FORMULA_AS_PLAIN_TEXT_RULE` (`geminiService.ts`).
"""

from __future__ import annotations

import pytest

from app.services.llm import load_prompt

PROMPTS_DO_MATERIAL = ("gerador_conteudo.txt", "pipeline_midia_etapas.txt")


@pytest.mark.parametrize("nome", PROMPTS_DO_MATERIAL)
def test_prompt_do_material_proibe_latex_e_pede_texto_corrido(nome: str) -> None:
    prompt = load_prompt(nome)

    assert "Fórmulas e matemática em texto corrido, em todos os formatos" in prompt
    assert "NUNCA use LaTeX" in prompt
    # Os exemplos do que fazer, para o modelo não trocar LaTeX por outra marcação.
    assert "`x² + 3x = 0`" in prompt and "`a ≠ 0`" in prompt
    # Áudio é falado: fórmula com símbolo vira leitura estranha no TTS.
    assert "No roteiro de áudio, escreva\n    por extenso" in prompt
    # `$` é moeda: a regra não pode fazer o modelo evitar "R$".
    assert "R$ 1.200" in prompt


def test_os_dois_prompts_tem_a_mesma_regra() -> None:
    # Fallback Python e etapas da pipeline geram o mesmo material; regras
    # divergentes dariam texto diferente conforme o caminho que rodou.
    def regra(prompt: str) -> str:
        inicio = prompt.index("Fórmulas e matemática em texto corrido")
        fim = prompt.index("R$ 1.200).", inicio)
        return prompt[inicio:fim]

    gerador, pipeline = (load_prompt(nome) for nome in PROMPTS_DO_MATERIAL)
    assert regra(gerador) == regra(pipeline)
