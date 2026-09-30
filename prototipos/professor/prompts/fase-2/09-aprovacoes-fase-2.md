# Prompt Fase 2 — Aprovações

## Identificação
- Nome da tela: **Aprovações** (item de sidebar), título interno "Aprovações de professores".
- Fonte de conteúdo: `Console Aprovacoes.dc.html` da V5, anexado a este prompt. **Nenhum print desta tela foi enviado nesta rodada** — mas isso não é mais um problema: o código da V5 mostra a tela completa, em todos os estados, e é isso que deve ser gerado. Aplique só os padrões visuais globais (header, sidebar, cores, tipografia, cards, botões) definidos em `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`, já que não há uma print desta tela específica para confirmar detalhes visuais que fujam do padrão.

## Diferença importante desta tela em relação às outras 6
Esta é uma tela de **administração interna**, não uma tela de uso diário do professor:
- O avatar do usuário no header mostra iniciais diferentes ("AD", de administrador), não as do professor comum.
- O item "Aprovações" na sidebar carrega um **selo com a contagem de pendentes** (ex. um número dentro de um círculo, ao lado do rótulo).
- **Esta é a única das 7 telas que NÃO tem o assistente flutuante "Escriba"** — não adicione o botão/painel do Escriba aqui.

## Cabeçalho
Badge pequeno acima do título: ícone de escudo + "Administração interna" (uppercase, tom terroso/âmbar). Título "Aprovações de professores" + subtítulo "Cadastros aguardando liberação de acesso ao console."

## Estado "pendentes" (com professores aguardando)
- Banner de resumo (tom amarelo/dourado): ícone hexagonal com o número de pendentes + título "{N} cadastros pendentes" + nota "A pessoa só consegue entrar no console depois da aprovação. O mais antigo espera desde {data}."
- Lista de cards, um por professor pendente. Cada card:
  - Cabeçalho: avatar com iniciais + nome (destaque) + "{instituição} · {disciplina}" + "{email} · cadastro em {data}" + pílula "aguardando N dia(s)" (cor mais forte/dourada quando a espera é longa, neutra quando é recente).
  - Bloco de citação: a autoapresentação que o professor escreveu no cadastro (texto entre aspas) — ou, quando não preenchida, o texto "Sem descrição preenchida."
  - Rodapé: botão principal **"Aprovar acesso"** (ícone de check) + uma nota contextual opcional ao lado (ex. "Aprovar envia um e-mail e libera o console na hora." ou, quando há algo a checar, um alerta específico como "E-mail de instituição diferente da sua.") + link **"Recusar cadastro…"** alinhado à direita.
  - **"Recusar cadastro…" expande uma confirmação inline**: "Recusar o cadastro de {nome}?" + aviso "O cadastro é apagado — não fica em uma lista de recusados. Ela precisaria se cadastrar de novo do zero para tentar outra vez." + botões Voltar + "Recusar e apagar cadastro" (destrutivo).
- Use como conteúdo de exemplo os 3 cadastros da V5: **Cláudia Mendes** (ULBRA Palmas · Matemática Aplicada, aguardando 8 dias, com autoapresentação, nota padrão de aprovação); **Tiago Rebouças** (Instituto Federal do Tocantins · Química, aguardando 3 dias, com autoapresentação, nota de alerta "E-mail de instituição diferente da sua."); **Renata Sobral** (ULBRA Palmas · História, aguardando 1 dia, sem descrição preenchida).

## Estado "nenhum pendente"
Ícone de check (verde) + título "Nenhum professor aguardando aprovação" + texto "Novos cadastros aparecem aqui automaticamente. Você recebe um e-mail quando alguém entra na fila." + nota menor "Última aprovação: {nome}, em {data}."

## O que NÃO fazer
Não adicione o botão do Escriba nesta tela — ela é a única exceção. Não invente cards ou seções além do banner de resumo e da lista de cadastros pendentes. Não esqueça a confirmação inline ao recusar um cadastro.
