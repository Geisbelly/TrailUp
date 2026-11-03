# CLI de assinatura (Gemini CLI / Codex CLI) no lugar da API de LLM — análise de viabilidade

Data: 2026-11-02. Pergunta: dá para trocar as chamadas de LLM do TrailUp
(geração de conteúdo personalizado e demais) por CLIs autenticadas com conta de
assinatura, para sair da cota do free tier e não gastar com API?

**Resposta curta: não em produção.** O Gemini CLI não dá mais esse caminho. O
Codex CLI até rodaria, mas viola os termos de consumidor e esbarra na regra de
LGPD para menores. Também não cobre áudio, que é metade do volume. Para fazer
direito, o esforço fica em 2–3 semanas, e o que se ganha é uma cota frágil,
presa a uma conta pessoal que pode ser suspensa. O dinheiro e o tempo rendem
mais no plano pago do Gemini, com redução de chamadas (seção 6).

---

## 1. O que o TrailUp chama hoje

Levantamento feito no código (api/ e microservice/). Não há uma camada única de
cliente: são cinco pontos de entrada.

| Ponto de entrada | Onde | Modalidade |
|---|---|---|
| `JsonLLMService` | `api/app/services/llm.py` | texto → JSON com schema (grafo, mentor, escriba, insights, boss, missão, tema, alterações) |
| Enriquecimento | `api/app/services/content_enrichment.py` | JSON com schema, rodízio próprio |
| HTTP direto ao Gemini | `personalizacao.py`, `media_agents.py`, `audio.py` | **multimodal** (PDF/imagem/áudio de entrada), **TTS**, **imagem** |
| RAG | `api/app/services/openai_rag.py` | OpenAI Responses + `file_search` |
| Microservice | `microservice/src/services/geminiService.ts`, `contentGenerationService.ts` | JSON com `responseSchema`, **TTS**, **imagem com imagem de entrada** |

Volume estimado para **um tópico novo**, no caminho real (jobs + microservice,
7 perfis, ~24 blocos):

| Item | Chamadas (melhor caso) |
|---|---|
| Enriquecimento | ~4 |
| Cards | 1 |
| Texto + roteiro de áudio por perfil | ~28 |
| Falas do boss | 3 |
| **Texto/JSON (subtotal)** | **~35** |
| **TTS** (partes de ~4.500 caracteres × 7 perfis) | **~56–112** |
| Reilustração de imagem | 0–14 |
| **Total** | **~90–160** (2–3× com as novas tentativas) |

O que fica fora do tópico:
- O **grafo de análise de telemetria** é síncrono, dispara a cada lote e faz
  ~5–12 chamadas.
- O **chat do mentor** faz 2–4 chamadas por mensagem, com o aluno esperando.

`api/app/core/settings.py` registra que o free tier do `gemini-3.6-flash` tem
cerca de 20 requisições por dia. Um tópico sozinho já estoura essa cota, e as
specs de agosto chamam a cota de "o gargalo real do sistema".

**O que pesa na troca: mais da metade das chamadas é TTS e imagem, e há entrada
multimodal.** As CLIs são agentes de código. Elas devolvem texto e não geram
áudio nem imagem.

## 2. Estado das CLIs hoje (pesquisa de 2026-11-02)

### Gemini CLI — o caminho da assinatura acabou

- Desde **18/06/2026**, o Gemini CLI deixou de atender contas gratuitas e Google
  One, e o Google indica o **Antigravity CLI** no lugar. Há relato de que a
  mudança vale para todas as contas pessoais, inclusive AI Pro e Ultra. A página
  oficial de cotas ainda mostra "1.000 req/dia com login Google", mas está
  desatualizada. Fontes: npm `@google/gemini-cli`; CSA `csa-plugins-official#28`;
  blog da Cubic.
- Com **chave de API**, o Gemini CLI consome **a mesma cota do free tier** que o
  projeto já usa (250 req/dia, só Flash, segundo a doc do CLI). Não há ganho.
- Usar o OAuth do **Antigravity** fora da ferramenta oficial levou a suspensões
  com `403 violation of Terms of Service`, relatadas no fórum
  discuss.ai.google.dev. Há recursos sem resposta há semanas.
- Seguem funcionando só as licenças pagas (Code Assist Standard e Enterprise,
  1.500 a 2.000 req/dia). Isso já é pagar, e a licença é por desenvolvedor, não
  para um backend.

### Codex CLI — roda, mas fica na zona cinzenta dos termos

- `codex exec` é o modo não interativo. Aceita schema de saída e reusa o login
  salvo.
- Com login ChatGPT, **valem os termos de uso de consumidor do ChatGPT** (central
  de ajuda da OpenAI, artigo 11369540). Esses termos proíbem uso "automático ou
  programático" do serviço.
- Para automação, a própria OpenAI indica **chave de API**, cobrada como API.
- Segundo terceiros (pydantic-ai e outros), oferecer o uso do plano num app
  hospedado exige aprovação da OpenAI. Não há uma página oficial liberando isso.
- Os limites do Plus vêm em faixas por janela de 5 h, com possível limite
  semanal. A cota é **compartilhada** com o uso do ChatGPT e do Codex da mesma
  pessoa e muda sem aviso.

## 3. Restrições específicas do TrailUp

1. **LGPD e menores (`api/app/services/roteamento_ia.py`, #195).**
   - Hoje, toda IA de aluno menor ou sem data de nascimento vai para a OpenAI
     com `store=False`, nunca para o Gemini.
   - Uma conta de consumidor não oferece `store=False` nem os termos de dados
     da API. Mandar dado de aluno, ainda mais de menor, por uma conta pessoal
     de ChatGPT ou Google quebra essa regra.
   - O mesmo vale para a transferência internacional pendente em
     `docs/lgpd/transferencias-internacionais.md`.
   - O próprio free tier da API Gemini já é problema aqui: no plano não pago,
     o Google pode usar os dados para melhorar produtos. A pendência "confirmar
     o plano pago do Gemini" está aberta nesse mesmo documento.
2. **A API roda no Dokploy, sem disco persistente.**
   - O login da CLI (`~/.codex`, `~/.gemini`) precisaria de volume montado e de
     renovação de token.
   - Se o token expirar ou a conta for suspensa, toda a IA para. Hoje existe
     rodízio de 4 chaves e fallback; com a CLI, a conta pessoal vira o ponto
     único de falha.
3. **Latência.** O `codex exec` sobe um processo de agente a cada chamada,
   com overhead de segundos. Isso inviabiliza os caminhos síncronos: o grafo de
   análise por lote de telemetria e o chat do mentor.
4. **Concorrência.** O worker processa 7 perfis com concorrência 2–3. A CLI
   processa um prompt por processo, e o limite da conta é por usuário: tudo
   entra numa fila só.
5. **Regra de fronteira.** A CLI não muda a fronteira, já que é IA e fica na
   API. Mas acrescenta encanamento novo dentro da API: gerenciar subprocessos,
   sessão e token.

## 4. Quanto custaria em tempo

Estimativa para uma pessoa que conhece o código:

| Etapa | Esforço |
|---|---|
| Unificar os 5 pontos de entrada num cliente só, com o provedor como estratégia (vale por si, ver seção 6) | 3–5 dias |
| Adaptador `codex exec` com schema de saída, timeout, parse e erros, atrás do `JsonLLMService` | 2–3 dias |
| Volume persistente + login/renovação no Dokploy, health check do token | 1–2 dias |
| Fila e concorrência (um processo por vez, backoff pela janela de 5 h) | 2–3 dias |
| Respeitar a rota de menores (CLI só para conteúdo sem dado de aluno) | 1 dia |
| Testes, ajuste de prompts (o modelo muda, as assinaturas editoriais precisam ser revalidadas nos 7 perfis) | 3–5 dias |
| **Total** | **~2,5–4 semanas** |

Mesmo com tudo isso, **TTS, imagem e entrada multimodal continuam na API**, e o
grafo síncrono também. O que sai da API são as ~35 chamadas de texto por tópico,
nos jobs em lote.

## 5. Vantagens e desvantagens

**Vantagens**
- Zero custo marginal nas chamadas de texto em lote, enquanto a cota da conta
  aguentar.
- O Codex aceita schema de saída, então o formato JSON dos jobs se mantém.
- Força a unificação do cliente LLM, que já falta hoje.

**Desvantagens**
- **Termos de uso:** consumidor não é backend. O risco de suspensão é real, e
  está documentado no lado do Google.
- **LGPD:** dado de aluno, e de menor, passaria por conta pessoal, fora da regra
  `store=False` e sem base de transferência.
- **Cobertura parcial:** não faz TTS nem imagem, que são a maior parte do volume.
- **Disponibilidade:** a conta pessoal vira ponto único de falha. A cota é
  compartilhada com o uso da própria pessoa e muda sem aviso.
- **Latência:** inviável nos fluxos síncronos.
- **Operação:** token, volume e subprocesso dentro de uma API que já cai por
  outras razões.
- **TCC:** uma arquitetura que depende de burlar termos é difícil de defender na
  banca e no relatório técnico.

## 6. Recomendação

**Não adotar CLI de assinatura em produção.** Em ordem de retorno:

1. **Corrigir o bug de chave já encontrado.** *(Atualização de 03/11: corrigido
   na #872, um pool só de chaves Gemini para a API e o microservice. As linhas
   citadas abaixo são da época da análise.)* As chamadas HTTP diretas ao Gemini
   (`personalizacao.py:2661`, `:4606`, `:5352`; `media_agents.py:201`, `:904`;
   `audio.py:114`) mandam `settings.gemini_api_key` sem rodízio. Com várias
   chaves no `.env`, o header vai inválido. Parte da "cota estourada" pode ser
   isso. Custo: horas.
2. **Unificar o cliente LLM** (as etapas 1 da tabela acima, 3–5 dias). Isso dá
   um ponto só para medir chamadas, para fazer cache e para trocar de provedor.
3. **Medir o custo real no plano pago do Gemini.** Contar os tokens de um tópico
   e multiplicar pelo preço de lista do Flash e do TTS. Os jobs são batch e
   podem usar a Batch API, que é mais barata.
   - Isso também resolve a pendência de LGPD ("confirmar o plano pago").
   - Tira o projeto do teto de ~20 req/dia, que nenhum rodízio de chave resolve.
4. **Cortar chamadas antes de pagar por elas.**
   - Não regerar quando o `source_hash` bate, o que já acontece em parte.
   - Juntar texto e roteiro de áudio na mesma chamada.
   - Cachear o enriquecimento entre perfis.
   - Gerar TTS só quando o aluno abre o áudio pela primeira vez, em vez de para
     os 7 perfis de saída.
5. **Uso aceitável de CLI:** como ferramenta de desenvolvimento, para revisar
   prompts, comparar modelos ou gerar fixtures. Sempre na máquina de quem usa,
   de forma interativa e sem dado de aluno. É o uso para o qual essas
   assinaturas foram feitas.

## Fontes

- Gemini CLI, cotas: https://google-gemini.github.io/gemini-cli/docs/quota-and-pricing.html
- Gemini CLI → Antigravity (npm): https://www.npmjs.com/package/@google/gemini-cli
- Mudança para contas pessoais: https://github.com/CloudSecurityAlliance/csa-plugins-official/pull/28 · https://www.cubic.dev/blog/gemini-cli-vs-claude-code
- Suspensões por OAuth de terceiros: https://discuss.ai.google.dev/t/got-banned-from-antigravity-for-using-opencode-submitted-appeal-but-still-locked-out/131169 · https://discuss.ai.google.dev/t/appeal-submitted-antigravity-gemini-cli-403-tos-no-response-after-24h/183564
- Codex com plano ChatGPT (termos de consumidor): https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Codex, limites e automação: https://learn.chatgpt.com/docs/pricing · https://developers.openai.com/codex/noninteractive.md
- Uso do plano em app hospedado: https://pydantic.dev/docs/ai/models/openai-chatgpt/ · https://zylos.ai/zh/research/2026-07-13-subscription-auth-boundaries-official-cli-agent-automation/
