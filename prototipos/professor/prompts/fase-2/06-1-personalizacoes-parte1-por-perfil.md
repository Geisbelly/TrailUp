# Prompt Fase 2 — Personalizações, PARTE 1 de 3: cabeçalho, filtros, resumo e aba "Por perfil"

Esta tela (Personalizações) foi dividida em 3 prompts sequenciais. Envie os 3 nesta ordem, na mesma conversa:
1. **Esta parte** — cabeçalho, filtros, resumo do conteúdo selecionado, e a primeira aba: "Por perfil".
2. Parte 2 — abas "Estrutura e paleta", "Por aluno" e "Turma".
3. Parte 3 — o modal "Ver conteúdo gerado" (abre a partir de um card/linha de perfil desta parte).

## Identificação
- Nome da tela: **Personalizações** (item de sidebar), título interno "Personalizações".
- Fonte de conteúdo: `Console Personalizacoes.dc.html` da V5, anexado a este prompt — leia o arquivo inteiro antes de gerar, mesmo que esta parte só peça o começo da tela.

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. **Aviso importante:** a print desta tela mostrada anteriormente capturou só o estado de carregamento inicial. Ignore essa limitação: o código da V5 mostra a tela completa, em todos os estados, e é isso que deve ser gerado nesta e nas próximas 2 partes.

## Cabeçalho e filtros (comuns às 3 partes desta tela)
Título "PERSONALIZAÇÕES" + subtítulo "Compare como o material fica para cada perfil BrainHex e visualize a personalização efetiva por aluno." À direita, indicador ao vivo (ponto pulsante + "Atualizado há N s").

Barra de filtros, num card: **Classe** / **Tópico** / **Conteúdo** (selects) + botão "Atualizar" (ícone de refresh) + divisor + **"Gerar tudo para o perfil"** (select de perfil com indicador de cor) + botão principal **"Gerar tudo"**.

Abaixo dos filtros, 4 abas em pílula: **Por perfil** (esta parte) **/ Estrutura e paleta / Por aluno / Turma** (partes 2 e 3).

## Estado "sem seleção" (classe/tópico ainda não escolhidos)
Ícone + "Escolha uma classe e um tópico" + texto explicando o painel + botão de exemplo "Ver Física I · Cinemática".

## Resumo do conteúdo selecionado (2 variações — gere as 2)
- **Sem nenhum material gerado ainda (zeroData):** card com nome do conteúdo + "Conteúdo ampliado e gerado por blocos", barra "Progresso dos perfis 0%", pílulas "0 de 7 pronto(s)" e "7 sem material".
- **Com material parcial:** card com destaque vermelho — ícone "!", título "1 perfil precisa da sua atenção", detalhe (ex. "Socializer falhou na geração do áudio de Cinemática. Os outros 6 perfis seguem normalmente."), e 5 chips de contagem por status: **prontos** (verde), **gerando** (azul, spinner), **parcial** (amarelo), **com falha** (vermelho), **sem material** (cinza).

## Aba "Por perfil"
- **zeroData:** grade de cards, um por perfil BrainHex (Explorador/Seeker teal, Sobrevivente/Survivor cinza, Aventureiro/Daredevil vermelho, Realizador/Achiever dourado, e os demais 3 perfis seguindo o mesmo padrão) — faixa colorida no topo, ícone+nome em maiúsculas+badge "Sem material", subtítulo "{nome técnico} · 0 aluno(s) com este perfil". O card do Achiever mostra também um bloco "Etapa atual" com barra em 0%. Lista de formatos (PDF/Áudio/Apresentação, e Texto também no caso do Achiever) cada um com badge "Sem material". Nota "Ainda não há personalização gerada para este perfil no conteúdo selecionado." Botão "Gerar" no rodapé do card.
- **Com dados:** tabela comparativa "Comparativo dos 7 perfis — ordenado por alunos matriculados" + nota "Cinemática · 4 conteúdos". Colunas: Perfil (ícone+nome), Alunos (contagem+nota), Status (pílula: pronto/parcial/gerando/com falha/sem material), Texto, Áudio, Apresentação (rótulos de status), e uma ação por linha ("Visualizar" ou "Ver e completar" quando parcial — **clicar nessa ação abre o modal da Parte 3**). Use como conteúdo de referência: Mastermind (7 alunos, pronto, Texto·4/Áudio·9min/8 slides), Conqueror (6, parcial, Texto·3de4/áudio e apresentação não gerados, "Ver e completar"), Seeker (5, pronto, 4/11min/9 slides), Daredevil (4, pronto, 4/10min/7 slides), e os perfis restantes (Achiever, Socializer com falha, Survivor sem material) seguindo o mesmo padrão de linha.

## Assistente "Escriba" (componente global — gere aqui, não precisa repetir nas partes 2 e 3)
Botão flutuante no canto inferior direito, tooltip "Pergunte ao Escriba". Painel de chat: cabeçalho ("Escriba" + "O guia do professor · lê as personalizações geradas"), mensagem de apresentação, 2 chips de pergunta sugerida ("Perfil sem material?" / "Algum erro de geração?"), campo de texto + botão de enviar.

## O que NÃO fazer
Não gere só o estado de carregamento. Não misture as variações zeroData/com-dados numa coisa só — são estados diferentes.
