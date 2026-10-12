Item 6: **subtelas das Configurações**. Arquivo: `v4/11-configuracoes.html`. Hoje a lista da esquerda existe, mas só "Coleta e acessos" tem conteúdo.

## Regra
Clicar numa linha da esquerda marca a linha como ativa e troca o painel da direita (cabeçalho com eyebrow do grupo, título e descrição, mais o conteúdo). A troca vai para a URL (`?sub=`). O seletor de estado ganha uma opção por subtela.

## Textos do app (`mobile/src/app/(tabs)/perfil/*.tsx`)
- **Informações pessoais** (`info.tsx`)
  - Seu perfil: Trocar foto · Trocar banner.
  - Campos Nome, Apelido, Email (só leitura) e Descrição ("Como você gosta de aprender, interesses, objetivos...").
  - Modo de operação e Modo de resposta (padrão "imediato").
  - "Salvar alterações" / "Salvando...". Sucesso: "Perfil atualizado". Validação: "Informe seu nome.".
- **Resetar senha** (`resetar-senha.tsx`)
  - Título "Redefinir senha" e o texto "Enviaremos um e-mail com as instruções para redefinir sua senha. Verifique sua caixa de entrada e siga o link recebido."
  - Campo "E-mail da conta".
  - Passos:
    1. Clique em "Solicitar alteração".
    2. Abra o e-mail enviado e clique no link de redefinição.
    3. Defina sua nova senha.
  - Botão "Solicitar alteração", depois o diálogo "Confirmar solicitação".
  - Resultado "E-mail enviado": "Se o e-mail estiver correto, você receberá um link para redefinir a senha. Verifique sua caixa de entrada ou spam."
- **Política de privacidade**: abre o link externo. Erro: "Não foi possível abrir a política de privacidade.".
- **Solicitar exclusão da conta** (`excluir.tsx`)
  - Texto "Informe o motivo e confirmaremos a exclusão dos seus dados. Você receberá um e-mail para prosseguir."
  - Campo "Motivo" ("Descreva brevemente o motivo").
  - Botão "Enviar solicitação" / "Enviando...".
  - Sucesso "Solicitação enviada": "Registramos seu pedido de exclusão. Um e-mail de confirmação será enviado.".
- **Lembrete diário** (`lembrete-diario.tsx`)
  - Texto "Escolha o horário em que o TrailUp te avisa para continuar a trilha. Funciona mesmo com o app fechado (no navegador, só quando o app está aberto)."
  - Interruptor "Lembrete diário": "Avisa todo dia às 19:00" ou "Desativado".
  - Horário em pílulas: 07, 08, 12, 18, 19, 20, 21, 22h (padrão 19h).
  - Erro: "Não foi possível salvar" · "Tente novamente em instantes.".
- **Aparência** (`appearance.tsx`)
  - Texto "Personalize a aparência do aplicativo."
  - Perfil: Automático · Animações: Ativadas · Tamanho da fonte: Padrão.
  - "Mais opções de aparência estarão disponíveis em breve."
- **Estilo das métricas** (`metricas-estilo.tsx`, `utils/profileMetricThemes.ts`)
  - Eyebrow "PERSONALIZAÇÃO VISUAL" e título "Visualização das métricas".
  - Opções em cards com check:
    - Automático: "Usa o perfil BrainHex dominante para escolher o visual mais adequado.";
    - Arena Tática: "HUD competitivo com operação, ritmo, rank e status de missão.";
    - Metas: "Painel focado em marcos, checklist, progresso e próximos objetivos.";
    - Mistério: "Transforma progresso em mapa, pistas, descobertas e exploração.";
    - Painel Analítico: "Leitura clara e direta do desempenho, atenção e evolução do aluno.";
    - Squad: "Destaque para presença, ranking, conquistas e energia de grupo.".
  - Notas:
    - "Automático acompanha o perfil BrainHex ativo. Escolher outro estilo fixa aquela visualização neste aparelho até você mudar novamente."
    - "Esta configuração altera apenas a aparência e a organização do painel. Seus valores, progresso e histórico permanecem iguais."
- **Rever tutorial inicial**: aviso "Tutorial reiniciado", "Ele aparece de novo na próxima vez que você abrir a Trilha." Liga com o item 7.
- **Informações do app** (`info-app.tsx`, `info-versao.tsx`)
  - Texto "TrailUp ajuda você a acompanhar sua trilha de aprendizado, módulos, atividades e conquistas em um só lugar."
  - Nome, Descrição ("Plataforma para gerenciar trilhas, módulos, conteúdos e gamificação (ranking, eventos e conquistas).") e Autor / Organização (BitStudioLabs).
  - Versão 1.0.4 e Versão do build.
- **Sair deste aparelho**: aviso "Você saiu deste aparelho", depois leva a `00-entrada.html`.

## Aceite
- [ ] Cada linha abre sua subtela no painel da direita, com os textos acima.
- [ ] Formulários com sucesso e erro; o lembrete e o estilo das métricas mudam ao clicar.
