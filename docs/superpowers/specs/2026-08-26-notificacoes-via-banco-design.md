# Notificações via banco — desenho

> Estado antes desta mudança: as quatro tabelas existiam e **nenhuma funcionava
> de ponta a ponta**.

## O que estava quebrado

| Tabela | Estado real |
| --- | --- |
| `notificacoes_pendentes` | Escrita por `NotificacaoRepository.enfileirar`. **Nunca lida por nada.** Sem gatilho, sem expiração, sem ligação com a notificação final. 1 linha em produção, parada desde julho. |
| `notificacoes_ia` | Escrita no mesmo `enfileirar`, com **o mesmo conteúdo** de `pendentes` — duplicação pura. `resposta_hash` existia mas **sem índice único**: o dedupe que a coluna prometia nunca aconteceu. Nunca lida. |
| `notificacoes_agendamentos` | **Zero linhas de código no monorepo inteiro.** `recorrencia` era `text` sem semântica e não havia `proxima_execucao` — nem um cron externo conseguiria consumi-la. |
| `notificacoes` | Única tabela viva, mas escrita **só pelo mobile**. O backend nunca inseriu nela. O aluno só via a notificação como *toast*, e só com o app aberto. |

Faltavam ainda três coisas sem as quais o pedido não se sustenta: nenhum
registro de device token (push impossível), nenhum registro de login e nenhum
agregado de tempo de uso diário.

E havia um buraco de segurança: as policies RLS das quatro tabelas eram
`USING (true)` para o role `public` em SELECT/UPDATE/DELETE — **qualquer
portador da chave anon lia e apagava a notificação de qualquer aluno**.

## Onde o motor mora, e por quê

**Dentro do Postgres.** A API é para IA; o resto é via banco (CLAUDE.md, "Regra
de fronteira"). Aqui isso não é preferência de estilo:

- **a API hiberna.** Free tier do Render. Um despachante hospedado nela para de
  despachar exatamente quando ninguém está com o app aberto — que é o momento
  em que a notificação mais importa;
- **um salto a menos.** `mobile → Supabase` já é o caminho autenticado com
  Realtime. `mobile → API → Supabase` adiciona latência, um ponto de falha e uma
  segunda cópia das regras de acesso.

A API mantém exatamente um papel: gravar a **sugestão da IA** em
`notificacoes_ia`. Um `INSERT`, e nada mais.

```
   API (LangGraph)                     mobile
        │                                 │
        │ INSERT sugestão                 │ supabase.rpc(...)
        ▼                                 ▼
  ┌──────────────┐   trigger      ┌────────────────────────┐
  │notificacoes_ia├──────────────►│ notificacoes_pendentes │◄── rotinas
  │  (sugestão)  │                │        (fila)          │
  └──────────────┘                └───────────┬────────────┘
                                              │ notificacoes_entregar()
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                    ┌──────────────────┐          ┌────────────────────┐
                    │  notificacoes    │          │ push via pg_net    │
                    │ (caixa de entrada)│         │ → Expo → FCM/APNs  │
                    └──────────────────┘          └────────────────────┘
```

## Os três caminhos até o aluno

Não é redundância: cada um cobre um caso que os outros não cobrem.

| Caminho | Funciona com app… | Precisa de… | Cobre |
| --- | --- | --- | --- |
| **Notificação local agendada** | fechado, sem rede | nada | rotina diária, lembretes de relógio |
| **Push remoto** (`pg_net` → Expo) | fechado | token + internet | o que o servidor decide depois (sugestão da IA) |
| **Realtime + toast** | aberto | WebSocket | feedback imediato |

A rotina diária é **local**: o aparelho dispara sozinho, no horário, mesmo sem
servidor, sem token e sem internet. Boa parte do que normalmente se constrói
como servidor não precisa de servidor.

## Gatilhos de entrega

| Gatilho | Entrega quando | Quem avalia |
| --- | --- | --- |
| `horario` | `horario <= now()` | `notificacoes_varrer()` (pg_cron) e cada login/heartbeat |
| `login` | próximo login do aluno | `notificacoes_registrar_login()` |
| `tempo_uso` | uso do dia cruza `contexto.limiar_min` | `notificacoes_heartbeat()` |

`expira_em` existe porque "volte a estudar hoje" entregue três dias depois é
pior que nada — o motor marca `expirada` em vez de entregar.

## Superfície que o app chama

Só estas seis têm `GRANT` para `authenticated`:

| RPC | Papel |
| --- | --- |
| `notificacoes_registrar_login` | abre sessão, garante rotinas, entrega pendentes de login |
| `notificacoes_heartbeat` | soma tempo de uso, avalia `tempo_uso`, entrega |
| `notificacoes_encerrar_sessao` | fecha a sessão |
| `notificacoes_desativar_dispositivo` | logout / permissão revogada |
| `notificacoes_minhas_rotinas` | o app agenda as locais a partir daqui |
| `notificacoes_salvar_rotina` | tela de preferências |

As internas (`notificacoes_entregar`, `_processar_rotinas`, `_enviar_push`,
`_varrer`) recebem `REVOKE`: rodam como `SECURITY DEFINER` a partir das RPCs.
Expô-las deixaria o app disparar entrega em nome de qualquer aluno.

## Decisões que são fáceis de errar

- **`proxima_execucao` é coluna, não expressão derivada.** O claim precisa ser
  `UPDATE ... WHERE proxima_execucao <= now()` com `SKIP LOCKED`. Recorrência
  calculada em tempo de leitura não pode ser travada atomicamente, e duas
  execuções concorrentes entregariam a mesma rotina duas vezes.
- **O índice de dedupe não filtra por status.** Filtrando só `pendente`, a linha
  sairia do índice ao ser entregue e a rotina de tempo de uso dispararia a cada
  varredura enquanto o aluno seguisse acima do limiar. Como a chave carrega o
  dia, "único por (aluno, chave)" significa "uma vez por dia por motivo".
- **A caixa de entrada vem antes do push.** Se o push falhar, o aluno ainda vê a
  notificação ao abrir o app. Na ordem inversa, uma falha de banco depois de um
  push bem-sucedido deixaria um aviso no aparelho que não existe em lugar nenhum.
- **Silêncio é sobre o push, não sobre a notificação.** A linha entra na hora;
  só o barulho é suprimido. Adiar a linha faria o aluno abrir o app de manhã e
  não ver nada do que aconteceu durante a noite.
- **Teto diário suprime, não adia.** Adiar só empurraria a avalanche para o dia
  seguinte.
- **O dia é o do aluno.** Em UTC-3 a virada por UTC aconteceria no meio da tarde
  e a rotina diária dispararia duas vezes.
- **A rotina diária não chama o LLM.** O `agente_notificacao` já produz sugestões
  a cada ciclo; a rotina é a *verificação* que revisa e promove. Uma chamada de
  LLM por aluno por dia só para reescrever o que já existe seria custo sem ganho.

## Para quem e quando (#149, `20261102_18`)

A IA continua só sugerindo em `notificacoes_ia`, e a redação é do `agente_notificacao`. O que esta
seção decide é o destino e o momento, e quem decide é o banco.

- **Por perfil (matriz de Monterrat).** `notificacoes_config.perfil_pesos_<tipo>` guarda o peso de
  cada perfil BrainHex para aquele tipo (rank: Conqueror 1,0, Achiever 0,75, Daredevil e Mastermind
  0,63, Socializer 0,13; `amigo_rank`: Socializer; `novo_material`: Seeker e Achiever; `sequencia`:
  Achiever). `notificacoes_destino` lê o perfil dominante e barra o tipo quando o peso fica abaixo de
  `perfil_peso_minimo_pct`. Tipo sem matriz passa para todos. A sugestão barrada fica `suprimida`, com
  o motivo `perfil` ou `silenciado`.
- **Amizade e rank.** `notificacoes_rank_varrer` (pg_cron, a cada 10 min) compara a posição de
  `vw_rank_posicoes_por_classe_todas` com `rank_posicao_anterior`. Quem subiu, e tem pontos, recebe
  `rank`. Os amigos com amizade `accepted` e matriculados na turma recebem `amigo_rank`, que nomeia o
  colega **só dentro do corte visível** (`app_rank_limite_visivel()`): fora dele, o rank não mostra o
  aluno, e o aviso não pode mostrar. Na primeira passada, o job só registra a base. A descida só gera
  aviso com `rank_notificar_descida = 1`.
- **Modo foco.** O foco pode ser explícito (`aluno_modo_foco`, ligado pelo app) ou vir da atenção
  (`aluno_estado_atencao`, gravado pela API a cada ciclo; vale por `atencao_validade_min`, com a atenção
  acima de `atencao_limiar_baixa_pct`; desconcentrado não conta como foco). Em foco, `notificacoes_entregar` não entrega nada. A pendente passa a
  `gatilho = 'fim_foco'`, e o push direto (chat, convite, conquista) não sai. Fora do foco, as
  seguradas **colapsam por tipo**: fica só a mais prioritária e recente, as outras ficam
  `colapsada`, e o vencido expira. O teto diário continua valendo.
- **Silenciar.** `notificacoes_silenciar_tipo` vale só para os tipos de `tipos_silenciaveis`. Ela
  suprime o que está pendente e grava em `notificacoes_silenciamento_log` o perfil e as afinidades do
  momento, porque silenciar é sinal de perfil.

RPCs do app: `notificacoes_meu_foco`, `notificacoes_iniciar_foco(minutos)` (de 5 a
`foco_duracao_max_min`), `notificacoes_encerrar_foco` e `notificacoes_silenciar_tipo`. A tela fica em
Perfil → Configurações → "Modo foco e avisos". O botão "Não quero avisos assim" fica no detalhe da
notificação.

Limites: `novo_material` e `sequencia` ainda não têm produtor, e a matriz os roteia quando ele
existir. A revisão diária é notificação local e dispara com o app fechado mesmo em foco; com o app
aberto, ela entra na lista sem banner. O foco por atenção não chega ao aparelho: só o foco explícito
tira o toast no app aberto.

## Configuração

Em `notificacoes_config`, uma linha por parâmetro — nada de número mágico dentro
das funções, e o console do professor pode ajustar sem deploy: `max_por_dia`,
`janela_silencio_inicio`/`_fim`, `expiracao_padrao_horas`,
`tempo_uso_limiar_min`, `rotina_diaria_hora`/`_minuto`, `sessao_ociosa_min`,
`push_url`, `push_access_token`, `push_timeout_ms` e, desde a #149, `perfil_pesos_<tipo>`,
`perfil_peso_minimo_pct`, `tipos_silenciaveis`, `foco_*`, `atencao_*` e `rank_*`.

## Limites conhecidos

- **`pg_net` é assíncrono.** A chamada enfileira o POST e volta; `push_enviado_em`
  é otimista. A confirmação real fica em `net._http_response`, e nada hoje a lê
  para desativar token morto (`DeviceNotRegistered`). Um token de aparelho
  desinstalado continua ativo até o aluno fazer logout.
- **`pg_cron` é best-effort.** Onde não houver privilégio, a varredura fica
  desligada: login e heartbeat continuam entregando tudo, e o lembrete diário
  continua funcionando (é local). O que se perde é o alcance ao app fechado para
  sugestões novas da IA.
- **Push remoto exige build de desenvolvimento.** Não funciona no Expo Go.
- **RLS ainda não distingue aluno de aluno fora das notificações.** O acesso
  anônimo foi fechado (`20260826_08`), mas em ~26 tabelas o predicado segue
  `true` para qualquer autenticado. Ver CLAUDE.md, seção de convenções.
