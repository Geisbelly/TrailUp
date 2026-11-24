// GERADO por scripts/pesquisa-avaliacao/extrair-formulario.mjs a partir do formulário publicado.
// Não edite à mão: rode o script de novo se o formulário mudar.

import type { EspelhoDaAvaliacao } from "./formularioDeAvaliacao";

export const ESPELHO_DA_AVALIACAO: EspelhoDaAvaliacao = {
  "idSha256": "6cb32cee3c47eacfa12be3c903d0efd9d70cfee13e40403e3343069b01f11966",
  "titulo": "Avaliação do TrailUp por professores",
  "descricao": "Pesquisa de Trabalho de Conclusão de Curso (Ciência da Computação, Ulbra Palmas).\nEste é o formulário de avaliação, para quem já se inscreveu e recebeu o acesso por e-mail. Cartilha do professor: https://trailup.vercel.app/pesquisa/professores\n\nA pesquisa se alimenta tanto de resultados negativos quanto de positivos. Uma tarefa difícil, uma métrica confusa ou um material gerado com erro é exatamente o que precisa aparecer: é isso que mostra o que corrigir antes de o sistema chegar a alunos. Nota dada por gentileza atrapalha a pesquisa; crítica franca ajuda.",
  "codigo": null,
  "paginas": [
    {
      "titulo": "",
      "ajuda": "",
      "itens": [
        {
          "tipo": "texto",
          "titulo": "E-mail cadastrado na inscrição (o mesmo do seu login)",
          "ajuda": "",
          "entry": "entry.641205283",
          "email": true
        }
      ]
    },
    {
      "titulo": "Antes de começar o roteiro",
      "ajuda": "Abra o TrailUp em outra aba (https://trailup.vercel.app) e entre com o seu e-mail e a senha que a equipe enviou. A turma é de demonstração. Pode usar conteúdo seu, mas sem dados de alunos reais. O aluno é só o seu aluno de teste.\n\nEsta rodada avalia o TrailUp no formato base: as telas, as métricas e o material. Não avalia as sugestões da IA sobre alunos, a busca por aluno que precisa de atenção nem a correção de entregas, porque isso depende de alunos com histórico, e a turma de demonstração não tem. As métricas aparecem com valores de exemplo, marcados como tais: julgue se entende cada uma e se a visualização é clara, não o número.\n\nFaça cada tarefa no sistema e volte aqui para responder.\n\nA pesquisa se alimenta tanto de resultados negativos quanto de positivos. Uma tarefa difícil, uma métrica confusa ou um material gerado com erro é exatamente o que precisa aparecer: é isso que mostra o que corrigir antes de o sistema chegar a alunos. Nota dada por gentileza atrapalha a pesquisa; crítica franca ajuda.",
      "itens": []
    },
    {
      "titulo": "T1. Conhecer a turma",
      "ajuda": "• Em Turmas, abra a turma de demonstração.\n• Veja quem está matriculado e o perfil de cada aluno.",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "T1 · Você conseguiu fazer a tarefa?",
          "ajuda": "",
          "entry": "entry.1856530742",
          "opcoes": [
            "Sim",
            "Em parte",
            "Não",
            "Não tentei"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "T1 · No geral, esta tarefa foi:",
          "ajuda": "",
          "entry": "entry.1190131733",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Muito difícil",
            "Muito fácil"
          ]
        },
        {
          "tipo": "escolha",
          "titulo": "T1 · Quanto tempo levou, mais ou menos?",
          "ajuda": "",
          "entry": "entry.282277209",
          "opcoes": [
            "Menos de 2 min",
            "De 2 a 5 min",
            "De 5 a 10 min",
            "Mais de 10 min"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "T1 · Onde travou, o que confundiu ou o que faltou? (opcional)",
          "ajuda": "",
          "entry": "entry.1443028868"
        }
      ]
    },
    {
      "titulo": "T2. Explorar a trilha",
      "ajuda": "• Em Trilhas, abra a trilha da turma.\n• Entre num tópico e veja os conteúdos, as atividades e as questões.",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "T2 · Você conseguiu fazer a tarefa?",
          "ajuda": "",
          "entry": "entry.620244913",
          "opcoes": [
            "Sim",
            "Em parte",
            "Não",
            "Não tentei"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "T2 · No geral, esta tarefa foi:",
          "ajuda": "",
          "entry": "entry.1360553905",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Muito difícil",
            "Muito fácil"
          ]
        },
        {
          "tipo": "escolha",
          "titulo": "T2 · Quanto tempo levou, mais ou menos?",
          "ajuda": "",
          "entry": "entry.1605162146",
          "opcoes": [
            "Menos de 2 min",
            "De 2 a 5 min",
            "De 5 a 10 min",
            "Mais de 10 min"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "T2 · Onde travou, o que confundiu ou o que faltou? (opcional)",
          "ajuda": "",
          "entry": "entry.1062725613"
        }
      ]
    },
    {
      "titulo": "T3. Ver e pedir uma personalização",
      "ajuda": "• Em Personalizações, veja os perfis da turma e o material de um perfil.\n• Se quiser, peça uma geração por IA, sobre o conteúdo da turma ou sobre um conteúdo seu (ela pode levar alguns minutos ou não sair, por causa do limite gratuito do modelo).",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "T3 · Você conseguiu fazer a tarefa?",
          "ajuda": "",
          "entry": "entry.637669018",
          "opcoes": [
            "Sim",
            "Em parte",
            "Não",
            "Não tentei"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "T3 · No geral, esta tarefa foi:",
          "ajuda": "",
          "entry": "entry.1551742160",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Muito difícil",
            "Muito fácil"
          ]
        },
        {
          "tipo": "escolha",
          "titulo": "T3 · Quanto tempo levou, mais ou menos?",
          "ajuda": "",
          "entry": "entry.392345829",
          "opcoes": [
            "Menos de 2 min",
            "De 2 a 5 min",
            "De 5 a 10 min",
            "Mais de 10 min"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "T3 · Onde travou, o que confundiu ou o que faltou? (opcional)",
          "ajuda": "",
          "entry": "entry.262915242"
        }
      ]
    },
    {
      "titulo": "T4. Ler as métricas da turma",
      "ajuda": "• Na Visão geral, com a turma de demonstração selecionada, veja os painéis com o selo de exemplo.\n• Em cada métrica, abra a explicação (o ícone ao lado do nome) e diga para você mesmo o que ela mostra.",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "T4 · Você conseguiu fazer a tarefa?",
          "ajuda": "",
          "entry": "entry.1707616585",
          "opcoes": [
            "Sim",
            "Em parte",
            "Não",
            "Não tentei"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "T4 · No geral, esta tarefa foi:",
          "ajuda": "",
          "entry": "entry.1746596597",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Muito difícil",
            "Muito fácil"
          ]
        },
        {
          "tipo": "escolha",
          "titulo": "T4 · Quanto tempo levou, mais ou menos?",
          "ajuda": "",
          "entry": "entry.322782977",
          "opcoes": [
            "Menos de 2 min",
            "De 2 a 5 min",
            "De 5 a 10 min",
            "Mais de 10 min"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "T4 · Onde travou, o que confundiu ou o que faltou? (opcional)",
          "ajuda": "",
          "entry": "entry.1124075715"
        }
      ]
    },
    {
      "titulo": "T5. Entender o jogo da turma",
      "ajuda": "• Passe por Economia, Missões, Eventos e Conquistas.\n• Veja como as moedas, a loja, as missões e os eventos estão configurados.",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "T5 · Você conseguiu fazer a tarefa?",
          "ajuda": "",
          "entry": "entry.24025793",
          "opcoes": [
            "Sim",
            "Em parte",
            "Não",
            "Não tentei"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "T5 · No geral, esta tarefa foi:",
          "ajuda": "",
          "entry": "entry.67746653",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Muito difícil",
            "Muito fácil"
          ]
        },
        {
          "tipo": "escolha",
          "titulo": "T5 · Quanto tempo levou, mais ou menos?",
          "ajuda": "",
          "entry": "entry.35643724",
          "opcoes": [
            "Menos de 2 min",
            "De 2 a 5 min",
            "De 5 a 10 min",
            "Mais de 10 min"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "T5 · Onde travou, o que confundiu ou o que faltou? (opcional)",
          "ajuda": "",
          "entry": "entry.800152129"
        }
      ]
    },
    {
      "titulo": "T6. Ver a competição",
      "ajuda": "• Abra Rankings, Rank de batalhas e Guildas.",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "T6 · Você conseguiu fazer a tarefa?",
          "ajuda": "",
          "entry": "entry.825073743",
          "opcoes": [
            "Sim",
            "Em parte",
            "Não",
            "Não tentei"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "T6 · No geral, esta tarefa foi:",
          "ajuda": "",
          "entry": "entry.548530499",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Muito difícil",
            "Muito fácil"
          ]
        },
        {
          "tipo": "escolha",
          "titulo": "T6 · Quanto tempo levou, mais ou menos?",
          "ajuda": "",
          "entry": "entry.516055905",
          "opcoes": [
            "Menos de 2 min",
            "De 2 a 5 min",
            "De 5 a 10 min",
            "Mais de 10 min"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "T6 · Onde travou, o que confundiu ou o que faltou? (opcional)",
          "ajuda": "",
          "entry": "entry.1073990895"
        }
      ]
    },
    {
      "titulo": "T7. Estudar como aluno",
      "ajuda": "• Entre com o seu acesso de aluno de teste.\n• Abra a trilha, um tópico e o material personalizado (texto, áudio ou apresentação).",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "T7 · Você conseguiu fazer a tarefa?",
          "ajuda": "",
          "entry": "entry.1778923387",
          "opcoes": [
            "Sim",
            "Em parte",
            "Não",
            "Não tentei"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "T7 · No geral, esta tarefa foi:",
          "ajuda": "",
          "entry": "entry.2111642502",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Muito difícil",
            "Muito fácil"
          ]
        },
        {
          "tipo": "escolha",
          "titulo": "T7 · Quanto tempo levou, mais ou menos?",
          "ajuda": "",
          "entry": "entry.115701311",
          "opcoes": [
            "Menos de 2 min",
            "De 2 a 5 min",
            "De 5 a 10 min",
            "Mais de 10 min"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "T7 · Onde travou, o que confundiu ou o que faltou? (opcional)",
          "ajuda": "",
          "entry": "entry.885267354"
        }
      ]
    },
    {
      "titulo": "T8. Ver o jogo pelo lado do aluno",
      "ajuda": "• Ainda como aluno, abra as missões, a loja e o ranking.",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "T8 · Você conseguiu fazer a tarefa?",
          "ajuda": "",
          "entry": "entry.1133932629",
          "opcoes": [
            "Sim",
            "Em parte",
            "Não",
            "Não tentei"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "T8 · No geral, esta tarefa foi:",
          "ajuda": "",
          "entry": "entry.807302013",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Muito difícil",
            "Muito fácil"
          ]
        },
        {
          "tipo": "escolha",
          "titulo": "T8 · Quanto tempo levou, mais ou menos?",
          "ajuda": "",
          "entry": "entry.874344277",
          "opcoes": [
            "Menos de 2 min",
            "De 2 a 5 min",
            "De 5 a 10 min",
            "Mais de 10 min"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "T8 · Onde travou, o que confundiu ou o que faltou? (opcional)",
          "ajuda": "",
          "entry": "entry.937782592"
        }
      ]
    },
    {
      "titulo": "Usabilidade",
      "ajuda": "Pensando no sistema como um todo, de 1 (discordo fortemente) a 5 (concordo fortemente).",
      "itens": [
        {
          "tipo": "escala",
          "titulo": "SUS 1. Eu acho que gostaria de usar esse sistema frequentemente.",
          "ajuda": "",
          "entry": "entry.1232227960",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 2. Eu achei esse sistema desnecessariamente complexo.",
          "ajuda": "",
          "entry": "entry.1336119929",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 3. Eu achei esse sistema fácil de usar.",
          "ajuda": "",
          "entry": "entry.2044350671",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 4. Eu achei que precisaria de ajuda de uma pessoa técnica para ser capaz de usar esse sistema.",
          "ajuda": "",
          "entry": "entry.1132718203",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 5. Eu achei que as várias funções desse sistema foram bem integradas.",
          "ajuda": "",
          "entry": "entry.1777268307",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 6. Eu acho que o sistema apresenta muita inconsistência.",
          "ajuda": "",
          "entry": "entry.2126807729",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 7. Eu imagino que a maioria das pessoas pode aprender a usar esse sistema rapidamente.",
          "ajuda": "",
          "entry": "entry.1251645974",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 8. Eu achei esse sistema muito pesado para usar.",
          "ajuda": "",
          "entry": "entry.621886530",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 9. Eu me senti muito seguro usando o sistema.",
          "ajuda": "",
          "entry": "entry.679305958",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "SUS 10. Eu precisei aprender muitas coisas antes que pudesse utilizar esse sistema.",
          "ajuda": "",
          "entry": "entry.2075639735",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5"
          ],
          "rotulos": [
            "Discordo fortemente",
            "Concordo fortemente"
          ]
        }
      ]
    },
    {
      "titulo": "Carga de trabalho",
      "ajuda": "Pensando nas tarefas do console como um todo, de 0 (pouquíssimo) a 10 (muitíssimo). Não há resposta certa: é a sua impressão.",
      "itens": [
        {
          "tipo": "escala",
          "titulo": "TLX · Demanda mental",
          "ajuda": "Quanto raciocínio, decisão ou cálculo as tarefas exigiram?",
          "entry": "entry.1400787678",
          "valores": [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Pouquíssimo",
            "Muitíssimo"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "TLX · Demanda física",
          "ajuda": "Quanta atividade física as tarefas exigiram?",
          "entry": "entry.1254047161",
          "valores": [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Pouquíssimo",
            "Muitíssimo"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "TLX · Demanda temporal",
          "ajuda": "Quanta pressão de tempo você sentiu para fazer as tarefas?",
          "entry": "entry.2057489998",
          "valores": [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Pouquíssimo",
            "Muitíssimo"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "TLX · Desempenho",
          "ajuda": "Quanto você conseguiu fazer, de forma satisfatória, o que as tarefas pediam?",
          "entry": "entry.666305739",
          "valores": [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Pouquíssimo",
            "Muitíssimo"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "TLX · Esforço",
          "ajuda": "Quanto esforço foi necessário para atingir o seu nível de desempenho nas tarefas?",
          "entry": "entry.1789519684",
          "valores": [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Pouquíssimo",
            "Muitíssimo"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "TLX · Frustração",
          "ajuda": "Quanta frustração (irritação, insegurança, desânimo) você sentiu durante as tarefas?",
          "entry": "entry.1216200832",
          "valores": [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Pouquíssimo",
            "Muitíssimo"
          ]
        }
      ]
    },
    {
      "titulo": "As métricas do console",
      "ajuda": "Pensando na Visão geral e no detalhe dos alunos, de 1 (discordo totalmente) a 10 (concordo totalmente). A turma é de demonstração: responda como seria com uma turma sua.",
      "itens": [
        {
          "tipo": "escala",
          "titulo": "EFLA D1. Está claro quais dados dos alunos o console usa.",
          "ajuda": "",
          "entry": "entry.302370143",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "EFLA D2. Está claro por que esses dados são usados.",
          "ajuda": "",
          "entry": "entry.984702718",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "EFLA A1. O console me deixaria ciente da situação atual de aprendizagem dos alunos.",
          "ajuda": "",
          "entry": "entry.1271604623",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "EFLA A2. O console me ajudaria a prever como os alunos vão estar, se continuarem como estão ou se mudarem.",
          "ajuda": "",
          "entry": "entry.1830458188",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "EFLA R1. O console me estimularia a refletir sobre a minha prática de ensino.",
          "ajuda": "",
          "entry": "entry.3809250",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "EFLA R2. O console me estimularia a adaptar a minha prática, se necessário.",
          "ajuda": "",
          "entry": "entry.1326164823",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "EFLA I2. O console me estimularia a ensinar de forma mais eficiente.",
          "ajuda": "",
          "entry": "entry.74854775",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "EFLA I3. O console me estimularia a ensinar de forma mais eficaz.",
          "ajuda": "",
          "entry": "entry.1775301547",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "Se as métricas da Visão geral fossem da minha turma, eu tomaria alguma ação.",
          "ajuda": "",
          "entry": "entry.43439490",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "Discordo totalmente",
            "Concordo totalmente"
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "Que ação você tomaria, e para quem: a turma toda, alguns alunos, o planejamento do curso? Ou esperaria para ver? (opcional)",
          "ajuda": "",
          "entry": "entry.1468350749"
        },
        {
          "tipo": "escala",
          "titulo": "Quanto você acha que essas métricas refletiriam a realidade de uma turma de verdade?",
          "ajuda": "",
          "entry": "entry.1292791031",
          "valores": [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10"
          ],
          "rotulos": [
            "0% (nada)",
            "100% (totalmente)"
          ]
        },
        {
          "tipo": "grade",
          "titulo": "Métricas, uma a uma",
          "ajuda": "Os valores da turma de demonstração são de exemplo: julgue o painel, não o número. Para cada métrica, marque o que vale para ela. Pode marcar mais de uma, ou nenhuma.",
          "multipla": true,
          "colunas": [
            "Entendi o que mostra",
            "A visualização é clara",
            "Faria algo diferente na aula por causa dele"
          ],
          "linhas": [
            {
              "rotulo": "Conclusão média",
              "entry": "entry.1782286807"
            },
            {
              "rotulo": "Taxa de acertos",
              "entry": "entry.1458091185"
            },
            {
              "rotulo": "Tempo ativo médio",
              "entry": "entry.2054076645"
            },
            {
              "rotulo": "Retorno semanal",
              "entry": "entry.1166578960"
            },
            {
              "rotulo": "Abandono médio",
              "entry": "entry.855148775"
            },
            {
              "rotulo": "Abandono por perfil",
              "entry": "entry.2062348454"
            },
            {
              "rotulo": "Inatividade por perfil",
              "entry": "entry.547107171"
            },
            {
              "rotulo": "Distribuição de notas",
              "entry": "entry.1840154773"
            }
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "Alguma métrica faltou, sobrou ou confundiu? Qual e por quê? (opcional)",
          "ajuda": "",
          "entry": "entry.124567278"
        }
      ]
    },
    {
      "titulo": "Material personalizado",
      "ajuda": "Algumas frases são negativas de propósito: leia cada uma antes de marcar. Se não viu o recurso, marque \"Não observei\".",
      "itens": [
        {
          "tipo": "grade",
          "titulo": "Material personalizado",
          "ajuda": "",
          "multipla": false,
          "colunas": [
            "Discordo totalmente",
            "Discordo",
            "Nem concordo nem discordo",
            "Concordo",
            "Concordo totalmente",
            "Não observei"
          ],
          "linhas": [
            {
              "rotulo": "O conteúdo está correto, sem erros.",
              "entry": "entry.856215921"
            },
            {
              "rotulo": "O material está alinhado ao objetivo do tópico.",
              "entry": "entry.103969846"
            },
            {
              "rotulo": "O nível e a linguagem servem a um aluno de graduação.",
              "entry": "entry.1665189062"
            },
            {
              "rotulo": "A apresentação (texto, áudio ou slides) é clara.",
              "entry": "entry.1142540336"
            },
            {
              "rotulo": "As versões para perfis diferentes são diferentes de um jeito que faz sentido.",
              "entry": "entry.1306482738"
            },
            {
              "rotulo": "Eu liberaria esse material para os alunos sem precisar editar.",
              "entry": "entry.775006706"
            }
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "Algum erro ou problema no material? Em que tópico e perfil? (opcional)",
          "ajuda": "",
          "entry": "entry.1161167696"
        }
      ]
    },
    {
      "titulo": "Interface do aluno",
      "ajuda": "Algumas frases são negativas de propósito: leia cada uma antes de marcar. Se não viu o recurso, marque \"Não observei\".",
      "itens": [
        {
          "tipo": "escala",
          "titulo": "UEQ-S 1. Para você, a tela do aluno é:",
          "ajuda": "",
          "entry": "entry.320695975",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Atrapalha",
            "Ajuda"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "UEQ-S 2. Para você, a tela do aluno é:",
          "ajuda": "",
          "entry": "entry.1477589762",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Complicado",
            "Fácil"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "UEQ-S 3. Para você, a tela do aluno é:",
          "ajuda": "",
          "entry": "entry.1488467105",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Ineficiente",
            "Eficiente"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "UEQ-S 4. Para você, a tela do aluno é:",
          "ajuda": "",
          "entry": "entry.970619625",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Confuso",
            "Claro"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "UEQ-S 5. Para você, a tela do aluno é:",
          "ajuda": "",
          "entry": "entry.1199498517",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Chato",
            "Empolgante"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "UEQ-S 6. Para você, a tela do aluno é:",
          "ajuda": "",
          "entry": "entry.1128857517",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Desinteressante",
            "Interessante"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "UEQ-S 7. Para você, a tela do aluno é:",
          "ajuda": "",
          "entry": "entry.480839274",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Convencional",
            "Original"
          ]
        },
        {
          "tipo": "escala",
          "titulo": "UEQ-S 8. Para você, a tela do aluno é:",
          "ajuda": "",
          "entry": "entry.1197951884",
          "valores": [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          "rotulos": [
            "Comum",
            "Inovador"
          ]
        },
        {
          "tipo": "grade",
          "titulo": "Interface do aluno",
          "ajuda": "",
          "multipla": false,
          "colunas": [
            "Discordo totalmente",
            "Discordo",
            "Nem concordo nem discordo",
            "Concordo",
            "Concordo totalmente",
            "Não observei"
          ],
          "linhas": [
            {
              "rotulo": "A interface do aluno deixa claro o que fazer a seguir.",
              "entry": "entry.280072051"
            },
            {
              "rotulo": "O material personalizado é fácil de encontrar e de abrir.",
              "entry": "entry.1525147064"
            },
            {
              "rotulo": "Os textos e botões estão numa linguagem que o aluno entende.",
              "entry": "entry.726888972"
            },
            {
              "rotulo": "A interface do aluno é adequada a estudantes de graduação.",
              "entry": "entry.192784450"
            }
          ]
        },
        {
          "tipo": "paragrafo",
          "titulo": "Encontrou algum problema na tela do aluno? Qual e em que tela? (opcional)",
          "ajuda": "",
          "entry": "entry.966810605"
        }
      ]
    },
    {
      "titulo": "Utilidade e intenção de uso",
      "ajuda": "Algumas frases são negativas de propósito: leia cada uma antes de marcar. Se não viu o recurso, marque \"Não observei\".",
      "itens": [
        {
          "tipo": "grade",
          "titulo": "Utilidade e intenção de uso",
          "ajuda": "",
          "multipla": false,
          "colunas": [
            "Discordo totalmente",
            "Discordo",
            "Nem concordo nem discordo",
            "Concordo",
            "Concordo totalmente",
            "Não observei"
          ],
          "linhas": [
            {
              "rotulo": "Usar o TrailUp me ajudaria a acompanhar a aprendizagem da turma.",
              "entry": "entry.892856330"
            },
            {
              "rotulo": "Usar o TrailUp tornaria meu trabalho de professor mais eficaz.",
              "entry": "entry.1201713127"
            },
            {
              "rotulo": "O TrailUp seria útil na minha disciplina.",
              "entry": "entry.1642201852"
            },
            {
              "rotulo": "Eu usaria o TrailUp com uma turma minha, se estivesse disponível.",
              "entry": "entry.1105532207"
            },
            {
              "rotulo": "Eu recomendaria o TrailUp a outro professor.",
              "entry": "entry.337595548"
            }
          ]
        }
      ]
    },
    {
      "titulo": "Esforço e rotina",
      "ajuda": "Algumas frases são negativas de propósito: leia cada uma antes de marcar. Se não viu o recurso, marque \"Não observei\".",
      "itens": [
        {
          "tipo": "grade",
          "titulo": "Esforço e rotina",
          "ajuda": "",
          "multipla": false,
          "colunas": [
            "Discordo totalmente",
            "Discordo",
            "Nem concordo nem discordo",
            "Concordo",
            "Concordo totalmente",
            "Não observei"
          ],
          "linhas": [
            {
              "rotulo": "O tempo que o sistema exigiria por semana cabe na minha rotina.",
              "entry": "entry.1096567208"
            },
            {
              "rotulo": "Montar a trilha de um tópico seria rápido o bastante.",
              "entry": "entry.202461631"
            },
            {
              "rotulo": "Revisar o material gerado pela IA antes de chegar ao aluno seria viável na minha rotina.",
              "entry": "entry.1654707120"
            },
            {
              "rotulo": "Eu saberia por onde começar no console sem ajuda.",
              "entry": "entry.852808504"
            }
          ]
        }
      ]
    },
    {
      "titulo": "Gamificação (opcional)",
      "ajuda": "Algumas frases são negativas de propósito: leia cada uma antes de marcar. Se não viu o recurso, marque \"Não observei\". Se preferir, pule esta página.",
      "itens": [
        {
          "tipo": "grade",
          "titulo": "Gamificação",
          "ajuda": "",
          "multipla": false,
          "colunas": [
            "Discordo totalmente",
            "Discordo",
            "Nem concordo nem discordo",
            "Concordo",
            "Concordo totalmente",
            "Não observei"
          ],
          "linhas": [
            {
              "rotulo": "Os elementos de jogo combinam com a minha disciplina.",
              "entry": "entry.1876953568"
            },
            {
              "rotulo": "O jogo apoia o estudo, em vez de competir com ele.",
              "entry": "entry.1909001041"
            },
            {
              "rotulo": "O ranking pode desmotivar alunos que estão atrás.",
              "entry": "entry.1935683927"
            },
            {
              "rotulo": "Tenho controle suficiente sobre moedas, missões e eventos da turma.",
              "entry": "entry.129231967"
            }
          ]
        }
      ]
    },
    {
      "titulo": "Dados dos alunos e ética (opcional)",
      "ajuda": "Algumas frases são negativas de propósito: leia cada uma antes de marcar. Se não viu o recurso, marque \"Não observei\". Se preferir, pule esta página.",
      "itens": [
        {
          "tipo": "grade",
          "titulo": "Dados dos alunos e ética",
          "ajuda": "",
          "multipla": false,
          "colunas": [
            "Discordo totalmente",
            "Discordo",
            "Nem concordo nem discordo",
            "Concordo",
            "Concordo totalmente",
            "Não observei"
          ],
          "linhas": [
            {
              "rotulo": "O sistema não considera fatores sociais e emocionais que só o professor conhece.",
              "entry": "entry.560285568"
            },
            {
              "rotulo": "O sistema preserva a minha autonomia de decidir.",
              "entry": "entry.1574910114"
            },
            {
              "rotulo": "O uso de dados de emoção e de comportamento traz riscos à privacidade dos alunos.",
              "entry": "entry.252440660"
            },
            {
              "rotulo": "O perfil e os indicadores podem rotular o aluno de forma injusta.",
              "entry": "entry.781468003"
            },
            {
              "rotulo": "Eu saberia explicar a um aluno o que eu vejo sobre ele no console.",
              "entry": "entry.201729833"
            }
          ]
        }
      ]
    },
    {
      "titulo": "Com as suas palavras",
      "ajuda": "",
      "itens": [
        {
          "tipo": "paragrafo",
          "titulo": "O que você usaria toda semana?",
          "ajuda": "",
          "entry": "entry.1605397036"
        },
        {
          "tipo": "paragrafo",
          "titulo": "O que confundiu ou atrapalhou?",
          "ajuda": "",
          "entry": "entry.2091021830"
        },
        {
          "tipo": "paragrafo",
          "titulo": "O que preocupa você nos dados ou na IA?",
          "ajuda": "",
          "entry": "entry.1479955389"
        },
        {
          "tipo": "paragrafo",
          "titulo": "O que falta para você usar o TrailUp com uma turma sua?",
          "ajuda": "",
          "entry": "entry.1520295634"
        }
      ]
    },
    {
      "titulo": "Por último: como a sua avaliação aparece",
      "ajuda": "Você pode trocar esta escolha quando quiser: https://docs.google.com/forms/d/e/1FAIpQLSeGLnSu9VSNqL3-wdsdPNbvpLZ5-QTvrl0b7bWdta1z978_2w/viewform",
      "itens": [
        {
          "tipo": "escolha",
          "titulo": "Como a sua avaliação pode aparecer na monografia?",
          "ajuda": "A monografia traz a avaliação de cada especialista. A equipe sabe quem respondeu; esta escolha decide só o que é publicado. Você pode trocá-la a qualquer momento até a versão final da monografia, pelo formulário de atualização ou pelo contato do termo, e vale sempre a escolha mais recente. Com o nome, você vê o seu quadro antes e só aparece depois de confirmar.",
          "entry": "entry.321044781",
          "opcoes": [
            "Com meu nome: nome e titulação ao lado das minhas notas e comentários, só depois de eu ver o meu quadro e confirmar.",
            "Com código e perfil: apareço como E1, E2…, com titulação, formação e papel, sem o nome.",
            "Só no conjunto: minhas respostas entram apenas nos resultados agregados."
          ]
        }
      ]
    }
  ]
};
