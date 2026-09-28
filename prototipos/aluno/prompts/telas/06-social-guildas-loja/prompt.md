Próxima tela da mesma área: **Social** (inclui Guildas e o acesso à Loja).

Mantenha a paleta do perfil ativo.

## O que ela faz

Conexões sociais entre alunos da mesma turma: amigos, convites, guildas e chat privado. É também de onde se acessa a Loja.

## Conteúdo real de hoje

1. Cabeçalho "Social" / eyebrow "CONEXÕES DA JORNADA" + subtítulo "Encontre sua turma e avance em companhia." + um botão de atalho para a **Loja** no canto do cabeçalho.
2. **5 sub-abas, cada uma com contador:** **Amigos** · **Convites** (recebidos + enviados) · **Encontrar** (colegas disponíveis para convidar) · **Guildas** · **Bloqueados**.
3. Campo de busca por nome ou guilda (não aparece na sub-aba Guildas).
4. **Cartão de pessoa** (em Amigos/Encontrar/Bloqueados): nome, apelido, guilda (se tiver), indicador online/offline, e uma ação contextual por status — "Convidar" (candidato), "Desfazer" (amigo), "Bloquear"/"Desbloquear". Toque no cartão abre o perfil da pessoa (modal); toque no ícone de chat abre uma conversa privada.
5. **Convites recebidos:** cartão com ação de Aceitar/Recusar.
6. **Guildas:** grupos de alunos com chat próprio — permitem compartilhar itens específicos da jornada do aluno com a guilda (ex.: um tópico ou uma questão respondida), até um limite de itens compartilháveis por vez.
7. **Loja** (modal, aberto pelo atalho do cabeçalho): economia de moedas/itens do aluno.

## Estados

- **Carregando** (spinner central).
- **Erro:** ícone de alerta + mensagem + botão "Tentar novamente". Uma mensagem específica existe para quando o recurso Social ainda não foi ativado no ambiente ("O Social ainda não foi ativado neste ambiente.").
- **Vazio por sub-aba:** mensagens específicas — "Você ainda não tem amigos na jornada." (Amigos, com atalho "Encontrar colegas"), "Nenhum convite por enquanto." (Convites), "Nenhum colega disponível para convidar." (Encontrar), "Você não bloqueou ninguém." (Bloqueados). Busca sem resultado: "Nenhuma pessoa encontrada."
- **Bloqueada (portão fechado):** mesma lógica do Ranking — modal de "bloqueado" no lugar da tela, se o recurso ainda não foi liberado para o aluno.

## O que peço

Desenhe a tela com a sub-aba Amigos populada (cartões de pessoa com ação e indicador online), a sub-aba Convites com um convite pendente, e um esboço de como a Loja se encaixa como modal a partir daqui. Ações potencialmente delicadas entre colegas (Bloquear, Desfazer amizade) precisam de confirmação visualmente distinta das ações neutras (Convidar, chat).
