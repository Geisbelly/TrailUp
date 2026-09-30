# Síntese — o que os 3 documentos, juntos, revelam

Este arquivo não é para colar em lugar nenhum — é o raciocínio por trás dos 5 prompts desta pasta. Cruzei três fontes: (1) os apontamentos originais da dona do projeto (`revisao-01-apontamentos/`), (2) o feedback sobre a primeira leva de correções (`revisao-02-feedback-prototipo/apontamentos.md`), e (3) a descrição exata do que está no ar **hoje**, com dados reais (`revisao-02-feedback-prototipo/*-descricao-detalhada.md`).

## Achado mais importante: a Trilha regrediu, não avançou

Os prints do apontamento 2 (rodada de feedback) mostravam um editor de tópico já com: breadcrumb "Onde estou", abas "Conteúdos 4 / Cards 6", cards com selo "em 2 conteúdos" (mostrando reuso), botão "Vincular card existente", e uma lista de questões **aninhada dentro do conteúdo** ("Nível 4 · Questões deste conteúdo"). O feedback pediu para corrigir a hierarquia (cards devem ficar dentro de conteúdo, não irmãos) e melhorar a visualização — mas **não pediu para remover nada disso**.

Os prints de hoje (com dados reais) mostram um editor de tópico **mais simples**: só "NÓS DE CONTEÚDO" (uma lista única, sem distinção de Cards), sem breadcrumb, sem selo de reuso, sem seção de questões visível. Ou seja: em vez de corrigir a hierarquia (cards → dentro do conteúdo), parece que **os Cards e as Questões desapareceram da tela** de edição do tópico.

**Isto muda a estratégia do prompt da Trilha:** não é mais "ajustar o que existe", é "reconstruir a tela do zero com a hierarquia completa e correta", porque o que está no ar hoje é mais pobre do que a versão já criticada anteriormente.

## Achados menores, cruzando as 3 fontes

- **Dashboard:** o card "Conclusão Média" aparece **duas vezes** na grade de indicadores, com valores diferentes (38% e 0.0%) — ninguém pediu isso, é uma inconsistência nova a corrigir.
- **Dashboard → aba Personalização do aluno:** a tela mostra um **JSON bruto** ("contexto central do aluno") direto na interface. Nenhum apontamento pediu isso — é linguagem de desenvolvedor, não de professor. Vale reconsiderar.
- **Personalizações:** a aba "Estrutura e paleta" mostra campos Tom/Estilo/Nível/Prioritário e uma paleta de 5 cores — tudo vazio ("—") nos dados reais. Isso não estava nos apontamentos originais como pedido; parece ter sido inventado na primeira geração. Vale decidir se tem valor real para o professor ou se deve sair.
- **Personalizações:** o dropdown de Classe mostra "SPD - 3N 2026/2 (copia)" **3 vezes repetidas** — sintoma de a função "Duplicar turma" (Classes) estar criando cópias demais, ou de a tela não estar deduplicando nomes. Vale mencionar no prompt mesmo sendo mais um problema de dado do que de layout.
- **Classes:** duplicar/excluir (pedido na rodada 1) **já existem**, mas só aparecem em hover — o apontamento da rodada 2 (item 9) reclamava de uma versão com botões de texto full-time visíveis; a versão atual foi longe demais na direção oposta (escondeu tudo atrás de hover). O correto é meio-termo: ícones sempre visíveis, não escondidos.
- **Ranks:** nenhuma reclamação nova. Está de acordo com "aprovado, só alinhar visual". Só dois textos sem acento a corrigir.

## Regra de ouro para os 5 prompts

Todo prompt abaixo segue o mesmo formato: **MANTER** (o que já está certo, com a localização exata) → **REMOVER** (o que precisa sair) → **ADICIONAR/CORRIGIR** (o que falta, com onde deve ficar). Isso evita que a ferramenta de design ignore trabalho que já está bom só porque o prompt é extenso.
