# Loja Social — vitrine única

## Objetivo

Simplificar a loja aberta pelo Social para uma única vitrine de itens reais, com visual coerente com o sistema, leitura confortável no mobile e compra funcional via banco.

## Experiência

- O modal terá somente a seção `ITENS`; não haverá abas laterais vazias.
- O cabeçalho exibirá `LOJA`, saldo atual e botão de fechar.
- Cada produto será um card com ícone SVG próprio, nome, descrição, disponibilidade, preço e ação de compra.
- Os quatro produtos existentes no catálogo serão exibidos quando retornados pelo banco: prazo extra, segunda chance, dica e trocar formato.
- Cores, tipografia, bordas e estados usarão a paleta do perfil ativo e os padrões visuais da tela Social.
- O conteúdo terá contraste suficiente para leitura em telas pequenas, sem texto vertical ou truncado.

## Ícones

Criar um componente SVG local com desenhos únicos para a loja:

- `prazo_extra`: calendário com marca de extensão;
- `segunda_chance`: seta de retorno envolvendo uma estrela;
- `dica`: lâmpada com pequeno brilho;
- `troca_formato`: três painéis conectados por setas.

Os ícones receberão `color` e `size`, não dependerão de fonte de ícones e terão fallback SVG para efeitos desconhecidos.

## Dados e compra

- Carregar itens por `loja_catalogo(p_classe_id)`.
- Carregar saldo por `loja_saldo()`.
- Identificar aquisições por `loja_compras` não estornadas.
- Comprar por `loja_comprar(p_item, p_classe_id, p_idempotency_key)`.
- Após uma compra bem-sucedida, atualizar saldo e catálogo na mesma tela.
- Exibir retorno de negócio da RPC como erro legível quando `ok` for falso, incluindo saldo insuficiente ou item indisponível.
- Desabilitar o botão durante a requisição e para itens adquiridos/indisponíveis.

## Testes

- Testar a normalização dos itens reais do catálogo.
- Testar a interpretação de sucesso e falha de negócio da compra.
- Rodar TypeScript, testes direcionados e lint do mobile.

## Fora de escopo

- Criar novos produtos no banco.
- Alterar regras de preço, dotação ou gates.
- Reintroduzir combos, bônus, presentes ou outras categorias.
