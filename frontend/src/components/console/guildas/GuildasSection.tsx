import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, LockOpen, Pencil, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CabecalhoDePagina, EstadoVazioDaPagina, ErroDaPagina, SeloDeStatus } from "../comum/PaginaDoConsole";
import { useTurmasDoProfessor } from "../comum/useTurmasDoProfessor";
import {
  DESCRICAO_MAX,
  NOME_MAX,
  TAMANHO_MAX,
  TAMANHO_MIN,
  abrirSemPrazo,
  dataHora,
  estadoDaJanela,
  fecharAgora,
  formularioDe,
  mensagemDeErroDaGuilda,
  tamanhoMinimoPermitido,
  resumoDaJanela,
  validarFormacao,
  validarGuilda,
  type ErrosDaFormacao,
  type ErrosDaGuilda,
  type Formacao,
  type FormularioDaFormacao,
  type PayloadDaFormacao,
} from "./formacao";
import { lerFormacao, renomearGuilda, salvarFormacao } from "./guildasApi";

const rotulo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const card = "overflow-hidden rounded-[20px] border bg-card";
const campo = "mt-2 rounded-[14px] bg-background";

/** Guildas da turma: a janela de formação (abrir, fechar, agendar, tamanho) e as guildas ativas. */
export default function GuildasSection({ professorId }: { professorId?: string }) {
  const { turmas, turmaId, setTurmaId, carregando: carregandoTurmas, erro: erroTurmas, recarregar } = useTurmasDoProfessor(professorId);
  const [formacao, setFormacao] = useState<Formacao | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [detalhe, setDetalhe] = useState("");
  const [form, setForm] = useState<FormularioDaFormacao>({ tamanho: "10", inicio: "", fim: "" });
  const [erros, setErros] = useState<ErrosDaFormacao>({});
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; nome: string; descricao: string; erros: ErrosDaGuilda } | null>(null);

  const carregar = useCallback(async (id: number) => {
    setEstado("carregando");
    try {
      const f = await lerFormacao(id);
      setFormacao(f);
      setForm(formularioDe(f));
      setErros({});
      setEstado("ok");
    } catch (e) {
      setDetalhe(mensagemDeErroDaGuilda(e as { code?: string; message?: string }));
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    if (turmaId) void carregar(turmaId);
  }, [turmaId, carregar]);

  const aplicar = async (payload: PayloadDaFormacao, sucesso: string) => {
    if (salvando || !turmaId) return;
    setSalvando(true);
    try {
      await salvarFormacao(payload);
      toast.success(sucesso);
      await carregar(turmaId);
    } catch (e) {
      toast.error(mensagemDeErroDaGuilda(e as { code?: string; message?: string }));
    } finally {
      setSalvando(false);
    }
  };

  const salvar = () => {
    if (!turmaId) return;
    const v = validarFormacao(form, turmaId, formacao?.guildas ?? []);
    if ("erros" in v) {
      setErros(v.erros);
      return;
    }
    setErros({});
    void aplicar(v.payload, "Formação de guildas atualizada.");
  };

  const salvarGuilda = async () => {
    if (!editando || salvando || !turmaId) return;
    const v = validarGuilda(editando.nome, editando.descricao);
    if ("erros" in v) {
      setEditando({ ...editando, erros: v.erros });
      return;
    }
    setSalvando(true);
    try {
      await renomearGuilda(editando.id, v.nome, v.descricao);
      toast.success("Guilda atualizada.");
      setEditando(null);
      await carregar(turmaId);
    } catch (e) {
      toast.error(mensagemDeErroDaGuilda(e as { code?: string; message?: string }));
    } finally {
      setSalvando(false);
    }
  };

  // O relógio do banco (`agora`) decide o estado mostrado; o booleano `janelaAberta` é o da função
  // que barra os alunos, então os dois concordam.
  const agoraDoBanco = formacao ? new Date(formacao.agora) : new Date();
  const resumo = formacao ? resumoDaJanela(formacao, agoraDoBanco) : null;
  const situacao = formacao ? estadoDaJanela(formacao, agoraDoBanco) : null;
  const minimo = formacao ? tamanhoMinimoPermitido(formacao.guildas) : TAMANHO_MIN;

  return (
    <div>
      <CabecalhoDePagina titulo="Guildas" subtitulo="Quando os alunos podem formar guildas, de que tamanho, e as guildas de cada turma." />

      {carregandoTurmas && <div role="status" aria-label="Carregando" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {erroTurmas && <ErroDaPagina titulo="Não foi possível carregar as turmas" detalhe={erroTurmas} onTentarNovamente={() => void recarregar()} />}
      {!carregandoTurmas && !erroTurmas && turmas.length === 0 && (
        <EstadoVazioDaPagina icone={Shield} titulo="Crie uma turma primeiro" texto="As guildas são formadas pelos alunos dentro de uma turma. Crie a primeira em Turmas." />
      )}

      {!carregandoTurmas && !erroTurmas && turmaId && (
        <div className="space-y-6">
          {turmas.length > 1 && (
            <Select value={String(turmaId)} onValueChange={(v) => setTurmaId(Number(v))}>
              <SelectTrigger className="w-[240px] rounded-[14px]" aria-label="Turma"><SelectValue /></SelectTrigger>
              <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.descricao || `Turma ${t.id}`}</SelectItem>)}</SelectContent>
            </Select>
          )}

          {estado === "carregando" && <div role="status" aria-label="Carregando guildas" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {estado === "erro" && <ErroDaPagina titulo="Não foi possível carregar as guildas" detalhe={detalhe} onTentarNovamente={() => void carregar(turmaId)} />}

          {estado === "ok" && formacao && resumo && (
            <>
              <section className={card} aria-label="Formação de guildas">
                <div className="flex flex-wrap items-start gap-3 px-[22px] pb-4 pt-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-lg font-bold">Formação de guildas</h2>
                      <SeloDeStatus tom={resumo.tom}>{resumo.titulo}</SeloDeStatus>
                    </div>
                    <p className="mt-1.5 text-[13px] text-muted-foreground">{resumo.detalhe}</p>
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      {formacao.alunosNaTurma} {formacao.alunosNaTurma === 1 ? "aluno" : "alunos"} na turma · {formacao.alunosSemGuilda} sem guilda
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {situacao !== "encerrada" && (
                      <Button variant="outline" className="rounded-full" disabled={salvando} onClick={() => void aplicar(fecharAgora(formacao, new Date()), "Formação fechada.")}>
                        <Lock className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Fechar agora
                      </Button>
                    )}
                    {situacao !== "sempre_aberta" && (
                      <Button variant="outline" className="rounded-full" disabled={salvando} onClick={() => void aplicar(abrirSemPrazo(formacao), "Formação aberta, sem prazo.")}>
                        <LockOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Abrir sem prazo
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 border-t px-[22px] py-5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                  <div>
                    <Label htmlFor="guilda-tamanho" className={rotulo}>Tamanho máximo</Label>
                    <Input id="guilda-tamanho" type="number" min={minimo} max={TAMANHO_MAX} className={campo} value={form.tamanho} onChange={(e) => setForm({ ...form, tamanho: e.target.value })} aria-invalid={!!erros.tamanho} />
                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                      De {minimo} a {TAMANHO_MAX}. Vale para as guildas que já existem
                      {minimo > TAMANHO_MIN ? `; não pode ficar abaixo da maior guilda (${minimo}).` : "."}
                    </p>
                    {erros.tamanho && <p className="mt-1 text-xs text-destructive">{erros.tamanho}</p>}
                  </div>
                  <div>
                    <Label htmlFor="guilda-inicio" className={rotulo}>Abre em (Brasília)</Label>
                    <Input id="guilda-inicio" type="datetime-local" className={campo} value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} aria-invalid={!!erros.inicio} />
                    <p className="mt-1 text-[11.5px] text-muted-foreground">Vazio: já está aberta.</p>
                    {erros.inicio && <p className="mt-1 text-xs text-destructive">{erros.inicio}</p>}
                  </div>
                  <div>
                    <Label htmlFor="guilda-fim" className={rotulo}>Fecha em (Brasília)</Label>
                    <Input id="guilda-fim" type="datetime-local" className={campo} value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} aria-invalid={!!erros.fim} />
                    <p className="mt-1 text-[11.5px] text-muted-foreground">Vazio: sem prazo para fechar.</p>
                    {erros.fim && <p className="mt-1 text-xs text-destructive">{erros.fim}</p>}
                  </div>
                </div>
                <div className="flex justify-end border-t px-[22px] py-4">
                  <Button className="rounded-full font-bold" disabled={salvando} onClick={salvar}>
                    {salvando ? "Salvando…" : "Salvar formação"}
                  </Button>
                </div>
              </section>

              <section className={card} aria-label="Guildas da turma">
                <div className="px-[22px] pb-3 pt-5">
                  <h2 className="text-lg font-bold">Guildas da turma</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Os alunos criam as guildas no app. Aqui você acompanha quem está em cada uma e pode corrigir nome e descrição.</p>
                </div>
                {formacao.guildas.length === 0 ? (
                  <div className="px-[22px] pb-[22px]">
                    <EstadoVazioDaPagina icone={Users} titulo="Nenhuma guilda ainda" texto="Quando os alunos criarem a primeira guilda no app, ela aparece aqui." />
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2.5 px-[22px] pb-[22px]">
                    {formacao.guildas.map((g) => (
                      <li key={g.id} className="rounded-[14px] bg-muted px-4 py-3.5">
                        {editando?.id === g.id ? (
                          <div className="space-y-3" role="group" aria-label={`Editar ${g.nome}`}>
                            <div>
                              <Label htmlFor={`guilda-nome-${g.id}`} className={rotulo}>Nome</Label>
                              <Input id={`guilda-nome-${g.id}`} className={campo} maxLength={NOME_MAX} value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value, erros: {} })} aria-invalid={!!editando.erros.nome} />
                              {editando.erros.nome && <p className="mt-1 text-xs text-destructive">{editando.erros.nome}</p>}
                            </div>
                            <div>
                              <Label htmlFor={`guilda-descricao-${g.id}`} className={rotulo}>Descrição</Label>
                              <Input id={`guilda-descricao-${g.id}`} className={campo} maxLength={DESCRICAO_MAX} value={editando.descricao} onChange={(e) => setEditando({ ...editando, descricao: e.target.value, erros: {} })} aria-invalid={!!editando.erros.descricao} />
                              {editando.erros.descricao && <p className="mt-1 text-xs text-destructive">{editando.erros.descricao}</p>}
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditando(null)}>Cancelar</Button>
                              <Button size="sm" className="rounded-full font-bold" disabled={salvando} onClick={() => void salvarGuilda()}>{salvando ? "Salvando…" : "Salvar"}</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold">{g.nome}</p>
                                {g.descricao && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{g.descricao}</p>}
                              </div>
                              <SeloDeStatus tom={g.membros.length > g.limite ? "alerta" : g.membros.length === g.limite ? "neutro" : "ativo"}>
                                {g.membros.length}/{g.limite}
                              </SeloDeStatus>
                              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full bg-background text-muted-foreground hover:text-foreground" onClick={() => setEditando({ id: g.id, nome: g.nome, descricao: g.descricao ?? "", erros: {} })} aria-label={`Editar ${g.nome}`}>
                                <Pencil className="h-[13px] w-[13px]" />
                              </button>
                            </div>
                            {g.membros.length > 0 && (
                              <p className="mt-2 text-[11.5px] text-muted-foreground">
                                {g.membros.map((m) => m.nome).join(", ")}
                                {g.criadaEm && <span> · criada em {dataHora(g.criadaEm)}</span>}
                              </p>
                            )}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
