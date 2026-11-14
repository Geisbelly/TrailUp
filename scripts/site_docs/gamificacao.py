"""Página de gamificação e personalização: desenho, paleta, biblioteca de elementos e evidências.

Quatro fontes, e a página diz qual é qual:

- **Código:** paleta, guias e capacidades vêm de ``guardioes.ler_guardioes``; as artes vêm do app e são
  conferidas contra o catálogo. Se faltar arte de moldura, a geração para em vez de publicar buraco.
- **Catálogo medido:** ``docs/tcc/gamificacao/catalogo-2026-11-05.json``, retrato de produção com data.
- **Uso medido:** ``docs/tcc/gamificacao/uso-2026-11-05.json``, contagens agregadas de produção, com data.
  A geração para se as somas não fecharem.
- **Descrições dos PRs do Lab:** as evidências repetem o que cada PR afirmou ter visto e o que deixou
  de fora. O Lab é privado, então os PRs são citados por número, sem link, e as capturas foram copiadas
  para ``docs/tcc/gamificacao/evidencias/`` depois de conferidas: só dados simulados, sem nome de aluno.
"""

from __future__ import annotations

import html
import json
import shutil
from pathlib import Path

import guardioes

ORDEM = guardioes.ORDEM
PASTA = "docs/tcc/gamificacao"
CATALOGO = f"{PASTA}/catalogo-2026-11-05.json"
USO = f"{PASTA}/uso-2026-11-05.json"
MOLDURAS = "mobile/src/assets/design/molduras"

FONTES = {
    "guardioes": "scripts/site_docs/guardioes.py",
    "catalogo": CATALOGO,
    "uso": USO,
    "molduras": "mobile/src/constants/molduras.ts",
    "icones": "mobile/src/constants/profileUtilityIcons.ts",
    "capacidades": "mobile/src/utils/brainHexCapabilities.ts",
    "tema": "mobile/src/utils/profileShellPalette.ts",
    "console": "frontend/src/styles/console-theme.css",
    "desafios": "api/alembic/versions/20261105_24_molduras_tarefas_dificeis.py",
}

# Arquivo da arte, rótulo e chave em profileUtilityIcons. Ordem de leitura: economia, progresso, navegação.
UTILIDADES = [
    ("coin", "Moeda", "coin"), ("store", "Loja", "store"), ("bag", "Mochila", "bag"), ("deadline", "Prazo", "deadline"),
    ("retry", "Nova tentativa", "retry"), ("hint", "Dica", "hint"), ("book", "Livro", "book"), ("medal", "Medalha", "medal"),
    ("achievement-icon", "Conquista", "achievements"), ("achievements", "Ranking", "ranking"), ("social", "Social", "social"),
    ("notifications", "Avisos", "notifications"), ("settings", "Ajustes", "settings"),
]
OBJETOS = {
    "Economia": [("coin", "Moeda"), ("chest", "Baú"), ("bag", "Mochila")],
    "Pódio": [("gold", "Ouro"), ("silver", "Prata"), ("bronze", "Bronze"), ("trophy", "Troféu")],
    "Tempo e tentativa": [("deadline", "Prazo"), ("calendar", "Calendário"), ("retry", "Nova tentativa"), ("hint", "Dica")],
    "Percurso": [("map", "Mapa"), ("compass", "Bússola"), ("steps", "Passos"), ("completion", "Conclusão"), ("book", "Livro")],
    "Sinais": [("bell", "Sino"), ("bolt", "Raio"), ("community", "Comunidade")],
}
ORIGEM = {
    "loja": ("Compradas na loja", "Só com moedas, de 20 a 40. Comprar não muda XP nem posição."),
    "conquista": ("Ganhas por desafio", "Cada uma exige uma missão difícil e diferente das outras (#1011)."),
    "acao": ("Ganhas por uma ação", "Duas ações continuam valendo por decisão de produto (#1011)."),
}

# (tema, PRs, regra). Só o que o código ou uma descrição de PR sustenta.
MECANICAS = [
    ("XP e faixas", "#759, #814, #916, #1008",
     "O XP sai de <code>eventos_aluno</code>, por turma. Dez faixas com título e barra até a próxima, lidas da tabela <code>xp_faixa</code>. "
     "Duelo contra adversário fica fora do XP, para recusar uma batalha não custar posição. Concluir conteúdo credita pelo banco, mesmo com a API fora do ar."),
    ("Conquistas", "#160, #514, #895, #1011",
     "O banco avalia por métrica declarada no critério. Conquista de professor vale para a turma dele. Conquista de moldura não dá ponto: "
     "o prêmio é a moldura, e pontos mexeriam no ranking."),
    ("Moedas e loja", "#196, #198",
     "Saldo é a soma de um livro-caixa (<code>moedas_ledger</code>), nunca uma coluna, e o cliente não fabrica moeda. Gastar não muda XP nem posição."),
    ("Molduras", "#895, #897, #1011",
     "Cosmético puro: 20 na loja, 18 por desafio, 2 por ação. Ninguém ganha vantagem por usar uma moldura."),
    ("Missões", "#180, #793, #796, #991",
     "O rastreador flutuante da Trilha leva ao que falta fazer pelo botão “Ir”. Lugar e tamanho são fixos; só a pele muda por perfil. "
     "Na missão de guilda, o alvo vale por membro, para o esforço individual ser o mesmo."),
    ("Ranking", "#162, #636, #920",
     "O corte é de dados, não de tela: o aluno recebe o topo (parâmetro <code>rank_limite_visivel</code>, hoje 15) e a própria linha. "
     "O motivo está no estudo citado no PR: manter a disputa sem envergonhar quem está embaixo."),
    ("Eventos", "#495, #920, #923, #930",
     "Abrem e encerram pelo banco, no horário. O rank do evento é opcional: entrar ou sair não muda nota nem XP, e o texto na tela diz isso. Duelo no evento só entre inscritos."),
    ("Guildas", "#541, #991, #1009",
     "Por turma, com convite, entrada e saída. O painel técnico compara o XP por atividade de quem está em guilda com o de quem não está, e não conclui nada com poucos alunos."),
    ("Arena e ranqueada", "#512, #792, #916, #995",
     "Lobby em dois passos: modo e depois regra e adversário. Sempre 5 questões, uma tentativa cada. O resumo do professor mostra vitórias e empates, sem coluna de derrota."),
    ("Boss", "#224, #763, #957",
     "Só Survivor, Daredevil e Conqueror batalham. O modelo escreve nome e falas por perfil; sem linha gerada, valem as falas fixas do app. "
     "Trocar o nome não zera o estado salvo da batalha."),
]

PERSONALIZACAO = [
    ("Base por perfil", "Texto, áudio e apresentação por tópico e perfil, reaproveitados entre alunos do mesmo perfil. É o que o microservice gera.", "#873, #911, #955, #863"),
    ("Adequação por aluno", "Camada leve sobre a base, com preferências, emoção, estado mental e necessidades do grupo. Não regera mídia pesada por aluno.", "#53, #804"),
    ("História da turma", "O professor escreve o arco narrativo no console. O arco diz onde e por quê; a assinatura do perfil diz como.", "#843"),
    ("Pele da interface", "Cor, emblema, moldura, arena, forma da trilha e título das folhas seguem o perfil. Lugar e tamanho dos controles não mudam.", "#796, #824, #828, #930"),
    ("Capacidades", "Cronômetro e batalha só para alguns perfis. Todos conversam com o Guardião, mas só maiores de 18 anos confirmados têm a IA liberada.", "#951, #933"),
    ("Ordem aconselhada", "O motor sugere a ordem do material e registra cada decisão. É conselho: nada fica bloqueado por causa dela.", "#804"),
    ("O vetor, não só o dominante", "Uma regra só decide os perfis representativos no app, na API e no banco. Cronômetro, tempo do boss, falas do boss e o peso nas notificações seguem a proporção desses perfis.", "#1106, #1107, #1109, #1110, #1115"),
    ("Mistura por conteúdo", "Cada conteúdo do tópico pode vir inteiro de um perfil representativo diferente, na proporção do vetor. Está pronta e desligada: quem liga é a autora.", "#1111, #1112"),
    ("Aprovação do professor", "O material personalizado só chega ao aluno depois que o professor aprova, e volta a esperar quando muda.", "#1100, #1101"),
]

NAO_AFIRMA = [
    "<b>Não há resultado educacional.</b> São 7 alunos em produção, sem coorte nem comparação. Nada aqui mostra que a gamificação ou o perfil melhora a aprendizagem.",
    "<b>Casar conteúdo com perfil é hipótese.</b> Gerar todos os formatos é acesso e escolha, não “estilo de aprendizagem” (#710).",
    "<b>A geração ainda falha mais do que entrega.</b> Só 4 de 17 personalizações em produção estão prontas. Sem material pronto, o aluno usa o do professor.",
    "<b>O uso medido é de um aluno só.</b> Os 685 eventos de XP e os 184 lotes de telemetria vêm de uma única conta. Eles mostram que o caminho funciona, não como alunos se comportam.",
    "<b>Eventos e guildas têm 0 linhas em produção</b> (05/11/2026). As telas e regras foram testadas com dados simulados e em banco local, sem uso real.",
    "<b>O questionário BrainHex é autoral</b>, sem validação local.",
    "<b>Desafios de precisão dependem do app novo.</b> Eles leem <code>atividade_tentativas</code>, vazia em 05/11. O percentual ainda sai do aparelho, então a conquista é cosmética de propósito.",
    "<b>“Vencer boss” não existe como desafio:</b> o banco guarda as falas, não o resultado da batalha.",
    "<b>A mistura de material está desligada</b> em produção (12/11/2026). Hoje o aluno recebe o material do perfil ativo.",
    "<b>O vetor observado pelo uso fica em sombra.</b> São dois indicadores, que o produto não lê; o perfil vem só do questionário.",
    "<b>A aprovação ainda não foi exercida.</b> Os 18 registros de material personalizado entraram aprovados pela migração, sem revisão do professor (12/11/2026).",
]

EVIDENCIAS = [
    ("Progressão", [
        {"pr": 814, "data": "02/11/2026", "titulo": "Faixas de XP com título e barra até a próxima",
         "visto": ["9 testes de estrutura e 9 em Postgres local: piso exato sobe de faixa, última faixa não tem próxima, XP negativo conta como 0",
                   "Em 320 e 360 px, sem rolagem lateral nem texto cortado",
                   "Prévia com dados de exemplo nas paletas Conqueror, Seeker, Achiever e Socializer"],
         "nao": ["Conta real: a migration ainda não tinha sido aplicada quando o PR foi escrito"],
         "imagens": [("xp-faixa.png", "Cartão da faixa nas paletas Conqueror, Seeker e Achiever")]},
        {"pr": 916, "data": "04/11/2026", "titulo": "Duelo contra adversário sai do XP",
         "visto": ["11 testes em Postgres local, com duelo e cooperativo lado a lado nas cinco contas de XP",
                   "Mutação: quebrar a marca, cada conta ou o piso derruba o teste correspondente",
                   "Upgrade, downgrade e novo upgrade sobre dado existente"],
         "nao": ["Produção não foi consultada: quantos pontos de duelo existiam", "A cadeia inteira do Alembic rodando do zero"]},
        {"pr": 759, "data": "01/11/2026", "titulo": "Tempo no relógio do servidor, e ele mexe só no XP",
         "visto": ["12 casos em Postgres local: 85% no tempo paga as faixas de 70 e 80; depois 95% paga só a de 90; a última tentativa com 40% vira a nota, e o bônus pago fica",
                   "Fora do tempo (126 s), a nota vale e o bônus não",
                   "Prazo vencido é recusado ao iniciar e ao responder, e nenhuma função recebe hora do aparelho"],
         "nao": ["O gabarito continua no aparelho e a pontuação sai do app: a função limita os valores, mas não corrige",
                 "18 testes de ponta a ponta já falhavam na suíte, e o PR os registra como anteriores"],
         "nota": "Em 05/11, <code>atividade_tentativas</code> tinha 0 linhas: a regra existe, e ainda não foi usada pelo app em produção."},
        {"pr": 1008, "data": "05/11/2026", "titulo": "O XP de concluir conteúdo sai do banco",
         "visto": ["Medido em produção antes: 13 de 17 eventos <code>conteudo_concluido</code> sem referência, e conclusão sem referência vale 0",
                   "11 comportamentos num Postgres de teste, incluindo pagar só na transição para concluído, sem retroativo"],
         "nao": ["O banco real", "No Postgres de teste, a dedup foi imitada por um gatilho com a mesma regra, e não é o gatilho real"],
         "nota": "Efeito colateral declarado: concluir com a API fora agora paga as 2 moedas e conta para missões."},
    ]),
    ("Conquistas e molduras", [
        {"pr": 160, "data": "09/09/2026", "titulo": "21 das 27 conquistas nunca destravavam",
         "visto": ["Medido em produção antes da correção: 6 avaliadas, 21 ignoradas em silêncio, 0 concessões de conquista de perfil",
                   "As que destravavam não pagavam: o rank soma eventos, e o gatilho não os gravava"],
         "nao": ["A migração não foi aplicada no PR; a decisão ficou para quem revisou"]},
        {"pr": 1011, "data": "05/11/2026", "titulo": "Molduras saem por desafios difíceis",
         "visto": ["84 testes em Postgres local entre molduras, paridade, XP e diagnóstico, cobrindo as 18 missões e os atalhos que cada uma recusa",
                   "Em produção, só leitura: cada trecho alterado aparece exatamente uma vez"],
         "nao": ["O fluxo completo a partir de um evento real"],
         "nota": "A dona do projeto recusou a primeira proposta, que só aumentava a quantidade: as missões tinham de ser diferentes."},
        {"pr": 514, "data": "16/10/2026", "titulo": "Conquista desativada pelo professor continuava sendo concedida",
         "visto": ["Conferido no banco real, só leitura: o gatilho filtrava por turma, mas não olhava <code>ativa</code>",
                   "A função foi reescrita a partir da definição de produção, com só essa mudança"],
         "nao": ["A descrição não registra limites"]},
        {"pr": 895, "data": "03/11/2026", "titulo": "40 molduras novas na loja, em conquistas e por ação",
         "visto": ["De ponta a ponta no esqueleto de produção: semente 20/10/10, compra uma vez só, saldo insuficiente, equipar só o que tem, RLS como <code>authenticated</code> e downgrade",
                   "3188 testes da API e 1305 do app"],
         "nao": ["Amigo de outra turma aparece com a moldura do perfil: a RLS só mostra colegas de turma"],
         "nota": "Esta PR derrubou a API, como mostra a próxima evidência. Os testes passaram porque o esqueleto não tinha o índice único de produção."},
        {"pr": 897, "data": "03/11/2026", "titulo": "API em 502 desde a #895: cada conquista com o próprio tipo",
         "visto": ["Log do Dokploy de 03/11, 13:45 UTC: <code>conquistas_tipo_comum_uq</code> violado por dez conquistas do mesmo tipo",
                   "31 testes com Postgres local e 3188 na API completa"],
         "nao": ["Nada foi aplicado em produção pelo PR: a API voltaria no deploy seguinte"]},
    ]),
    ("Economia", [
        {"pr": 196, "data": "15/09/2026", "titulo": "O aluno acumula moeda ao estudar",
         "visto": ["24 testes sobre o SQL gerado pela migração", "Saldo como soma do livro-caixa, para auditar a origem de cada moeda"],
         "nao": ["Uma suíte inteira verde: 36 falhas iguais às da main, por dependência ausente no ambiente local"]},
        {"pr": 198, "data": "18/09/2026", "titulo": "Compra atômica: debita e concede, ou não faz nada",
         "visto": ["26 testes novos sobre o SQL gerado",
                   "A autorrevisão pegou dois defeitos antes de virarem código: <code>FOR UPDATE</code> com agregação e <code>NOT IN</code> que não dispara com NULL"],
         "nao": ["Suíte verde de verdade: 36 falhas iguais às da main, por dependência ausente na máquina"]},
    ]),
    ("Missões", [
        {"pr": 793, "data": "01/11/2026", "titulo": "Missões na Trilha, com “Ir” até o que falta fazer",
         "visto": ["1.107 testes do app, sem falha", "Testes novos do critério da próxima missão, do destino do “Ir”, do prazo e da recompensa"],
         "nao": ["A descrição do PR não registra teste em aparelho nativo"]},
        {"pr": 991, "data": "05/11/2026", "titulo": "Na missão de guilda, o alvo vale por membro",
         "visto": ["5 testes em Postgres 17 local: com 3 membros o alvo é 6, com 3 atividades fica em 50% e sem prêmio, com 6 paga os 3",
                   "Missão antiga continua com o alvo da guilda inteira"],
         "nao": ["Quantas missões de guilda estavam abertas em produção: o banco não respondeu da máquina"]},
        {"pr": 180, "data": "12/09/2026", "titulo": "Missão do professor é uma atividade, sem tabela própria",
         "visto": ["Medido em bloco desfeito: concluir a missão leva o tópico de 0% para 8,33%",
                   "917 testes da API, 397 do app e 306 do console"],
         "nao": ["A descrição não registra limites"],
         "nota": "Uma tabela própria ficaria invisível para o cálculo de progresso, e a barra pararia. As missões diárias e de evento vieram depois, em <code>missoes</code>."},
        {"pr": 796, "data": "01/11/2026", "titulo": "Ícone de missões com a cara de cada perfil",
         "visto": ["1152 testes do app, com 21 das variantes do rastreador", "Prévia nos 7 perfis, com dados de exemplo"],
         "nao": ["O ícone com conta real: o app parou em “Buscando suas turmas…” com 500/409 do servidor",
                 "A correção do “Ir” só tem teste de unidade: a turma não tinha tópico com atividade"],
         "imagens": [("missoes-icones.jpg", "O mesmo botão, no mesmo lugar, com sete ícones (prévia)"),
                     ("missoes-folhas.jpg", "A folha de missões muda de título e cor; o conteúdo e o “Ir” continuam iguais (prévia)")]},
    ]),
    ("Ranking e eventos", [
        {"pr": 162, "data": "09/09/2026", "titulo": "Ranking mostra o topo e a própria posição",
         "visto": ["O corte vale na view, então nome e pontuação dos demais não chegam ao aparelho", "O professor continua vendo a turma inteira"],
         "nao": ["A descrição não traz medição com alunos: a justificativa vem da literatura citada no PR"]},
        {"pr": 930, "data": "04/11/2026", "titulo": "Rank do evento no desenho do TrailUp, com ênfase por perfil",
         "visto": ["1.310 testes do app, 0 falhas", "A ênfase dos 7 perfis e as frases dentro e fora do rank",
                   "No Expo web, “Entrar no rank” troca o cartão para posição, frase e vizinhança"],
         "nao": ["O banco real e o aparelho"],
         "imagens": [("evento-conqueror.jpg", "Conqueror: a frase fala de quem está à frente (nomes simulados)"),
                     ("evento-socializer.jpg", "Socializer: a frase fala de quem entrou (nomes simulados)")],
         "nota": "A mesma tela com ênfases diferentes: o Conqueror vê a distância até o próximo, e o Socializer vê os colegas."},
        {"pr": 636, "data": "25/10/2026", "titulo": "Percentual do líder só com turma grande",
         "visto": ["5 testes de ponta a ponta com a view real: rank com 3 alunos sai nulo, e o de 9 sai com o percentual certo",
                   "Elo e líder sem ponto saem nulos, e o mínimo vem da configuração"],
         "nao": ["CI bloqueado por cobrança: tudo rodou na máquina"]},
        {"pr": 920, "data": "04/11/2026", "titulo": "Rank do evento com inscrição, um por critério",
         "visto": ["25 testes em Postgres local com os gatilhos reais: quem não se inscreveu fica fora, quem sai some, 7 inscritos não mostram percentual e 8 mostram",
                   "O duelo conta no rank do evento e não no da turma; ranks sem evento devolvem as mesmas linhas de antes",
                   "RLS com o papel de verdade: aluno de outra turma, professor e anônimo não conseguem inscrever"],
         "nao": ["<code>notificacoes_rank_varrer</code>, só por estrutura", "O pódio do evento não congela ao encerrar: quem sai da turma some do resultado"]},
        {"pr": 923, "data": "04/11/2026", "titulo": "O aluno entra, sai e vê o rank do evento",
         "visto": ["1307 testes do app, com 5 do rank do evento", "No Expo web, com Supabase simulado: entrar troca o botão, mostra a frase e destaca a linha do aluno"],
         "nao": ["O banco real e o aparelho"],
         "imagens": [("rank-evento-estados.jpg", "Fora e dentro do rank, com a frase de que nada muda em nota nem XP (nomes simulados)")]},
    ]),
    ("Arena e boss", [
        {"pr": 792, "data": "01/11/2026", "titulo": "Arena em fluxo de lobby",
         "visto": ["No navegador, logado: abrir o lobby, escolher e trocar o modo, sortear o adversário e liberar “Começar”", "Guilda x guilda desabilitado para quem não tem guilda"],
         "nao": ["O envio do convite pelo lobby", "Guilda x guilda com guilda de verdade", "Aparelho nativo"],
         "imagens": [("arena-1.jpg", "Escolha do modo, com o motivo de Guilda x guilda estar apagado")]},
        {"pr": 763, "data": "01/11/2026", "titulo": "Cada perfil ganha um nome de boss próprio",
         "visto": ["Medido em produção: 3 linhas com nomes iguais ou quase iguais e falas trocáveis entre perfis", "59 testes, incluindo o caso exato de produção e o limite de 60 caracteres"],
         "nao": ["A qualidade das falas que o modelo gera com o prompt novo: não havia chave do modelo na máquina"]},
        {"pr": 995, "data": "05/11/2026", "titulo": "Duelo no evento só entre inscritos",
         "visto": ["12 testes em Postgres local: recusas sem deixar desafio pela metade, quem saiu do evento não aceita mas recusa, e o rank de outro evento não conta",
                   "56 testes somando os vizinhos de rank e XP"],
         "nao": ["Três funções da arena entraram como dublês: o que está em teste é o que a migration acrescenta em volta delas"]},
        {"pr": 541, "data": "19/10/2026", "titulo": "Toda guilda do resultado do evento virava “Guilda”",
         "visto": ["Validado ao vivo em subtransação abortada: professor dono lê 1 linha (eram 0), outro professor 0, e anônimo é barrado",
                   "O aluno segue sem ler a tabela direto, por decisão"],
         "nao": ["A descrição não registra limites"],
         "nota": "Era RLS ligada sem policy: fecha em silêncio, e a tela desenha o texto padrão."},
        {"pr": 1009, "data": "05/11/2026", "titulo": "Paridade entre guilda e individual no painel técnico",
         "visto": ["7 testes em Postgres local: alerta com o prêmio de missão dobrando o XP por atividade, duelo fora da conta e “sem dado” com poucos alunos"],
         "nao": ["Duas tabelas e duas funções entraram como dublês", "Não há guilda em produção: a medida ainda não tem o que medir"]},
    ]),
    ("Personalização", [
        {"pr": 804, "data": "02/11/2026", "titulo": "A recomendação cruza o conteúdo com o aluno",
         "visto": ["Medido em produção antes: 1 sugestão desde 25/08 e 0 revisões", "11 testes em Postgres local, com RLS lida como aluno e downgrade"],
         "nao": ["O app rodando, só testes", "A chamada real ao modelo para a demanda"]},
        {"pr": 843, "data": "02/11/2026", "titulo": "Arco narrativo da turma escrito pelo professor",
         "visto": ["Editar o arco enfileira a regeração da turma, e falha na fila não desfaz o que o professor salvou", "O teste pegou 35 alvos em vez de 28 numa fusão, e o gatilho novo passou a deduplicar"],
         "nao": ["A migration não estava aplicada em produção quando o PR foi escrito"]},
        {"pr": 917, "data": "04/11/2026", "titulo": "Exemplo na paleta do perfil, e slide dividido em vez de rolar",
         "visto": ["Playwright em 7 tamanhos, de 360×640 a 1920×1080: nenhuma página rola", "O exemplo visual usa os tokens do perfil"],
         "nao": ["Celular deitado: um bloco muito alto ainda rola de 11 a 60 px, como reserva para não cortar nada"]},
        {"pr": 710, "data": "30/10/2026", "titulo": "Personalização por perfil não é “estilo de aprendizagem”",
         "visto": ["Só texto: a documentação e os comentários deixam de usar estilos de aprendizagem como motivo"],
         "nao": ["Não muda comportamento, nem mede efeito"]},
        {"pr": 871, "data": "02/11/2026", "titulo": "Perfil × formato, com incerteza explícita",
         "visto": ["6 testes em Postgres local com os números calculados à mão, e 7 de estrutura. Mutação no filtro derruba 2",
                   "Abaixo de 5 alunos, a célula sai nula e marcada <code>amostra_insuficiente</code>"],
         "nao": ["Resultado: não há amostra em produção, então a medida ainda não diz qual formato funciona"]},
        {"pr": 774, "data": "01/11/2026", "titulo": "Trava da personalização na turma de comparação",
         "visto": ["13 testes em Postgres local com o papel real: o aluno retido não vê base, card, falas nem job, e o professor dono vê",
                   "Mutação: sem a policy, o teste principal falha"],
         "nao": ["Não há coorte registrada: <code>estudo_coorte</code> estava vazia em 04/11"],
         "nota": "A trava esconde e não impede a geração: assim, no dia do corte, o material já está pronto."},
        {"pr": 951, "data": "04/11/2026", "titulo": "Os 7 perfis conversam com o Guardião",
         "visto": ["3343 testes da API", "No build web com backend falso: o Guardião aparece e o chat abre"],
         "nao": ["Android e iOS", "Quatro perfis no módulo", "A resposta do modelo real para os perfis novos"]},
        {"pr": 933, "data": "04/11/2026", "titulo": "IA só para maiores de 18, com regra fechada",
         "visto": ["Os termos da Gemini API exigem 18 anos: é a causa da mudança", "Na rota de menor, nenhum cliente de modelo nasce, mesmo com as chaves; o RAG não busca, e TTS e enriquecimento não chamam nada",
                   "Menor com tudo autorizado recebe 403 no mentor"],
         "nao": ["<code>test_migrations_postgres</code>: o PR não tem migration"],
         "nota": "Aluno sem data de nascimento também fica sem IA. Trilha, questões e progresso seguem funcionando."},
    ]),
    ("Geração de mídia", [
        {"pr": 767, "data": "01/11/2026", "titulo": "Causa real do áudio: cota, e nenhuma reserva",
         "visto": ["Medido em produção: 7 de 7 áudios falharam num reprocessamento (5 por cota do plano gratuito, 2 por crédito esgotado)",
                   "18 testes. Com o código antigo, 30 s de espera e o erro no fim; com a correção, passa sem espera"],
         "nao": ["O crédito em si: a reserva troca a falha por custo", "A apresentação, que falhava por outro caminho"]},
        {"pr": 838, "data": "02/11/2026", "titulo": "Nova tentativa retoma só o que falhou",
         "visto": ["Medido em produção: cerca de 30 pipelines completos num dia de cota, e um perfil com 7 de 8 partes prontas marcado como falha",
                   "479 testes do microservice. Com só a parte 2 sem voz: uma chamada de TTS, nenhuma de texto nem de deck"],
         "nao": ["A descrição indica testes com rede e banco falsos, não uma geração real"]},
        {"pr": 873, "data": "02/11/2026", "titulo": "Base só para os perfis que a turma tem",
         "visto": ["3106 testes da API, com 22 casos da regra: principal, secundário, turma vazia, pedido explícito e aluno sem perfil"],
         "nao": ["O banco real: as consultas novas só têm teste de estrutura"]},
        {"pr": 911, "data": "03/11/2026", "titulo": "Áudio juntado por bloco e por perfil",
         "visto": ["Medido: o mesmo conteúdo saiu com 8 blocos e 2 áudios em dois perfis, e outro perfil com 7 blocos saiu com 7 áudios, só pelo tamanho do roteiro",
                   "506 testes do microservice"],
         "nao": ["A contagem real de blocos desse conteúdo", "Material já gerado não muda sozinho"]},
        {"pr": 955, "data": "04/11/2026", "titulo": "Conteúdo idêntico se vincula ao material existente",
         "visto": ["13 testes em Postgres local com papéis reais, incluindo forja pelo cliente", "No desvio, nem enriquecimento, nem cards, nem microservice são chamados"],
         "nao": ["Um ciclo completo com worker, microservice e TTS reais",
                 "Em produção, em 04/11, 15 conteúdos e nenhum texto repetido: o ganho é para o que vier"]},
        {"pr": 957, "data": "05/11/2026", "titulo": "Falas do boss também copiam de conteúdo idêntico",
         "visto": ["6 testes em Postgres local, com um modelo que falha se for chamado", "3423 testes da API"],
         "nao": ["Um ciclo real do worker com modelo e Storage"]},
        {"pr": 913, "data": "04/11/2026", "titulo": "Pedidos iguais ao mesmo tempo viram um job só",
         "visto": ["Corrida em Postgres local: antes, 3 pedidos abriam 3 jobs; depois, 1, e passou 5 vezes seguidas"],
         "nao": ["A origem dos 3 pedidos: duplo clique ou reenvio automático não foi confirmado", "Navegador e produção"]},
        {"pr": 817, "data": "02/11/2026", "titulo": "Metas e relógio por alvo na fila",
         "visto": ["13 testes em Postgres local com as policies reais e números calculados à mão", "Turma alheia recebe recusa, não painel zerado"],
         "nao": ["As metas de geração são hipótese: nunca houve duração por alvo medida antes"]},
        {"pr": 863, "data": "02/11/2026", "titulo": "Deck com a cor do perfil, claro e escuro",
         "visto": ["216 testes, com contraste AAA em todo par texto × superfície", "Os 7 decks renderizados e abertos no Chromium, em 390×844 e 1366×820, sem erro de página"],
         "nao": ["Decks que já estavam no R2 não mudam", "No Expo web, o XP do deck se perde"],
         "imagens": [("deck-antes.jpg", "Antes: Seeker no celular, com estilo vindo de CDN"),
                     ("deck-depois.jpg", "Depois: mesma lição, primeira tela, com a identidade do perfil"),
                     ("deck-sete-perfis.jpg", "A mesma lição de exemplo nos 7 perfis, com a pele e o tom da abertura diferentes. Abra para ampliar.")]},
    ]),
    ("Telas de referência", [
        {"pr": 839, "data": "02/11/2026", "titulo": "Mapa da Trilha larga cabe na coluna",
         "visto": ["1.279 testes do app, sem falha, com testes novos de quadro estreito e de 1280×720", "Capturas em 1024, 1280 e 1440 px com dados marcados como MOCK"],
         "nao": ["A árvore, a lista e o mapa do celular: só a vista de mapa em tela larga muda"],
         "imagens": [("mapa-web.jpg", "Mapa da jornada na web, perfil Conqueror (dados simulados)")]},
        {"pr": 790, "data": "01/11/2026", "titulo": "Rank sem classificação mostra um cartão no estilo do TrailUp",
         "visto": ["1.098 testes do app, com contraste de pelo menos 7:1 no texto nos 7 perfis", "Capturas no Expo web, com dados fictícios numa rota de prévia"],
         "nao": ["Android e iOS nativos", "A tela com dados reais, logado"],
         "imagens": [("rank-vazio.jpg", "Ranking vazio do Achiever, com arte do perfil e saída para a Trilha")]},
        {"pr": 782, "data": "01/11/2026", "titulo": "Perfil abre em Métricas e Conquistas, Loja ao lado da Bag",
         "visto": ["No navegador, com conta de teste e tela de celular: a Loja abre pelo topo e o Sair fica no fim", "1.056 testes do app"],
         "nao": ["Metas, Mistério e Squad, um a um"],
         "imagens": [("loja.jpg", "Loja com saldo e a frase de que gastar não muda XP nem ranking")]},
        {"pr": 785, "data": "01/11/2026", "titulo": "Métricas no padrão do TrailUp",
         "visto": ["No navegador, com conta de teste, em 360×640 e 430×932: estilos Painel Analítico e Arena Tática"],
         "nao": ["Android e iOS nativos", "Metas, Mistério e Squad, um a um"],
         "imagens": [("metricas-arena.jpg", "Métricas da Arena Tática, com conta de demonstração")]},
        {"pr": 824, "data": "02/11/2026", "titulo": "Tela de carregamento por perfil",
         "visto": ["Capturas dos 7 perfis, da variante neutra e da transição"],
         "imagens": [("carregando-conqueror.jpg", "Conqueror: Amina posiciona o aluno para a próxima meta"),
                     ("carregando-seeker.jpg", "Seeker: a mesma tela no universo do perfil")]},
        {"pr": 828, "data": "02/11/2026", "titulo": "Ícone por perfil na barra, com mensagens não lidas",
         "visto": ["1245 testes do app, e 44 de 44 do chat", "No navegador, logado: barra de 360 px nos 7 perfis e lateral em 1280 px"],
         "nao": ["Aparelho", "O número zerando numa conversa de verdade: a conta não tem amigos"],
         "imagens": [("social-icones.jpg", "Trilha e Social nos 7 perfis, fechado e aberto")],
         "nota": "O número de não lidas é a pista que varia. Nada no ícone pulsa nem sorteia, porque o público é jovem e fabricar saliência assim é o caminho a evitar. O PR explica isso com a literatura de recompensa. A nota do próprio PR diz que os pares fechado e aberto entraram pela #835."},
    ]),
]
LARGAS = {"evento-conqueror.jpg", "evento-socializer.jpg", "rank-vazio.jpg", "mapa-web.jpg", "missoes-icones.jpg", "missoes-folhas.jpg", "social-icones.jpg", "deck-sete-perfis.jpg", "rank-evento-estados.jpg"}


def _e(t: str | None) -> str:
    return html.escape(t or "")


def _c(t: str | None) -> str:
    """Escapa, mantendo só o `<code>` que as próprias evidências escrevem."""
    return _e(t).replace("&lt;code&gt;", "<code>").replace("&lt;/code&gt;", "</code>")


def carregar_catalogo(raiz: Path) -> dict:
    cat = json.loads((raiz / CATALOGO).read_text(encoding="utf-8"))
    por_codigo = {m["codigo"] for m in cat["molduras"]}
    faltam = [c for c in por_codigo if not (raiz / MOLDURAS / f"{c}.webp").exists()]
    orfas = [c["nome"] for c in cat["conquistas"] if c.get("moldura") and c["moldura"] not in por_codigo]
    if faltam or orfas or len(cat["faixas"]) != 10 or len(cat["molduras"]) != 40:
        raise SystemExit(f"gamificacao: catálogo não bate com o app; artes faltando {faltam}, conquistas órfãs {orfas}")
    return cat


def copiar_midia(raiz: Path, saida: Path) -> None:
    destino = saida / "midia" / "gamificacao"
    for sub in ("biblioteca", "evidencias"):
        alvo = destino / sub
        if alvo.exists():
            shutil.rmtree(alvo)
        shutil.copytree(raiz / PASTA / sub, alvo)
    mold = destino / "biblioteca" / "molduras"
    mold.mkdir(parents=True, exist_ok=True)
    for f in (raiz / MOLDURAS).glob("*.webp"):
        shutil.copy(f, mold / f.name)


def _lum(hexa: str) -> float:
    canais = [int(hexa.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    r, g, b = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in canais]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a: str, b: str) -> float:
    x, y = sorted((_lum(a), _lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def _num(v: float) -> str:
    return f"{v:.1f}".replace(".", ",")


def _amostra(cor: str, nome: str) -> str:
    return f'<span class="amostra"><i style="background:{cor}"></i><b>{nome}</b><code>{cor.upper()}</code></span>'


def _paleta(gs: dict) -> str:
    linhas = []
    for p, g in gs.items():
        pal = g["paleta"]
        amostras = "".join(_amostra(pal[k], k) for k in ("primary", "secondary", "accent", "background"))
        linhas.append(
            f'<div class="paleta" style="--c:{pal["accent"]};--f:{pal["background"]}">'
            f'<div class="paleta-cab"><img src="midia/guardioes/emblema-{p}.png" alt="" loading="lazy">'
            f'<div><b>{guardioes.NOME_EN[p]}</b><span>{_e(g["rotulo"])} · {_e(g["guia"])}</span></div>'
            f'<em>{_num(contraste(pal["accent"], pal["background"]))}:1</em></div><div class="amostras">{amostras}</div></div>'
        )
    return '<div class="paletas">' + "".join(linhas) + "</div>"


def _capacidades(gs: dict) -> str:
    def sim(v: bool) -> str:
        return '<span class="chip ok">sim</span>' if v else '<span class="chip flat">não</span>'
    linhas = "".join(
        f'<tr><td><span class="dot" style="background:{g["cor"]}"></span> {guardioes.NOME_EN[p]}</td><td>{_e(g["trilha"])}</td>'
        f'<td>{_e(g["missoes"]["titulo"].replace("{guia}", g["guia"]))}</td><td>{sim(g["cronometro"])}</td><td>{sim(g["batalha"])}</td></tr>'
        for p, g in gs.items()
    )
    return ('<div class="tabela"><table><thead><tr><th>Perfil</th><th>Forma da trilha</th><th>Título das missões</th>'
            f"<th>Cronômetro</th><th>Batalha</th></tr></thead><tbody>{linhas}</tbody></table></div>")


def _faixas(cat: dict) -> str:
    fx = cat["faixas"]
    topo = fx[-1]["xp_minimo"]
    partes = []
    for i, f in enumerate(fx, 1):
        prox = f'até {fx[i]["xp_minimo"]:,} XP'.replace(",", ".") if i < len(fx) else "última faixa"
        largura = max(4, round(f["xp_minimo"] / topo * 100))
        partes.append(f'<li><span class="nivel">{i}</span><b>{_e(f["titulo"])}</b><span class="xp">{f["xp_minimo"]:,} XP · {prox}</span>'
                      f'<i style="width:{largura}%"></i></li>'.replace(",", "."))
    return f'<ol class="faixas">{"".join(partes)}</ol>'


def _conquistas(cat: dict, gs: dict) -> str:
    nomes = {m["codigo"]: m["nome"] for m in cat["molduras"]}
    comuns: dict[str, list[dict]] = {}
    for c in cat["conquistas"]:
        if not c.get("perfil"):
            comuns.setdefault(c["categoria"], []).append(c)
    grupos = []
    for cat_nome, itens in comuns.items():
        linhas = "".join(
            f'<li><b>{_e(c["nome"])}</b><span>{_e(c["descricao"])}</span>'
            + (f'<img src="midia/gamificacao/biblioteca/molduras/{c["moldura"]}.webp" alt="" title="Libera {_e(nomes[c["moldura"]])}" loading="lazy">' if c.get("moldura") else "")
            + "</li>" for c in itens)
        grupos.append(f'<div class="grupo-c"><h4>{_e(cat_nome)} <small>{len(itens)}</small></h4><ul>{linhas}</ul></div>')
    por_perfil = []
    for p in ORDEM:
        itens = [c for c in cat["conquistas"] if c.get("perfil") == p]
        linhas = "".join(f'<li><b>{_e(c["nome"])}</b><span>{_e(c["descricao"])}</span></li>' for c in itens)
        por_perfil.append(f'<div class="grupo-c" style="--c:{gs[p]["paleta"]["accent"]}"><h4><img src="midia/guardioes/emblema-{p}.png" alt="" loading="lazy">{guardioes.NOME_EN[p]} <small>{len(itens)}</small></h4><ul>{linhas}</ul></div>')
    return (f'<h3>Comuns a todos os perfis</h3><div class="grupos-c">{"".join(grupos)}</div>'
            f'<h3>Três por perfil</h3><div class="grupos-c">{"".join(por_perfil)}</div>')


def _loja(cat: dict) -> str:
    return '<div class="itens">' + "".join(
        f'<div class="item"><img src="midia/gamificacao/biblioteca/utilidade/{i["icone"]}-achiever.png" alt="" loading="lazy">'
        f'<div><b>{_e(i["nome"])}</b><span>{_e(i["descricao"])}</span></div><em>{i["preco_base"]}</em></div>' for i in cat["itens"]
    ) + "</div>"


def _molduras(cat: dict) -> str:
    desafio = {c["moldura"]: c for c in cat["conquistas"] if c.get("moldura")}
    acao = {a["moldura"]: a for a in cat["acoes"]}
    partes = []
    for origem, (titulo, texto) in ORIGEM.items():
        ms = [m for m in cat["molduras"] if m["origem"] == origem]
        cartoes = []
        for m in ms:
            if origem == "loja":
                como = f'{m["preco"]} moedas'
            elif origem == "conquista":
                como = f'<b>{_e(desafio[m["codigo"]]["nome"])}:</b> {_e(desafio[m["codigo"]]["descricao"])}'
            else:
                como = _e(acao[m["codigo"]]["rotulo"])
            cartoes.append(f'<figure class="moldura"><img src="midia/gamificacao/biblioteca/molduras/{m["codigo"]}.webp" alt="" loading="lazy">'
                           f'<figcaption><b>{_e(m["nome"])}</b><span>{como}</span></figcaption></figure>')
        partes.append(f'<h4>{titulo} <small>{len(ms)}</small></h4><p class="fine">{texto}</p>'
                      f'<div class="molduras {"curtas" if origem == "loja" else ""}">{"".join(cartoes)}</div>')
    return "".join(partes)


def _matriz_utilidades() -> str:
    cab = "".join(f"<th>{guardioes.NOME_EN[p]}</th>" for p in ORDEM)
    linhas = "".join(
        f'<tr><td><b>{rot}</b><code>{chave}</code></td>'
        + "".join(f'<td><img src="midia/gamificacao/biblioteca/utilidade/{arq}-{p}.png" alt="{rot}, {guardioes.NOME_EN[p]}" width="48" height="48" loading="lazy"></td>' for p in ORDEM)
        + "</tr>" for arq, rot, chave in UTILIDADES
    )
    return f'<div class="tabela matriz"><table><thead><tr><th>Ícone</th>{cab}</tr></thead><tbody>{linhas}</tbody></table></div>'


def _identidade(gs: dict) -> str:
    def linha(chave: str, rot: str, ext: str) -> str:
        return f'<div class="tira {"cena" if ext == "jpg" else ""}"><h4>{rot}</h4><div>' + "".join(
            f'<figure><img src="midia/gamificacao/biblioteca/perfil/{chave}-{p}.{ext}" alt="{rot}, {guardioes.NOME_EN[p]}" loading="lazy"><figcaption>{guardioes.NOME_EN[p]}</figcaption></figure>' for p in ORDEM
        ) + "</div></div>"
    return (linha("emblem", "Emblema", "png") + linha("frame", "Moldura do perfil", "png") + linha("totem", "Totem", "png")
            + linha("arena", "Arena", "jpg") + linha("map", "Mapa", "jpg") + linha("trail", "Trilha", "jpg"))


def _objetos() -> str:
    partes = []
    for grupo, itens in OBJETOS.items():
        partes.append(f'<div class="objs"><h4>{grupo}</h4><div>' + "".join(
            f'<figure><img src="midia/gamificacao/biblioteca/objetos/{a}.png" alt="" width="64" height="64" loading="lazy"><figcaption>{r}</figcaption></figure>' for a, r in itens
        ) + "</div></div>")
    return '<div class="objs-grade">' + "".join(partes) + "</div>"


def _componentes(gs: dict) -> str:
    botoes = "".join(
        f'<button type="button" data-tema-cor="{gs[p]["paleta"]["accent"]}" data-tema-primaria="{gs[p]["paleta"]["primary"]}" data-tema-fundo="{gs[p]["paleta"]["background"]}" '
        f'aria-pressed="{"true" if p == "conqueror" else "false"}"><span style="background:{gs[p]["cor"]}"></span>{guardioes.NOME_EN[p]}</button>' for p in ORDEM)
    c = gs["conqueror"]["paleta"]
    return (
        '<p>Modelos em HTML, com as medidas e a hierarquia das telas, para comparar os perfis. Eles não substituem os componentes em React Native. '
        'Troque o perfil para ver o que muda: só a cor. Os textos e valores são de exemplo.</p>'
        f'<div class="tema-trocar" role="group" aria-label="Perfil dos modelos">{botoes}</div>'
        f'<div class="vitrine" style="--c:{c["accent"]};--p:{c["primary"]};--f:{c["background"]}">'
        '<div class="peca"><h4>Faixa de XP</h4><div class="fx"><small>NÍVEL 2 DE 10</small><div><b>Primeiros passos</b><em>120 XP</em></div><i><u style="width:70%"></u></i><p>Faltam 30 XP para Trilha aberta</p></div></div>'
        '<div class="peca"><h4>Ações</h4><div class="acoes"><button type="button" class="b1">Entrar no rank</button><button type="button" class="b2">Sair do rank</button><button type="button" class="b3" disabled>Começar</button></div></div>'
        '<div class="peca"><h4>Abas e filtros</h4><div class="abas"><span class="on">Batalha</span><span>Pontuação</span><span>Missões</span></div><div class="pilulas"><span class="on">Precisão</span><span>Velocidade</span><span>Todos</span></div></div>'
        '<div class="peca"><h4>Selos</h4><div class="pilulas"><span>10 inscritos</span><span>até 09/11</span><span class="on">Você está no rank</span></div></div>'
        '<div class="peca"><h4>Modo da Arena</h4><div class="modo"><b>Duelo 1x1</b><span>Você contra um colega.</span></div><div class="modo off"><b>Guilda x guilda</b><span>Entre numa guilda para jogar.</span></div></div>'
        '<div class="peca"><h4>Missão</h4><div class="missao"><small>AGORA</small><b>Conclua 2 atividades</b><span>do dia · +50 pts · +20 moedas</span><i><u style="width:50%"></u></i></div></div>'
        '<div class="peca"><h4>Pódio</h4><div class="podio"><div><b>2º</b></div><div class="alto"><b>1º</b></div><div class="baixo"><b>3º</b></div></div></div>'
        '<div class="peca"><h4>Sua posição</h4><div class="posicao"><strong>7º</strong><div><b>Faltam 8 pts para passar o próximo</b><span>Só a sua turma vê.</span></div></div></div>'
        "</div>"
    )


def _tira_console(raiz: Path) -> str:
    """Lê os tokens do console, para a tabela não ficar para trás do CSS."""
    fonte = (raiz / FONTES["console"]).read_text(encoding="utf-8")
    bloco = fonte.split(":root[data-console-theme]", 1)[1].split("}", 1)[0]
    tokens = {}
    for linha in bloco.splitlines():
        linha = linha.strip()
        if linha.startswith("--") and ":" in linha:
            k, v = linha[2:].rstrip(";").split(":", 1)
            tokens[k.strip()] = v.strip()
    nomes = [("background", "Fundo"), ("card", "Cartão"), ("primary", "Primária"), ("accent", "Destaque"),
             ("console-violet", "Violeta (preenchimento)"), ("success", "Sucesso"), ("warning", "Alerta"), ("info", "Informação"), ("destructive", "Risco")]
    faltam = [k for k, _ in nomes if k not in tokens]
    if faltam:
        raise SystemExit(f"gamificacao: {FONTES['console']} mudou de formato; faltam {faltam}")
    return '<div class="amostras console">' + "".join(
        f'<span class="amostra"><i style="background:hsl({tokens[k].replace(" ", ",", 2)})"></i><b>{n}</b><code>hsl({tokens[k]})</code></span>' for k, n in nomes
    ) + "</div>"


FLUXO = [
    ("1. Disparo", "Salvar no editor enfileira o trabalho pelo próprio banco, e a matrícula também. Eventos seguidos se fundem num job pendente, para reordenar tópicos não virar um job por linha.", "Banco", "<code>20260827_03</code>, <code>20261011_02</code>"),
    ("2. Quais perfis", "Gera só os perfis que algum aluno da turma tem como principal ou secundário.", "API", "#873"),
    ("3. Já existe?", "Uma impressão SHA-256 do conteúdo compara com o que já foi gerado. Se bater, vincula em vez de gastar cota. Falas do boss copiam pelo mesmo critério.", "API e banco", "#955, #957"),
    ("4. Expansão", "O conteúdo é expandido numa versão neutra de perfil, que pode ser reaproveitada entre perfis.", "API", "#955"),
    ("5. Mídia", "Texto e áudio com a assinatura editorial e a voz do Guardião. O áudio é juntado por bloco e o deck sai no BrainHexPDF.", "Microservice", "#863, #911"),
    ("6. Falha parcial", "Retoma só a parte que falhou, tenta a voz de reserva e separa cota esgotada de erro comum. Pedidos iguais viram um job só.", "Microservice e API", "#767, #838, #913"),
    ("7. Entrega", "O arquivo vai para o R2, e o cliente lê pelo gateway. Cada material tem revisão própria, então regerar o texto não invalida o áudio.", "Banco e R2", "Decisão do repositório"),
    ("8. Quem vê", "Sem material pronto, o aluno usa o do professor. Em turma de comparação de estudo, o material fica retido. Menor de idade fica sem IA.", "Banco e app", "#774, #933"),
    ("9. Medição", "Relógio por alvo, metas escritas e perfil × formato com supressão de amostra pequena.", "Banco e console", "#817, #871"),
]


def carregar_uso(raiz: Path) -> dict:
    uso = json.loads((raiz / USO).read_text(encoding="utf-8"))
    xp, p, t = uso["xp"], uso["personalizacao"], uso["telemetria"]
    erros = []
    if sum(x[1] for x in xp["por_tipo"]) != xp["eventos"]:
        erros.append("eventos de XP")
    if sum(x[2] for x in xp["por_tipo"]) != xp["pontos"]:
        erros.append("pontos de XP")
    if p["prontos"] + p["falhos"] != p["conteudos"] or sum(m[1] + m[2] for m in p["por_mes"]) != p["conteudos"]:
        erros.append("personalizações")
    if sum(c[1] for c in p["causas"]) != sum(m[4] for m in p["por_mes"]):
        erros.append("causas de falha")
    if sum(p["origem_dos_jobs"].values()) != sum(sum(f[1:]) for f in p["fila"]):
        erros.append("jobs da fila")
    if t["expirados"] + t["erros_de_fila"] != t["com_erro"]:
        erros.append("erros de telemetria")
    if erros:
        raise SystemExit(f"gamificacao: as somas de {USO} não fecham: {', '.join(erros)}")
    return uso


def _tabela(cabecalho: list[str], linhas: list[list], classe: str = "") -> str:
    cab = "".join(f"<th>{c}</th>" for c in cabecalho)
    corpo = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in linha) + "</tr>" for linha in linhas)
    return f'<div class="tabela {classe}"><table><thead><tr>{cab}</tr></thead><tbody>{corpo}</tbody></table></div>'


def _pct(a: int, b: int) -> str:
    return f"{round(100 * a / b)}%" if b else "—"


def _dados(uso: dict) -> str:
    xp, g, p, t = uso["xp"], uso["gamificacao"], uso["personalizacao"], uso["telemetria"]
    ficha = [(f'{p["prontos"]} de {p["conteudos"]}', "personalizações prontas"), (str(p["cards"]), "cards gerados"),
             (str(xp["alunos"]), f'aluno com eventos, de {g["alunos_cadastrados"]}'), (str(xp["eventos"]), "eventos de XP"),
             (str(g["conquistas_concedidas"]), "conquistas concedidas"), (str(g["missoes_concluidas"]), "missões concluídas"),
             (str(t["lotes"]), "lotes de telemetria"), (str(g["molduras_obtidas"]), "molduras obtidas")]
    tiles = "".join(f'<div><span class="v">{a}</span><span class="k">{b}</span></div>' for a, b in ficha)
    meses = [[m[0], m[1], m[2], m[3], m[4], m[5], _pct(m[3], m[3] + m[4] + m[5])] for m in p["por_mes"]]
    usos = [
        ["Missões", f'{g["missoes"]} cadastradas: {g["missoes_sistema"]} do sistema e {g["missoes_ia"]} propostas pela IA ({g["missoes_ia_aprovadas"]} aprovadas, {g["missoes_ia_pendentes"]} pendentes). {g["missoes_concluidas"]} concluídas.'],
        ["Moedas", f'{g["moedas_entradas"]} entradas somando {g["moedas_recebidas"]} moedas, e {g["compras"]} compra de {g["moedas_gastas"]}.'],
        ["Conquistas", f'{g["conquistas_concedidas"]} concedidas. Elas somam 615 dos 1.155 pontos, ou seja, 53% do XP medido.'],
        ["Molduras", f'{g["molduras_obtidas"]} obtidas. O catálogo tem 40, publicadas em 03/11.'],
        ["Boss", f'{g["falas_de_boss"]} linhas de falas geradas. O resultado da batalha não é guardado no banco.'],
        ["Eventos e guildas", f'{g["eventos"]} eventos e {g["guildas"]} guildas.'],
        ["Ranks", f'{g["ranks_abertos"]} rank cadastrado.'],
        ["Tentativas no servidor", f'{g["tentativas_no_servidor"]} linhas, à espera do app que usa a #759.'],
        ["Pontuação por turma", f'{g["pontuacao_por_turma"]} ajustes: toda turma usa os valores padrão.'],
    ]
    return (
        "<p>Um retrato do que aconteceu em produção, sem suavizar. Ele mostra se cada caminho funciona de ponta a ponta. Com esta base, ele não mostra efeito sobre alunos.</p>"
        f'<div class="ficha">{tiles}</div>'
        f'<p class="fine">Medido em {uso["medido_em"]}, só leitura, na revisão <code>{uso["revisao_alembic"]}</code>. Só contagens agregadas, sem identificar aluno nem turma.</p>'
        "<h3>Geração da personalização</h3>"
        "<p>O que derruba a entrega é a mídia: áudio ou apresentação aparecem em 29 dos 31 alvos com falha. Em outubro, a maior parte dos alvos concluiu. Em novembro, quase todos falharam. "
        "“Alvo” é cada pedaço de um job: um conteúdo, um perfil ou uma parte de mídia.</p>"
        + _tabela(["Mês", "Prontas", "Com falha", "Alvos concluídos", "Alvos com falha", "Alvos pulados", "Conclusão"], meses)
        + '<p class="fine">Pulado é perfil que a turma não tem (#873). Personalização com falha pode ter parte do material: 17 linhas têm texto, 16 têm apresentação e 16 têm áudio, em algum estado.</p>'
        "<h4>Por que os alvos falharam</h4>"
        + _tabela(["Motivo registrado", "Alvos"], [list(c) for c in p["causas"]])
        + '<p class="fine">“Sem causa registrada” é uma lacuna real: a mensagem só diz o que faltou. A marca <code>sem_cota_tts</code> veio da #838, e falhas anteriores não a têm. '
        "A geração roda em chaves do plano gratuito do Gemini, então cota é uma condição de operação, não um acidente.</p>"
        "<h4>Fila por tipo de trabalho</h4>"
        + _tabela(["Tipo", "Concluídos", "Com falha", "Parciais"], [list(f) for f in p["fila"]])
        + f'<p class="fine">{p["origem_dos_jobs"]["banco"]} dos {sum(p["origem_dos_jobs"].values())} jobs nasceram no próprio banco, por gatilho ou cron. '
        f'Nos {p["geracao"]["jobs_medidos"]} jobs de geração medidos, a mediana foi de {p["geracao"]["p50_min"]} minutos e o p95 de {p["geracao"]["p95_h"]} horas, contra a meta de 30 minutos. '
        "Esse p95 inclui jobs presos à espera de cota e reprocessamentos.</p>"
        "<h3>Gamificação</h3>"
        + _tabela(["Mecânica", "Medido"], usos)
        + f'<h4>De onde vieram os {xp["pontos"]:,} pontos</h4>'.replace(",", ".")
        + _tabela(["Evento", "Registros", "Pontos"], [list(x) for x in xp["por_tipo"]])
        + f'<p class="fine">Entre {xp["de"]} e {xp["ate"]}, de uma conta só, em {xp["turmas"]} turmas. O valor gravado é o da regra na data: missão diária pagava 0 até 03/11, e parte de “Conteúdo concluído” e “Atividade revisada” também saiu com 0.</p>'
        "<h3>Telemetria que alimenta a personalização</h3>"
        + _tabela(["Medida", "Valor"], [
            ["Lotes e sessões", f'{t["lotes"]} lotes em {t["sessoes"]} sessões, de {t["alunos"]} aluno, entre {t["de"]} e {t["ate"]}'],
            ["Tempo", f'{t["ativo_min"]} minutos ativos e {t["ocioso_min"]} parados com o material aberto'],
            ["Câmera", f'{t["sessoes_com_camera"]} de {t["sessoes"]} sessões com a câmera autorizada'],
            ["Análise", f'{t["com_ciclo"]} lotes viraram ciclo; {t["expirados"]} expiraram sem análise e {t["erros_de_fila"]} deram erro na fila'],
        ])
        + '<p class="fine">Lote expirado é lote que ninguém analisou a tempo: a realimentação por ciclo ainda é a parte menos exercitada do sistema.</p>'
    )


def _fluxo() -> str:
    return (
        "<p>O caminho do conteúdo do professor até a tela do aluno. Cada etapa existe por causa de uma falha medida ou de uma decisão registrada no PR.</p>"
        + _tabela(["Etapa", "O que acontece", "Onde", "Origem"], [[f"<b>{a}</b>", b, c, f'<span class="prs">{d}</span>'] for a, b, c, d in FLUXO])
    )


def _regras(uso: dict) -> str:
    r = uso["regras"]
    def assinar(v: int) -> str:
        return f"{v:+d}".replace("-", "−") if v else "0"
    return (
        '<p>Os valores em vigor. O professor pode mudar pontos e moedas por turma, e hoje nenhuma turma mudou.</p>'
        + _tabela(["Ação", "Pontos", "Moedas", "Observação"], [[a, assinar(b), c, d] for a, b, c, d in r["pontos"]])
        + "<h3>Tipos de rank</h3>"
        + _tabela(["Rank", "O que ordena"], [list(x) for x in r["ranks"]])
        + "<h3>Parâmetros</h3>"
        + _tabela(["Área", "Regra", "Valor", "PR"], [[a, b, c, f'<span class="prs">{d}</span>'] for a, b, c, d in r["parametros"]])
        + '<p class="fine">Tetos anti-abuso ficam de fora de propósito: saber o teto ajuda a burlá-lo.</p>'
    )


def _desenvolvimento(uso: dict) -> str:
    d = uso["desenvolvimento"]
    return (
        f'<p>{d["prs_mesclados"]} PRs mesclados no repositório canônico, entre {d["de"]} e {d["ate"]}. A tabela conta por palavra-chave no título, então um PR pode entrar em mais de um tema, '
        "e PR de correção conta como trabalho. É uma medida de esforço, não de qualidade.</p>"
        + _tabela(["Tema", "Ago", "Set", "Out", "Nov", "Total"], [list(x) for x in d["por_tema"]])
    )


def _evidencias(base: str) -> str:
    partes = []
    for grupo, lista in EVIDENCIAS:
        partes.append(f"<h3>{_e(grupo)}</h3>")
        for ev in lista:
            visto = "".join(f"<li>{_c(x)}</li>" for x in ev["visto"])
            nao = "".join(f"<li>{_c(x)}</li>" for x in ev.get("nao", [])) or '<li class="fine">A descrição não registra limites.</li>'
            imgs = ""
            if ev.get("imagens"):
                imgs = '<div class="galeria compacta">' + "".join(
                    f'<a class="{"larga" if f in LARGAS else ""}" href="{base}{f}" target="_blank" rel="noopener"><img src="{base}{f}" alt="{_e(leg)}" loading="lazy"><span>{_e(leg)}</span></a>'
                    for f, leg in ev["imagens"]) + "</div>"
            nota = f'<p class="fine">{_c(ev["nota"])}</p>' if ev.get("nota") else ""
            partes.append(
                f'<div class="evidencia"><div class="cab"><span class="pr">#{ev["pr"]}</span><span class="data">{ev["data"]}</span><b>{_e(ev["titulo"])}</b></div>'
                f'<div class="colunas"><div><div class="eyebrow">Verificado</div><ul>{visto}</ul></div><div><div class="eyebrow">Não verificado</div><ul>{nao}</ul></div></div>{nota}{imgs}</div>'
            )
    return "".join(partes)


def contar_evidencias() -> int:
    return sum(len(lista) for _, lista in EVIDENCIAS)


def corpo_gamificacao(raiz: Path) -> tuple[str, list[tuple[str, str]], int]:
    cat = carregar_catalogo(raiz)
    uso = carregar_uso(raiz)
    gs = guardioes.ler_guardioes(raiz)
    u = cat["uso"]
    comuns = sum(1 for c in cat["conquistas"] if not c.get("perfil"))
    perfil = len(cat["conquistas"]) - comuns
    n = {o: sum(1 for m in cat["molduras"] if m["origem"] == o) for o in ORIGEM}
    n_conq_moldura = sum(1 for c in cat["conquistas"] if c.get("moldura"))
    ficha = [(str(len(cat["faixas"])), "faixas de XP"), (str(len(cat["conquistas"])), f"conquistas do sistema ({comuns} comuns, {perfil} por perfil)"),
             (str(len(cat["molduras"])), f'molduras ({n["loja"]} loja, {n["conquista"]} desafio, {n["acao"]} ação)'),
             (str(len(cat["itens"])), "itens na loja"), (str(u["missoes"]), "missões cadastradas"), (str(u["alunos"]), "alunos em produção"),
             (str(u["eventos"]), "eventos em produção"), (str(u["guildas"]), "guildas em produção")]
    tiles = "".join(f'<div><span class="v">{a}</span><span class="k">{b}</span></div>' for a, b in ficha)
    mec = "".join(f'<tr><td><b>{t}</b></td><td>{r}</td><td class="prs">{p}</td></tr>' for t, p, r in MECANICAS)
    camadas = "".join(f'<div class="card"><div class="top"><span class="name">{_e(t)}</span></div><p>{_e(r)}</p><p class="fine">{_e(p)}</p></div>' for t, r, p in PERSONALIZACAO)
    avisos = "".join(f"<li>{x}</li>" for x in NAO_AFIRMA)
    fontes = "".join(f"<li><code>{_e(f)}</code></li>" for f in FONTES.values())
    if n_conq_moldura != n["conquista"]:
        raise SystemExit("gamificacao: toda moldura de desafio precisa de uma conquista")

    corpo = (
        "<p>O TrailUp é o mesmo jogo para todos, com sete peles. O percurso, as regras e o que vale nota são iguais. "
        "O que muda por perfil BrainHex é o tom do material, a cor, a arte, a forma da trilha e o que ganha destaque na tela. "
        "Esta página reúne o desenho, a paleta, os elementos visuais agrupados e o que os PRs verificaram.</p>"
        f'<div class="ficha">{tiles}</div>'
        f'<p class="fine">Catálogo e contagens medidos em produção em {cat["medido_em"]}, só leitura, na revisão <code>{cat["revisao_alembic"]}</code>. Os dados de tela nas capturas são simulados.</p>'
        '<h2 id="o-que-nao-afirma">O que esta página não afirma</h2>'
        f'<ul class="avisos">{avisos}</ul>'
        '<h2 id="dados">Dados de uso em produção</h2>'
        + _dados(uso)
        + '<h2 id="design">Design</h2>'
        "<h3>Princípios</h3><div class=\"cards\">"
        '<div class="card"><div class="top"><span class="name">Uma estrutura, sete peles</span></div><p>Lugar e tamanho dos controles são fixos. Cor, emblema e título mudam, e o aluno de outro perfil continua reconhecendo a tela.</p><p class="fine">#796, #828, #930</p></div>'
        '<div class="card"><div class="top"><span class="name">Competir é opcional</span></div><p>Entrar no rank do evento não muda nota nem XP, e recusar um duelo não custa posição. O texto na tela diz isso.</p><p class="fine">#916, #923</p></div>'
        '<div class="card"><div class="top"><span class="name">Sem exposição</span></div><p>O aluno vê o topo e a própria linha, não quem está no fim da turma. O professor vê todos. O estado vazio aponta o que fazer.</p><p class="fine">#162, #790</p></div>'
        '<div class="card"><div class="top"><span class="name">Moeda não compra nota</span></div><p>Gastar nunca muda XP nem posição. Item ajuda a estudar, moldura é cosmética, e prêmio de desafio não mexe no ranking.</p><p class="fine">#196, #1011</p></div>'
        '<div class="card"><div class="top"><span class="name">A regra mora no banco</span></div><p>Saldo, conquista, abertura de evento e XP de concluir conteúdo são decididos no banco, e seguem com a API fora do ar. A exceção são os desafios de precisão, declarada acima.</p><p class="fine">#196, #495, #1008</p></div>'
        '<div class="card"><div class="top"><span class="name">Contraste antes de enfeite</span></div><p>A cor do perfil sobe de luminosidade até passar no contraste, sem misturar com branco, para não desbotar.</p><p class="fine">Regra do repositório</p></div>'
        "</div>"
        "<h3>Tipografia e forma</h3><ul>"
        "<li><b>Títulos em serifa</b> (Georgia), dando peso de jornada às telas. <b>Corpo e números na fonte do sistema</b>, para leitura rápida em tela pequena.</li>"
        "<li><b>Cartões escuros</b> com borda de 1 px na cor do perfil, cantos grandes e uma única ação principal preenchida.</li>"
        "<li><b>Três universos visuais</b> agrupam os perfis: mágico (Seeker, Socializer), medieval (Conqueror, Survivor, Daredevil) e real (Mastermind, Achiever). Ver <code>resolveSystemVisualTheme</code>.</li></ul>"

        '<h2 id="paleta">Paleta de cores</h2>'
        "<p><code>primary</code> é a cor-assinatura oficial, <code>secondary</code> é ela escurecida, <code>accent</code> é ela clareada e <code>background</code> é ela quase preta. "
        "O número à direita é o contraste do <code>accent</code> sobre o <code>background</code>, calculado nesta geração pela fórmula WCAG. O app deriva a variante final na hora, então a cor na tela pode ser mais clara que estas.</p>"
        + _paleta(gs)
        + "<h3>Console do professor</h3><p>Um único tema, sem pele por perfil: o professor trabalha com a turma inteira. As cores de estado são fixas e não derivam do perfil.</p>"
        + _tira_console(raiz)

        + '<h2 id="personalizacao">Personalização</h2>'
        f'<div class="cards">{camadas}</div>'
        "<h3>O que muda por perfil</h3>"
        + _capacidades(gs)
        + '<p class="fine">Fichas completas, com voz e assinatura editorial, em <a href="guardioes.html">Os sete Guardiões</a>.</p>'
        + '<h3 id="fluxo">Do conteúdo do professor à tela do aluno</h3>'
        + _fluxo()

        + '<h2 id="gamificacao">Gamificação</h2>'
        "<h3>As mecânicas</h3>"
        f'<div class="tabela"><table class="mec"><thead><tr><th>Mecânica</th><th>Regra</th><th>PRs</th></tr></thead><tbody>{mec}</tbody></table></div>'
        "<h3>Faixas de XP</h3>"
        + _faixas(cat)
        + '<h3 id="regras">Regras em números</h3>'
        + _regras(uso)
        + "<h3>Itens da loja</h3><p>Preço-base em moedas. O professor pode ajustar o preço por turma.</p>"
        + _loja(cat)
        + '<h2 id="conquistas">Conquistas</h2>'
        "<p>A miniatura à direita é a moldura que a conquista libera.</p>"
        + _conquistas(cat, gs)

        + '<h2 id="biblioteca">Biblioteca de elementos</h2>'
        "<p>Todos os elementos visuais do app, agrupados por função. As imagens são reduções dos arquivos do app, geradas para esta página.</p>"
        '<h3 id="bib-componentes">Componentes de tela</h3>'
        + _componentes(gs)
        + '<h3 id="bib-molduras">Molduras</h3>'
        + _molduras(cat)
        + '<h3 id="bib-identidade">Identidade por perfil</h3><p>O conjunto que dá a cara de cada perfil.</p>'
        + _identidade(gs)
        + '<h3 id="bib-icones">Ícones por perfil</h3><p>O mesmo significado desenhado sete vezes. A matriz rola de lado no celular.</p>'
        + _matriz_utilidades()
        + '<h3 id="bib-objetos">Objetos</h3><p>Ilustrações neutras, sem perfil.</p>'
        + _objetos()
        + '<h3 id="bib-ranking">Ícones de ranking</h3><div class="linha-img">'
        + "".join(f'<img src="midia/gamificacao/biblioteca/rank/{i}.png" alt="Ícone de ranking {i}" width="72" height="72" loading="lazy">' for i in (1, 2, 3, 4))
        + '</div><h3 id="bib-bosses">Bosses</h3><p>Trinta artes que o professor escolhe por conteúdo. O nome e as falas vêm do modelo, por perfil.</p><div class="bosses">'
        + "".join(f'<img src="midia/gamificacao/biblioteca/bosses/boss-{i:02d}.png" alt="Boss {i}" width="96" height="96" loading="lazy">' for i in range(1, 31))
        + "</div>"

        + '<h2 id="evidencias">Evidências nos PRs</h2>'
        "<p>O que cada PR afirmou ter visto e o que deixou de fora. Os números são do repositório canônico, que é privado, então as capturas foram copiadas para cá. "
        "“Não verificado” repete o limite que o PR declarou. Quando a descrição não declara nenhum, a página diz isso, e isso não significa que nada faltou. "
        "A situação de cada migration é a da data do PR: hoje todas estão em produção.</p>"
        + "<h3>Ritmo de desenvolvimento</h3>"
        + _desenvolvimento(uso)
        + _evidencias("midia/gamificacao/evidencias/")
        + '<h2 id="fontes">Fontes</h2>'
        f'<ul class="fontes">{fontes}</ul>'
    )
    toc = [("o-que-nao-afirma", "O que não afirma"), ("dados", "Dados de uso"), ("design", "Design"), ("paleta", "Paleta de cores"), ("personalizacao", "Personalização"),
           ("gamificacao", "Gamificação"), ("conquistas", "Conquistas"), ("biblioteca", "Biblioteca de elementos"), ("evidencias", "Evidências nos PRs"), ("fontes", "Fontes")]
    return corpo, toc, contar_evidencias()
