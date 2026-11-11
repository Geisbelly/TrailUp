import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { COR_DO_PERFIL, NOME_DO_PERFIL } from "../dashboard/perfilCores";
import { useDiversidadeDaTurma } from "../dashboard/useDiversidadeDaTurma";

const PARES_VISIVEIS = 5;

function decimal(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * A turma pelo vetor inteiro, ao lado da distribuição por perfil dominante. Sem a função no banco
 * (ou sem dado) não desenha nada: a aba fica como era.
 */
export function DiversidadeDaTurmaCard({ classeId }: { classeId: number | null }) {
  const diversidade = useDiversidadeDaTurma(classeId);
  if (!diversidade || diversidade.alunos === 0) return null;

  const semQuestionario = diversidade.alunos - diversidade.alunosComVetor;
  const pares = diversidade.pares.slice(0, PARES_VISIVEIS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Diversidade da turma</CardTitle>
        <CardDescription>
          Cada aluno responde o questionário com os 7 perfis, não com um só. Aqui a turma aparece pelo vetor
          inteiro, não só pelo 1º perfil de cada um.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {diversidade.alunosComVetor === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aluno da turma respondeu o questionário BrainHex ainda.</p>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Perfis efetivos</dt>
                <dd className="text-2xl font-semibold">{decimal(diversidade.perfisEfetivos)}</dd>
                <dd className="text-xs text-muted-foreground">
                  A turma se comporta como {decimal(diversidade.perfisEfetivos)} perfis de peso igual.
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Alunos com perfil misto</dt>
                <dd className="text-2xl font-semibold">
                  {diversidade.alunosMistos} de {diversidade.alunosComVetor}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  Menos de {decimal(diversidade.margemMisto)} pontos entre o 1º e o 2º perfil.
                </dd>
              </div>
              {semQuestionario > 0 && (
                <div>
                  <dt className="text-sm text-muted-foreground">Sem questionário</dt>
                  <dd className="text-2xl font-semibold">{semQuestionario}</dd>
                  <dd className="text-xs text-muted-foreground">Ficam fora desta conta.</dd>
                </div>
              )}
            </dl>

            {pares.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Combinações mais comuns (1º + 2º perfil)</h4>
                <ul className="space-y-1.5">
                  {pares.map((par) => (
                    <li key={`${par.primeiro}-${par.segundo}`} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: COR_DO_PERFIL[par.primeiro].marca }} />
                        <span aria-hidden="true" className="-ml-1 h-2.5 w-2.5 rounded-full" style={{ background: COR_DO_PERFIL[par.segundo].marca }} />
                        {NOME_DO_PERFIL[par.primeiro]} + {NOME_DO_PERFIL[par.segundo]}
                      </span>
                      <span className="text-muted-foreground">
                        {par.alunos} {par.alunos === 1 ? "aluno" : "alunos"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
