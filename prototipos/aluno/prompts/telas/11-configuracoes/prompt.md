Última tela da mesma área: **Configurações**.

Mantenha a paleta do perfil ativo. Ao contrário das outras, esta é claramente uma tela de "utilidade" — pode (e deve) ser visualmente mais discreta/neutra que Trilha, Ranking ou Perfil.

## O que ela faz

Hub de configurações da conta e da experiência, com busca. Reúne várias telas pequenas hoje espalhadas em rotas separadas — proponha como elas se encaixam melhor numa tela larga (ex.: menu + painel de detalhe lado a lado, em vez de navegação em cascata como no mobile).

## Conteúdo real de hoje — o hub (`settings.tsx`)

Uma lista com campo de busca, agrupada em três blocos:

- **Privacidade e termos:** Coleta e acessos · Solicitar exclusão da conta · Gerar relatório dos dados (tela anterior) · Política de privacidade · Termos de uso.
- **Tutorial e informações do app:** Rever tutorial inicial · Informações do app · Versão.
- **Segurança:** Resetar senha.

Também tem, fora dos blocos: **Informações** (pessoais), **Estilo das métricas**, **Lembrete diário**, e a ação de **sair deste aparelho** (logout, com confirmação — "Você saiu deste aparelho" após concluir).

## Conteúdo real de hoje — as telas de detalhe (todas simples, descreva como painel/seção, não precisa uma tela cheia por item)

- **Informações pessoais** — dados cadastrais do aluno.
- **Coleta e acessos** — 4 toggles: **Câmera** (captura comportamental durante o estudo), **Uso e navegação**, **Desempenho acadêmico**, **Chat com a IA** — cada um mostra também o status de permissão do aparelho quando relevante (ex.: câmera negada no navegador).
- **Lembrete diário** — ativar/desativar + horário do lembrete de estudo (é uma notificação local do aparelho, não depende do app estar aberto).
- **Estilo das métricas** — escolher entre "Automático" ou um estilo fixo de exibição das métricas de progresso.
- **Aparência** — preferência de tema.
- **Preferências de notificação.**
- **Resetar senha** — trocar senha estando logado.
- **Solicitar exclusão da conta** — ação destrutiva, precisa de confirmação clara.
- **Informações do app / Versão** — dados institucionais, baixa prioridade visual.
- **"Estudos"** (`study.tsx`) — hoje é majoritariamente placeholder ("em breve"), com uma lista estática de preferências ainda não editáveis (Matérias, Prioridades, Objetivo, Velocidade...). Pode representar como um estado "em construção" honesto, não precisa fingir que é interativo.

## Estados

- **Toggle salvando** (feedback rápido de "salvo"/"ativo"/"desativado").
- **Erro ao salvar** (ex.: lembrete diário — "Não foi possível salvar").
- **Confirmação de ação destrutiva** (excluir conta, sair do aparelho).

## O que peço

Desenhe o hub de Configurações (lista com busca, 3 blocos) e o painel de detalhe de **Coleta e acessos** (os 4 toggles) como exemplo de como um item de detalhe deve se comportar em tela larga. Deixe claro visualmente qual bloco é sobre privacidade (mais sério, precisa de confiança) versus o que é só preferência de conveniência.
