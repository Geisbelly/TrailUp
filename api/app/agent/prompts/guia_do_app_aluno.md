# Guia do app do aluno (base dos Guardiões e da Lumi)

Fonte: textos das telas do app (mobile/src/app, mobile/src/components), da página
web do aluno (frontend/src/pages/Aluno.tsx) e da Política de Privacidade publicada
(frontend/src/pages/Privacidade.tsx). Ao mudar uma tela, mude o trecho dela aqui.
Não ponha aqui regra que a tela não mostra.

## App do aluno — mapa

O app tem cinco abas: Trilha, Notificações, Social, Ranking e Perfil. Na tela
larga (navegador), as abas viram uma barra lateral, com Loja e Configurações
também nela. Quase toda tela tem um botão de ajuda que abre um tour curto dela.
O aluno entra com o mesmo e-mail e senha do cadastro no site.

### Trilha

- Mostra os tópicos da turma como um mapa, com a porcentagem de cada um e, no
  topo, a turma atual. "Você parou aqui · Continuar" retoma de onde parou.
- Tópico com cadeado: é preciso concluir os módulos anteriores. Tocar nele
  explica como desbloquear.
- Dentro do tópico fica o material personalizado para o perfil BrainHex do aluno
  (texto, áudio, apresentação, cards) e as atividades. O material do professor
  também aparece, como conteúdo da turma. O progresso do tópico conta o material
  personalizado; enquanto ele não foi gerado, conta o do professor.
- Atividades com tempo: se o tempo acabar, ainda dá para concluir. A nota vale; só
  o bônus de XP por tempo fica de fora. Quem não quer contagem regressiva desliga
  "Cronômetro nas atividades" nas informações pessoais do Perfil; a nota é a mesma.
- Selo "Atualizado pelo professor": o professor mudou aquele item. Quando pede
  "refaça quando puder", vale refazer, e o progresso continua concluído.
- Batalha: nos perfis Survivor, Daredevil e Conqueror, o módulo tem um boss. Avançar no conteúdo e acertar
  atividades causa dano nele; depois de derrotado, o resumo do confronto continua
  disponível.
- Missões: aparecem na Trilha e no Social. As do dia renovam depois da meia-noite
  e cada uma rende recompensa.
- Evento da turma: quando o professor abre um evento, ele aparece com as regras e
  a recompensa. O rank do evento é opcional, e a classificação sai quando o
  professor encerra o evento.
- Bag: guarda anotações, resumos e cards que o aluno salva, as compras da loja e
  os materiais gerados. Fica no Perfil e pode ser aberta durante o estudo.

### Notificações

Lista com filtros de todas, não lidas e lidas. Tocar abre o aviso. Na lista,
arrastar para a direita marca como lida e para a esquerda exclui. Dentro do aviso
dá para escolher "Não quero avisos assim", que silencia aquele tipo.

### Social

Fica com cadeado até o aluno concluir o primeiro conteúdo. Aqui estão:
- amizades: convite a um colega da turma, que vale quando os dois aceitam; dá para
  desfazer ou bloquear;
- guildas: o aluno cria ou entra numa guilda da turma, que tem chat próprio;
- desafios: 5 questões contra um colega; a vitória vale Elo no ranking da arena;
  também há jogo em dupla, para quem está numa guilda;
- missões do dia e o evento da turma.

### Ranking

Fica com cadeado até o aluno concluir o primeiro tópico; a posição já é contada
desde o começo. Mostra as primeiras posições da turma por categoria, e a posição
do próprio aluno aparece sempre, mesmo fora do topo. Estudar, presença e
atividades movem o ranking.

### Perfil

- Loja: gasta as moedas ganhas estudando em itens. Item comprado vai para a Bag.
  Também tem o fundo da turma: os alunos doam moedas até a meta, e aí o professor
  entrega o benefício.
- Biblioteca de conquistas: mostra as concluídas, em progresso e bloqueadas, com o
  que falta. As de perfil são ligadas ao BrainHex; as comuns valem para todos.
- Molduras: em volta da foto. Umas se compram, outras saem ao concluir conquistas
  ou ao fazer algo especial no app.
- Estilo das métricas: muda só a aparência do painel de métricas; o automático
  segue o perfil BrainHex.
- Modo foco e avisos: com o foco ligado, nenhuma notificação chega. Ao sair, vem
  só a mais recente de cada tipo. Também lista os tipos silenciados.
- Lembrete diário: o horário em que o app avisa para continuar a estudar.
- Coleta e acessos: liga e desliga câmera, uso, desempenho e chat do mentor. A
  câmera é opcional e desligá-la não bloqueia aulas, atividades ou notas.
- Gerar relatório dos dados: monta um PDF com identificação, eventos, posições nos
  rankings, progresso e conquistas. Gerar não altera os dados.
- Reportar um erro: conta para a equipe o que aconteceu e em que tela.
- Redefinir senha: manda um link por e-mail (olhar também o spam).
- Solicitar exclusão da conta: registra o pedido, e a confirmação vem por e-mail.
- Rever tutorial inicial, informações do app, política de privacidade e termos.

### Os Guardiões (mentor)

Cada perfil BrainHex tem um Guardião, que aparece na Trilha e dentro do módulo. Ele
explica a personalização, as métricas e o app, e orienta o estudo, sem entregar
resposta de atividade. É inteligência artificial, só para maiores de 18 anos: sem
isso, ou com o chat desligado em Coleta e acessos, trilhas, questões e progresso
continuam funcionando.

## Versão web do aluno

Em trailup.vercel.app o aluno faz o cadastro e tem a página "Sua jornada começa
aqui": uma introdução em três etapas, que pode ser feita sem estar numa turma.
Quem ainda não está numa turma deve pedir ao professor para incluir a conta pelo
e-mail do cadastro. Dali o aluno instala o aplicativo (página Download: versão de
teste na loja ou APK) ou, quando o botão "Abrir aplicativo do aluno" aparece, usa
o mesmo app no navegador. A conta e o progresso são os mesmos.

## Privacidade e uso de dados (resumo da Política de Privacidade)

- O TrailUp é parte de uma pesquisa acadêmica (Ciência da Computação, Ulbra
  Palmas). Os dados servem ao funcionamento do app, ao ensino e à pesquisa
  (publicada de forma agregada ou pseudonimizada). Nenhum dado é vendido.
- Coletados: nome, e-mail, data de nascimento, respostas (BrainHex, quizzes,
  redações, atividades), mensagens ao mentor, preferências e consentimentos;
  ritmo de estudo, acertos, tempo, progresso, moedas e ranking; perfil de
  aprendizagem e, se o aluno permitir, estado emocional estimado.
- Câmera: opcional e desligada por padrão. As imagens não são gravadas nem
  enviadas a terceiros; fica só a emoção estimada.
- O professor vê da emoção só uma faixa ("precisa de apoio" ou "ok"), nunca
  pontuação, histórico ou imagem. A estimativa não é diagnóstico e não entra em
  nota, ranking ou punição; o professor pode desconsiderar um alerta.
- Menores: cada finalidade opcional (câmera, personalização emocional, pesquisa,
  notificações) depende da autorização do responsável, no app ou no termo em
  papel entregue ao professor; sem ela, o app funciona em modo restrito. A IA do
  app do aluno é só para maiores de 18 confirmados pela data de nascimento.
- Nome e e-mail não vão nas instruções aos provedores de IA; o aluno é
  identificado por um código interno.
- Fornecedores (a maioria nos EUA): Supabase, Hetzner, Vercel, Google Gemini,
  OpenAI, Cloudflare R2, Expo/FCM/APNs, Google (e-mails, login, YouTube) e
  Microsoft (visualização de documentos).
- Retenção: telemetria bruta 90 dias (180 para pesquisa), indicadores 13 meses
  (24 para pesquisa), emoção estimada 30 dias, conta de aluno inativa apagada
  após 24 meses sem acesso (com aviso e 30 dias de prazo). Ao sair de uma turma, o
  conteúdo gerado para o aluno é apagado em 90 dias; notas, moedas e ranking, em
  365 dias.
- Direitos do aluno (ou do responsável): acessar os dados ("Gerar relatório dos
  dados"), corrigir, pedir exclusão, revogar consentimentos (Perfil › Coleta e
  acessos), contestar a estimativa emocional e pedir revisão humana. Dúvidas e
  pedidos: página de contato do site. Texto completo: trailup.vercel.app/privacidade
  e /termos.
