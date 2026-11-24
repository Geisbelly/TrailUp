import { useEffect, useRef, useState } from "react";
import SegmentedPills from "../SegmentedPills";
import { SeloDeExemplo } from "../PainelDeExemplo";
import { ehAlunoDeExemplo } from "../exemploDaPesquisa";
import AbaCuidado from "./AbaCuidado";
import AbaPerfil from "./AbaPerfil";
import AbaPersonalizacao from "./AbaPersonalizacao";
import AbaTentativas from "./AbaTentativas";
import AbaTrilha from "./AbaTrilha";
import AbaVisaoGeral from "./AbaVisaoGeral";
import CabecalhoAluno from "./CabecalhoAluno";
import type { AlunoAnalisado, EvolucaoAluno, Personalizacao, ProgressoItem } from "./tipos";

type Aba = "visao" | "perfil" | "trilha" | "tentativas" | "personalizacao" | "cuidado";

const ABAS: { value: Aba; label: string }[] = [
  { value: "visao", label: "Visão geral" },
  { value: "perfil", label: "Perfil BrainHex" },
  { value: "trilha", label: "Trilha visual" },
  { value: "tentativas", label: "Tentativas" },
  { value: "personalizacao", label: "Personalização" },
  { value: "cuidado", label: "Momentos de cuidado" },
];

export default function DetalheAluno({
  aluno,
  taxaAbandonoDaTurmaPct,
  rotuloVoltar,
  onVoltar,
  evolucaoAluno,
  evolucaoTurma,
  personalizacao,
}: {
  aluno: AlunoAnalisado;
  taxaAbandonoDaTurmaPct: number | null;
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
      {ehAlunoDeExemplo(aluno.id) && (
        <div className="flex flex-col gap-2 rounded-[20px] border border-warning/60 bg-warning/5 p-4">
          <SeloDeExemplo />
          <p className="max-w-3xl text-[13px] text-muted-foreground">
            Este aluno é inventado. Notas, trilha, tentativas, personalização e momentos de cuidado são de
            exemplo, calculados no navegador para mostrar o formato de cada aba. Nada daqui foi gravado, e os
            comentários que você escrever na jornada somem ao sair da tela.
          </p>
        </div>
      )}
      <CabecalhoAluno aluno={aluno} taxaAbandonoDaTurmaPct={taxaAbandonoDaTurmaPct} rotuloVoltar={rotuloVoltar} onVoltar={onVoltar} />
      <SegmentedPills ariaLabel="Seções do aluno" opcoes={ABAS} valor={aba} onChange={(a) => setAba(a)} className="w-fit" />
      {aba === "visao" && <AbaVisaoGeral aluno={aluno} evolucaoAluno={evolucaoAluno} evolucaoTurma={evolucaoTurma} onVerTrilha={() => setAba("trilha")} />}
      {aba === "perfil" && <AbaPerfil aluno={aluno} />}
      {aba === "trilha" && <AbaTrilha aluno={aluno} />}
      {aba === "tentativas" && <AbaTentativas aluno={aluno} />}
      {aba === "cuidado" && <AbaCuidado aluno={aluno} />}
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
