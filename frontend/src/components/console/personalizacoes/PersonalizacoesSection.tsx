import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Layers, Palette, UserSearch, Users, FileText, Music, FileImage, NotebookPen } from "lucide-react";
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
import {
  limitarPercentual,
  resolverGeracaoFormato,
  resumirGeracaoConteudo,
  statusGeracaoDoPerfil,
  temGeracaoAtiva,
} from "./generationStatus";

type ClasseRow = { id: number; descricao: string | null };
type TopicoRow = { id: number; classe_id: number; nome: string | null; ordem: number | null };
type ConteudoRow = { id: number; topico_id: number; titulo: string | null; ordem: number | null };
type AlunoRow = { id: string; nome: string | null; email: string | null; perfil_dominante: string };

type MaterialTipo = "markdown" | "pdf" | "audio" | "apresentacao";

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
          topicoTitulo={topicos.find((t) => String(t.id) === topicoId)?.titulo}
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
      <div>
        <h2 className="text-2xl font-bold">Personalizações</h2>
        <p className="text-muted-foreground">
          Compare como o material fica para cada perfil BrainHex e visualize a personalização efetiva por aluno.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Classe</p>
            <Select value={classeId} onValueChange={handleClasseChange}>
              <SelectTrigger className="w-56">
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
            <p className="text-xs font-medium text-muted-foreground">Tópico</p>
            <Select value={topicoId} onValueChange={handleTopicoChange} disabled={topicos.length === 0}>
              <SelectTrigger className="w-56">
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
            <p className="text-xs font-medium text-muted-foreground">Conteúdo</p>
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
              <SelectTrigger className="w-64">
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
            size="sm"
            onClick={() => void loadPorPerfil()}
            disabled={porPerfilLoading || conteudosLoading || Boolean(conteudosError)}
          >
            {porPerfilLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>

          <div className="flex items-end gap-2 border-l pl-4 ml-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Gerar tudo para o perfil</p>
              <Select value={perfilParaGerarTudo} onValueChange={setPerfilParaGerarTudo}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRAINHEX_PROFILE_KEYS.map((perfil) => (
                    <SelectItem key={perfil} value={perfil}>
                      {perfil}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleGerarTudo()}
              disabled={!classeId || gerarTudoAtivo}
            >
              {gerarTudoAtivo
                ? `Gerando ${gerarTudoJob!.processed_targets}/${gerarTudoJob!.total_targets}${
                    gerarTudoJob!.error_count > 0 ? ` (${gerarTudoJob!.error_count} erro(s))` : ""
                  }`
                : "Gerar tudo"}
            </Button>
          </div>
          {gerarTudoError && <p className="w-full text-xs text-destructive">{gerarTudoError}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="por-perfil" className="space-y-4">
        <TabsList>
          <TabsTrigger value="por-perfil">
            <Layers className="h-4 w-4 mr-2" />
            Por perfil
          </TabsTrigger>
          <TabsTrigger value="estrutura">
            <Palette className="h-4 w-4 mr-2" />
            Estrutura e paleta
          </TabsTrigger>
          <TabsTrigger value="por-aluno">
            <UserSearch className="h-4 w-4 mr-2" />
            Por aluno
          </TabsTrigger>
          <TabsTrigger value="grupo">
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
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Selecione uma classe e um tópico para comparar os perfis.
              </CardContent>
            </Card>
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
              />
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
            </>
          )}
        </TabsContent>

        {/* Visao 2: plano (estrutura de apresentacao) + design tokens */}
        <TabsContent value="estrutura" className="space-y-4">
          {!porPerfil ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Selecione uma classe, um tópico e um conteúdo para ver a estrutura de apresentação por perfil.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {porPerfil.perfis.map((item) => (
                <PerfilEstruturaCard key={item.perfil} item={item} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Visao 3: preview por aluno reutilizando o contexto docente */}
        <TabsContent value="por-aluno" className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 pt-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Aluno</p>
                <Select value={alunoId} onValueChange={setAlunoId} disabled={alunos.length === 0}>
                  <SelectTrigger className="w-72">
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
            <AlunoPreview
              aluno={alunoSelecionado}
              contexto={contextoAluno}
              perfilDoAluno={perfilDoAluno}
              conteudoId={conteudoSelecionado?.id}
            />
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
                  <span className="font-medium capitalize">{item.perfil}</span>
                  <span className="text-muted-foreground">
                    {item.quantidade} aluno(s) · {item.percentual.toFixed(1)}%
                  </span>
                </div>
                <Progress value={item.percentual} />
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
}: {
  response: PersonalizacaoPorPerfilResponse;
  tituloFallback: string;
  atualizando: boolean;
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

  return (
    <Card aria-labelledby="resumo-geracao-conteudo">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle id="resumo-geracao-conteudo" className="text-base">
              {response.conteudo_titulo || tituloFallback}
            </CardTitle>
            <CardDescription>Conteúdo ampliado e gerado por blocos</CardDescription>
          </div>
          {atualizando && (
            <Badge
              variant="secondary"
              className="gap-1 bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-200"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Atualizando automaticamente
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium">Progresso dos perfis</span>
          <span className="tabular-nums text-muted-foreground">{progresso}%</span>
        </div>
        <Progress
          value={progresso}
          className="h-2"
          aria-label={`Progresso geral da geração: ${progresso}%`}
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="default">
            {perfisProntos} de {totalPerfis} pronto(s)
          </Badge>
          {perfisAtivos > 0 && <Badge variant="secondary">{perfisAtivos} em andamento</Badge>}
          {perfisParciais > 0 && <Badge variant="secondary">{perfisParciais} parcial(is)</Badge>}
          {perfisFalhos > 0 && <Badge variant="destructive">{perfisFalhos} com falha</Badge>}
          {perfisSemMaterial > 0 && <Badge variant="outline">{perfisSemMaterial} sem material</Badge>}
        </div>
        {atualizadoEm && (
          <p className="text-xs text-muted-foreground">
            Atualizado em {new Date(atualizadoEm).toLocaleString("pt-BR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PaletaPreview({ item }: { item: PersonalizacaoPerfilItem }) {
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
            className="h-8 w-8 rounded-md border"
            style={{ backgroundColor: s.value }}
            title={`${s.label}: ${s.value}`}
          />
          <span className="text-[10px] text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
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
            {geracao.erro && (
              <p className="text-xs text-destructive" role="alert">
                {geracao.erro}
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

function PerfilEstruturaCard({ item }: { item: PersonalizacaoPerfilItem }) {
  const formatos = item.formatos_gerados ?? [];
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 w-full" style={{ backgroundColor: item.cor }} />
      <CardHeader className="pb-3">
        <CardTitle className="text-base capitalize">{item.perfil_label}</CardTitle>
        <CardDescription className="capitalize">{item.perfil}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tom</p>
            <p className="font-medium">{planoText(item.plano, "tom") || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estilo</p>
            <p className="font-medium">{planoText(item.plano, "estilo") || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Nível</p>
            <p className="font-medium">{planoText(item.plano, "nivel") || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Prioritário</p>
            <p className="font-medium capitalize">{item.formato_prioritario || "—"}</p>
          </div>
        </div>
        {formatos.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {formatos.map((f) => (
              <Badge key={f} variant="secondary" className="capitalize">
                {f}
              </Badge>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paleta (design tokens)</p>
          <PaletaPreview item={item} />
        </div>
      </CardContent>
    </Card>
  );
}

function AlunoPreview({
  aluno,
  contexto,
  perfilDoAluno,
  conteudoId,
}: {
  aluno: AlunoRow;
  contexto: PersonalizacaoContextoDocenteResponse | null;
  perfilDoAluno: PersonalizacaoPerfilItem | null;
  conteudoId?: number;
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
          <CardDescription>Perfil dominante e personalização efetiva entregue ao aluno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
