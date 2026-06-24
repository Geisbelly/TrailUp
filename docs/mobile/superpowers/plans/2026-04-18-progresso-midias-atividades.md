# Progresso, Persistência, Mídias e Atividades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir race condition de progresso/persistência, renderização nativa de markdown com paginação, controles de seek no vídeo, atividades sem resposta pré-preenchida, e cards com mídia.

**Architecture:** Seis correções em ordem de dependência: TrilhaContext (base de estado) → MarkdownBlock nativo → QuestionActivity reviewMode → StudyCardsBlock mídia → VideoPlayer seek → Roteamento PDF→Markdown no ContentRenderer.

**Tech Stack:** React Native (Expo ~53), expo-av ~16.0.7, react-native-markdown-display (instalar), Supabase realtime

---

## Mapa de Arquivos

| Arquivo | Mudança |
|---|---|
| `src/context/TrilhaContext.tsx` | Atualização local antes do upsert; remover round-trip de `atualizarProgressoClasse`; debounce RT |
| `src/components/MarkdownBlock.tsx` | Substituir WebContentFrame por react-native-markdown-display + paginação |
| `src/components/QuestionActivity.tsx` | Adicionar prop `reviewMode`; bloquear pré-preenchimento fora do modo revisão |
| `src/components/ActivityRenderer.tsx` | Adicionar prop `reviewMode`; tela de resumo para atividade concluída |
| `src/app/(tabs)/trilha/[id].tsx` | Passar `reviewMode` para ActivityRenderer |
| `src/components/StudyCardsBlock.tsx` | Renderizar mídia (imagem, áudio, vídeo, documento) no verso do card |
| `src/components/funcionais/VideoPlayer.tsx` | Seek bar customizada + botões ±10s via ref expo-av |
| `src/components/ContentRenderer.tsx` | Rotear tipo `pdf` para MarkdownBlock quando payload tem texto |

---

## Task 1: TrilhaContext — Local-first + debounce RT

**Files:**
- Modify: `src/context/TrilhaContext.tsx`

- [ ] **Step 1: Adicionar ref de debounce para subscription RT**

Em `TrilhaContext.tsx`, logo após a linha `const mediaGenerationRetryRef = useRef...` (~linha 769), adicionar:

```tsx
const rtDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 2: Debouncar o subscription `rt_trilha`**

Localizar o `useEffect` com `supabase.channel('rt_trilha')` (~linha 1256). Substituir todas as ocorrências de `() => fetchGraphData()` por:

```tsx
() => {
  if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
  rtDebounceRef.current = setTimeout(() => void fetchGraphData(), 2000)
}
```

O bloco do channel passa a ser:

```tsx
channel = supabase
  .channel('rt_trilha')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'conteudo_aluno', filter: `aluno_id=eq.${userId}` },
    () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
      rtDebounceRef.current = setTimeout(() => void fetchGraphData(), 2000)
    }
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'atividade_aluno', filter: `aluno_id=eq.${userId}` },
    () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
      rtDebounceRef.current = setTimeout(() => void fetchGraphData(), 2000)
    }
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'topico_aluno', filter: `aluno_id=eq.${userId}` },
    () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
      rtDebounceRef.current = setTimeout(() => void fetchGraphData(), 2000)
    }
  )
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'classe_mapa_tema', filter: `classe_id=eq.${classeAtual.classe_id}` },
    () => fetchGraphData()
  )
  .subscribe()
```

- [ ] **Step 3: Remover round-trip de `atualizarProgressoClasse`**

Localizar `atualizarProgressoClasse` (~linha 1361). Substituir o bloco completo da função por:

```tsx
const atualizarProgressoClasse = useCallback(async () => {
  if (!classeAtual) return;
  try {
    const metrics = buildClasseAcademicMetrics(classeAtual)
    const novoResumo = buildClasseResumoFallback(classeAtual, classeAtual.resumo)
    if (!novoResumo) return

    const { error } = await supabase
      .from('classe_aluno')
      .update({
        porcentagemConcluida: novoResumo.porcentagemConcluida ?? metrics.progressPct,
        isComplete: novoResumo.isComplete ?? metrics.isComplete,
        acertosPercentual: novoResumo.acertosPercentual ?? metrics.acertosPercentual,
        tempoGastoMin: novoResumo.tempoGastoMin ?? metrics.tempoTotalMin,
        tempoMedioPorAtividade:
          novoResumo.tempoMedioPorAtividade ?? metrics.tempoMedioPorAtividade,
        atividadesConcluidas:
          novoResumo.atividadesConcluidas ?? metrics.atividadesConcluidasIds,
        updated_at: new Date().toISOString(),
      })
      .eq('aluno_id', classeAtual.aluno_id)
      .eq('classe_id', classeAtual.classe_id);

    if (error) throw error;

    syncClasseLocally(cloneClasse(classeAtual, {
      topicos: [...classeAtual.topicos],
      resumo: novoResumo,
    }));
  } catch (err) {
    console.warn('[TrilhaContext] Erro ao atualizar progresso da classe:', err);
  }
}, [classeAtual, syncClasseLocally]);
```

- [ ] **Step 4: Local-first em `marcarConteudoVisto`**

Substituir o método inteiro (~linha 1457) por:

```tsx
const marcarConteudoVisto = useCallback(async (topicoId: number, conteudoId: number) => {
  if (!classeAtual || !usuario) return;
  try {
    const topico = classeAtual.topicos.find(t => t.id === topicoId);
    if (!topico) throw new Error('Tópico não encontrado');
    const conteudo = topico.conteudos.find(c => c.id === conteudoId);
    if (!conteudo) throw new Error('Conteúdo não encontrado');

    // Atualiza estado local imediatamente (antes do upsert)
    conteudo.status = 'concluido';
    conteudo.percentual_concluido = 100;
    topico.percentual_concluido = topico.calcularPercentual();
    topico.status = topico.calcularStatus();
    syncClasseLocally(cloneClasse(classeAtual, { topicos: [...classeAtual.topicos] }));

    // Persiste no banco
    await conteudo.marcarVisto(usuario.id);
    await topico.atualizarProgresso(usuario.id);
    await atualizarProgressoClasse();

    // Sincronização remota com delay para evitar race com índice do Supabase
    setTimeout(() => void refreshTopico(topicoId), 500);
  } catch (err) {
    console.error('[TrilhaContext] Erro ao marcar conteúdo visto:', err);
    throw err;
  }
}, [classeAtual, usuario, atualizarProgressoClasse, refreshTopico, syncClasseLocally]);
```

- [ ] **Step 5: Local-first em `registrarAtividadeConcluida`**

Substituir o método inteiro (~linha 1479) por:

```tsx
const registrarAtividadeConcluida = useCallback(async (
  topicoId: number,
  atividadeId: number,
  acertosPercentual: number,
  options?: {
    pontuacaoObtida?: number | null
    pontuacaoMaxima?: number | null
    avaliacaoMetadata?: Record<string, unknown> | null
  }
) => {
  if (!classeAtual || !usuario) return;
  try {
    const topico = classeAtual.topicos.find(t => t.id === topicoId);
    if (!topico) throw new Error('Tópico não encontrado');
    const atividade = topico.atividades.find(a => a.id === atividadeId);
    if (!atividade) throw new Error('Atividade não encontrada');

    // Atualiza estado local imediatamente
    atividade.status = 'concluido';
    atividade.percentual_concluido = 100;
    atividade.acertos_percentual = acertosPercentual;
    topico.percentual_concluido = topico.calcularPercentual();
    topico.status = topico.calcularStatus();
    syncClasseLocally(cloneClasse(classeAtual, { topicos: [...classeAtual.topicos] }));

    // Persiste no banco
    await atividade.registrarConclusao(
      usuario.id,
      acertosPercentual,
      undefined,
      options?.pontuacaoObtida ?? null,
      options?.pontuacaoMaxima ?? null,
      options?.avaliacaoMetadata ?? null
    );
    await topico.atualizarProgresso(usuario.id);
    await atualizarProgressoClasse();

    setTimeout(() => void refreshTopico(topicoId), 500);
  } catch (err) {
    console.error('[TrilhaContext] Erro ao registrar atividade:', err);
    throw err;
  }
}, [classeAtual, usuario, atualizarProgressoClasse, refreshTopico, syncClasseLocally]);
```

- [ ] **Step 6: Verificar no app**

Abrir um tópico, concluir um conteúdo. O percentual deve atualizar instantaneamente na barra de progresso sem regredir. Repetir com uma atividade.

- [ ] **Step 7: Commit**

```bash
git add src/context/TrilhaContext.tsx
git commit -m "fix: progresso local-first e debounce RT para eliminar race condition"
```

---

## Task 2: MarkdownBlock — renderização nativa + paginação

**Files:**
- Modify: `src/components/MarkdownBlock.tsx`

- [ ] **Step 1: Instalar react-native-markdown-display**

```bash
npx expo install react-native-markdown-display
```

Verificar que aparece em `package.json` e que `node_modules/react-native-markdown-display` existe.

- [ ] **Step 2: Reescrever MarkdownBlock.tsx**

Substituir o conteúdo completo de `src/components/MarkdownBlock.tsx` por:

```tsx
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";

type Props = {
  payload: any;
  WebView?: React.ComponentType<any> | null;
};

function readString(value: any, ...keys: string[]) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    const current = value[key];
    if (typeof current === "string" && current.trim()) return current.trim();
  }
  return null;
}

function splitByH2(content: string): string[] {
  const parts = content.split(/(?=^##\s)/m);
  return parts.filter((p) => p.trim().length > 0);
}

export function MarkdownBlock({ payload }: Props) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  const inlineMarkdown =
    typeof payload === "string"
      ? payload
      : readString(payload, "markdown", "texto", "conteudo", "text");
  const sourceUrl =
    typeof payload === "object" ? readString(payload, "url", "uri", "src") : null;

  const [markdown, setMarkdown] = useState<string>(inlineMarkdown ?? "");
  const [carregando, setCarregando] = useState(!inlineMarkdown && !!sourceUrl);
  const [erro, setErro] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [markdown]);

  useEffect(() => {
    let ativo = true;
    if (inlineMarkdown) {
      setMarkdown(inlineMarkdown);
      setCarregando(false);
      setErro(null);
      return () => { ativo = false; };
    }
    if (!sourceUrl) {
      setMarkdown("");
      setCarregando(false);
      return () => { ativo = false; };
    }
    setCarregando(true);
    setErro(null);
    fetch(sourceUrl)
      .then((r) => {
        if (!r.ok) throw new Error("Não foi possível carregar o conteúdo.");
        return r.text();
      })
      .then((text) => { if (ativo) setMarkdown(text); })
      .catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : "Falha ao carregar."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [inlineMarkdown, sourceUrl]);

  const pages = useMemo(() => {
    if (!markdown) return [];
    const parts = splitByH2(markdown);
    return parts.length > 1 ? parts : [markdown];
  }, [markdown]);

  const currentPage = pages[pageIndex] ?? "";
  const totalPages = pages.length;

  const mdStyles = useMemo(() => ({
    body: {
      color: palette.text,
      fontFamily: FontFamily.interMedium,
      fontSize: 15,
      lineHeight: 24,
    },
    heading1: {
      color: palette.text,
      fontFamily: FontFamily.interBold ?? FontFamily.interMedium,
      fontSize: 22,
      marginTop: 16,
      marginBottom: 8,
    },
    heading2: {
      color: palette.text,
      fontFamily: FontFamily.interBold ?? FontFamily.interMedium,
      fontSize: 19,
      marginTop: 14,
      marginBottom: 6,
    },
    heading3: {
      color: palette.text,
      fontFamily: FontFamily.interBold ?? FontFamily.interMedium,
      fontSize: 16,
      marginTop: 10,
      marginBottom: 4,
    },
    paragraph: {
      color: palette.textMuted,
      fontSize: 15,
      lineHeight: 24,
      marginBottom: 10,
    },
    code_inline: {
      backgroundColor: palette.surface,
      color: palette.accent,
      borderRadius: 4,
      paddingHorizontal: 4,
    },
    fence: {
      backgroundColor: palette.surface,
      borderRadius: 8,
      padding: 12,
      color: palette.text,
      fontSize: 13,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
      paddingLeft: 12,
      color: palette.textMuted,
    },
    bullet_list_icon: {
      color: palette.accent,
    },
    list_item: {
      color: palette.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    link: {
      color: palette.accent,
    },
    table: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
    },
    th: {
      backgroundColor: palette.surface,
      color: palette.text,
      padding: 8,
    },
    td: {
      color: palette.textMuted,
      padding: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
  }), [palette]);

  if (carregando) {
    return (
      <View style={styles.statusBox}>
        <ActivityIndicator size="small" color={palette.accent} />
        <Text style={[styles.statusText, { color: palette.textMuted }]}>
          Carregando conteúdo...
        </Text>
      </View>
    );
  }

  if (erro && !markdown) {
    return (
      <View style={styles.statusBox}>
        <Text style={[styles.statusText, { color: "#ff9d9d" }]}>{erro}</Text>
      </View>
    );
  }

  if (!currentPage) return null;

  return (
    <View style={styles.wrapper}>
      <Markdown style={mdStyles}>{currentPage}</Markdown>

      {totalPages > 1 && (
        <View style={[styles.pagination, { borderTopColor: palette.border }]}>
          <Pressable
            onPress={() => setPageIndex((i) => Math.max(0, i - 1))}
            disabled={pageIndex === 0}
            style={[
              styles.pageBtn,
              { borderColor: palette.border, opacity: pageIndex === 0 ? 0.3 : 1 },
            ]}
          >
            <Text style={[styles.pageBtnText, { color: palette.text }]}>← Anterior</Text>
          </Pressable>

          <Text style={[styles.pageCounter, { color: palette.textMuted }]}>
            {pageIndex + 1} / {totalPages}
          </Text>

          <Pressable
            onPress={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
            disabled={pageIndex === totalPages - 1}
            style={[
              styles.pageBtn,
              { borderColor: palette.border, opacity: pageIndex === totalPages - 1 ? 0.3 : 1 },
            ]}
          >
            <Text style={[styles.pageBtnText, { color: palette.text }]}>Próximo →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 6,
  },
  statusBox: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  statusText: {
    fontFamily: FontFamily.interMedium,
    textAlign: "center",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  pageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  pageBtnText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
  pageCounter: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
});
```

- [ ] **Step 3: Verificar no app**

Abrir um tópico com conteúdo markdown. O texto deve renderizar integrado (mesma fonte, sem WebView separada). Se o conteúdo tiver `##` headings, deve aparecer a paginação na parte inferior.

- [ ] **Step 4: Commit**

```bash
git add src/components/MarkdownBlock.tsx package.json package-lock.json
git commit -m "feat: MarkdownBlock nativo com react-native-markdown-display e paginação por seções"
```

---

## Task 3: QuestionActivity + ActivityRenderer — reviewMode e fluxo de atividades concluídas

**Files:**
- Modify: `src/components/QuestionActivity.tsx`
- Modify: `src/components/ActivityRenderer.tsx`
- Modify: `src/app/(tabs)/trilha/[id].tsx`

- [ ] **Step 1: Adicionar prop `reviewMode` em QuestionActivity**

Localizar a definição de `Props` no início de `QuestionActivity.tsx` (~linha 17). Adicionar `reviewMode?: boolean` ao tipo:

```tsx
type Props = {
  atividade: any;
  topicoId?: number;
  initialQuestionIndex?: number;
  onQuestionIndexChange?: (questionIndex: number) => void;
  timedOut?: boolean;
  reviewMode?: boolean;
  onComplete?: (result?: { ... }) => void;
};
```

- [ ] **Step 2: Desestruturar `reviewMode` na função**

Localizar onde os props são desestruturados (~linha 400):

```tsx
}: Props) {
```

Adicionar `reviewMode = false` na desestruturação:

```tsx
  reviewMode = false,
}: Props) {
```

- [ ] **Step 3: Proteger o useEffect de pré-preenchimento**

Localizar o `useEffect` que usa `respondidaAntes` (~linha 523, logo após `const respondidaAntes = useMemo`):

```tsx
useEffect(() => {
    if (respondidaAntes && atividadeConcluidaPersistida) {
      setConfirmados((prev) => ({ ...prev, [questaoIndex]: true }));
      setMostrarResposta(isImediato);
      setViuRespostas((prev) => ({ ...prev, [questaoIndex]: isImediato || !!prev[questaoIndex] }));
      setReResponder(false);
      return;
    }

    if (!respondidaAntes) {
      setMostrarResposta(false);
      setReResponder(false);
    }
  }, [respondidaAntes, atividadeConcluidaPersistida, questaoIndex, isImediato]);
```

Substituir por:

```tsx
useEffect(() => {
    if (reviewMode && respondidaAntes && atividadeConcluidaPersistida) {
      setConfirmados((prev) => ({ ...prev, [questaoIndex]: true }));
      setMostrarResposta(isImediato);
      setViuRespostas((prev) => ({ ...prev, [questaoIndex]: isImediato || !!prev[questaoIndex] }));
      setReResponder(false);
      return;
    }

    if (!reviewMode) {
      setMostrarResposta(false);
      setReResponder(false);
    }
  }, [reviewMode, respondidaAntes, atividadeConcluidaPersistida, questaoIndex, isImediato]);
```

- [ ] **Step 4: Adicionar prop `reviewMode` em ActivityRenderer**

Localizar o tipo `Props` em `ActivityRenderer.tsx` (~linha 18):

```tsx
type Props = {
  atividade: any;
  topicoId?: number;
  onComplete?: (result?: ActivityCompletePayload) => void;
  initialQuestionIndex?: number;
  onQuestionIndexChange?: (questionIndex: number) => void;
  timedOut?: boolean;
};
```

Substituir por:

```tsx
type Props = {
  atividade: any;
  topicoId?: number;
  onComplete?: (result?: ActivityCompletePayload) => void;
  initialQuestionIndex?: number;
  onQuestionIndexChange?: (questionIndex: number) => void;
  timedOut?: boolean;
  reviewMode?: boolean;
};
```

- [ ] **Step 5: Adicionar tela de resumo e passar reviewMode**

Localizar a função `ActivityRenderer` (~linha 107). Substituir o conteúdo completo por:

```tsx
export function ActivityRenderer({
  atividade,
  onComplete,
  topicoId,
  initialQuestionIndex,
  onQuestionIndexChange,
  timedOut = false,
  reviewMode = false,
}: Props) {
  const [localReviewMode, setLocalReviewMode] = React.useState(reviewMode);

  React.useEffect(() => {
    setLocalReviewMode(reviewMode);
  }, [reviewMode]);

  const hasQuestoes = Array.isArray(atividade?.questoes) && atividade.questoes.length > 0;
  const tipo = normalizeActivityType(atividade?.tipo);
  const atividadeConcluida =
    String(atividade?.status ?? '').toLowerCase().includes('concl') ||
    Number(atividade?.percentual_concluido ?? 0) >= 100;

  const registry: Record<string, React.ComponentType<any>> = {
    questao: QuestionActivity,
    quiz: QuestionActivity,
    true_false: QuestionActivity,
    fill_blank: QuestionActivity,
    essay: QuestionActivity,
    video: VideoActivity,
    texto: TextoActivity,
  };

  const Component = registry[tipo] ?? (hasQuestoes ? QuestionActivity : undefined);

  // Tela de resumo para atividade já concluída (fora do modo revisão)
  if (atividadeConcluida && !localReviewMode) {
    const acertos = Number(atividade?.acertos_percentual ?? atividade?.questoes?.reduce(
      (acc: number, q: any) => acc + (q?.correta_aluno === true ? 1 : 0), 0
    ) / Math.max(1, atividade?.questoes?.length ?? 1) * 100 ?? 0);
    const temAcertos = Number.isFinite(acertos) && acertos > 0;

    return (
      <View style={summaryStyles.container}>
        <View style={summaryStyles.iconRow}>
          <Text style={summaryStyles.checkmark}>✓</Text>
        </View>
        <Text style={summaryStyles.title}>
          {atividade?.titulo ?? 'Atividade concluída'}
        </Text>
        {temAcertos && (
          <Text style={summaryStyles.score}>
            {Math.round(acertos)}% de acertos
          </Text>
        )}
        <View style={summaryStyles.btnRow}>
          <Pressable
            onPress={() => onComplete?.({ completed: true })}
            style={[summaryStyles.btn, summaryStyles.btnPrimary]}
          >
            <Text style={summaryStyles.btnPrimaryText}>Continuar</Text>
          </Pressable>
          <Pressable
            onPress={() => setLocalReviewMode(true)}
            style={summaryStyles.btn}
          >
            <Text style={summaryStyles.btnSecondaryText}>Revisar respostas</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!Component) {
    return (
      <TextoActivity
        atividade={{ titulo: 'Tipo não suportado', conteudo: JSON.stringify(atividade, null, 2) }}
      />
    );
  }

  return (
    <Component
      atividade={atividade}
      onComplete={onComplete}
      topicoId={topicoId}
      initialQuestionIndex={initialQuestionIndex}
      onQuestionIndexChange={onQuestionIndexChange}
      timedOut={timedOut}
      reviewMode={localReviewMode}
    />
  );
}

import { Pressable, StyleSheet } from 'react-native';

const summaryStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 12,
  },
  iconRow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a3a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 28,
    color: '#4ade80',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e8e8e8',
    textAlign: 'center',
  },
  score: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  btnRow: {
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    marginTop: 8,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  btnSecondaryText: {
    color: '#a0a0a0',
    fontSize: 14,
  },
});
```

**Nota:** os `import { Pressable, StyleSheet }` devem ser adicionados aos imports existentes no topo do arquivo, não duplicados. Mover os `summaryStyles` para fora da função, antes da exportação.

- [ ] **Step 6: Passar `reviewMode` no `[id].tsx`**

Em `src/app/(tabs)/trilha/[id].tsx`, localizar todos os usos de `<ActivityRenderer` e adicionar a prop `reviewMode`:

```tsx
<ActivityRenderer
  atividade={block.atividade}
  topicoId={topicoId}
  reviewMode={isAtividadeConcluida(block.atividade, atividadesResolvidasLocal)}
  onComplete={...}
  ...
/>
```

A função `isAtividadeConcluida` já existe no arquivo (~linha 242).

- [ ] **Step 7: Verificar no app**

Abrir uma atividade não respondida → deve abrir sem resposta pré-selecionada. Abrir uma atividade já respondida → deve mostrar a tela de resumo com botão "Continuar" e opção "Revisar respostas".

- [ ] **Step 8: Commit**

```bash
git add src/components/QuestionActivity.tsx src/components/ActivityRenderer.tsx src/app/(tabs)/trilha/[id].tsx
git commit -m "fix: atividades não abrem com resposta pré-selecionada; tela de resumo para atividades concluídas"
```

---

## Task 4: Cards — ordem + renderização de mídia no verso

**Files:**
- Modify: `src/app/(tabs)/trilha/[id].tsx`
- Modify: `src/components/StudyCardsBlock.tsx`

- [ ] **Step 1: Corrigir cards invisíveis — `kind === "cards"` ignorado**

Em `src/app/(tabs)/trilha/[id].tsx`, localizar `personalizedFlow` (~linha 457) e o bloco `orderedSteps.forEach`. Atualmente:

```tsx
orderedSteps.forEach((step, index) => {
  if (step.kind === "content") {
    const conteudo = normalizePersonalizedStepContent(topicoId, step, index);
    conteudosPersonalizados.push(conteudo);
    blocksPersonalizados.push({ kind: "conteudo", id: `pc-${conteudo.id}`, conteudo });
    return;
  }
  if (step.kind === "activity") {
    void normalizePersonalizedStepActivity(topicoId, step, index);
    return;
  }
});
```

Substituir por:

```tsx
orderedSteps.forEach((step, index) => {
  if (step.kind === "content" || step.kind === "cards") {
    const conteudo = normalizePersonalizedStepContent(topicoId, step, index);
    conteudosPersonalizados.push(conteudo);
    blocksPersonalizados.push({ kind: "conteudo", id: `pc-${conteudo.id}`, conteudo });
    return;
  }
  if (step.kind === "activity") {
    void normalizePersonalizedStepActivity(topicoId, step, index);
    return;
  }
});
```

- [ ] **Step 2: Corrigir ordem — cards aparecem após atividades**

Localizar o `useMemo` de `blocks` (~linha 737). Substituir:

```tsx
return [...academicBlocks, ...personalizedBlocks];
```

Por:

```tsx
// Insere blocos personalizados (cards) antes das atividades acadêmicas
const firstActivityIdx = academicBlocks.findIndex((b) => b.kind === "atividade");
if (firstActivityIdx === -1) {
  return [...academicBlocks, ...personalizedBlocks];
}
return [
  ...academicBlocks.slice(0, firstActivityIdx),
  ...personalizedBlocks,
  ...academicBlocks.slice(firstActivityIdx),
];
```

- [ ] **Step 3: Identificar onde o verso do card é renderizado**

Em `StudyCardsBlock.tsx`, localizar o bloco onde `card.verso` ou `card.descricao` são exibidos (é o conteúdo mostrado quando o card está virado). Deve ser algo como:

```tsx
{flipped && (
  <View>
    <Text>{card.verso ?? card.descricao}</Text>
  </View>
)}
```

- [ ] **Step 4: Adicionar renderização condicional de mídia**

Dentro do bloco `{flipped && ...}`, após o texto do verso, adicionar:

```tsx
{flipped && (
  <View style={cardStyles.versoContainer}>
    {(card.verso || card.descricao) ? (
      <Text style={cardStyles.versoText}>{card.verso ?? card.descricao}</Text>
    ) : null}

    {card.imagemUrl ? (
      <Image
        source={{ uri: card.imagemUrl }}
        style={cardStyles.cardMedia}
        resizeMode="contain"
      />
    ) : null}

    {card.audioUrl ? (
      <AudioPlayer url={card.audioUrl} title={card.titulo ?? 'Áudio'} />
    ) : null}

    {card.videoUrl ? (
      <VideoPlayer url={card.videoUrl} title={card.titulo ?? 'Vídeo'} />
    ) : null}

    {(card.documentoUrl || card.apresentacaoUrl) ? (
      <DocumentBlock
        payload={{ url: (card.documentoUrl ?? card.apresentacaoUrl) as string }}
        WebView={undefined}
      />
    ) : null}
  </View>
)}
```

Adicionar os imports necessários ao topo do arquivo se ainda não existirem:

```tsx
import { Image } from "react-native";
import AudioPlayer from "@/components/funcionais/AudioPlayer";
import VideoPlayer from "@/components/funcionais/VideoPlayer";
import { DocumentBlock } from "@/components/DocumentBlock";
```

E os estilos novos:

```tsx
versoContainer: {
  gap: 10,
},
versoText: {
  fontSize: 15,
  lineHeight: 22,
  color: '#e0e0e0',
},
cardMedia: {
  width: '100%',
  height: 200,
  borderRadius: 8,
},
```

- [ ] **Step 5: Adicionar estilos novos ao StyleSheet de StudyCardsBlock**

Dentro do `StyleSheet.create({...})` existente em `StudyCardsBlock.tsx`, adicionar:

```tsx
versoContainer: {
  gap: 10,
},
versoText: {
  fontSize: 15,
  lineHeight: 22,
  color: '#e0e0e0',
},
cardMedia: {
  width: '100%',
  height: 200,
  borderRadius: 8,
},
```

- [ ] **Step 6: Verificar no app**

Abrir um tópico com payload personalizado contendo cards. Os cards devem aparecer ANTES das atividades (questões). Virar um card que tenha mídia — a mídia deve aparecer no verso.

- [ ] **Step 7: Commit**

```bash
git add src/app/(tabs)/trilha/[id].tsx src/components/StudyCardsBlock.tsx
git commit -m "fix: cards personalizados aparecem antes das atividades e com renderização de mídia no verso"
```

---

## Task 5: VideoPlayer — seek bar e controles ±10s

**Files:**
- Modify: `src/components/funcionais/VideoPlayer.tsx`

- [ ] **Step 1: Adicionar ref e estado de playback**

Em `VideoPlayer.tsx`, adicionar imports no topo:

```tsx
import { AVPlaybackStatus, Video as ExpoVideo } from "expo-av";
```

E logo após os `useState` existentes (~linha 34), adicionar:

```tsx
const videoRef = useRef<ExpoVideo>(null);
const [positionMs, setPositionMs] = useState(0);
const [durationMs, setDurationMs] = useState(0);
const [isPlaying, setIsPlaying] = useState(false);
const [showSeekControls, setShowSeekControls] = useState(true);
const hideSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Adicionar `useRef` ao import de React se não estiver.

- [ ] **Step 2: Funções de controle**

Após as declarações de estado, adicionar:

```tsx
const seekBy = async (deltaMs: number) => {
  if (!videoRef.current) return;
  const status = await videoRef.current.getStatusAsync();
  if (!status.isLoaded) return;
  const next = Math.max(0, Math.min((status.durationMillis ?? 0), (status.positionMillis ?? 0) + deltaMs));
  await videoRef.current.setPositionAsync(next);
};

const handleVideoAreaTap = () => {
  setShowSeekControls(true);
  if (hideSeekTimerRef.current) clearTimeout(hideSeekTimerRef.current);
  hideSeekTimerRef.current = setTimeout(() => setShowSeekControls(false), 3000);
};

const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
  if (!status.isLoaded) return;
  setPositionMs(status.positionMillis ?? 0);
  setDurationMs(status.durationMillis ?? 0);
  setIsPlaying(status.isPlaying ?? false);
};

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 3: Atualizar `renderDirectVideo`**

Substituir a função `renderDirectVideo` por:

```tsx
const renderDirectVideo = (fullscreen = false) => {
  if (!playbackUrl) return renderUnavailable(fullscreen);

  const progressPct = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;

  return (
    <Pressable onPress={handleVideoAreaTap} style={{ flex: 1 }}>
      <ExpoVideo
        ref={videoRef}
        source={{ uri: playbackUrl }}
        style={[
          fullscreen ? styles.nativeVideoFullscreen : styles.nativeVideo,
          { backgroundColor: palette.surface },
        ]}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls={false}
        allowsExternalPlayback
        shouldPlay={false}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onError={() => setFailed(true)}
      />
      {showSeekControls && (
        <View style={[seekStyles.overlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <View style={seekStyles.controls}>
            <Pressable onPress={() => seekBy(-10_000)} style={seekStyles.seekBtn}>
              <Ionicons name="play-back-outline" size={22} color="#fff" />
              <Text style={seekStyles.seekLabel}>10s</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (isPlaying) {
                  videoRef.current?.pauseAsync();
                } else {
                  videoRef.current?.playAsync();
                }
              }}
              style={seekStyles.playBtn}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={28}
                color="#fff"
              />
            </Pressable>

            <Pressable onPress={() => seekBy(10_000)} style={seekStyles.seekBtn}>
              <Ionicons name="play-forward-outline" size={22} color="#fff" />
              <Text style={seekStyles.seekLabel}>10s</Text>
            </Pressable>
          </View>

          <View style={seekStyles.progressRow}>
            <Text style={seekStyles.timeText}>{formatTime(positionMs)}</Text>
            <View style={seekStyles.progressTrack}>
              <View style={[seekStyles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={seekStyles.timeText}>{formatTime(durationMs)}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
};
```

- [ ] **Step 4: Adicionar estilos de seek**

Ao final do `StyleSheet.create({...})` existente, adicionar um `seekStyles` separado:

```tsx
const seekStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
    gap: 6,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  seekBtn: {
    alignItems: 'center',
    gap: 2,
  },
  seekLabel: {
    color: '#fff',
    fontSize: 11,
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  timeText: {
    color: '#fff',
    fontSize: 11,
    minWidth: 36,
  },
});
```

- [ ] **Step 5: Corrigir import de Video**

No topo do arquivo, o import atual é:
```tsx
import { ResizeMode, Video } from "expo-av";
```

Atualizar para:
```tsx
import { AVPlaybackStatus, ResizeMode, Video as ExpoVideo } from "expo-av";
```

E substituir todas as ocorrências de `<Video` (não `ExpoVideo`) por `<ExpoVideo` no arquivo.

- [ ] **Step 6: Verificar no app**

Abrir um tópico com vídeo nativo (não YouTube). Deve aparecer controles de play/pause, ±10s e barra de progresso ao tocar na tela. Os controles somem após 3s.

- [ ] **Step 7: Commit**

```bash
git add src/components/funcionais/VideoPlayer.tsx
git commit -m "feat: VideoPlayer com seek bar customizada e botões ±10s"
```

---

## Task 6: ContentRenderer — rotear PDF para MarkdownBlock

**Files:**
- Modify: `src/components/ContentRenderer.tsx`

- [ ] **Step 1: Localizar o bloco que renderiza `pdf`**

Em `ContentRenderer.tsx`, localizar a função `renderPdf` ou o `case 'pdf'` / bloco que chama `PdfBlock`. Deve ser algo como:

```tsx
function renderPdf(block: ContentBlock, ...) {
  return <PdfBlock payload={block.payload} />;
}
```

- [ ] **Step 2: Adicionar roteamento por presença de texto**

Substituir o bloco de renderização de `pdf` para verificar se o payload tem texto (markdown) ou URL:

```tsx
function renderPdf(
  block: ContentBlock,
  palette: ReturnType<typeof getProfileShellPalette>,
  WebView?: React.ComponentType<any> | null
) {
  const payload = block.payload;

  // Se há texto/markdown no payload, renderizar como MarkdownBlock (sem WebView)
  const hasText =
    typeof payload === "string"
      ? Boolean(payload.trim())
      : Boolean(
          (payload as any)?.texto?.trim() ||
          (payload as any)?.markdown?.trim() ||
          (payload as any)?.conteudo?.trim()
        );

  if (hasText) {
    return <MarkdownBlock key={block.id} payload={payload} WebView={WebView} />;
  }

  // Fallback: URL externa real
  const url =
    typeof payload === "object"
      ? ((payload as any)?.url || (payload as any)?.uri || (payload as any)?.src || "")
      : "";

  if (!url) return null;

  return <PdfBlock key={block.id} payload={{ url }} />;
}
```

Garantir que `MarkdownBlock` está importado no topo do arquivo:

```tsx
import { MarkdownBlock } from "./MarkdownBlock";
```

- [ ] **Step 3: Verificar no app**

Abrir um tópico com conteúdo do tipo `pdf` que tenha texto/markdown. Deve renderizar como markdown nativo paginado, sem WebView.

- [ ] **Step 4: Commit**

```bash
git add src/components/ContentRenderer.tsx
git commit -m "fix: ContentRenderer roteia pdf com texto para MarkdownBlock nativo"
```

---

## Checklist Final

- [ ] Progresso atualiza imediatamente ao concluir conteúdo/atividade
- [ ] Progresso não regride ao reabrir o app
- [ ] Markdown renderiza integrado ao tema, sem WebView separada
- [ ] Documentos com `##` headings mostram paginação funcional
- [ ] Atividades abrem sem resposta pré-selecionada
- [ ] Atividades já concluídas mostram tela de resumo com "Continuar"
- [ ] Cards com mídia exibem imagem/áudio/vídeo no verso
- [ ] Vídeos nativos têm seek bar e botões ±10s
- [ ] PDFs com texto renderizam como markdown (não WebView)
