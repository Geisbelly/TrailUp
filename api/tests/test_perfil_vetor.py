"""Regra única do vetor BrainHex na API, em paridade com o app e o SQL.

Antes cada módulo decidia o "dominante" do seu jeito: `max()` (empate = primeiro da lista,
padrão Achiever), comparação com rótulo capitalizado contra o nome minúsculo do banco, e
listas de cronômetro e batalha diferentes das do app.
"""

import re
from pathlib import Path

import pytest

from app.services import perfil_vetor
from app.services.perfil_vetor import (
    LIMIAR_REPRESENTATIVO,
    PERFIL_PADRAO,
    PERFIS_COM_BATALHA,
    PERFIS_COM_CRONOMETRO,
    dominante,
    ordenar,
    rotulo,
    tem_sinal,
)

MOBILE = Path(__file__).resolve().parents[2] / "mobile/src/utils"


def test_ordena_por_afinidade_e_desempata_pelo_nome() -> None:
    perfis = [
        {"perfil": "seeker", "afinidade": 17},
        {"perfil": "Achiever", "afinidade": 17},
        {"perfil": "conqueror", "afinidade": 13},
    ]
    assert [chave for chave, _ in ordenar(perfis)] == ["achiever", "seeker", "conqueror"]


def test_canoniza_socialiser_e_descarta_nome_desconhecido() -> None:
    perfis = [{"perfil": "Socialiser", "afinidade": 30}, {"nome": "hacker", "afinidade": 90}]
    assert ordenar(perfis) == [("socializer", 30.0)]


def test_repetido_fica_com_o_maior_valor() -> None:
    assert ordenar([{"perfil": "seeker", "afinidade": 5}, {"perfil": "Seeker", "afinidade": 12}]) == [("seeker", 12.0)]


@pytest.mark.parametrize(
    "perfis",
    [None, [], [{"perfil": nome, "afinidade": 0} for nome in ["Seeker", "Socialiser", "Achiever"]]],
)
def test_sem_afinidade_positiva_o_dominante_e_o_padrao(perfis) -> None:
    # `context.py` manda os 7 perfis zerados para aluno sem `aluno_perfil`; o `max()` antigo
    # devolvia o primeiro da lista ("Seeker"), e o app e o SQL tratam esse aluno como mastermind.
    assert dominante(perfis) == PERFIL_PADRAO == "mastermind"


def test_empate_no_topo_resolve_pelo_nome() -> None:
    assert dominante([{"perfil": "seeker", "afinidade": 17}, {"perfil": "achiever", "afinidade": 17}]) == "achiever"


def test_segundo_lugar_e_sinal_mesmo_abaixo_do_limiar() -> None:
    perfis = [
        {"perfil": "seeker", "afinidade": 14},
        {"perfil": "daredevil", "afinidade": 40},
        {"perfil": "conqueror", "afinidade": 15},
    ]
    assert tem_sinal(perfis, "Daredevil")
    assert tem_sinal(perfis, "conqueror")  # 2º lugar com afinidade > 0
    assert not tem_sinal(perfis, "seeker")  # 3º lugar e < 20
    assert not tem_sinal(perfis, "achiever")  # ausente


def test_terceiro_lugar_e_sinal_so_com_o_limiar() -> None:
    perfis = [
        {"perfil": "daredevil", "afinidade": 40},
        {"perfil": "achiever", "afinidade": 30},
        {"perfil": "survivor", "afinidade": 20},
        {"perfil": "seeker", "afinidade": 10},
    ]
    assert tem_sinal(perfis, "survivor")  # 3º lugar, mas >= 20
    assert not tem_sinal(perfis, "seeker")


def test_segundo_lugar_zerado_nao_e_sinal() -> None:
    assert not tem_sinal([{"perfil": "seeker", "afinidade": 40}, {"perfil": "survivor", "afinidade": 0}], "survivor")


def test_rotulo_usa_a_grafia_do_banco() -> None:
    assert rotulo("socialiser") == "Socializer"
    assert rotulo("MASTERMIND") == "Mastermind"
    assert rotulo("hacker") is None


def _conjunto_do_app(arquivo: str, nome: str) -> set[str]:
    fonte = (MOBILE / arquivo).read_text(encoding="utf-8")
    bloco = re.search(rf"{nome} = new Set<BrainHexProfile>\(\[(.*?)\]\)", fonte, re.S)
    assert bloco, f"{nome} sumiu de {arquivo}: confira onde a regra passou a ser decidida"
    return set(re.findall(r'"(\w+)"', bloco.group(1)))


def test_perfis_com_cronometro_batem_com_o_app() -> None:
    assert PERFIS_COM_CRONOMETRO == _conjunto_do_app("brainHexCapabilities.ts", "TIMER_PROFILES")


def test_perfis_com_batalha_batem_com_o_app() -> None:
    assert PERFIS_COM_BATALHA == _conjunto_do_app("brainHexCapabilities.ts", "BATTLE_PROFILES")


def test_limiar_e_posicao_secundaria_batem_com_o_app() -> None:
    fonte = (MOBILE / "brainHex.ts").read_text(encoding="utf-8")
    limiar = re.search(r"const DEFAULT_SIGNAL_THRESHOLD = (\d+);", fonte)
    secundario = re.search(r"const SECONDARY_SIGNAL_INDEX = (\d+);", fonte)
    padrao = re.search(r'export const PERFIL_PADRAO: BrainHexProfile = "(\w+)";', fonte)
    assert limiar and secundario and padrao, "constantes do vetor mudaram de nome em brainHex.ts"
    assert LIMIAR_REPRESENTATIVO == int(limiar.group(1))
    assert perfil_vetor.POSICAO_SECUNDARIA == int(secundario.group(1))
    assert PERFIL_PADRAO == padrao.group(1)


def test_cronometro_do_banco_usa_a_mesma_lista() -> None:
    # `fn_cronometro_ligado` é gerada a partir desta tupla da migration.
    fonte = (Path(__file__).resolve().parents[1] / "alembic/versions/20261101_13_tentativas_com_tempo_do_servidor.py").read_text(
        encoding="utf-8"
    )
    tupla = re.search(r"^PERFIS_COM_CRONOMETRO = \((.*?)\)", fonte, re.M)
    assert tupla, "PERFIS_COM_CRONOMETRO sumiu da migration do cronômetro"
    assert set(re.findall(r'"(\w+)"', tupla.group(1))) == PERFIS_COM_CRONOMETRO
