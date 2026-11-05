# Custos do TrailUp

Documento vivo: é aqui que fica o que o projeto paga e consome hoje. Valor sem fonte aparece como
**PENDENTE**, nunca como estimativa. Chaves e faturas com dado pessoal não entram aqui.

A memória de cálculo do Resumo Expandido JIC 2026 é outra coisa: é um retrato de 04/11/2026 com os
números publicados na v7, em [`analises/custos-jic-2026/`](analises/custos-jic-2026/README.md). Ela
projeta planos pagos; este documento registra o que acontece de fato. Os R$ 435 de parte fixa são
projeção, não gasto.

Última atualização: 05/11/2026.

## O que é pago hoje

| Serviço | Papel | Plano | Custo por mês | Fonte |
|---|---|---|---|---|
| VPS Hetzner (Dokploy) | API e microservice | Pago | R$ 80,00 | Valor citado na v7; fatura a registrar |
| Supabase (projeto TraiUp) | Banco, auth, Realtime | Free, sem PITR nem backup baixável | R$ 0 | `CLAUDE.md` |
| Gemini (4 chaves) | Geração, chats, TTS | Tier free | R$ 0 | Decisão do projeto: nada de crédito pago |
| OpenAI | Reserva paga do microservice | Conta separada | PENDENTE | Fatura |
| OpenAI RAG | Busca do RAG | Chave de outra pessoa; não usar fora do RAG | PENDENTE | Fatura |
| Vercel (`trailup.vercel.app`) | Web | PENDENTE | PENDENTE | Fatura ou painel |
| Cloudflare R2 | Arquivos | PENDENTE | PENDENTE | Fatura ou painel |
| Expo / EAS | Builds do app | PENDENTE | PENDENTE | Fatura ou painel |
| GitHub Actions (repo privado) | CI | Cota mensal, limite de gasto zerado | R$ 0; o CI para quando a cota acaba | Erro do job |
| Assinaturas de desenvolvimento (Claude, Cursor) | Desenvolvimento | PENDENTE | PENDENTE | Fatura |

**Soma com fonte: R$ 80,00 por mês, incompleta.** Falta tudo o que está PENDENTE.

O gasto com IA publicado na v7 (R$ 314,24) ainda não tem faturas registradas. Falta dizer se inclui
as assinaturas ou só as APIs.

## Limites que funcionam como custo

O tier free não cobra em dinheiro, mas tem teto:

- **Cota do Gemini:** quando acaba, a fila para e o chat cai na resposta de reserva. Nova tentativa
  gasta a mesma cota diária. Um `402` é sinal de chave fora do tier free: avise, não contorne.
- **Faixa do chat:** `GEMINI_CHAVES_RESERVADAS_CHAT` está em `0`. Para ligar sem tirar capacidade da
  fila, crie uma 5ª chave em projeto novo, ponha no fim de `GEMINI_API_KEY` só na API e use `1`.
- **Espaço do Supabase:** o plano Free tem 500 MB, e o banco estava em 77,6 MB em 05/11/2026. O monitor guarda 35 dias de `monitor_sonda`, então ela cresce até parar perto de 151 mil linhas (ver a decisão abaixo).
- **E-mail:** o Apps Script envia para 100 destinatários por dia, divididos com o contato e o aviso de conta inativa. O monitor tem teto de 10 por dia (`emails_por_dia`).
- **Dados:** no tier free, o Google pode usar o que é enviado. Ver
  [`lgpd/transferencias-internacionais.md`](lgpd/transferencias-internacionais.md).

## Como medir o consumo

| Fonte | Cobre | Não cobre |
|---|---|---|
| `ia_uso_llm` | Toda chamada de modelo feita pela API: tokens, cache, tempo, `fim`, `prompt_versao` | Microservice |
| `personalizacao_job_targets.uso_modelo` | Geração de mídia do microservice, com Gemini, OpenAI, deck e caracteres da voz, somando as tentativas | Chamadas da API, como o enriquecimento |
| `ia_decision_logs` com `provider = 'regra'` | Perguntas respondidas sem modelo | Consumo em tokens |
| Logs do microservice, linha `[gemini-diag]` | Amostra crua do `usageMetadata` | Histórico, some com o log |

As duas primeiras fontes não se somam por engano: o microservice não grava em `ia_uso_llm`.

Consumo por prompt, em transação somente leitura:

```sql
SELECT prompt, prompt_versao, count(*) AS chamadas,
       round(avg(tokens_entrada)) AS entrada, round(avg(tokens_saida)) AS saida,
       round(avg(tokens_cache)) AS cache, round(avg(latencia_ms)) AS ms,
       count(*) FILTER (WHERE fim LIKE 'erro:%') AS erros
FROM ia_uso_llm
WHERE criado_em > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY chamadas DESC;
```

## Consumo medido

Ainda não há uso real suficiente para dizer quanto uma turma consome: em 05/11, `ia_uso_llm` tinha 8
linhas, e nenhuma do chat do Guardião.

| Chamada | Entrada | Saída | Cache | Amostra |
|---|---|---|---|---|
| `missao_diaria_texto.txt` | 780 | 841 | 0 | 7 chamadas em produção, 3 com erro |
| `escriba.txt` | 7.073 | 1.151 | 0 | 1 chamada em produção |
| `planejador_conteudo.txt` | 709 | 693 | Sem medir | 1 chamada real, dado sintético |
| `gerador_conteudo.txt` (cards) | 3.303 | 1.344 | Sem medir | 1 chamada real, dado sintético |
| `classe_mapa_tema.txt` | 677 | 1.676 | Sem medir | 1 chamada real, dado sintético |
| `mentor_personalizacao_chat.txt`, ordem nova | ~5.285 | 135 a 255 | 0, 1.900, 1.900 | 3 chamadas reais, dado sintético |
| `mentor_personalizacao_chat.txt`, ordem antiga | ~5.285 | 808 a 1.327 | 0, 0, 0 | 3 chamadas reais, dado sintético |

As saídas do Guardião não são comparáveis entre si: as perguntas eram diferentes. Cada mensagem ao
Guardião custa essa chamada mais o juiz de grounding.

## Decisões que mudam o custo

| Data | Decisão | Efeito | Estado |
|---|---|---|---|
| 05/11/2026 | Monitor 24 horas, com sonda de 1 min nos três alvos (#1004) | Nenhuma chamada de modelo. `monitor_sonda` chega a ~151 mil linhas em 35 dias. Na proporção medida (243 linhas em 123 kB, 05/11/2026) seriam até ~76 MB; a amostra é pequena e tende a superestimar | Na fila do sync |
| 05/11/2026 | Payload com o que é fixo primeiro (#971) | Cache de 1.900 de ~5.285 tokens no Guardião, medido | No ar |
| 05/11/2026 | Pergunta de navegação sem modelo (#973) | Duas chamadas a menos por pergunta; volume desconhecido | No ar, sem medir |
| 05/11/2026 | Schema nativo em plano, cards e mapa (#967) | Saída só com o que foi pedido | No ar |
| 05/11/2026 | Faixa de cota do chat (#975) | Protege o chat; `1` de 4 tira 25% da fila, salvo com chave nova | Desligada |
| 05/11/2026 | Juiz fora do ar vai ao fallback, sem gerar de novo (#965) | Evita chamada que não adiantaria | No ar |
| 05/11/2026 | Sem nova tentativa com provedor fora do ar (#964) | Não repete chamada perdida | No ar |

## Quando atualizar

No mesmo PR, sempre que:

- entrar, sair ou mudar de plano um serviço pago;
- chegar uma fatura ou mudar o valor de uma;
- entrar uma chamada de modelo nova ou mudar o modelo padrão;
- uma decisão mudar o número de chamadas, os tokens por chamada ou a cota;
- uma medição nova substituir um número daqui.

Mude a data no topo. Número novo leva a fonte ao lado e a data da medição.
