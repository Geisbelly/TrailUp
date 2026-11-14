import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { filtrarAlunos, lerAcessos, nomeDoAluno, todasAsTurmas, turmasPorAluno, type FiltroDeAluno, type PessoaAluno, type TurmaDoAluno } from "./administracao";
import { CampoDeBusca, CLASSE_SELECT, Estado, Vazio } from "./comum";
import { useEscrita, useLeitura, type Escrever } from "./leituraEscrita";

function LinhaDoAluno({ a, turmas, todas, ocupado, escrever }: { a: PessoaAluno; turmas: TurmaDoAluno[]; todas: TurmaDoAluno[]; ocupado: boolean; escrever: Escrever }) {
  const [turma, setTurma] = useState("");
  const dele = new Set(turmas.map((t) => t.classe_id));
  const disponiveis = todas.filter((t) => !dele.has(t.classe_id));
  const nome = nomeDoAluno(a);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-2 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-foreground">{nome}</div>
        {a.email && a.email !== nome && <div className="truncate text-[11.5px] text-muted-foreground">{a.email}</div>}
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {turmas.length === 0 ? (
          <span className="text-[12px] text-[hsl(var(--warning))]">Sem turma</span>
        ) : (
          turmas.map((t) => (
            <span key={t.classe_id} title={t.professor} className="max-w-full truncate rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-foreground">
              {t.nome}
            </span>
          ))
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <select aria-label={`Turma para ${nome}`} className={`${CLASSE_SELECT} w-0 min-w-0 flex-1 md:w-44 md:flex-none`} value={turma} onChange={(e) => setTurma(e.target.value)} disabled={disponiveis.length === 0}>
          <option value="">{disponiveis.length === 0 ? "Em todas as turmas" : "Escolha a turma"}</option>
          {disponiveis.map((t) => (
            <option key={t.classe_id} value={t.classe_id}>
              {t.nome} · {t.professor}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={ocupado || !turma}
          aria-label={`Matricular ${nome}`}
          onClick={() => {
            void escrever("admin_turma_matricular", { p_classe: Number(turma), p_aluno: a.aluno_id }, `${nome} matriculado.`);
            setTurma("");
          }}
        >
          Matricular
        </Button>
      </div>
    </li>
  );
}

export default function AbaAlunos() {
  const { dados, erro, carregar } = useLeitura("admin_acessos", {}, lerAcessos);
  const { ocupado, escrever } = useEscrita(carregar);
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState<FiltroDeAluno>("todos");
  const porAluno = useMemo(() => (dados ? turmasPorAluno(dados) : new Map<string, TurmaDoAluno[]>()), [dados]);
  const todas = useMemo(() => (dados ? todasAsTurmas(dados) : []), [dados]);
  const lista = useMemo(() => filtrarAlunos(dados?.alunos ?? [], porAluno, termo, filtro), [dados, porAluno, termo, filtro]);
  if (!dados) return <Estado erro={erro} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CampoDeBusca rotulo="Buscar por nome ou e-mail" valor={termo} onChange={setTermo} contagem={`${lista.length} de ${dados.alunos.length}`} className="min-w-[220px] flex-1" />
        <select aria-label="Filtrar alunos" className={CLASSE_SELECT} value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroDeAluno)}>
          <option value="todos">Todos</option>
          <option value="sem_turma">Sem turma</option>
        </select>
      </div>
      {lista.length === 0 ? (
        <Vazio>Nenhum aluno com esse filtro.</Vazio>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {lista.map((a) => (
            <LinhaDoAluno key={a.aluno_id} a={a} turmas={porAluno.get(a.aluno_id) ?? []} todas={todas} ocupado={ocupado} escrever={escrever} />
          ))}
        </ul>
      )}
    </div>
  );
}
