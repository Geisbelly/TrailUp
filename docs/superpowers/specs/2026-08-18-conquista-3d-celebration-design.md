# Cena 3D de desbloqueio de conquista — Design

**Status:** proposto, aguardando revisão do usuário antes do plano de implementação.

## Motivação

O usuário viu uma prévia do próprio portfólio pessoal (React + Three.js +
React Three Fiber, câmera/objetos/navegação 3D) e quer trazer essa linguagem
visual para o app do aluno (`mobile/`), começando pelo momento de conquista/
rank. A visão final é grande — trilha inteira em 3D temática por perfil
BrainHex, mais animações de vitória/conquista/rank — mas o usuário pediu
explicitamente para começar por um recorte seguro, de baixo risco.

Hoje, o desbloqueio de uma conquista **não tem celebração em tempo real**:

- `useTopicoCompletion.ts` (`handleConcluirTopico`) chama
  `reloadConquistas()` de forma otimista após concluir um tópico, mas nunca
  compara o estado anterior com o novo — não existe detecção de "isso acabou
  de ser desbloqueado".
- `ConquistaModal.tsx` (cartão 2D com moldura ornamental, cores do perfil) só
  é usado em `app/(tabs)/perfil/biblioteca-conquistas.tsx` e
  `app/(tabs)/perfil/index.tsx`, isto é, quando o aluno **revisita** as
  conquistas já conquistadas — nunca no instante em que uma é desbloqueada.

Esse vácuo é o encaixe natural do primeiro slice 3D: um evento pontual, de
baixa frequência, com um "antes" (nada) e "depois" (modal 2D estático) bem
definidos — fácil de comparar visualmente e fácil de reverter/fallback sem
afetar a navegação principal da trilha.

## Fora de escopo (nesta entrega)

- Trilha em 3D (substituir `TrilhaBase`/mapa de nós) — próxima iteração, só
  depois de validar performance real deste slice em campo.
- Animação de subida de rank — mesma cena poderá ser reaproveitada depois,
  mas não nesta entrega.
- Disparo em conclusão de tópico (mais frequente que conquista) — mantém o
  diálogo genérico atual do `useTopicoCompletion.ts` sem mudanças.
- Interação do aluno com a cena (arrastar para girar câmera, tocar em
  objetos). A cena é uma animação passiva (entrada de câmera → revelação do
  ícone → saída), sem gestos — reduz risco de acessibilidade/gesto conflitando
  com o modal e mantém o escopo pequeno.

## Arquitetura

### 1. Detecção do desbloqueio (realtime, não diffing local)

Novo listener Supabase Realtime em `conquistas_aluno`, seguindo o padrão já
usado em `ConquistaRankContext.tsx` para `eventos_aluno`/`classe_aluno`
(mesmo arquivo, canal adicional):

```
supabase.channel(`conquista_unlock_${uid}`)
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'conquistas_aluno',
    filter: `aluno_id=eq.${uid}`,
  }, (payload) => {
    const wasConcluded = Boolean(payload.old?.concluida);
    const isConcluded = Boolean(payload.new?.concluida);
    if (!wasConcluded && isConcluded) { /* enfileira */ }
  })
```

Também escuta `INSERT` com `concluida: true` (conquistas sem estado
intermediário "em progresso" podem nascer já concluídas).

`ConquistaRankContext` ganha:

```ts
conquistasRecemDesbloqueadas: ConquistaDesbloqueio[]; // fila FIFO
consumirProximaConquistaDesbloqueada: () => ConquistaDesbloqueio | null;
```

Isso mantém a fonte da verdade no evento do banco (não em heurística local
sobre o array de conquistas), consistente com o resto do contexto, e funciona
mesmo se o desbloqueio for computado por um trigger/RPC no Supabase sem ação
direta do cliente.

### 2. Novo componente `ConquistaCelebrationOverlay`

Montado em `app/(tabs)/_layout.tsx`, ao lado de `<ToastContainer />` (mesmo
padrão de overlay global dirigido por contexto — fora da árvore de rota, para
aparecer não importa em qual tela o aluno esteja quando o desbloqueio
chegar). Ele:

1. Observa `conquistasRecemDesbloqueadas`; ao receber um item, decide 3D vs
   fallback (ver seção 4) e renderiza um dos dois:
   - `ConquistaScene3D` (novo, ver seção 3), ou
   - o `ConquistaModal` 2D já existente, passando os mesmos dados.
2. Consome a fila (`consumirProximaConquistaDesbloqueada`) processando um
   item por vez — se dois desbloqueios chegarem juntos, o segundo espera o
   primeiro fechar.

### 3. `ConquistaScene3D` — cena 3D

Novas dependências: `three`, `@react-three/fiber` (build nativo), `expo-gl`.
Estrutura:

- `Canvas` do R3F nativo, montado dentro do mesmo `Modal` full-screen que o
  `ConquistaModal` usa hoje (mesmo overlay escurecido, mesmo botão de
  fechar/toque-fora-fecha) — só o conteúdo interno muda de cartão 2D para
  `<Canvas>`.
- Sequência fixa (sem input do aluno): câmera começa afastada/no escuro →
  aproxima do objeto central (ícone da conquista, extrudado/em plano com
  profundidade) → luz pontual acende com a cor-assinatura do perfil BrainHex
  dominante do aluno → leve rotação contínua do objeto → título/descrição
  (texto 2D sobreposto via `View`/`Text` do RN, não texto 3D) fazem fade-in
  depois que a câmera estabiliza.
- Tema por perfil: reaproveita `buildProfileShellPaletteFromAccent` /
  `getProfileShellPalette` (mesmas funções que `ConquistaModal` já usa) para
  cor da luz e do glow — não uma paleta nova.
- Duração curta e fixa (poucos segundos), com botão "Fechar" sempre visível
  (não só no fim da animação) — o aluno nunca fica preso na cena.

### 4. Fallback de acessibilidade e performance

`ConquistaCelebrationOverlay` decide **antes** de montar qualquer coisa 3D
(nunca monta o `Canvas` e cai fora depois — a decisão é prévia):

1. `AccessibilityInfo.isReduceMotionEnabled()` (API nativa do RN, já
   disponível sem dependência nova) → se `true`, sempre usa `ConquistaModal`
   2D. Isso é obrigatório, não uma heurística — segue o padrão mobile-first/
   AAA acessibilidade do projeto.
2. Heurística de device fraco: nova dependência leve `expo-device` (sem GL),
   checando `Device.totalMemory`. Abaixo de um limiar (a definir no plano,
   referência inicial: 3 GB) → também cai para 2D.

Ambas as checagens rodam uma vez (memoizadas), não a cada desbloqueio.

## Dados e contratos

`ConquistaDesbloqueio` (novo tipo, em `models/Conquista.ts` ou arquivo
irmão): `{ conquista: Conquista; desbloqueadaEm: string }` — reaproveita a
classe `Conquista` existente, sem duplicar campos.

Nenhuma migração de schema Supabase é necessária — a tabela `conquistas_aluno`
já tem a coluna `concluida` que o realtime payload compara.

## Testes

- Unit: função pura que decide 3D vs fallback dado
  `{ reduceMotionEnabled, totalMemory }` — tabela de casos.
- Unit: parser do payload realtime (`wasConcluded`/`isConcluded` →
  enfileira ou não), incluindo o caso `INSERT` já concluído.
- Manual (checklist no PR, já que é uma cena visual/GL): desbloqueio real em
  device físico Android de entrada (valida fallback por memória) e com
  "reduzir movimento" ativado no sistema (valida fallback de acessibilidade).

## Riscos conhecidos

- **Bundle size / tempo de build nativo**: `expo-gl` + `three` + R3F nativo
  exigem rebuild do dev client (`expo-dev-client` já está no projeto, mas o
  binário atual não tem os módulos nativos novos) — primeira build local após
  esta mudança será mais lenta e exige `expo run:android`/`expo run:ios`
  antes de `expo start` funcionar com a cena.
- **Realtime duplicado**: se o cliente também disparar `registrarEvento`
  otimisticamente para o mesmo desbloqueio, há risco de dois listeners
  reagindo ao mesmo evento. Mitigar deduplicando por `conquista_id` na fila
  (um item por `conquista_id` até ser consumido).
