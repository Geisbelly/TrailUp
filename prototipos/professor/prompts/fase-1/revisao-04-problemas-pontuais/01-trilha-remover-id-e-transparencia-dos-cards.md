Prompt de ajuste pontual — tela **Trilha**, problema: identificador técnico e conector semitransparente nos cartões do mapa.

## O problema

Nos cartões de tópico do Mapa da Trilha, hoje aparecem duas coisas que não deveriam:

1. Uma linha "id: topico-XX" (ex.: "id: topico-07") no rodapé do cartão — um identificador técnico interno, sem qualquer uso para o professor.
2. O ícone de conector entre dois cartões (a seta pequena usada para ligar/desligar uma dependência entre tópicos) aparece com opacidade reduzida — parece apagado/desabilitado mesmo quando representa uma ligação real e válida.

## REMOVER

- A linha "id: topico-XX" de todos os cartões do mapa, em qualquer estado (normal, selecionado, hover).

## CORRIGIR

- O ícone de conector entre cartões deve ter opacidade total (100%) quando representa uma dependência ativa. Reserve a aparência semitransparente apenas para um estado que realmente signifique "inativo" ou "sugestão ainda não confirmada" — se esse estado não existir hoje, o conector deve simplesmente ficar sempre com opacidade cheia.

## MANTER

- O restante do cartão sem mudança: ícone do tópico, título, número de sequência (#N), e as pílulas "DEP"/"NEXT".
