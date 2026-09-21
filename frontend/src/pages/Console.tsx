import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import ConsoleShell from "@/components/console/ConsoleShell";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_CONSOLE_VIEW,
  consolePathForView,
  consoleViewFromPathname,
  type ConsoleView,
} from "./consoleSections";

// Uma aba por vez fica visivel (ver `view` abaixo), entao cada secao vira o
// proprio chunk — a mais pesada, o Dashboard, carrega o recharts inteiro e
// nao deveria pesar em quem so abre a Trilha ou o Perfil (issue #29).
const TopicsManager = lazy(() => import("@/components/console/trilha/TopicsManager"));
const ProfileSection = lazy(() => import("@/components/console/ProfileSection"));
const DashboardSection = lazy(() => import("@/components/console/DashboardSection"));
const RanksSection = lazy(() => import("@/components/console/RanksSection"));
const ClassManagementSection = lazy(() => import("@/components/console/ClassManagementSection"));
const PersonalizacoesSection = lazy(() => import("@/components/console/personalizacoes/PersonalizacoesSection"));
const ProfessorApprovalSection = lazy(() =>
  import("@/components/console/ProfessorApprovalSection").then((m) => ({ default: m.ProfessorApprovalSection }))
);

// Aba de aprovação de professores só é visível para a dona do projeto (TCC);
// os demais professores nunca veem nem conseguem acessar essa view.
const OWNER_EMAIL = "geisbelly19@gmail.com";

export interface ProfessorUpdateData {
  nome: string;
  descricao: string;
  instituicao: string;
  disciplina: string;
  geracaoAutomatica: boolean;
}

export default function Console() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isLoading } = useAuth();
  const [professorData, setProfessorData] = useState<{
    id: string;
    nome: string;
    email: string | null;
    instituicao: string | null;
    disciplina: string | null;
    descricao: string | null;
    geracaoAutomatica: boolean;
  } | null>(null);
  const [isLoadingProfessor, setIsLoadingProfessor] = useState(false);
  // A URL e a unica fonte da verdade da aba ativa (ver consoleSections.ts):
  // refresh cai na mesma aba, o botao voltar anda entre abas em vez de sair do
  // console, e o link e compartilhavel. Antes so /console/trilha tinha rota -
  // todas as outras abas viviam em estado local em /console e se perdiam.
  const view: ConsoleView = consoleViewFromPathname(location.pathname) ?? DEFAULT_CONSOLE_VIEW;
  const isOwner = professorData?.email?.toLowerCase() === OWNER_EMAIL;

  useEffect(() => {
    const fetchProfessor = async () => {
      if (!user?.id) return;
      setIsLoadingProfessor(true);
      try {
        const { data, error } = await supabase
          .from("professor")
          .select("id, nome, descricao, instituicao, disciplina, geracao_automatica")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;

        setProfessorData({
          id: user.id,
          nome: data?.nome || user.user_metadata?.nome || "Professor",
          email: user.email,
          instituicao: data?.instituicao ?? user.user_metadata?.instituicao ?? "",
          disciplina: data?.disciplina ?? user.user_metadata?.disciplina ?? "",
          descricao: data?.descricao ?? user.user_metadata?.descricao ?? "",
          geracaoAutomatica: data?.geracao_automatica ?? true,
        });
      } catch (err) {
        console.error("Erro ao carregar dados do professor:", err);
        toast.error("Nao foi possivel carregar os dados do professor.");
        if (user) {
          setProfessorData({
            id: user.id,
            nome: user.user_metadata?.nome || "Professor",
            email: user.email,
            instituicao: user.user_metadata?.instituicao || "",
            disciplina: user.user_metadata?.disciplina || "",
            descricao: user.user_metadata?.descricao || "",
            geracaoAutomatica: true,
          });
        }
      } finally {
        setIsLoadingProfessor(false);
      }
    };

    fetchProfessor();
    // Depende do id, nao do objeto user: o Supabase emite um evento de auth ao
    // recuperar o foco da aba e o AuthProvider troca `user` por um objeto novo
    // com os mesmos dados. Com [user] esse efeito rodava de novo, ligava
    // isLoadingProfessor e o early-return abaixo desmontava todo o console -
    // era o que jogava a personalizacao de volta pro estado inicial (aba e
    // parte 1) a cada troca de aba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleLogout = async () => {
    await signOut();
    toast.success("Logout realizado com sucesso!");
    navigate("/login");
  };

  const handleProfileUpdate = async (updatedData: ProfessorUpdateData) => {
    if (!professorData?.id) return;
    try {
      const { error } = await supabase
        .from("professor")
        .update({
          nome: updatedData.nome,
          descricao: updatedData.descricao,
          instituicao: updatedData.instituicao,
          disciplina: updatedData.disciplina,
          geracao_automatica: updatedData.geracaoAutomatica,
        })
        .eq("id", professorData.id);

      if (error) throw error;

      setProfessorData((prev) =>
        prev
          ? {
              ...prev,
              nome: updatedData.nome,
              descricao: updatedData.descricao,
              instituicao: updatedData.instituicao,
              disciplina: updatedData.disciplina,
              geracaoAutomatica: updatedData.geracaoAutomatica,
            }
          : prev
      );
      toast.success("Dados atualizados com sucesso!");
    } catch (err) {
      console.error("Erro ao atualizar dados do professor:", err);
      toast.error("Nao foi possivel salvar os dados.");
    }
  };

  // A tela cheia de loading e so pro primeiro carregamento. Recarregamentos
  // posteriores (troca de aba, refresh de token) mantem o console montado pra
  // nao perder o estado das secoes filhas.
  if ((isLoading || isLoadingProfessor) && !professorData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ConsoleShell view={view} name={professorData?.nome || "Professor"} institution={professorData?.instituicao} isOwner={isOwner} onSignOut={handleLogout}>
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          }
        >
          {view === "trilha" ? (
            <div className="console-trail-content flex-1 min-h-0 flex flex-col">
              <TopicsManager />
            </div>
          ) : (
            <div className="console-section-content flex-1 overflow-auto">
              {view === "profile" ? (
                <ProfileSection professorData={professorData} onUpdate={handleProfileUpdate} isLoading={isLoadingProfessor} />
              ) : view === "dashboard" ? (
                <DashboardSection />
              ) : view === "ranks" ? (
                <RanksSection />
              ) : view === "personalizacoes" ? (
                <PersonalizacoesSection professorId={professorData?.id} />
              ) : view === "aprovacoes" ? (
                // Agora que /console/aprovacoes e uma URL de verdade, qualquer
                // professor pode digita-la. Sem dono confirmado, manda pro
                // dashboard em vez de renderizar uma pagina em branco - e espera
                // professorData carregar antes de decidir, senao o proprio dono
                // seria expulso no primeiro render.
                isOwner ? <ProfessorApprovalSection /> : professorData ? <Navigate to={consolePathForView("dashboard")} replace /> : null
              ) : (
                <ClassManagementSection professorId={professorData?.id} />
              )}
            </div>
          )}
        </Suspense>
    </ConsoleShell>
  );
}
