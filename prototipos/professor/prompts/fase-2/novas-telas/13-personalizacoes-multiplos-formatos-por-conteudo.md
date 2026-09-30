Prompt de correção — Personalizações: vários itens por formato, não um só

## Contexto

Feedback direto da dona do projeto sobre o modal "Ver conteúdo gerado" (especificado em `06-3-personalizacoes-parte3-modal-conteudo-gerado.md` e já gerado): **"são vários áudios, md e apresentações. não apenas 1 para cada conteúdo."**

Não vi print desta correção especificamente (o anexo que deveria mostrá-la chegou repetido de uma rodada anterior) — o que segue vem só do texto da dona do projeto. Não existe uma issue do repositório detalhando quantos itens ou o que diferencia um item do outro dentro do mesmo formato — trate os números e rótulos abaixo como estrutura mínima razoável, não como decisão fechada, e confirme com ela se possível.

## CORRIGIR — cada aba do modal vira uma lista, não um item único

No modal "Ver conteúdo gerado" (perfil × conteúdo), as 3 abas — **Texto**, **Áudio**, **Apresentação** — hoje mostram um único item cada (um texto, um player de áudio, uma apresentação). Mude cada uma para mostrar **uma lista de itens do mesmo formato**, já que um conteúdo pode ter mais de um material gerado por formato para o mesmo perfil.

- **Aba Texto:** lista de materiais em texto (ex. "Explicação principal", "Resumo", "Material de apoio"), cada um com seu próprio preview e sua própria ação "Regenerar este texto".
- **Aba Áudio:** lista de áudios (ex. "Narração completa", "Resumo em áudio"), cada um com seu próprio player e sua própria ação "Regenerar este áudio".
- **Aba Apresentação:** lista de apresentações (cada uma com sua própria contagem de slides e sua própria ação "Regenerar apresentação inteira"/"Regenerar slide"), em vez de uma apresentação única.

Cada item da lista precisa de um rótulo/título curto que o distinga dos demais do mesmo formato — mesmo que o rótulo exato ainda não esteja definido, não deixe os itens sem nenhuma forma de diferenciação visual.

## O que NÃO fazer

Não invente uma quantidade fixa de itens por formato (ex. "sempre 3") — a lista deve suportar qualquer quantidade. Não misture formatos diferentes numa lista só — texto, áudio e apresentação continuam em abas separadas, só o **conteúdo de cada aba** passa a ser uma lista.
