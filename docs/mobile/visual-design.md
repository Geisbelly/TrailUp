# Mobile: arte facetada

Referencia: biblioteca `Design` fornecida em Downloads, setembro de 2026.

## Direcao

- Personagens, retratos e emblemas com planos angulares e cores por perfil.
- Personagens aparecem somente na experiencia autenticada do aluno. Entrada,
  login e recuperacao usam logo e cenarios, sem guardiao representando o sistema.
- Imagens escolhidas por funcao, nao um unico papel de parede por perfil:
  panoramas no banner, territorios no mapa e cenario proprio na entrada publica.
  Todas as trilhas recebem um cenario por perfil atras da area inteira. Arvore
  e lista mantem suas raizes transparentes; o mapa acrescenta seu terreno proprio.
  O cabecalho compacto tem protecao de contraste, sem recortar a arte numa faixa.
  Notificacoes e areas de
  leitura usam superficies discretas na cor do guia.
- Roxo predominante apenas nas telas publicas. Depois do login, fundos,
  superficies, navegacao e acoes seguem a cor do perfil ativo, com cenarios relacionados:
  turquesa (Amara), cinza (Kenji), vermelho (Ember), roxo (Idris), azul (Amina),
  laranja (Mateo e Zuri) e dourado (Kwame).
- Os icones funcionais da trilha permanecem os anteriores, por perfil.
  Emblemas aparecem nas animacoes de carregamento, no seletor de perfil e como
  referencia de identidade, sem substituir a navegacao.
- Molduras da mesma familia, na cor do perfil, envolvem fotos e retratos no
  perfil, edicao e guia da trilha. Totens ficam no catalogo de assets, sem uso
  decorativo na abertura do ranking, que prioriza categorias e classificacoes.
  Conquistas priorizam sua imagem cadastrada. Sem imagem, o tipo define a arte:
  passos, velocidade, calendario, acerto, tempo ou exploracao.
- Titulos serifados, corpo em fonte de sistema, raios de 6px e divisores geometricos.
- Navegacao respeita safe areas; formularios rolam quando o teclado ocupa a tela.

## Implementacao

`mobile/src/styles/design.ts` define os tokens comuns.
`profileShellPalette.ts` deriva superficies e bordas da matiz do perfil e
preserva o ajuste de contraste dos acentos. `profileShellTheme.ts` associa a
paleta ao perfil ativo. `designAssets.ts` separa `profileBanners`, `journeyMaps`,
`trailSceneries`, `rankingArenas`, `profileFrames`, `profileTotems`, `profileEmblems`,
`journeyObjects` e `publicScenery`.
O acesso ao cenario autenticado exige contexto (`banner`, `map`, `trail` ou `rank`).
`FramedProfileImage` reserva dimensoes fixas, preserva a abertura transparente
da moldura e mantem a foto enviada pelo aluno. Artes ornamentais nao capturam toques.

`ProfileArtwork` aplica a cor do perfil ativo aos icones ilustrados com uma matriz
de luminancia, preservando transparencia, sombras e facetas. Ranking (inclusive
medalhas do podio), conquistas, Bag, loja, social, notificacoes e carregamento
compartilham esse tratamento. Cada funcao mantem sua propria silhueta. Icones
vetoriais usam os tokens do mesmo perfil, com contraste invertido em botoes
preenchidos e tons suaves nos estados desabilitados. Fotos, personagens e imagens
de conteudo mantem suas cores; avisos de erro/acerto preservam a semantica de estado.

A identidade aparece na entrada, login, recuperacao, navegacao, cabecalho da
trilha, mapa, arvore, lista, perfil, ranking, social, notificacoes, Bag e estados
vazios/carregamento. Fotos e banners enviados pelo usuario continuam prioritarios.

Os sete guardioes mantem seus nomes e papeis. O Socializador continua usando
Mateo e Zuri juntos. As artes do microservice nao sao substituidas por este trabalho.

## Ranking e telas internas

A inicial do ranking preserva a entrada por categorias, com trofeu contextual e
cards ornamentados. O podio fica somente dentro de cada categoria. Mostra alunos,
fotos ou retratos de seus proprios perfis, molduras e degraus facetados. A arena
acompanha o perfil ativo de quem consulta; dados de colegas nao mudam o tema da tela.
Alunos sem perfil nem foto usam iniciais, nunca um guardiao atribuido por suposicao.

As posicoes oficiais sao preservadas, inclusive empates. Nao ha alunos ficticios
para preencher lugares vazios. Todos os empatados entre as tres primeiras posicoes
permanecem representados. Filtros por perfil afetam a lista, nao o podio geral;
o corte do ranking e a propria posicao continuam visiveis.

Bag e loja usam mochila, bau e artes de recursos com significados distintos.
Modais respeitam safe areas; o editor e o chat acompanham o teclado. Notificacoes
distinguem mensagens novas por borda, icone e rotulo, mantendo as acoes existentes.
Metricas mantem os layouts por perfil, mas deixam de impor uma paleta independente.

## Reimportacao

Execute na raiz, com ImageMagick instalado:

```sh
node scripts/import-mobile-design.mjs /caminho/para/Design
```

O script documenta os arquivos selecionados. Importa apenas as artes usadas,
reduz as dimensoes e remove metadados, sem alterar os originais. Cenarios usam
WebP; emblemas, molduras, totens e personagens usam PNG. Molduras sao normalizadas
para um canvas RGBA quadrado de 256px. O app nao depende da pasta Downloads.

## Verificacao

`npm test` no mobile inclui os contratos de assets, o par de guardioes e o
contraste dos tokens e a colorizacao dos icones para os sete perfis, sem perda de
alpha ou contraste entre facetas. A validacao visual deve incluir os sete perfis, titulos
longos, modulos bloqueados/concluidos, formularios com teclado e telas pequenas.
