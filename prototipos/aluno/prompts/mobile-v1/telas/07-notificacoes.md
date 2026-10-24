# Parte 6 — Notificações (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/07-notificacoes.html`.

## De onde vem

- **v4:** `07-notificacoes.html`. Cabeçalho, filtros (Todas, Não lidas, Lidas, com contadores) e "Marcar todas como lidas"; lista agrupada (Hoje, Esta semana, Anteriores) de itens que **abrem no lugar** (sanfona): ícone por tipo, título, "NOVA", hora; aberto, mostra a mensagem, o botão que leva ao destino ("Abrir Equações do 1º grau", "Ver ranking"…), "Enviada em …", "Marcar como não lida" e "Excluir" (com confirmação). Abrir marca como lida e atualiza o contador da barra lateral. `#n-<id>` abre direto no item.
- **App hoje:** `app/(tabs)/notificacoes/` (lista e detalhe em outra tela).

## O que fica igual ao v4 (não mude)

- As 6 notificações de exemplo, os grupos, os textos, os destinos e as regras (abrir marca como lida; excluir pede confirmação; "Tudo em dia" quando o filtro Não lidas fica vazio).
- Os estados: Com dados, Filtro: Não lidas, Tudo lido, Vazio, Carregando, Notificação removida, Erro.

## O que muda no celular

- **Topo:** "Notificações" (Georgia 24) e, à direita, "Marcar todas como lidas" como **botão de ícone** (✓✓, 44px, com rótulo acessível), desabilitado quando não há não lidas.
- **Filtros** como controle segmentado de largura total (3 partes de 44px), com os contadores.
- **Itens** em largura total, de 72px fechados; o título e a descrição em até 2 linhas. A sanfona continua: tocar abre no lugar, com o botão de destino em **largura total** e, embaixo, "Marcar como não lida" e "Excluir" lado a lado (48px).
- **Deslizar para a esquerda** num item revela "Excluir" (vermelho, 88px), como nos apps de e-mail. Tocar nele abre a mesma confirmação. Novo estado no seletor: "Deslizar para excluir".
- **Confirmação de excluir** numa folha de baixo, com "Excluir" vermelho e "Cancelar".
- **Contador da aba** Notificações (na barra de abas) acompanha as não lidas e some quando chega a zero.
- "Notificação excluída." aparece como aviso no rodapé por 2 segundos, acima da barra de abas.
