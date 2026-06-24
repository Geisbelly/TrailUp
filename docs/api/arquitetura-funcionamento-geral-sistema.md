# Arquitetura e Funcionamento Geral (Ecossistema TrailUp)

## Componentes
1. Web Professor (`brainhex-navigator`)
2. API Principal (`ApiTraiUp`)
3. App Mobile (`trailup-app-dsm-2502`)
4. Servico de Midia (`ApiBrainHex`)
5. Supabase (Auth, Postgres, Storage, Realtime)

## Fluxo macro
1. Professor modela classe/topico/conteudo no Web.
2. Web grava no Supabase e enfileira jobs na API.
3. API processa personalizacao por perfil BrainHex/topico.
4. Midia e gerada via ApiBrainHex e anexada em `conteudo_personalizado`.
5. Mobile le personalizacao direto no Supabase, grava progresso e envia eventos/telemetria (API + Supabase).
6. Banco consolida rank por views/triggers.

## Princípios atuais
- Personalizacao de midia com reuso por perfil BrainHex.
- Contrato estavel de consumo para mobile e web.
- Ranking consumido por view oficial, nao por tabela bruta.
- Persistencia de tempo focada em estudo ativo.
