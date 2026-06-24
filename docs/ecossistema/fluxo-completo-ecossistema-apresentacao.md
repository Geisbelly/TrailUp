# TrailUp - Fluxo Completo (Apresentação)

Atualizado em: 2026-04-13

## 1) Arquitetura ponta a ponta

```mermaid
flowchart LR
  WEB[Web Professor] --> DB[(Supabase DB)]
  WEB --> API[API FastAPI]
  WEB --> EF[Edge Functions]

  API --> DB
  API --> ST[(Storage)]

  MOB[Mobile Aluno] --> DB
  MOB --> API

  DB --> RT[(Realtime)]
  RT --> MOB
```

## 2) Fluxo de personalização por aluno

```mermaid
sequenceDiagram
  participant W as Web
  participant A as API
  participant D as Supabase
  participant M as Mobile

  W->>D: Atualiza estrutura pedagogica
  W->>A: POST /personalizar/jobs/class-delta
  A->>D: Cria job + targets
  A->>D: Processa target aluno x topico
  alt source_hash igual
    A->>D: target = skipped
  else source_hash mudou
    A->>D: INSERT cards/atividades/questoes personalizadas
    A->>D: Upload artefatos (pdf/docx/pptx/mp3/roteiro)
    A->>D: UPSERT conteudo_personalizado (compatibilidade)
    A->>D: UPSERT personalizacao_item_progresso
  end
  M->>D: Le conteudo_personalizado
  D-->>M: Update via realtime
```

## 3) Pipeline de geração do personalizado

```mermaid
flowchart TD
  I[Estado: aluno + classe + topico] --> C[Carrega contexto + fontes]
  C --> H[Calcula source_hash]
  H --> D{Mudou?}
  D -- Nao --> S[Reaproveita e marca skipped]
  D -- Sim --> P[Gera plano]
  P --> AP[Gera ai_patch]
  AP --> M[Gera materiais]
  M --> U[Upload de artefatos]
  U --> R[Persistencia canonica]
```

## 4) Telemetria (normal e fallback)

```mermaid
sequenceDiagram
  participant M as Mobile
  participant A as API /telemetria/lotes
  participant D as Supabase

  M->>A: Envia lote
  alt API disponivel
    A->>D: Persiste sessao/lote/eventos/metrics
  else API indisponivel
    M->>D: Fallback direto em tabelas telemetria_*
  end
```

## Notas executivas

- Personalização e pre-gerada por job assíncrono (não em tempo de abertura da tela).
- Reprocessamento e evitado quando `source_hash` não muda.
- Mobile consome estado canônico do banco e atualiza via realtime.
- `questoes.nota_estabelecida` e opcional (`NULL` = sem nota definida).



## Atualizacoes (2026-04-13)

- Console do professor passou a validar upload com lista fixa de formatos (pdf, doc, docx, ppt, pptx, txt, md, mp3, wav, ogg, mp4, webm, mov) e limite de 200 MB.
- Midia de questoes aceita apenas image/video/audio/pdf.
- Web envia `personalizacaoThemeGuide` (paleta + tom por perfil) para a Edge Function `generate-content-ai`.
- Edge Function inclui um guia de tema e tom no prompt de IA, alinhando a geracao com o tema do mobile.
