import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/lib/apiTraiupClient";
import { createRequestGuard } from "@/lib/requestGuard";
import {
  eMigracaoPendente,
  geradoEm,
  JANELA_DE_ACEITACAO_DIAS,
  loteMaisRecentePorTurma,
  precisaGerar,
  type Insight,
  type MotivoDescarte,
} from "./insights";

type RespostaDaGeracao = {
  status: "gerando" | "recente" | "concluido" | "sem_dados" | "falhou" | "ocioso";
  itens: number | null;
};

export type EstadoDosInsights =
  | { tipo: "carregando" }
  | { tipo: "pronto" }
  | { tipo: "indisponivel" } // migration 20260929_01 ainda não aplicada
  | { tipo: "erro"; detalhe: string };

/** Aviso sobre a geração, independente do que já está na tabela. */
export type AvisoDaGeracao = { tom: "info" | "erro"; texto: string } | null;

const COLUNAS =
  "id, classe_id, aluno_id, escopo, natureza, texto, base, status, motivo_descarte, geracao_id, created_at, resolved_at";
const INTERVALO_DE_CONSULTA_MS = 4_000;
const LIMITE_DE_ESPERA_MS = 3 * 60_000;

// intervencoes não está nos tipos gerados do Supabase (a coluna nova ainda
// nem existe no banco até a migration ser aplicada).
const tabela = () => supabase.from("intervencoes" as never) as unknown as ReturnType<typeof supabase.from>;

/**
 * Insights da turma: LÊ e DECIDE direto no Supabase (RLS
 * intervencoes_professor_*); só GERAR passa pela API. Com a API fora do ar a
 * aba continua mostrando o último lote gravado.
 */
export function useInsightsDaTurma(classIds: number[]) {
  const [lote, setLote] = useState<Insight[]>([]);
  const [recentes, setRecentes] = useState<Insight[]>([]);
  const [estado, setEstado] = useState<EstadoDosInsights>({ tipo: "carregando" });
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<AvisoDaGeracao>(null);
  const guarda = useRef(createRequestGuard());
  const espera = useRef<number | null>(null);
  const geracaoAutomatica = useRef(new Set<string>());

  const carregar = useCallback(async () => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setLote([]);
      setRecentes([]);
      setEstado({ tipo: "pronto" });
      return null;
    }
    const desde = new Date(Date.now() - JANELA_DE_ACEITACAO_DIAS * 86_400_000).toISOString();
    // Últimas linhas geradas (o lote mais novo de cada turma sai daqui) e as
    // decididas na janela da taxa de aceitação, que podem ser de lotes antigos.
    const [ultimas, decididas] = await Promise.all([
      tabela().select(COLUNAS).in("classe_id", classIds).not("geracao_id", "is", null).order("created_at", { ascending: false }).limit(60 * classIds.length),
      tabela().select(COLUNAS).in("classe_id", classIds).eq("natureza", "sugestao").gte("resolved_at", desde),
    ]);
    if (!request.isCurrent()) return null;
    const erro = ultimas.error ?? decididas.error;
    if (erro) {
      setEstado(eMigracaoPendente(erro) ? { tipo: "indisponivel" } : { tipo: "erro", detalhe: erro.message });
      return null;
    }
    const novoLote = loteMaisRecentePorTurma((ultimas.data ?? []) as unknown as Insight[]);
    setLote(novoLote);
    setRecentes((decididas.data ?? []) as unknown as Insight[]);
    setEstado({ tipo: "pronto" });
    return novoLote;
  }, [classIds]);

  const pararEspera = () => {
    if (espera.current !== null) window.clearTimeout(espera.current);
    espera.current = null;
  };

  const gerar = useCallback(async () => {
    if (classIds.length === 0) return;
    pararEspera();
    setAviso(null);
    setGerando(true);
    let respostas: RespostaDaGeracao[];
    try {
      respostas = await Promise.all(
        classIds.map((id) => apiRequest<RespostaDaGeracao>(`/api/v1/insights/turma/${id}/gerar`, "", { method: "POST" })),
      );
    } catch (e) {
      setGerando(false);
      const detalhe = e instanceof Error ? e.message : String(e);
      setAviso({
        tom: "erro",
        texto: eMigracaoPendente({ message: detalhe })
          ? "A geração de insights ainda não está disponível neste ambiente."
          : "Não foi possível falar com a IA agora. O que aparece abaixo é o último resultado salvo.",
      });
      return;
    }

    const emAndamento = classIds.filter((_, i) => respostas[i]?.status === "gerando");
    if (emAndamento.length === 0) {
      setGerando(false);
      setAviso({ tom: "info", texto: "As sínteses foram geradas há poucos minutos; os dados ainda não mudaram." });
      void carregar();
      return;
    }

    // Acompanha pelo status da API; quando todas terminam, relê a tabela.
    const inicio = Date.now();
    const consultar = async () => {
      let finais: RespostaDaGeracao[] = [];
      try {
        finais = await Promise.all(
          emAndamento.map((id) => apiRequest<RespostaDaGeracao>(`/api/v1/insights/turma/${id}/status`, "")),
        );
      } catch {
        // API caiu no meio: relê o banco e para de esperar.
        finais = emAndamento.map(() => ({ status: "ocioso", itens: null }));
      }
      const aindaGerando = finais.some((r) => r.status === "gerando");
      if (aindaGerando && Date.now() - inicio < LIMITE_DE_ESPERA_MS) {
        espera.current = window.setTimeout(() => void consultar(), INTERVALO_DE_CONSULTA_MS);
        return;
      }
      espera.current = null;
      setGerando(false);
      await carregar();
      if (aindaGerando) setAviso({ tom: "info", texto: "A geração está demorando mais que o normal. Volte em alguns minutos." });
      else if (finais.some((r) => r.status === "falhou")) setAviso({ tom: "erro", texto: "A IA não conseguiu gerar novas sínteses agora. Tente de novo em alguns minutos." });
      else if (finais.every((r) => r.status === "sem_dados")) setAviso({ tom: "info", texto: "A IA não encontrou nada novo para sugerir com os dados atuais da turma." });
    };
    espera.current = window.setTimeout(() => void consultar(), INTERVALO_DE_CONSULTA_MS);
  }, [classIds, carregar]);

  // Abrir a aba: mostra o que o banco tem e, se estiver velho ou vazio,
  // dispara a geração em segundo plano (uma vez por conjunto de turmas).
  useEffect(() => {
    let vivo = true;
    setEstado({ tipo: "carregando" });
    setAviso(null);
    void carregar().then((carregado) => {
      if (!vivo || carregado === null) return;
      const chave = classIds.join(",");
      if (geracaoAutomatica.current.has(chave) || !precisaGerar(geradoEm(carregado), new Date())) return;
      geracaoAutomatica.current.add(chave);
      void gerar();
    });
    return () => {
      vivo = false;
      pararEspera();
    };
  }, [carregar, gerar, classIds]);

  const decidir = useCallback(
    async (id: string, status: "applied" | "dismissed", motivo: MotivoDescarte | null) => {
      const anterior = lote.find((l) => l.id === id);
      if (!anterior) return;
      const mudanca = { status, motivo_descarte: status === "dismissed" ? motivo : null, resolved_at: new Date().toISOString() };
      const aplicar = (l: Insight) => (l.id === id ? { ...l, ...mudanca } : l);
      setLote((atual) => atual.map(aplicar));
      setRecentes((atual) => [...atual.filter((l) => l.id !== id), aplicar(anterior)]);

      const { data, error } = await tabela().update(mudanca as never).eq("id", id).select("id");
      // Sem erro e sem linha = a policy barrou em silêncio.
      if (error || !data || (data as unknown[]).length === 0) {
        setLote((atual) => atual.map((l) => (l.id === id ? anterior : l)));
        setRecentes((atual) => atual.filter((l) => l.id !== id).concat(anterior.status === "pending" ? [] : [anterior]));
        throw new Error(error?.message ?? "Sem permissão para alterar esta síntese.");
      }
    },
    [lote],
  );

  return { lote, recentes, estado, gerando, aviso, gerar, decidir };
}
