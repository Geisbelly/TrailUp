import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserCheck, UserX, Loader2, Building2, BookOpen, Calendar } from "lucide-react";

type PendingProfessor = {
  id: string;
  nome: string;
  instituicao: string | null;
  disciplina: string | null;
  descricao: string;
  created_at: string;
};

export function ProfessorApprovalSection() {
  const [professors, setProfessors] = useState<PendingProfessor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("professor")
      .select("id, nome, instituicao, disciplina, descricao, created_at")
      .eq("liberado", false)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar professores pendentes.");
    } else {
      setProfessors(data ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const approve = async (professorId: string) => {
    setProcessing(professorId);
    const { error } = await supabase
      .from("professor")
      .update({ liberado: true })
      .eq("id", professorId);

    if (error) {
      toast.error("Erro ao aprovar professor.");
    } else {
      toast.success("Professor aprovado com sucesso!");
      setProfessors((prev) => prev.filter((p) => p.id !== professorId));
    }
    setProcessing(null);
  };

  const reject = async (professorId: string) => {
    setProcessing(professorId);
    const { error } = await supabase
      .from("professor")
      .delete()
      .eq("id", professorId);

    if (error) {
      toast.error("Erro ao recusar professor.");
    } else {
      toast.success("Cadastro recusado.");
      setProfessors((prev) => prev.filter((p) => p.id !== professorId));
    }
    setProcessing(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Aprovações de Professor</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Professores aguardando liberação de acesso ao console
          </p>
        </div>
        <Badge variant="outline" className="text-zinc-400 border-zinc-700">
          {professors.length} pendente{professors.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {professors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <UserCheck className="w-10 h-10 text-zinc-600" />
          <p className="text-zinc-500">Nenhum professor aguardando aprovação.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {professors.map((prof) => (
            <Card key={prof.id} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate">{prof.nome}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
                      {prof.instituicao && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          {prof.instituicao}
                        </span>
                      )}
                      {prof.disciplina && (
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                          {prof.disciplina}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                        {new Date(prof.created_at).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {prof.descricao && (
                      <p className="text-sm text-zinc-500 line-clamp-2">{prof.descricao}</p>
                    )}
                  </div>

                  <div className="flex gap-2 sm:flex-col sm:w-auto flex-row">
                    <Button
                      size="sm"
                      onClick={() => approve(prof.id)}
                      disabled={processing === prof.id}
                      className="flex-1 sm:flex-none bg-green-600 hover:bg-green-500 text-white"
                    >
                      {processing === prof.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                          Aprovar
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reject(prof.id)}
                      disabled={processing === prof.id}
                      className="flex-1 sm:flex-none border-red-800 text-red-400 hover:bg-red-900/30 hover:text-red-300"
                    >
                      {processing === prof.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <UserX className="w-3.5 h-3.5 mr-1.5" />
                          Recusar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
