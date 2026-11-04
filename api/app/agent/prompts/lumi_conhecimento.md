# Guia do produto TrailUp (base da Lumi)

Fonte: textos das telas do console (frontend/src/components/console) e
docs/guia-do-professor.md. Ao mudar uma tela, mude o trecho dela aqui. Não ponha
aqui regra que a tela não mostra. O lado do aluno e a privacidade ficam em
guia_do_app_aluno.md, que os Guardiões também usam; a Lumi recebe os dois.

## Console do professor — mapa

O console tem uma aba por assunto, no menu lateral (na tela estreita, o menu
vira gaveta). Quase tudo é configurado por turma: a maioria das abas pede para
escolher a turma no topo e, sem turma, manda criar a primeira em Turmas.

- Visão geral (/console): indicadores da turma.
- Recomendações (/console/recomendacoes): o que a IA propõe, à espera da sua decisão.
- Trilhas (/console/trilha): o mapa de tópicos, conteúdos e atividades.
- Missões (/console/missoes): objetivos com prazo e pontuação.
- Conquistas (/console/conquistas): conquistas exclusivas da turma.
- Notas (/console/notas): correção de dissertativas e entregas.
- Eventos (/console/eventos): janelas de tempo com missões, desafios e arena.
- Economia (/console/economia): moedas, pontos, loja, prazos, fundo e metas.
- Turmas (/console/turmas): criar turmas, matricular alunos, presença.
- Personalizações (/console/personalizacoes): o material gerado para os 7 perfis.
- Rankings (/console/ranks): critérios de classificação e posições.
- Rank de batalhas (/console/rank-de-batalhas): duelos entre guildas.
- Guildas (/console/guildas): formação e acompanhamento das guildas.
- Meus dados (/console/meus-dados): perfil e conta; abre pelo avatar com o seu nome.
- A Lumi é o botão flutuante no canto da tela, em todas as abas de trabalho. Ela
  responde com botões que levam à aba certa e abre tutoriais guiados pela tela.

### Primeiros passos (uma vez por disciplina)

1. Turmas: crie a turma e matricule os alunos. Cada aluno que entra recebe o
   material personalizado automaticamente.
2. Trilhas: escolha a turma e monte o mapa — um tópico por assunto, com
   conteúdos (texto, vídeo, link ou arquivo) e atividades (múltipla escolha,
   verdadeiro/falso, completar, dissertação). Ligue os tópicos para dizer o que
   vem antes do quê. Ou use "Gerar trilha com IA".
3. Personalizações: escolha um tópico e confira o material dos 7 perfis. Se um
   perfil falhou, use "Gerar" na linha dele.
4. Meus dados: confira a "Geração automática de personalização".
Dica: monte um tópico completo e confira nos 7 perfis antes do resto.

### Rotina sugerida

- Depois de cada aula: registrar presença (Turmas › Registrar presença).
- Uma vez por semana: Visão geral (quem está parado, onde a turma trava) e
  Personalizações (nenhum perfil com falha).
- Quando há conteúdo novo: Trilhas.
- Ao corrigir: Notas.
Você não precisa gerar material para cada aluno: a IA monta a base por perfil e
uma camada leve por aluno.

### Visão geral
Indicadores da turma escolhida no topo: entregas e acertos na semana, conclusão
da trilha, retorno semanal, conteúdos mais consumidos e de maior dificuldade,
sínteses da IA sobre a turma e sobre alunos ("Atualizar agora" gera de novo),
alunos em risco alto de abandonar nas próximas 4 semanas por perfil BrainHex,
alunos com dois ou mais sinais (queda de uso, acerto baixo, faltas, prazos
perdidos, o mesmo estado difícil repetido), fila e gargalos de personalização, e
alterações que você fez em itens que os alunos já viram (a IA decide se pede
revisão; você pode "Não pedir revisão" ou "Voltar todos à decisão da IA").
Clique em um aluno para abrir o detalhe: perfil BrainHex, material
personalizado, tentativas por atividade, evolução, passos da jornada e
comentários seus por passo. Os indicadores só aparecem quando os alunos aceitam
a matrícula e começam a trilha.

### Recomendações
O que a IA propõe para a turma ou para um aluno fica aqui até você decidir:
aprovar ou recusar (com motivo, que fica registrado). Missões sugeridas pela IA
também: ao aprovar, a missão aparece para a turma; nada chega ao aluno sem a sua
aprovação. "Pedir sugestões" pede novas à IA.

### Trilhas
Cada turma tem a sua trilha. No mapa: arraste o fundo para navegar, arraste um
cartão para reposicionar o tópico, arraste de uma bolinha D (pré-requisito) ou N
(próximo) para ligar tópicos, clique numa seta para removê-la. No editor do
tópico você cria conteúdos (arquivos PDF, DOC/DOCX, PPT/PPTX, TXT/MD, vídeo e
áudio até 200 MB; o envio ocorre ao salvar), atividades (com prazo opcional —
atraso é aviso, não bloqueio; dissertativa aceita gabarito que o aluno não vê) e
cards. "Sugerir Cards & Atividades" pede sugestões à IA para um conteúdo.
"Gerar trilha com IA": você descreve o plano de ensino, a IA propõe tópicos e
ordem, e nada é publicado nem apagado sem a sua confirmação; aplicar substitui a
trilha atual. Cada conteúdo pode ter o visual do boss escolhido, e as falas do
boss geradas pela IA (perfis com batalha: Sobrevivente, Aventureiro e
Conquistador) podem ser revistas. Apagar um tópico remove conteúdos, cards,
questões e o material gerado, e não dá para desfazer.

### Missões
Uma missão é um objetivo com prazo e pontuação. Dois tipos: entregas que você
corrige, ou metas que o app fecha sozinho quando o aluno atinge o alvo. Pode
valer para todos, para um perfil BrainHex ou para a guilda inteira (na guilda, o
progresso é a soma dos membros). Os itens da missão (questões e conteúdos) você
monta no editor do tópico. As moedas da entrega saem só quando você aprova (nota
de pelo menos 60%). "Missões do dia" são geradas para cada turma; você pode
editar o texto e a meta diária. Propostas da IA ficam invisíveis para os alunos
até você aprovar.

### Conquistas
A plataforma já traz conquistas globais; aqui você cria conquistas extras, só
da turma: escolha o que medir, o mínimo para ganhar (o mesmo para todos ou por
perfil) e a recompensa. Mudar o critério não tira a conquista de quem já ganhou.

### Notas
Fila de correção das dissertativas e entregas que dependem de leitura. Quando a
IA corrige uma dissertativa, ou não consegue corrigir, ela aparece aqui para
você olhar e dar a nota. Entrega com prazo vencido sem resposta também pede uma
decisão de nota. "Exportar notas e XP (CSV)" baixa a planilha da turma.

### Eventos
Janelas de tempo com missões, desafios e arena, individual ou de guilda. O
evento nasce como rascunho; com "Abrir sozinho no começo" ele vai ao ar no
horário de início; no fim ele encerra e apura sozinho. Depois de aberto, só
título e descrição mudam. Cada critério de ranking marcado vira um ranking, e só
aparece nele quem escolhe entrar (entrar não muda nota nem XP). Medalhas de
participação e de destaque vão para a biblioteca de conquistas dos alunos no
encerramento. O painel do evento mostra quem participa e "Quem precisa de um
empurrão".

### Economia
Configurada por turma, em abas:
- Valores: quanto cada aluno ganha, individualmente, quando faz cada ação nesta
  turma. As moedas vão para a carteira dele; os pontos, para o rank. Campo vazio
  usa o padrão da plataforma (mostrado na linha). Pontos e moedas são
  independentes: gastar moeda não mexe no rank.
- Moedas por aluno: o saldo de cada aluno (a carteira soma todas as turmas; é o
  que ele vê na loja).
- Prazos e tempo: mínimo e máximo de dias por uso de prazo extra, tetos, e moedas
  a mais na conclusão ou aprovação de um tópico. Moeda de conclusão só sai quando
  você aprova a entrega (nota de 60% ou mais): o aluno marcar como concluída não
  paga moeda.
- Loja: preço (vazio herda o global), estoque (vazio é ilimitado), compras por
  aluno, aumento por compra (1 = preço fixo, até 5), dotação (o que todo aluno
  recebe antes de gastar moeda), item à venda ou não, e limites de uso por
  situação (a atividade sobrepõe o tópico, que sobrepõe a turma; vazio herda,
  0 bloqueia).
- Fundo da turma: recompensa coletiva. A turma junta moedas para um benefício que
  você escolhe; cada aluno doa da própria carteira e vê o total e a própria
  doação, nunca a dos colegas. Um fundo ativo por turma. "Marcar benefício como
  entregue" libera quando a turma bate a meta; cancelar devolve as moedas.
- Metas: crédito de moedas e pontos que entra uma vez, quando o aluno alcança o
  limiar do critério.
- Histórico: o razão de movimentações e os usos de itens na trilha.
A loja vende ajuda para aprender (por exemplo, prazo extra, segunda chance, dica,
trocar formato), nunca vantagem sobre colegas; o preço é o mesmo para todos. Os
itens e valores da sua turma são os que aparecem nessas abas.

### Turmas
A turma é o ponto de partida: dela saem a trilha, as matrículas e o dashboard.
Crie a turma (matéria e descrição), matricule alunos pelo botão "Matrículas"
(busca por nome ou e-mail, ou arquivo com uma coluna "email"; entram só alunos
que já têm conta e acesso liberado para você). Remover um aluno tira o acesso
dele à trilha da turma e apaga o progresso dele ali. "Registrar presença": para a
turma inteira ou alguns alunos; participação é discricionária (você informa
quanto vale); registrar duas vezes no mesmo dia não duplica. Duplicar a turma
cria uma cópia com a mesma trilha, sem alunos e sem histórico. Excluir a turma
apaga trilha, matrículas, desempenho e guildas, sem volta. Aqui também ficam os
termos de autorização do responsável dos alunos menores.

### Personalizações
Compare como o material fica para cada um dos 7 perfis BrainHex e veja a
personalização efetiva por aluno. Escolha turma e tópico para ver o andamento da
geração por perfil; "Gerar tudo para o perfil" ou "Tentar novamente" refaz o que
falhou. "História da turma": o cenário e o fio que ligam os tópicos; salvar uma
história diferente gera de novo o material da turma inteira. Também mostra a
distribuição de perfis da turma e a sugestão de ordem de material por aluno.

### Rankings
Escolha um tipo de ranking do catálogo da plataforma e a turma; acompanhe as
posições; abra um "Novo período" (os períodos encerrados ficam com o pódio
congelado). O aluno vê o topo da lista e a própria linha; você vê a turma toda.

### Rank de batalhas e Guildas
Guildas: defina quando os alunos podem formar guildas e de que tamanho; os
alunos criam as guildas no app e você acompanha e pode corrigir nome e
descrição. Rank de batalhas: os duelos de perguntas entre guildas, lançados
pelos alunos no app; o ranking conta só duelos concluídos.

### Meus dados
Nome, instituição, disciplina e apresentação (aparecem para os alunos junto do
material). "Geração automática de personalização": ligada, criar ou editar um
tópico já gera o material dos 7 perfis (padrão recomendado); desligada, você
aciona manualmente em Personalizações. O e-mail é o login e não muda aqui. Senha,
foto e exclusão da conta (apaga as suas turmas para sempre, com trilhas,
matrículas e notas).
