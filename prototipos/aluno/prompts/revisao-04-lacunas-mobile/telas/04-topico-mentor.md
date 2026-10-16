Item 3 — **Mentor dentro do Tópico**. Arquivo: `v4/04-topico.html` (edite o atual; a batalha do item 1 continua).

## 1. O que o app faz (`mobile/src/components/ia/IAMentorPanel.tsx`, escopo `modulo`)
- O guia aparece como **conversa**, pronto num ícone; só abre quando o aluno toca.
- **Mensagem de abertura (módulo):** "Estou acompanhando este módulo como uma conversa. Posso comentar a personalização, explicar os elementos da tela e sugerir estratégia de estudo sem entregar respostas das atividades." (Com sinal social forte: "Vou acompanhar este módulo em formato de conversa…")
- **Dicas por tema** (botão "Abrir guia"): **Conversa**, **Progresso** ("A barra horizontal mostra quanto do módulo já foi concluído…"), **Tempo** (só se houver cronômetro), **Boss** (só se houver batalha: "O boss representa o desafio do módulo. Conforme você avança no conteúdo e acerta atividades, causa dano nele…"), **Limites** ("Eu posso orientar, resumir métricas e explicar a personalização, mas não entrego respostas de atividades…").
- Campo: **"Responda ao guia ou pergunte sobre este módulo"**. Botões **"Silenciar guia"** / **"Reativar guia"**.
- Erro: "Estou aqui para conversar com você sobre personalização, métricas e estratégia de estudo, mas falhei ao responder agora."
- O guardião é o do perfil (Conqueror: Amina), com o rosto `rosto-<perfil>.png`.

## 2. Na web
- **Botão flutuante** no canto inferior direito (64px, rosto do guardião, ponto de "nova mensagem"), acima da barra "Continuar". Mesmo padrão da Trilha.
- **Painel de conversa** (400×560, raio 20) que abre sobre a coluna da direita:
  1. Cabeçalho: rosto 40 + "**Amina** · guia do perfil Conqueror" + botões "Silenciar guia" e fechar.
  2. Mensagem de abertura do app.
  3. **Fileira de dicas** (pílulas): Conversa · Progresso · Boss · Limites. Clicar mostra o texto do app como mensagem do guia.
  4. **Sugestões rápidas**: "Por que este módulo veio em desafios curtos?" · "Como eu derroto o boss?" · "Qual é a resposta da atividade?"
  5. Campo com o placeholder do app + enviar (Enter envia).
- **Respostas do protótipo** (simuladas, dentro dos limites do app):
  - personalização → "Reorganizei Equações em desafios curtos antes da leitura, porque você rende mais quando começa praticando." (a justificativa que a Trilha já mostra);
  - boss → texto de "Boss" do app + "Faltam 104 de HP: concluir a atividade tira 24.";
  - **pedir a resposta** → "Não posso entregar a resposta, mas posso te ajudar a chegar nela: isole o x passando o 7 para o outro lado. O que sobra de 3x?" (guardrail);
  - outra pergunta → mensagem de erro do app (para mostrar o estado).
- **Silenciar guia:** o painel fecha, o botão fica apagado com um traço, e o tooltip vira "Reativar guia".

## 3. Estados (no seletor que já existe)
Acrescentar: "Guia aberto" (painel aberto com a abertura) · "Guia silenciado".

## 4. Aceite
- [ ] Botão do guia no Tópico; painel com abertura, dicas e campo com os textos do app.
- [ ] Pedir a resposta da atividade cai no limite ("não entrego respostas").
- [ ] Silenciar / reativar.
