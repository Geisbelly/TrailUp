import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchContextoDocente } from "./personalizacoes/personalizacoesApi";
import { useAuth } from "@/hooks/useAuth";
import { createRequestGuard, type RequestToken } from "@/lib/requestGuard";
import { computeTurmaResumo } from "@/lib/turmaResumo";
import { selectView } from "@/lib/supabaseViews";
import { useTurmaKpis } from "./useTurmaKpis";
import DashboardHeader, { type JanelaTemporal } from "./dashboard/DashboardHeader";
import KpisPrincipais from "./dashboard/KpisPrincipais";
import KpisSecundarios from "./dashboard/KpisSecundarios";
import { AlunoNaoEncontrado, DashboardCarregando, DashboardErro, DashboardVazio } from "./dashboard/DashboardEstados";
import { alunosDaTurma as filtrarAlunosDaTurma, TODAS_AS_TURMAS } from "./dashboard/filtros";
import AbandonoPorPerfil from "./dashboard/AbandonoPorPerfil";
import DistribuicaoNotas from "./dashboard/DistribuicaoNotas";
import TabelaAlunos from "./dashboard/TabelaAlunos";
import type { SegmentoPerfil } from "./dashboard/graficos";
import DetalheAluno from "./dashboard/aluno/DetalheAluno";
import type { Aluno, AlunoAnalisado, AlunoPerfil, EvolucaoAluno, PersonalizacaoDocenteResponse } from "./dashboard/aluno/tipos";
import PrecisamDeAtencao, { type AlunoEmRisco } from "./dashboard/PrecisamDeAtencao";
import { avaliarRisco, inatividade, notaParaRisco, observacaoNotaEAbandono, type Criterio } from "./dashboard/risco";
import { chaveAlunoTurma } from "./dashboard/sinais";
import { mediaDosPreenchidos } from "./dashboard/medias";
import { useSinaisDosAlunos } from "./dashboard/useSinaisDosAlunos";

export default function DashboardSection() {
  const { user, session } = useAuth();
  const professorId = user?.id;

  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [classes, setClasses] = useState<{ id: number; descricao: string | null }[]>([]);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [perfilSegmentFilter, setPerfilSegmentFilter] = useState<SegmentoPerfil>("majoritario");
  const [janelaTemporal, setJanelaTemporal] = useState<JanelaTemporal>("30d");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ultimaCarga, setUltimaCarga] = useState<Date | null>(null);
  const [personalizacaoData, setPersonalizacaoData] = useState<PersonalizacaoDocenteResponse | null>(null);
  const [personalizacaoLoading, setPersonalizacaoLoading] = useState(false);
  const [personalizacaoError, setPersonalizacaoError] = useState<string | null>(null);
  const alunoRequestGuard = useRef(createRequestGuard());
  const [alunoEvolucao, setAlunoEvolucao] = useState<EvolucaoAluno[]>([]);
  const [turmaEvolucao, setTurmaEvolucao] = useState<EvolucaoAluno[]>([]);
  // O aluno aberto vive na URL (/console?aluno=<id>&turma=<classe>): refresh
  // reabre no aluno e o voltar do navegador volta para a turma. A turma
  // desempata o aluno matriculado em mais de uma classe.
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const alunoNaUrl = searchParams.get("aluno");
  const turmaNaUrl = searchParams.get("turma");
  const kpiClassIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const { turmaMetricas, perfilMetricas, distribuicaoMetricas } = useTurmaKpis(kpiClassIds);
  const { sinais, temAbandono } = useSinaisDosAlunos(kpiClassIds);

  const mapStatus = (status?: string | null): "concluido" | "disponivel" | "bloqueado" => {
    if (!status) return "disponivel";
    const normalized = status.toLowerCase();
    if (normalized.includes("concl")) return "concluido";
    return "disponivel";
  };

  const loadPersonalizacaoContexto = useCallback(async (aluno: Aluno, request: RequestToken) => {
    setPersonalizacaoLoading(true);
    setPersonalizacaoError(null);

    try {
      const contexto = await fetchContextoDocente(session?.access_token ?? "", {
        alunoId: aluno.id,
        classeId: aluno.classe_id,
      });

      if (!request.isCurrent()) return;
      setPersonalizacaoData(contexto as PersonalizacaoDocenteResponse);
    } catch (error) {
      if (!request.isCurrent()) return;
      console.error("Erro ao carregar contexto de personalizacao:", error);
      setPersonalizacaoData(null);
      setPersonalizacaoError(
        error instanceof Error
          ? error.message
          : "Nao foi possivel carregar o contexto de personalizacao."
      );
    } finally {
      if (request.isCurrent()) setPersonalizacaoLoading(false);
    }
  }, [session?.access_token]);

  const loadAlunoEvolucao = useCallback(async (aluno: Aluno, request: RequestToken) => {
    // Todos os alunos da classe, para a linha de nota media da turma; a serie
    // do aluno sai do mesmo resultado.
    const { data } = await selectView("vw_metricas_evolucao_desempenho_aluno_dia")
      .eq("classe_id", aluno.classe_id)
      .order("dia", { ascending: true });

    if (!request.isCurrent()) return;
    const linhas = (data ?? []) as EvolucaoAluno[];
    setTurmaEvolucao(linhas);
    setAlunoEvolucao(linhas.filter((linha) => linha.aluno_id === aluno.id));
  }, []);

  const loadData = async () => {
    if (!professorId) return;
    setIsLoading(true);
    setLoadError(null);
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
        setUltimaCarga(new Date());
        setIsLoading(false);
        return;
      }

      const { data: classeAlunoData, error: caError } = await supabase
        .from("classe_aluno")
        .select(
          "classe_id, aluno_id, notaMedia, porcentagemConcluida, tempoGastoMin, acertosPercentual, ultimaAtividade, created_at"
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
              naTurmaDesde: ca.created_at ?? null,
              notaMedia: Number(ca.notaMedia ?? 0),
              temNota: ca.notaMedia != null,
              porcentagemConcluida: Number(ca.porcentagemConcluida ?? 0),
              tempoGastoMin: Number(ca.tempoGastoMin ?? 0),
              acertosPercentual: Number(ca.acertosPercentual ?? 0),
              temAcertos: ca.acertosPercentual != null,
              ultimaAtividade: ultimaAtividadeNome,
              perfilDominante,
              perfis,
              modoOperacao,
              topicos: topicosAluno,
            };
          })
          .filter(Boolean) as Aluno[];

      setAlunos(alunosFormatados);
      setUltimaCarga(new Date());
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
      setAlunos([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os alunos."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  const abandonoMedioPorTurma = useMemo(
    () => new Map(turmaMetricas.map((linha) => [Number(linha.classe_id), Number(linha.taxa_media_abandono_pct)])),
    [turmaMetricas]
  );
  const alunosAnalisados: AlunoAnalisado[] = useMemo(() => {
    const hoje = new Date();
    const notasPorTurma = new Map<number, number[]>();
    for (const a of alunos) {
      const nota = a.temNota ? notaParaRisco(a.notaMedia, a.porcentagemConcluida) : null;
      if (nota !== null) notasPorTurma.set(a.classe_id, [...(notasPorTurma.get(a.classe_id) ?? []), nota]);
    }
    const mediaDaTurma = (classeId: number) => {
      const notas = notasPorTurma.get(classeId);
      return notas?.length ? notas.reduce((s, n) => s + n, 0) / notas.length : null;
    };
    return alunos.map((a) => {
      const sinal = sinais.get(chaveAlunoTurma(a.id, a.classe_id));
      const abandonoPct = sinal?.abandonoPct ?? null;
      const risco = avaliarRisco(
        {
          abandonoPct,
          nota: a.temNota ? notaParaRisco(a.notaMedia, a.porcentagemConcluida) : null,
          inatividade: inatividade(sinal?.ultimaSessao ?? null, a.naTurmaDesde, hoje),
        },
        { abandonoMedioPct: abandonoMedioPorTurma.get(a.classe_id) ?? null, notaMedia: mediaDaTurma(a.classe_id) }
      );
      return { ...a, abandonoPct, risco };
    });
  }, [alunos, sinais, abandonoMedioPorTurma]);
  const criteriosLigados: Criterio[] = temAbandono ? ["abandono", "nota", "inatividade"] : ["nota", "inatividade"];

  const selectedAluno = useMemo(() => {
    if (!alunoNaUrl) return null;
    const candidatos = alunosAnalisados.filter((a) => a.id === alunoNaUrl);
    return candidatos.find((a) => String(a.classe_id) === turmaNaUrl) ?? candidatos[0] ?? null;
  }, [alunosAnalisados, alunoNaUrl, turmaNaUrl]);

  // A visao da turma continua montada (so escondida) enquanto o aluno esta
  // aberto, para voltar com a mesma pagina, busca e filtros da tabela; a
  // rolagem e guardada aqui e devolvida na volta.
  const raiz = useRef<HTMLDivElement>(null);
  const rolagemDaLista = useRef(0);
  const areaRolavel = () => raiz.current?.closest(".console-section-content") ?? null;

  useEffect(() => {
    if (alunoNaUrl) return;
    const area = areaRolavel();
    if (area) area.scrollTop = rolagemDaLista.current;
  }, [alunoNaUrl]);

  const abrirAluno = (aluno: Aluno) => {
    rolagemDaLista.current = areaRolavel()?.scrollTop ?? 0;
    const proximo = new URLSearchParams(searchParams);
    proximo.set("aluno", aluno.id);
    proximo.set("turma", String(aluno.classe_id));
    setSearchParams(proximo, { state: { abertoPelaLista: true } });
  };

  // Aberto pela lista: volta no historico, igual ao voltar do navegador.
  // Aberto por link ou refresh nao tem pagina anterior do console, entao so
  // tira o aluno da URL.
  const voltarParaTurma = () => {
    if ((location.state as { abertoPelaLista?: boolean } | null)?.abertoPelaLista) {
      navigate(-1);
      return;
    }
    const proximo = new URLSearchParams(searchParams);
    proximo.delete("aluno");
    proximo.delete("turma");
    setSearchParams(proximo, { replace: true });
  };

  useEffect(() => {
    const request = alunoRequestGuard.current.next();

    if (!selectedAluno) {
      setPersonalizacaoData(null);
      setPersonalizacaoError(null);
      setPersonalizacaoLoading(false);
      setAlunoEvolucao([]);
      setTurmaEvolucao([]);
      return;
    }

    void Promise.all([
      loadPersonalizacaoContexto(selectedAluno, request),
      loadAlunoEvolucao(selectedAluno, request),
    ]);
  }, [loadAlunoEvolucao, loadPersonalizacaoContexto, selectedAluno, session?.access_token]);

  // A turma selecionada define o escopo da tela inteira (KPIs, graficos e
  // tabela); a busca filtra so a tabela. Antes os KPIs usavam a lista ja
  // filtrada pela busca, e digitar um nome mudava "Total de alunos".
  const alunosDaTurma = useMemo(
    () => filtrarAlunosDaTurma(alunosAnalisados, selectedClassFilter),
    [alunosAnalisados, selectedClassFilter]
  );
  const alunosEmRisco = useMemo(
    () => alunosDaTurma.filter((a): a is AlunoAnalisado & AlunoEmRisco => a.risco !== null),
    [alunosDaTurma]
  );

  const totalAlunos = alunosDaTurma.length;
  const mediaNotas = mediaDosPreenchidos(alunosDaTurma.map((a) => (a.temNota ? a.notaMedia : null)));
  const mediaConclusao =
    alunosDaTurma.reduce((acc, a) => acc + (isNaN(a.porcentagemConcluida) ? 0 : a.porcentagemConcluida), 0) /
    (totalAlunos || 1);
  const mediaAcertos = mediaDosPreenchidos(alunosDaTurma.map((a) => (a.temAcertos ? a.acertosPercentual : null)));
  // Sem alunos no escopo, as médias acima são 0/(0||1) = 0 — um zero
  // fabricado, nao um dado real. Usa essa flag pra mostrar estado vazio
  // em vez do numero, senao "0% de acertos" parece um resultado de verdade.
  const hasAlunoKpis = totalAlunos > 0;
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
  const turmaResumo = useMemo(
    () => computeTurmaResumo(turmaMetricasEscopo),
    [turmaMetricasEscopo]
  );
  // computeTurmaResumo tambem devolve zeros quando nao ha linha nenhuma —
  // mesmo problema do hasAlunoKpis, mas pra fonte de dado separada (view de
  // metricas de turma).
  const hasTurmaKpis = turmaMetricasEscopo.length > 0;
  const observacaoDaRosca = temAbandono
    ? observacaoNotaEAbandono(
        alunosDaTurma.map((a) => ({
          nota: a.temNota ? notaParaRisco(a.notaMedia, a.porcentagemConcluida) : null,
          abandonoPct: a.abandonoPct,
        })),
        hasTurmaKpis ? turmaResumo.taxa_media_abandono_pct : null
      )
    : null;
  const rotuloVoltar = `${selectedAluno?.classe_nome ?? "Turma"} · todos os alunos`;

  let visaoDoAluno = null;
  if (alunoNaUrl) {
    visaoDoAluno = loadError ? (
      <DashboardErro detalhe={loadError} onTentarNovamente={loadData} />
    ) : isLoading || !ultimaCarga ? (
      <DashboardCarregando />
    ) : !selectedAluno ? (
      <AlunoNaoEncontrado onVoltar={voltarParaTurma} />
    ) : (
      <DetalheAluno
        aluno={selectedAluno}
        abandonoDaTurmaPct={abandonoMedioPorTurma.get(selectedAluno.classe_id) ?? null}
        rotuloVoltar={rotuloVoltar}
        onVoltar={voltarParaTurma}
        evolucaoAluno={alunoEvolucao}
        evolucaoTurma={turmaEvolucao}
        personalizacao={{
          carregando: personalizacaoLoading,
          erro: personalizacaoError,
          personalizacoes,
          progressoItens,
        }}
      />
    );
  }

  return (
    <div ref={raiz}>
      {visaoDoAluno}
      <div hidden={!!alunoNaUrl} className="space-y-6">
        <DashboardHeader
          classes={classes}
          turmaSelecionada={selectedClassFilter}
          onTurmaChange={setSelectedClassFilter}
          totalAlunos={totalAlunos}
          janela={janelaTemporal}
          onJanelaChange={setJanelaTemporal}
          ultimaCarga={ultimaCarga}
        />

        {loadError ? (
          <DashboardErro detalhe={loadError} onTentarNovamente={loadData} />
        ) : isLoading || !ultimaCarga ? (
          <DashboardCarregando />
        ) : alunosDaTurma.length === 0 ? (
          <DashboardVazio semTurmas={classes.length === 0} />
        ) : (
          <>
            <KpisPrincipais totalAlunos={totalAlunos} mediaNotas={mediaNotas} mediaConclusao={mediaConclusao} temDados={hasAlunoKpis} />

            <PrecisamDeAtencao<AlunoAnalisado & AlunoEmRisco>
              alunos={alunosEmRisco}
              totalDaTurma={totalAlunos}
              criterios={criteriosLigados}
              mostrarTurma={selectedClassFilter === TODAS_AS_TURMAS}
              onAbrir={abrirAluno}
            />

            <KpisSecundarios mediaAcertos={mediaAcertos} turmaResumo={turmaResumo} temDadosTurma={hasTurmaKpis} />

            <div className="grid items-start gap-5 lg:grid-cols-2">
              <AbandonoPorPerfil
                linhas={perfilMetricasEscopo}
                segmento={perfilSegmentFilter}
                onSegmentoChange={setPerfilSegmentFilter}
                media={hasTurmaKpis ? turmaResumo.taxa_media_abandono_pct : null}
              />
              <DistribuicaoNotas linhas={distribuicaoEscopo} mediaNotas={mediaNotas} observacao={observacaoDaRosca} />
            </div>

            <TabelaAlunos
              alunos={alunosDaTurma}
              mostrarClasse={selectedClassFilter === TODAS_AS_TURMAS}
              mostrarAbandono={temAbandono}
              onAbrir={abrirAluno}
            />
          </>
        )}
      </div>
    </div>
  );
}
