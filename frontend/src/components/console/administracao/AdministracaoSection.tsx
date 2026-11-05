import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProfessorApprovalSection } from "../ProfessorApprovalSection";
import SegmentedPills from "../dashboard/SegmentedPills";
import AbaAlunos from "./AbaAlunos";
import AbaEconomia from "./AbaEconomia";
import AbaMolduras from "./AbaMolduras";
import AbaProfessores from "./AbaProfessores";
import AbaTermos from "./AbaTermos";

type Aba = "aprovacoes" | "professores" | "alunos" | "termos" | "molduras" | "economia";

const ABAS: { value: Aba; label: string }[] = [
  { value: "aprovacoes", label: "Aprovações" },
  { value: "professores", label: "Professores e turmas" },
  { value: "alunos", label: "Alunos" },
  { value: "termos", label: "Termos e assinaturas" },
  { value: "molduras", label: "Molduras" },
  { value: "economia", label: "Economia" },
];

const CONTEUDO: Record<Aba, () => JSX.Element> = {
  aprovacoes: ProfessorApprovalSection,
  professores: AbaProfessores,
  alunos: AbaAlunos,
  termos: AbaTermos,
  molduras: AbaMolduras,
  economia: AbaEconomia,
};

export default function AdministracaoSection() {
  const [parametros] = useSearchParams();
  const pedida = ABAS.find((a) => a.value === parametros.get("aba"))?.value;
  const [aba, setAba] = useState<Aba>(pedida ?? "aprovacoes");
  const Conteudo = CONTEUDO[aba];
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Administração</h1>
          <p className="text-[13px] text-muted-foreground">Lê e grava direto no banco, e funciona com a API fora do ar.</p>
        </div>
        <SegmentedPills<Aba> ariaLabel="Partes da administração" opcoes={ABAS} valor={aba} onChange={setAba} className="w-fit flex-wrap overflow-visible rounded-3xl" />
      </header>
      <Conteudo />
    </div>
  );
}
