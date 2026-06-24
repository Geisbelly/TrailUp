import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { enqueueCleanupJob, enqueueEnrollmentJob } from "./personalizacaoJobsApi";

interface Aluno {
  id: string;
  nome: string;
  email: string;
}

interface ClassStudentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classe: { id: number; descricao: string | null };
  onStudentsChanged?: () => void;
}

export default function ClassStudentsDialog({
  open,
  onOpenChange,
  classe,
  onStudentsChanged,
}: ClassStudentsDialogProps) {
  const { user, session } = useAuth();
  const professorId = user?.id;

  const [classStudents, setClassStudents] = useState<Aluno[]>([]);
  const [availableStudents, setAvailableStudents] = useState<Aluno[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchClassContextIds = async () => {
    const { data: topicoRows, error: topicoError } = await supabase
      .from("topicos")
      .select("id")
      .eq("classe_id", classe.id);
    if (topicoError) throw topicoError;

    const topico_ids = (topicoRows ?? []).map((row) => row.id);
    if (topico_ids.length === 0) return { topico_ids, conteudo_ids: [] as number[] };

    const { data: conteudoRows, error: conteudoError } = await supabase
      .from("conteudos")
      .select("id")
      .in("topico_id", topico_ids);
    if (conteudoError) throw conteudoError;

    const conteudo_ids = (conteudoRows ?? []).map((row) => row.id);
    return { topico_ids, conteudo_ids };
  };

  const loadStudents = async () => {
    if (!professorId || !classe?.id) return;
    setIsLoading(true);
    try {
      const { data: classLinks, error: classError } = await supabase
        .from("classe_aluno")
        .select("aluno_id")
        .eq("classe_id", classe.id);

      if (classError) throw classError;

      const alunosNaClasseIds = (classLinks ?? []).map((c) => c.aluno_id).filter(Boolean) as string[];

      const { data: alunosNaClasse } =
        alunosNaClasseIds.length > 0
          ? await supabase
              .from("alunos")
              .select("id, nome, email")
              .in("id", alunosNaClasseIds)
          : { data: [] };

      const { data: accessLinks, error: accessError } = await supabase
        .from("professor_aluno")
        .select("aluno_id")
        .eq("professor_id", professorId)
        .eq("has_acesso", true);

      if (accessError) throw accessError;

      const availableIds = (accessLinks ?? [])
        .map((a) => a.aluno_id)
        .filter((id): id is string => Boolean(id) && !alunosNaClasseIds.includes(id));

      const { data: allowedStudents } =
        availableIds.length > 0
          ? await supabase
              .from("alunos")
              .select("id, nome, email")
              .in("id", availableIds)
          : { data: [] };

      setClassStudents((alunosNaClasse as Aluno[]) ?? []);
      setAvailableStudents((allowedStudents as Aluno[]) ?? []);
    } catch (error) {
      console.error("Erro ao carregar alunos da classe:", error);
      toast.error("Não foi possível carregar os alunos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classe?.id, professorId]);

  const handleAddStudents = async () => {
    if (!classe?.id) return;
    try {
      await Promise.all(
        selectedToAdd.map((alunoId) =>
          supabase.rpc("inscrever_aluno_em_classe", {
            p_aluno_id: alunoId,
            p_classe_id: classe.id,
          })
        )
      );

      let failedEnqueue = 0;
      if (session?.access_token) {
        const { topico_ids, conteudo_ids } = await fetchClassContextIds();
        const enqueueResults = await Promise.allSettled(
          selectedToAdd.map((alunoId) =>
            enqueueEnrollmentJob(session.access_token, {
              classe_id: classe.id,
              aluno_id: alunoId,
              topico_ids,
              conteudo_ids,
              reason: "matricula_aluno_console",
            })
          )
        );
        failedEnqueue = enqueueResults.filter((result) => result.status === "rejected").length;
      }

      if (failedEnqueue > 0) {
        toast.warning(
          `Alunos adicionados, mas ${failedEnqueue} job(s) de personalização falharam ao enfileirar. Tente novamente para reprocessar.`,
        );
      } else {
        toast.success("Alunos adicionados a classe!");
      }
      setSelectedToAdd([]);
      setShowAddDialog(false);
      await loadStudents();
      onStudentsChanged?.();
    } catch (error) {
      console.error("Erro ao adicionar alunos:", error);
      toast.error("Não foi possível adicionar os alunos.");
    }
  };

  const handleRemoveStudent = async (alunoId: string) => {
    try {
      const { error } = await supabase
        .from("classe_aluno")
        .delete()
        .eq("classe_id", classe.id)
        .eq("aluno_id", alunoId);

      if (error) throw error;

      let enqueueFailed = false;
      if (session?.access_token) {
        try {
          const { topico_ids, conteudo_ids } = await fetchClassContextIds();
          await enqueueCleanupJob(session.access_token, {
            classe_id: classe.id,
            aluno_id: alunoId,
            topico_ids,
            conteudo_ids,
            reason: "remocao_aluno_console",
          });
        } catch (enqueueError) {
          enqueueFailed = true;
          console.error("[ClassStudentsDialog] Falha ao enfileirar cleanup:", enqueueError);
        }
      }

      if (enqueueFailed) {
        toast.warning("Aluno removido da classe, mas o job de limpeza falhou ao enfileirar. Tente novamente.");
      } else {
        toast.success("Aluno removido da classe!");
      }
      await loadStudents();
      onStudentsChanged?.();
    } catch (error) {
      console.error("Erro ao remover aluno:", error);
      toast.error("Não foi possível remover o aluno.");
    }
  };

  const toggleStudentSelection = (alunoId: string) => {
    setSelectedToAdd((prev) =>
      prev.includes(alunoId) ? prev.filter((id) => id !== alunoId) : [...prev, alunoId]
    );
  };

  const filteredAvailable = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return availableStudents.filter(
      (a) => a.nome.toLowerCase().includes(term) || a.email.toLowerCase().includes(term)
    );
  }, [availableStudents, searchTerm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alunos - {classe.descricao}</DialogTitle>
          <DialogDescription>Gerencie os alunos matriculados nesta classe</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {classStudents.length} aluno(s) matriculado(s)
            </p>
            <Button size="sm" onClick={() => setShowAddDialog(true)} disabled={isLoading}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Alunos
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando alunos...</div>
          ) : classStudents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classStudents.map((aluno) => (
                  <TableRow key={aluno.id}>
                    <TableCell>{aluno.nome}</TableCell>
                    <TableCell>{aluno.email}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveStudent(aluno.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum aluno matriculado</p>
              <p className="text-sm">Clique em "Adicionar Alunos" para começar</p>
            </div>
          )}
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Alunos</DialogTitle>
              <DialogDescription>Selecione os alunos para adicionar a classe</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {filteredAvailable.length > 0 ? (
                  filteredAvailable.map((aluno) => (
                    <div
                      key={aluno.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                      onClick={() => toggleStudentSelection(aluno.id)}
                    >
                      <Checkbox checked={selectedToAdd.includes(aluno.id)} />
                      <div>
                        <p className="font-medium text-sm">{aluno.nome}</p>
                        <p className="text-xs text-muted-foreground">{aluno.email}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-4 text-muted-foreground text-sm">
                    Nenhum aluno disponível
                  </p>
                )}
              </div>

              <Button
                onClick={handleAddStudents}
                className="w-full"
                disabled={selectedToAdd.length === 0}
              >
                Adicionar {selectedToAdd.length} aluno(s)
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
