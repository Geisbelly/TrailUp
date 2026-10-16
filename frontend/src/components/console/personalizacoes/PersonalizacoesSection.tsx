import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Layers, Palette, UserSearch, Users, FileText, Music, FileImage, NotebookPen, RefreshCw, Sparkles, AlertTriangle, Check } from "lucide-react";
import { COR_DO_PERFIL, NOME_DO_PERFIL } from "../dashboard/perfilCores";
import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  enqueueManualGenerateAllJob,
  enqueueManualGenerateJob,
  fetchAdequacaoGrupo,
  fetchContextoDocente,
  fetchPersonalizacaoJobStatus,
  fetchPersonalizacaoPorPerfil,
  type ClassePerfilSummaryResponse,
  type PersonalizacaoContextoDocenteResponse,
  type PersonalizacaoJobResumo,
  type PersonalizacaoPerfilItem,
  type PersonalizacaoPorPerfilResponse,
} from "./personalizacoesApi";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PerfilConteudoPage } from "./PerfilConteudoPage";
import type { MaterialTipo } from "./PerfilConteudoView";
import { buildMaterialPath, isMaterialRoute, parseMaterialQuery } from "./materialRoute";
import { consolePathForView } from "@/pages/consoleSections";
import {
  getFormatoStatusBadge,
  getPersonalizacaoStatusBadge,
  isGeracaoStatusAtivo,
} from "./statusBadge";
import { SugestaoMaterialCard } from "./SugestaoMaterialCard";
import {
  limitarPercentual,
  resolverGeracaoFormato,
  resumirGeracaoConteudo,
  statusGeracaoDoPerfil,
  temGeracaoAtiva,
} from "./generationStatus";
import { descreverErroDatado } from "./erroDatado";
import { toast } from "sonner";
import { enqueueManualRetryJob } from "../trilha/personalizacaoJobsApi";
import { formatarAtualizadoHa } from "../dashboard/atualizadoHa";
import { iniciais } from "../meusdados/conta";
import { fetchRegistrosPorAluno } from "./statusPorAlunoApi";
import {
  filtrarPorNome,
  montarStatusPorAluno,
  type LinhaPersonalizacaoAluno,
  type LinhaStatusAluno,
} from "./statusPorAluno";

type ClasseRow = { id: number; descricao: string | null };
type TopicoRow = { id: number; classe_id: number; nome: string | null; ordem: number | null };
type ConteudoRow = { id: number; topico_id: number; titulo: string | null; ordem: number | null };
type AlunoRow = { id: string; nome: string | null; email: string | null; perfil_dominante: string; afinidade?: number };


const BRAINHEX_PROFILE_KEYS = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
] as const;

const ACTIVE_JOB_STATUSES = new Set(["pending", "processing", "partial"]);

const MATERIAL_TIPOS: Array<{ key: MaterialTipo; label: string; icon: typeof FileText }> = [
  { key: "markdown", label: "Texto", icon: NotebookPen },
  { key: "pdf", label: "PDF", icon: FileText },
  { key: "audio", label: "Áudio", icon: Music },
  { key: "apresentacao", label: "Apresentação", icon: FileImage },
];

const POR_PERFIL_POLL_INTERVAL_MS = 4_000;

const ROTULO = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const ABA = "rounded-full px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground";

function corDoPerfil(chave: string): string {
  return COR_DO_PERFIL[chave.toLowerCase() as BrainHexProfileKey]?.marca ?? "hsl(var(--muted-foreground))";
}

function EstadoVazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center rounded-[20px] border bg-card px-6 py-14 text-center">
      <Sparkles className="h-11 w-11 text-muted-foreground" strokeWidth={1.4} aria-hidden="true" />
      <p className="mt-4 text-lg font-bold">{titulo}</p>
      <p className="mt-2 max-w-md text-[13.5px] text-muted-foreground">{texto}</p>
    </div>
  );
}

function getMaterial(materiais: Record<string, unknown> | null | undefined, tipo: string): Record<string, unknown> | null {
  if (!materiais || typeof materiais !== "object") return null;
  const value = (materiais as Record<string, unknown>)[tipo];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function materialUrl(material: Record<string, unknown> | null): string | null {
  if (!material) return null;
  const url = material.arquivo_url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function planoText(plano: PersonalizacaoPerfilItem["plano"], key: string): string {
  if (!plano || typeof plano !== "object") return "";
  const value = (plano as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function consolePathForViewPersonalizacoes(): string {
  return consolePathForView("personalizacoes");
}

export default function PersonalizacoesSection({ professorId }: { professorId?: string }) {
  const { user, session } = useAuth();
  const resolvedProfessorId = professorId ?? user?.id;

  // Pagina do material: /console/personalizacoes/material?classe&topico&conteudo&perfil&aba.
  // A selecao (turma/topico/conteudo) mora em estado local desta secao, entao
  // ela viaja na query - sem isso, refresh ou link colado cairiam numa pagina
  // sem saber o que abrir. Ver materialRoute.ts.
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const materialRouteParams = isMaterialRoute(location.pathname)
    ? parseMaterialQuery(searchParams)
    : null;

  const [classes, setClasses] = useState<ClasseRow[]>([]);
  const [topicos, setTopicos] = useState<TopicoRow[]>([]);
  const [conteudos, setConteudos] = useState<ConteudoRow[]>([]);
  const [alunos, setAlunos] = useState<AlunoRow[]>([]);
  const [classeId, setClasseId] = useState<string>("");
  const [topicoId, setTopicoId] = useState<string>("");
  const [conteudoId, setConteudoId] = useState<string>("");
  const [alunoId, setAlunoId] = useState<string>("");
  const [conteudosLoading, setConteudosLoading] = useState(false);
  const [conteudosError, setConteudosError] = useState<string | null>(null);

  const [porPerfil, setPorPerfil] = useState<PersonalizacaoPorPerfilResponse | null>(null);
  const [porPerfilLoading, setPorPerfilLoading] = useState(false);
  const [porPerfilError, setPorPerfilError] = useState<string | null>(null);
  const porPerfilRequestId = useRef(0);
  const porPerfilRequestInFlight = useRef(false);
  const porPerfilRefreshPendente = useRef(false);
  const porPerfilSelectionKey = useRef("");
  const loadPorPerfilLatest = useRef<
    (options?: { silent?: boolean; queueIfBusy?: boolean }) => Promise<void>
  >(async () => undefined);

  const [contextoAluno, setContextoAluno] = useState<PersonalizacaoContextoDocenteResponse | null>(null);
  const [contextoLoading, setContextoLoading] = useState(false);
  const [contextoError, setContextoError] = useState<string | null>(null);

  const [grupoResumo, setGrupoResumo] = useState<ClassePerfilSummaryResponse | null>(null);
  const [grupoLoading, setGrupoLoading] = useState(false);
  const [grupoError, setGrupoError] = useState<string | null>(null);

  // O access_token muda de valor a cada refresh silencioso do Supabase - que
  // acontece justamente ao recuperar o foco da aba. Como dependencia ele fazia
  // resolveToken trocar de identidade, e a cadeia resolveToken -> loadPorPerfil
  // -> useEffect refazia o fetch inteiro, devolvendo a UI pro estado inicial
  // (parte 1 de cada material, aba padrao) a cada troca de aba do navegador.
  // O ref mantem sempre o token corrente sem invalidar o callback.
  const sessionTokenRef = useRef<string>("");
  sessionTokenRef.current = String(session?.access_token ?? "").trim();

  const resolveToken = useCallback(async () => {
    const seed = sessionTokenRef.current;
    if (seed) return seed;
    const { data } = await supabase.auth.getSession();
    return String(data.session?.access_token ?? "").trim();
  }, []);

  const [carregadoEm, setCarregadoEm] = useState<Date | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [registrosAluno, setRegistrosAluno] = useState<LinhaPersonalizacaoAluno[]>([]);
  const [registrosAlunoLoading, setRegistrosAlunoLoading] = useState(false);
  const [buscaAluno, setBuscaAluno] = useState("");
  const [reprocessando, setReprocessando] = useState(false);

  const [perfilParaGerarTudo, setPerfilParaGerarTudo] = useState<string>(BRAINHEX_PROFILE_KEYS[0]);
  const [gerarTudoJob, setGerarTudoJob] = useState<PersonalizacaoJobResumo | null>(null);
  const [gerarTudoError, setGerarTudoError] = useState<string | null>(null);
  const gerarTudoAtivo = Boolean(gerarTudoJob && ACTIVE_JOB_STATUSES.has(gerarTudoJob.status));

  // Carrega classes do professor
  useEffect(() => {
    if (!resolvedProfessorId) return;
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from("classe")
        .select("id, descricao")
        .eq("professor_id", resolvedProfessorId)
        .order("created_at", { ascending: false });
      if (!active) return;
      const rows = (data ?? []) as ClasseRow[];
      setClasses(rows);
      if (rows.length > 0) setClasseId((prev) => prev || String(rows[0].id));
    })();
    return () => {
      active = false;
    };
  }, [resolvedProfessorId]);

  // Carrega topicos e alunos da classe selecionada
  useEffect(() => {
    const numericClasse = Number(classeId);
    if (!Number.isFinite(numericClasse) || numericClasse <= 0) {
      setTopicos([]);
      setTopicoId("");
      setConteudos([]);
      setConteudoId("");
      setAlunos([]);
      setAlunoId("");
      return;
    }
    let active = true;
    void (async () => {
      const [{ data: topicosData }, { data: classeAlunoData }] = await Promise.all([
        supabase
          .from("topicos")
          .select("id, classe_id, nome, ordem")
          .eq("classe_id", numericClasse)
          .order("ordem", { ascending: true }),
        supabase.from("classe_aluno").select("aluno_id").eq("classe_id", numericClasse),
      ]);
      if (!active) return;
      const topicoRows = (topicosData ?? []) as TopicoRow[];
      setTopicos(topicoRows);
      const nextTopicoId = topicoRows.length > 0 ? String(topicoRows[0].id) : "";
      setTopicoId(nextTopicoId);
      setConteudos([]);
      setConteudoId("");
      setConteudosError(null);
      setConteudosLoading(Boolean(nextTopicoId));

      const alunoIds = Array.from(
        new Set(((classeAlunoData ?? []) as Array<{ aluno_id: string | null }>).map((r) => r.aluno_id).filter(Boolean))
      ) as string[];

      if (alunoIds.length === 0) {
        setAlunos([]);
        setAlunoId("");
        return;
      }

      const [{ data: alunosData }, { data: perfilData }] = await Promise.all([
        supabase.from("alunos").select("id, nome, email").in("id", alunoIds),
        supabase.from("aluno_perfil").select("aluno_id, afinidade, perfil:perfil_id ( nome )").in("aluno_id", alunoIds),
      ]);
      if (!active) return;

      type PerfilRow = { aluno_id: string | null; afinidade: number | null; perfil: { nome: string } | null };
      const dominanteMap = new Map<string, { nome: string; afinidade: number }>();
      ((perfilData as PerfilRow[]) ?? []).forEach((p) => {
        if (!p.aluno_id) return;
        const current = dominanteMap.get(p.aluno_id);
        const afinidade = Number(p.afinidade ?? 0);
        if (!current || afinidade > current.afinidade) {
          dominanteMap.set(p.aluno_id, { nome: p.perfil?.nome || "mastermind", afinidade });
        }
      });

      const alunoRows: AlunoRow[] = ((alunosData ?? []) as Array<{ id: string; nome: string | null; email: string | null }>).map(
        (a) => ({
          id: a.id,
          nome: a.nome,
          email: a.email,
          perfil_dominante: (dominanteMap.get(a.id)?.nome || "mastermind").toLowerCase(),
          afinidade: dominanteMap.get(a.id)?.afinidade,
        })
      );
      setAlunos(alunoRows);
      setAlunoId(alunoRows.length > 0 ? alunoRows[0].id : "");
    })();
    return () => {
      active = false;
    };
  }, [classeId]);

  const handleClasseChange = useCallback((value: string) => {
    porPerfilRequestId.current += 1;
    setClasseId(value);
    setTopicos([]);
    setTopicoId("");
    setConteudos([]);
    setConteudoId("");
    setConteudosError(null);
    setConteudosLoading(false);
    setAlunos([]);
    setAlunoId("");
    setPorPerfil(null);
    setPorPerfilLoading(false);
    setPorPerfilError(null);
  }, []);

  const handleTopicoChange = useCallback((value: string) => {
    porPerfilRequestId.current += 1;
    setTopicoId(value);
    setConteudos([]);
    setConteudoId("");
    setConteudosError(null);
    setConteudosLoading(Boolean(value));
    setPorPerfil(null);
    setPorPerfilLoading(false);
    setPorPerfilError(null);
  }, []);

  // Cada conteudo do topico possui sete variacoes BrainHex independentes.
  useEffect(() => {
    const numericTopico = Number(topicoId);
    if (!Number.isFinite(numericTopico) || numericTopico <= 0) {
      setConteudos([]);
      setConteudoId("");
      setConteudosLoading(false);
      setConteudosError(null);
      return;
    }

    let active = true;
    setConteudosLoading(true);
    setConteudosError(null);
    void (async () => {
      const { data, error } = await supabase
        .from("conteudos")
        .select("id, topico_id, titulo, ordem")
        .eq("topico_id", numericTopico)
        .order("ordem", { ascending: true })
        .order("id", { ascending: true });

      if (!active) return;
      if (error) {
        setConteudos([]);
        setConteudoId("");
        setConteudosError("Nao foi possivel carregar os conteudos deste topico.");
        setConteudosLoading(false);
        return;
      }

      const rows = (data ?? []) as ConteudoRow[];
      setConteudos(rows);
      setConteudoId((current) =>
        rows.some((item) => String(item.id) === current)
          ? current
          : rows.length > 0
            ? String(rows[0].id)
            : ""
      );
      setConteudosLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [topicoId]);

  porPerfilSelectionKey.current = `${classeId}:${topicoId}:${conteudoId}`;

  // Busca personalizacao por perfil (visoes 1 e 2). Uma nova selecao aguarda a
  // requisicao corrente terminar; o requestId e a chave impedem resposta antiga
  // de sobrescrever o conteudo atualmente selecionado.
  const loadPorPerfil = useCallback(async (
    options: { silent?: boolean; queueIfBusy?: boolean } = {}
  ) => {
    const { silent = false, queueIfBusy = true } = options;
    const numericClasse = Number(classeId);
    const numericTopico = Number(topicoId);
    const numericConteudo = Number(conteudoId);
    const selectionKey = `${classeId}:${topicoId}:${conteudoId}`;
    if (
      conteudosLoading ||
      conteudosError ||
      !Number.isFinite(numericClasse) ||
      !Number.isFinite(numericTopico) ||
      numericTopico <= 0 ||
      (conteudos.length > 0 && (!Number.isFinite(numericConteudo) || numericConteudo <= 0))
    ) {
      porPerfilRequestId.current += 1;
      setPorPerfil(null);
      setPorPerfilLoading(false);
      setPorPerfilError(null);
      return;
    }

    if (porPerfilRequestInFlight.current) {
      if (queueIfBusy) porPerfilRefreshPendente.current = true;
      return;
    }

    const requestId = ++porPerfilRequestId.current;
    porPerfilRequestInFlight.current = true;
    if (!silent) setPorPerfilLoading(true);
    setPorPerfilError(null);
    try {
      const token = await resolveToken();
      const data = await fetchPersonalizacaoPorPerfil(token, {
        classeId: numericClasse,
        topicoId: numericTopico,
        conteudoId: Number.isFinite(numericConteudo) && numericConteudo > 0 ? numericConteudo : undefined,
      });
      if (
        requestId === porPerfilRequestId.current &&
        selectionKey === porPerfilSelectionKey.current
      ) {
        setPorPerfil(data);
        setCarregadoEm(new Date());
      }
    } catch (error) {
      if (
        requestId === porPerfilRequestId.current &&
        selectionKey === porPerfilSelectionKey.current
      ) {
        if (!silent) setPorPerfil(null);
        setPorPerfilError(error instanceof Error ? error.message : "Falha ao carregar personalizações por perfil.");
      }
    } finally {
      porPerfilRequestInFlight.current = false;
      if (
        requestId === porPerfilRequestId.current &&
        selectionKey === porPerfilSelectionKey.current &&
        !silent
      ) {
        setPorPerfilLoading(false);
      }
      if (porPerfilRefreshPendente.current) {
        porPerfilRefreshPendente.current = false;
        window.setTimeout(() => {
          void loadPorPerfilLatest.current({ queueIfBusy: true });
        }, 0);
      }
    }
  }, [classeId, conteudoId, conteudos.length, conteudosError, conteudosLoading, topicoId, resolveToken]);

  loadPorPerfilLatest.current = loadPorPerfil;

  useEffect(() => {
    void loadPorPerfil({ queueIfBusy: true });
  }, [loadPorPerfil]);

  const geracaoPorPerfilAtiva = useMemo(
    () => temGeracaoAtiva(porPerfil?.perfis ?? []),
    [porPerfil]
  );

  useEffect(() => {
    if (!geracaoPorPerfilAtiva) return;
    const pollId = window.setInterval(() => {
      void loadPorPerfilLatest.current({ silent: true, queueIfBusy: false });
    }, POR_PERFIL_POLL_INTERVAL_MS);
    return () => window.clearInterval(pollId);
  }, [geracaoPorPerfilAtiva, classeId, conteudoId, topicoId]);

  useEffect(() => () => {
    porPerfilRequestId.current += 1;
    porPerfilRefreshPendente.current = false;
  }, []);

  useEffect(() => {
    if (!gerarTudoJob || !ACTIVE_JOB_STATUSES.has(gerarTudoJob.status)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const token = await resolveToken();
        const updated = await fetchPersonalizacaoJobStatus(token, gerarTudoJob.id);
        if (cancelled) return;
        setGerarTudoJob(updated);
        if (!ACTIVE_JOB_STATUSES.has(updated.status)) {
          void loadPorPerfil({ silent: true, queueIfBusy: true });
        }
      } catch (error) {
        if (!cancelled) {
          setGerarTudoError(error instanceof Error ? error.message : "Falha ao consultar progresso.");
        }
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gerarTudoJob, resolveToken, loadPorPerfil]);

  const handleGerarTudo = async () => {
    if (!classeId) return;
    setGerarTudoError(null);
    try {
      const token = await resolveToken();
      const job = await enqueueManualGenerateAllJob(token, {
        classeId: Number(classeId),
        perfil: perfilParaGerarTudo,
      });
      setGerarTudoJob(job);
    } catch (error) {
      setGerarTudoError(error instanceof Error ? error.message : "Falha ao enfileirar geração.");
    }
  };

  // Busca contexto do aluno (visao 3)
  const loadContexto = useCallback(async () => {
    const numericClasse = Number(classeId);
    if (!alunoId || !Number.isFinite(numericClasse) || numericClasse <= 0) {
      setContextoAluno(null);
      return;
    }
    setContextoLoading(true);
    setContextoError(null);
    try {
      const token = await resolveToken();
      const numericTopico = Number(topicoId);
      const data = await fetchContextoDocente(token, {
        alunoId,
        classeId: numericClasse,
        topicoId: Number.isFinite(numericTopico) && numericTopico > 0 ? numericTopico : undefined,
      });
      setContextoAluno(data);
    } catch (error) {
      setContextoAluno(null);
      setContextoError(error instanceof Error ? error.message : "Falha ao carregar contexto do aluno.");
    } finally {
      setContextoLoading(false);
    }
  }, [alunoId, classeId, topicoId, resolveToken]);

  useEffect(() => {
    void loadContexto();
  }, [loadContexto]);

  // Busca adequacao de grupo — distribuicao de perfis BrainHex da turma (visao 4)
  const loadGrupo = useCallback(async () => {
    const numericClasse = Number(classeId);
    if (!Number.isFinite(numericClasse) || numericClasse <= 0) {
      setGrupoResumo(null);
      return;
    }
    setGrupoLoading(true);
    setGrupoError(null);
    try {
      const token = await resolveToken();
      const data = await fetchAdequacaoGrupo(token, { classeId: numericClasse });
      setGrupoResumo(data);
    } catch (error) {
      setGrupoResumo(null);
      setGrupoError(error instanceof Error ? error.message : "Falha ao carregar adequação de grupo.");
    } finally {
      setGrupoLoading(false);
    }
  }, [classeId, resolveToken]);

  useEffect(() => {
    void loadGrupo();
  }, [loadGrupo]);

  // Entrou direto na pagina do material (link/refresh): restaura a selecao a
  // partir da query antes de qualquer carregamento, senao a secao nao teria o
  // que buscar. So semeia o que ainda esta vazio - nao atropela navegacao
  // normal, em que a selecao ja existe.
  useEffect(() => {
    if (!materialRouteParams) return;
    if (materialRouteParams.classeId && !classeId) setClasseId(materialRouteParams.classeId);
    if (materialRouteParams.topicoId && !topicoId) setTopicoId(materialRouteParams.topicoId);
    if (materialRouteParams.conteudoId && !conteudoId) setConteudoId(materialRouteParams.conteudoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialRouteParams?.classeId, materialRouteParams?.topicoId, materialRouteParams?.conteudoId]);

  // "Atualizado há N min" envelhece sozinho.
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // Status da personalização de cada aluno no conteúdo aberto (leitura direta do banco).
  useEffect(() => {
    const cid = Number(classeId);
    const coid = Number(conteudoId);
    if (!cid || !coid) {
      setRegistrosAluno([]);
      return;
    }
    let ativo = true;
    setRegistrosAlunoLoading(true);
    fetchRegistrosPorAluno(cid, coid)
      .then((r) => ativo && setRegistrosAluno(r))
      .catch(() => ativo && setRegistrosAluno([]))
      .finally(() => ativo && setRegistrosAlunoLoading(false));
    return () => {
      ativo = false;
    };
  }, [classeId, conteudoId, porPerfil]);

  const statusAlunos = useMemo(() => montarStatusPorAluno(alunos, registrosAluno, agora), [alunos, registrosAluno, agora]);

  const handleReprocessarFalhas = useCallback(async () => {
    const token = session?.access_token || (await resolveToken());
    if (!token || !classeId || reprocessando) return;
    setReprocessando(true);
    try {
      await enqueueManualRetryJob(token, {
        classe_id: Number(classeId),
        topico_ids: topicoId ? [Number(topicoId)] : undefined,
        conteudo_ids: conteudoId ? [Number(conteudoId)] : undefined,
        reason: "retry_manual_console",
      });
      toast.success("Nova tentativa enfileirada para os perfis com falha.");
      void loadPorPerfil({ silent: true, queueIfBusy: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao reprocessar.");
    } finally {
      setReprocessando(false);
    }
  }, [session, resolveToken, classeId, topicoId, conteudoId, reprocessando, loadPorPerfil]);

  const alunoSelecionado = useMemo(() => alunos.find((a) => a.id === alunoId) ?? null, [alunos, alunoId]);
  const conteudoSelecionado = useMemo(
    () => conteudos.find((item) => String(item.id) === conteudoId) ?? null,
    [conteudoId, conteudos]
  );

  const perfilDoAluno = useMemo(() => {
    if (!alunoSelecionado || !porPerfil) return null;
    const key = alunoSelecionado.perfil_dominante;
    return porPerfil.perfis.find((p) => p.perfil === key) ?? null;
  }, [alunoSelecionado, porPerfil]);

  if (materialRouteParams) {
    const voltarParaLista = () => navigate(consolePathForViewPersonalizacoes());
    const itemDoPerfil =
      porPerfil?.perfis.find((p) => p.perfil === materialRouteParams.perfil) ?? null;

    if (itemDoPerfil) {
      return (
        <PerfilConteudoPage
          item={itemDoPerfil}
          initialTab={materialRouteParams.aba as MaterialTipo | undefined}
          classeId={Number(classeId) || undefined}
          topicoId={Number(topicoId) || undefined}
          topicoTitulo={topicos.find((t) => String(t.id) === topicoId)?.nome ?? undefined}
          conteudoTitulo={conteudoSelecionado?.titulo}
          resolveToken={resolveToken}
          onRegenerated={() => void loadPorPerfil({ silent: true })}
          onVoltar={voltarParaLista}
        />
      );
    }

    if (porPerfilLoading || !porPerfil) {
      return <p className="py-12 text-center text-sm text-muted-foreground">Carregando material...</p>;
    }

    return (
      <div className="py-12 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Nao encontramos material do perfil <span className="capitalize">{materialRouteParams.perfil}</span>{" "}
          para esta selecao.
        </p>
        <Button variant="outline" size="sm" onClick={voltarParaLista}>
          Voltar para a lista
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[32px] font-bold uppercase leading-tight tracking-wide">Personalizações</h2>
          <p className="mt-2 text-[14.5px] text-muted-foreground">
            Compare como o material fica para cada perfil BrainHex e visualize a personalização efetiva por aluno.
          </p>
        </div>
        {carregadoEm && (
          <span role="status" className="flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full bg-success ${geracaoPorPerfilAtiva ? "animate-pulse" : ""}`} />
            {geracaoPorPerfilAtiva ? "Atualizando automaticamente" : formatarAtualizadoHa(carregadoEm, agora)}
          </span>
        )}
      </div>

      <Card className="rounded-[20px]">
        <CardContent className="console-filters flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <p className={ROTULO}>Classe</p>
            <Select value={classeId} onValueChange={handleClasseChange}>
              <SelectTrigger className="w-56 rounded-[14px]">
                <SelectValue placeholder="Selecione a classe" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.descricao || `Classe ${c.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className={ROTULO}>Tópico</p>
            <Select value={topicoId} onValueChange={handleTopicoChange} disabled={topicos.length === 0}>
              <SelectTrigger className="w-56 rounded-[14px]">
                <SelectValue placeholder="Selecione o tópico" />
              </SelectTrigger>
              <SelectContent>
                {topicos.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nome || `Tópico ${t.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className={ROTULO}>Conteúdo</p>
            <Select
              value={conteudoId}
              onValueChange={(value) => {
                porPerfilRequestId.current += 1;
                setConteudoId(value);
                setPorPerfil(null);
                setPorPerfilLoading(false);
                setPorPerfilError(null);
              }}
              disabled={conteudosLoading || conteudos.length === 0}
            >
              <SelectTrigger className="w-64 rounded-[14px]">
                <SelectValue
                  placeholder={conteudosLoading ? "Carregando conteúdos..." : "Nenhum conteúdo neste tópico"}
                />
              </SelectTrigger>
              <SelectContent>
                {conteudos.map((conteudo) => (
                  <SelectItem key={conteudo.id} value={String(conteudo.id)}>
                    {conteudo.titulo || `Conteúdo ${conteudo.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {conteudosError && <p className="text-xs text-destructive">{conteudosError}</p>}
          </div>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => void loadPorPerfil()}
            disabled={porPerfilLoading || conteudosLoading || Boolean(conteudosError)}
          >
            {porPerfilLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Atualizar</>}
          </Button>

          <div className="flex flex-wrap items-end gap-2 sm:border-l sm:pl-4 sm:ml-2">
            <div className="space-y-1">
              <p className={ROTULO}>Gerar tudo para o perfil</p>
              <Select value={perfilParaGerarTudo} onValueChange={setPerfilParaGerarTudo}>
                <SelectTrigger className="w-44 rounded-[14px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRAINHEX_PROFILE_KEYS.map((perfil) => (
                    <SelectItem key={perfil} value={perfil}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_DO_PERFIL[perfil].marca }} />
                        {NOME_DO_PERFIL[perfil]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="rounded-full font-bold"
              onClick={() => void handleGerarTudo()}
              disabled={!classeId || gerarTudoAtivo}
            >
              {gerarTudoAtivo
                ? `Gerando ${gerarTudoJob!.processed_targets}/${gerarTudoJob!.total_targets}${
                    gerarTudoJob!.error_count > 0 ? ` (${gerarTudoJob!.error_count} erro(s))` : ""
                  }`
                : <><Sparkles className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Gerar tudo</>}
            </Button>
          </div>
          {gerarTudoError && <p className="w-full text-xs text-destructive">{gerarTudoError}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="por-perfil" className="space-y-4">
        <TabsList className="flex h-auto w-fit max-w-full flex-wrap justify-start gap-1 rounded-full border bg-card p-1.5">
          <TabsTrigger value="por-perfil" className={ABA}>
            <Layers className="h-4 w-4 mr-2" />
            Por perfil
          </TabsTrigger>
          <TabsTrigger value="estrutura" className={ABA}>
            <Palette className="h-4 w-4 mr-2" />
            Estrutura e paleta
          </TabsTrigger>
          <TabsTrigger value="por-aluno" className={ABA}>
            <UserSearch className="h-4 w-4 mr-2" />
            Por aluno
          </TabsTrigger>
          <TabsTrigger value="grupo" className={ABA}>
            <Users className="h-4 w-4 mr-2" />
            Turma
          </TabsTrigger>
        </TabsList>

        {/* Visao 1: material lado a lado pelos 7 perfis */}
        <TabsContent value="por-perfil" className="space-y-4">
          {porPerfilError && !porPerfil ? (
            <Card>
              <CardContent className="pt-6 text-sm text-destructive">{porPerfilError}</CardContent>
            </Card>
          ) : porPerfilLoading && !porPerfil ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando personalizações...
              </CardContent>
            </Card>
          ) : !porPerfil ? (
            <EstadoVazio
              titulo="Escolha uma classe e um tópico"
              texto="O painel mostra o andamento da geração por perfil, por aluno e no agregado da turma. Selecione acima para começar."
            />
          ) : (
            <>
              {porPerfilError && (
                <Card>
                  <CardContent className="pt-6 text-sm text-destructive" role="alert">
                    A atualização automática falhou. Os últimos dados recebidos continuam visíveis. {porPerfilError}
                  </CardContent>
                </Card>
              )}
              <ConteudoGeracaoResumo
                response={porPerfil}
                tituloFallback={
                  conteudoSelecionado?.titulo ||
                  (conteudoSelecionado ? `Conteúdo ${conteudoSelecionado.id}` : "Conteúdo selecionado")
                }
                atualizando={geracaoPorPerfilAtiva}
                onReprocessar={() => void handleReprocessarFalhas()}
                reprocessando={reprocessando}
              />
              {porPerfil.perfis.some(
                (p) => p.tem_personalizacao || MATERIAL_TIPOS.some(({ key }) => getMaterial(p.materiais, key)),
              ) ? (
                <PerfisTabela
                  perfis={porPerfil.perfis}
                  classeId={Number(classeId)}
                  topicoId={Number(topicoId)}
                  conteudoId={conteudoId ? Number(conteudoId) : undefined}
                  conteudoTitulo={porPerfil.conteudo_titulo || conteudoSelecionado?.titulo || "Conteúdo selecionado"}
                  resolveToken={resolveToken}
                  onRegenerated={() => void loadPorPerfil({ silent: true, queueIfBusy: true })}
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {porPerfil.perfis.map((item) => (
                    <PerfilMaterialCard
                      key={item.perfil}
                      item={item}
                      classeId={Number(classeId)}
                      topicoId={Number(topicoId)}
                      conteudoId={conteudoId ? Number(conteudoId) : undefined}
                      resolveToken={resolveToken}
                      onRegenerated={() => void loadPorPerfil({ silent: true, queueIfBusy: true })}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Visao 2: plano (estrutura de apresentacao) + design tokens */}
        <TabsContent value="estrutura" className="space-y-4">
          {!porPerfil ? (
            <EstadoVazio
              titulo="Escolha uma classe, um tópico e um conteúdo"
              texto="Aqui aparecem o tom, o estilo e a paleta que cada perfil recebe."
            />
          ) : (
            <Card className="overflow-hidden rounded-[20px]">
              <div className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-5">
                <h3 className="text-[17px] font-bold">Estrutura e paleta por perfil</h3>
                <span className="ml-auto text-xs text-muted-foreground">{porPerfil.conteudo_titulo || conteudoSelecionado?.titulo}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead>
                    <tr className="bg-muted text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                      {["Perfil", "Tom", "Estilo", "Nível", "Prioritário", "Paleta"].map((c, i) => (
                        <th key={c} className={`py-[11px] font-semibold ${i === 0 ? "px-6" : ""}`}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {porPerfil.perfis.map((item) => (
                      <tr key={item.perfil} className="border-t align-middle">
                        <td className="px-6 py-3.5">
                          <span className="flex items-center gap-2.5 text-sm font-bold capitalize">
                            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: item.cor || corDoPerfil(item.perfil) }} />
                            {item.perfil_label}
                          </span>
                        </td>
                        <td className="py-3.5 pr-3 text-[12.5px]">{planoText(item.plano, "tom") || "—"}</td>
                        <td className="py-3.5 pr-3 text-[12.5px]">{planoText(item.plano, "estilo") || "—"}</td>
                        <td className="py-3.5 pr-3 text-[12.5px]">{planoText(item.plano, "nivel") || "—"}</td>
                        <td className="py-3.5 pr-3 text-[12.5px] capitalize">{item.formato_prioritario || "—"}</td>
                        <td className="py-3.5 pr-6">
                          <PaletaPreview item={item} compacta />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Visao 3: preview por aluno reutilizando o contexto docente */}
        <TabsContent value="por-aluno" className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 pt-6">
              <div className="space-y-1">
                <p className={ROTULO}>Aluno</p>
                <Select value={alunoId} onValueChange={setAlunoId} disabled={alunos.length === 0}>
                  <SelectTrigger className="w-72 rounded-[14px]">
                    <SelectValue placeholder="Selecione o aluno" />
                  </SelectTrigger>
                  <SelectContent>
                    {alunos.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome || a.email || a.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <ListaAlunos
            linhas={filtrarPorNome(statusAlunos, buscaAluno)}
            total={statusAlunos.length}
            busca={buscaAluno}
            onBusca={setBuscaAluno}
            carregando={registrosAlunoLoading}
            semConteudo={!conteudoId}
            selecionado={alunoId}
            onSelecionar={setAlunoId}
          />

          {contextoError ? (
            <Card>
              <CardContent className="pt-6 text-sm text-destructive">{contextoError}</CardContent>
            </Card>
          ) : contextoLoading ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando contexto do aluno...
              </CardContent>
            </Card>
          ) : !alunoSelecionado ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Selecione um aluno para ver a personalização efetiva dele.
              </CardContent>
            </Card>
          ) : (
            <>
              <AlunoPreview
                aluno={alunoSelecionado}
                contexto={contextoAluno}
                perfilDoAluno={perfilDoAluno}
                conteudoId={conteudoSelecionado?.id}
                onAbrirDashboard={() =>
                  navigate(`${consolePathForView("dashboard")}?turma=${classeId}&aluno=${alunoSelecionado.id}`)
                }
                onVerMaterial={
                  conteudoSelecionado
                    ? () =>
                        navigate(
                          buildMaterialPath({
                            classeId,
                            topicoId,
                            conteudoId: String(conteudoSelecionado.id),
                            perfil: alunoSelecionado.perfil_dominante,
                            aba: "markdown",
                          })
                        )
                    : undefined
                }
              />
              <SugestaoMaterialCard
                alunoId={alunoSelecionado.id}
                topicoId={topicoId ? Number(topicoId) : undefined}
                resolveToken={resolveToken}
              />
            </>
          )}
        </TabsContent>

        {/* Visao 4: adequacao de grupo — distribuicao de perfis e desempenho medio da turma */}
        <TabsContent value="grupo" className="space-y-4">
          {grupoError ? (
            <Card>
              <CardContent className="pt-6 text-sm text-destructive">{grupoError}</CardContent>
            </Card>
          ) : grupoLoading ? (
            <Card>
              <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando adequação de grupo...
              </CardContent>
            </Card>
          ) : !grupoResumo ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Selecione uma classe para ver a distribuição de perfis da turma.
              </CardContent>
            </Card>
          ) : (
            <GrupoResumo resumo={grupoResumo} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const DESEMPENHO_LABELS: Record<string, string> = {
  media_acertos: "Média de acertos",
  percentual_concluido: "Conclusão média",
  nota_media: "Nota média",
};

function GrupoResumo({ resumo }: { resumo: ClassePerfilSummaryResponse }) {
  const perfis = Object.entries(resumo.distribuicao).sort(([, a], [, b]) => b.percentual - a.percentual);
  const desempenho = Object.entries(resumo.media_desempenho).filter(([key]) => DESEMPENHO_LABELS[key]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alunos na turma</CardDescription>
            <CardTitle className="text-2xl">{resumo.total_alunos}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Perfil predominante</CardDescription>
            <CardTitle className="text-2xl capitalize">{resumo.perfil_predominante || "—"}</CardTitle>
          </CardHeader>
        </Card>
        {desempenho.map(([key, value]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardDescription>{DESEMPENHO_LABELS[key]}</CardDescription>
              <CardTitle className="text-2xl">{value.toFixed(1)}%</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição de perfis BrainHex</CardTitle>
          <CardDescription>
            Perfil dominante de cada aluno da turma, usado para priorizar os formatos gerados para o grupo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {perfis.every(([, item]) => item.quantidade === 0) ? (
            <p className="text-sm text-muted-foreground">
              Nenhum aluno com perfil BrainHex definido nesta turma ainda.
            </p>
          ) : (
            perfis.map(([chave, item]) => (
              <div key={chave} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium capitalize">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: corDoPerfil(chave) }} />
                    {item.perfil}
                  </span>
                  <span className="text-muted-foreground">
                    {item.quantidade} aluno(s) · {item.percentual.toFixed(1)}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(item.percentual)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${item.perfil}: ${item.percentual.toFixed(1)}%`}
                  className="h-2 overflow-hidden rounded-full bg-secondary"
                >
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, item.percentual)}%`, background: corDoPerfil(chave) }} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConteudoGeracaoResumo({
  response,
  tituloFallback,
  atualizando,
  onReprocessar,
  reprocessando,
}: {
  response: PersonalizacaoPorPerfilResponse;
  tituloFallback: string;
  atualizando: boolean;
  onReprocessar: () => void;
  reprocessando: boolean;
}) {
  const calculado = resumirGeracaoConteudo(response.perfis);
  const recebido =
    Number(response.geracao_resumo?.total_perfis ?? 0) > 0
      ? response.geracao_resumo
      : null;
  const totalPerfis = recebido?.total_perfis ?? calculado.totalPerfis;
  const perfisProntos = recebido?.perfis_prontos ?? calculado.perfisProntos;
  const perfisAtivos =
    recebido?.perfis_em_andamento ??
    recebido?.perfis_ativos ??
    calculado.perfisAtivos;
  const perfisParciais = recebido?.perfis_parciais ?? calculado.perfisParciais;
  const perfisFalhos =
    recebido?.perfis_com_falha ??
    recebido?.perfis_falhos ??
    calculado.perfisFalhos;
  const perfisSemMaterial =
    recebido?.perfis_sem_material ?? calculado.perfisSemMaterial;
  const progresso = limitarPercentual(
    recebido?.progresso_percentual ?? calculado.progressoPercentual
  );
  const atualizadoEm = recebido?.updated_at;

  const comFalha = response.perfis.filter((p) => statusGeracaoDoPerfil(p) === "falhou");

  return (
    <div className="space-y-3" role="region" aria-labelledby="resumo-geracao-conteudo">
      {comFalha.length > 0 && (
        <div role="alert" className="flex items-start gap-3.5 rounded-2xl border border-destructive/50 bg-destructive/15 px-5 py-4">
          <span aria-hidden="true" className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-destructive text-destructive-foreground">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold">
              {comFalha.length === 1 ? "1 perfil precisa da sua atenção" : `${comFalha.length} perfis precisam da sua atenção`}
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {comFalha.map((p) => p.perfil_label).join(", ")} {comFalha.length === 1 ? "falhou" : "falharam"} na geração. Os demais perfis seguem normalmente.
            </p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto flex-none rounded-full border-destructive/50" onClick={onReprocessar} disabled={reprocessando || atualizando}>
            {reprocessando ? "Enfileirando…" : "Reprocessar falhas"}
          </Button>
        </div>
      )}
      <Card className="rounded-[20px]">
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="resumo-geracao-conteudo" className="text-lg font-bold">
                {response.conteudo_titulo || tituloFallback}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">Conteúdo ampliado e gerado por blocos</p>
            </div>
            {atualizando && (
              <Badge variant="secondary" className="gap-1" role="status" aria-live="polite">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Atualizando automaticamente
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium">Progresso dos perfis</span>
            <span className="tabular-nums text-muted-foreground">{progresso}%</span>
          </div>
          <Progress value={progresso} className="h-2" aria-label={`Progresso geral da geração: ${progresso}%`} />
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-success">
              <Check className="h-3 w-3" aria-hidden="true" />
              {perfisProntos} de {totalPerfis} pronto(s)
            </span>
            {perfisAtivos > 0 && <span className="rounded-full bg-primary/15 px-3 py-1 text-primary">{perfisAtivos} gerando</span>}
            {perfisParciais > 0 && <span className="rounded-full bg-warning/15 px-3 py-1 text-warning">{perfisParciais} parcial(is)</span>}
            {perfisFalhos > 0 && <span className="rounded-full bg-destructive/15 px-3 py-1 text-destructive">{perfisFalhos} com falha</span>}
            {perfisSemMaterial > 0 && <span className="rounded-full border px-3 py-1 text-muted-foreground">{perfisSemMaterial} sem material</span>}
          </div>
          {atualizadoEm && (
            <p className="text-xs text-muted-foreground">Atualizado em {new Date(atualizadoEm).toLocaleString("pt-BR")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PaletaPreview({ item, compacta = false }: { item: PersonalizacaoPerfilItem; compacta?: boolean }) {
  const cores = item.design_tokens?.cores;
  if (!cores) return null;
  const swatches: Array<{ label: string; value: string }> = [
    { label: "Fundo", value: cores.background },
    { label: "Superfície", value: cores.surface },
    { label: "Primária", value: cores.primary },
    { label: "Borda", value: cores.border },
    { label: "Texto", value: cores.text_primary },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {swatches.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1">
          <div
            className={compacta ? "h-[18px] w-[18px] rounded-full border" : "h-8 w-8 rounded-md border"}
            style={{ backgroundColor: s.value }}
            title={`${s.label}: ${s.value}`}
          />
          {!compacta && <span className="text-[10px] text-muted-foreground">{s.label}</span>}
        </div>
      ))}
    </div>
  );
}

function PerfisTabela({
  perfis,
  classeId,
  topicoId,
  conteudoId,
  conteudoTitulo,
  resolveToken,
  onRegenerated,
}: {
  perfis: PersonalizacaoPerfilItem[];
  classeId: number;
  topicoId: number;
  conteudoId?: number;
  conteudoTitulo: string;
  resolveToken: () => Promise<string>;
  onRegenerated: () => void;
}) {
  const ordenados = [...perfis].sort((a, b) => (b.total_alunos ?? 0) - (a.total_alunos ?? 0));
  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-5">
        <h3 className="text-[17px] font-bold">Comparativo dos 7 perfis — ordenado por alunos matriculados</h3>
        <span className="ml-auto text-xs text-muted-foreground">{conteudoTitulo}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="bg-muted text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              <th className="px-6 py-[11px] font-semibold">Perfil</th>
              <th className="py-[11px] font-semibold">Alunos</th>
              <th className="py-[11px] font-semibold">Status</th>
              {MATERIAL_TIPOS.map(({ key, label }) => (
                <th key={key} className="py-[11px] font-semibold">
                  {label}
                </th>
              ))}
              <th className="px-6 py-[11px]">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((item) => (
              <PerfilLinha
                key={item.perfil}
                item={item}
                classeId={classeId}
                topicoId={topicoId}
                conteudoId={conteudoId}
                resolveToken={resolveToken}
                onRegenerated={onRegenerated}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PerfilLinha({
  item,
  classeId,
  topicoId,
  conteudoId,
  resolveToken,
  onRegenerated,
}: {
  item: PersonalizacaoPerfilItem;
  classeId: number;
  topicoId: number;
  conteudoId?: number;
  resolveToken: () => Promise<string>;
  onRegenerated: () => void;
}) {
  const navigate = useNavigate();
  const { manualJob, manualJobError, manualJobAtivo, handleGerar } = useGerarPerfil({
    item,
    classeId,
    topicoId,
    conteudoId,
    resolveToken,
    onRegenerated,
  });
  const geracao = item.geracao;
  const geracaoAtiva = isGeracaoStatusAtivo(statusGeracaoDoPerfil(item));
  const statusBadge = getPersonalizacaoStatusBadge({
    temPersonalizacao: item.tem_personalizacao,
    geracaoStatus: geracao?.status,
    status: item.personalizacao?.status,
    updatedAt: item.personalizacao?.updated_at,
    geradoEm: item.personalizacao?.gerado_em ?? item.gerado_em,
  });
  const erro = descreverErroDatado(geracao?.erro, geracao?.updated_at);
  const temAlgumMaterial = MATERIAL_TIPOS.some(({ key }) => getMaterial(item.materiais, key));
  const abrir = (aba: MaterialTipo) =>
    navigate(
      buildMaterialPath({
        classeId: String(classeId),
        topicoId: String(topicoId),
        conteudoId: conteudoId != null ? String(conteudoId) : undefined,
        perfil: item.perfil,
        aba,
      })
    );
  const corStatus =
    statusBadge.variant === "default"
      ? "bg-success/15 text-success"
      : statusBadge.variant === "destructive"
        ? "bg-destructive/15 text-destructive"
        : statusBadge.variant === "secondary"
          ? "bg-primary/15 text-primary"
          : "border text-muted-foreground";

  return (
    <tr className="border-t align-top" aria-label={`Geração para o perfil ${item.perfil_label}`}>
      <td className="px-6 py-3.5">
        <span className="flex items-center gap-2.5 text-sm font-bold capitalize">
          <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: item.cor || corDoPerfil(item.perfil) }} />
          {item.perfil_label}
        </span>
      </td>
      <td className="py-3.5 text-sm tabular-nums">{item.total_alunos}</td>
      <td className="py-3.5 pr-3">
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${corStatus}`}>
          {geracaoAtiva && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
          {statusBadge.label}
        </span>
        {erro && (
          <p className="mt-1.5 max-w-[220px] text-[11px] text-destructive" role="alert">
            {erro}
          </p>
        )}
        {manualJobError && (
          <p className="mt-1.5 max-w-[220px] text-[11px] text-destructive" role="alert">
            {manualJobError}
          </p>
        )}
      </td>
      {MATERIAL_TIPOS.map(({ key }) => {
        const material = getMaterial(item.materiais, key);
        const formato = resolverGeracaoFormato(item, key, Boolean(material));
        const ativo = formato.status === "na_fila" || formato.status === "gerando";
        return (
          <td key={key} className="py-3.5 pr-3 text-[12.5px]">
            <span className={formato.status === "pronto" ? "text-foreground" : formato.status === "falhou" ? "text-destructive" : "text-muted-foreground"}>
              {ativo && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" />}
              {getFormatoStatusBadge(formato.status, formato.label).label}
            </span>
            {material && (
              <button type="button" onClick={() => abrir(key)} className="ml-2 text-xs text-primary underline underline-offset-2">
                {formato.status === "pronto" ? "ver" : "ver anterior"}
              </button>
            )}
          </td>
        );
      })}
      <td className="px-6 py-3 text-right">
        <div className="flex justify-end gap-2">
          {temAlgumMaterial && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => abrir(MATERIAL_TIPOS.find(({ key }) => getMaterial(item.materiais, key))?.key ?? "markdown")}
            >
              Ver
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => void handleGerar()} disabled={manualJobAtivo}>
            {manualJobAtivo ? `Gerando ${manualJob!.processed_targets}/${manualJob!.total_targets}` : temAlgumMaterial ? "Regerar" : "Gerar"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Geração manual de um perfil: enfileira o job e acompanha até terminar. Usada pelo cartão e pela linha da tabela. */
function useGerarPerfil({
  item,
  classeId,
  topicoId,
  conteudoId,
  resolveToken,
  onRegenerated,
}: {
  item: PersonalizacaoPerfilItem;
  classeId: number;
  topicoId: number;
  conteudoId?: number;
  resolveToken: () => Promise<string>;
  onRegenerated: () => void;
}) {
  const [manualJob, setManualJob] = useState<PersonalizacaoJobResumo | null>(null);
  const [manualJobError, setManualJobError] = useState<string | null>(null);
  const manualJobAtivo = Boolean(manualJob && ACTIVE_JOB_STATUSES.has(manualJob.status));

  useEffect(() => {
    if (!manualJob || !ACTIVE_JOB_STATUSES.has(manualJob.status)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const token = await resolveToken();
        const updated = await fetchPersonalizacaoJobStatus(token, manualJob.id);
        if (cancelled) return;
        setManualJob(updated);
        if (!ACTIVE_JOB_STATUSES.has(updated.status)) {
          onRegenerated();
        }
      } catch (error) {
        if (!cancelled) {
          setManualJobError(error instanceof Error ? error.message : "Falha ao consultar progresso.");
        }
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [manualJob, resolveToken, onRegenerated]);

  const handleGerar = async () => {
    setManualJobError(null);
    try {
      const token = await resolveToken();
      const job = await enqueueManualGenerateJob(token, {
        classeId,
        topicoId,
        conteudoId,
        perfil: item.perfil,
      });
      setManualJob(job);
    } catch (error) {
      setManualJobError(error instanceof Error ? error.message : "Falha ao enfileirar geração.");
    }
  };

  return { manualJob, manualJobError, manualJobAtivo, handleGerar };
}

function PerfilMaterialCard({
  item,
  classeId,
  topicoId,
  conteudoId,
  resolveToken,
  onRegenerated,
}: {
  item: PersonalizacaoPerfilItem;
  classeId: number;
  topicoId: number;
  conteudoId?: number;
  resolveToken: () => Promise<string>;
  onRegenerated: () => void;
}) {
  const navigate = useNavigate();
  // Abre a pagina do material (era um modal): a URL carrega a selecao inteira,
  // entao link direto, refresh e botao voltar funcionam.
  const abrirMaterial = (aba: MaterialTipo) =>
    navigate(
      buildMaterialPath({
        classeId: String(classeId),
        topicoId: String(topicoId),
        conteudoId: conteudoId != null ? String(conteudoId) : undefined,
        perfil: item.perfil,
        aba,
      })
    );
  const { manualJob, manualJobError, manualJobAtivo, handleGerar } = useGerarPerfil({
    item,
    classeId,
    topicoId,
    conteudoId,
    resolveToken,
    onRegenerated,
  });

  const temAlgumMaterial = MATERIAL_TIPOS.some(({ key }) => getMaterial(item.materiais, key));
  const geracaoStatus = statusGeracaoDoPerfil(item);
  const geracaoAtiva = isGeracaoStatusAtivo(geracaoStatus);
  const geracao = item.geracao;
  const statusBadge = getPersonalizacaoStatusBadge({
    temPersonalizacao: item.tem_personalizacao,
    geracaoStatus: geracao?.status,
    status: item.personalizacao?.status,
    updatedAt: item.personalizacao?.updated_at,
    geradoEm: item.personalizacao?.gerado_em ?? item.gerado_em,
  });
  const progresso = limitarPercentual(geracao?.progresso_percentual);
  const blocosTotal = Math.max(0, Number(geracao?.blocos_total ?? 0));
  const blocosPreparados = Math.min(
    blocosTotal,
    Math.max(0, Number(geracao?.blocos_concluidos ?? 0))
  );
  const etapaLabel =
    String(geracao?.etapa_label || geracao?.label || "").trim() ||
    statusBadge.label;
  const erroDatado = descreverErroDatado(geracao?.erro, geracao?.updated_at);

  return (
    <Card className="overflow-hidden" aria-label={`Geração para o perfil ${item.perfil_label}`}>
      <div className="h-1.5 w-full" style={{ backgroundColor: item.cor }} />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base capitalize">{item.perfil_label}</CardTitle>
          <Badge
            variant={statusBadge.variant}
            className={
              geracaoAtiva
                ? "gap-1 bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200"
                : undefined
            }
          >
            {geracaoAtiva && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            {statusBadge.label}
          </Badge>
        </div>
        <CardDescription>
          <span className="capitalize">{item.perfil}</span> · {item.total_alunos} aluno(s) com este perfil
        </CardDescription>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => void handleGerar()} disabled={manualJobAtivo}>
            {manualJobAtivo
              ? `Gerando ${manualJob!.processed_targets}/${manualJob!.total_targets}${
                  manualJob!.error_count > 0 ? ` (${manualJob!.error_count} erro(s))` : ""
                }`
              : "Gerar"}
          </Button>
        </div>
        {manualJobError && (
          <p className="text-xs text-destructive" role="alert">
            {manualJobError}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {geracao && (
          <div
            className="space-y-2 rounded-md border bg-muted/30 p-3"
            role={geracaoAtiva ? "status" : undefined}
            aria-live={geracaoAtiva ? "polite" : undefined}
          >
            <div className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Etapa atual</p>
                <p className="font-medium">{etapaLabel}</p>
              </div>
              <span className="tabular-nums text-muted-foreground">{progresso}%</span>
            </div>
            <Progress
              value={progresso}
              className="h-2"
              aria-label={`Progresso de ${item.perfil_label}: ${progresso}%`}
            />
            {blocosTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                {blocosPreparados} de {blocosTotal} blocos preparados
              </p>
            )}
            {erroDatado && (
              <p className="text-xs text-destructive" role="alert">
                {erroDatado}
              </p>
            )}
          </div>
        )}

        {(item.tem_personalizacao || item.formato_prioritario) && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Formato prioritário</p>
            <p className="font-medium capitalize">{item.formato_prioritario || "misto"}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Materiais</p>
          <div className="flex flex-col gap-2">
            {MATERIAL_TIPOS.map(({ key, label, icon: Icon }) => {
              const material = getMaterial(item.materiais, key);
              const formato = resolverGeracaoFormato(item, key, Boolean(material));
              const formatoBadge = getFormatoStatusBadge(formato.status, formato.label);
              const formatoAtivo = formato.status === "na_fila" || formato.status === "gerando";
              const url =
                materialUrl(material) ||
                (typeof formato.arquivo_url === "string" && formato.arquivo_url.trim()
                  ? formato.arquivo_url.trim()
                  : null);
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      {label}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={formatoBadge.variant}
                        className={formatoAtivo ? "gap-1" : undefined}
                      >
                        {formatoAtivo && (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        )}
                        {formatoBadge.label}
                      </Badge>
                      {material ? (
                        <button
                          type="button"
                          onClick={() => abrirMaterial(key)}
                          className="text-xs text-primary underline underline-offset-2"
                        >
                          {formato.status === "pronto" ? "ver" : "ver anterior"}
                        </button>
                      ) : url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline underline-offset-2"
                        >
                          abrir
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {formato.erro && (
                    <p className="text-right text-xs text-destructive" role="alert">
                      {formato.erro}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {geracaoStatus === "sem_material" && !temAlgumMaterial && (
          <p className="text-sm text-muted-foreground">
            Ainda não há personalização gerada para este perfil no conteúdo selecionado.
          </p>
        )}

        {temAlgumMaterial && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              const primeiraDisponivel =
                MATERIAL_TIPOS.find(({ key }) => getMaterial(item.materiais, key))?.key ??
                "markdown";
              abrirMaterial(primeiraDisponivel);
            }}
          >
            Ver conteúdo completo
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const TOM_CLASSE: Record<LinhaStatusAluno["tom"], string> = {
  pronto: "bg-success/15 text-success",
  andamento: "bg-primary/15 text-primary",
  falha: "bg-destructive/15 text-destructive",
  sem_material: "border text-muted-foreground",
};
const POR_PAGINA_ALUNOS = 10;

function ListaAlunos({
  linhas,
  total,
  busca,
  onBusca,
  carregando,
  semConteudo,
  selecionado,
  onSelecionar,
}: {
  linhas: LinhaStatusAluno[];
  total: number;
  busca: string;
  onBusca: (v: string) => void;
  carregando: boolean;
  semConteudo: boolean;
  selecionado: string;
  onSelecionar: (id: string) => void;
}) {
  const [verTodos, setVerTodos] = useState(false);
  if (total === 0) return null;
  const visiveis = verTodos ? linhas : linhas.slice(0, POR_PAGINA_ALUNOS);
  return (
    <Card className="overflow-hidden rounded-[20px]">
      <div className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-5">
        <div>
          <h3 className="text-[17px] font-bold">Todos os alunos</h3>
          <p className="mt-1 text-xs text-muted-foreground">status da personalização do conteúdo selecionado</p>
        </div>
        <input
          type="search"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar aluno"
          aria-label="Buscar aluno"
          className="ml-auto h-9 w-52 rounded-full border bg-background px-4 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {semConteudo ? (
        <p className="border-t px-6 py-8 text-center text-sm text-muted-foreground">Escolha um conteúdo para ver o status de cada aluno.</p>
      ) : (
        <ul>
          {visiveis.map((l) => (
            <li key={l.alunoId} className="border-t">
              <button
                type="button"
                onClick={() => onSelecionar(l.alunoId)}
                aria-pressed={selecionado === l.alunoId}
                className={`flex w-full items-center gap-3.5 px-6 py-3 text-left hover:bg-muted ${selecionado === l.alunoId ? "bg-primary/10" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-extrabold"
                  style={{ background: `${corDoPerfil(l.perfil)}33`, color: corDoPerfil(l.perfil) }}
                >
                  {iniciais(l.nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{l.nome}</span>
                  <span className="block text-[11.5px] capitalize text-muted-foreground">{l.perfil}</span>
                </span>
                <span className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${TOM_CLASSE[l.tom]}`}>
                  {carregando ? "…" : l.rotulo}
                </span>
              </button>
            </li>
          ))}
          {linhas.length === 0 && <li className="border-t px-6 py-6 text-center text-sm text-muted-foreground">Nenhum aluno encontrado.</li>}
        </ul>
      )}
      <div className="flex items-center gap-3 border-t px-6 py-3.5 text-[11.5px] text-muted-foreground">
        <span>
          {Math.min(visiveis.length, linhas.length)} de {total} alunos
        </span>
        {linhas.length > POR_PAGINA_ALUNOS && (
          <Button variant="outline" size="sm" className="ml-auto rounded-full" onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? "Ver menos" : "Ver todos"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function AlunoPreview({
  aluno,
  contexto,
  perfilDoAluno,
  conteudoId,
  onAbrirDashboard,
  onVerMaterial,
}: {
  aluno: AlunoRow;
  contexto: PersonalizacaoContextoDocenteResponse | null;
  perfilDoAluno: PersonalizacaoPerfilItem | null;
  conteudoId?: number;
  onAbrirDashboard: () => void;
  onVerMaterial?: () => void;
}) {
  const personalizacoes = contexto?.personalizacoes ?? [];
  const efetiva = (
    conteudoId == null
      ? personalizacoes[0]
      : personalizacoes.find((item) => item.conteudo_id === conteudoId)
  ) ?? null;
  const statusBadge = efetiva
    ? getPersonalizacaoStatusBadge({
        temPersonalizacao: true,
        status: efetiva.status,
        updatedAt: efetiva.updated_at,
        geradoEm: efetiva.gerado_em,
      })
    : null;
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {perfilDoAluno && <div className="h-1.5 w-full" style={{ backgroundColor: perfilDoAluno.cor }} />}
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {aluno.nome || aluno.email || aluno.id}
            <Badge variant="secondary" className="capitalize">
              {perfilDoAluno?.perfil_label || aluno.perfil_dominante}
            </Badge>
          </CardTitle>
          <CardDescription>
            Perfil usado: <span className="capitalize">{perfilDoAluno?.perfil_label || aluno.perfil_dominante}</span>
            {aluno.afinidade != null ? ` (${Math.round(aluno.afinidade)}% de afinidade)` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={onAbrirDashboard}>
              Abrir no dashboard
            </Button>
            {onVerMaterial && (
              <Button variant="outline" size="sm" className="rounded-full" onClick={onVerMaterial}>
                Ver material gerado
              </Button>
            )}
          </div>
          {perfilDoAluno && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Paleta aplicada ({perfilDoAluno.perfil})
              </p>
              <PaletaPreview item={perfilDoAluno} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personalização efetiva</CardTitle>
          <CardDescription>Materiais e plano da personalização mais recente do aluno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!efetiva ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma personalização encontrada para este aluno{contexto ? " nesta classe" : ""}.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {efetiva.formato_prioritario || "misto"}
                </Badge>
                {statusBadge && (
                  <Badge
                    variant={statusBadge.variant}
                    className={statusBadge.label === "Gerando..." ? "gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100" : undefined}
                  >
                    {statusBadge.label === "Gerando..." && <Loader2 className="h-3 w-3 animate-spin" />}
                    {statusBadge.label}
                  </Badge>
                )}
                {(efetiva.formatos_gerados ?? []).map((f) => (
                  <Badge key={f} variant="secondary" className="capitalize">
                    {f}
                  </Badge>
                ))}
              </div>
              {efetiva.plano?.justificativa && (
                <p className="text-sm text-muted-foreground">{efetiva.plano.justificativa}</p>
              )}
              <div className="flex flex-col gap-1">
                {MATERIAL_TIPOS.map(({ key, label, icon: Icon }) => {
                  const material = getMaterial(efetiva.materiais, key);
                  const url = materialUrl(material);
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {label}
                      </span>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline underline-offset-2"
                        >
                          abrir
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Etapas geradas: {efetiva.steps?.length ?? 0}
                {efetiva.gerado_em ? ` · gerado em ${new Date(efetiva.gerado_em).toLocaleString("pt-BR")}` : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
