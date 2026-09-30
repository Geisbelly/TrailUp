# Novas telas — leia antes dos prompts

Estas telas **não existem** em nenhuma versão do protótipo (V1–V6) nem no console atual. Diferente dos prompts `03` a `09` (que reconstroem telas já validadas), aqui não há um V5/V6 para preservar — o conteúdo destes prompts foi levantado diretamente das issues do repositório que já documentam a decisão de produto e de dados para cada recurso. Cada prompt cita a issue de onde tirou cada exigência.

São dois grupos: as **5 telas que você pediu originalmente** (`01` a `05`) e **4 telas a mais** que apareceram ao mapear o épico #133 inteiro e separar o que é console do professor (web) do que é app do aluno (mobile) — essas 4 (`06` a `09`) cobrem só o lado professor que ainda faltava.

## Referências de estilo (valem para as 5)

Siga `../01-contexto-geral-fase-2.md` e `../02-paleta-de-cores-fase-2.md` — sidebar, header, cards, botões, chips, tipografia, o assistente "Escriba". Essas telas entram como novos itens de sidebar, no mesmo padrão visual das 7 já existentes.

## Diferença importante em relação ao maturidade de cada recurso

As issues por trás destas 5 telas estão em estágios bem diferentes de decisão — isso muda o quanto cada prompt pode ser prescritivo:

| Tela | Issues-base | Estado das issues |
|---|---|---|
| Missões (cadastrar) | #150, #151, #136 | #150 já resolveu sua única objeção em aberto; #136 tem critérios de aceite fechados; #151 tem "decisões tomadas" registradas, mas segue marcada oficialmente "em planejamento" |
| Eventos | #152, #141, #153, #164 | Todas marcadas **"em planejamento — decisões em aberto"**, mas #153 (guildas) tem uma seção própria dizendo "todas as decisões estão tomadas" |
| Rank de batalhas | #154, #155 | Ambas **"em planejamento — decisões em aberto"** |
| Dashboard com sínteses e sugestões da IA | nenhuma issue existe ainda | conceito novo, proposto por analogia com padrões já aprovados do projeto (ver prompt `04`) |
| Notas (correção de dissertativas/trabalhos) | #150, #136 | schema já existe hoje; #136 pede a tela explicitamente |
| Conquistas da classe | #158 | "em planejamento", mas todas as decisões de design já registradas |
| História da turma | #145 | decisões e critérios de aceite fechados |
| Sinal de risco de reprovação (adição à Visão geral) | #135 | decisões e critérios de aceite fechados |
| Aprovações de compras com efeito acadêmico | #144 (trecho específico) | decisão pontual explícita dentro de uma issue maior sobre a loja (que em si é tela mobile, fora de escopo) |

Em nenhum dos 9 prompts abaixo eu inventei uma regra de negócio nova — tudo tem uma decisão registrada numa issue, mesmo quando a issue como um todo ainda não foi liberada para implementação. Trate os prompts como **projeto visual sobre uma decisão já tomada**, não como implementação — igual já vínhamos fazendo com as outras telas.

## O que ficou de fora, e por quê

Do épico #133, o que **não** virou prompt aqui porque é tela do app do aluno (mobile, plataforma e sistema visual diferentes) ou não tem nenhuma tela associada: rank limitado a 15 posições (#134 — é regra de dados; a única parte do professor é "ele sempre vê a turma inteira", que já é implícito na tela de Rankings existente, sem elemento visual novo), moedas/carteira (#142 — só modelo de dados, sem tela própria), a loja do aluno (#144, exceto o trecho de aprovação já coberto no prompt `09`), amizades (#148) e notificações por perfil/foco (#149).

## Ordem sugerida de envio ao Claude Design

1. `01-missoes-cadastrar-e-aprovar.md`
2. `05-notas-correcao-dissertativas-e-trabalhos.md` (é a continuação natural de missões — a tela de avaliar o que o aluno entregou)
3. `02-eventos.md`
4. `03-rank-de-batalhas.md` (depende conceitualmente de Eventos, envie depois)
5. `06-conquistas-da-classe.md`
6. `07-historia-da-turma.md`
7. `08-sinal-de-risco-de-reprovacao.md` (é um adendo à Visão geral, não uma tela nova — envie depois de já ter fechado a Visão geral)
8. `09-aprovacoes-de-compras-com-efeito-academico.md` (é um adendo à tela Aprovações)
9. `04-dashboard-sinteses-e-sugestoes-ia.md` (conceitual, sem issue — deixe por último e trate como rascunho a validar)
