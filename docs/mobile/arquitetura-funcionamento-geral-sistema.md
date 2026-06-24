# Arquitetura e Funcionamento Geral (Ecossistema TrailUp)

## Componentes
- Web Professor: cria e mantem estrutura pedagogica.
- API TrailUp: orquestra personalizacao e telemetria.
- ApiBrainHex: gera midias por perfil BrainHex.
- Mobile: experiencia do aluno e persistencia de progresso.
- Supabase: auth, banco e storage.

## Fluxo para o aluno
1. Login no app.
2. Carregamento da trilha da classe.
3. Consumo de conteudo padrao e personalizado.
4. Persistencia de tempo/progresso por topico/conteudo/atividade.
5. Envio de eventos/telemetria para analise adaptativa.
6. Exibicao de rank consolidado por view SQL.

## Decisoes atuais
- Modo personalizado com materiais de `conteudo_personalizado.materiais`.
- Fallback robusto para formatos de midia.
- Tempo de estudo contabilizado no contexto ativo do topico.
