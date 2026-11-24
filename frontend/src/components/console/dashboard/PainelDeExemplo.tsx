import { useMemo, useState } from "react";
import KpisPrincipais from "./KpisPrincipais";
import KpisSecundarios from "./KpisSecundarios";
import AbandonoPorPerfil from "./AbandonoPorPerfil";
import InatividadePorPerfil from "./InatividadePorPerfil";
import DistribuicaoNotas from "./DistribuicaoNotas";
import { N_MINIMO_PADRAO, type SegmentoPerfil } from "./graficos";
import PrecisamDeAtencao, { type AlunoEmRisco } from "./PrecisamDeAtencao";
import TabelaAlunos from "./TabelaAlunos";
import { distribuicaoDosAlunos, perfisDosAlunos, resumoDosAlunos } from "./exemploDaPesquisa";
import { kpisDosAlunos } from "./kpisDosAlunos";
import type { AlunoAnalisado } from "./aluno/tipos";
import type { Disponibilidade } from "./disponibilidade";
import { SeloDeExemplo } from "../comum/SeloDeExemplo";

const SEM_DISPONIBILIDADE = new Map<string, Disponibilidade>();

/**
 * Visão geral da turma de demonstração da pesquisa: os componentes de verdade do console, sobre uma
 * lista de alunos que junta os de exemplo (`alunosDeExemplo`) aos de verdade da turma. Todo número
 * da tela sai dessa lista, então cabeçalho, cartões, gráficos, "precisam de atenção" e tabela batem.
 * O aluno de exemplo abre um detalhe também de exemplo (`aluno/exemploDoAluno.ts`), com o mesmo selo.
 */
export default function PainelDeExemplo({
  alunos,
  onAbrir,
  hoje = new Date(),
}: {
  alunos: AlunoAnalisado[];
  onAbrir: (aluno: AlunoAnalisado) => void;
  hoje?: Date;
}) {
  const [segmento, setSegmento] = useState<SegmentoPerfil>("majoritario");
  const classeId = alunos[0]?.classe_id ?? 0;
  const dia = hoje.toISOString().slice(0, 10);
  const { kpis, resumo, perfis, distribuicao, emRisco } = useMemo(() => {
    const agora = new Date(`${dia}T12:00:00Z`);
    return {
      kpis: kpisDosAlunos(alunos),
      resumo: resumoDosAlunos(alunos, agora),
      perfis: perfisDosAlunos(alunos, classeId, agora),
      distribuicao: distribuicaoDosAlunos(alunos, classeId),
      emRisco: alunos.filter((a): a is AlunoAnalisado & AlunoEmRisco => a.risco !== null),
    };
  }, [alunos, classeId, dia]);
  const inatividadePct = kpis.totalAlunos ? (100 * resumo.alunos_inativos) / kpis.totalAlunos : null;
  const temAbandono = alunos.some((a) => a.riscoFaixa !== null);

  return (
    <section aria-labelledby="painel-exemplo-titulo" className="space-y-6">
      <div className="flex flex-col gap-2 rounded-[20px] border border-warning/60 bg-warning/5 p-4">
        <SeloDeExemplo />
        <h2 id="painel-exemplo-titulo" className="text-base font-semibold text-foreground">
          Esta turma mostra as métricas com números de exemplo
        </h2>
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          A sua turma de demonstração ainda não tem alunos estudando, então ela ganhou alunos inventados,
          marcados com (exemplo) no nome. Todos os números da tela saem dessa mesma lista: o total do topo, os
          cartões, os gráficos e a tabela batem entre si. O aluno de teste da sua conta entra na lista assim que
          você entrar no app com ele, e o que você fizer lá aparece aqui. Clique em um aluno para abrir o
          detalhe: os de exemplo também têm evolução, trilha, tentativas, personalização e momentos de cuidado. Avalie o formato: se entende o que cada painel
          mostra, se a explicação (o ícone de interrogação ao lado do título) ajuda e se a visualização é clara.
          Nenhum aluno marcado como exemplo descreve uma turma real.
        </p>
      </div>

      <KpisPrincipais
        totalAlunos={kpis.totalAlunos}
        mediaNotas={kpis.mediaNotas}
        mediaConclusao={kpis.mediaConclusao}
        temDados={kpis.totalAlunos > 0}
      />

      <PrecisamDeAtencao<AlunoAnalisado & AlunoEmRisco>
        alunos={emRisco}
        totalDaTurma={kpis.totalAlunos}
        mostrarTurma={false}
        onAbrir={onAbrir}
      />

      <KpisSecundarios
        mediaAcertos={kpis.mediaAcertos}
        turmaResumo={resumo}
        temDadosTurma
        erroTurma={null}
        disponibilidade={SEM_DISPONIBILIDADE}
      />

      <SeloDeExemplo />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <AbandonoPorPerfil
          linhas={perfis}
          segmento={segmento}
          onSegmentoChange={setSegmento}
          media={resumo.taxa_risco_abandono_pct}
        />
        <DistribuicaoNotas linhas={distribuicao} mediaNotas={kpis.mediaNotas} />
        <InatividadePorPerfil
          linhas={perfis}
          segmento={segmento}
          onSegmentoChange={setSegmento}
          media={inatividadePct}
          nMinimo={N_MINIMO_PADRAO}
        />
      </div>

      <SeloDeExemplo />
      <TabelaAlunos alunos={alunos} mostrarClasse={false} mostrarAbandono={temAbandono} onAbrir={onAbrir} />
    </section>
  );
}
