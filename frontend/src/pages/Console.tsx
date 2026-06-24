import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Settings, Loader2, Route, LayoutDashboard, Trophy, GraduationCap, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import TopicsManager from "@/components/console/trilha/TopicsManager";
import ProfileSection from "@/components/console/ProfileSection";
import DashboardSection from "@/components/console/DashboardSection";
import RanksSection from "@/components/console/RanksSection";
import ClassManagementSection from "@/components/console/ClassManagementSection";
import PersonalizacoesSection from "@/components/console/personalizacoes/PersonalizacoesSection";

export interface ProfessorUpdateData {
  nome: string;
  descricao: string;
  instituicao: string;
  disciplina: string;
}

export default function Console() {
  const navigate = useNavigate();
  const { user, signOut, isLoading } = useAuth();
  const [professorData, setProfessorData] = useState<{
    id: string;
    nome: string;
    email: string | null;
    instituicao: string | null;
    disciplina: string | null;
    descricao: string | null;
  } | null>(null);
  const [isLoadingProfessor, setIsLoadingProfessor] = useState(false);
  const [view, setView] = useState<"trilha" | "dashboard" | "ranks" | "classes" | "personalizacoes" | "profile">("dashboard");

  useEffect(() => {
    const fetchProfessor = async () => {
      if (!user?.id) return;
      setIsLoadingProfessor(true);
      try {
        const { data, error } = await supabase
          .from("professor")
          .select("id, nome, descricao, instituicao, disciplina")
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
          });
        }
      } finally {
        setIsLoadingProfessor(false);
      }
    };

    fetchProfessor();
  }, [user]);

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

  if (isLoading || isLoadingProfessor) {
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
          <Button
            variant={view === "dashboard" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("dashboard")}
          >
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <Button
            variant={view === "trilha" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("trilha")}
          >
            <Route className="h-4 w-4 mr-2" />
            Trilha
          </Button>
          <Button
            variant={view === "classes" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("classes")}
          >
            <GraduationCap className="h-4 w-4 mr-2" />
            Classes
          </Button>
          <Button
            variant={view === "personalizacoes" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("personalizacoes")}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Personalizações
          </Button>
          <Button
            variant={view === "ranks" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("ranks")}
          >
            <Trophy className="h-4 w-4 mr-2" />
            Ranks
          </Button>
          <Button
            variant={view === "profile" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("profile")}
          >
            <Settings className="h-4 w-4 mr-2" />
            Meus Dados
          </Button>
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
            ) : (
              <ClassManagementSection professorId={professorData?.id} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
