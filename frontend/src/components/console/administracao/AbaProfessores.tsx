import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  candidatosDe,
  contarAlunosDasTurmas,
  filtrarProfessores,
  lerAcessos,
  nomeDoAluno,
  nomeDoProfessor,
  type PessoaAluno,
  type ProfessorAdmin,
  type SituacaoDoProfessor,
  type TurmaAdmin,
} from "./administracao";
import { CampoDeBusca, CLASSE_SELECT, Estado, SeletorDeAluno, useEscrita, useLeitura, Vazio, type Escrever } from "./comum";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function Situacao({ liberado }: { liberado: boolean }) {
  return <span className={cn("text-[11.5px] font-semibold", liberado ? "text-muted-foreground" : "text-[hsl(var(--warning))]")}>{liberado ? "Liberado" : "Bloqueado"}</span>;
}

function CartaoDaTurma({ turma, porId, alunos, ocupado, escrever }: { turma: TurmaAdmin; porId: Map<string, PessoaAluno>; alunos: PessoaAluno[]; ocupado: boolean; escrever: Escrever }) {
  const [aberta, setAberta] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const candidatos = useMemo(() => candidatosDe(alunos), [alunos]);
  const matriculados = useMemo(
    () =>
      turma.alunos
        .map((id) => {
          const a = porId.get(id);
          return { id, nome: a ? nomeDoAluno(a) : "Aluno sem cadastro", email: a?.email ?? null };
        })
        .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR", { sensitivity: "base" })),
    [turma.alunos, porId],
  );
  return (
    <li className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" aria-expanded={aberta} onClick={() => setAberta(!aberta)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronDown className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", !aberta && "-rotate-90")} aria-hidden="true" />
          <span className="truncate text-[13px] font-bold text-foreground">{turma.nome}</span>
          <span className="flex-none text-[11.5px] text-muted-foreground">{plural(turma.alunos.length, "aluno", "alunos")}</span>
        </button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={adicionando}
          aria-label={`Matricular aluno em ${turma.nome}`}
          onClick={() => {
            setAdicionando(!adicionando);
            setAberta(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Matricular
        </Button>
      </div>
      {aberta && (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
          {adicionando && (
            <SeletorDeAluno
              alunos={candidatos}
              excluir={turma.alunos}
              acao="Matricular"
              rotulo={`Buscar aluno para ${turma.nome}`}
              ocupado={ocupado}
              onEscolher={(aluno) => void escrever("admin_turma_matricular", { p_classe: turma.classe_id, p_aluno: aluno }, (r) => ((r as { matriculado?: boolean } | null)?.matriculado === false ? "O aluno já estava na turma." : "Aluno matriculado."))}
            />
          )}
          {turma.alunos.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">Nenhum aluno matriculado.</p>
          ) : (
            <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {matriculados.map((a) => (
                <li key={a.id} className="truncate text-[12.5px] text-foreground" title={a.email ?? undefined}>
                  {a.nome}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function DetalheDoProfessor({ p, alunos, ocupado, escrever }: { p: ProfessorAdmin; alunos: PessoaAluno[]; ocupado: boolean; escrever: Escrever }) {
  const [vinculando, setVinculando] = useState(false);
  const [confirmandoBloqueio, setConfirmandoBloqueio] = useState(false);
  const nome = nomeDoProfessor(p);
  const porId = useMemo(() => new Map(alunos.map((a) => [a.aluno_id, a])), [alunos]);
  const candidatos = useMemo(() => candidatosDe(alunos), [alunos]);
  const detalhes = [p.instituicao, p.disciplina].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-foreground">{nome}</h3>
          <p className="text-[12.5px] text-muted-foreground">{detalhes || "Sem instituição informada"}</p>
          {p.descricao && <p className="mt-1 text-[12.5px] text-muted-foreground">{p.descricao}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Situacao liberado={p.liberado} />
          {p.liberado ? (
            <Button type="button" size="sm" variant="outline" disabled={ocupado || confirmandoBloqueio} onClick={() => setConfirmandoBloqueio(true)}>
              Bloquear…
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void escrever("admin_professor_liberar", { p_professor: p.professor_id, p_liberado: true }, `${nome} liberado.`)}>
              Liberar
            </Button>
          )}
        </div>
      </header>

      {confirmandoBloqueio && p.liberado && (
        <div role="alertdialog" aria-labelledby="admin-bloqueio" className="rounded-[14px] border border-destructive/50 bg-destructive/10 px-3.5 py-3">
          <p id="admin-bloqueio" className="text-[13px] font-semibold text-foreground">Bloquear o acesso de {nome}?</p>
          <p className="mt-1 text-[12px] leading-normal text-foreground">A pessoa deixa de entrar no console até ser liberada de novo. As turmas e os alunos dela continuam como estão.</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" autoFocus disabled={ocupado} onClick={() => setConfirmandoBloqueio(false)}>
              Manter liberado
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={ocupado}
              onClick={() => void escrever("admin_professor_liberar", { p_professor: p.professor_id, p_liberado: false }, `${nome} bloqueado.`).then(() => setConfirmandoBloqueio(false))}
            >
              Bloquear acesso
            </Button>
          </div>
        </div>
      )}

      <section aria-labelledby="admin-turmas" className="flex flex-col gap-2">
        <h4 id="admin-turmas" className="font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Turmas · {p.turmas.length}
        </h4>
        {p.turmas.length === 0 ? (
          <Vazio>Este professor ainda não criou turma.</Vazio>
        ) : (
          <ul className="flex flex-col gap-2">
            {p.turmas.map((t) => (
              <CartaoDaTurma key={t.classe_id} turma={t} porId={porId} alunos={alunos} ocupado={ocupado} escrever={escrever} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-vinculos" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id="admin-vinculos" className="font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Alunos com acesso · {p.alunos.length}
          </h4>
          <Button type="button" size="sm" variant="outline" aria-expanded={vinculando} onClick={() => setVinculando(!vinculando)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Vincular
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">Quem está aqui aparece para o professor na hora de matricular. Vincular não matricula em turma.</p>
        {vinculando && (
          <SeletorDeAluno
            alunos={candidatos}
            excluir={p.alunos.map((a) => a.aluno_id)}
            acao="Vincular"
            rotulo={`Buscar aluno para vincular a ${nome}`}
            ocupado={ocupado}
            onEscolher={(aluno) => void escrever("admin_professor_aluno", { p_professor: p.professor_id, p_aluno: aluno, p_has_acesso: true }, "Aluno vinculado.")}
          />
        )}
        {p.alunos.length > 0 && (
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {p.alunos.map((a) => (
              <li key={a.aluno_id} className="flex items-center justify-between gap-2 border-t border-border py-1 text-[12.5px] text-foreground">
                <span className="min-w-0 truncate" title={a.email ?? undefined}>
                  {nomeDoAluno(a)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11.5px] text-muted-foreground"
                  disabled={ocupado}
                  aria-label={`Desvincular ${nomeDoAluno(a)} de ${nome}`}
                  onClick={() => void escrever("admin_professor_aluno", { p_professor: p.professor_id, p_aluno: a.aluno_id, p_has_acesso: false }, "Vínculo removido.")}
                >
                  Desvincular
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AbaProfessores() {
  const { dados, erro, carregar } = useLeitura("admin_acessos", {}, lerAcessos);
  const { ocupado, escrever } = useEscrita(carregar);
  const [termo, setTermo] = useState("");
  const [situacao, setSituacao] = useState<SituacaoDoProfessor>("todos");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const lista = useMemo(() => filtrarProfessores(dados?.professores ?? [], termo, situacao), [dados, termo, situacao]);
  // Fixa a seleção: liberar reordena a lista, e o painel não pode pular para outro professor.
  const primeiro = lista[0]?.professor_id ?? null;
  useEffect(() => {
    if (selecionado === null && primeiro) setSelecionado(primeiro);
  }, [selecionado, primeiro]);
  if (!dados) return <Estado erro={erro} />;
  const atual = lista.find((p) => p.professor_id === selecionado) ?? lista[0] ?? null;
  const bloqueados = dados.professores.filter((p) => !p.liberado).length;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[12.5px] text-muted-foreground">
          {plural(dados.professores.length, "professor", "professores")} · {plural(bloqueados, "bloqueado", "bloqueados")} · {plural(dados.alunos.length, "aluno", "alunos")}
        </p>
        <CampoDeBusca rotulo="Buscar professor" valor={termo} onChange={setTermo} />
        <select aria-label="Filtrar por situação" className={CLASSE_SELECT} value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoDoProfessor)}>
          <option value="todos">Todos</option>
          <option value="liberados">Liberados</option>
          <option value="bloqueados">Bloqueados</option>
        </select>
        {lista.length === 0 ? (
          <Vazio>Nenhum professor com esse filtro.</Vazio>
        ) : (
          <ul className="flex max-h-[220px] flex-col gap-1 overflow-y-auto lg:max-h-[calc(100vh-280px)]">
            {lista.map((p) => (
              <li key={p.professor_id}>
                <button
                  type="button"
                  aria-pressed={atual?.professor_id === p.professor_id}
                  onClick={() => setSelecionado(p.professor_id)}
                  className={cn(
                    "flex w-full flex-col rounded-lg border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    atual?.professor_id === p.professor_id ? "border-[hsl(var(--console-violet))] bg-card" : "border-transparent hover:bg-card",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-foreground">{nomeDoProfessor(p)}</span>
                    <Situacao liberado={p.liberado} />
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {plural(p.turmas.length, "turma", "turmas")} · {plural(contarAlunosDasTurmas(p), "aluno", "alunos")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {atual && <DetalheDoProfessor key={atual.professor_id} p={atual} alunos={dados.alunos} ocupado={ocupado} escrever={escrever} />}
    </div>
  );
}
