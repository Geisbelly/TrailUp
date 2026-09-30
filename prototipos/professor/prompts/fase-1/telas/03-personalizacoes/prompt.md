Próxima tela do mesmo console: **Personalizações**.

Mantenha a linguagem visual já estabelecida. Esta tela é sobre **acompanhar o trabalho da IA**, não sobre o professor criar algo diretamente — o tom deve ser mais "painel de status/monitoramento" do que "formulário de edição".

**Sobre o print anexado:** mostra só como a tela está hoje (estado vazio, antes de escolher classe/tópico) — é referência de funcionamento e dos rótulos reais das sub-abas, não o visual a replicar. O conteúdo populado de cada sub-aba não aparece nesse print; está descrito por escrito abaixo.

## O que ela faz

Para cada tópico cadastrado, a IA gera material personalizado (texto + áudio) para cada um dos 7 perfis BrainHex. Esta tela mostra o andamento e o resultado dessa geração, em 4 recortes diferentes (4 sub-abas — nomes exatos de hoje, mantenha-os): **Por perfil**, **Estrutura e paleta**, **Por aluno**, **Turma**.

1. **Por perfil** — para o tópico/turma selecionado, um card por perfil BrainHex mostrando o status da geração daquele perfil: "gerando" (com indicador de progresso), "pronto", "parcial" ou "com falha" — e quais formatos já foram gerados (texto, áudio, apresentação...) para aquele perfil.
2. **Estrutura e paleta** — visão da estrutura de conteúdo (provavelmente por tópico/conteúdo, mostrando o que já tem base gerada e o que falta) e a paleta de cores aplicada.
3. **Por aluno** — para um aluno específico, o status da "personalização efetiva" dele: qual perfil foi usado, status da geração, quais formatos ele já tem disponíveis.
4. **Turma** (nível turma inteira) — um resumo agregado: total de alunos, perfil predominante da turma, uma métrica percentual de destaque, e um gráfico/lista de **distribuição de perfis BrainHex** na turma (porcentagem de alunos em cada um dos 7 perfis — use as cores oficiais de cada perfil). Abaixo, um resumo do estado geral da geração de conteúdo da turma inteira, com contagem de quantos perfis estão "em andamento", "parciais", "com falha" ou "sem material".

Há também, acima das sub-abas, uma barra de filtros sempre visível: seletor de Classe, de Tópico, de Conteúdo, um botão "Atualizar", e um seletor de perfil com botão "Gerar tudo" (dispara a geração para todos os alunos daquele perfil de uma vez).

## Vocabulário de status (usar de forma consistente e reconhecível visualmente)

`gerando` (com spinner/indicador de progresso) · `pronto` · `parcial` · `com falha` · `sem material` — cada um precisa de uma cor/ícone distinto e imediatamente reconhecível, repetido de forma consistente nas 4 sub-abas.

## O que peço

Desenhe as 4 sub-abas. O maior desafio de design aqui é fazer o professor entender rapidamente, batendo o olho, "está tudo certo ou algo precisa da minha atenção" — sem precisar ler texto. Pense em como a badge de status e a distribuição de perfis podem comunicar isso de forma quase instantânea.
