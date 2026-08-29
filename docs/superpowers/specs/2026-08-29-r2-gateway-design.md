# Arquivos no Cloudflare R2 com o Supabase como gateway — design

**Data:** 2026-08-29
**Status:** proposto

## O problema

O projeto está **em overage de egress**: 6,38 GB de uma cota de 5 GB (128%). O
grace period vai até **26/set/2026**; depois disso a Fair Use Policy se aplica e
as requisições passam a responder **402**. O app para.

Medido no painel e nos logs (`edge_logs`, 24 h):

| Área | Reqs | MB | Share |
| --- | ---: | ---: | ---: |
| storage | 518 | 76,49 | **99,9%** |
| rest (tudo) | 1.361 | 0,03 | 0,04% |
| outro | 166 | 0,05 | 0,06% |

**O egress é Storage e praticamente nada além disso.** Não é o banco, não é
Realtime, não é Auth. Cota de Cached Egress no mesmo período: 0,95 GB de 5 GB.

Composição dos 712 MB no Storage (bucket `conteudo_aluno`, 694 MB):

| Tipo | Arquivos | Total | Média | Maior |
| --- | ---: | ---: | ---: | ---: |
| `audio/mpeg` | 331 | 483 MB | 1.495 kB | 10.238 kB |
| `text/html` | 307 | 198 MB | 661 kB | 8.584 kB |
| `text/markdown` | 456 | 13 MB | 29 kB | 416 kB |

## A decisão

**Os bytes vão para o R2. O Supabase continua sendo o ponto único de entrada,
mas só do plano de controle.**

R2 não cobra egress. O free tier dá 10 GB de armazenamento, 1M operações
Class A e 10M Class B por mês — os 712 MB atuais cabem com folga.

## A regra que define o desenho inteiro

O painel do Supabase define egress assim:

> Contains any outgoing traffic including Database, Storage, Realtime, Auth,
> API, **Edge Functions**, Pooler and Log Drains.

Portanto: **se o arquivo passar por dentro da Edge Function, o egress continua
sendo cobrado igual.** Migrar para o R2 e servir por proxy moveria os arquivos e
manteria a conta — com latência a mais e invocações a mais.

A separação é obrigatória, não estilística:

- **Plano de controle** (autorizar, resolver caminho, assinar) → Edge Function
  no projeto principal.
- **Plano de dados** (os bytes) → cliente ↔ R2, direto.

A Edge Function **nunca devolve o arquivo**. Devolve **302** para uma URL
assinada do R2. O Supabase vê ~200 bytes por arquivo em vez de 8 MB.

## Por que gateway, e não trocar a URL em cada cliente

São quatro clientes (`api`, `microservice`, `frontend`, `mobile`) e as URLs já
estão gravadas no banco em três formatos diferentes — 135 linhas de
`materiais_gerados.arquivo_url` apontam para `supabase.co` e 36 para o host
interno `trailup-microservice-gmgqkw:3000`, que nem resolve fora do deploy.
Trocar cliente a cliente quebra em produção durante a transição.

Com o gateway, nada nos clientes muda: continuam chamando uma URL do projeto
principal e recebendo o arquivo.

## A função `storage-redirect`

Mora em `frontend/supabase/functions/storage-redirect/` (`index.ts` +
`config.toml`), seguindo `generate-content-ai`.

- **Rota:** `GET /functions/v1/storage-redirect?path=<storage_path>`
- **`verify_jwt = false`** (Opção A, decidida — ver adiante). O app baixa mídia
  sem headers, então exigir JWT daria 401 em toda mídia; e não há proteção a
  perder, porque os buckets de hoje já são públicos.
- **A consulta continua existindo, como checagem de EXISTÊNCIA.** Sem ela a
  função assinaria qualquer chave que pedissem, virando um oráculo de assinatura
  para o bucket inteiro. Com ela, os 537 órfãos e qualquer chave inventada ficam
  de fora. Roda com service role, porque a view é `security_invoker` e com a
  chave anônima devolveria vazio para todos.
- **A view segue `security_invoker`** de propósito: é o que permite trocar para
  a Opção B depois sem refazer o modelo.
- **Chave de busca é `storage_path`, nunca `arquivo_url`.** O `arquivo_url` está
  inconsistente no banco (três formatos, um deles inválido); o `storage_path` é
  estável e é o mesmo caminho dentro do R2.
- **Segredos** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`) como secrets da Edge Function. Nunca no repositório, nunca em
  `.env` versionado.

## Decisões tomadas

**URL assinada com janela alinhada** (`r2Presign.ts`). Assinatura nova a cada
chamada produziria URL nova a cada chamada, e o cache do mobile é chaveado pela
URL (`ensureCachedNativeContent`) — todo acesso viraria download novo, que é
exatamente o custo que a migração existe para eliminar. A assinatura usa como
`X-Amz-Date` o **início da hora corrente**, então todas as chamadas dentro da
mesma hora produzem a URL idêntica e o cache volta a acertar. Validade é o dobro
da janela, senão a URL emitida no fim dela nasceria vencida.

Descartado: domínio público no R2. É mais simples e mais barato, mas entrega o
material a quem tiver o link — e ao sair do Supabase Storage o objeto já perde a
RLS. Trocar a cota por uma regressão de acesso não vale.

**A autorização nunca é reimplementada na função.** Na Opção A ela não existe
(o material já é público hoje); se e quando a Opção B entrar, a função consulta
`vw_material_storage_paths` (`security_invoker = on`) com o JWT do chamador; as
policies das tabelas base decidem. Se o RLS escondeu, a linha não existe e não
há o que assinar. Medido: a view resolve **584 caminhos**, alcançando **558 dos
1.095 objetos** do bucket — exatamente o conjunto vivo. Os 537 órfãos ficam
inalcançáveis pelo gateway, que é a limpeza embutida na migração.

> Achado de passagem: **26 caminhos referenciados apontam para arquivo que não
> existe** no Storage. Hoje já dariam erro; pelo gateway darão 404. Vale
> investigar à parte — é falha de gravação, não da migração.

## Verificado no mobile (2026-08-29)

**A URL de gateway atravessa o app intacta.** Confirmado por teste, não por
leitura: `looksLikeStorageObjectPath` recusa qualquer string absoluta e
`parseSupabaseStorageUrl` só aceita `/storage/v1/object/`; com os dois nulos,
`resolveSupabaseStorageUrl` cai em `buildSupabasePublicStorageUrl`, que devolve
a entrada sem tocar. 8 testes em `storageUrlShape.gateway.test.ts`.

Para poder testar isso de verdade, a lógica pura de forma de URL saiu de
`supabaseStorage.ts` para `storageUrlShape.ts` — aquele módulo importa o client
do Supabase, que arrasta o react-native e não carrega no `node --test`. É o
mesmo motivo pelo qual `storageOrigin.ts` já havia sido extraído.

> **Defeito latente encontrado no caminho:** `parseSupabaseStorageUrl` assume
> que o 4º segmento é o modo (`public`/`sign`). Na rota autenticada
> (`/storage/v1/object/<bucket>/<path>`) não há modo, então o bucket é lido
> como modo e o material vira `/object/public/brainhex/…` — bucket inexistente.
> Não é alcançável hoje: nenhuma URL gravada usa essa forma (595 públicas, 157
> de deck, zero autenticadas). Fixado como teste de caracterização.

## O bloqueio real: o app não manda header

`ensureCachedNativeContent` baixa com `FileSystem.downloadAsync(url, localUri)`
— **dois argumentos, sem headers**. Com `verify_jwt = true`, toda mídia
responderia 401. O gateway como está escrito não funcionaria no app.

E uma correção ao que este documento afirmava antes: eu justifiquei a URL
assinada dizendo que "ao sair do Supabase Storage o objeto perde a RLS". **Está
errado** — os quatro buckets já são `public: true`. O material de hoje é legível
por qualquer um que tenha o link; a RLS protege a *listagem*, nunca o objeto.
Não existe proteção a preservar.

Daí as duas saídas, e elas não são equivalentes:

**A — `verify_jwt = false`, o gateway assina sem exigir JWT.** Segurança igual à
de hoje (link é acesso), *mais* expiração, que hoje não existe. Nenhuma mudança
no app. Estritamente melhor que o estado atual, e destrava o 402 sem tocar no
mobile.

**B — manter a autorização e passar o token no download.** `downloadAsync`
aceita `{ headers }`, então é viável. Fica mais restrito que hoje. Custa mudança
no mobile e exige confirmar que o `Authorization` não vaza para o R2 no 302 —
serviço S3-compatível que recebe header de autorização pode tentar usá-lo no
lugar da assinatura da query e recusar.

**Decidido: A** (2026-08-29). O problema em cima da mesa é a cota e o prazo de
26/set, e A destrava sem tocar no mobile, entregando expiração que hoje não
existe. **B fica registrada como endurecimento futuro** — a view já nasce
`security_invoker` para suportá-la, e o custo dela é a mudança no download do
mobile mais o teste de que o `Authorization` não vaza para o R2 no 302.

## Migração dos 712 MB

Ordem que nunca deixa o app sem arquivo:

1. Copiar Supabase Storage → R2 preservando **o mesmo caminho**.
2. Escrita nova passa a ir para os **dois** (`uploadBuffer` no microservice e o
   upload do BrainHexPDF).
3. Leitura passa a apontar para o gateway.
4. Parar de escrever no Supabase Storage.
5. **Nada é apagado do Supabase.**

**Não migrar os órfãos.** 537 arquivos / 367 MB (53% do bucket) não são
referenciados por nenhuma linha viva de `materiais_gerados` nem do JSONB
`conteudo_personalizado.materiais`. A migração é a hora natural de deixá-los
para trás — e some a necessidade de escrever uma rotina de limpeza retroativa.

### Os dois lugares, não um (decidido 2026-08-29)

O plano original terminava apagando os arquivos do Supabase. Descartado: o
material passa a viver nos **dois** lugares, e o gateway prefere o R2 (que não
cobra egress) caindo no Supabase quando o objeto ainda não foi copiado.

O ganho não é só evitar perda de dado. É que **o gateway responde certo para
arquivo copiado e para arquivo ainda não copiado** — então a troca das 700 URLs
deixa de precisar esperar a cópia terminar. Sem o fallback, trocar antes de
copiar quebraria o material no intervalo, e a ordem entre os dois passos seria
um ponto de falha.

Custo: o bucket do Supabase continua ocupado (~712 MB de 1 GB). Não custa
egress — depois da cópia completa, nenhuma requisição cai no fallback.

E se o R2 ficar inacessível, o gateway cai no Supabase em vez de derrubar
material que ainda é servível.

## Telemetria

Mesmo bucket, problema diferente: o volume não é egress, é **crescimento
ilimitado por usuário-minuto** dentro dos 500 MB do Postgres.

- **Lote bruto → objeto no R2.** É append-only e nunca sofre `JOIN` — o formato
  serve.
- **Agregado permanece no Postgres principal**, pequeno e `JOIN`ável com
  `aluno`/`topico`, que é o que o pipeline de análise e o console consomem.
- **O segundo projeto Supabase deixa de ser necessário** nesse desenho. Ele tem
  o mesmo teto de 500 MB: mover o bruto para lá adia a parede em vez de remover.

Isso mantém a regra de fronteira do `CLAUDE.md`: gravar lote em bucket não tem
modelo de linguagem no meio.

Não é urgente — a telemetria já foi apagada e as tabelas estão vazias.

## Sequência

1. **Dedup de imagem no deck** — *feito*, em `BrainHexPDF`
   (`deckImageDedup.ts`). Corta 91,4% dos decks grandes na origem, medido em
   arquivo real de produção (8,79 MB → 757 kB). Vale independente do R2: menos
   bytes para migrar.
2. **Gateway + migração dos arquivos** — é o que resolve o 402.
3. **Telemetria no R2.**

## Testes

- **`storage-redirect`:** responde 302, e o `Location` aponta para o R2 com
  assinatura válida; **nunca** devolve corpo de arquivo (é a regressão que
  protege a decisão inteira — proxy acidental reintroduz o custo).
- **Autorização:** aluno matriculado lê; aluno de outra classe recebe 403;
  professor dono lê; anônimo recebe 401.
- **Caminho:** `storage_path` inexistente → 404, sem vazar se o objeto existe
  em outra classe.
- **Mobile:** `resolveSupabaseStorageUrl` com URL de gateway devolve algo que
  `fetch` resolve, e o cache nativo continua acertando dentro da janela de
  assinatura.
- **Migração:** todo `storage_path` referenciado por linha viva existe no R2
  antes do passo 4.
