import type { Classe } from "@/models/Classe";
import { buildClasseAcademicMetrics } from "@/utils/classeMetrics";
import { unificarContadores } from "@/utils/progressoPersonalizado";

/**
 * Progresso da campanha na Trilha: percentual, total de tópicos e concluídos.
 * Saiu de TrilhaBase para ser usado também pela Trilha da web em tela larga
 * (#346); a conta é a mesma.
 */
export function calcularProgressoTrilha(
  classeAtual: Classe,
  progressoPersonalizado: Parameters<typeof unificarContadores>[0]["personalizado"],
) {
  // O progresso soma os DOIS livros-caixa. `getProgressoGeral` conta apenas
  // conteudo/atividade do professor, entao a barra ficava parada enquanto o
  // aluno avancava no material personalizado e nos quizzes da apresentacao --
  // que e o "progresso desatualizado" relatado. Ver progressoPersonalizado.ts.
  const academico = buildClasseAcademicMetrics(classeAtual);
  const unificado = unificarContadores({
    academico: {
      conteudosConcluidos: academico.conteudosConcluidos,
      totalConteudos: academico.totalConteudos,
      atividadesConcluidas: academico.atividadesConcluidas,
      totalAtividades: academico.totalAtividades,
      conteudoIds: classeAtual.topicos.flatMap((topico: any) =>
        ((topico?.conteudos ?? []) as any[])
          .map((conteudo) => Number(conteudo?.id))
          .filter((id) => Number.isFinite(id))
      ),
    },
    personalizado: progressoPersonalizado,
  });
  const totalBlocos = unificado.totalConteudos + unificado.totalAtividades;
  const blocosFeitos = unificado.conteudosConcluidos + unificado.atividadesConcluidas;
  // Uma fonte so' para o percentual da campanha: o banco. A conta por blocos
  // continua alimentando os contadores abaixo, mas nao a barra -- ela dizia 32%
  // enquanto o perfil dizia 19% e o rank 75%, cada um com sua propria formula.
  const doBanco = classeAtual.resumo?.porcentagemConcluida as number | undefined;
  const progressoBruto =
    doBanco ??
    (totalBlocos > 0
      ? (blocosFeitos / totalBlocos) * 100
      : typeof (classeAtual as any).getProgressoGeral === "function"
      ? (classeAtual as any).getProgressoGeral()
      : 0);
  const progresso = Math.max(0, Math.min(100, Number(progressoBruto) || 0));
  const totalTopicos = classeAtual.topicos.length;
  const concluidos = classeAtual.topicos.filter((topico) => {
    const status = String(topico.status ?? "").toLowerCase();
    const pct = Number(topico.percentual_concluido ?? 0);
    return status.includes("concl") || pct >= 100;
  }).length;

  return { progresso, totalTopicos, concluidos };
}
