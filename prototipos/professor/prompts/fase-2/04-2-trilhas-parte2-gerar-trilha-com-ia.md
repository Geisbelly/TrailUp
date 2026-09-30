# Prompt Fase 2 — Trilhas, PARTE 2 de 5: modal "Gerar trilha com IA"

Continuação da Parte 1 (mapa/canvas). Esta parte cobre só o modal que abre ao clicar em "Gerar trilha com IA" — um fluxo guiado de 6 etapas.

## Identificação
- Fonte de conteúdo: `Console Trilha.dc.html` da V5, anexado a este prompt (mesmo arquivo da parte 1).

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. Sem print específico deste modal — o conteúdo vem do código da V5.

## Estrutura do modal
Indicador de progresso no topo com 6 etapas: **Configurar → Gerar → Processando → Resultado → Revisar → Ajustar** (pontos conectados por linhas, com rótulo embaixo de cada um). Cabeçalho: ícone hexagonal com estrela + título "Gerar trilha com IA" + X. Texto de abertura: "Descreva o plano de ensino de **Física I**. A IA propõe os tópicos e a ordem — você revisa antes de aplicar. Nada é publicado sem a sua confirmação."

## Etapa "Configurar"
- Textarea "O que a turma precisa aprender" (com texto de exemplo: "Ex.: semestre de mecânica clássica para engenharia, da cinemática até trabalho e energia, com ênfase em resolução de problemas…").
- Zona tracejada "Anexar plano de ensino ou ementa (PDF, DOCX)".
- Escolha em pílulas "Quantidade de tópicos" (6 / 8 / 12 — com 8 selecionado como exemplo).
- Escolha em pílulas "Já gerar atividades?" (Sim / Só tópicos — com "Sim" selecionado como exemplo).
- Rodapé: Cancelar + "Gerar proposta" (principal).

## Etapa "Processando"
Ícone hexagonal pulsante com spinner dentro, rótulo dinâmico do que está acontecendo naquele momento (ex. "Analisando o material enviado…"), barra de progresso, nota explicativa abaixo.

## Etapa "Resultado"
Banner de sucesso (verde): "Proposta gerada: 8 tópicos, 24 conteúdos e 3 atividades iniciais." Lista rolável dos tópicos propostos: número hexagonal + nome + meta (ex. quantidade de conteúdos). Rodapé: Descartar + Revisar (principal).

## Etapa "Revisar"
Texto: "Confira a proposta. Se algo não estiver certo, peça um ajuste pontual — não é preciso gerar tudo de novo." Mesma lista de tópicos da etapa anterior, mas cada item ganha um link "Pedir ajuste". Rodapé: Voltar + "Aplicar trilha" (principal).

## Etapa "Ajustar"
Link "← Voltar para a revisão". Bloco de contexto "Ajustando: {tópico alvo}". Textarea "O que mudar neste tópico" (com exemplo: "Ex.: trocar o exemplo do carro por algo de esportes, e reduzir para 2 conteúdos em vez de 3."). Rodapé: Cancelar + "Regerar só este item" (principal).

## O que NÃO fazer
Não reduza as 6 etapas a um formulário único. Cada etapa tem uma função diferente no fluxo (configurar → esperar → decidir → refinar → aplicar) e deve continuar existindo como uma tela própria dentro do modal.
