import { useState } from "react";
import SegmentedPills from "../dashboard/SegmentedPills";
import AbaAlunos from "./AbaAlunos";
import AbaEconomia from "./AbaEconomia";
import AbaMolduras from "./AbaMolduras";
import AbaProfessores from "./AbaProfessores";

type Aba = "professores" | "alunos" | "molduras" | "economia";

const ABAS: { value: Aba; label: string }[] = [
  { value: "professores", label: "Professores e turmas" },
  { value: "alunos", label: "Alunos" },
  { value: "molduras", label: "Molduras" },
  { value: "economia", label: "Economia" },
];

export default function AdministracaoSection() {
  const [aba, setAba] = useState<Aba>("professores");
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Administração</h1>
          <p className="text-[13px] text-muted-foreground">Lê e grava direto no banco, e funciona com a API fora do ar.</p>
        </div>
        <SegmentedPills<Aba> ariaLabel="Partes da administração" opcoes={ABAS} valor={aba} onChange={setAba} className="w-fit" />
      </header>
      {aba === "professores" ? <AbaProfessores /> : aba === "alunos" ? <AbaAlunos /> : aba === "molduras" ? <AbaMolduras /> : <AbaEconomia />}
    </div>
  );
}
