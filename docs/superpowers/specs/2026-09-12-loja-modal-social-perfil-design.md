# Loja modal da aba Social por perfil — Design

- Data: 2026-09-12
- Status: proposta aprovada para documentação
- Escopo: catálogo, modal Social, personalização por perfil e gate de telemetria

## Objetivo

Adicionar uma loja contextual à aba Social. A loja é aberta por um ícone pequeno, cuja aparência é personalizada pelo perfil ativo. O conteúdo é apresentado em um modal vertical inspirado na referência visual enviada, sem tirar o usuário do contexto social.

A primeira entrega define o contrato de dados e de interface. As regras específicas de combos, bônus e presentes continuam sendo seções de catálogo até que suas economias sejam definidas.

## Experiência

### Entrada

1. A aba Social renderiza um ícone pequeno de loja.
2. O ícone usa a personalização do perfil ativo: imagem/ícone, paleta e variação visual do baú.
3. Tocar no ícone abre o modal sem trocar de rota.
4. Ao fechar, a aba Social preserva posição de rolagem e estado anterior.

O ícone não deve revelar saldo, preço ou estado de compra. Ele é apenas o ponto de entrada e a expressão visual do perfil.

### Modal

O modal ocupa a maior parte da tela disponível, com fundo claro externo e painel interno escuro, cantos arredondados e sombra. O cabeçalho contém:

- título “LOJA”;
- ação de fechar;
- saldo da moeda do usuário;
- ilustração/ícone de baú personalizado pelo perfil.

Uma barra vertical lateral contém cinco seções:

1. Informações
2. Itens
3. Combos
4. Bônus
5. Presentes

A seção ativa controla somente o conteúdo do painel principal. A navegação não altera o perfil nem cria uma nova sessão de loja.

Cada card de produto exibe nome, descrição curta, arte, preço, estado de disponibilidade e, quando aplicável, o requisito do gate. Estados mínimos: disponível, bloqueado por requisito, já adquirido, indisponível e carregando.

## Decisões de modelo

### 1. Personalização da loja por perfil

A identidade visual da loja pertence ao perfil ativo, e não ao item comprado. Isso permite que a mesma conta veja uma loja visualmente diferente ao alternar entre perfis.

Entidades:

- `loja_perfis`: configuração publicada por `perfil_id`, contendo `icon_key`, `theme_key`, `chest_key`, `accent_color` e `version`.
- `loja_itens`: catálogo global, contendo `id`, `slug`, `section`, `name`, `description`, `asset_key`, `price`, `currency`, `sort_order`, `active` e `metadata`.
- `loja_posses`: posse por `aluno_id` e `item_id`, com `purchased_at`, `source` e `metadata`.

A configuração de `loja_perfis` não pode carregar saldo nem posse. A posse também não pode ser identificada apenas pelo perfil, pois o saldo e a aquisição são do aluno que executa a ação.

### 2. Gate decidido pelo banco usando telemetria

Um item pode declarar um requisito de engajamento no catálogo. A leitura do requisito consulta exclusivamente dados persistidos no banco; o cliente só apresenta o resultado.

O contrato do gate usa:

- `scope`: escopo da medição, por exemplo `topic`, `content` ou `activity`;
- `active_sec`: tempo ativo acumulado da entrada;
- `captured_at`: instante da captura.

O banco resolve o valor do gate filtrando pelo aluno e escopo, ordenando as capturas por `captured_at` e usando `id` como desempate. A avaliação deve ser monotônica e idempotente: duplicação de leitura não pode conceder acesso duas vezes, e uma leitura fora de ordem não pode aumentar o progresso por acidente.

O requisito deve ser armazenado em `loja_itens.gate` como JSONB validado, por exemplo:

```json
{
  "metric": "active_sec",
  "scope": "activity",
  "minimum": 1200
}
```

A consulta do catálogo retorna o gate como estado calculado, nunca como regra confiada ao cliente. A compra revalida saldo, posse, item ativo e gate dentro da mesma transação.

Nota: a tabela existente também contém `dwell_sec`, mas esta spec fixa `active_sec` para o gate solicitado. O cálculo de tempo acadêmico existente, que usa `dwell_sec` cumulativo, não deve ser alterado por esta loja.

## Fluxo de dados

```
Social
  -> lê perfil ativo
  -> carrega loja_perfis
  -> abre modal
  -> lista loja_itens + estado do gate + posse
  -> usuário solicita compra
  -> banco revalida item, gate e saldo
  -> grava débito e loja_posses na mesma transação
  -> retorna posse e saldo atualizados
```

O cliente deve tratar a resposta de compra como fonte final. Em concorrência, somente uma compra pode vencer para um item não consumível; uma segunda tentativa recebe estado atualizado sem débito duplicado.

## Economia e compras

O saldo deve ter um livro-razão transacional, não um contador mutável no cliente. A implementação deve introduzir:

- `loja_saldos`: saldo atual por aluno e moeda, mantido pelo banco;
- `loja_movimentos`: crédito/débito idempotente, com referência única por operação;
- restrição única em `loja_posses` para impedir posse duplicada de item permanente.

Toda compra deve:

1. bloquear o saldo do aluno;
2. verificar item ativo e preço vigente;
3. verificar o gate;
4. verificar ausência de posse, quando o item for permanente;
5. inserir o movimento de débito;
6. inserir a posse;
7. confirmar a transação.

Falhas em qualquer etapa fazem rollback integral. Não haverá cobrança otimista no cliente.

## Segurança e RLS

O aluno pode ler o catálogo ativo, a configuração pública do perfil e suas próprias posses/saldo. Não pode alterar preço, gate, saldo, posse ou configuração publicada.

Escrita administrativa do catálogo e das configurações deve ficar fora do fluxo comum do aluno. Funções de compra devem ser `SECURITY DEFINER`, com `search_path` fixo e validação explícita do aluno autenticado.

Telemetria bruta não deve ser exposta para calcular gates no cliente. O cliente recebe apenas o estado agregado necessário para renderizar o card.

## Estados de erro

- Falha ao carregar: modal continua abrível com estado de erro e ação de tentar novamente.
- Perfil sem configuração publicada: usa configuração visual padrão, sem impedir a loja.
- Gate indisponível: item permanece bloqueado e informa que o requisito ainda não pôde ser validado.
- Saldo insuficiente: não cria movimento nem posse.
- Concorrência/duplicidade: retorna posse e saldo atuais, sem segundo débito.
- Item removido entre listagem e compra: compra falha de forma legível e o catálogo é atualizado.

## Testes de aceitação

- O ícone da aba Social muda quando muda o perfil ativo.
- Abrir e fechar o modal não muda a rota nem perde o contexto da aba Social.
- As cinco seções aparecem na ordem definida e mantêm a seção ativa.
- Um item com gate de `active_sec` só fica disponível quando o banco confirma o mínimo para o `scope` declarado.
- Repetir a mesma captura com o mesmo `captured_at`/entrada não aumenta o gate.
- O cliente não consegue comprar alterando preço, gate ou saldo no payload.
- Compra concorrente de item permanente gera no máximo uma posse e um débito.
- Falha após o débito não deixa saldo reduzido sem posse correspondente.
- O cálculo de `tempo_gasto_min` existente continua usando sua regra própria de `dwell_sec`.

## Fora de escopo desta versão

- definição da economia de Combos;
- definição da economia de Bônus;
- definição da economia de Presentes;
- itens consumíveis com múltiplas cargas;
- marketplace entre alunos;
- mapa visual da loja.

Essas seções existem na interface e no catálogo, mas seus comportamentos de compra devem ser definidos em uma decisão posterior antes de ganhar tabelas ou regras específicas.

