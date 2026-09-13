# Bag de itens de estudo — Design

## Objetivo

Permitir que o aluno encontre, revise e organize tudo o que recebeu ou criou
durante a trilha: cards gerados pela plataforma, resumos, anotações e cards
autorais. A Bag será acessível pela Trilha e pelo Perfil, abrindo a mesma tela,
e manterá os itens associados ao tópico e ao conteúdo que os originaram.

## Decisões de produto

- A entrada da Bag aparece tanto na Trilha quanto no Perfil e abre uma única
  experiência de inventário.
- O inventário tem duas áreas: `Meus itens` e `Gerados para você`.
- Cards em `cards_personalizados` são gerados pela plataforma e permanecem
  somente leitura.
- Resumos, anotações e cards criados pelo aluno são editáveis e podem ser
  excluídos.
- Todos os itens são privados por padrão.
- O aluno pode compartilhar explicitamente um item autoral em conversa privada
  ou em uma guilda da qual participa.
- Abrir, editar ou concluir um item não altera o conteúdo do professor; o
  progresso do estudo continua em `personalizacao_item_progresso`.

## Modelo de dados

### Reuso de tabelas existentes

`cards_personalizados` é a fonte dos cards gerados. A Bag fará uma projeção de
leitura dela com `origem = 'plataforma'`, `editavel = false` e o vínculo já
existente com aluno, classe, tópico e conteúdo. A tabela não será alterada nem
duplicada.

`atividades_personalizadas`, `questoes_personalizadas` e
`personalizacao_item_progresso` continuam representando conteúdo avaliativo e
progresso, não notas ou cards autorais.

### Nova tabela `bag_itens`

Campos:

- `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`;
- `aluno_id UUID NOT NULL REFERENCES alunos(id)`;
- `classe_id BIGINT REFERENCES classe(id)`;
- `topico_id BIGINT REFERENCES topicos(id)`;
- `conteudo_id BIGINT REFERENCES conteudos(id)`;
- `tipo TEXT NOT NULL CHECK (tipo IN ('resumo', 'anotacao', 'card'))`;
- `titulo TEXT NOT NULL`;
- `conteudo TEXT` para resumo/anotação;
- `frente TEXT` e `verso TEXT` para card;
- `metadata JSONB NOT NULL DEFAULT '{}'`;
- `criado_em`, `atualizado_em` e `excluido_em` com timezone.

O banco exigirá exatamente o formato adequado ao tipo: resumo e anotação usam
`conteudo`; card usa `frente` e `verso`. `aluno_id` é sempre o autor, portanto
todo registro nessa tabela é editável pelo proprietário.

### Projeção unificada

Uma view ou RPC de leitura retornará um contrato comum:

```text
id, origem, editavel, tipo, titulo, conteudo, frente, verso,
classe_id, topico_id, conteudo_id, criado_em, atualizado_em
```

Cards ativos de `cards_personalizados` entram como `origem = 'plataforma'`.
Itens de `bag_itens` entram como `origem = 'aluno'`. Itens excluídos ou cards
obsoletos não aparecem. O filtro por aluno será aplicado nas duas fontes.

## API e permissões

A migration criará RLS e operações seguras para:

- listar a Bag do aluno autenticado, com filtro opcional por origem, tipo,
  classe e tópico;
- criar item autoral validando tipo e campos obrigatórios;
- editar e excluir logicamente apenas item autoral do próprio aluno;
- gerar uma referência de compartilhamento para chat, sem abrir leitura
  pública do item;
- resolver a referência apenas para participantes autorizados da conversa ou
  membros autorizados da guilda.

Compartilhar não muda a privacidade original nem transforma o item em público.
Se o item for apagado, a referência no chat mostra que o item não está mais
disponível.

## Experiência na trilha

Dentro do conteúdo do tópico haverá uma ação `Adicionar à Bag`, com escolha de
tipo:

- `Resumo`: título e texto longo;
- `Anotação`: título e texto curto/longo;
- `Card`: frente e verso.

O tópico e o conteúdo atual serão preenchidos automaticamente e continuarão
visíveis no editor. Após salvar, o aluno recebe confirmação e o item aparece
na Bag sem precisar sair da trilha. Itens gerados podem ser salvos como item
autoral por duplicação explícita, preservando o original somente leitura.

## Experiência da Bag

A tela terá:

- cabeçalho no estilo atual do sistema;
- abas ou filtro segmentado `Meus itens` / `Gerados para você`;
- filtros por tipo e tópico;
- busca por título e texto;
- cards compactos com tipo, título, origem, tópico e data;
- detalhe expansível para resumo/anotação;
- modo frente-verso para cards;
- ações de editar, excluir e compartilhar apenas em itens autorais;
- estado vazio orientando o aluno a criar o primeiro item dentro de um
  conteúdo;
- estados de carregamento, erro e item removido sem quebrar a tela.

## Compartilhamento social

O botão `Compartilhar` abre o mesmo fluxo de destino já usado no Social:
conversa privada ou guilda. A mensagem leva apenas o identificador da origem,
tipo e uma prévia segura. O servidor resolve o conteúdo no momento da leitura,
respeitando autorização, pertencimento à guilda e bloqueios do chat.

## Fluxo de dados

1. O aluno abre Bag pela Trilha ou Perfil.
2. O cliente chama a leitura unificada com os filtros atuais.
3. O servidor retorna cards gerados e itens autorais no mesmo contrato.
4. O aluno cria/edita/exclui itens autorais por RPC autenticada.
5. A tela atualiza por resposta da operação e por revalidação ao retornar ao
   foco.
6. Ao compartilhar, o servidor valida o destino e cria a referência da
   mensagem sem copiar o item.

## Validações e casos de erro

- Não aceitar item sem texto obrigatório.
- Limitar tamanho de título, frente, verso e conteúdo no servidor.
- Rejeitar tentativa de editar ou excluir card gerado.
- Não permitir vínculo com tópico/conteúdo de outra classe do aluno.
- Não exibir item autoral excluído.
- Não permitir compartilhar em conversa/guilda sem autorização.
- Se uma fonte falhar, exibir erro localizado sem esconder a outra origem;
  cards gerados e itens autorais terão estados independentes.

## Testes de aceitação

- Bag acessível pelos dois pontos de entrada e com a mesma tela.
- Cards existentes aparecem como gerados e não permitem edição.
- Aluno cria resumo, anotação e card dentro de um tópico.
- Itens criados aparecem vinculados ao tópico/conteúdo correto.
- Edição e exclusão afetam somente itens do próprio aluno.
- Busca e filtros não misturam itens de outra classe ou aluno.
- Item autoral pode ser compartilhado em chat autorizado.
- Usuário não autorizado não consegue resolver a referência compartilhada.
- Itens aparecem no estado vazio, carregando e erro de forma legível.

