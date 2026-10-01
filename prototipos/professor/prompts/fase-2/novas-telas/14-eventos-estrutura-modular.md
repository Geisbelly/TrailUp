Prompt de correção — Eventos: estrutura modular (missões, metas, conquistas, desafios, arena)

## Contexto

Feedback direto da dona do projeto sobre a tela de Eventos (especificada em `02-eventos.md` e já gerada): **"isso aqui não tá legal"**, seguido de: **"evento deve ter várias missões, metas, conquistas próprias, desafios, arena especial, tudo opcional sendo obrigatório pelo menos um deles."**

Não vi o print desta correção especificamente — o anexo que deveria mostrá-la chegou repetido de uma rodada anterior. O que segue vem só do texto dela.

## O que muda em relação ao prompt `02-eventos.md`

O formulário de criar/editar evento não é mais "regras + pontuação + medalha" como um bloco só — o evento passa a ser um **contêiner que agrega peças**, e o professor escolhe quais peças aquele evento usa. Nenhuma issue detalha o formato exato de cada peça — o que segue é a estrutura mínima que dá pra montar com segurança a partir do que ela escreveu; onde a issue `#152`/`#153`/`#154`/`#155` já tinha uma decisão registrada, mantenha essa decisão dentro da peça correspondente.

### Seção nova: "O que este evento inclui"

Uma lista de **5 peças**, cada uma **opcional individualmente**, mas com a regra: **pelo menos uma precisa estar marcada** para o evento poder ser salvo/aberto. Cada peça, quando ativada, expande sua própria configuração:

1. **Missões** — vincular uma ou mais missões já existentes (tela `01-missoes-cadastrar-e-aprovar.md`) a este evento, ou criar uma nova missão específica dele.
2. **Metas** — objetivo mensurável do evento como um todo (ex. "a turma junta X pontos coletivos até o fim da janela"), distinto da pontuação individual de cada aluno.
3. **Conquistas próprias do evento** — **diferente da tela "Conquistas" da turma** (`06-conquistas-da-classe.md`). São conquistas que só existem dentro deste evento específico, não a lista geral de conquistas da turma — reforça o feedback já registrado de que "evento e conquistas são coisas diferentes": aqui elas não são a mesma lista, são um recurso à parte que o evento pode ter.
4. **Desafios** — tarefas pontuais dentro do evento, mais curtas/leves que uma missão.
5. **Arena especial** — vincula este evento a uma configuração de arena/batalha (tela `03-rank-de-batalhas.md`), escopada só a este evento.

### Validação
Ao tentar salvar ou abrir um evento sem nenhuma das 5 peças marcadas, mostrar um aviso bloqueando a ação (ex. "Escolha pelo menos um: missões, metas, conquistas do evento, desafios ou arena especial.").

## O que se mantém do prompt `02-eventos.md`
Nome, descrição, turma, tópico opcional, janela de tempo, modalidade individual/guilda, medalha de participação/destaque e recompensa continuam existindo exatamente como já especificado — a mudança é a adição da seção "O que este evento inclui" por cima disso, não uma substituição.

## O que NÃO fazer
Não trate "conquistas próprias do evento" como a mesma lista/tela da Conquistas geral da turma — são dados diferentes, mesmo sendo o mesmo conceito de "conquista". Não deixe salvar um evento sem nenhuma das 5 peças marcadas.
