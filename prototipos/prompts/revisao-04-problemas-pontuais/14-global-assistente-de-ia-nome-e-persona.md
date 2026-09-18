Prompt de ajuste pontual — componente global do console, problema: o assistente de IA para o professor não tem identidade nem está disponível em todo lugar.

Este problema não é de uma tela específica — é sobre um componente que deve existir **igual em todas as 6 telas principais** (Dashboard, Trilha, Classes, Personalizações, Ranks, Meus Dados), por isso foge da regra de "um prompt por tela": aqui o próprio problema é a falta de consistência entre telas.

## Contexto

Já existe um pedido anterior (`06-dashboard-tutor-de-ia-para-o-professor.md`) por um assistente conduzido pela API para ajudar o professor a interpretar métricas, dificuldades e necessidades dos alunos. O feedback agora é sobre **como esse assistente se apresenta** e **onde ele aparece**.

## O problema

- O assistente não tem nome nem identidade visual — é só um conceito de "chat com IA", sem cara.
- Ele foi especificado só para o Dashboard; precisa estar acessível em **todas** as abas do console.

## CORRIGIR / ADICIONAR

1. **Dar um nome ao assistente.** Escolha (ou peça sugestões) de um nome próprio, coerente com a identidade "grimório arcano" do TrailUp — na mesma linha dos nomes dos 7 Guardiões BrainHex (Seeker, Survivor, Daredevil, Mastermind, Conqueror, Socializer, Achiever), mas este é o guia do **professor**, não de um perfil de aluno específico.
2. **Dar um rosto ao assistente.** Um avatar/ilustração de personagem para ele, no mesmo estilo visual dos guias/mentores já usados nos perfis BrainHex — não um ícone genérico de robô/chat.
3. **Apresentar como assistente, não como "tutor".** Framing de conversa (“pergunte ao [nome]”), não de painel de relatório.
4. **Ponto de entrada global e consistente.** O mesmo botão/ícone do assistente (com o avatar dele) deve aparecer na mesma posição em **todas** as 6 telas do console — Dashboard, Trilha, Classes, Personalizações, Ranks e Meus Dados —, não só no Dashboard.

## MANTER

- O comportamento já especificado no prompt anterior: uma janela de chat simples, respostas baseadas nos dados reais da tela/contexto atual, sem reescrever aqui o que já foi definido sobre o conteúdo das respostas.
