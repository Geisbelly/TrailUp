# Prompt — nova tela: Dashboard com sínteses e sugestões da IA

## Identificação
- Nome da tela: proposta como **aba nova dentro de "Visão geral"** (ex. "Insights"), não uma tela isolada — ela é sobre a mesma turma que o Dashboard já mostra, só que com leitura proativa em vez de sob demanda.
- **Aviso importante, diferente dos outros 4 prompts desta pasta:** não existe nenhuma issue do repositório pedindo esta tela especificamente. O conteúdo abaixo é uma **proposta de design**, montada por analogia com padrões que o projeto já decidiu e aprovou em outros recursos — não é uma decisão de produto confirmada. Se o Claude Design gerar isso, trate o resultado como rascunho para validar com a Geisbelly antes de assumir que é isso que vai ser construído. Vale a pena abrir uma issue própria descrevendo o recurso antes de seguir para implementação.

## De onde vêm as ideias abaixo (grounding, não invenção solta)
- O Dashboard já tem dois elementos que são versões embrionárias disto: o bloco **"Precisam de atenção"** (alunos fora da curva) e a linha do tempo **"Mudanças relevantes"** — ambos já são sínteses, só que manuais/fixas, não geradas por IA em cima dos dados atuais da turma.
- O assistente **Escriba**, já especificado nas outras telas, responde perguntas **sob demanda**. Esta tela é o par proativo dele: em vez do professor perguntar, a IA já traz o que julgou relevante — mas seguindo o mesmo padrão de confiança que o projeto usa em todo lugar onde a IA sugere algo (missões, sugestão de material): **a IA nunca decide sozinha, ela propõe, e o professor aprova, ignora ou ajusta.**
- O `CLAUDE.md` registra uma lacuna real: `aluno_mental_state_history` é gravado a cada ciclo de análise mas **nunca lido de volta** por nada — é dado pago e não aproveitado. Esta tela é o tipo de lugar que aproveitaria esse histórico (ex. "frustração recorrente ao longo de várias sessões"), mas isso exigiria decisão própria de quem já mexeu nessa parte do sistema — não presuma que a leitura desse histórico já está disponível.

## Estrutura da tela (proposta)

### Cabeçalho da aba
Título "Insights da turma" + subtítulo (ex. "Sínteses e sugestões geradas a partir dos dados desta turma."). Indicador de quando a última síntese foi gerada (ex. "Gerado há 2h") + botão "Atualizar agora".

### Lista de sínteses/sugestões (cards, mais recentes primeiro)
Cada card representa **uma observação ou uma sugestão**, nunca as duas fundidas sem distinção visual:
- **Observação** (só informa, não pede ação): ex. "3 alunos não acessam a plataforma há mais de 7 dias" — ícone neutro, sem botão de ação além de "Ver detalhe" (leva ao aluno/trilha).
- **Sugestão** (pede uma decisão do professor): ex. "Sugestão: revisar o material de Vetores — 54% de erro nas questões, acima da média da turma" — tem **3 ações**: Aceitar (aplica ou abre a tela relevante já preenchida), Ignorar, e um campo curto opcional de motivo ao ignorar (mesmo padrão de "aprovação/recusa com motivo" já usado em missões sugeridas pela IA — é o que torna possível medir se a IA está sugerindo bem).
- Cada card mostra, de forma discreta, **em que dado a síntese se baseou** (ex. "com base em: taxa de erro por conteúdo, últimos 14 dias") — consistente com a regra do projeto de que **IA nunca é caixa-preta**: mostrar o que foi gerado e por quê.

### Filtro/agrupamento
Abas ou filtro simples para separar **Alunos** (sínteses sobre indivíduos) de **Turma** (sínteses sobre o grupo todo) — os dois tipos de escopo já existem em outras partes do Dashboard (a tabela de alunos vs. os KPIs agregados), mantenha a mesma separação aqui.

### Taxa de aceitação (rodapé ou cabeçalho, discreto)
Um indicador simples (ex. "68% das sugestões aceitas nos últimos 30 dias") — mesmo raciocínio de #151: sem medir aceitação, não há como saber se a IA está sugerindo bem.

## Estados
- **Sem sínteses ainda geradas:** estado vazio explicando que a IA ainda não processou dados suficientes desta turma, sem gráfico com zeros.
- **Gerando:** feedback visível de que uma nova rodada de síntese está em andamento (a exemplo do padrão já usado em "Gerar trilha com IA").

## O que NÃO fazer
Não deixe nenhum card de "sugestão" sem as 3 ações (aceitar/ignorar/motivo) — isso quebraria o padrão de confiança que o resto do sistema já estabeleceu para IA. Não apresente uma síntese sem indicar em que dado ela se baseia. Não trate esta tela como implementação pronta para codar — ela precisa de uma issue própria primeiro.
