Prompt de correção — remover "Extensões de prazo" da tela Aprovações

## Contexto

Feedback direto da dona do projeto sobre a aba "Extensões de prazo" dentro de Aprovações (especificada em `09-aprovacoes-de-compras-com-efeito-academico.md` e já gerada, com uma caixa de destaque em volta de toda a seção): **"isso n é aqui e não precisa de aprovação."**

Duas afirmações na mesma frase:
1. **"não é aqui"** — a fila de extensão de prazo não deveria estar dentro da tela Aprovações.
2. **"não precisa de aprovação"** — comprar uma extensão de prazo não exige mais decisão do professor.

## Atenção: isso contradiz o texto da issue #144

A issue **#144** (Loja com itens de consequência real), que embasou o prompt `09`, diz explicitamente: *"Extensão de prazo exige aprovação do professor. O prazo é dele; uma moeda não pode revogar decisão pedagógica sozinha."* O feedback ao vivo da dona do projeto vai na direção contrária. Ela tem a palavra final sobre o produto, então esta correção segue o que ela disse agora — mas **vale avisá-la** de que a issue escrita ainda diz o oposto, para alguém atualizar o texto da #144 e não gerar confusão para quem for implementar depois.

## CORRIGIR

- **Remover a aba "Extensões de prazo" de dentro da tela Aprovações.** A tela Aprovações volta a ter só o conteúdo de "Cadastros de professores" (sem a navegação por abas que o prompt `09` introduziu).
- **Não recriar a fila de extensão de prazo em nenhum outro lugar nesta rodada** — como a compra deixou de exigir aprovação do professor, não há mais uma fila de decisão para desenhar. Se no futuro for necessário um registro/histórico de extensões concedidas automaticamente (só para consulta, sem ação), isso é uma tela nova, a ser pedida separadamente — não presuma esse formato aqui.

## O que NÃO fazer

Não invente um novo lugar na navegação para "Extensões de prazo" — ela simplesmente deixa de ter uma tela de aprovação, já que a compra passou a ser automática.
