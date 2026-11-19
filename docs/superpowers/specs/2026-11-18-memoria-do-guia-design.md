# Memória do Guia e métricas do chat do aluno

Data: 18/11/2026 · Migration: `20261118_01` · Situação: no PR, nada aplicado em produção.

## Por quê

O chat do Guia não guardava nada útil. A conversa volta do app a cada pergunta e some quando o painel
fecha. O único rastro era o texto cru em `ia_decision_logs`, que ninguém lê e que é redigido aos 90 dias.
O pedido tinha dois objetivos:

1. o Guia responder sabendo onde aquele aluno costuma travar e onde a turma trava;
2. ter métricas do aluno e da sala: dúvidas frequentes, dificuldades, tópicos em que conversou e o
   acerto nas questões.

A restrição era guardar o contexto útil **sem dado pessoal**, com o que for sensível mascarado.

## Objetivos, não objetivos, antiobjetivos

- **Objetivo:** guardar o que a pergunta *era* (intenção, tema, conceitos, dificuldade), ler isso de
  volta no prompt e expor agregados por aluno e por turma.
- **Não objetivo (agora):** a tela no console. As views já servem de base, e a aba fica para outro PR.
- **Não objetivo:** os chats entre colegas (guilda, privado). Eles são cifrados em repouso, e minerá-los
  é outra decisão.
- **Antiobjetivo:** guardar a frase do aluno, ou qualquer coisa que o identifique, nesta tabela.
- **Antiobjetivo:** gastar cota com uma chamada de classificação a mais. O tier é free (memória
  `gemini-so-no-tier-free`).

## Abordagens consideradas

| Abordagem | Custo | Por que não / por que sim |
|---|---|---|
| A. Guardar a conversa inteira, mascarada | Barato de escrever | O mascarador vira a única barreira contra dado pessoal em texto livre, e o texto livre é exatamente o que o pedido quer evitar. Descartada |
| B. Segunda chamada ao modelo para classificar cada pergunta | Uma chamada a mais por mensagem | Dobra o consumo do chat no tier free. Descartada |
| **C. O modelo classifica na mesma resposta (campo `registro`), e a API mascara e grava** | Alguns tokens de saída | Nenhuma chamada nova. O texto do aluno nunca chega à tabela. Escolhida |

## Como ficou

- **`MentorChatLLMResult.registro`**: `intencao`, `assunto`, `conceitos` e `dificuldade`, obrigatório
  no schema enviado ao modelo e com default no Pydantic. Um registro ruim não reprova a resposta: a API
  normaliza (`normalizar_registro`).
- **Mascarador** (`app/services/mascaramento_chat.py`): tira nome e apelido do aluno e dos colegas da
  turma (sem diferenciar acento nem caixa), e-mail, telefone, CPF, link, @usuário, número com 8
  dígitos ou mais e o placeholder `{{nome}}`. Conceito que contém nome sai inteiro, e assunto que só
  tinha dado pessoal vira nulo.
- **Origem:** `modelo`, `regra` (navegação sem modelo, com a tela no assunto) ou `reserva` (resposta de
  reserva, sem classificação).
- **Memória no prompt** (`memoria_do_guia`): conceitos com dificuldade (o tópico atual pesa 2×), as 3
  dúvidas mais recentes no tópico, pedidos de resposta, se travou no tópico e os conceitos difíceis da
  turma no tópico. A turma só aparece com **3 alunos ou mais**. A janela é de 60 dias e 40 perguntas. O
  campo fica perto do fim do payload, porque o começo é o que o cache reaproveita.
- **Leitura é banco:** o aluno vê as próprias linhas e o professor as das turmas dele. O cliente não
  escreve. As views `security_invoker`:
  - `vw_chat_guia_aluno_topico`: perguntas por tipo e dificuldade, e acerto médio nas tentativas do
    tópico antes e depois da primeira conversa;
  - `vw_chat_guia_conceitos_turma`: a dificuldade da sala por conceito;
  - `vw_chat_guia_turma_topico`: o resumo por tópico.
- **Retenção:** 395 dias (730 para quem consentiu pesquisa). A linha sai com a conta e com a turma.

## Calls do construtor (revisáveis)

- **Acerto antes/depois não é efeito do chat.** É coincidência no tempo, e o texto da view e do TCC
  não pode chamá-lo de ganho (memória `tcc-o-que-nao-afirmar`).
- **Mínimo de 3 alunos** para a dificuldade da turma entrar no prompt. O professor vê o individual
  pelas views, que é o mesmo acesso que ele já tem à telemetria.
- **Nome de colega igual a um conceito** ("Luz", "Rosa") apaga aquele conceito. Na troca entre
  privacidade e métrica, a privacidade ficou com a vantagem.
- **`ia_decision_logs` continua com o texto cru** da pergunta, com o prazo da `20261003_09`. Mascarar
  ou parar de gravar ali é uma decisão de LGPD separada.

## Em aberto

- Aba no console (Insights ou Personalizações) lendo as três views.
- Medir os tokens a mais em `ia_uso_llm` depois do deploy (`docs/custos.md` está PENDENTE).
