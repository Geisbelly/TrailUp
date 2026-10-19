import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CabecalhoDePagina, ErroDaPagina, EstadoVazioDaPagina } from "../comum/PaginaDoConsole";
import { useTurmasDoProfessor } from "../comum/useTurmasDoProfessor";
import {
  arquivarMeta,
  carregarAlunos,
  carregarConfig,
  carregarExtrato,
  carregarItens,
  carregarLimites,
  carregarMetas,
  carregarUsos,
  carregarValores,
  salvarConfig,
  salvarDotacao,
  salvarEscopo,
  salvarLimiteUso,
  salvarMeta,
  salvarPreco,
  salvarValor,
  type AlunoDaTurma,
  type ConfigDaTurma,
  type EscopoDeLimite,
  type ItemDaLoja,
  type LimiteDeUso,
  type LinhaExtrato,
  type Meta,
  type PrecoDaTurma,
  type Uso,
  type ValorDeEvento,
} from "./economiaApi";
import {
  SITUACOES_DE_USO,
  descreverPadrao,
  faixaValida,
  filtrarExtrato,
  limiteDoTexto,
  numeroOuNulo,
  textoDoLimite,
  type CampoDeLimite,
  type LimitesDeUso,
} from "./economiaRegras";

type Aba = "valores" | "prazos" | "loja" | "metas" | "historico";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "valores", rotulo: "Valores" },
  { id: "prazos", rotulo: "Prazos e tempo" },
  { id: "loja", rotulo: "Loja" },
  { id: "metas", rotulo: "Metas" },
  { id: "historico", rotulo: "Histórico" },
];

const FILTROS = [
  { id: "todos", rotulo: "Tudo" },
  { id: "evento", rotulo: "Ganhos" },
  { id: "compra", rotulo: "Compras" },
  { id: "estorno", rotulo: "Estornos" },
] as const;

function inteiro(texto: string, padrao: number): number {
  const n = Number(texto);
  return Number.isInteger(n) ? n : padrao;
}

export default function EconomiaSection({ professorId }: { professorId?: string }) {
  const { turmas, turmaId, setTurmaId, carregando, erro, recarregar } = useTurmasDoProfessor(professorId);
  const [aba, setAba] = useState<Aba>("valores");

  return (
    <div>
      <CabecalhoDePagina
        titulo="Economia"
        subtitulo="Moedas, pontos, preços da loja e até onde um item pode estender prazo ou tempo. O saldo do aluno continua sendo a soma do razão."
      />
      {carregando && (
        <div role="status" aria-label="Carregando" className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      {erro && <ErroDaPagina titulo="Não foi possível carregar as turmas" detalhe={erro} onTentarNovamente={() => void recarregar()} />}
      {!carregando && !erro && turmas.length === 0 && (
        <EstadoVazioDaPagina icone={Coins} titulo="Crie uma turma primeiro" texto="A economia é configurada por turma. Crie a primeira em Turmas." />
      )}
      {!carregando && !erro && turmaId && (
        <div className="space-y-4">
          {turmas.length > 1 && (
            <Select value={String(turmaId)} onValueChange={(v) => setTurmaId(Number(v))}>
              <SelectTrigger className="w-[240px] rounded-[14px]" aria-label="Turma">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {turmas.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.descricao || `Turma ${t.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div role="tablist" aria-label="Partes da economia" className="flex flex-wrap gap-2">
            {ABAS.map((item) => (
              <Button key={item.id} type="button" role="tab" aria-selected={aba === item.id} variant={aba === item.id ? "default" : "outline"} className="rounded-full" onClick={() => setAba(item.id)}>
                {item.rotulo}
              </Button>
            ))}
          </div>
          {aba === "valores" && <AbaValores classeId={turmaId} />}
          {aba === "prazos" && <AbaPrazos classeId={turmaId} />}
          {aba === "loja" && <AbaLoja classeId={turmaId} />}
          {aba === "metas" && <AbaMetas classeId={turmaId} />}
          {aba === "historico" && <AbaHistorico classeId={turmaId} />}
        </div>
      )}
    </div>
  );
}

function Caixa({ children }: { children: ReactNode }) {
  return <div className="rounded-[20px] border bg-card p-4">{children}</div>;
}

function AbaValores({ classeId }: { classeId: number }) {
  const [linhas, setLinhas] = useState<ValorDeEvento[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [detalhe, setDetalhe] = useState("");
  const carregar = useCallback(async () => {
    setEstado("carregando");
    try {
      setLinhas(await carregarValores(classeId));
      setEstado("ok");
    } catch (e) {
      setDetalhe((e as Error).message);
      setEstado("erro");
    }
  }, [classeId]);
  useEffect(() => { void carregar(); }, [carregar]);
  if (estado === "erro") return <ErroDaPagina titulo="Não foi possível carregar os valores" detalhe={detalhe} onTentarNovamente={() => void carregar()} />;
  if (estado === "carregando") return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-primary" />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Vazio herda o valor global. Pontos e moedas são independentes: gastar moeda não mexe no rank.</p>
      {linhas.map((linha) => (
        <ValorLinha key={linha.tipo} classeId={classeId} linha={linha} onSalvou={() => void carregar()} />
      ))}
    </div>
  );
}

function ValorLinha({ classeId, linha, onSalvou }: { classeId: number; linha: ValorDeEvento; onSalvou: () => void }) {
  const [pontos, setPontos] = useState(linha.pontosTurma === null ? "" : String(linha.pontosTurma));
  const [moedas, setMoedas] = useState(linha.moedasTurma === null ? "" : String(linha.moedasTurma));
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    const p = numeroOuNulo(pontos);
    const m = numeroOuNulo(moedas);
    if (Number.isNaN(p) || Number.isNaN(m) || (p !== null && p < 0) || (m !== null && m < 0)) {
      toast.error("Pontos e moedas não podem ser negativos.");
      return;
    }
    setSalvando(true);
    try {
      await salvarValor(classeId, linha.tipo, p, m);
      toast.success("Valor da turma salvo.");
      onSalvou();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Caixa>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <p className="font-semibold">{linha.descricao || linha.tipo}</p>
          <p className="text-xs text-muted-foreground">Global: {linha.pontos} pontos · {linha.moedas} moedas</p>
        </div>
        <label className="text-sm">Pontos da turma
          <Input aria-label={`Pontos de ${linha.tipo}`} value={pontos} onChange={(e) => setPontos(e.target.value)} placeholder={String(linha.pontos)} className="mt-1 w-28" />
        </label>
        <label className="text-sm">Moedas da turma
          <Input aria-label={`Moedas de ${linha.tipo}`} value={moedas} onChange={(e) => setMoedas(e.target.value)} placeholder={String(linha.moedas)} className="mt-1 w-28" />
        </label>
        <Button type="button" className="rounded-full" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar"}</Button>
      </div>
    </Caixa>
  );
}

function AbaPrazos({ classeId }: { classeId: number }) {
  const [config, setConfig] = useState<ConfigDaTurma | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [topicoId, setTopicoId] = useState("");
  const [moedasConclusao, setMoedasConclusao] = useState("");
  const [moedasAprovacao, setMoedasAprovacao] = useState("");
  const carregar = useCallback(async () => {
    try {
      setConfig(await carregarConfig(classeId));
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [classeId]);
  useEffect(() => { void carregar(); }, [carregar]);
  if (erro) return <ErroDaPagina titulo="Não foi possível carregar os prazos" detalhe={erro} onTentarNovamente={() => void carregar()} />;
  if (!config) return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-primary" />;
  const campo = (chave: keyof ConfigDaTurma, rotulo: string) => (
    <label key={chave} className="text-sm">
      {rotulo}
      <Input aria-label={rotulo} value={String(config[chave] ?? "")} onChange={(e) => setConfig({ ...config, [chave]: inteiro(e.target.value, Number(config[chave])) })} className="mt-1 w-28" />
    </label>
  );
  const salvar = async () => {
    const prazoOk = faixaValida({ min: config.prazo_extensao_min_dias, max: config.prazo_extensao_max_dias, teto: config.prazo_max_por_ativ, tetoGeral: config.prazo_max_dias_total });
    const tempoOk = faixaValida({ min: config.tempo_extra_min_minutos, max: config.tempo_extra_max_minutos, teto: config.tempo_max_por_ativ });
    if (!prazoOk || !tempoOk) {
      toast.error("O mínimo não pode passar do máximo, nem o máximo do teto.");
      return;
    }
    setSalvando(true);
    try {
      await salvarConfig(classeId, config);
      toast.success("Prazos e tempo salvos.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };
  const salvarTopico = async () => {
    const id = Number(topicoId);
    if (!id) {
      toast.error("Informe o id do tópico desta turma.");
      return;
    }
    const conclusao = numeroOuNulo(moedasConclusao);
    const aprovacao = numeroOuNulo(moedasAprovacao);
    if (Number.isNaN(conclusao) || Number.isNaN(aprovacao)) {
      toast.error("Moedas inválidas.");
      return;
    }
    try {
      await salvarEscopo(classeId, "topico", id, conclusao, aprovacao, null, null);
      toast.success("Regra do tópico salva. Vazio herda a turma.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <Caixa>
        <h3 className="mb-3 text-lg font-semibold">Turma</h3>
        <div className="flex flex-wrap gap-4">
          {campo("prazo_extensao_min_dias", "Mínimo de dias por uso")}
          {campo("prazo_extensao_max_dias", "Máximo de dias por uso")}
          {campo("prazo_max_por_ativ", "Teto na atividade")}
          {campo("prazo_max_dias_total", "Teto na turma")}
          {campo("tempo_extra_min_minutos", "Mínimo de minutos por uso")}
          {campo("tempo_extra_max_minutos", "Máximo de minutos por uso")}
          {campo("tempo_max_por_ativ", "Teto de minutos na atividade")}
          {campo("retry_max_por_topico", "Novas tentativas por tópico")}
        </div>
        <Button type="button" className="mt-4 rounded-full" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar prazos"}</Button>
      </Caixa>
      <Caixa>
        <h3 className="mb-1 text-lg font-semibold">Por tópico</h3>
        <p className="mb-3 text-sm text-muted-foreground">Moedas a mais na conclusão ou na aprovação deste tópico. As duas só saem quando você aprova a entrega (nota de 60% ou mais): o aluno marcar como concluída não paga moeda. Vazio herda e não cria um segundo crédito.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Id do tópico
            <Input aria-label="Id do tópico" value={topicoId} onChange={(e) => setTopicoId(e.target.value)} className="mt-1 w-32" />
          </label>
          <label className="text-sm">Moedas na conclusão
            <Input aria-label="Moedas na conclusão" value={moedasConclusao} onChange={(e) => setMoedasConclusao(e.target.value)} className="mt-1 w-32" />
          </label>
          <label className="text-sm">Moedas na aprovação
            <Input aria-label="Moedas na aprovação" value={moedasAprovacao} onChange={(e) => setMoedasAprovacao(e.target.value)} className="mt-1 w-32" />
          </label>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => void salvarTopico()}>Salvar tópico</Button>
        </div>
      </Caixa>
    </div>
  );
}

function AbaLoja({ classeId }: { classeId: number }) {
  const [itens, setItens] = useState<ItemDaLoja[]>([]);
  const [precos, setPrecos] = useState<PrecoDaTurma[]>([]);
  const [dotacao, setDotacao] = useState<{ item_codigo: string; quantidade: number }[]>([]);
  const [limites, setLimites] = useState<LimiteDeUso[]>([]);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      const [dados, regras] = await Promise.all([carregarItens(classeId), carregarLimites(classeId)]);
      setItens(dados.itens);
      setPrecos(dados.precos);
      setDotacao(dados.dotacao);
      setLimites(regras);
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [classeId]);
  useEffect(() => { void carregar(); }, [carregar]);
  if (erro) return <ErroDaPagina titulo="Não foi possível carregar a loja" detalhe={erro} onTentarNovamente={() => void carregar()} />;
  if (!itens.length && !erro) return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-primary" />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Preço vazio herda o global. Estoque vazio é ilimitado. A dotação é o que todo aluno recebe antes de gastar moeda. O aluno pode ter várias unidades do mesmo item; cada uso gasta uma.</p>
      {itens.map((item) => (
        <ItemLoja key={item.codigo} classeId={classeId} item={item} preco={precos.find((p) => p.item_codigo === item.codigo)} quantidade={dotacao.find((d) => d.item_codigo === item.codigo)?.quantidade ?? 0} limites={limites.filter((l) => l.item_codigo === item.codigo)} onSalvou={() => void carregar()} />
      ))}
    </div>
  );
}

function ItemLoja({ classeId, item, preco, quantidade, limites, onSalvou }: { classeId: number; item: ItemDaLoja; preco?: PrecoDaTurma; quantidade: number; limites: LimiteDeUso[]; onSalvou: () => void }) {
  const [precoTexto, setPrecoTexto] = useState(preco?.preco_base == null ? "" : String(preco.preco_base));
  const [estoque, setEstoque] = useState(preco?.estoque == null ? "" : String(preco.estoque));
  const [limite, setLimite] = useState(preco?.uso_max_por_aluno == null ? "" : String(preco.uso_max_por_aluno));
  const [dotacaoTexto, setDotacaoTexto] = useState(String(quantidade));
  const [ativo, setAtivo] = useState(preco?.ativo !== false);
  const [fator, setFator] = useState(preco?.preco_fator == null ? "" : String(preco.preco_fator));
  const salvar = async () => {
    const p = numeroOuNulo(precoTexto);
    const e = numeroOuNulo(estoque);
    const u = numeroOuNulo(limite);
    const d = numeroOuNulo(dotacaoTexto);
    const f = numeroOuNulo(fator);
    if ([p, e, u, d, f].some((n) => Number.isNaN(n)) || (d !== null && d < 0)) {
      toast.error("Use números vazios para herdar, ou zero só onde estoque e limite aceitam.");
      return;
    }
    if (f !== null && (f < 1 || f > 5)) {
      toast.error("O aumento por compra vai de 1 (preço fixo) a 5.");
      return;
    }
    try {
      await salvarPreco(classeId, item.codigo, p, e, u, ativo, f);
      if (d !== null) await salvarDotacao(classeId, item.codigo, d);
      toast.success(`${item.nome} atualizado.`);
      onSalvou();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <Caixa>
      <p className="font-semibold">{item.nome}</p>
      <p className="mb-3 text-xs text-muted-foreground">Preço global {item.preco_base} · efeito {item.efeito}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Preço
          <Input aria-label={`Preço de ${item.nome}`} value={precoTexto} onChange={(ev) => setPrecoTexto(ev.target.value)} placeholder={String(item.preco_base)} className="mt-1 w-24" />
        </label>
        <label className="text-sm">Estoque
          <Input aria-label={`Estoque de ${item.nome}`} value={estoque} onChange={(ev) => setEstoque(ev.target.value)} placeholder="ilimitado" className="mt-1 w-28" />
        </label>
        <label className="text-sm">Compras por aluno
          <Input aria-label={`Limite de ${item.nome}`} value={limite} onChange={(ev) => setLimite(ev.target.value)} placeholder="sem limite" className="mt-1 w-28" />
        </label>
        <label className="text-sm" title="Cada unidade comprada multiplica o preço da próxima. 1 deixa o preço fixo.">Aumento por compra
          <Input aria-label={`Aumento por compra de ${item.nome}`} value={fator} onChange={(ev) => setFator(ev.target.value)} placeholder={`×${item.preco_fator ?? 1}`} className="mt-1 w-24" />
        </label>
        <label className="text-sm">Dotação
          <Input aria-label={`Dotação de ${item.nome}`} value={dotacaoTexto} onChange={(ev) => setDotacaoTexto(ev.target.value)} className="mt-1 w-24" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(ev) => setAtivo(ev.target.checked)} /> À venda
        </label>
        <Button type="button" className="rounded-full" onClick={() => void salvar()}>Salvar</Button>
      </div>
      <LimitesDoItem classeId={classeId} item={item} limites={limites} onSalvou={onSalvou} />
    </Caixa>
  );
}

const VAZIO: LimitesDeUso = { por_atividade: null, por_questao: null, por_topico: null, por_dia: null, por_semana: null, por_turma: null };

const NOME_DO_ESCOPO: Record<EscopoDeLimite, string> = { classe: "Turma", topico: "Tópico", atividade: "Atividade" };

function LimitesDoItem({ classeId, item, limites, onSalvou }: { classeId: number; item: ItemDaLoja; limites: LimiteDeUso[]; onSalvou: () => void }) {
  const [escopo, setEscopo] = useState<EscopoDeLimite>("classe");
  const [alvo, setAlvo] = useState("");
  const atual = limites.find((l) => l.escopo === escopo && (escopo === "classe" || String(l.alvo_id) === alvo.trim()));
  const [textos, setTextos] = useState<Record<CampoDeLimite, string>>(() => paraTextos(atual));
  useEffect(() => { setTextos(paraTextos(atual)); }, [atual]);
  const salvar = async () => {
    const alvoId = escopo === "classe" ? null : Number(alvo);
    if (escopo !== "classe" && (!Number.isInteger(alvoId) || (alvoId ?? 0) <= 0)) {
      toast.error(`Informe o id ${escopo === "topico" ? "do tópico" : "da atividade"} desta turma.`);
      return;
    }
    const valores = { ...VAZIO };
    for (const s of SITUACOES_DE_USO) {
      const v = limiteDoTexto(textos[s.campo]);
      if (Number.isNaN(v)) {
        toast.error("Limite é um número de 0 a 100, \"sem limite\", ou vazio para herdar.");
        return;
      }
      valores[s.campo] = v;
    }
    try {
      await salvarLimiteUso(classeId, escopo, alvoId, item.codigo, valores);
      toast.success(`Limites de uso de ${item.nome} salvos.`);
      onSalvou();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <details className="mt-3 rounded-[14px] border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Limites de uso</summary>
      <p className="my-2 text-xs text-muted-foreground">
        Quantas unidades o aluno pode gastar em cada situação. A atividade sobrepõe o tópico, que sobrepõe a turma. Vazio herda; 0 bloqueia; “sem limite” libera.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Onde
          <select aria-label={`Escopo do limite de ${item.nome}`} value={escopo} onChange={(e) => setEscopo(e.target.value as EscopoDeLimite)} className="mt-1 block h-10 rounded-md border bg-background px-2">
            <option value="classe">Turma inteira</option>
            <option value="topico">Um tópico</option>
            <option value="atividade">Uma atividade</option>
          </select>
        </label>
        {escopo !== "classe" ? (
          <label className="text-sm">Id {escopo === "topico" ? "do tópico" : "da atividade"}
            <Input aria-label={`Alvo do limite de ${item.nome}`} value={alvo} onChange={(e) => setAlvo(e.target.value)} className="mt-1 w-28" />
          </label>
        ) : null}
        {SITUACOES_DE_USO.map((s) => (
          <label key={s.campo} className="text-sm">{s.rotulo}
            <Input
              aria-label={`${s.rotulo} de ${item.nome}`}
              value={textos[s.campo]}
              onChange={(e) => setTextos({ ...textos, [s.campo]: e.target.value })}
              placeholder={escopo === "classe" ? descreverPadrao(item.codigo, s.campo) : "herda"}
              className="mt-1 w-24"
            />
          </label>
        ))}
        <Button type="button" variant="outline" className="rounded-full" onClick={() => void salvar()}>Salvar limites</Button>
      </div>
      {limites.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {limites.map((l) => (
            <li key={`${l.escopo}-${l.alvo_id}`}>
              {NOME_DO_ESCOPO[l.escopo]}{l.escopo === "classe" ? "" : ` ${l.alvo_id}`}:{" "}
              {SITUACOES_DE_USO.filter((s) => l[s.campo] !== null).map((s) => `${s.rotulo.toLowerCase()} ${textoDoLimite(l[s.campo])}`).join(" · ")}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

function paraTextos(l?: LimiteDeUso): Record<CampoDeLimite, string> {
  return Object.fromEntries(SITUACOES_DE_USO.map((s) => [s.campo, textoDoLimite(l?.[s.campo])])) as Record<CampoDeLimite, string>;
}

function AbaMetas({ classeId }: { classeId: number }) {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [titulo, setTitulo] = useState("");
  const [criterio, setCriterio] = useState("atividades_concluidas");
  const [limiar, setLimiar] = useState("3");
  const [moedas, setMoedas] = useState("5");
  const [pontos, setPontos] = useState("0");
  const [atividadeId, setAtividadeId] = useState("");
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      setMetas(await carregarMetas(classeId));
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [classeId]);
  useEffect(() => { void carregar(); }, [carregar]);
  const criar = async () => {
    const l = numeroOuNulo(limiar);
    const m = numeroOuNulo(moedas);
    const p = numeroOuNulo(pontos);
    if (!titulo.trim() || l === null || l <= 0 || m === null || p === null) {
      toast.error("Título, limiar e recompensa são obrigatórios.");
      return;
    }
    const alvo = criterio === "nota_minima" ? Number(atividadeId) : null;
    if (criterio === "nota_minima" && (!Number.isInteger(alvo) || (alvo ?? 0) <= 0)) {
      toast.error("Nota mínima precisa do id da atividade.");
      return;
    }
    try {
      await salvarMeta(classeId, {
        titulo,
        criterio,
        limiar: l,
        moedas: m,
        pontos: p,
        escopo: criterio === "nota_minima" ? "atividade" : "classe",
        alvo_id: alvo,
      });
      setTitulo("");
      toast.success("Meta criada. O crédito entra uma vez, quando o aluno alcança o limiar.");
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (erro) return <ErroDaPagina titulo="Não foi possível carregar as metas" detalhe={erro} onTentarNovamente={() => void carregar()} />;
  return (
    <div className="space-y-3">
      <Caixa>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Título
            <Input aria-label="Título da meta" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="mt-1 w-56" />
          </label>
          <label className="text-sm">Critério
            <select aria-label="Critério da meta" value={criterio} onChange={(e) => setCriterio(e.target.value)} className="mt-1 block h-10 rounded-md border bg-background px-2">
              <option value="atividades_concluidas">Atividades concluídas</option>
              <option value="acertos">Acertos</option>
              <option value="presencas">Presenças</option>
              <option value="nota_minima">Nota mínima (%)</option>
            </select>
          </label>
          {criterio === "nota_minima" ? (
            <label className="text-sm">Atividade
              <Input aria-label="Id da atividade da meta" value={atividadeId} onChange={(e) => setAtividadeId(e.target.value)} className="mt-1 w-28" />
            </label>
          ) : null}
          <label className="text-sm">Limiar
            <Input aria-label="Limiar da meta" value={limiar} onChange={(e) => setLimiar(e.target.value)} className="mt-1 w-24" />
          </label>
          <label className="text-sm">Moedas
            <Input aria-label="Moedas da meta" value={moedas} onChange={(e) => setMoedas(e.target.value)} className="mt-1 w-24" />
          </label>
          <label className="text-sm">Pontos
            <Input aria-label="Pontos da meta" value={pontos} onChange={(e) => setPontos(e.target.value)} className="mt-1 w-24" />
          </label>
          <Button type="button" className="rounded-full" onClick={() => void criar()}>Criar meta</Button>
        </div>
      </Caixa>
      {metas.filter((m) => m.ativa).map((m) => (
        <Caixa key={m.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{m.titulo}</p>
              <p className="text-sm text-muted-foreground">{m.criterio} ≥ {m.limiar} · {m.moedas} moedas · {m.pontos} pontos</p>
            </div>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => void arquivarMeta(m.id).then(() => carregar()).catch((e) => toast.error((e as Error).message))}>Desativar</Button>
          </div>
        </Caixa>
      ))}
    </div>
  );
}

function AbaHistorico({ classeId }: { classeId: number }) {
  const [alunos, setAlunos] = useState<AlunoDaTurma[]>([]);
  const [alunoId, setAlunoId] = useState("");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todos");
  const [linhas, setLinhas] = useState<LinhaExtrato[]>([]);
  const [usos, setUsos] = useState<Uso[]>([]);
  const [erro, setErro] = useState("");
  useEffect(() => {
    void carregarAlunos(classeId).then((lista) => {
      setAlunos(lista);
      setAlunoId(lista[0]?.id ?? "");
    }).catch((e) => setErro((e as Error).message));
    void carregarUsos(classeId).then(setUsos).catch((e) => setErro((e as Error).message));
  }, [classeId]);
  useEffect(() => {
    if (!alunoId) return;
    void carregarExtrato(alunoId, filtro === "todos" ? null : filtro).then(setLinhas).catch((e) => setErro((e as Error).message));
  }, [alunoId, filtro]);
  const visiveis = filtrarExtrato(linhas, filtro === "todos" ? "todos" : filtro);
  const nome = (id: string) => alunos.find((a) => a.id === id)?.nome ?? id;
  if (erro) return <ErroDaPagina titulo="Não foi possível carregar o histórico" detalhe={erro} onTentarNovamente={() => setErro("")} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={alunoId} onValueChange={setAlunoId}>
          <SelectTrigger className="w-[240px] rounded-[14px]" aria-label="Aluno"><SelectValue placeholder="Aluno" /></SelectTrigger>
          <SelectContent>{alunos.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
        </Select>
        {FILTROS.map((f) => (
          <Button key={f.id} type="button" variant={filtro === f.id ? "default" : "outline"} className="rounded-full" onClick={() => setFiltro(f.id)}>{f.rotulo}</Button>
        ))}
      </div>
      <Caixa>
        <h3 className="mb-2 font-semibold">Razão</h3>
        {visiveis.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma movimentação com esse filtro.</p> : (
          <ul className="space-y-2">
            {visiveis.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 text-sm">
                <span>{l.motivo}{l.evento_tipo ? ` · ${l.evento_tipo}` : ""}{l.referencia ? ` · ${l.referencia}` : ""}</span>
                <span className="font-semibold">{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
              </li>
            ))}
          </ul>
        )}
      </Caixa>
      <Caixa>
        <h3 className="mb-2 font-semibold">Usos na trilha</h3>
        {usos.length === 0 ? <p className="text-sm text-muted-foreground">Ninguém usou um item nesta turma ainda.</p> : (
          <ul className="space-y-2 text-sm">
            {usos.map((u) => (
              <li key={u.id}>{nome(u.aluno_id)} usou {u.item_codigo}{u.alvo_id ? ` na atividade ${u.alvo_id}` : ""}</li>
            ))}
          </ul>
        )}
      </Caixa>
    </div>
  );
}

