# Guia de Uso - TrailUp Mobile

## Setup rapido
1. Copiar `.env.example` para `.env`.
2. Preencher:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_APITRAIUP_URL`
3. Instalar dependencias: `npm install`.
4. Rodar: `npm run start`.

## Ambientes comuns
- Android Emulator: usar `http://10.0.2.2:<porta>` para API local.
- iOS Simulator/Web: geralmente `http://localhost:<porta>`.
- Dispositivo fisico: usar IP da maquina na mesma rede.

## Fluxo funcional do aluno
1. Login no Supabase.
2. Abrir trilha e entrar em topico.
3. Consumir conteudo/material.
4. Resolver atividades.
5. Persistir progresso e tempo automaticamente.
6. Enviar telemetria e eventos.

## Validacoes essenciais
- Tempo em `topico_aluno`, `conteudo_aluno`, `atividade_aluno` aumentando durante estudo.
- Eventos em `eventos_aluno` sendo gravados em interacoes de pontuacao.
- Ranking exibido via `vw_rank_posicoes_por_classe`.

## Erros frequentes
- `Network request failed`: URL da API invalida, API fora do ar ou token indisponivel.
- Ranking sem atualizacao: falta de eventos validos ou problema no SQL de rank.
- Midia nao abre: URL expirada, mime incorreto, fallback nao aplicado.
