import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Settings, Loader2, Route, LayoutDashboard, Trophy, GraduationCap, Sparkles, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import TopicsManager from "@/components/console/trilha/TopicsManager";
import ProfileSection from "@/components/console/ProfileSection";
import DashboardSection from "@/components/console/DashboardSection";
import RanksSection from "@/components/console/RanksSection";
import ClassManagementSection from "@/components/console/ClassManagementSection";
import PersonalizacoesSection from "@/components/console/personalizacoes/PersonalizacoesSection";
import { ProfessorApprovalSection } from "@/components/console/ProfessorApprovalSection";
import {
  CONSOLE_SECTIONS,
  DEFAULT_CONSOLE_VIEW,
  consolePathForView,
  consoleViewFromPathname,
  type ConsoleView,
} from "./consoleSections";

// Aba de aprovação de professores só é visível para a dona do projeto (TCC);
// os demais professores nunca veem nem conseguem acessar essa view.
const OWNER_EMAIL = "geisbelly19@gmail.com";

// Rotulo e icone de cada aba da barra do console. A ordem aqui e a ordem
// exibida; o caminho de cada uma vem de CONSOLE_SECTIONS (consoleSections.ts),
// pra nao existir "/console/..." escrito a mao em botao nenhum.
const NAV_LABELS: Record<ConsoleView, { label: string; icon: typeof LayoutDashboard; ownerOnly?: boolean }> = {
  dashboard: { label: "Dashboard", icon: LayoutDashboard },
  trilha: { label: "Trilha", icon: Route },
  classes: { label: "Classes", icon: GraduationCap },
  personalizacoes: { label: "Personalizações", icon: Sparkles },
  ranks: { label: "Ranks", icon: Trophy },
  profile: { label: "Meus Dados", icon: Settings },
  aprovacoes: { label: "Aprovações", icon: ShieldCheck, ownerOnly: true },
};

const NAV_ITEMS = CONSOLE_SECTIONS.map((secao) => ({ view: secao.view, ...NAV_LABELS[secao.view] }));

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
  const irPara = useCallback(
    (destino: ConsoleView) => navigate(consolePathForView(destino)),
    [navigate],
  );
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

  const getInitials = (name: string) =>
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PR";

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
    <div className="h-screen flex flex-col bg-gradient-to-br from-background via-secondary/5 to-primary/5">
      <header className="border-b bg-background/80 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getInitials(professorData?.nome)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold leading-tight">{professorData?.nome || "Professor"}</p>
            <p className="text-xs text-muted-foreground">{professorData?.instituicao}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner).map((item) => {
            const Icone = item.icon;
            return (
              <Button
                key={item.view}
                variant={view === item.view ? "default" : "outline"}
                size="sm"
                onClick={() => irPara(item.view)}
              >
                <Icone className="h-4 w-4 mr-2" />
                {item.label}
              </Button>
            );
          })}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {view === "trilha" ? (
          <div className="flex-1 min-h-0 flex flex-col px-6 pt-4 pb-2">
            <TopicsManager />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6">
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
      </main>
    </div>
  );
}
