import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import type { EventoDoApp, SessaoDeTopico, TopicoDaTrilha } from "./jornada";

type Erro = { message: string; code?: string } | null;
type Pagina = { data: unknown[] | null; error: Erro };
type Consulta = {
  select: (colunas: string) => Consulta;
  eq: (coluna: string, valor: unknown) => Consulta;
  in: (coluna: string, valores: unknown[]) => Consulta;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Consulta;
  range: (de: number, ate: number) => PromiseLike<Pagina>;
  insert: (linha: unknown) => Consulta;
  single: () => PromiseLike<{ data: unknown; error: Erro }>;
} & PromiseLike<Pagina>;

// Tabelas fora dos tipos gerados do Supabase (e uma que só existe depois da
// migration 20260929_02).
const de = (tabela: string) => supabase.from(tabela as never) as unknown as Consulta;

const PAGINA = 1000; // limite padrão do PostgREST por requisição

/** Lê todas as páginas: o aluno mais ativo já passa de 500 eventos úteis. */
async function lerTudo<T>(montar: () => Consulta): Promise<T[]> {
  const linhas: T[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await montar().range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) return linhas;
  }
}

async function ler<T>(consulta: PromiseLike<Pagina>): Promise<T[]> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

// Só os eventos que dizem algo sobre a ordem do estudo (scroll e tap ficam fora).
const EVENTOS_DA_JORNADA = [
  "topic_open",
  "topic_complete",
  "content_open",
  "content_complete",
  "content_revisit",
  "activity_start",
  "activity_complete",
  "question_attempt",
];

export type AtividadeDaTrilha = { id: number; topico_id: number; titulo: string | null };
export type QuestaoDaTrilha = { id: number; atividade_id: number; enunciado: string | null; resposta_correta: string | null };
export type ConteudoDaTrilha = { id: number; topico_id: number; titulo: string | null };

export type DadosDaJornada = {
  eventos: EventoDoApp[];
  sessoes: SessaoDeTopico[];
  topicos: TopicoDaTrilha[];
  atividades: AtividadeDaTrilha[];
  questoes: QuestaoDaTrilha[];
  conteudos: ConteudoDaTrilha[];
};

const VAZIO: DadosDaJornada = { eventos: [], sessoes: [], topicos: [], atividades: [], questoes: [], conteudos: [] };

/**
 * Tudo direto do Supabase (sem modelo de linguagem no meio). estudo_sessoes
 * só é legível pelo professor depois da 20260929_02; antes disso o RLS
 * devolve lista vazia e o tempo por passo aparece como "—".
 */
export function useJornadaDoAluno(alunoId: string, classeId: number) {
  const [dados, setDados] = useState<DadosDaJornada>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    setCarregando(true);
    setErro(null);
    (async () => {
      const topicos = await ler<TopicoDaTrilha>(de("topicos").select("id, nome, ordem").eq("classe_id", classeId));
      const topicoIds = topicos.map((t) => t.id);
      const [atividades, conteudos, eventos, sessoes] = await Promise.all([
        topicoIds.length ? ler<AtividadeDaTrilha>(de("atividades").select("id, topico_id, titulo").in("topico_id", topicoIds)) : [],
        topicoIds.length ? ler<ConteudoDaTrilha>(de("conteudos").select("id, topico_id, titulo").in("topico_id", topicoIds)) : [],
        lerTudo<EventoDoApp>(() =>
          de("telemetria_eventos_app")
            .select("id, occurred_at, event_name, topico_id, conteudo_id, atividade_id, questao_id, attempt_number, is_correct")
            .eq("aluno_id", alunoId)
            .eq("classe_id", classeId)
            .in("event_name", EVENTOS_DA_JORNADA)
            .order("occurred_at")
            .order("id"),
        ),
        // Sem a policy do professor o RLS devolve vazio, não erro; se a
        // leitura falhar por outro motivo, a jornada sai sem tempo.
        lerTudo<SessaoDeTopico>(() =>
          de("estudo_sessoes")
            .select("topico_id, aberto_em, duracao_sec")
            .eq("aluno_id", alunoId)
            .eq("classe_id", classeId)
            .eq("scope", "topic")
            .order("aberto_em")
            .order("id"),
        ).catch(() => [] as SessaoDeTopico[]),
      ]);
      const atividadeIds = atividades.map((a) => a.id);
      const questoes = atividadeIds.length
        ? await ler<QuestaoDaTrilha>(de("questoes").select("id, atividade_id, enunciado, resposta_correta").in("atividade_id", atividadeIds))
        : [];
      return { eventos, sessoes, topicos, atividades, questoes, conteudos };
    })()
      .then((r) => {
        if (request.isCurrent()) setDados(r);
      })
      .catch((e: unknown) => {
        if (request.isCurrent()) setErro(e instanceof Error ? e.message : "Não foi possível carregar a jornada.");
      })
      .finally(() => {
        if (request.isCurrent()) setCarregando(false);
      });
  }, [alunoId, classeId]);

  return { dados, carregando, erro };
}

export type IntervencaoDoPasso = { id: string; passo_ref: string; texto: string; created_at: string; professor_id: string };

export type EstadoDasIntervencoes = "carregando" | "pronto" | "indisponivel" | "erro";

const tabelaAusente = (e: Erro) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(e.message));

/** Comentários do professor por passo (professor_intervencoes_passo, migration 20260929_02). */
export function useIntervencoesDoPasso(alunoId: string, classeId: number) {
  const [lista, setLista] = useState<IntervencaoDoPasso[]>([]);
  const [estado, setEstado] = useState<EstadoDasIntervencoes>("carregando");

  useEffect(() => {
    let vivo = true;
    setEstado("carregando");
    void de("professor_intervencoes_passo")
      .select("id, passo_ref, texto, created_at, professor_id")
      .eq("aluno_id", alunoId)
      .eq("classe_id", classeId)
      .order("created_at")
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setEstado(tabelaAusente(error) ? "indisponivel" : "erro");
          return;
        }
        setLista((data ?? []) as IntervencaoDoPasso[]);
        setEstado("pronto");
      });
    return () => {
      vivo = false;
    };
  }, [alunoId, classeId]);

  const salvar = useCallback(
    async (passoRef: string, topicoId: number, texto: string) => {
      const { data, error } = await de("professor_intervencoes_passo")
        .insert({ aluno_id: alunoId, classe_id: classeId, passo_ref: passoRef, topico_id: topicoId, texto: texto.trim() })
        .select("id, passo_ref, texto, created_at, professor_id")
        .single();
      if (error) throw new Error(tabelaAusente(error) ? "Os comentários por passo ainda não estão disponíveis neste ambiente." : error.message);
      setLista((atual) => [...atual, data as IntervencaoDoPasso]);
    },
    [alunoId, classeId],
  );

  return { lista, estado, salvar };
}
