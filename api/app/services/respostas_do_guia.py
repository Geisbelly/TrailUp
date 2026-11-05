"""Perguntas sobre onde fica uma tela do app, respondidas sem chamar o modelo.

Só casa a frase inteira e curta, com verbo de navegação e o nome da tela: "onde fica a loja" entra,
"não consigo comprar na loja" vai ao modelo. Errar para o lado do modelo custa uma chamada; errar para
o lado da regra dá ao aluno uma resposta que não é a dele. Na dúvida, não casa.

Os textos resumem `guia_do_app_aluno.md`: ao mudar uma tela, mude o trecho dela lá e aqui. Saem sem a
voz do Guardião, de propósito: quem pergunta onde fica a Loja quer o botão.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.schemas.mentor_chat import MentorChatLLMResult

MAX_PERGUNTA = 60

_SAUDACAO = r"(?:(?:oi|ola|opa|e ai|bom dia|boa tarde|boa noite|por favor|guardiao|guia)\s+)*"
_NAVEGAR = (
    r"(?:onde (?:e que )?(?:fica|ficam|esta|estao|vejo|acho|encontro|abro|acesso)"
    r"|como (?:e que )?(?:eu )?(?:abro|acesso|vejo|acho|encontro|entro|chego|vou)"
    r"|como (?:eu )?(?:faco|posso|consigo)(?: para| pra)? (?:abrir|acessar|ver|achar|encontrar|entrar|chegar|ir)"
    r"|cade|me (?:leva|mostra|mostre)|quero (?:abrir|ver|ir))"
)
_RECHEIO = r"(?:\s+(?:a|o|as|os|na|no|nas|nos|em|para|pra|ao|minha|meu|minhas|meus|tela|aba|menu|pagina|de|do|da))*"
_COMO = r"como (?:e que )?(?:eu )?(?:(?:faco|posso|consigo)(?: para| pra)? )?"
_FIM = r"(?:\s+(?:no app|do app|aqui|por favor))?"


@dataclass(frozen=True)
class RespostaPronta:
    texto: str
    destino: str
    tutorial: str
    # Depois de um verbo de navegação.
    telas: tuple[str, ...]
    # Depois de "como": a ação inteira, para "como desligo as notificações" não virar "onde ficam".
    acoes: tuple[str, ...] = ()


_RESPOSTAS = (
    RespostaPronta(
        "A Loja fica no Perfil. Nela você gasta as moedas ganhas estudando, e o item comprado vai para a Bag.",
        "perfil.loja",
        "gastar_moedas",
        ("loja",),
        (r"(?:gasto|gastar|uso|usar) (?:as |minhas )?moedas",),
    ),
    RespostaPronta(
        "A Biblioteca de conquistas fica no Perfil. Ela mostra as concluídas, as em progresso e as bloqueadas, "
        "com o que falta.",
        "perfil.conquistas",
        "ver_conquistas",
        ("conquistas", "biblioteca de conquistas"),
    ),
    RespostaPronta(
        "As Molduras ficam no Perfil. Umas se compram, outras saem ao concluir conquistas.",
        "perfil.molduras",
        "",
        ("molduras",),
    ),
    RespostaPronta(
        "O Estilo das métricas fica no Perfil. Ele muda só a aparência do painel de métricas.",
        "perfil.metricas",
        "mudar_metricas",
        ("estilo das metricas",),
    ),
    RespostaPronta(
        "O Modo foco fica no Perfil, em Modo foco e avisos. Com ele ligado, nenhuma notificação chega; ao sair, "
        "vem só a mais recente de cada tipo.",
        "perfil.modo_foco",
        "modo_foco",
        ("modo foco",),
        (r"(?:ligo|ligar|ativo|ativar|desligo|desligar) o modo foco",),
    ),
    RespostaPronta(
        "O Lembrete diário fica no Perfil. Nele você escolhe o horário em que o app avisa para continuar a estudar.",
        "perfil.lembrete",
        "lembrete_diario",
        ("lembrete", "lembrete diario"),
        (r"(?:mudo|mudar|configuro|configurar) o lembrete(?: diario)?",),
    ),
    RespostaPronta(
        "Coleta e acessos fica no Perfil. Ali você liga e desliga câmera, uso, desempenho e chat do mentor. "
        "A câmera é opcional e desligá-la não bloqueia aulas, atividades ou notas.",
        "perfil.coleta",
        "controlar_coleta",
        ("coleta", "coleta e acessos"),
        (r"(?:ligo|ligar|desligo|desligar) a camera",),
    ),
    RespostaPronta(
        "Gerar relatório dos dados fica no Perfil. Ele monta um PDF com seus dados, e gerar não altera nada.",
        "perfil.relatorio",
        "gerar_relatorio",
        ("relatorio", "relatorio dos dados"),
        (r"(?:gero|gerar) (?:o |meu )?relatorio(?: dos dados)?",),
    ),
    RespostaPronta(
        "Reportar um erro fica no Perfil. Conte para a equipe o que aconteceu e em que tela.",
        "perfil.erro",
        "",
        (),
        (r"(?:reporto|reportar) (?:um )?(?:erro|bug)",),
    ),
    RespostaPronta(
        "Redefinir senha fica no Perfil. O app manda um link por e-mail; olhe também o spam.",
        "perfil.senha",
        "",
        (),
        (r"(?:troco|trocar|mudo|mudar|redefino|redefinir) (?:a |minha )?senha",),
    ),
    RespostaPronta(
        "Solicitar exclusão da conta fica no Perfil. O pedido é registrado e a confirmação vem por e-mail.",
        "perfil.excluir",
        "",
        (),
        (r"(?:excluo|excluir|apago|apagar) (?:a |minha )?conta",),
    ),
    RespostaPronta(
        "O Ranking é uma das abas do app. Ele fica com cadeado até você concluir o primeiro tópico, mas a posição "
        "já conta desde o começo.",
        "ranking",
        "ver_ranking",
        ("ranking",),
    ),
    RespostaPronta(
        "As Notificações são uma das abas do app. Tocar num aviso abre ele, e os filtros separam lidas e não lidas.",
        "notificacoes",
        "ler_notificacoes",
        ("notificacoes", "avisos"),
    ),
    RespostaPronta(
        "O Social é uma das abas do app, com amizades, guildas e desafios. Ele fica com cadeado até você concluir "
        "o primeiro conteúdo.",
        "social",
        "fazer_amizades",
        ("social", "amizades", "guildas"),
    ),
)


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def _normalizar(mensagem: str) -> str:
    limpo = re.sub(r"[?!.,;:]", " ", _sem_acento(mensagem).casefold())
    return " ".join(limpo.split())


def _padrao(resposta: RespostaPronta) -> re.Pattern[str]:
    opcoes = []
    if resposta.telas:
        telas = "|".join(sorted(resposta.telas, key=len, reverse=True))
        opcoes.append(rf"{_NAVEGAR}{_RECHEIO}\s+(?:{telas})")
    if resposta.acoes:
        opcoes.append(rf"{_COMO}(?:{'|'.join(resposta.acoes)})")
    return re.compile(rf"{_SAUDACAO}(?:{'|'.join(opcoes)}){_FIM}")


_PADROES = tuple((_padrao(resposta), resposta) for resposta in _RESPOSTAS)


def resposta_sem_modelo(mensagem: str) -> MentorChatLLMResult | None:
    if len(mensagem) > MAX_PERGUNTA:
        return None
    pergunta = _normalizar(mensagem)
    for padrao, resposta in _PADROES:
        if padrao.fullmatch(pergunta):
            return MentorChatLLMResult(reply=resposta.texto, destinos=[resposta.destino], tutorial=resposta.tutorial)
    return None
