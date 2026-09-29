import { ChevronLeft } from "lucide-react";
import { PerfilAvatar, PerfilChip } from "../PerfilVisual";
import type { Aluno } from "./tipos";

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function formatarTempo(minutos: number): string {
  if (minutos < 60) return `${Math.round(minutos)}min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m ? `${h}h ${m}min` : `${h}h`;
}

export default function CabecalhoAluno({ aluno, rotuloVoltar, onVoltar }: { aluno: Aluno; rotuloVoltar: string; onVoltar: () => void }) {
  const numeros = [
    { rotulo: "Nota média", valor: aluno.notaMedia.toFixed(1) },
    { rotulo: "Trilha concluída", valor: `${aluno.porcentagemConcluida.toFixed(0)}%` },
    { rotulo: "Acertos", valor: `${aluno.acertosPercentual.toFixed(0)}%` },
    { rotulo: "Tempo total", valor: formatarTempo(aluno.tempoGastoMin) },
  ];

  return (
    <div>
      <button
        type="button"
        onClick={onVoltar}
        className="mb-[22px] inline-flex items-center gap-2 rounded-full text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {rotuloVoltar}
      </button>

      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[26px]">
        <div className="flex flex-wrap items-center gap-4">
          <PerfilAvatar nome={aluno.nome} perfil={aluno.perfilDominante} tamanho={52} />
          <div className="min-w-0">
            <h2 className="text-[26px] leading-tight text-foreground">{aluno.nome}</h2>
            <p className="mt-1 break-words text-[12.5px] text-muted-foreground">
              {aluno.email}
              {aluno.naTurmaDesde && ` · na turma desde ${dataCurta(aluno.naTurmaDesde)}`}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Turma: {aluno.classe_nome} · Modo de operação: {aluno.modoOperacao}
            </p>
          </div>
          <PerfilChip perfil={aluno.perfilDominante} />
        </div>

        <dl className="mt-[22px] flex flex-wrap gap-x-[34px] gap-y-4">
          {numeros.map((n) => (
            <div key={n.rotulo}>
              <dt className="console-label-sm !text-[11px]">{n.rotulo}</dt>
              <dd className="mt-1.5 text-2xl font-extrabold text-foreground">{n.valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
