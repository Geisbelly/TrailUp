---
fonte: Google Drive — TCC 1 / Fluxo TrailUp
link: https://docs.google.com/document/d/1-VMnQBMEiVdLseUCZ_uOXjdVLP_voTC47IMisr8YMlM/edit
exportado: 2026-10-18
---

> Cópia em texto do documento do Drive (conversão automática docx → Markdown). Imagens, prints e diagramas foram omitidos; o original no Drive é a fonte de verdade.

## 1. PERSONA

**Nome:** Maria Antônia Curcino

**Apelido:** *A Exploradora Distraída\*
**Idade:** 21 anos\
**Curso:** Ciência da Computação\
**Instituição:** ULBRA\
**Turno:** Noturno\
**Disciplinas Preferidas:** Algoritmo e Programação, Introdução à Computação, Modelagem de Software\
**Hobbies e Interesses:** Ler, desenhar, assistir filmes; interesse especial na área de segurança da informação

### 1.1. Contexto Geral

Maria Antônia é uma estudante esforçada, curiosa e intuitiva, mas luta constantemente com a distração e a fadiga após longos dias de trabalho. Ela aprende melhor quando pode **explorar conteúdos de forma prática e visual**, descobrindo conceitos sozinha antes de confirmá-los com teoria.\
Apesar de se interessar por tecnologia, **perde o foco facilmente** quando as aulas se tornam expositivas demais. Valoriza ver **resultados imediatos** e sente-se mais motivada quando percebe **seu progresso visivelmente**.

### 1.2. Perfil de Aprendizagem

| **Categoria** | **Descrição** |
|----|----|
| **Ritmo** | Próprio, prefere autonomia no tempo de estudo |
| **Estilo** | Visual e prático |
| **Preferências** | Explorar por conta própria, receber instruções passo a passo apenas quando necessário |
| **Dificuldades** | Concentração, ansiedade em avaliações, desmotivação por ritmo diferente da turma |
| **Momento ideal para feedback** | Durante o aprendizado — prefere que perguntas e testes apareçam no meio do conteúdo para reforçar entendimento |
| **Motivadores** | Missões, recompensas, conquistas e ranking; progresso visível e recompensado |
| **Relação com o app** | Acredita que um aplicativo adaptável ao seu ritmo facilitaria manter o foco e a constância nos estudos |

### 1.3. Interpretação Comportamental (Para o Sistema TrailUp)

Maria representa o perfil do aluno **explorador-adaptativo**: quer liberdade, mas precisa de estímulos constantes.\
Seu comportamento direciona a necessidade de **um modo de operação fluido e dinâmico**, que:

- Ofereça **autonomia com trilhas não lineares** (mapa visual de módulos)

- Traga **feedback rápido e recompensas simbólicas** (XP, medalhas, emblemas)

- **Interrompa a linearidade com micro desafios** durante o conteúdo

- Reforce o aprendizado com **resumos e quizzes curtos e imediatos**

### 1.4. Aplicação no Sistema — *Modo de Operação TrailUp*

| **Modo** | **Ativado Quando** | **Função** |
|----|----|----|
| **Exploratório** | Aluna navega livremente entre módulos | Libera caminhos alternativos e registra sequência escolhida |
| **Interativo-Prático** | Ao entrar em desafios de código | Oferece feedback instantâneo e XP proporcional ao desempenho |
| **Avaliação Adaptativa** | Durante quizzes | Ajusta dificuldade com base no histórico da usuária |
| **Missão Aplicada** | Em projetos práticos finais | Simula cenários reais e fornece dicas limitadas |
| **Reflexivo** | Ao concluir módulo | Resume desempenho, gera recomendações e libera novas trilhas |

## 2. LOGIN / ENTRADA

**Objetivo:** autenticar o usuário e carregar seu progresso.\
**Tela:**

- Splash screen com logo animado da TrailUp

- Fundo escuro com gradiente \#111936

- Frase motivacional: *“Aprenda no seu ritmo.”*

- Botões: “Entrar com Google” \| “Entrar” \| “Criar conta”

**Ação:\**
→ Maria faz login.

**Modo de operação:\**
→ *Autenticação e carregamento do perfil* (o sistema busca dados de progresso e trilhas desbloqueadas).

## 3. DASHBOARD / MAPA DE TRILHAS

**Objetivo:** permitir visualizar progresso e escolher o módulo ativo.\
**Tela:**

- Mapa em rede de trilhas (nós hexagonais) representando módulos.

- Cores:

  - 🟡 Ativo

  - 🔒 Bloqueado

  - 🟢 Concluído

- Topo: “Trilha Atual: Fundamentos de Programação”

- Pop-up contextual: “Recomendado para hoje: Desafio de Condicionais (15 min).”

**Ação:\**
→ Maria toca no módulo ativo “Estruturas Condicionais.”

**Modo de operação:\**
→ *Sistema recomenda módulo com base em desempenho e tempo desde o último acesso.*

## 4. TELA DO MÓDULO — APRESENTAÇÃO

**Objetivo:** apresentar o conteúdo principal antes das escolhas de exploração.\
**Tela:**

- Título: “Estruturas Condicionais — controle o fluxo do seu código!”

- Apresentação inicial obrigatória (carrossel de 3 slides):

  1.  Explicação introdutória (curta, visual)

  2.  Exemplo prático com pseudocódigo

  3.  Ilustração de um fluxo condicional (verdadeiro/falso)

**Ação:\**
→ Usuária assiste ou interage com o conteúdo introdutório.\
→ Após visualizar tudo, o sistema **habilita as opções**:

- **“Explorar conteúdo completo”** — modo teórico detalhado

- **“Ir para o desafio”** — modo prático direto

**Modo de operação:\**
→ *Apresentação Guiada* — o app exige a leitura do resumo inicial antes de liberar a escolha de caminho.

## 5. DESAFIO INTERATIVO

**Objetivo:** aplicar o conteúdo em prática e receber feedback imediato.\
**Tela:**

- Editor de código simplificado

- Enunciado: “Crie uma estrutura if/else que determine se um número é par ou ímpar.”

- Botões: “Executar” \| “Ver dica”

**Feedback:**

- Errado → “Quase lá! Verifique a sintaxe da condição.”

- Certo → “+50 XP — Missão concluída!” + mini-animação de progresso

**Modo de operação:\**
→ *Interativo-Prático* — o sistema processa respostas, registra tentativas e fornece feedback em tempo real.

### 5.1. Modo Conteúdo Completo

**Objetivo:\**
Fornecer um aprendizado dinâmico e contínuo, misturando teoria, demonstrações e microdesafios. O aluno aprende fazendo — cada etapa exige uma pequena interação antes de avançar.

**Estrutura do Conteúdo:\**
Cada módulo (como *Estruturas Condicionais*) é dividido em **blocos de aprendizado** que combinam explicação, exemplo, e teste imediato.

| **Tipo de Bloco** | **Descrição** | **Exemplo na prática** | **Feedback / Ação** |
|----|----|----|----|
| 📘 *Mini Aula Interativa* | Explicações curtas (até 3 parágrafos) com código ilustrado e animação visual. | “O if permite que o programa escolha caminhos diferentes com base em uma condição.” | Avança automaticamente após leitura. |
| 💻 *Demonstração Guiada* | Simulação visual da execução de código. | Mostra o fluxo de decisão colorido: verde (verdadeiro), vermelho (falso). | “Execute novamente alterando a variável.” |
| 🧠 *Mini Quiz Instantâneo* | Questões rápidas de múltipla escolha, sem peso avaliativo. | “Qual o resultado de if (x \> 10) quando x = 8?” | Feedback textual: “Perfeito! A condição é falsa.” |
| 🔧 *Desafio Relâmpago* | Exercício simples e prático, de 1 a 3 linhas de código. | “Corrija o erro no if (a = b).” | +10 XP e desbloqueio do próximo bloco. |
| 🧩 *Checkpoint de Progresso* | Breve pausa com resumo e status. | “Você dominou 80% dos conceitos até aqui!” | Sugere revisão de blocos com erros. |

**Modo de Operação Ativo:\**
→ *Exploratório-Interativo\*
O sistema adapta a sequência de blocos conforme o desempenho: se o aluno acerta tudo, avança com menos teoria; se erra, insere blocos extras de reforço.

**Lógica Adaptativa Interna:**

- O app mantém um **índice de domínio** (0–100%) atualizado a cada interação.

- Quando o domínio cai abaixo de 70%, o sistema oferece uma *Revisão Flash* (resumo animado + quiz).

- Ao atingir 100%, o sistema libera o botão “Ir para o Desafio Final”.

**Visual e Interação:**

- Barra de progresso segmentada (cada bloco = 1 ponto de avanço).

- Micro feedbacks visuais (chamas, luz, ou XP flutuante).

- Dicas contextuais (“Quer tentar sozinho?” / “Ver exemplo novamente”).

**Fluxo interno do modo conteúdo completo**

\[Mini Aula\]

↓

\[Demonstração Guiada\]

↓

\[Mini Quiz Instantâneo\]

↓

\[Desafio Relâmpago\]

↓

\[Checkpoint de Progresso → Ir para Desafio Interativo ou Revisar\] → \[Repete o ciclo\]

↓

\[Quiz final\]

**Síntese narrativa (visão do usuário):\**
Maria entra no conteúdo e sente que está “explorando um jogo de conhecimento”. Cada nova parte parece uma fase curta — ela lê, tenta, erra, corrige, e ganha XP por persistência. Quando acerta, o sistema responde com pequenos reforços visuais (“+10 XP — Boa!”). Assim, ela não sente que está estudando — sente que está progredindo.

## 6. QUIZ ADAPTATIVO

**Objetivo:** verificar aprendizado ajustando a dificuldade conforme o desempenho.\
**Tela:**

- Questões curtas, feedback instantâneo e timer breve.

- Exemplo: “O que acontece se a condição for falsa em um if simples?”

- Resultado final: “Acertos: 4/5 — Excelente!”

- Recompensa: emblema “Exploradora Lógica.”

**Modo de operação:\**
→ *Avaliação Adaptativa* — ajusta a dificuldade das perguntas e recomenda revisão se o desempenho for baixo.

## 7. PROJETO PRÁTICO FINAL

**Objetivo:** consolidar o conteúdo em uma tarefa aplicada.\
**Tela:**

- Introdução narrativa:\
  *“Imagine que você está criando um sistema de loja virtual...”*

- Desafio: “Use condicionais para aplicar descontos conforme o valor da compra.”

- Ambiente com editor + console de saída

- Botões: “Ver exemplo” \| “Começar projeto”

- Dicas limitadas

**Feedback:\**
→ “Você utilizou corretamente as estruturas condicionais e operadores lógicos.”\
→ Recompensa: +200 XP + selo “Lógica Avançada.”

**Modo de operação:\**
→ *Missão Aplicada* — o sistema avalia a execução do projeto e libera conquistas visuais no mapa.

## 8. FEEDBACK FINAL / RESUMO DE PROGRESSO

**Objetivo:** reforçar a conquista e guiar os próximos passos.\
**Tela:**

- Tela de progresso animada

- “Parabéns, Maria! Você concluiu 100% do módulo Estruturas Condicionais.”

- Mostra: XP total, conquistas, tempo de estudo

- Recomendações automáticas:

  - “Próximo passo: Laços de Repetição.”

  - “Revisar: variáveis e tipos de dados.”

- Botões: “Seguir para próxima missão” \| “Ver desempenho geral”

**Modo de operação:\**
→ *Reflexivo* — o sistema atualiza o progresso, desbloqueia o próximo módulo e gera recomendações personalizadas.

## 9. RESUMO LINEAR FLUXO

\[Splash + Login\]

↓

\[Mapa de Trilhas → Selecionar módulo ativo\]

↓

\[Tela do Módulo → Apresentação inicial obrigatória\]

↓

\[Escolha: Explorar conteúdo completo OU Ir para o desafio\]

↓

\[Conteúdo + Desafio Interativo → Feedback XP\]

↓

\[Conteúdo + Quiz Adaptativo → Emblema + XP\]

↓

\[Projeto Final → Conquista + XP alto\]

↓

\[Feedback Final → Nova trilha liberada\]
