import { nomeExibidoDoPerfil } from "./perfilCores";
import { PerfilAvatar } from "./PerfilVisual";
import { descricaoDosCriterios, type Criterio, type Risco } from "./risco";

export type AlunoEmRisco = {
  id: string;
  classe_id: number;
  nome: string;
  perfilDominante: string;
  classe_nome: string;
  risco: Risco;
};

export function ChipDeRisco({ nivel }: { nivel: Risco["nivel"] }) {
  const cor = nivel === "critico" ? "var(--destructive)" : "var(--warning)";
  // Texto na cor de primeiro plano: a cor de alerta sobre o próprio tom fica
  // abaixo de 7:1; o tom fica no fundo e na bolinha.
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold text-foreground"
      style={{ background: `hsl(${cor} / .16)` }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(${cor})` }} />
      {nivel === "critico" ? "Crítico" : "Atenção"}
    </span>
  );
}

export default function PrecisamDeAtencao<T extends AlunoEmRisco>({
  alunos,
  totalDaTurma,
  criterios,
  mostrarTurma,
  onAbrir,
}: {
  alunos: T[];
  totalDaTurma: number;
  criterios: Criterio[];
  mostrarTurma: boolean;
  onAbrir: (aluno: T) => void;
}) {
  if (alunos.length === 0) return null;
  const ordenados = [...alunos].sort(
    (a, b) =>
      Number(b.risco.nivel === "critico") - Number(a.risco.nivel === "critico") ||
      b.risco.fatores.length - a.risco.fatores.length ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );

  return (
    <section aria-labelledby="precisam-de-atencao" className="overflow-hidden rounded-[20px] border bg-card" style={{ borderColor: "hsl(var(--console-bronze))" }}>
      <div className="flex flex-wrap items-center gap-4 px-[26px] pb-[18px] pt-[22px]">
        <div
          aria-hidden="true"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border text-base font-extrabold"
          style={{ borderColor: "hsl(var(--console-bronze))", background: "hsl(var(--console-bronze) / .22)", color: "hsl(var(--console-bronze-text))" }}
        >
          {alunos.length}
        </div>
        <div className="min-w-0">
          <h3 id="precisam-de-atencao" className="text-[19px] text-foreground">Precisam de atenção</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {alunos.length} de {totalDaTurma} {totalDaTurma === 1 ? "aluno" : "alunos"} fora da curva da turma. A média esconde estes casos.
          </p>
        </div>
        <p className="max-w-[360px] rounded-full border border-border bg-muted px-3.5 py-2 text-xs text-muted-foreground sm:ml-auto">
          {descricaoDosCriterios(criterios)}
        </p>
      </div>

      <ul>
        {ordenados.map((aluno) => {
          const [principal, ...outros] = aluno.risco.fatores;
          return (
            <li key={`${aluno.id}-${aluno.classe_id}`} className="border-t border-border">
              <button
                type="button"
                onClick={() => onAbrir(aluno)}
                className="flex w-full flex-wrap items-center gap-4 px-[26px] py-3.5 text-left transition-colors hover:bg-muted/50"
              >
                <PerfilAvatar nome={aluno.nome} perfil={aluno.perfilDominante} tamanho={34} />
                <div className="min-w-[150px]">
                  <div className="text-[14.5px] font-semibold text-foreground">{aluno.nome}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {nomeExibidoDoPerfil(aluno.perfilDominante)}
                    {mostrarTurma && ` · ${aluno.classe_nome}`}
                  </div>
                </div>
                <ChipDeRisco nivel={aluno.risco.nivel} />
                <div className="min-w-[220px] flex-1">
                  <div className="text-[13px] font-semibold text-foreground">
                    {principal.motivo}
                    {outros.length > 0 && `; ${outros.map((f) => f.motivo.toLowerCase()).join("; ")}`}
                  </div>
                  {principal.comparacao && <div className="mt-0.5 text-xs text-muted-foreground">{principal.comparacao}</div>}
                </div>
                <span className="whitespace-nowrap text-xs font-bold text-[hsl(var(--console-violet-text))]">Abrir aluno</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
