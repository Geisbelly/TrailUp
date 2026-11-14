import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import SegmentedPills from "../dashboard/SegmentedPills";
import { quando } from "../tecnico/disponibilidade";
import { Numero } from "../tecnico/pecasDoPainel";
import { FormTermoPapel } from "../turmas/FormTermoPapel";
import { FINALIDADES, RELACOES } from "../turmas/termosResponsavel";
import {
  alunoTemPendencia,
  filtrarTermos,
  lerDetalheDoAluno,
  lerDetalheDoProfessor,
  lerTermos,
  motivoValido,
  seloDaIdade,
  seloDaPesquisa,
  seloDoProfessor,
  seloDoResponsavel,
  seloDoTermo,
  type FiltroDeTermos,
  type LinhaDoHistorico,
  type Selo,
  type TermosDoAluno,
  type TermosDoProfessor,
} from "./administracao";
import { CampoDeBusca, CLASSE_SELECT, Estado, Vazio } from "./comum";
import { useEscrita, useLeitura } from "./leituraEscrita";

type Publico = "alunos" | "professores";
type TipoRevogavel = "responsavel" | "pesquisa" | "professor";

const dataSimples = (iso: string | null): string => (iso ? iso.split("-").reverse().join("/") : "sem data");

function Etiqueta({ rotulo, selo }: { rotulo: string; selo: Selo }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{rotulo}</span>
      <span className={cn("truncate text-[12.5px]", selo.pendente ? "font-semibold text-[hsl(var(--warning))]" : "text-foreground")}>{selo.texto}</span>
    </span>
  );
}

function Bloco({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-foreground">{titulo}</h3>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

function descricaoDaLinha(l: LinhaDoHistorico): string {
  const partes = [`versão ${l.versao}`];
  if (l.metodo) partes.push(l.metodo === "papel" ? "em papel" : "no aparelho");
  if (l.plataforma) partes.push(l.plataforma);
  if (l.por) partes.push(`registrado por ${l.por}`);
  return partes.join(" · ");
}

function Historico({ linhas, vazio }: { linhas: LinhaDoHistorico[]; vazio: string }) {
  if (linhas.length === 0) return <p className="text-[12.5px] text-muted-foreground">{vazio}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {linhas.map((l) => {
        const relacao = RELACOES.find((r) => r.valor === l.relacao)?.rotulo;
        const finalidades = FINALIDADES.filter((f) => l.finalidades.includes(f.chave)).map((f) => f.rotulo);
        return (
          <li key={l.id} className="flex flex-col gap-0.5 px-3 py-2 text-[12.5px]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className={cn("font-semibold", l.status === "accepted" ? "text-foreground" : "text-[hsl(var(--warning))]")}>{l.status === "accepted" ? "Aceite" : "Recusa ou revogação"}</span>
              <span className="text-[11.5px] text-muted-foreground">{quando(l.decidido_em)}</span>
            </div>
            <span className="text-[11.5px] text-muted-foreground">{descricaoDaLinha(l)}</span>
            {l.nome && (
              <span className="text-foreground">
                Assinado por {l.nome}
                {relacao ? ` (${relacao})` : ""}
              </span>
            )}
            {finalidades.length > 0 && <span className="text-[11.5px] text-muted-foreground">Autorizou: {finalidades.join(", ")}</span>}
            {l.motivo && <span className="text-[11.5px] text-muted-foreground">Motivo: {l.motivo}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Revogar({ rotulo, explicacao, ocupado, onConfirmar }: { rotulo: string; explicacao: string; ocupado: boolean; onConfirmar: (motivo: string) => Promise<unknown> }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!aberto) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
        {rotulo}
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-background/40 p-2.5">
      <p className="text-[12px] text-muted-foreground">{explicacao}</p>
      <label className="text-[11.5px] font-semibold text-muted-foreground">
        Motivo
        <input type="text" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${CLASSE_SELECT} mt-1 w-full`} />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={ocupado || !motivoValido(motivo)}
          onClick={() => {
            void onConfirmar(motivo.trim()).then((resposta) => {
              if (resposta !== null) setAberto(false);
            });
          }}
        >
          Confirmar
        </Button>
      </div>
    </div>
  );
}

function CorrigirNascimento({ alunoId, atual, ocupado, onCorrigir }: { alunoId: string; atual: string | null; ocupado: boolean; onCorrigir: (args: Record<string, unknown>) => Promise<unknown> }) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(atual ?? "");
  const [motivo, setMotivo] = useState("");
  const rotulo = atual ? "Corrigir data" : "Informar data";
  if (!aberto) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
        {rotulo}
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-background/40 p-2.5">
      <p className="text-[12px] text-muted-foreground">A data decide se o aluno é menor e pode tirá-lo do modo restrito. A data anterior e o motivo ficam guardados.</p>
      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
        <label className="text-[11.5px] font-semibold text-muted-foreground">
          Data de nascimento
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={`${CLASSE_SELECT} mt-1 block w-full`} />
        </label>
        <label className="min-w-0 text-[11.5px] font-semibold text-muted-foreground">
          Motivo
          <input type="text" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${CLASSE_SELECT} mt-1 w-full`} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={ocupado || !data || !motivoValido(motivo)}
          onClick={() => {
            void onCorrigir({ p_aluno: alunoId, p_data: data, p_motivo: motivo.trim() }).then((resposta) => {
              if (resposta !== null) setAberto(false);
            });
          }}
        >
          Salvar data
        </Button>
      </div>
    </div>
  );
}

function DetalheDoAluno({ a, nome, onMudou }: { a: TermosDoAluno; nome: string; onMudou: () => Promise<void> }) {
  const argumentos = useMemo(() => ({ p_papel: "aluno", p_id: a.aluno_id }), [a.aluno_id]);
  const { dados, erro, carregar } = useLeitura("admin_termos_detalhe", argumentos, lerDetalheDoAluno);
  const reler = useCallback(async () => {
    await Promise.all([carregar(), onMudou()]);
  }, [carregar, onMudou]);
  const { ocupado, escrever } = useEscrita(reler);
  const [papel, setPapel] = useState(false);

  if (!dados) return <Estado erro={erro} />;
  const revogar = (tipo: TipoRevogavel) => (motivo: string) => escrever("admin_termo_revogar", { p_tipo: tipo, p_titular: a.aluno_id, p_motivo: motivo }, "Revogação registrada.");
  return (
    <div className="flex flex-col gap-4">
      <Bloco
        titulo={dados.nascimento ? `Nascimento: ${dataSimples(dados.nascimento)}` : "Nascimento não informado"}
        acoes={<CorrigirNascimento key={dados.nascimento ?? "sem"} alunoId={a.aluno_id} atual={dados.nascimento} ocupado={ocupado} onCorrigir={(args) => escrever("admin_aluno_nascimento_corrigir", args, "Data de nascimento salva.")} />}
      >
        {dados.correcoes.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-[11.5px] text-muted-foreground">
            {dados.correcoes.map((c, i) => (
              <li key={i}>
                {quando(c.corrigido_em)}: de {dataSimples(c.data_anterior)} para {dataSimples(c.data_nova)}
                {c.por ? `, por ${c.por}` : ""}. Motivo: {c.motivo}
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco
        titulo="Assinatura do responsável"
        acoes={
          <>
            {!papel && (
              <Button type="button" size="sm" variant="outline" onClick={() => setPapel(true)}>
                Registrar termo em papel
              </Button>
            )}
            {a.responsavel?.status === "accepted" && (
              <Revogar rotulo="Revogar" explicacao="Grava a revogação ao lado do aceite, que continua como prova. O aluno menor volta ao modo restrito." ocupado={ocupado} onConfirmar={revogar("responsavel")} />
            )}
          </>
        }
      >
        {papel && (
          <FormTermoPapel
            alunoId={a.aluno_id}
            nomeDoAluno={nome}
            semDataNascimento={!dados.nascimento}
            onCancelar={() => setPapel(false)}
            onSalvo={() => {
              setPapel(false);
              void reler();
            }}
          />
        )}
        <Historico linhas={dados.responsavel} vazio="Nenhuma assinatura registrada." />
      </Bloco>

      <Bloco
        titulo="Pesquisa"
        acoes={a.pesquisa?.status === "accepted" ? <Revogar rotulo="Revogar" explicacao="Grava a revogação ao lado do aceite e tira o aluno da pesquisa." ocupado={ocupado} onConfirmar={revogar("pesquisa")} /> : undefined}
      >
        <Historico linhas={dados.pesquisa} vazio="O aluno não decidiu sobre a pesquisa." />
      </Bloco>

      <Bloco titulo="Termo do aluno">
        <p className="text-[12px] text-muted-foreground">Só leitura: quem aceita ou recusa é o aluno, no app, e é o aparelho que liga ou desliga a coleta.</p>
        <Historico linhas={dados.termos} vazio="O aluno ainda não respondeu ao termo." />
      </Bloco>
    </div>
  );
}

function DetalheDoProfessor({ p, onMudou }: { p: TermosDoProfessor; onMudou: () => Promise<void> }) {
  const argumentos = useMemo(() => ({ p_papel: "professor", p_id: p.professor_id }), [p.professor_id]);
  const { dados, erro, carregar } = useLeitura("admin_termos_detalhe", argumentos, lerDetalheDoProfessor);
  const reler = useCallback(async () => {
    await Promise.all([carregar(), onMudou()]);
  }, [carregar, onMudou]);
  const { ocupado, escrever } = useEscrita(reler);

  if (!dados) return <Estado erro={erro} />;
  return (
    <Bloco
      titulo="Aceites do professor"
      acoes={
        p.aceite?.status === "accepted" ? (
          <Revogar
            rotulo="Pedir novo aceite"
            explicacao="Grava a revogação ao lado do aceite. No próximo acesso, o console pede que aceite de novo."
            ocupado={ocupado}
            onConfirmar={(motivo) => escrever("admin_termo_revogar", { p_tipo: "professor", p_titular: p.professor_id, p_motivo: motivo }, "Novo aceite pedido.")}
          />
        ) : undefined
      }
    >
      <Historico linhas={dados} vazio="Nenhum aceite registrado. O console pede o aceite no próximo acesso." />
    </Bloco>
  );
}

function Linha({ id, titulo, subtitulo, etiquetas, children }: { id: string; titulo: string; subtitulo: string | null; etiquetas: ReactNode; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <li>
      <button type="button" aria-expanded={aberta} aria-controls={id} onClick={() => setAberta((v) => !v)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2.4fr)] md:items-center">
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-foreground">{titulo}</span>
            {subtitulo && <span className="block truncate text-[11.5px] text-muted-foreground">{subtitulo}</span>}
          </span>
          <span className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">{etiquetas}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 flex-none text-muted-foreground transition-transform", aberta && "rotate-180")} aria-hidden="true" />
      </button>
      {aberta && (
        <div id={id} className="border-t border-border bg-background/40 px-4 py-3">
          {children}
        </div>
      )}
    </li>
  );
}

export default function AbaTermos() {
  const { dados, erro, carregar } = useLeitura("admin_termos", {}, lerTermos);
  const [publico, setPublico] = useState<Publico>("alunos");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroDeTermos>("todos");

  const alunos = useMemo(() => (dados ? filtrarTermos(dados.alunos, busca, filtro, alunoTemPendencia) : []), [dados, busca, filtro]);
  const professores = useMemo(() => (dados ? filtrarTermos(dados.professores, busca, filtro, (p) => seloDoProfessor(p.aceite).pendente) : []), [dados, busca, filtro]);

  if (!dados) return <Estado erro={erro} />;
  const visiveis = publico === "alunos" ? alunos.length : professores.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero rotulo="Alunos em modo restrito" valor={dados.alunos.filter((a) => a.modo_restrito).length} destaque={dados.alunos.some((a) => a.modo_restrito)} />
        <Numero rotulo="Alunos sem termo" valor={dados.alunos.filter((a) => !a.termo).length} />
        <Numero rotulo="Assinaturas de responsável" valor={dados.alunos.filter((a) => a.responsavel?.status === "accepted" && a.responsavel.vigente).length} />
        <Numero rotulo="Professores sem aceite" valor={dados.professores.filter((p) => seloDoProfessor(p.aceite).pendente).length} destaque={dados.professores.some((p) => seloDoProfessor(p.aceite).pendente)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedPills<Publico>
          ariaLabel="De quem são os termos"
          opcoes={[
            { value: "alunos", label: `Alunos (${dados.alunos.length})` },
            { value: "professores", label: `Professores (${dados.professores.length})` },
          ]}
          valor={publico}
          onChange={setPublico}
          className="w-fit"
        />
        <CampoDeBusca rotulo="Buscar por nome ou e-mail" valor={busca} onChange={setBusca} contagem={`${visiveis}`} className="min-w-[12rem] flex-1" />
        <select aria-label="Filtrar por situação" className={CLASSE_SELECT} value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroDeTermos)}>
          <option value="todos">Todos</option>
          <option value="pendentes">Só pendências</option>
        </select>
      </div>
      {visiveis === 0 ? (
        <Vazio>{busca.trim() || filtro !== "todos" ? "Ninguém com esse filtro." : "Ninguém cadastrado."}</Vazio>
      ) : publico === "alunos" ? (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
          {alunos.map((a) => {
            const nome = a.nome ?? a.email ?? "Sem nome";
            return (
              <Linha
                key={a.aluno_id}
                id={`termos-${a.aluno_id}`}
                titulo={nome}
                subtitulo={a.email && a.email !== nome ? a.email : null}
                etiquetas={
                  <>
                    <Etiqueta rotulo="Idade" selo={seloDaIdade(a.idade)} />
                    <Etiqueta rotulo="Termo" selo={seloDoTermo(a.termo)} />
                    <Etiqueta rotulo="Responsável" selo={seloDoResponsavel(a)} />
                    <Etiqueta rotulo="Pesquisa" selo={seloDaPesquisa(a.pesquisa)} />
                  </>
                }
              >
                <DetalheDoAluno a={a} nome={nome} onMudou={carregar} />
              </Linha>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
          {professores.map((p) => (
            <Linha
              key={p.professor_id}
              id={`termos-${p.professor_id}`}
              titulo={p.nome ?? p.email ?? "Sem nome"}
              subtitulo={p.email}
              etiquetas={
                <>
                  <Etiqueta rotulo="Termos" selo={seloDoProfessor(p.aceite)} />
                  <Etiqueta rotulo="Acesso" selo={{ texto: p.liberado ? "Liberado" : "Aguardando", pendente: !p.liberado }} />
                </>
              }
            >
              <DetalheDoProfessor p={p} onMudou={carregar} />
            </Linha>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-muted-foreground">
        Versões em vigor: responsável {dados.versoes.responsavel}, pesquisa {dados.versoes.pesquisa}, professor {dados.versoes.professor}. Nada aqui apaga prova: toda ação entra no histórico.
      </p>
    </div>
  );
}
