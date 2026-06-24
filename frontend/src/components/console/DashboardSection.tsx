import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  Eye,
  BarChart3,
  Brain,
  GraduationCap,
  LayoutGrid,
  List,
  Sparkles,
  FileText,
  Target,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StudentTrailVisualization from "./StudentTrailVisualization";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface AlunoPerfil {
  nome: string;
  afinidade: number;
}

interface Aluno {
  id: string;
  nome: string;
  email: string;
  classe_id: number;
  classe_nome: string;
  notaMedia: number;
  porcentagemConcluida: number;
  tempoGastoMin: number;
  acertosPercentual: number;
  ultimaAtividade: string | null;
  perfilDominante: string;
  perfis: AlunoPerfil[];
  modoOperacao: string;
  topicos: {
    id: number;
    nome: string;
    status: "concluido" | "disponivel" | "bloqueado";
    percentual: number;
  }[];
}

type PersonalizacaoDocenteResponse = {
  aluno_id: string;
  classe_id: number;
  topico_id?: number | null;
  contexto_aluno?: Record<string, unknown> | null;
  personalizacoes?: Array<{
    id: number;
    ciclo_id: string;
    topico_id?: number | null;
    formato_prioritario?: string | null;
    formatos_gerados?: string[];
    plano?: Record<string, unknown> | null;
    materials?: Record<string, unknown> | null;
    materiais?: Record<string, unknown> | null;
    steps?: Array<Record<string, unknown>>;
    gerado_em?: string | null;
  }>;
  progresso_itens?: Array<{
    id: number;
    item_key: string;
    item_kind: string;
    item_title: string;
    status: string;
    percentual_concluido: number;
    acertos_percentual?: number | null;
    tempo_gasto_min: number;
    pontuacao_obtida?: number | null;
    pontuacao_maxima?: number | null;
    updated_at?: string | null;
  }>;
};

type TurmaGeralMetricas = {
  classe_id: number;
  total_alunos: number;
  tempo_medio_uso_seg: number;
  sessoes_medias_por_aluno: number;
  taxa_media_retorno_pct: number;
  taxa_media_abandono_pct: number;
  taxa_media_conclusao_pct: number;
  media_nota_turma: number;
  taxa_media_acertos_pct: number;
  taxa_media_acertos_sem_erro_pct: number;
  eficiencia_media_aprendizagem: number;
  media_tentativas_por_questao: number;
  taxa_revisitas_pct: number;
  taxa_interrupcoes_pct: number;
  frequencia_chat_media_sessao: number;
  taxa_media_uso_chat_pct: number;
  tempo_medio_chat_seg: number;
  uso_chat_apos_erro_pct: number;
};

type TurmaPerfilMetricas = {
  classe_id: number;
  segmento: string;
  perfil_nome: string;
  total_alunos_segmento: number;
  taxa_abandono_pct: number;
  media_nota: number;
  taxa_acertos_pct: number;
  taxa_uso_chat_pct: number;
  uso_chat_apos_erro_pct: number;
};

type TurmaDistribuicao = {
  classe_id: number;
  metrica: string;
  faixa: string;
  total_alunos: number;
  percentual: number;
};

type EvolucaoAluno = {
  classe_id: number;
  aluno_id: string;
  dia: string;
  nota_media_desempenho: number;
  taxa_acertos_pct: number;
  taxa_acertos_sem_erro_pct: number;
  eficiencia_aprendizagem: number;
  progresso_trilha_pct: number;
};

const API_BASE_URL = String(import.meta.env.VITE_APITRAIUP_URL ?? "")
  .trim()
  .replace(/\/+$/, "");
const AUTH_FAILURE_PATTERN =
  /token invalido|token inv[aá]lido|token expirado|audience do token|assinatura do token|formato de token|authorization bearer token obrigatorio|token ausente/i;

type ViewSelectBuilder = {
  in: (column: string, values: ReadonlyArray<string | number>) => Promise<{ data: unknown[] | null }>;
  eq: (column: string, value: string | number) => {
    eq: (column: string, value: string | number) => {
      order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[] | null }>;
    };
  };
};

type ViewClient = {
  from: (relation: string) => {
    select: (columns: string) => ViewSelectBuilder;
  };
};

function selectView(viewName: string): ViewSelectBuilder {
  return (supabase as unknown as ViewClient).from(viewName).select("*");
}

export default function DashboardSection() {
  const { user, session } = useAuth();
  const professorId = user?.id;

  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [classes, setClasses] = useState<{ id: number; descricao: string | null }[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [trailViewMode, setTrailViewMode] = useState<"hexagon" | "list">("hexagon");
  const [perfilSegmentFilter, setPerfilSegmentFilter] = useState<"majoritario" | "segundo" | "afinidade_20_plus">("majoritario");
  const [isLoading, setIsLoading] = useState(false);
  const [personalizacaoData, setPersonalizacaoData] = useState<PersonalizacaoDocenteResponse | null>(null);
  const [personalizacaoLoading, setPersonalizacaoLoading] = useState(false);
  const [personalizacaoError, setPersonalizacaoError] = useState<string | null>(null);
  const [turmaMetricas, setTurmaMetricas] = useState<TurmaGeralMetricas[]>([]);
  const [perfilMetricas, setPerfilMetricas] = useState<TurmaPerfilMetricas[]>([]);
  const [distribuicaoMetricas, setDistribuicaoMetricas] = useState<TurmaDistribuicao[]>([]);
  const [alunoEvolucao, setAlunoEvolucao] = useState<EvolucaoAluno[]>([]);

  const mapStatus = (status?: string | null): "concluido" | "disponivel" | "bloqueado" => {
    if (!status) return "disponivel";
    const normalized = status.toLowerCase();
    if (normalized.includes("concl")) return "concluido";
    return "disponivel";
  };

  const loadPersonalizacaoContexto = useCallback(async (aluno: Aluno) => {
    if (!API_BASE_URL) {
      setPersonalizacaoData(null);
      setPersonalizacaoError("Defina VITE_APITRAIUP_URL para consultar a personalizacao.");
      return;
    }

    setPersonalizacaoLoading(true);
    setPersonalizacaoError(null);

    try {
      const resolveToken = async (forceRefresh = false) => {
        const sessionResult = forceRefresh
          ? await supabase.auth.refreshSession()
          : await supabase.auth.getSession();

        if (sessionResult.error) {
          throw new Error(`Falha ao obter sessao do Supabase: ${sessionResult.error.message}`);
        }

        const resolved = String(
          (forceRefresh ? sessionResult.data.session?.access_token : session?.access_token ?? sessionResult.data.session?.access_token) ?? ""
        ).trim();
        if (resolved) return resolved;

        if (!forceRefresh) return resolveToken(true);
        throw new Error("Sessao expirada para consultar a API de personalizacao.");
      };

      const requestContext = async (token: string) => {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/personalizar/contexto/${aluno.id}?classe_id=${aluno.classe_id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const payload = await response.json().catch(() => null);
        const detail =
          payload?.detail ||
          payload?.message ||
          "Nao foi possivel carregar o contexto de personalizacao.";
        return { response, payload, detail: String(detail) };
      };

      let token = await resolveToken(false);
      let result = await requestContext(token);

      if (!result.response.ok && (result.response.status === 401 || AUTH_FAILURE_PATTERN.test(result.detail))) {
        token = await resolveToken(true);
        result = await requestContext(token);
      }

      if (!result.response.ok) {
        throw new Error(result.detail);
      }

      setPersonalizacaoData(result.payload as PersonalizacaoDocenteResponse);
    } catch (error) {
      console.error("Erro ao carregar contexto de personalizacao:", error);
      setPersonalizacaoData(null);
      setPersonalizacaoError(
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar o contexto de personalizacao."
      );
    } finally {
      setPersonalizacaoLoading(false);
    }
  }, [session?.access_token]);

  const loadAlunoEvolucao = useCallback(async (aluno: Aluno) => {
    const { data } = await selectView("vw_metricas_evolucao_desempenho_aluno_dia")
      .eq("classe_id", aluno.classe_id)
      .eq("aluno_id", aluno.id)
      .order("dia", { ascending: true });

    setAlunoEvolucao((data ?? []) as EvolucaoAluno[]);
  }, []);

  const loadData = async () => {
    if (!professorId) return;
    setIsLoading(true);
    try {
      const { data: classesData, error: classesError } = await supabase
        .from("classe")
        .select("id, descricao")
        .eq("professor_id", professorId);

      if (classesError) throw classesError;

      const classIds = (classesData ?? []).map((c) => c.id);
      setClasses((classesData ?? []) as { id: number; descricao: string | null }[]);

      if (classIds.length === 0) {
        setAlunos([]);
        setTurmaMetricas([]);
        setPerfilMetricas([]);
        setDistribuicaoMetricas([]);
        setIsLoading(false);
        return;
      }

      const { data: classeAlunoData, error: caError } = await supabase
        .from("classe_aluno")
        .select(
          "classe_id, aluno_id, notaMedia, porcentagemConcluida, tempoGastoMin, acertosPercentual, ultimaAtividade"
        )
        .in("classe_id", classIds);

      if (caError) throw caError;

      const alunoIds = Array.from(
        new Set((classeAlunoData ?? []).map((c) => c.aluno_id).filter(Boolean)),
      ) as string[];

      const [
        { data: alunosData, error: alunosError },
        { data: modoOperacaoData, error: modoError },
        { data: perfilData, error: perfilError },
        { data: topicosData, error: topicosError },
        { data: topicoAlunoData, error: taError },
        { data: atividadesData, error: atividadesError },
      ] = await Promise.all([
        alunoIds.length > 0
          ? supabase.from("alunos").select("id, nome, email, modooperacao_id").in("id", alunoIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("modoOperacao").select("id, nome, modoResposta"),
        alunoIds.length > 0
          ? supabase
              .from("aluno_perfil")
              .select("aluno_id, afinidade, perfil:perfil_id ( nome )")
              .in("aluno_id", alunoIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("topicos").select("id, classe_id, nome"),
        alunoIds.length > 0
          ? supabase.from("topico_aluno").select("aluno_id, topico_id, status, percentual_concluido")
          : Promise.resolve({ data: [], error: null }),
        supabase.from("atividades").select("id, titulo"),
      ]);

      if (alunosError) throw alunosError;
      if (modoError) throw modoError;
      if (perfilError) throw perfilError;
      if (topicosError) throw topicosError;
      if (taError) throw taError;
      if (atividadesError) throw atividadesError;

      const [{ data: turmaData }, { data: perfilAggData }, { data: distribuicaoData }] =
        await Promise.all([
          classIds.length > 0
            ? selectView("vw_metricas_turma_geral_classe").in("classe_id", classIds)
            : Promise.resolve({ data: [] }),
          classIds.length > 0
            ? selectView("vw_metricas_turma_perfil_classe").in("classe_id", classIds)
            : Promise.resolve({ data: [] }),
          classIds.length > 0
            ? selectView("vw_metricas_distribuicao_turma_classe").in("classe_id", classIds)
            : Promise.resolve({ data: [] }),
        ]);

      setTurmaMetricas((turmaData ?? []) as TurmaGeralMetricas[]);
      setPerfilMetricas((perfilAggData ?? []) as TurmaPerfilMetricas[]);
      setDistribuicaoMetricas((distribuicaoData ?? []) as TurmaDistribuicao[]);

      const modoMap = new Map<number, string>();
      (modoOperacaoData ?? []).forEach((m) => {
        const name = m.nome || m.modoResposta || "";
        modoMap.set(m.id, name);
      });

      const classeMap = new Map<number, string>();
      (classesData ?? []).forEach((c) => classeMap.set(c.id, c.descricao || "Classe"));

      const atividadeMap = new Map<number, string>();
      (atividadesData ?? []).forEach((a) => atividadeMap.set(a.id, a.titulo ?? ""));

      const topicoMap = new Map<number, { nome: string; classe_id: number }>();
      (topicosData ?? []).forEach((t) => topicoMap.set(t.id, { nome: t.nome ?? "", classe_id: t.classe_id }));

      type PerfilRow = { aluno_id: string | null; afinidade: number | null; perfil: { nome: string } | null };
      const perfisMap = new Map<string, AlunoPerfil[]>();
      ((perfilData as PerfilRow[]) ?? []).forEach((p) => {
        if (!p.aluno_id) return;
        const arr = perfisMap.get(p.aluno_id) ?? [];
        arr.push({ nome: p.perfil?.nome || "Perfil", afinidade: Number(p.afinidade ?? 0) });
        perfisMap.set(p.aluno_id, arr);
      });

      type TopicoAlunoRow = { aluno_id: string | null; topico_id: number | null; status: string | null; percentual_concluido: number | null };
      const topicoAlunoMap = new Map<string, TopicoAlunoRow[]>();
      ((topicoAlunoData as TopicoAlunoRow[]) ?? []).forEach((item) => {
        if (!item.aluno_id) return;
        const arr = topicoAlunoMap.get(item.aluno_id) ?? [];
        arr.push(item);
        topicoAlunoMap.set(item.aluno_id, arr);
      });

      const alunosFormatados: Aluno[] =
        classeAlunoData
          ?.map((ca) => {
            const aluno = alunosData?.find((a) => a.id === ca.aluno_id);
            if (!aluno) return null;

            const perfis = perfisMap.get(aluno.id) ?? [];
            const perfilDominante =
              perfis.length > 0
                ? perfis.reduce((prev, curr) => (curr.afinidade > prev.afinidade ? curr : prev), perfis[0]).nome
                : "Sem perfil";

            const modoOperacao = aluno.modooperacao_id
              ? modoMap.get(aluno.modooperacao_id) || "Padrao"
              : "Padrao";

            const topicosAluno = (topicoAlunoMap.get(aluno.id) ?? [])
              .map((ta) => {
                const topicoInfo = topicoMap.get(ta.topico_id);
                if (!topicoInfo || topicoInfo.classe_id !== ca.classe_id) return null;
                return {
                  id: ta.topico_id,
                  nome: topicoInfo.nome,
                  status: mapStatus(ta.status),
                  percentual: Number(ta.percentual_concluido ?? 0),
                };
              })
              .filter(Boolean) as Aluno["topicos"];

            const ultimaAtividadeNome = ca.ultimaAtividade
              ? atividadeMap.get(ca.ultimaAtividade) || null
              : null;

            return {
              id: aluno.id,
              nome: aluno.nome,
              email: aluno.email,
              classe_id: ca.classe_id,
              classe_nome: classeMap.get(ca.classe_id) || "Classe",
              notaMedia: Number(ca.notaMedia ?? 0),
              porcentagemConcluida: Number(ca.porcentagemConcluida ?? 0),
              tempoGastoMin: Number(ca.tempoGastoMin ?? 0),
              acertosPercentual: Number(ca.acertosPercentual ?? 0),
              ultimaAtividade: ultimaAtividadeNome,
              perfilDominante,
              perfis,
              modoOperacao,
              topicos: topicosAluno,
            };
          })
          .filter(Boolean) as Aluno[];

      setAlunos(alunosFormatados);
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  useEffect(() => {
    let active = true;

    if (!selectedAluno) {
      setPersonalizacaoData(null);
      setPersonalizacaoError(null);
      setPersonalizacaoLoading(false);
      setAlunoEvolucao([]);
      return () => {
        active = false;
      };
    }

    void (async () => {
      await Promise.all([loadPersonalizacaoContexto(selectedAluno), loadAlunoEvolucao(selectedAluno)]);
      if (!active) return;
    })();

    return () => {
      active = false;
    };
  }, [loadAlunoEvolucao, loadPersonalizacaoContexto, selectedAluno, session?.access_token]);

  const filteredAlunos = useMemo(
    () =>
      alunos.filter((a) => {
        const matchesSearch =
          a.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
          a.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = selectedClassFilter === "all" || a.classe_id.toString() === selectedClassFilter;
        return matchesSearch && matchesClass;
      }),
    [alunos, searchTerm, selectedClassFilter]
  );

  const totalAlunos = filteredAlunos.length;
  const mediaNotas =
    filteredAlunos.reduce((acc, a) => acc + (isNaN(a.notaMedia) ? 0 : a.notaMedia), 0) / (totalAlunos || 1);
  const mediaConclusao =
    filteredAlunos.reduce((acc, a) => acc + (isNaN(a.porcentagemConcluida) ? 0 : a.porcentagemConcluida), 0) /
    (totalAlunos || 1);
  const mediaAcertos =
    filteredAlunos.reduce((acc, a) => acc + (isNaN(a.acertosPercentual) ? 0 : a.acertosPercentual), 0) /
    (totalAlunos || 1);
  const contextoAluno = personalizacaoData?.contexto_aluno ?? {};
  const personalizacoes = personalizacaoData?.personalizacoes ?? [];
  const progressoItens = personalizacaoData?.progresso_itens ?? [];
  const classScopeIds = useMemo(
    () =>
      selectedClassFilter === "all"
        ? classes.map((item) => item.id)
        : [Number(selectedClassFilter)].filter((id) => Number.isFinite(id)),
    [classes, selectedClassFilter]
  );
  const turmaMetricasEscopo = useMemo(
    () => turmaMetricas.filter((row) => classScopeIds.includes(Number(row.classe_id))),
    [classScopeIds, turmaMetricas]
  );
  const perfilMetricasEscopo = useMemo(
    () => perfilMetricas.filter((row) => classScopeIds.includes(Number(row.classe_id))),
    [classScopeIds, perfilMetricas]
  );
  const distribuicaoEscopo = useMemo(
    () => distribuicaoMetricas.filter((row) => classScopeIds.includes(Number(row.classe_id))),
    [classScopeIds, distribuicaoMetricas]
  );
  const turmaResumo = useMemo(() => {
    if (!turmaMetricasEscopo.length) {
      return {
        taxa_media_abandono_pct: 0,
        taxa_media_conclusao_pct: 0,
        media_nota_turma: 0,
        taxa_media_acertos_pct: 0,
        tempo_medio_uso_seg: 0,
        uso_chat_apos_erro_pct: 0,
      };
    }
    const sum = turmaMetricasEscopo.reduce(
      (acc, row) => ({
        taxa_media_abandono_pct: acc.taxa_media_abandono_pct + Number(row.taxa_media_abandono_pct ?? 0),
        taxa_media_conclusao_pct:
          acc.taxa_media_conclusao_pct + Number(row.taxa_media_conclusao_pct ?? 0),
        media_nota_turma: acc.media_nota_turma + Number(row.media_nota_turma ?? 0),
        taxa_media_acertos_pct: acc.taxa_media_acertos_pct + Number(row.taxa_media_acertos_pct ?? 0),
        tempo_medio_uso_seg: acc.tempo_medio_uso_seg + Number(row.tempo_medio_uso_seg ?? 0),
        uso_chat_apos_erro_pct:
          acc.uso_chat_apos_erro_pct + Number(row.uso_chat_apos_erro_pct ?? 0),
      }),
      {
        taxa_media_abandono_pct: 0,
        taxa_media_conclusao_pct: 0,
        media_nota_turma: 0,
        taxa_media_acertos_pct: 0,
        tempo_medio_uso_seg: 0,
        uso_chat_apos_erro_pct: 0,
      }
    );
    const total = turmaMetricasEscopo.length;
    return {
      taxa_media_abandono_pct: sum.taxa_media_abandono_pct / total,
      taxa_media_conclusao_pct: sum.taxa_media_conclusao_pct / total,
      media_nota_turma: sum.media_nota_turma / total,
      taxa_media_acertos_pct: sum.taxa_media_acertos_pct / total,
      tempo_medio_uso_seg: sum.tempo_medio_uso_seg / total,
      uso_chat_apos_erro_pct: sum.uso_chat_apos_erro_pct / total,
    };
  }, [turmaMetricasEscopo]);
  const abandonoPorPerfilData = useMemo(
    () =>
      perfilMetricasEscopo
        .filter((row) => row.segmento === perfilSegmentFilter)
        .sort((a, b) => Number(b.taxa_abandono_pct ?? 0) - Number(a.taxa_abandono_pct ?? 0))
        .slice(0, 8)
        .map((row) => ({
          perfil: row.perfil_nome,
          abandono: Number(row.taxa_abandono_pct ?? 0),
          acertos: Number(row.taxa_acertos_pct ?? 0),
        })),
    [perfilMetricasEscopo, perfilSegmentFilter]
  );
  const distribuicaoNotasData = useMemo(
    () =>
      distribuicaoEscopo
        .filter((row) => row.metrica === "nota_media")
        .map((row) => ({
          faixa: row.faixa,
          percentual: Number(row.percentual ?? 0),
          total: Number(row.total_alunos ?? 0),
        })),
    [distribuicaoEscopo]
  );
  const evolucaoAlunoData = useMemo(
    () =>
      alunoEvolucao.map((row) => ({
        dia: new Date(row.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        acertos: Number(row.taxa_acertos_pct ?? 0),
        nota: Number(row.nota_media_desempenho ?? 0),
        progresso: Number(row.progresso_trilha_pct ?? 0),
      })),
    [alunoEvolucao]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard de Alunos</h2>
        <p className="text-muted-foreground">Acompanhe o desempenho dos alunos com permissao de acesso</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Alunos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAlunos}</div>
            <p className="text-xs text-muted-foreground">com acesso liberado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Média de Notas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mediaNotas.toFixed(1)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conclusão Média</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mediaConclusao.toFixed(0)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Acertos</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mediaAcertos.toFixed(0)}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Abandono Médio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{turmaResumo.taxa_media_abandono_pct.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conclusão Média</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{turmaResumo.taxa_media_conclusao_pct.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Uso do Chat após Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{turmaResumo.uso_chat_apos_erro_pct.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio de Uso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(turmaResumo.tempo_medio_uso_seg / 60).toFixed(1)}min
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Abandono por Perfil</CardTitle>
                <CardDescription>Segmentação por perfil da turma selecionada</CardDescription>
              </div>
              <Select
                value={perfilSegmentFilter}
                onValueChange={(value) =>
                  setPerfilSegmentFilter(
                    value as "majoritario" | "segundo" | "afinidade_20_plus"
                  )
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="majoritario">Majoritário</SelectItem>
                  <SelectItem value="segundo">2º Perfil</SelectItem>
                  <SelectItem value="afinidade_20_plus">Afinidade ≥ 20%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={abandonoPorPerfilData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="perfil" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="abandono" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Notas</CardTitle>
            <CardDescription>Faixas baixa, média e alta</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribuicaoNotasData}
                  dataKey="percentual"
                  nameKey="faixa"
                  outerRadius={100}
                  label={(entry) => {
                    const item = entry as Partial<TurmaDistribuicao>;
                    return `${item.faixa ?? "faixa"}: ${Number(item.percentual ?? 0).toFixed(1)}%`;
                  }}
                >
                  {distribuicaoNotasData.map((entry, idx) => (
                    <Cell
                      key={`${entry.faixa}-${idx}`}
                      fill={idx % 3 === 0 ? "#ef4444" : idx % 3 === 1 ? "#f59e0b" : "#22c55e"}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Alunos</CardTitle>
          <CardDescription>Clique em um aluno para ver detalhes e visualizar sua trilha</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por classe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando alunos...</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aluno</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Nota Média</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Acertos</TableHead>
                    <TableHead className="w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAlunos.map((aluno) => (
                    <TableRow key={aluno.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{aluno.nome}</p>
                          <p className="text-xs text-muted-foreground">{aluno.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{aluno.classe_nome}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{aluno.perfilDominante}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={aluno.notaMedia >= 7 ? "default" : "destructive"}>
                          {aluno.notaMedia.toFixed(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={aluno.porcentagemConcluida} className="w-16 h-2" />
                          <span className="text-xs">{aluno.porcentagemConcluida}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{aluno.acertosPercentual}%</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedAluno(aluno)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredAlunos.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum aluno encontrado</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedAluno} onOpenChange={() => setSelectedAluno(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              {selectedAluno?.nome}
            </DialogTitle>
          </DialogHeader>

          {selectedAluno && (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Visao Geral</TabsTrigger>
                <TabsTrigger value="perfil">Perfil BrainHex</TabsTrigger>
                <TabsTrigger value="trilha">Trilha Visual</TabsTrigger>
                <TabsTrigger value="personalizacao">Personalizacao</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedAluno.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Classe</p>
                    <p className="font-medium">{selectedAluno.classe_nome}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Modo de Operação</p>
                    <p className="font-medium">{selectedAluno.modoOperacao}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Perfil Dominante</p>
                    <Badge variant="secondary">{selectedAluno.perfilDominante}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs">Nota Média</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedAluno.notaMedia.toFixed(1)}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs">Concluído</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedAluno.porcentagemConcluida}%</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <BarChart3 className="h-4 w-4" />
                        <span className="text-xs">Acertos</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedAluno.acertosPercentual}%</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">Tempo Total</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedAluno.tempoGastoMin}min</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Evolução do aluno</CardTitle>
                    <CardDescription>Nota, acertos e progresso ao longo dos dias</CardDescription>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={evolucaoAlunoData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="dia" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="acertos" stroke="#2563eb" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="progresso" stroke="#16a34a" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="nota" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {selectedAluno.ultimaAtividade && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Última Atividade</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">{selectedAluno.ultimaAtividade}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="perfil" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      Perfil BrainHex
                    </CardTitle>
                    <CardDescription>Distribuição dos 7 perfis de aprendizagem</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedAluno.perfis
                      .sort((a, b) => b.afinidade - a.afinidade)
                      .map((perfil) => (
                        <div key={perfil.nome} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium flex items-center gap-2">
                              {perfil.nome}
                              {perfil.nome === selectedAluno.perfilDominante && (
                                <Badge variant="default" className="text-xs">
                                  Dominante
                                </Badge>
                              )}
                            </span>
                            <span className="text-muted-foreground">{perfil.afinidade}%</span>
                          </div>
                          <Progress value={perfil.afinidade} className="h-3" />
                        </div>
                      ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="trilha" className="space-y-4">
                <div className="flex justify-end gap-2">
                  <Button
                    variant={trailViewMode === "hexagon" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTrailViewMode("hexagon")}
                  >
                    <LayoutGrid className="h-4 w-4 mr-1" />
                    Hexagonos
                  </Button>
                  <Button
                    variant={trailViewMode === "list" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTrailViewMode("list")}
                  >
                    <List className="h-4 w-4 mr-1" />
                    Lista
                  </Button>
                </div>

                <StudentTrailVisualization
                  studentName={selectedAluno.nome}
                  classeName={selectedAluno.classe_nome}
                  xp={selectedAluno.porcentagemConcluida * 10}
                  xpTotal={1000}
                  topicos={selectedAluno.topicos}
                  perfilDominante={selectedAluno.perfilDominante}
                  viewMode={trailViewMode}
                />
              </TabsContent>

              <TabsContent value="personalizacao" className="space-y-4">
                {personalizacaoLoading ? (
                  <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      Carregando historico de personalizacao...
                    </CardContent>
                  </Card>
                ) : personalizacaoError ? (
                  <Card>
                    <CardContent className="pt-6 text-sm text-destructive">
                      {personalizacaoError}
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Card className="lg:col-span-2">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            Contexto central do aluno
                          </CardTitle>
                          <CardDescription>
                            Perfis, preferencias, historico e sinais usados pela API para personalizar o modulo.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex flex-wrap gap-2">
                            {(selectedAluno.perfis ?? []).map((perfil) => (
                              <Badge key={perfil.nome} variant="secondary">
                                {perfil.nome} {perfil.afinidade}%
                              </Badge>
                            ))}
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Modo de operacao
                              </p>
                              <p className="font-medium">{selectedAluno.modoOperacao}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                Perfil dominante
                              </p>
                              <p className="font-medium">{selectedAluno.perfilDominante}</p>
                            </div>
                          </div>
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                              {JSON.stringify(contextoAluno, null, 2)}
                            </pre>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            Resumo de uso
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Personalizacoes
                            </p>
                            <p className="text-2xl font-bold">{personalizacoes.length}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Itens persistidos
                            </p>
                            <p className="text-2xl font-bold">{progressoItens.length}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              Tempo personalizado
                            </p>
                            <p className="text-2xl font-bold">
                              {progressoItens
                                .reduce((acc, item) => acc + Number(item.tempo_gasto_min ?? 0), 0)
                                .toFixed(1)}
                              min
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Historico de personalizacoes
                        </CardTitle>
                        <CardDescription>
                          Justificativa, formatos gerados e sequencia entregue ao aluno.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {personalizacoes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Nenhuma personalizacao encontrada para este aluno nesta classe.
                          </p>
                        ) : (
                          personalizacoes.map((item) => (
                            <div key={item.id} className="rounded-lg border p-4 space-y-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold">
                                    Personalizacao #{item.id} · Topico {item.topico_id ?? "geral"}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {item.plano?.justificativa || "Sem justificativa registrada."}
                                  </p>
                                </div>
                                <Badge variant="outline">{item.formato_prioritario || "misto"}</Badge>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(item.formatos_gerados ?? []).map((formato) => (
                                  <Badge key={`${item.id}-${formato}`} variant="secondary">
                                    {formato}
                                  </Badge>
                                ))}
                              </div>
                              <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Etapas geradas
                                  </p>
                                  <p className="font-medium">{item.steps?.length ?? 0}</p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Gerado em
                                  </p>
                                  <p className="font-medium">
                                    {item.gerado_em
                                      ? new Date(item.gerado_em).toLocaleString("pt-BR")
                                      : "Sem data"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Progresso dos itens personalizados</CardTitle>
                        <CardDescription>
                          Tempo, pontuacao e status persistidos por passo do modulo personalizado.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {progressoItens.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Ainda nao ha itens personalizados persistidos para este aluno.
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Tempo</TableHead>
                                <TableHead>Pontos</TableHead>
                                <TableHead>Atualizado</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {progressoItens.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell className="font-medium">{item.item_title}</TableCell>
                                  <TableCell>{item.item_kind}</TableCell>
                                  <TableCell>
                                    <Badge variant={item.status === "concluido" ? "default" : "secondary"}>
                                      {item.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{Number(item.tempo_gasto_min ?? 0).toFixed(1)} min</TableCell>
                                  <TableCell>
                                    {item.pontuacao_obtida ?? 0}
                                    {item.pontuacao_maxima ? ` / ${item.pontuacao_maxima}` : ""}
                                  </TableCell>
                                  <TableCell>
                                    {item.updated_at
                                      ? new Date(item.updated_at).toLocaleString("pt-BR")
                                      : "-"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
