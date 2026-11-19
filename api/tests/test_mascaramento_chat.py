"""O registro de cada pergunta ao Guia não leva dado pessoal (20261118_01)."""

from __future__ import annotations

from app.schemas.mentor_chat import MentorChatLLMResult, RegistroDaConversa
from app.services.mascaramento_chat import (
    MIN_ALUNOS_TURMA,
    mascarar,
    nomes_para_mascarar,
    normalizar_registro,
    registro_de_navegacao,
    resumir_memoria,
    resumir_turma,
)

TURMA = nomes_para_mascarar([{"nome": "Ana Clara Souza", "apelido": "Cacau"}, {"nome": "João Pedro"}])


def test_mascara_contato_documento_link_e_usuario() -> None:
    texto = (
        "me chama no (11) 98765-4321 ou ana@exemplo.com, CPF 123.456.789-09, "
        "olha https://x.com/a e @ana.souza, matrícula 20261118"
    )
    saida = mascarar(texto)
    for vazado in ("98765", "ana@exemplo.com", "123.456", "https://", "@ana.souza", "20261118"):
        assert vazado not in saida
    for marca in ("[telefone]", "[email]", "[documento]", "[link]", "[usuario]", "[numero]"):
        assert marca in saida


def test_mascara_nome_dos_colegas_sem_diferenciar_acento_nem_caixa() -> None:
    saida = mascarar("o joao e a ANA CLARA me explicaram, e a Cacau também", TURMA)
    assert "joao" not in saida.lower()
    assert "ana" not in saida.lower()
    assert "cacau" not in saida.lower()
    assert saida.count("[nome]") == 3


def test_nome_nao_casa_dentro_de_outra_palavra() -> None:
    assert mascarar("análise de função", TURMA) == "análise de função"


def test_placeholder_do_nome_vira_marca() -> None:
    assert mascarar("dúvida do {{nome}} em frações") == "dúvida do [nome] em frações"


def test_normaliza_valores_fora_da_lista_em_vez_de_falhar() -> None:
    registro = normalizar_registro({"intencao": "QUALQUER", "dificuldade": "muita", "assunto": "  "})
    assert registro.intencao == "outro"
    assert registro.dificuldade == "nenhuma"
    assert registro.assunto is None


def test_conceito_com_nome_sai_e_os_outros_ficam_unicos_e_limitados() -> None:
    registro = normalizar_registro(
        RegistroDaConversa(
            intencao="duvida_materia",
            assunto="Frações equivalentes que a Ana Clara não entendeu",
            conceitos=["Frações", "frações", "dúvida da Ana", "mmc", "numerador", "denominador", "razão", "extra"],
            dificuldade="travado",
        ),
        TURMA,
    )
    assert registro.intencao == "duvida_materia"
    assert registro.dificuldade == "travado"
    assert "Ana" not in (registro.assunto or "")
    assert "[nome]" in (registro.assunto or "")
    assert registro.conceitos == ["frações", "mmc", "numerador", "denominador", "razão"]


def test_assunto_que_so_tinha_dado_pessoal_some() -> None:
    assert normalizar_registro({"assunto": "Ana Clara (11) 98765-4321"}, TURMA).assunto is None


def test_assunto_e_cortado_no_limite_da_tabela() -> None:
    assert len(normalizar_registro({"assunto": "a " * 200}).assunto or "") <= 120


def test_navegacao_registra_a_tela() -> None:
    registro = registro_de_navegacao(["perfil.loja"])
    assert (registro.intencao, registro.assunto) == ("navegacao_app", "onde fica: perfil.loja")


def test_registro_e_obrigatorio_no_schema_do_modelo_e_tem_default_no_pydantic() -> None:
    schema = MentorChatLLMResult.model_json_schema()
    assert "registro" in schema["required"]
    sem_registro = MentorChatLLMResult.model_validate({"reply": "oi"})
    assert sem_registro.registro.intencao == "outro"


def test_memoria_prioriza_o_topico_atual_e_conta_pedidos_de_resposta() -> None:
    linhas = [
        {"topico_id": 7, "intencao": "duvida_materia", "assunto": "mmc", "conceitos": ["mmc"], "dificuldade": "travado"},
        {"topico_id": 9, "intencao": "duvida_materia", "assunto": "mitose", "conceitos": ["mitose"], "dificuldade": "alguma"},
        {"topico_id": 7, "intencao": "pedido_resposta", "assunto": None, "conceitos": [], "dificuldade": "nenhuma"},
        {"topico_id": 7, "intencao": "duvida_materia", "assunto": "mmc", "conceitos": ["mmc"], "dificuldade": "nenhuma"},
    ]
    memoria = resumir_memoria(linhas, 7)
    assert memoria["conceitos_com_dificuldade"][0] == "mmc"
    assert memoria["duvidas_recentes_neste_topico"] == ["mmc"]
    assert memoria["pedidos_de_resposta"] == 1
    assert memoria["travou_neste_topico"] is True
    assert memoria["perguntas_recentes"] == 4


def test_memoria_vazia_e_primeira_conversa() -> None:
    assert resumir_memoria([], 7) == {}


def test_turma_so_mostra_conceito_de_varios_alunos() -> None:
    linhas = [{"conceito": "mmc", "alunos": MIN_ALUNOS_TURMA}, {"conceito": "razão", "alunos": MIN_ALUNOS_TURMA - 1}]
    assert resumir_turma(linhas) == ["mmc"]
