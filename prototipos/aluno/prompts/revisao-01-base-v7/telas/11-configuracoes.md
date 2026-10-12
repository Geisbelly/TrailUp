Tela 11 — **Configurações** (hub + painéis de detalhe). Arquivo de saída: `v2/11-configuracoes.html`.

Shell completo, item ativo **Perfil**. Perfil de exemplo: Conqueror. É uma tela **utilitária**: mais sóbria que Trilha, Ranking e Perfil. Sem cenário nem brilho. No app, cada item abre uma rota nova (navegação em cascata). Na web vira **menu à esquerda + painel à direita**, com uma âncora por item (`#coleta`, `#lembrete`...).

## 1. Fonte da verdade
- Hub: `mobile/src/app/(tabs)/perfil/settings.tsx`.
- Detalhes: `perfil/info.tsx`, `metricas-estilo.tsx` (+ `utils/profileMetricThemes.ts`), `lembrete-diario.tsx`, `coleta-dados.tsx`, `excluir.tsx`, `relatorio.tsx` (tela 10), `info-app.tsx`, `info-versao.tsx`, `resetar-senha.tsx`.
- **Fora do escopo:** `perfil/appearance.tsx`, `notifications.tsx` e `study.tsx` existem como rotas, mas **nenhum item do hub leva a elas** (são placeholders órfãos, com valores fixos). Não entram no menu.

## 2. Estrutura real do hub (4 grupos, nesta ordem) + Sair
| Grupo | Itens |
|---|---|
| **Conta, métricas e coleta** | Informações · Estilo das métricas: Arena Tática · Lembrete diário · Coleta e acessos · Solicitar exclusão da conta · Gerar relatório dos dados |
| **Privacidade e termos** | Política de privacidade ↗ · Termos de uso ↗ (links externos) |
| **Tutorial e informações do app** | Rever tutorial inicial · Informações do app · Versão |
| **Segurança** | Resetar senha |
| — | **Sair** |

Textos de apoio de cada grupo (do guia da tela):
- Conta: "Sua conta reúne informações pessoais, a visualização das métricas, os controles de câmera, uso, desempenho e chat, além da exclusão e do relatório dos dados."
- Privacidade: "Consulte aqui a política de privacidade e os termos que explicam o tratamento dos dados e as condições de uso da plataforma."
- Tutorial: "Você pode reiniciar este tutorial, consultar informações do aplicativo e verificar a versão instalada."
- Segurança: "A área de segurança permite redefinir sua senha. O botão Sair encerra somente a sessão atual."

## 3. Grade (main de 1096px)
```
[seletor]
┌ cabeçalho: ← Perfil / eyebrow / H1 ─────────────────────────────────────────────────┐
┌ menu (4/12 = 355, sticky) ─────┐ ┌ painel do item (8/12 = 721) ──────────────────────┐
│ [🔍 Buscar configuração]        │ │ título do item + descrição                         │
│ CONTA, MÉTRICAS E COLETA        │ │ conteúdo do item                                   │
│  • Informações                  │ │                                                    │
│  • Estilo das métricas          │ │                                                    │
│  ...                            │ │                                                    │
│ ─────────                       │ │                                                    │
│ [Sair]                          │ │                                                    │
└─────────────────────────────────┘ └────────────────────────────────────────────────────┘
```

## 4. Menu (card `padding: 16px`, sticky `top: 108px`)
- Busca no topo: input com lupa, placeholder "Buscar configuração", filtra itens pelo rótulo (a lógica é a do app: `label.includes(busca)`). Sem resultado: "Nenhuma configuração encontrada." (12.5 `textSubtle`).
- Rótulo de grupo: eyebrow `inactive` com `margin: 18px 10px 8px` (o primeiro sem margem acima).
- Item: linha de 44px, `padding: 0 12px`, raio 12, ícone 18 + rótulo Inter 500 14 `text`. Valor atual à direita, 12 `textSubtle` ("Arena Tática", "19:00", "Ativo"). Externo: ícone ↗ 12. Ativo: fundo `accentMuted`, ícone e texto `accent`, `aria-current="page"`.
- **Distinção de seriedade:** os itens de **privacidade e dados** (Coleta e acessos, Gerar relatório, Política, Termos) levam um ícone de escudo 18. Os de **conveniência** (Estilo das métricas, Lembrete, Tutorial) levam ícones neutros. "Solicitar exclusão da conta" tem ícone e texto em `danger-text`.
- Pé: divisor `var(--line)` e botão destrutivo contorno largura 100% **"Sair"** (ícone porta).

## 5. Painéis (um por item). Cabeçalho de painel: H2 Cinzel 700 22 + descrição 14 `textMuted`, `margin-bottom: 22px`

### 5.1 Informações (`#informacoes`, `info.tsx`)
- Faixa de banner 720×140 (raio 16, imagem `world-conqueror.webp` a 50%) com a foto 96 emoldurada sobreposta na borda inferior esquerda. Botões secundários pequenos **"Trocar foto"** e **"Trocar banner"**.
- Formulário em grid de 2 colunas (gap 20): **Nome** · **Apelido** · **Email** (desabilitado, opacidade .6, ajuda "O e-mail é o da sua conta e não pode ser alterado aqui.") · **Modo de operação** (somente leitura, valor vindo da turma).
- **Descrição** (largura total, textarea 110px), placeholder **"Como você gosta de aprender, interesses, objetivos..."**
- **Modo de resposta** (largura total): dois cartões de rádio lado a lado (altura 72, raio 16, `role="radio"`): **"Imediato"** (ícone raio) e **"Pensante"** (ícone cérebro). Ajuda: **"Imediato mostra o gabarito na hora; Pensante esconde e libera quando você quiser ver."**
- Rodapé: primário **"Salvar alterações"**. Sucesso: toast `success` **"Perfil atualizado"** / "Suas preferências de estudo foram salvas e já entram no próximo ciclo do app." (o app escreve sem acentos; corrija). Erros: "Informe seu nome." (no campo), toast "Não foi possível salvar agora.", "Não foi possível enviar a imagem agora.", "Upload concluído" / "Imagem atualizada com sucesso."

### 5.2 Estilo das métricas (`#metricas`, `metricas-estilo.tsx`)
H2 **"Visualização das métricas"**, descrição **"Automático acompanha o perfil BrainHex ativo. Escolher outro estilo fixa aquela visualização neste aparelho até você mudar novamente."** Grade de 2 colunas de cartões de opção (altura 104, raio 16, `padding: 16px 18px`, `role="radio"`), com ícone 22 + rótulo Inter 700 15 + descrição 12.5:
- **Automático**: "Usa o perfil BrainHex dominante para escolher o visual mais adequado." (selo "Arena Tática para Conqueror")
- **Arena Tática**: "HUD competitivo com operação, ritmo, rank e status de missão."
- **Metas**: "Painel focado em marcos, checklist, progresso e próximos objetivos."
- **Mistério**: "Transforma progresso em mapa, pistas, descobertas e exploração."
- **Painel Analítico**: "Leitura clara e direta do desempenho, atenção e evolução do aluno."
- **Squad**: "Destaque para presença, ranking, conquistas e energia de grupo."
Selecionado: borda 2px `accent`, fundo `accentMuted`, check. Nota `info-bg` no pé: **"Esta configuração altera apenas a aparência e a organização do painel. Seus valores, progresso e histórico permanecem iguais."**

### 5.3 Lembrete diário (`#lembrete`, `lembrete-diario.tsx`)
- Card-linha grande (altura 84): ícone sino 24 em quadrado 48 `accentMuted` + "Lembrete diário" (Inter 700 16) + estado **"Avisa todo dia às 19:00"** ou **"Desativado"** (13 `textSubtle`) + toggle (§7.3 do mestre, `aria-label="Lembrete diário"`).
- Horário: rótulo "Horário" e chips de hora (grade de 8, cada um 64×40, raio 999, Inter 700 13 tabular): **07:00 · 08:00 · 12:00 · 18:00 · 19:00 · 20:00 · 21:00 · 22:00**. Selecionado: fundo `accent`, texto `background`. Desabilitados (opacidade .45) com o lembrete desligado.
- Nota 12.5 `textSubtle`: "O lembrete é uma notificação do aparelho: chega mesmo com o TrailUp fechado." (proposto; no app ele é agendado localmente). Na web, se o navegador não tiver permissão de notificação: faixa `warning` "Seu navegador está bloqueando notificações do TrailUp." com o botão "Permitir".
- Estados: salvando (spinner 14 ao lado do toggle, "Salvando..."), erro com toast `danger` **"Não foi possível salvar"** / **"Tente novamente em instantes."** e o toggle volta ao estado anterior.

### 5.4 Coleta e acessos (`#coleta`, `coleta-dados.tsx`): **bloco de privacidade, tratamento mais sério**
- Cabeçalho do painel com escudo 20 `accent` antes do H2 **"Coleta e acessos"**. Descrição: "Você decide o que o TrailUp registra. Desligar uma coleta não apaga o que já foi registrado." (proposto; a segunda frase precisa de validação com o time).
- 4 linhas-toggle (card, cada linha `padding: 18px 20px`, divisor `var(--line)`): ícone 20 em quadrado 40, título Inter 700 15, descrição curta 13 `textMuted`, descrição longa 12.5 `textSubtle` (expansível por "Saiba mais"), toggle + rótulo "Ativo"/"Desativado":
  1. **Câmera**: "Permite captura de frames para análise de atenção durante o estudo." Sub-bloco **"Permissão do aparelho"** → na web "Permissão do navegador": chip de estado (**Permitida** `success` / **Negada** `danger` / **não definida** neutro / **indisponível** neutro) + texto "A coleta por câmera só funciona quando o controle acima está Ativo e a permissão do navegador está Permitida." (no app: "Este estado vem do Android...").
  2. **Uso e navegação**: "Coleta sessões, navegação e interações para métricas de engajamento." Longa: "Controla o registro de sessões, páginas visitadas e interações usado para calcular engajamento, continuidade e tempo de uso."
  3. **Desempenho acadêmico**: "Coleta tentativas, acertos e evolução em questões e atividades." Longa: "Controla o registro de tentativas, acertos e evolução nas atividades. Essas informações alimentam as métricas de aprendizagem."
  4. **Chat com a IA**: "Coleta abertura, mensagens e contexto de uso do mentor." (`aria-label="Ativar ou desativar o chat"`).
- Estado de exemplo: Câmera **Desativado** (permissão "não definida"), os outros três **Ativo**.
- Retorno: ao alternar, o rótulo muda na hora e aparece "Salvo" (12 `success` com check, some em 2s).

### 5.5 Gerar relatório dos dados
Não abre painel: leva a `10-relatorio-dados.html`.

### 5.6 Solicitar exclusão da conta (`#excluir`, `excluir.tsx`): **destrutivo**
Card com `border-left: 4px solid danger` (padrão "Zona de perigo" do V7). H2 em `danger-text` com ícone de alerta: **"Solicitar exclusão da conta"**. Texto 14 `textMuted`: "Seu pedido é registrado e a equipe confirma por e-mail antes de apagar qualquer dado. Seu progresso, pontos, conquistas e histórico serão removidos." (proposto: o app só mostra o formulário).
- Campo **"Motivo"** (textarea 110px), placeholder **"Descreva brevemente o motivo"** (opcional; vazio vira "Não informado").
- Botão destrutivo contorno **"Enviar solicitação"** → abre o modal P destrutivo (padrão V7 "Excluir a sua conta"): título "Solicitar exclusão da conta", lista do que será removido (linhas `surfaceElevated` com ponto `danger`: "sua participação em 3 turmas", "1.240 pontos e 6 conquistas", "todo o material personalizado para você"), confirmação digitando **EXCLUIR** (input com borda `danger` quando preenchido), botões **"Manter minha conta"** (secundário) e **"Enviar solicitação"** (destrutivo sólido, desabilitado até digitar).
- Sucesso: o painel vira card `success-bg`: **"Solicitação enviada"** / **"Registramos seu pedido de exclusão. Um e-mail de confirmação será enviado."** Erro: **"Não foi possível registrar sua solicitação agora."** + "Tentar novamente".

### 5.7 Política de privacidade / Termos de uso
Abrem em nova aba. Erro: toast "Não foi possível abrir a política de privacidade." / "Não foi possível abrir os termos de uso."

### 5.8 Rever tutorial inicial
Ação direta (sem painel): toast `success` **"Tutorial reiniciado"** / "Ele aparece de novo na próxima vez que você abrir a Trilha." (corrija os acentos do app). Erro: "Não foi possível reiniciar o tutorial agora."

### 5.9 Informações do app (`#info-app`) e Versão (`#versao`): baixa prioridade visual
- Informações do app: H2 **"Informações do app"**, texto "TrailUp ajuda você a acompanhar sua trilha de aprendizado, módulos, atividades e conquistas em um só lugar. Aqui estão alguns detalhes técnicos e de produto." Tabela de 2 colunas (rótulo 12 `textSubtle` caixa alta / valor 14): **Nome** TrailUp · **Descrição** "Plataforma mobile para gerenciar trilhas, módulos, conteúdos e gamificação (ranking, eventos e conquistas)." · **Autor / Organização** BitStudioLabs.
- Versão: H2 **"Informação de versão"**: **Versão** 1.0.0 · **Versão do build** web-2026.09.24 · **Dependências principais** (lista em fonte monoespaçada 12.5: expo, react-native, expo-router, supabase-js).

### 5.10 Resetar senha (`#senha`, `resetar-senha.tsx`), grupo Segurança
H2 **"Redefinir senha"**, texto **"Enviaremos um e-mail com as instruções para redefinir sua senha. Verifique sua caixa de entrada e siga o link recebido."** Card **"E-mail da conta"**: livia.moraes@escola.com. Card **"Passos"** com lista numerada: "1. Clique em "Solicitar alteração"." · "2. Abra o e-mail enviado e clique no link de redefinição." · "3. Defina sua nova senha na página do Supabase." (sugira trocar "página do Supabase" por "página segura do TrailUp": o aluno não sabe o que é Supabase). Botão primário **"Solicitar alteração"** → modal P de confirmação ("Confirmar" / "Cancelar") → toast **"E-mail enviado"**. Erros: "Não foi possível localizar o e-mail da conta." / "Não foi possível solicitar a troca de senha agora."

### 5.11 Sair
Modal P: título "Sair deste aparelho?", corpo "Você precisará entrar de novo com e-mail e senha.", botões "Cancelar" · **"Sair"** (destrutivo sólido). Depois: toast **"Você saiu deste aparelho"** e volta para `01-login.html`. Aviso quando o servidor não respondeu: toast `warning` **"Aviso"** / **"Não deu para avisar o servidor, então a sua sessão pode continuar aberta em outros aparelhos."**

## 6. Estados (seletor)
"Informações" · "Estilo das métricas" · "Lembrete diário" · "Lembrete desativado" · "Lembrete: erro ao salvar" · "Coleta e acessos" · "Câmera: permissão negada" · "Excluir conta" · "Excluir: confirmação" · "Excluir: enviada" · "Resetar senha" · "Informações do app" · "Versão" · "Busca sem resultado" · "Sair: confirmação"
Padrão ao abrir: **Coleta e acessos**, que é o exemplo pedido na issue #219.

## 7. Não fazer
- Não pôr no menu Aparência, Notificações nem Estudos (rotas órfãs).
- Não usar toggle sem rótulo de estado textual.
- Não deixar "Solicitar exclusão" com o mesmo peso visual dos outros itens.

## 8. Aceite
- [ ] Menu com os 4 grupos reais, busca, valores atuais à direita e o Sair no pé.
- [ ] Privacidade visualmente mais séria (escudo, texto longo, estado da permissão) que as preferências.
- [ ] Os painéis dos 10 itens, cada um com âncora própria.
- [ ] Exclusão com confirmação digitada e retorno claro.
