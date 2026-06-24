# Fluxo Completo do Ecossistema

1. Professor cria estrutura pedagogica no Web.
2. Web grava no Supabase.
3. Web aciona jobs na API TrailUp.
4. API processa personalizacao e chama ApiBrainHex para midias.
5. Resultado vai para `conteudo_personalizado`.
6. Mobile consome, persiste progresso e envia telemetria.
7. Banco consolida ranking em views/triggers.
