import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import KpisPrincipais from "./KpisPrincipais";
import KpisSecundarios from "./KpisSecundarios";
import AbandonoPorPerfil from "./AbandonoPorPerfil";
import InatividadePorPerfil from "./InatividadePorPerfil";
import DistribuicaoNotas from "./DistribuicaoNotas";
import { N_MINIMO_PADRAO, type SegmentoPerfil } from "./graficos";
import {
  distribuicaoDeExemplo,
  MEDIA_ACERTOS_EXEMPLO,
  MEDIA_CONCLUSAO_EXEMPLO,
  MEDIA_NOTAS_EXEMPLO,
  perfisDeExemplo,
  RESUMO_DE_EXEMPLO,
  TOTAL_DE_ALUNOS,
} from "./exemploDaPesquisa";
import type { Disponibilidade } from "./disponibilidade";

/** Selo repetido em cada bloco: quem rola a página não pode perder de vista que o número é inventado. */
export function SeloDeExemplo() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-warning/60 bg-warning/10 px-3 py-1 text-[12px] font-semibold text-foreground">
      <FlaskConical size={14} aria-hidden="true" /> Exemplo: valores ilustrativos
    </span>
  );
}

const SEM_DISPONIBILIDADE = new Map<string, Disponibilidade>();

/**
 * Visão geral da turma de demonstração da pesquisa: os componentes de verdade do console, com
 * valores fixos de exemplo. O professor avalia se entende cada painel e a explicação dele, não o dado.
 */
export default function PainelDeExemplo() {
  const [segmento, setSegmento] = useState<SegmentoPerfil>("majoritario");
  const perfis = useMemo(perfisDeExemplo, []);
  const distribuicao = useMemo(distribuicaoDeExemplo, []);
  const inatividadePct = (100 * RESUMO_DE_EXEMPLO.alunos_inativos) / RESUMO_DE_EXEMPLO.total_alunos;

  return (
    <section aria-labelledby="painel-exemplo-titulo" className="space-y-6">
      <div className="flex flex-col gap-2 rounded-[20px] border border-warning/60 bg-warning/5 p-4">
        <SeloDeExemplo />
        <h2 id="painel-exemplo-titulo" className="text-base font-semibold text-foreground">
          Esta turma mostra as métricas com números de exemplo
        </h2>
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          A sua turma de demonstração ainda não tem alunos estudando, então os painéis abaixo usam valores
          inventados, sempre os mesmos. Eles servem para você avaliar o formato: se entende o que cada painel
          mostra, se a explicação (o ícone de interrogação ao lado do título) ajuda e se a visualização é clara.
          Nenhum desses números descreve uma turma real.
        </p>
      </div>

      <KpisPrincipais
        totalAlunos={TOTAL_DE_ALUNOS}
        mediaNotas={MEDIA_NOTAS_EXEMPLO}
        mediaConclusao={MEDIA_CONCLUSAO_EXEMPLO}
        temDados
      />

      <KpisSecundarios
        mediaAcertos={MEDIA_ACERTOS_EXEMPLO}
        turmaResumo={RESUMO_DE_EXEMPLO}
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
          media={RESUMO_DE_EXEMPLO.taxa_risco_abandono_pct}
        />
        <DistribuicaoNotas linhas={distribuicao} mediaNotas={MEDIA_NOTAS_EXEMPLO} />
        <InatividadePorPerfil
          linhas={perfis}
          segmento={segmento}
          onSegmentoChange={setSegmento}
          media={inatividadePct}
          nMinimo={N_MINIMO_PADRAO}
        />
      </div>
    </section>
  );
}
