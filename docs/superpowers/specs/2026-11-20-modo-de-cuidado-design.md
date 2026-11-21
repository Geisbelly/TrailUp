# Modo de cuidado: aluno em crise ou sobrecarregado

Data: 20/11/2026. Estado: implementado no PR do modo de cuidado (branch `feat/modo-de-cuidado`),
ainda não aplicado em produção. Migrations: `20261121_01_consentimento_cuidado` e
`20261121_02_momentos_de_cuidado`. Antes do merge, a autora confirma os cinco valores de
`app_config`, a lista de frases de risco (`api/app/services/risco_no_chat.py`), a frase do CVV e o
texto do item novo do termo.

Decisões tomadas na implementação, fora do texto original:

- **Tentativa já aberta:** se o modo começa no meio de uma atividade, o servidor não para o
  cronômetro dela (o prazo é do servidor, #136; o tempo só conta no XP). A tentativa seguinte já
  nasce sem cronômetro, e a tela esconde a contagem durante todo o modo, inclusive na aberta.
- **Revogação pelo responsável** apaga os momentos do aluno, como a revogação pelo próprio aluno.
- **Origem:** o aparelho só registra `sinais_de_uso`; `aluno_disse` e o nível só vêm da API.
- **Prova do consentimento:** `consentimento_cuidado` segue os outros consentimentos depois da
  `20261024_03`: sobrevive à conta anonimizada, com 5 anos em `retencao_politica`.

Decisões da autora nesta conversa: dois gatilhos (o que o aluno diz e sinais de uso); o professor
vê no painel e não é notificado; consentimento com versão própria; detecção no app, gravando no
banco. As outras escolhas estão marcadas como "decisão de quem escreveu a spec".

## Por quê

Um aluno em crise de ansiedade, ou só sobrecarregado, continua recebendo o mesmo cronômetro, o
mesmo boss com tempo e as mesmas questões. O app não percebe e não alivia nada. Este desenho faz o
app reagir na hora: tira a pressão, sugere descanso e, quando o aluno diz que está em crise, oferece
uma técnica para o momento.

O professor não recebe aviso. Ele vê, no painel do aluno, o que aconteceu, para entender as
limitações do aluno, o impacto no estudo e onde ele tem dificuldade.

## Objetivos

- Reagir no momento: a pausa e o alívio chegam enquanto o aluno ainda está na tela.
- Dois gatilhos:
  1. **o aluno diz** ao Guia que não está bem;
  2. **o uso sugere** sobrecarga (sinais que o app já mede).
- Durante o modo de cuidado, tirar pressão do estudo.
- Cards de descanso nas horas seguintes.
- Técnicas curtas para crise. Para risco, o CVV 188 sempre.
- Uma linha do tempo de **momentos de cuidado** no detalhe do aluno, no console.

## Fora do escopo

- Notificar o professor (sino, e-mail, push). Decisão da autora: só o painel.
- Trocar as questões por outras mais fáceis. Hoje não existe questão mais fácil para servir, e o
  nível do diagnóstico (`diagnostico_topico`) não decide nada. "Baixar a dificuldade" aqui é tirar
  pressão (abaixo); questão adaptada fica para outro desenho.
- Diagnóstico, triagem clínica ou acompanhamento psicológico. O app não é serviço de saúde.
- Usar o modo de cuidado em nota, rank, XP, risco de reprovação, coortes do estudo (#13) ou modelo
  de evasão.

## Antiobjetivos (falhou mesmo funcionando, se...)

- **O app afirma um estado mental que não mediu.** Para o sinal de uso, nenhuma tela, card ou
  painel diz "ansiedade", "crise" ou "você parece ansioso". O texto fala do uso ("você está há um
  tempo nisso"). É a regra da DAT-45 (`app/services/estado_de_estudo.py`): a telemetria mede
  engajamento, não emoção.
- **O professor lê o que o aluno escreveu.** O painel mostra a categoria e os fatos, nunca o texto
  do aluno, como em `chat_guia_registros`.
- **O aluno é avisado sem saber disso.** O termo diz, antes, que o professor verá esses momentos.
- **O aluno em risco fica sem o CVV** porque o modelo classificou errado ou a IA estava fora do ar.
- **O modo de cuidado passa por cima da escolha do aluno.** Se ele ligou o cronômetro por conta
  própria, o modo de cuidado não o desliga para sempre: o alívio expira.

## Restrições

- **LGPD:** estado de saúde mental é dado sensível (art. 11). Gravar e mostrar ao professor exige
  consentimento específico. O termo `emocional` de hoje diz "sem inferir emoções desses sinais" e
  não fala em professor.
  - **Decisão da autora:** para o aluno, aparece como versão nova do termo; por baixo, o aceite
    tem **versão própria**, como a pesquisa (seção 1). Subir o termo todo poria todo menor em modo
    restrito e não daria ao banco como provar o aceite do adulto.
  - Quem não aceitar fica de fora do modo de cuidado inteiro (gravação e painel),
    com uma exceção: **o CVV e a técnica para crise, na fala do Guia, valem para todos**, porque
    não gravam nada e não esperam consentimento.
- **IA só para maiores (#195):** o gatilho "o aluno diz" só existe para quem conversa com o Guia,
  ou seja, adultos. Menores entram só pelo sinal de uso, com o consentimento do responsável (o
  formulário `ResponsavelConsentForm` ganha o item novo, com versão própria).
- **Regra de fronteira:** detectar sinal de uso não tem modelo de linguagem, então não passa pela
  API. Classificar o que o aluno escreveu tem, então é na API, na chamada que já existe.
- **Ordem do payload é cache:** campo novo no pedido ao Guia não entra na frente.
- **Tabela nova nasce com RLS e policy no mesmo commit**, e a view do painel com
  `security_invoker = on`.

## Abordagens consideradas

1. **No app, gravando no banco (escolhida pela autora).** O aparelho já sabe na hora os erros
   seguidos, o tempo na trilha (`mobile/src/utils/tempoNaTrilha.ts`) e a atividade abandonada. Ele
   detecta, reage na hora e grava o momento por uma RPC que confere o consentimento e evita
   repetição.
   - A favor: crise pede reação no momento; funciona com a API fora do ar.
   - Contra: o app instalado não ganha a função; precisa de build novo.
2. **No banco**, por gatilhos sobre `questao_aluno` e `atividade_aluno`.
   - A favor: alcança o app antigo.
   - Contra: a reação chega atrasada, e o banco não vê tempo de tela nem abandono fora dos lotes de
     telemetria de 60 s.
3. **No pipeline de análise da API**, que já vê `erro_recorrente` e `abandono_atividade` por lote.
   - Contra: é regra sem modelo morando na API (a regra de fronteira proíbe), e para quando a API
     cai. Descartada.

## Desenho

### 1. Consentimento

Segue o molde da pesquisa (`20261024_02`), que já resolveu o mesmo problema. Medido no código: para
maior de idade, `aluno_finalidade_permitida` devolve `true` sempre, e o termo do adulto
(`consentimento_telemetria`) não tem `emocional` e não é lido pelo banco. Já subir
`CONSENTIMENTO_RESPONSAVEL_VERSAO` põe todo menor em modo restrito (`aluno_modo_restrito` exige o
aceite na versão vigente).

- **Adulto:** tabela de aceite própria (`consentimento_cuidado`, só cresce, carimbo do servidor,
  revogar é linha `rejected`, como os outros `consentimento_*`) e
  `consentimento_cuidado_versao_vigente()`.
- **Menor:** a coluna `cuidado_versao` em `consentimento_responsavel`, ao lado de `pesquisa_versao`,
  e a chave `cuidado` em `finalidades`. A versão do termo do responsável não sobe: quem ainda não
  aceitou perde só o modo de cuidado.
- **Pergunta única:** `aluno_cuidado_permitido(aluno)`, com a mesma estrutura do ramo `pesquisa` de
  `aluno_finalidade_permitida` (modo restrito primeiro, depois o aceite do próprio aluno na versão
  vigente e, se menor, o do responsável). `cuidado_registrar`, a API do chat e o app usam só ela.
- **Na tela:** o aluno vê "o termo mudou" com o item novo explicado e aceita ou recusa só esse
  item (no portão do termo, `TelemetryConsentGate`); o responsável vê o item novo no
  `ResponsavelConsentForm`. O resto do que eles já aceitaram não muda.
- **Revogar** grava `rejected` e apaga os momentos do aluno.
- O texto do item novo diz, em linguagem simples:
  - o app pode notar sinais de cansaço no uso (erros seguidos, tempo sem parar, atividade
    abandonada) e o que o aluno contar ao Guia sobre como está;
  - nesses momentos, ele alivia o estudo e sugere pausa;
  - **o professor da turma vê quando isso aconteceu e o que o app fez, mas nunca o que o aluno
    escreveu**;
  - continua valendo que o sinal de uso não vira emoção nem nota.
- Aceite de versão antiga não vale: mudou o texto, sobe `consentimento_cuidado_versao_vigente()`.

### 2. Gatilho 1: o aluno diz (Guia)

- O `registro` de `MentorChatLLMResult` ganha o campo `bem_estar`: `nenhum | desconforto | crise |
  risco`. Sai na mesma chamada que já classifica a pergunta, sem cota a mais, e entra no schema
  junto com o prompt (CLAUDE.md, saída estruturada).
  - `desconforto`: cansaço, frustração, "não aguento mais esse conteúdo".
  - `crise`: o aluno descreve uma crise agora (falta de ar, pânico, choro, "estou tendo uma crise").
  - `risco`: fala em se machucar, em não querer viver ou em perigo.
- **Barreira de texto fixo antes do modelo** para `risco`: uma lista curta de frases (com e sem
  acento) que, se casar, garante o CVV 188 na resposta, mesmo com o modelo fora do ar ou na
  resposta de reserva. É o mesmo princípio do `respostas_do_guia.py`: o barato e certo antes do
  modelo.
- A fala do Guia, em `crise` ou `risco`:
  - acolhe sem diagnosticar ("parece um momento difícil"), sem sermão;
  - oferece uma técnica curta (abaixo) e sugere parar o estudo agora;
  - em `risco`, indica o **CVV 188** (ligação gratuita, 24 h, também por chat em cvv.org.br) e,
    em perigo imediato, o **SAMU 192**;
  - o juiz de grounding não pode reprovar essa fala por "fora da base do tópico" (o prompt do juiz
    ganha a exceção).
- A resposta ao app leva um sinal (`modo_cuidado: true` e o nível) para o aparelho ligar o modo de
  cuidado (seção 4). O texto do aluno não vai para lugar nenhum novo.
- Com consentimento vigente, a API grava o momento chamando a mesma função do banco da seção 5
  (`origem = 'aluno_disse'`), na transação do registro do chat. Sem consentimento, não grava.
- **`chat_guia_registros` não guarda `bem_estar`** (decisão de quem escreveu a spec). Essa tabela é
  gravada para todo adulto, guarda os dados por 395 dias e o professor a lê; o nível ali viraria
  rótulo e dado sensível sem consentimento. O lugar do nível é só `aluno_momento_cuidado`. A
  `intencao = 'desabafo'` continua como hoje.

### 3. Gatilho 2: o uso sugere sobrecarga (app)

Regras no aparelho, num módulo só (`mobile/src/utils/sinaisDeSobrecarga.ts`, puro e testado):

- **erros seguidos:** N questões erradas em sequência no mesmo tópico;
- **tempo sem parar:** M minutos de trilha ativa sem pausa (`tempoNaTrilha`), contando só tempo
  visível;
- **abandono:** atividade aberta e largada sem concluir, K vezes na mesma sessão;
- **câmera:** fica de fora desta versão. A estimativa de expressão é a parte menos confiável e a
  que mais se parece com "inferir emoção"; entra só depois de medir as três acima.

N, M e K vêm de `app_config` (chaves públicas, porque o app precisa delas), não de constante. Os
valores iniciais são decisão da autora; proposta: N = 5, M = 50, K = 2.

Disparou: o app liga o modo de cuidado (seção 4) e chama a RPC (seção 5) com
`origem = 'sinais_de_uso'` e os fatos. No máximo um momento por aluno a cada 2 h, para não virar
alarme.

### 4. Modo de cuidado no aparelho

Liga por um tempo fixo (proposta: 2 h; em `app_config`) e expira sozinho.

- **Tira pressão:**
  - cronômetro das atividades desligado durante o modo;
  - boss sem tempo;
  - na trilha, cards antes das questões (a camada 0 da sugestão já faz isso para dificuldade).
- **Não mexe em:** nota, prazo da tentativa (é do servidor, #136), conteúdo.
- **XP, efeito aceito (decisão de quem escreveu a spec):** com o cronômetro desligado, a tentativa
  não paga os bônus `atividade_no_tempo_70/80/90`, como já acontece quando o aluno desliga o
  cronômetro. Não há bônus de compensação: seria XP por estar mal.
- **Sem consentimento** (decisão de quem escreveu a spec): o cronômetro some só da tela, e o servidor
  continua cronometrando, porque saber disso exigiria gravar o estado. O bônus pode sair se o aluno
  terminar rápido, o que não faz mal.
- **Respeita o aluno:** se ele ligou o cronômetro por conta própria (`aluno_cronometro.origem =
  'aluno'`), o modo de cuidado desliga só enquanto dura e não grava por cima da escolha dele. O
  estado do modo fica numa tabela própria com `expira_em` (seção 5), lida por
  `fn_cronometro_ligado`, e não em `aluno_cronometro`.
- **Tela:** um aviso curto e gentil, nunca vermelho, com "Fazer uma pausa" e "Continuar mesmo
  assim". Para o sinal de uso, o texto fala do uso:

  ```
  Você está há um tempo nisso. 🌿
  Que tal uma pausa de 5 minutos?
  [ Fazer uma pausa ]   [ Continuar ]
  ```

  "Continuar" encerra o aviso, e o alívio continua até expirar.
- **Técnicas** (texto fixo no app, não gerado): respiração 4-4-6 guiada (com animação), aterramento
  5-4-3-2-1 e "levante, beba água, volte em 5 minutos". O Guia pode citá-las; quem as mostra é a
  tela, que funciona sem IA.

### 5. Banco

- **`aluno_momento_cuidado`**: uma linha por momento.
  - `aluno_id`, `classe_id`, `topico_id` (nulo fora de tópico), `criado_em`;
  - `origem`: `aluno_disse | sinais_de_uso`;
  - `nivel`: `desconforto | crise | risco` (só em `aluno_disse`; nulo em `sinais_de_uso`);
  - `fatos` (jsonb, só números e códigos: `erros_seguidos`, `minutos_sem_parar`, `abandonos`);
  - `acoes` (jsonb: `pausa_sugerida`, `cronometro_desligado`, `tecnica_oferecida`, `cvv_indicado`);
  - `expira_em`: até quando o alívio vale.
- **RPC `cuidado_registrar`** (`SECURITY DEFINER`): confere a matrícula e o consentimento vigente,
  aplica o intervalo mínimo de 2 h, valida `fatos` contra a lista de chaves e grava.
  - O intervalo vale **por origem** (decisão de quem escreveu a spec): um `sinais_de_uso` não
    barra o que o aluno diz depois.
  - **Nível mais alto sempre grava**: `crise` ou `risco` dentro das 2 h atualiza o momento aberto
    (nível, ações, `expira_em`), em vez de ser descartado. Sem isso, o painel nunca mostraria que o
    Guia indicou o CVV. Sem
  consentimento, devolve `sem_consentimento` e não grava nada (o app alivia mesmo assim, só no
  aparelho).
- **`cuidado_ativo(p_classe_id)`**: o aparelho pergunta se há modo de cuidado valendo (reabrir o
  app não o perde, e o cronômetro do servidor o respeita).
- **RLS:**
  - o aluno lê os próprios momentos (direito de acesso), com o nível;
  - o professor **não** tem policy na tabela base (decisão de quem escreveu a spec): com
    `security_invoker`, uma view exigiria SELECT na base, e aí ele leria `nivel` direto;
  - nenhum cliente escreve direto: só as RPCs.
- **RPC `cuidado_da_turma(p_classe_id, p_aluno_id)`** (`SECURITY DEFINER`, posse conferida por
  `app_classes_do_professor()` antes de ler, nunca `NOT IN`): por aluno e tópico, os momentos com
  origem, fatos e ações, **sem `nivel`**, e o acerto nas tentativas antes e depois de cada um, com
  a mesma conta e o mesmo aviso da aba Guia (coincidência no tempo, não efeito). "O Guia indicou o
  CVV 188" chega ao professor como ação, não como nível.
- **Prazo de retenção:** proposta de 180 dias (dado sensível guarda o mínimo), na política de
  retenção existente. Revogar o consentimento apaga os momentos do aluno.
- **Fica de fora:** `aluno_mental_state_history` (o nome engana; ela guarda estado de estudo e a
  DAT-45 vale), todas as contas de nota, XP, rank e estudo (#13).

### 6. Console do professor

No detalhe do aluno (`frontend/src/components/console/dashboard/aluno/DetalheAluno.tsx`), uma
seção **"Momentos de cuidado"**, lida direto do Supabase (`cuidado_da_turma`). Cada linha mostra:

```
12/11 · 19:40 · Frações
O aluno disse ao Guia que não estava bem
O app sugeriu pausa, desligou o cronômetro e ofereceu uma técnica de respiração
Acerto no tópico: 40% antes → 65% depois

14/11 · 21:10 · Frações
Sinais de uso: 6 erros seguidos, 52 min sem parar
O app sugeriu pausa e desligou o cronômetro
```

- Para `risco`, o painel diz "o Guia indicou o CVV 188". Sem destaque alarmante: o professor não é
  quem atende uma crise, e o painel não substitui o serviço de saúde.
- Nunca: o texto do aluno, "ansiedade", "crise" como rótulo do aluno, ou um "nível de estresse".
- Um resumo na linha do aluno na lista da turma ("2 momentos de cuidado em 30 dias") ajuda a achar
  quem olhar. Fica a critério de quem constrói se cabe nesta entrega.

## Medir

- Quantos momentos por origem e por nível (sem aluno identificado no agregado).
- Quantos aceitam "Fazer uma pausa" e quantos voltam ao estudo depois.
- Alarme falso: o aluno aperta "Continuar" logo no sinal de uso, sem pausa. Se for a maioria, N, M
  e K estão baixos demais.

## O que fica para quem constrói

- Nomes finais de colunas, RPCs e chaves de `app_config`.
- A lista de frases da barreira de `risco` (curta, revisada pela autora antes de ir ao ar).
- A animação da respiração guiada e onde o aviso aparece em cada tela.
- O texto final do termo (revisado pela autora antes de ir ao ar).
