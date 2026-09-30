# Prompt Fase 2 — Personalizações, PARTE 2 de 3: abas "Estrutura e paleta", "Por aluno" e "Turma"

Continuação da Parte 1 (cabeçalho, filtros, resumo, aba "Por perfil"). Esta parte cobre as outras 3 abas internas da mesma tela.

## Identificação
- Fonte de conteúdo: `Console Personalizacoes.dc.html` da V5, anexado a este prompt (mesmo arquivo da parte 1).

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. Use a mesma base (cabeçalho, filtros, abas) já estabelecida na Parte 1 — não recrie, só adicione o conteúdo destas 3 abas.

## Aba "Estrutura e paleta"
Tabela por perfil: colunas Perfil, Tom, Estilo, Nível, Prioritário (todas mostrando "—" — são campos ainda sem uso real, mantenha assim, não invente valores) e Paleta (5 pontos coloridos por perfil, um por token: Fundo/Superfície/Primária/Borda/Texto, com tooltip do nome do token ao passar o mouse). **Esta aba já foi sinalizada anteriormente como "decisão pendente" sobre seu propósito — nesta rodada, mantenha-a exatamente como está no código, sem resolver essa pendência.**

## Aba "Por aluno"
- **zeroData:** select "Aluno" (placeholder "Selecione o aluno") + nota "Selecione um aluno para ver a personalização efetiva dele."
- **Com dados:** 2 colunas.
  - Esquerda — **"Personalização efetiva"**: avatar+nome (ex. Marina Corrêa) + "perfil usado: Mastermind (92% de afinidade)" + pílula "pronto". 3 linhas de formato (Texto personalizado "4 de 4 · 68% lido", Áudio "9 min · ouvido", Apresentação "8 slides · não aberta"), cada uma com ícone de check. Ações: "Abrir no dashboard" (link), "Ver material gerado" (secundário — **abre o modal da Parte 3**), "Regerar material" (tom violeta).
  - Direita — **"Todos os alunos"**: busca + lista (avatar+nome+perfil+pílula de status). Rodapé "6 de 34 alunos".

## Aba "Turma"
- **zeroData:** 5 cards (Alunos na turma=0, Perfil predominante="—", Média de acertos=0.0%, Conclusão média=0.0%, Nota média=0.0%) + card "Distribuição de perfis BrainHex" com texto vazio "Nenhum aluno com perfil BrainHex definido nesta turma ainda."
- **Com dados:** 3 cards no topo — Alunos na turma (34, "todos com perfil BrainHex respondido"), Perfil predominante (Mastermind, ícone, "9 de 34 alunos (26%)"), Material pronto (78%, barra, "dos itens gerados nos 8 tópicos"). Card **"Distribuição de perfis"**: barra segmentada com as 7 cores + lista de linhas (cor+nome+barra+%+contagem) para os 7 perfis (Mastermind 26%·9, Seeker 21%·7, Achiever 18%·6, Conqueror 12%·4, Socializer 12%·4, Daredevil 8%·3, Survivor 3%·1). Card **"Geração na turma inteira"**: nota "56 combinações de tópico × perfil", 5 chips de contagem (prontos=41, em andamento=6, parciais=5, com falha=2, sem material=2), nota "As 2 falhas estão no serviço de áudio, nos tópicos 3 e 6. Reprocessar leva cerca de 4 minutos." + botão "Reprocessar falhas".

## O que NÃO fazer
Não tire a aba "Estrutura e paleta" nem tente "resolver" seus campos vazios preenchendo com valores inventados.
