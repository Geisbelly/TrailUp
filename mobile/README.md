# TrailUp Mobile

Aplicativo do aluno (Expo + React Native) no ecossistema TrailUp.

## Papel no sistema
- Autenticacao do aluno no Supabase.
- Consumo da trilha, conteudos, atividades e personalizacao.
- Persistencia de progresso (`topico_aluno`, `conteudo_aluno`, `atividade_aluno`).
- Envio de telemetria para `ApiTraiUp`.
- Renderizacao de materiais multimidia (markdown, audio, video, pdf, docx, pptx).

## Estado atual (2026-04-19)
- Ranking deve ser consumido pela view `vw_rank_posicoes_por_classe`.
- Tempo de estudo e persistido no fluxo de topico/conteudo/atividade e agregado no resumo de classe.
- Eventos de progresso usam `eventos_aluno` como base para pontuacao/rank no banco.
- Fluxo personalizado usa materiais de `conteudo_personalizado.materiais` com fallback para estrutura academica padrao.
- Perfis BrainHex controlam tema visual e guia em varias telas.

## Stack
- Expo 54 / React Native 0.81 / TypeScript strict
- Expo Router
- Supabase JS
- React Native PDF + parsers de DOCX/PPTX

## Estrutura
```text
src/
  app/                rotas
  components/         UI e viewers
  context/            sessao, trilha, IA, metricas, ranking
  models/             acesso a dados no Supabase
  services/           APIs externas (personalizacao/telemetria)
  utils/              normalizacao e parsing
  assets/             imagens e recursos
```

## Variaveis de ambiente
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_APITRAIUP_URL`

## Comandos
```bash
npm install
npm run start
npm run android
npm run ios
npm run web
npm run lint
```

## Diagnostico rapido
Erro repetido `TypeError: Network request failed` geralmente indica:
- `EXPO_PUBLIC_APITRAIUP_URL` invalida para o ambiente atual (emulador x dispositivo fisico).
- indisponibilidade da API.
- token de sessao indisponivel no momento da chamada.

## Documentacao
Indice oficial em `docs/README.md`.

## Documentos novos
- docs/arquitetura-microservico-e-app.md
- docs/funcionamento-personalizacao-gamificacao-recursos-pedagogicos.md
- docs/README.md

## Documentacao detalhada (arquitetura separada)
- docs/arquitetura-app-detalhada.md
- docs/arquitetura-microservico-detalhada.md
- docs/funcionamento-personalizacao-gamificacao-recursos-pedagogicos-detalhado.md

## Pacote TCC
- docs/tcc/README.md
