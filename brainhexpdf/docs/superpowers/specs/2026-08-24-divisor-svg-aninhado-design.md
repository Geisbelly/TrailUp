# Divisor SVG com viewport aninhado — Design

## Contexto

Primeira tentativa de corrigir a distorção do ornamento do divisor
(`generateMedievalSvgDivider`) trocou `preserveAspectRatio="none"` por
`"xMidYMid slice"` num único `<svg viewBox="0 0 600 40">`. Isso eliminou o
esticamento (o círculo/losango do ornamento não fica mais oval), mas criou
um problema novo, reportado pelo usuário num deck real: o container onde o
divisor vive é tão raso (10-16px de altura) que o "slice" precisa cortar a
maior parte da altura do ornamento pra caber — o que sobra visível é só uma
fatia horizontal do meio do círculo/polígono, um blob genérico sem forma
reconhecível. Tecnicamente sem distorção, mas visualmente pior: "não mostra
elementos".

## Decisão

Substituir o único `<svg>` esticado por **3 SVGs lado a lado** (flexbox),
separando o que tolera esticamento do que não tolera:

- **Linhas retas** (esquerda/direita): toleram
  `preserveAspectRatio="none"` sem problema nenhum — uma linha reta não tem
  forma geométrica pra distorcer, só comprimento.
- **Ornamento central** (círculos, polígonos, losangos): ganha seu **próprio
  viewport SVG aninhado**, com viewBox recortado só ao redor do cluster de
  formas geométricas. Um `<svg>` aninhado estabelece seu próprio sistema de
  coordenadas — imune a qualquer esticamento não-uniforme do elemento pai.

## Como o ornamento preserva a proporção sem cálculo manual

O SVG do ornamento usa `class="h-full w-auto"`, sem atributos `width`/
`height` HTML. Isso aciona o comportamento padrão (e amplamente suportado)
de SVG + CSS: quando só uma dimensão é fixada via CSS e a outra fica
`auto`, o navegador calcula a dimensão que falta a partir do aspect ratio
intrínseco do `viewBox`. Não precisa saber o tamanho final em pixels do
container (que varia por viewport) — o círculo sai sempre redondo, não
importa a altura real do slide.

## Como os limites esquerda/ornamento/direita foram escolhidos

Para cada um dos 7 perfis, o ponto onde a "linha reta" termina e o
"cluster geométrico" começa foi lido diretamente das coordenadas já
existentes no SVG original (ex.: Achiever tem linhas até x=230/370;
Seeker até x=240/360). Nenhuma coordenada de forma foi recalculada — só
categorizadas em 3 grupos (esquerda/ornamento/direita) e cada grupo virou
um `<svg viewBox="INICIO 0 LARGURA 40">` com a MESMA origem, então as
coordenadas internas de cada forma não mudam.

## Escopo

Só `generateMedievalSvgDivider` (`ThematicDecorations.tsx`) e os testes
associados. Não mexe em `generateMedievalSvgBorder` (viewBox 400x300,
formato bem menos extremo, e de qualquer forma não é renderizado no
pipeline de produção — ver `docs/superpowers/specs/
2026-08-20-brainhexpdf-slides-design.md`, decisão #4) nem no ícone
(`customIconSvg`, já quadrado/100x100, sem esse problema).
