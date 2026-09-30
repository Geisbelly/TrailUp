Prompt de correção — tela **Aprovações**, problema: conteúdo desalinhado/jogado para a esquerda.

## Contexto

No código já gerado, o contêiner principal (`<main>`) de **todas as 7 telas** usa a mesma base: `margin-left:264px` (para não ficar embaixo da sidebar) + o mesmo padding — **exceto Aprovações**, que sozinha recebeu também um `max-width:900px`, sem nenhuma centralização. O resultado: o conteúdo dessa tela fica preso numa coluna estreita colada à esquerda (logo depois da sidebar), com um vão vazio grande do lado direito, enquanto as outras 6 telas usam a largura inteira disponível. É isso que fica visualmente "desalinhado" em comparação com o resto do console.

## CORRIGIR

- Remova o `max-width:900px` do contêiner principal da tela Aprovações, deixando-o com a mesma base de largura das outras 6 telas (`margin-left:264px` + padding, sem limite de largura próprio).
- Depois da correção, o banner de resumo, a lista de professores pendentes e o estado vazio ("Nenhum professor aguardando aprovação") devem ocupar a largura disponível do mesmo jeito que os cards/listas das outras telas — não precisam esticar para preencher todo o espaço com conteúdo forçado, mas o contêiner que os envolve não pode mais impor um teto de 900px.

## O que NÃO fazer

Não mude o conteúdo desta tela (banner, lista de pendentes, estado vazio) — o problema é só a largura do contêiner, não o que está dentro dele.
