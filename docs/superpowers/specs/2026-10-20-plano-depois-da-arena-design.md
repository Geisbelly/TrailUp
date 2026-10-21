# Plano depois da arena — o que falta quando o produto está construído

Levantado em 2026-10-20/21, com a produção em `20261021_20`. Sucessor de
[`plano-do-que-falta`](2026-10-19-plano-do-que-falta-design.md), cujas seis fases estão todas
em `main`.

## Como foi levantado

Mesmo método das vezes anteriores — **"a RPC existe × algum cliente a chama"** — mais a leitura
das três migrations que eu não havia visto (`_17`, `_19`, `_20`) e medição direta na produção.

O método mudou de resultado: nas rodadas anteriores ele achava **lacuna de produto** (a batalha
não era jogável, o aluno não via evento). Agora o produto está construído, e o que ele acha é
**dívida de infraestrutura e falta de uso**. A conclusão honesta deste plano é que **quase nada
do que falta é código novo.**

## O estado, medido

| | |
| --- | --- |
| migrations | `20261021_01` a `_20`, aplicadas (produção = head) |
| arena | de volta, com Elo, janela de convite (24 h) e limite diário contra o mesmo adversário |
| rank | período manual, com pódio congelado em `rank_podio_congelado`; 6 tipos, incluindo Elo |
| guildas | formação no console (`guilda_formacao_da_turma`) e janela visível ao aluno |
| missão diária | **rodou de verdade**: `trailup_missao_diaria` às 03:00 e `..._texto` às 03:05 de 20/10, as duas `succeeded`, 29 missões para o dia |
| varredura de desafio | 72 execuções em 6 h, a cada 5 min |

A `_20` consertou um defeito que só o primeiro dia real mostrou: **9 das 29 missões de 20/10
eram de perfil que ninguém podia cumprir**, porque a coorte usava todo perfil presente em
`aluno_perfil` em vez do perfil ativo. É o tipo de coisa que nenhuma subtransação pega.

---

## O risco que manda em tudo — e a correção do que este plano dizia

> **Corrigido em 2026-10-20/21, por medição, depois de começar a fase 1.** A versão original
> desta seção dizia: *"22 das 61 RPCs que os clientes chamam não são criadas por migração
> nenhuma"*, com 11 de guildas e 8 de social. **Era falso em 19 dos 22 casos**, e o erro estava
> no instrumento, não na base.

O portão `test_rpc_chamada_tem_migracao` lia o **texto-fonte** dos `.py` procurando
`CREATE FUNCTION` literal. Dois jeitos legítimos de escrever migração escapam disso:

| ponto cego | o que ficava invisível |
| --- | --- |
| SQL em **arquivo externo** (`op.execute(path.read_text(...))` sobre `docs/mobile/sql/*.sql`) | as 10 de guildas e as de social, versionadas desde **setembro** |
| `CREATE` com o **nome interpolado** (`FUNCTION public.{name}(`) | `social_chat_listar` e `social_chat_enviar`, da `20260913_10` |

Conferido função por função: o md5 de `prosrc` da última definição da cadeia bate com o da
produção nas 16 de guilda e social. **Não havia drift e não faltava código.** A dívida real era
**3** — `fn_atualizar_aluno_perfil`, `fn_cadastrar_aluno_com_perfis` e `fn_auth_email_exists` —,
e depois da `20261021_24` é **1**: só a última, que é a issue #329 e só faz sentido versionar
junto da correção.

### O que realmente faltava: o EXECUTE de `PUBLIC`

A divergência entre um banco novo e a produção não estava no código das funções. Estava no
privilégio:

1. o `ALTER DEFAULT PRIVILEGES` do schema `public` concede EXECUTE a `anon` em **toda função
   nova** — e é schema não versionado;
2. num Postgres comum (Docker local, ambiente novo) o padrão da *linguagem* concede EXECUTE a
   **`PUBLIC`**;
3. **nenhum `.sql` de `docs/mobile/sql/` revoga EXECUTE de função** — os `REVOKE` de lá são
   sobre TABELAS, o que é outra coisa: tabela fechada mais função `SECURITY DEFINER` aberta é
   exatamente o desenho em que a função é a única porta;
4. na produção o `anon` **está** revogado nas 20 assinaturas afetadas — **na mão, fora da
   cadeia**. A prova é `social_par`, a única função dos dois domínios que ainda carrega
   `=X/postgres`.

Então o enunciado certo do risco é: **na produção, agora**, qualquer função nova nesses domínios
sem REVOKE explícito nasce executável pelo anônimo, quase sempre `SECURITY DEFINER`. Isso é pior
que a falta, porque funciona e ninguém percebe.

> **Segunda correção, da revisão de 21/10.** A primeira versão desta seção falava de "um banco
> construído do zero". Medido depois: **a cadeia não constrói banco nenhum do zero** — cria 83
> tabelas e não cria o schema base (`alunos`, `classe`, `classe_aluno`, `perfil`, `questoes`,
> `topicos`, `professor`, `notificacoes`), sendo a primeira revisão de tabelas de checkpoint do
> LangGraph. Ela é um **incremento** sobre um schema criado no painel, exatamente como
> `docs/architecture/schema-nao-versionado.md` já concluía ao apontar o baseline de
> `pg_dump --schema-only` + `alembic stamp`. Duas vezes seguidas a mesma armadilha: usar "banco
> do zero" como argumento sem medir se esse banco existe.

Segue valendo, sem correção: **o projeto está no Supabase Free, sem PITR e sem backup diário
baixável**, então recuperar é "rodar as migrations" — e o portão impede a dívida crescer, não a
paga. Ele nasceu de dois defeitos vindos dessa fatia (`fn_questao_gabarito_em_texto`, que
impedia salvar questão dissertativa, e `social_presenca_turma`, que entregava a lista de alunos
de qualquer turma).

**A lição de método**, que vale mais que o número: uma lista permissiva de exceções nunca
reclama de entrada obsoleta, então ela mente para cima e ninguém percebe — três das 22 já
estavam pagas havia semanas, e uma delas era citada no próprio docstring do portão como
corrigida. Agora há teste cobrando isso, e os dois pontos cegos do parser estão fechados com
teste cada.

---

## O que a varredura achou de superfície

### Lacuna genuína (uma)

**`guilda_cancelar_convite` não tem chamador em lugar nenhum** — nem cliente, nem outra função,
nem cron. Convite enviado por engano não pode ser cancelado por quem o enviou. É a única das 35
RPCs do domínio com EXECUTE para `authenticated` e uso zero.

> Não confundir com a decisão de 20/10 registrada na `_17`: *"Fechar agora não cancela convites
> pendentes (decidido: manter como está)"*. Aquilo é sobre o fim da janela de formação; isto é
> sobre o aluno desfazer o próprio convite.

### Uma suspeita minha que a medição derrubou

`arena_encerrar` tem EXECUTE para `authenticated` e exige apenas ser participante. Suspeitei que
quem estivesse na frente poderia fechar a partida e travar a vitória. **Medi, e não é isso:**

    aluno1 cria duelo, aluno2 aceita, aluno1 acerta, aluno2 nao responde
    aluno1 chama arena_encerrar  ->  resultado = sem_adversario
                                 ->  NENHUMA linha em ranqueada_elo_partida

`fn_desafio_encerrar` só trata como competitivo quem tem `respondidas > 0` nas duas equipes,
então fechar cedo resolve `sem_adversario` — que, por desenho da `_19`, **não move Elo**.

O que sobra é menor e real: **o participante encerra a partida que o adversário já aceitou,
antes de ele jogar**, e recebe `desafio_participou` por isso (1 evento pago, para quem
respondeu). Não é exploração de rating; é poder tirar a partida do outro. Decisão a tomar:
`REVOKE` (fechamento só por `arena_responder` e pela varredura) ou dar a isso a semântica
explícita de desistir.

### Não são lacunas — e está escrito aqui para ninguém "consertar"

Quatro RPCs aparecem sem chamador de cliente **de propósito**:

| RPC | quem a usa |
| --- | --- |
| `guilda_janela_aberta` | `guilda_criar`, `_convidar`, `_entrar`, `_aceitar_convite`, `_formacao_da_turma`, `_janela_da_turma` |
| `guilda_congelar_composicao` | `evento_classe_abrir` |
| `guilda_classe_atual` | `guilda_criar` |
| `arena_encerrar` | `arena_responder` (é o passo de fechamento do caminho competitivo) |

---

## O que está construído e nunca foi exercitado

| | |
| --- | --- |
| `ranks` | **1 linha**, com 6 tipos disponíveis |
| `eventos_classe` | **0 eventos** criados |
| `guildas` | **0** |
| `missao_aluno` | 0 linhas — esperado: ela só nasce na conclusão, e ninguém usou o app |

**Todo caminho novo foi medido por mim, em subtransação abortada. Nenhum por um aluno real.**
A `_20` é a prova de que isso não basta: ela conserta um defeito que só apareceu quando o cron
rodou de verdade na produção.

O ensaio que falta é um fluxo completo com duas contas de aluno e uma de professor —
criar guilda, lançar desafio, jogar, abrir evento, criar ranking. **Eu não crio contas**, então
esse item é da Geisbelly.

E o bloqueio de processo: **o CI está parado por cobrança desde 19/10 16:12**
(`recent account payments have failed or your spending limit needs to be increased`), conferido
de novo em 20/10 18:27. **Nenhum PR desta leva inteira teve verificação automática** — todas as
suítes foram rodadas localmente. Enquanto isso durar, o repositório depende de quem abre o PR
lembrar de rodar tudo.

---

## Fases propostas

1. ~~**Pagar a dívida de schema não versionado.** Começar pelas 11 de guildas, depois as 8 de
   social, depois as 3 restantes.~~ **Feita, e refeita acima.** `20261021_21` a `_24` estão
   aplicadas (produção em `20261021_24`): `fn_atualizar_aluno_perfil` e
   `fn_cadastrar_aluno_com_perfis` entraram na `_24`, e a `_23` fechou o EXECUTE de `PUBLIC` nas
   20 assinaturas de guilda/social que a cadeia nunca revogou. **Sobra uma**:
   `fn_auth_email_exists`, atrelada à issue #329 — versionar o texto atual registraria a
   enumeração de e-mail em vez de corrigi-la.
2. **`guilda_cancelar_convite` no cliente.** Pequeno, e fecha a última superfície com EXECUTE e
   uso zero.
3. **Decidir `arena_encerrar`** — `REVOKE` ou "desistir" com nome e aviso.
4. **Ensaio ponta a ponta com contas reais** (Geisbelly).
5. **Billing do GitHub Actions** (Geisbelly) — sem isso, nada acima tem CI.

## Decisões em aberto

- **Unificar os dois "responder"** — deixada explicitamente na `_19`. Hoje o banco cobra a
  separação (`arena_desafio_cooperativo` / `guilda_desafio_e_da_arena`), o que é melhor que
  silêncio; a pergunta é se vale uma função só.
- **Custo da LLM da fase 6** — `missao_diaria_llm_max_coortes` está em 30 e o cron de texto rodou
  em 20/10, então agora há dado real para medir antes de ligar para todas as turmas.
- **`arena_encerrar`** (acima).

## O que este plano não propõe

- Fase nova de produto. O que o pedido original pediu — eventos, missões, ranks, guildas,
  batalhas, os quatro eixos, Elo — está construído e aplicado.
- Reescrever o que funciona. A dívida da fase 1 é de **versionar**, não de mudar comportamento:
  qualquer diff de comportamento ali é defeito, não melhoria.
