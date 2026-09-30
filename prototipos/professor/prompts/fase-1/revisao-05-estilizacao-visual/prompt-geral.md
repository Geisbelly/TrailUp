Prompt geral de estilização visual — aplica-se às 6 telas principais do console (Dashboard, Trilha, Classes, Personalizações, Ranks, Meus Dados).

Estou anexando 4 imagens de referência (telas de outros produtos, usadas só como inspiração visual — não são do TrailUp e não têm nenhuma relação funcional com o console). Quero que você extraia **dispositivos de composição e de layout** dessas imagens e os aplique ao console do TrailUp, **sem adotar as paletas de cor delas** e **sem perder a essência do sistema atual** (um console de dados para professor — tabelas, filtros, formulários e cards de métricas continuam sendo o centro de cada tela, não uma página de marketing ilustrada).

## Regra inegociável — paleta e tipografia não mudam

O TrailUp já tem uma identidade visual definida e em produção — o objetivo é usar as 4 imagens para **melhorar a composição**, nunca para trocar a cor ou a fonte. Use exatamente estes tokens (não aproxime, não misture com as cores das imagens de referência):

- Fundo: `#0e1016` (bem escuro). Card: `#181b26`. Borda: `#2d3142`.
- Cor de marca (violeta): `#a95cf5` (`--primary`), com a variante clara `#c496f9` e escura `#6b35d1` para gradientes.
- Cor complementar fria (indigo): `#5b64ee` (`--accent`).
- Bronze/cobre escuro (`--secondary`): `#5a4331` — é o único tom "quente" do sistema; **não existe dourado no tema base do TrailUp de propósito** (foi removido antes por não representar a identidade real do app) — nenhuma das 4 imagens deve trazer de volta um tom dourado/âmbar como cor de destaque.
- `--success` `#2bc46a`, `--warning` `#eec034`, `--info` `#4a9edb` — fixos, não derivam da marca.
- Os 7 perfis BrainHex têm cor própria (teal, slate, vermelho, roxo, azul, laranja, dourado/mostarda) e só aparecem onde o perfil de um aluno é mostrado — não use essas cores como paleta geral da UI.
- Tipografia: títulos em **Cinzel** (serifado, ecoa a identidade "grimório medieval arcano" do TrailUp), corpo em **Inter**. Não troque por nenhuma fonte das imagens de referência.
- Cantos bem arredondados (`radius` grande) em cards, botões e inputs — isso já é do TrailUp, mantenha.
- Efeitos que já existem e podem ser reforçados: halo/glow duplo em roxo (`glow-primary`) e indigo (`glow-secondary`), gradiente diagonal `--primary-dark → --primary-light`, partículas subindo tipo brasa (`animate-ember`), recorte hexagonal (usado em badges e nós de trilha).

## O que pegar de cada imagem (e o que não pegar)

**Imagem 1 (produto financeiro, ilustração isométrica com casa/moedas/tablet, tons dourados):**
- Pegar: cards de métrica compactos com um ícone fixo no canto (não no centro), sobrepostos/flutuando por cima de uma ilustração maior, criando profundidade em camadas.
- Não pegar: a paleta dourada/creme nem a ilustração financeira em si.

**Imagem 2 (floresta mística com casa iluminada, tons roxo/azul, atmosfera de brilho):**
- Pegar: a barra de navegação em formato de pílula flutuante; o brilho suave (bloom) saindo de um ponto focal da ilustração; uma fileira de cards ilustrados pequenos logo abaixo da cena principal, cada um com título curto e um botão.
- Esta é a referência mais próxima da identidade "arcano/místico" que o TrailUp já tem — pode inspirar mais elementos daqui do que das outras, mas sempre nos tons violeta/indigo do TrailUp, nunca no verde/azul-floresta da imagem.

**Imagem 3 (tema roxo dramático, lua grande ao fundo, criatura ilustrada):**
- Pegar: o contraste entre um título grande e uma cena ilustrada de fundo com brilho radial (glow) atrás do elemento central; a lista lateral de itens com ícone + título + descrição curta em cards empilhados.
- Não pegar: a ilustração de criatura/temática de horror — não combina com o tom do produto (é uma ferramenta educacional, não um site de terror).

**Imagem 4 (tema espacial escuro, planeta isométrico, grade "What we build"):**
- Pegar: a grade compacta de ícone + rótulo curto (bom para linhas de estatística rápida ou atalhos); partículas/brilhos pontuais espalhados pela cena (mapeiam direto para o `animate-ember` que o TrailUp já tem); o contraste de escala entre uma ilustração grande e textos pequenos e discretos.
- Não pegar: a paleta azul-espacial nem a ilustração de planetas.

## Princípios gerais a aplicar (síntese das 4 imagens, já traduzidos para o TrailUp)

1. **Profundidade em camadas:** cards flutuando por cima de uma superfície com gradiente ou brilho, em vez de tudo plano sobre o fundo escuro liso.
2. **Ícone fixo no canto do card**, nunca centralizado — já é parecido com o padrão atual dos cards do TrailUp, reforce isso de forma consistente nas 6 telas.
3. **Brilho radial (glow) como acento**, não como fundo inteiro — um ponto de luz sutil atrás de um elemento de destaque (ex.: o avatar do aluno, o ícone do perfil dominante, o card de maior prioridade), usando as classes `glow-primary`/`glow-secondary` já existentes.
4. **Partículas/brasa (`animate-ember`)** como acabamento em áreas de destaque (topo de página, banners de estado vazio), com moderação — não em todo canto da tela.
5. **Grade compacta de ícone + número/rótulo** para qualquer conjunto de estatísticas rápidas — reforça um padrão que várias telas já usam (cards de indicador).

## O que NÃO fazer em nenhuma tela

- Não transformar nenhuma tela funcional (tabelas, filtros, formulários, editores) em uma página de marketing com ilustração ocupando a maior parte do espaço — os dados e os controles continuam sendo o conteúdo principal.
- Não usar as ilustrações de fantasia/floresta/espaço/horror das imagens de referência como arte final — se for usar uma ilustração de destaque em algum banner, ela deve ser compatível com a identidade visual já existente do TrailUp (guardiões dos 7 perfis BrainHex, estética "grimório arcano"), nunca os personagens das imagens de referência.
- Não mudar nenhuma paleta de cor, fonte, ou a estrutura/funcionalidade que já foi definida nos outros prompts desta pasta (`revisao-03-prompts-finais/` e `revisao-04-problemas-pontuais/`) — este prompt é uma camada de acabamento visual por cima daquelas definições estruturais, não uma substituição delas.

## Onde aplicar em cada tela

**Dashboard:** cabeçalho da página pode ganhar um brilho radial sutil atrás do título; a primeira fileira de cards de indicador ganha a profundidade em camadas (card levemente elevado, ícone fixo no canto); o bloco "Quem precisa de atenção" pode usar o glow para destacar o aluno de maior risco. Tabela de alunos e gráficos continuam funcionais e sem ilustração por cima.

**Trilha:** o mapa da trilha (canvas) pode ganhar um brilho de fundo bem sutil atrás dos cartões de tópico concluídos, e as partículas tipo brasa nas conexões entre tópicos recém-desbloqueados. O editor de tópico (formulário) permanece limpo, sem elementos decorativos competindo com os campos.

**Classes:** cards de turma ganham a mesma profundidade em camadas (leve elevação/glow no card em destaque, ex. a turma mais ativa) e o ícone da turma fixo no canto, como já foi pedido no ajuste de ícones sempre visíveis.

**Personalizações:** os cards de perfil BrainHex são o lugar mais natural para o brilho radial (usando a cor do próprio perfil como acento pontual, não substituindo a paleta do tema) e para o ícone fixo no canto — isso reforça visualmente qual perfil está em destaque sem adicionar nenhum elemento novo de função.

**Ranks:** o card do 1º lugar (coroa) ganha o brilho radial como destaque principal da tela — é o ponto que mais se beneficia desse efeito, já que é literalmente o "herói" da tela.

**Meus Dados:** tela mais simples e pessoal — pode receber o mesmo tratamento de profundidade em camadas no card de perfil do professor, com moderação (é uma tela de configuração, não precisa de brilho ou partículas).
