import { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { remapearReferencias, type MapaDeTopicos } from "./duplicacaoDeClasse";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PresencaDialog } from "./PresencaDialog";
import { CardDaTurma, CardNovaTurma } from "./turmas/CardDaTurma";
import { TurmasCarregando, TurmasErro, TurmasVazio } from "./turmas/TurmasEstados";
import { ConfirmarExclusao } from "./turmas/ConfirmarExclusao";
import { ConfirmarDuplicacao, FaixaTurmaDuplicada } from "./turmas/ConfirmarDuplicacao";
import { idDaCopia, mensagemDeErroDaDuplicacao } from "./turmas/duplicacao";
import { ModalMatriculas } from "./turmas/ModalMatriculas";
import { FaixaTurmaCriada, FormularioDeTurma } from "./turmas/FormularioDeTurma";
import { CAMPOS_VAZIOS, criarTurma, nomeDaTurma, type BancoDeTurmas, type DadosDaTurma } from "./turmas/formulario";
import { resumirTurmas, type MatriculaDaTurma, type ResumoDaTurma, type TopicoDaTurma } from "./turmas/resumo";
import { deleteClasseCascade, removeClassStudent } from "./trilha/classDeletion";

// Tipos
type Classe = { id: number; descricao: string | null; materia_id: number | null; created_at: string | null };
type Materia = { id: number; nome: string | null; descricao: string | null };
type Student = { id: string; nome: string; email?: string | null };
type ProfessorAlunoRow = { aluno_id: string; has_acesso: boolean; alunos: { id: string; nome: string; email?: string | null } | null };

type Props = { professorId?: string };
// duplicar_classe (migration 20261011_01) ainda não está nos tipos gerados do Supabase.
type RpcDuplicar = (
  fn: "duplicar_classe",
  args: { p_classe_id: number },
) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

export default function ClassManagementSection({ professorId }: Props) {
  // --- Dados ---
  const [classes, setClasses] = useState<Classe[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classStudents, setClassStudents] = useState<Record<number, string[]>>({});

  // Alunos, tópicos e conclusão de cada turma (mesma conta do dashboard).
  const [resumos, setResumos] = useState<Map<number, ResumoDaTurma>>(new Map());

  // --- UI ---
  const [isLoading, setIsLoading] = useState(true);
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // --- Formulário (criar e editar no mesmo card) e exclusão ---
  const [formulario, setFormulario] = useState<{ modo: "criar" } | { modo: "editar"; turma: Classe } | null>(null);
  const [turmaCriada, setTurmaCriada] = useState<{ id: number; nome: string; aviso: string | null } | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Classe | null>(null);
  const [paraDuplicar, setParaDuplicar] = useState<Classe | null>(null);
  const [duplicando, setDuplicando] = useState(false);
  const [turmaDuplicada, setTurmaDuplicada] = useState<{ id: number; nome: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // --- Alunos ---
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<Classe | null>(null);
  const [classeParaPresenca, setClasseParaPresenca] = useState<Classe | null>(null);


  // --- Carregamento ---
  // Cada leitura confere o `error` do Supabase: uma falha vira estado de erro,
  // nunca "Nenhuma turma ainda" (análise 03, seção 2.3-1). `silencioso` recarrega
  // os números sem trocar a grade pelo skeleton (depois de matricular/remover).
  const loadData = useCallback(async (silencioso = false) => {
    if (!professorId) return;
    if (!silencioso) setIsLoading(true);
    setErroDeCarga(null);
    try {
      const [cls, mats, profAlunos] = await Promise.all([
        supabase.from("classe").select("id, descricao, materia_id, created_at").eq("professor_id", professorId).order("created_at", { ascending: false }),
        supabase.from("materia").select("id, nome, descricao"),
        supabase.from("professor_aluno").select("aluno_id, has_acesso, alunos(id, nome, email)").eq("professor_id", professorId).eq("has_acesso", true),
      ]);
      const erro = cls.error ?? mats.error ?? profAlunos.error;
      if (erro) throw new Error(erro.message);

      const turmas = (cls.data as Classe[]) ?? [];
      const classIds = turmas.map((c) => c.id);
      let matriculas: MatriculaDaTurma[] = [];
      let topicos: TopicoDaTurma[] = [];
      if (classIds.length > 0) {
        const [clsAlunos, tops] = await Promise.all([
          supabase.from("classe_aluno").select("classe_id, aluno_id, porcentagemConcluida").in("classe_id", classIds),
          supabase.from("topicos").select("classe_id").in("classe_id", classIds),
        ]);
        const erroDasTurmas = clsAlunos.error ?? tops.error;
        if (erroDasTurmas) throw new Error(erroDasTurmas.message);
        matriculas = (clsAlunos.data ?? []) as MatriculaDaTurma[];
        topicos = (tops.data ?? []) as TopicoDaTurma[];
      }

      setClasses(turmas);
      setMaterias((mats.data as Materia[]) ?? []);
      setStudents(
        ((profAlunos.data as ProfessorAlunoRow[]) ?? []).map((row) => ({
          id: row.aluno_id,
          nome: row.alunos?.nome || "Aluno",
          email: row.alunos?.email || "",
        })),
      );
      const map: Record<number, string[]> = {};
      matriculas.forEach((row) => {
        map[row.classe_id] = map[row.classe_id] || [];
        if (!map[row.classe_id].includes(row.aluno_id)) map[row.classe_id].push(row.aluno_id);
      });
      setClassStudents(map);
      setResumos(resumirTurmas(classIds, matriculas, topicos));
    } catch (e) {
      setErroDeCarga(e instanceof Error ? e.message : "Erro desconhecido ao carregar as turmas.");
    } finally {
      setIsLoading(false);
    }
  }, [professorId]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Criar e editar turma ---
  const bancoDeTurmas = useMemo<BancoDeTurmas>(
    () => ({
      inserirTurma: async ({ descricao, materia_id }) => {
        const { data, error } = await supabase
          .from("classe")
          .insert({ descricao, materia_id, professor_id: professorId! })
          .select("id, descricao")
          .single();
        if (error) throw new Error(error.message);
        return data as { id: number; descricao: string | null };
      },
      inserirMateria: async ({ nome, descricao }) => {
        const { data, error } = await supabase.from("materia").insert({ nome, descricao }).select("id").single();
        if (error) throw new Error(error.message);
        return data as { id: number };
      },
      vincularMateria: async (turmaId, materiaId) => {
        const { data, error } = await supabase.from("classe").update({ materia_id: materiaId }).eq("id", turmaId).select("id");
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error("sem permissão para alterar a turma");
      },
    }),
    [professorId],
  );

  const abrirCriar = () => {
    setTurmaCriada(null);
    setFormulario({ modo: "criar" });
  };

  const salvarTurma = async (dados: DadosDaTurma) => {
    if (!professorId || !formulario) return;
    setIsSaving(true);
    try {
      if (formulario.modo === "criar") {
        const criada = await criarTurma(bancoDeTurmas, dados);
        setFormulario(null);
        setTurmaDuplicada(null);
        setTurmaCriada({ id: criada.id, nome: nomeDaTurma(criada), aviso: criada.avisoDeMateria });
        await loadData(true);
      } else {
        // Sem linha de volta = o RLS barrou em silêncio; não dizer "atualizada".
        const { data, error } = await supabase
          .from("classe")
          .update({ descricao: dados.descricao, materia_id: dados.materiaId })
          .eq("id", formulario.turma.id)
          .select("id");
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error("sem permissão para alterar esta turma");
        toast.success("Turma atualizada.");
        setFormulario(null);
        await loadData(true);
      }
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : "";
      toast.error(`${formulario.modo === "criar" ? "Não foi possível criar a turma" : "Não foi possível salvar a turma"}${detalhe ? `: ${detalhe}` : "."}`);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    const id = paraExcluir.id;
    setExcluindo(true);
    try {
      await deleteClasseCascade(id);
      toast.success("Turma excluída.");
      setClasses((prev) => prev.filter((c) => c.id !== id));
      setResumos((prev) => {
        const proximo = new Map(prev);
        proximo.delete(id);
        return proximo;
      });
      if (formulario?.modo === "editar" && formulario.turma.id === id) setFormulario(null);
      if (turmaCriada?.id === id) setTurmaCriada(null);
      setParaExcluir(null);
    } catch (error) {
      console.error("Erro ao excluir turma:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao excluir a turma.");
    } finally {
      setExcluindo(false);
    }
  };

  // --- Duplicar turma: uma função no banco copia a trilha numa transação só ---
  const confirmarDuplicacao = async () => {
    if (!paraDuplicar) return;
    setDuplicando(true);
    try {
      const { data, error } = await (supabase.rpc as unknown as RpcDuplicar)("duplicar_classe", { p_classe_id: paraDuplicar.id });
      const id = idDaCopia(data);
      if (error || id === null) {
        toast.error(mensagemDeErroDaDuplicacao(error ?? { message: "o banco não devolveu a turma nova" }));
        return;
      }
      // O nome da cópia ("(cópia)", "(cópia 2)"…) é o banco que decide.
      const { data: copia } = await supabase.from("classe").select("id, descricao").eq("id", id).maybeSingle();
      setTurmaCriada(null);
      setTurmaDuplicada({ id, nome: nomeDaTurma(copia ?? { id, descricao: null }) });
      setParaDuplicar(null);
      await loadData(true);
    } finally {
      setDuplicando(false);
    }
  };

  // --- Alunos ---
  const alunosDaPresenca = useMemo(() => {
    if (!classeParaPresenca) return [];
    const ids = classStudents[classeParaPresenca.id] || [];
    return ids
      .map((id) => students.find((s) => s.id === id))
      .filter((s): s is Student => Boolean(s))
      .map((s) => ({ id: s.id, nome: s.nome }));
  }, [classeParaPresenca, classStudents, students]);

  const handleAddStudentToClass = async (alunoId: string) => {
    if (!selectedClassForStudents) return;
    const classId = selectedClassForStudents.id;
    if (classStudents[classId]?.includes(alunoId)) {
      toast.error("Aluno já está na turma.");
      return;
    }
    const { error: enrollmentError } = await supabase.from("classe_aluno").insert({ classe_id: classId, aluno_id: alunoId });
    if (enrollmentError) {
      toast.error(`Não foi possível matricular: ${enrollmentError.message}`);
      return;
    }
    // O material do aluno é enfileirado pelo próprio banco, no mesmo INSERT
    // (trigger trg_classe_aluno_enrollment_job, migration 20261011_02): não
    // depende da API estar acordada nem da sessão do console.
    setClassStudents((prev) => ({ ...prev, [classId]: [...(prev[classId] || []), alunoId] }));
    toast.success("Aluno matriculado.");
    void loadData(true);
  };

  const handleRemoveStudentFromClass = async (alunoId: string) => {
    if (!selectedClassForStudents) return;
    const classId = selectedClassForStudents.id;
    try {
      await removeClassStudent(classId, alunoId);
      setClassStudents((prev) => ({ ...prev, [classId]: (prev[classId] || []).filter((id) => id !== alunoId) }));
      toast.success("Aluno removido da turma.");
      void loadData(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    }
  };

  return (
    <div className="space-y-6 p-1">

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end gap-6">
        <div className="min-w-0">
          <h2 className="text-[32px] leading-tight text-foreground">Turmas</h2>
          <p className="mt-2 text-[14.5px] text-muted-foreground">Crie turmas, matricule alunos e abra a trilha de cada uma.</p>
        </div>
        <Button onClick={() => abrirCriar()} className="ml-auto h-auto rounded-full px-[22px] py-[13px] text-sm font-bold">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Nova turma
        </Button>
      </div>

      {turmaDuplicada && <FaixaTurmaDuplicada nome={turmaDuplicada.nome} onFechar={() => setTurmaDuplicada(null)} />}

      {turmaCriada && (
        <FaixaTurmaCriada
          nome={turmaCriada.nome}
          aviso={turmaCriada.aviso}
          onMatricular={() => {
            // A lista pode não ter recarregado ainda; o modal só precisa do id e do nome.
            setSelectedClassForStudents(
              classes.find((c) => c.id === turmaCriada.id) ?? { id: turmaCriada.id, descricao: turmaCriada.nome, materia_id: null, created_at: null },
            );
          }}
          onFechar={() => setTurmaCriada(null)}
        />
      )}

      {formulario && (
        <FormularioDeTurma
          key={formulario.modo === "editar" ? `editar-${formulario.turma.id}` : "criar"}
          modo={formulario.modo}
          inicial={
            formulario.modo === "editar"
              ? { ...CAMPOS_VAZIOS, nome: formulario.turma.descricao ?? "", materiaId: formulario.turma.materia_id?.toString() ?? "" }
              : CAMPOS_VAZIOS
          }
          materias={materias}
          salvando={isSaving}
          onSalvar={(dados) => void salvarTurma(dados)}
          onCancelar={() => setFormulario(null)}
        />
      )}

      {/* Lista de turmas */}
      {erroDeCarga ? (
        <TurmasErro detalhe={erroDeCarga} onTentarNovamente={() => void loadData()} />
      ) : isLoading ? (
        <TurmasCarregando />
      ) : classes.length === 0 ? (
        <TurmasVazio onCriar={() => abrirCriar()} />
      ) : (
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
          {classes.map((c) => (
            <CardDaTurma
              key={c.id}
              turma={{ id: c.id, descricao: c.descricao, materiaNome: materias.find((m) => m.id === c.materia_id)?.nome ?? null }}
              resumo={resumos.get(c.id) ?? { alunos: (classStudents[c.id] || []).length, topicos: 0, conclusaoPct: null }}
              ocupado={isSaving || duplicando}
              onMatriculas={() => setSelectedClassForStudents(c)}
              onPresenca={() => setClasseParaPresenca(c)}
              onEditar={() => {
                setTurmaCriada(null);
                setFormulario({ modo: "editar", turma: c });
              }}
              onDuplicar={() => setParaDuplicar(c)}
              onExcluir={() => setParaExcluir(c)}
            />
          ))}
          <CardNovaTurma onCriar={() => abrirCriar()} />
        </div>
      )}

      <ConfirmarDuplicacao
        nome={paraDuplicar ? nomeDaTurma(paraDuplicar) : ""}
        aberto={!!paraDuplicar}
        duplicando={duplicando}
        onConfirmar={() => void confirmarDuplicacao()}
        onCancelar={() => setParaDuplicar(null)}
      />

      <ConfirmarExclusao
        nome={paraExcluir ? nomeDaTurma(paraExcluir) : ""}
        aberto={!!paraExcluir}
        excluindo={excluindo}
        onConfirmar={() => void confirmarExclusao()}
        onCancelar={() => setParaExcluir(null)}
      />

      <PresencaDialog
        classeId={classeParaPresenca?.id ?? null}
        classeDescricao={classeParaPresenca?.descricao}
        alunos={alunosDaPresenca}
        open={!!classeParaPresenca}
        onOpenChange={(aberto) => !aberto && setClasseParaPresenca(null)}
      />

      <ModalMatriculas
        turma={selectedClassForStudents}
        candidatos={students}
        matriculadosIds={selectedClassForStudents ? classStudents[selectedClassForStudents.id] || [] : []}
        onMatricular={handleAddStudentToClass}
        onRemover={handleRemoveStudentFromClass}
        onFechar={() => setSelectedClassForStudents(null)}
      />
    </div>
  );
}
