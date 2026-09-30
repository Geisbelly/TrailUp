# Prompt — nova tela: Conquistas da classe

## Identificação
- Nome da tela: **Conquistas** (novo item de sidebar).
- Fonte de conteúdo: issue **#158** (Conquistas da classe cadastradas pelo professor: métrica, escopo por perfil, aparência e recompensa), anexada a este prompt. Marcada "em planejamento", mas com todas as decisões de design já registradas na issue.

## Referências de estilo
Siga `../01-contexto-geral-fase-2.md` e `../02-paleta-de-cores-fase-2.md`.

## O que já existe hoje (contexto, não é o que esta tela cria do zero)
Já existem 27 conquistas **globais** na plataforma (não de uma turma específica), com categoria, escopo (comum/por perfil) e recompensa em pontos. Esta tela dá ao professor um caminho para criar conquistas **da própria turma**, por cima do que já existe — sem inventar um segundo sistema de conquistas.

## Regra mais importante desta tela: métrica é lista fechada, nunca texto livre
Isso é decisão de dados, não preferência de design, e precisa aparecer na interface como tal — um select com opções fixas, nunca um campo de texto para "que métrica avaliar":

| Métrica (rótulo na interface) | Exemplo de limiar a pedir |
|---|---|
| Atividades concluídas | número mínimo |
| Dias seguidos de estudo | número de dias |
| Minutos acumulados | minutos |
| Acertos (%) | percentual |
| Tópicos distintos visitados | número (ou "todos") |
| Conclusão rápida | tempo máximo em minutos |

## Estrutura da tela

### Cabeçalho
Título "Conquistas" + subtítulo (ex. "Conquistas exclusivas desta turma, além das já disponíveis na plataforma."). Botão principal **"+ Nova conquista"**. Indicador do teto (ex. "12 de 20 conquistas desta turma").

### Lista de conquistas da turma
Cards ou linhas: ícone + nome + descrição curta + métrica/limiar em texto legível (ex. "Acertos ≥ 80%") + escopo (Geral ou o(s) perfil(is) alvo, com a cor do perfil quando for por perfil) + status (Ativa/Desativada). Ações: editar, desativar (nunca "excluir" — ver regra abaixo).

### Formulário "Nova conquista" / "Editar conquista"
- **Nome** e **descrição**.
- **Ícone** — seleção dentre um conjunto de ícones já usados no projeto (não upload livre).
- **Cor** — **nunca um seletor de cor livre**. Duas opções: escolher dentro de uma paleta já validada, ou, se o escopo for "por perfil", usar automaticamente a cor-assinatura oficial daquele perfil BrainHex (fonte: regra explícita da issue — cor livre quebra o contraste AAA do tema).
- **Métrica** — select fechado (tabela acima) + campo de limiar, cujo formato muda conforme a métrica escolhida.
- **Escopo** — Geral ou Por perfil. **Se "Por perfil" e o professor quiser limiares diferentes por perfil, isso vira uma conquista por perfil (uma linha cada), não um único registro com um mapa de valores** — a interface deve deixar isso claro (ex. ao escolher "Por perfil", perguntar se o limiar é o mesmo para todos os perfis selecionados ou se o professor quer configurar um por um).
- **Recompensa** — pontos, e opcionalmente um bônus ligado à mesma carteira/moeda usada em Eventos e Missões (nunca um segundo saldo).

### Ao editar o critério de uma conquista já concedida a alunos
Mostrar um aviso explícito antes de salvar: "Alterar o critério não afeta quem já ganhou esta conquista — a concessão nunca é revogada. Mas passa a valer um critério diferente para quem ainda não ganhou." (fonte: decisão explícita da issue — edição de critério precisa avisar o professor e ficar registrada).

### "Desativar" em vez de "Excluir"
Não ofereça a ação "excluir" para uma conquista de turma — só **"Desativar"**, com confirmação, explicando que quem já ganhou continua com a conquista na biblioteca, e que ela só deixa de ser avaliada para novos alunos.

## O que NÃO fazer
Não ofereça um campo de texto livre para métrica. Não ofereça um seletor de cor livre. Não ofereça "excluir" — só "desativar". Não deixe editar o critério de uma conquista sem o aviso de que isso não revoga concessões anteriores.
