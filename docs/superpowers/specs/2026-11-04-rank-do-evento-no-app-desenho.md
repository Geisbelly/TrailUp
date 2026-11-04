# Rank do evento no app — análise e redesenho (#155, fase 4)

**Data:** 2026-11-04
**Escopo:** o bloco "Rank do evento" dentro do cartão do evento, na aba Social do app do aluno.
**Protótipo:** [`prototipos/aluno/mobile-v1/06b-rank-do-evento.html`](../../../prototipos/aluno/mobile-v1/06b-rank-do-evento.html)
(`?perfil=` troca o perfil, `?estado=` o estado, como nas outras telas do mobile-v1).
**Spec do produto:** [`2026-11-03-inscricao-em-evento-e-rank-do-evento-design.md`](2026-11-03-inscricao-em-evento-e-rank-do-evento-design.md).
O banco (fase 2) e o console (fase 3) estão prontos e não mudam aqui.
**Situação:** aplicado no app em `mobile/src/components/eventos/RankDoEvento.tsx`, com o texto e a
ordem por perfil em `enfaseDoRank` e `fraseDoRank` (`mobile/src/services/eventos/eventoModel.ts`).

## 1. O que está errado na primeira versão (PR #923)

A primeira versão funciona, mas não é o TrailUp. Comparada com
`docs/mobile/visual-design.md`, com as regras do mobile-v1
(`prototipos/aluno/prompts/mobile-v1/00-regras-gerais.md`) e com a Arena já
desenhada em `06-social.html`, ela erra em seis pontos.

| # | Primeira versão | O que o app já faz | Onde está |
| - | - | - | - |
| 1 | Seção solta no rodapé do cartão do evento, com rótulo pequeno e sem título | Bloco com cenário, linha de apoio e título em Georgia | Arena em `06-social.html` (`.arena`, `.ar-cab`) |
| 2 | Sem arte | Cada contexto tem sua arte; o do ranking é `rankingArenas` | `designAssets.ts`, `getProfileArtwork(…, 'rank')` |
| 3 | Lista de texto: posição, nome e número | Pódio com retrato na moldura do perfil de cada aluno, medalha do perfil de quem vê e pilares retos | `RankingPodium.tsx`, `FramedProfileImage`, `UtilityIcon kind="medal"` |
| 4 | Botão em pílula (raio 999), só com contorno | `.btn` com raio de 6 px e 48 px de altura; primário preenchido, secundário com `border-strong` | `app.css` do mobile-v1 |
| 5 | Top 5 mais a linha "7º você" | O Ranking guarda o pódio e a própria posição | `05-ranking.html`, `FolhaMinhaPosicao` |
| 6 | Mesmo texto para os 7 perfis | O Social muda destaque, ordem e texto por perfil | `socialDestaque.ts`, `profileSectionGuide.ts` |

O ponto 6 explica o resto. "Adaptar por perfil" no TrailUp nunca foi só trocar
a cor: a paleta já muda sozinha com o tema. O que muda por perfil é a ênfase,
ou seja, o que aparece primeiro e o que o texto destaca.

## 2. O que a pesquisa diz

### Rank em contexto de ensino

- **Rank absoluto desanima quem está embaixo, e o rank relativo ajuda.**
  - Revisão sistemática em ensino superior (Li et al., 2024, *J. Computer Assisted Learning*):
    - no rank absoluto, a motivação intrínseca é maior entre os primeiros;
    - no rank relativo, ela fica parecida em todas as posições, e os alunos de desempenho mais baixo ganham mais;
    - quem está no meio ou embaixo relata mais pressão dos colegas.
  - A mesma revisão recomenda pseudônimo no rank absoluto e diz que o efeito do anonimato ainda precisa de estudo.
- **Rank não é ganho garantido.**
  - Hanus e Fox (2015) acompanharam um semestre com rank e emblemas e mediram menos motivação e notas finais mais baixas que na turma sem gamificação.
  - Um quase-experimento longitudinal (2024) também mediu queda na nota da prova.
  - Por isso o rank do evento é opcional e não toca na nota (decisão D1 da spec).
- **Gênero.**
  - Christy e Fox (2014) e Albuquerque et al. (2017) mostram que um rank dominado por homens pode aumentar a ansiedade de alunas.
  - Zahedi et al. viram o desempenho subir para todos os gêneros, mas a maioria das alunas não gostou do rank.
  - Para nós isso reforça duas coisas: entrar tem de ser escolha, e sair tem de ser tão fácil quanto entrar.
- **Micro-ranks.** Um estudo de desenvolvimento publicado no PMC (PMC8097522, ainda sem teste com alunos) propõem vários ranks pequenos, um por atividade, para que quem está mal num critério possa se destacar em outro. Os três critérios do evento (batalha, pontuação, missões) já são isso.

### Perfil de jogador e rank

- A evidência direta para BrainHex é fraca. Não há estudo que meça preferência por rank em cada tipo BrainHex, e a validade de Seeker, Survivor, Daredevil e Conqueror já foi questionada.
- A melhor evidência é a do Hexad (Tondello et al., 2016 e 2019; HexArcade, 2020):
  - o tipo *Player* prefere rank e emblemas;
  - *Socialiser* prefere equipes;
  - *Achiever* prefere desafios, progresso e missões.
  - A correspondência com o BrainHex é aproximada: Conqueror e Daredevil ficam perto do *Player*, Socializer do *Socialiser* e Achiever do *Achiever*.
- Orji, Vassileva e Mandryk (2014) mostram que a mesma estratégia pode ajudar um perfil e atrapalhar outro. `socialDestaque.ts` já cita isso, e a regra continua valendo: o mapa por perfil é ponto de partida para medir, não verdade.

### Produtos

- **Grupo pequeno e escopo restrito.** Ligas de grupo pequeno, no modelo do Duolingo, e ranks entre amigos ou na própria turma motivam mais gente do que um rank global. As fontes que achamos sobre as regras exatas das ligas são extraoficiais e se contradizem. Para nós vale só o princípio, que já temos: o rank é da turma e do evento.
- **Entrar num desafio com janela.** Nos desafios do Strava, a pessoa entra por escolha, há uma janela de tempo e quem conclui ganha um emblema. Esse modelo de entrada é o mesmo do rank do evento.
- **Ver a própria posição na hora.** Os guias de desenho de rank concordam em três pontos:
  - quem olha precisa achar a própria posição de imediato;
  - o topo tem de parecer diferente do resto;
  - não é preciso mostrar a lista inteira.
- **Nada de padrão enganoso.** Sair não pode ser mais difícil do que entrar.
- **Nomes em sala.** Kahoot e Quizizz usam apelido ou anonimato quando o rank aparece projetado. No app do TrailUp a RLS já restringe o rank à turma, e o nome aparece como "Nome S.", igual ao Ranking.

## 3. A proposta

### Peças: as mesmas para todos

1. **Cabeçalho da arena:**
   - `rankingArenas[perfil]` ao fundo, com um véu em gradiente para manter o contraste AAA do texto;
   - a medalha do perfil;
   - a linha de apoio com o nome do evento e o título "Rank do evento" em Georgia;
   - chips com o número de inscritos, a data final e, quando o aluno entrou, "Você está no rank".
2. **Seletor de critério**, só quando o professor ligou mais de um: Batalha, Pontuação e Missões. É o micro-rank da pesquisa; cada critério é um rank em `ranks.evento_id`.
3. **Bloco de foco**, o único que muda por perfil (tabela abaixo):
   - fora do rank, é o convite;
   - dentro, é a posição do aluno, com o número grande em Georgia e uma frase.
4. **Pódio:** o `RankingPodium` em miniatura, com retrato na moldura do perfil de cada aluno, a medalha do perfil de quem vê e pilares retos.
5. **Vizinhança:** um acima, o próprio aluno e um abaixo, com "· · ·" onde a lista pula. É o rank relativo. A lista inteira fica atrás de "Ver rank completo", numa folha de baixo.
6. **Ações:**
   - fora do rank, "Entrar no rank" é o botão primário e ocupa a largura toda, como "Entrar na arena" no `06-social`. O texto de opcional fica logo embaixo.
   - dentro, "Sair do rank" é secundário e fica sempre visível.
   - "Como funciona" é um bloco recolhível que diz que entrar não muda nota, XP nem o ranking da turma.

### Ênfase por perfil

Cada frase usa só dados que já existem em `vw_rank_posicoes_por_classe`: posição, pontos, nomes, total de linhas e `percentual_do_lider`, que vem nulo abaixo de 8 participantes. Nenhum número é inventado.

| Perfil | Motivação (Nacke et al., 2014) | Fora do rank: convite | Dentro do rank: frase da posição | Ordem dos blocos |
| - | - | - | - | - |
| Conqueror | vencer o desafio difícil | "Bia P. lidera com 60 pts. 11 colegas disputando agora." | "Faltam 8 pts para passar Gui N." | posição, pódio, vizinhança |
| Daredevil | ritmo e risco | igual ao Conqueror | igual ao Conqueror | posição, pódio, vizinhança |
| Achiever | metas e marcos | "Pódio a partir de 46 pts." | "29 pts para o pódio." ou "Você está no pódio." | posição, pódio, vizinhança |
| Mastermind | critério e origem do número | "Conta pontos de batalha de 03/11 a 10/11." | "18 pts de 03/11 a 10/11. 30% do que o líder tem." O "Como funciona" já vem aberto. | posição, pódio, vizinhança |
| Socializer | estar junto | retratos de quem entrou: "Bia P., Caio R. e mais 9 colegas" | "Você e mais 11 colegas." | **pódio primeiro** |
| Seeker | descoberta | "3 jeitos de disputar: descubra onde você se sai melhor." | "Em missões você está em 3º." | posição, pódio, vizinhança |
| Survivor | segurança e continuidade | "É opcional e reversível." | "Sair é a qualquer hora e não muda nota nem XP." | **vizinhança antes do pódio** |

Para o Survivor a vizinhança vem antes de propósito. É a aplicação direta do achado de que quem está embaixo sente pressão: ele vê primeiro quem está perto dele, não o topo.

### Estados

O protótipo tem todos:
- fora do rank;
- dentro, no meio da tabela;
- dentro, no pódio;
- poucos inscritos (sem percentual abaixo de 8);
- ninguém entrou, com o troféu e "Quem entrar primeiro abre a disputa";
- encerrado, sem botões;
- carregando, com esqueleto;
- erro, que fica só no bloco do rank, com "Tentar de novo", enquanto o resto do evento continua.

## 4. O que muda no código (PR #923)

- `RankDoEvento.tsx` é reescrito com as peças acima. Ele passa a receber `palette` inteira, e não quatro cores soltas, como fazem `RankingPodium` e `SocialHubDestaque`.
- Para retratos e molduras, usa `useRankingPeople(classeId, ids, …)`, o mesmo hook do Ranking.
- Para o pódio, reaproveita `RankingPodium` com o tamanho do celular. Se ele não couber no cartão, cria-se uma variante compacta no mesmo arquivo, sem copiar.
- As funções puras em `eventoModel.ts`, todas com teste:
  - `vizinhanca(rank)` devolve um acima, o aluno e um abaixo, com as marcas de salto;
  - `focoDoRank(perfil, rank, inscrito)` devolve a frase e o ícone de cada perfil;
  - `ordemDosBlocos(perfil)`;
  - `linhasVisiveis` deixa de existir.
- A ênfase fica numa tabela tipada por `BrainHexProfile`, no molde de `AREA_EM_DESTAQUE`, e cita as mesmas fontes.
- A verificação visual usa os 7 perfis em 360 e 430 px, como pede o `visual-design.md`.

## Fontes

- Li et al. (2024). [The use of leaderboards in education: a systematic review of empirical evidence in higher education](https://onlinelibrary.wiley.com/doi/10.1111/jcal.13077). *Journal of Computer Assisted Learning*.
- [Leaderboard design principles to enhance learning and motivation in a gamified educational environment: development study](https://pmc.ncbi.nlm.nih.gov/articles/PMC8097522/) (PMC8097522).
- [How leaderboard positions shape our motivation](https://www.emerald.com/intr/article/33/7/1/178330/How-leaderboard-positions-shape-our-motivation-the). *Internet Research*, 33(7).
- [A longitudinal quasi-experiment of leaderboard effectiveness on learner behaviors and course performance](https://www.sciencedirect.com/science/article/abs/pii/S1041608024001651). *Learning and Individual Differences* (2024).
- Albuquerque et al. (2017). [Does gender stereotype threat in gamified educational environments cause anxiety?](https://oro.open.ac.uk/80025) *Computers & Education*.
- Christy, K. e Fox, J. (2014). Leaderboards in a virtual classroom: a test of stereotype threat and social comparison explanations for women's math performance. *Computers & Education*, 78, 66–77.
- Hanus, M. e Fox, J. (2015). Assessing the effects of gamification in the classroom. *Computers & Education*, 80, 152–161.
- Nacke, Bateman e Mandryk (2014). [BrainHex: a neurobiological gamer typology survey](https://www.sciencedirect.com/science/article/abs/pii/S1875952113000086). *Entertainment Computing*.
- Tondello et al. (2016). [The Gamification User Types Hexad Scale](https://uwspace.uwaterloo.ca/bitstream/handle/10012/12788/p229-tondello.pdf?sequence=3). CHI PLAY.
- [Hexad-12: developing and validating a short version of the Gamification User Types Hexad Scale](https://dl.acm.org/doi/fullHtml/10.1145/3544548.3580968). CHI 2023.
- Altmeyer et al. (2020). [HexArcade](https://dl.acm.org/doi/pdf/10.1145/3410404.3414232). CHI PLAY.
- Orji, Vassileva e Mandryk (2014). Modeling the efficacy of persuasive strategies for different gamer types in serious games for health. *UMUAI*.
- Chou, Y. [Gamification leaderboards that motivate the other 90%](https://yukaichou.com/advanced-gamification/how-to-design-effective-leaderboards-boosting-motivation-and-engagement/).
- Strava. [Strava Challenges](https://support.strava.com/hc/en-us/articles/216919177-Strava-Challenges) e [Trophy Case](https://support.strava.com/hc/en-us/articles/216918557-The-Strava-Trophy-Case).
- Kahoot. [Trust: for teachers](https://trust.kahoot.com/teachers/).
