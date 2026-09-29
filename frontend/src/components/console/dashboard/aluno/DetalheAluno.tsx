import { useEffect, useRef, useState } from "react";
import SegmentedPills from "../SegmentedPills";
import AbaPerfil from "./AbaPerfil";
import AbaPersonalizacao from "./AbaPersonalizacao";
import AbaTrilha from "./AbaTrilha";
import AbaVisaoGeral from "./AbaVisaoGeral";
import CabecalhoAluno from "./CabecalhoAluno";
import type { Aluno, EvolucaoAluno, Personalizacao, ProgressoItem } from "./tipos";

type Aba = "visao" | "perfil" | "trilha" | "personalizacao";

const ABAS: { value: Aba; label: string }[] = [
  { value: "visao", label: "Visão geral" },
  { value: "perfil", label: "Perfil BrainHex" },
  { value: "trilha", label: "Trilha visual" },
  { value: "personalizacao", label: "Personalização" },
];

export default function DetalheAluno({
  aluno,
  rotuloVoltar,
  onVoltar,
  evolucaoAluno,
  evolucaoTurma,
  personalizacao,
}: {
  aluno: Aluno;
  rotuloVoltar: string;
  onVoltar: () => void;
  evolucaoAluno: EvolucaoAluno[];
  evolucaoTurma: EvolucaoAluno[];
  personalizacao: { carregando: boolean; erro: string | null; personalizacoes: Personalizacao[]; progressoItens: ProgressoItem[] };
}) {
  const [aba, setAba] = useState<Aba>("visao");
  const topo = useRef<HTMLDivElement>(null);

  // A visão da turma costuma estar rolada até a tabela quando o aluno é aberto.
  useEffect(() => {
    topo.current?.scrollIntoView({ block: "start" });
    setAba("visao");
  }, [aluno.id, aluno.classe_id]);

  return (
    <div ref={topo} className="space-y-6">
      <CabecalhoAluno aluno={aluno} rotuloVoltar={rotuloVoltar} onVoltar={onVoltar} />
      <SegmentedPills ariaLabel="Seções do aluno" opcoes={ABAS} valor={aba} onChange={(a) => setAba(a)} className="w-fit" />
      {aba === "visao" && <AbaVisaoGeral aluno={aluno} evolucaoAluno={evolucaoAluno} evolucaoTurma={evolucaoTurma} />}
      {aba === "perfil" && <AbaPerfil aluno={aluno} />}
      {aba === "trilha" && <AbaTrilha aluno={aluno} />}
      {aba === "personalizacao" && (
        <AbaPersonalizacao
          aluno={aluno}
          carregando={personalizacao.carregando}
          erro={personalizacao.erro}
          personalizacoes={personalizacao.personalizacoes}
          progressoItens={personalizacao.progressoItens}
        />
      )}
    </div>
  );
}
