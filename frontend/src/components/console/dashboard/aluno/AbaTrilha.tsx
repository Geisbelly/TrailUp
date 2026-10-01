import { useState } from "react";
import StudentTrailVisualization from "../../StudentTrailVisualization";
import JornadaReal from "./JornadaReal";
import SegmentedPills from "../SegmentedPills";
import type { Aluno } from "./tipos";

type Modo = "hexagon" | "list" | "jornada";

const MODOS: { value: Modo; label: string }[] = [
  { value: "hexagon", label: "Hexágonos" },
  { value: "list", label: "Lista" },
  { value: "jornada", label: "Jornada" },
];

export default function AbaTrilha({ aluno }: { aluno: Aluno }) {
  const [modo, setModo] = useState<Modo>("hexagon");
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SegmentedPills ariaLabel="Modo de visualização da trilha" opcoes={MODOS} valor={modo} onChange={(m) => setModo(m)} />
      </div>
      {modo === "jornada" ? (
        <JornadaReal aluno={aluno} />
      ) : (
        <StudentTrailVisualization
          studentName={aluno.nome}
          classeName={aluno.classe_nome}
          topicos={aluno.topicos}
          perfilDominante={aluno.perfilDominante}
          viewMode={modo}
        />
      )}
    </div>
  );
}
