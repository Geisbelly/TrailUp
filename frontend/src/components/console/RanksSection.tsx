import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, ChevronRight, Clock, History, Pencil, Percent, Plus, Sparkles, Trash2, Trophy, Flag, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { selectView } from "@/lib/supabaseViews";
import { useAuth } from "@/hooks/useAuth";
import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { COR_DO_PERFIL, NOME_DO_PERFIL } from "./dashboard/perfilCores";
import { iniciais } from "./meusdados/conta";
import {
  POR_PAGINA,
  avisoDoPeriodo,
  criterioValido,
  dataDoFechamento,
  detalheDaExclusao,
  mensagemDaExclusao,
  estaAberto,
  mensagemDoNovoPeriodo,
  periodosDoMesmoRanking,
  proximoPeriodo,
  separarPorPeriodo,
  validarNovoPeriodo,
  formatarPontos,
  perfisDominantes,
  oQueOTipoMede,
  periodoSugerido,
  podio,
  rotuloDoCriterio,
  validarRanking,
  type CriterioChave,
  type ErrosDoRanking,
  type Posicao,
} from "./rankings/rankings";

interface RankTipo {
  id: number;
  nome: string;
  descricao: string | null;
  criterio: string | null;
}

interface Rank {
  id: number;
  tipo_id: number;
  classe_id: number | null;
  periodo: string | null;
  /** `20261021_16`: janela do período. `fim` nulo = período atual; preenchido = histórico. */
  inicio?: string | null;
  fim?: string | null;
}

interface Classe {
  id: number;
  descricao: string | null;
}

const ICONE_CRITERIO: Record<CriterioChave, LucideIcon> = {
  pontuacao: Sparkles,
  tempo: Clock,
  acertos: Check,
  percentual: Percent,
  ranqueada: Trophy,
  missoes: Flag,
};

const rotuloCampo = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const campo = "mt-2 rounded-[14px] bg-background";
const card = "overflow-hidden rounded-[20px] border bg-card";
const botaoRedondo = "flex h-7 w-7 flex-none items-center justify-center rounded-full bg-background text-muted-foreground hover:text-foreground";
const FORM_RANK_VAZIO = { tipo_id: "", classe_id: "", periodo: "" };

/** Pastilhas do pódio: prata e bronze do protótipo; o 1º usa a cor primária do console. */
const PODIO = {
  1: { avatar: "h-[68px] w-[68px] bg-primary text-primary-foreground text-[17px] shadow-[0_0_30px_hsl(var(--primary)/.5)]", base: "h-[120px] border-primary bg-primary/20 text-[40px] text-foreground", nome: "text-[15px] font-bold" },
  2: { avatar: "h-14 w-14 bg-[#8593a2] text-[#1b1120] text-sm", base: "h-[86px] bg-muted text-[28px] text-foreground/80", nome: "text-[13.5px] font-semibold" },
  3: { avatar: "h-14 w-14 bg-[#8a6a48] text-[#1b1120] text-sm", base: "h-16 border-[#4a3a26] bg-[#2e2419] text-2xl text-[#d3ad83]", nome: "text-[13.5px] font-semibold" },
} as const;

export default function RanksSection() {
  const { user } = useAuth();
  const professorId = user?.id;

  const [tipos, setTipos] = useState<RankTipo[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [posicoes, setPosicoes] = useState<Posicao[]>([]);
  const [perfis, setPerfis] = useState<Map<string, BrainHexProfileKey>>(new Map());
  const [classes, setClasses] = useState<Classe[]>([]);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [verTodas, setVerTodas] = useState(false);

  // Formulários inline (protótipo): `null` = fechado, objeto = aberto (editando se tiver id).
  const [rankForm, setRankForm] = useState<{ id?: number } | null>(null);
  const [rankFormData, setRankFormData] = useState(FORM_RANK_VAZIO);
  const [errosRank, setErrosRank] = useState<ErrosDoRanking>({});
  const [excluirRank, setExcluirRank] = useState<number | null>(null);
  // Confirmação do "Novo período": o nome sugerido já vem preenchido.
  const [novoPeriodo, setNovoPeriodo] = useState<{ rankId: number; nome: string; erro: string | null } | null>(null);

  const loadData = async (): Promise<Rank[] | undefined> => {
    if (!professorId) return;
    setIsLoading(true);
    try {
      const [{ data: tiposData, error: tiposError }, { data: classesData, error: classesError }] = await Promise.all([
        supabase.from("rank_tipo").select("id, nome, descricao, criterio").order("created_at", { ascending: false }),
        supabase.from("classe").select("id, descricao").eq("professor_id", professorId),
      ]);

      if (tiposError) throw tiposError;
      if (classesError) throw classesError;

      const classIds = (classesData ?? []).map((c) => c.id);
      const orClause = classIds.length > 0 ? `classe_id.in.(${classIds.join(",")}),classe_id.is.null` : "classe_id.is.null";

      const { data: ranksData, error: ranksError } = await supabase
        .from("ranks")
        // `*` e não a lista de colunas: antes da `20261021_16` `inicio`/`fim` não existem, e pedi-las
        // daria 42703 e a tela vazia. Sem elas, tudo conta como período aberto.
        .select("*")
        .or(orClause)
        .order("created_at", { ascending: false });

      if (ranksError) throw ranksError;

      setTipos((tiposData as RankTipo[]) ?? []);
      setClasses((classesData as Classe[]) ?? []);
      const lista = (ranksData as Rank[]) ?? [];
      setRanks(lista);
      // Mantém o ranking aberto depois de salvar/excluir outro; só cai no primeiro se o atual sumiu.
      setSelectedRank((atual) => lista.find((r) => r.id === atual?.id) ?? lista.find(estaAberto) ?? lista[0] ?? null);
      if (lista.length === 0) setPosicoes([]);
      return lista;
    } catch (error) {
      console.error("Erro ao carregar rankings:", error);
      toast.error("Nao foi possivel carregar rankings.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPosicoes = async (rank: Rank) => {
    try {
      // Período aberto: vw_rank_posicoes_por_classe calcula posicao/pontuacao/medalha em tempo
      // real (ranks + eventos_aluno + classe_aluno, dentro da janela do período).
      // Período fechado: o pódio congelado no fechamento (`rank_podio_congelado`), que não muda.
      const { data, error } = estaAberto(rank)
        ? await selectView("vw_rank_posicoes_por_classe", "rank_id, id_aluno, nome_aluno, posicao, pontuacao")
            .eq("rank_id", rank.id)
            .order("posicao", { ascending: true })
        : await supabase
            .from("rank_podio_congelado")
            .select("rank_id, id_aluno:aluno_id, nome_aluno, posicao, pontuacao")
            .eq("rank_id", rank.id)
            .order("posicao", { ascending: true });

      if (error) throw error;

      const linhas = (data ?? []) as unknown as { id_aluno: string; nome_aluno: string | null; posicao: number | null; pontuacao: number | null }[];
      const mapped: Posicao[] = linhas.map((p) => ({
        aluno_id: p.id_aluno,
        aluno_nome: p.nome_aluno ?? "",
        posicao: p.posicao,
        pontuacao: p.pontuacao,
      }));
      setPosicoes(mapped);
      setVerTodas(false);

      // Perfil dominante é enfeite da tabela: se falhar, a coluna só fica vazia.
      const ids = mapped.map((m) => m.aluno_id).filter(Boolean);
      if (ids.length === 0) {
        setPerfis(new Map());
        return;
      }
      const { data: perfilData } = await supabase
        .from("aluno_perfil")
        .select("aluno_id, afinidade, perfil:perfil_id ( nome )")
        .in("aluno_id", ids);
      setPerfis(
        perfisDominantes(
          (perfilData ?? []) as unknown as { aluno_id: string | null; afinidade: number | null; perfil: { nome: string } | null }[],
        ),
      );
    } catch (error) {
      console.error("Erro ao carregar posicoes:", error);
      toast.error("Nao foi possivel carregar as posicoes.");
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  useEffect(() => {
    if (selectedRank) loadPosicoes(selectedRank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRank?.id]);

  // Criar/editar/excluir TIPO de ranking saiu daqui. `rank_tipo` é catálogo global da
  // plataforma: não tem coluna de posse, e `criterio` é um conjunto fechado que o mobile
  // compara contra literais (`tempo`, `percentual`, …). A RLS reflete isso — a tabela só tem
  // policy de SELECT, então o INSERT levantava 42501 e o UPDATE/DELETE afetavam zero linhas
  // em silêncio, enquanto a tela dizia "Tipo de ranking excluido!" e tirava a linha do estado
  // local. Nunca funcionou em produção.
  //
  // O que o professor configura de verdade é o RANK por turma (`ranks`), que tem CRUD
  // completo escopado por `app_classes_do_professor()` e segue aqui embaixo.

  const abrirRank = (rank?: Rank) => {
    setRankFormData(
      rank
        ? { tipo_id: rank.tipo_id.toString(), classe_id: rank.classe_id?.toString() || "", periodo: rank.periodo || "" }
        : // Ranking novo nasce na primeira turma e no semestre corrente, no formato que a produção usa.
          { ...FORM_RANK_VAZIO, classe_id: classes.length === 1 ? classes[0].id.toString() : "", periodo: periodoSugerido() },
    );
    setErrosRank({});
    setRankForm({ id: rank?.id });
  };

  const handleSubmitRank = async () => {
    const validado = validarRanking(rankFormData, ranks, rankForm?.id);
    if ("erros" in validado) {
      setErrosRank(validado.erros);
      return;
    }
    setErrosRank({});
    setIsSaving(true);
    try {
      const { payload } = validado;
      const { error } = rankForm?.id
        ? await supabase.from("ranks").update(payload).eq("id", rankForm.id)
        : await supabase.from("ranks").insert(payload);
      if (error) throw error;
      toast.success(rankForm?.id ? "Ranking atualizado!" : "Ranking criado!");
      await loadData();
      setRankForm(null);
    } catch (error) {
      console.error("Erro ao salvar ranking:", error);
      toast.error("Não foi possível salvar o ranking.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRank = async (id: number) => {
    try {
      const { error } = await supabase.from("ranks").delete().eq("id", id);
      if (error) throw error;
      setRanks((prev) => prev.filter((r) => r.id !== id));
      if (selectedRank?.id === id) {
        setSelectedRank(null);
        setPosicoes([]);
      }
      setExcluirRank(null);
      toast.success("Ranking excluido!");
    } catch (error) {
      console.error("Erro ao excluir ranking:", error);
      // Período encerrado não chega aqui pela tela (o histórico não tem Excluir), mas o banco
      // recusa com 42501 se chegar: a mensagem diz por quê em vez do genérico.
      toast.error(mensagemDaExclusao(error as { code?: string } | null));
    }
  };

  const abrirNovoPeriodo = (rank: Rank) => {
    setExcluirRank(null);
    setNovoPeriodo({ rankId: rank.id, nome: proximoPeriodo(rank.periodo, periodosDoMesmoRanking(rank, ranks)), erro: null });
  };

  const handleNovoPeriodo = async (rank: Rank) => {
    if (!novoPeriodo || isSaving) return;
    const erro = validarNovoPeriodo(novoPeriodo.nome, periodosDoMesmoRanking(rank, ranks));
    if (erro) {
      setNovoPeriodo({ ...novoPeriodo, erro });
      return;
    }
    setIsSaving(true);
    try {
      // A função trava a linha: um segundo clique espera e recebe o mesmo período (`ja_feito`).
      const { data, error } = await supabase.rpc("fn_rank_novo_periodo", { p_rank_id: rank.id, p_periodo: novoPeriodo.nome.trim() });
      if (error) {
        setNovoPeriodo({ ...novoPeriodo, erro: mensagemDoNovoPeriodo(error) });
        return;
      }
      const novoId = Number((data as { rank_id?: number } | null)?.rank_id);
      toast.success(`Período “${novoPeriodo.nome.trim()}” aberto. O anterior está no histórico.`);
      setNovoPeriodo(null);
      const lista = await loadData();
      const novo = lista?.find((r) => r.id === novoId);
      if (novo) setSelectedRank(novo);
    } catch (error) {
      console.error("Erro ao abrir período:", error);
      toast.error(mensagemDoNovoPeriodo(null));
    } finally {
      setIsSaving(false);
    }
  };

  const tipoDe = (tipoId: number) => tipos.find((t) => t.id === tipoId);
  const nomeDoTipo = (tipoId: number) => tipoDe(tipoId)?.nome || "Desconhecido";
  const nomeDaClasse = (classeId: number | null) =>
    classeId ? classes.find((c) => c.id === classeId)?.descricao || "Classe não encontrada" : "Geral";
  const titulo = (rank: Rank) => `${nomeDoTipo(rank.tipo_id)} · ${nomeDaClasse(rank.classe_id)}`;

  const rankPosicoes = useMemo(() => (selectedRank ? posicoes : []), [posicoes, selectedRank]);
  const resto = rankPosicoes.slice(3);
  const restoVisivel = verTodas ? resto : resto.slice(0, POR_PAGINA);

  const confirmacao = (texto: string, detalhe: string, rotuloBotao: string, onCancelar: () => void, onConfirmar: () => void) => (
    <div role="alertdialog" aria-label={texto} className="rounded-[14px] border border-destructive/50 bg-destructive/15 px-[17px] py-[15px]">
      <p className="text-[13.5px] font-bold">{texto}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detalhe}</p>
      <div className="mt-3 flex justify-end gap-2.5">
        <Button variant="outline" size="sm" className="rounded-full border-destructive/50" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variant="destructive" size="sm" className="rounded-full font-bold" onClick={onConfirmar}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {rotuloBotao}
        </Button>
      </div>
    </div>
  );

  const cabecalho = (titulo: string, sub: string, acao?: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-3.5 px-[22px] pb-4 pt-5">
      <div>
        <h3 className="text-lg font-bold">{titulo}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className="ml-auto">{acao}</div>
    </div>
  );

  const painelForm = (titulo: string, fechar: () => void, corpo: React.ReactNode, salvar: () => void, rotuloSalvar: string) => (
    <div className="mx-[22px] mb-[18px] rounded-2xl border border-primary bg-muted px-5 py-[18px]">
      <div className="flex items-center gap-3">
        <h4 className="text-[14.5px] font-bold">{titulo}</h4>
        <button type="button" onClick={fechar} aria-label="Fechar formulário" className={`${botaoRedondo} ml-auto`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3.5 space-y-3">{corpo}</div>
      <div className="mt-[18px] flex justify-end gap-2.5">
        <Button variant="outline" className="rounded-full" onClick={fechar}>
          Cancelar
        </Button>
        <Button className="rounded-full font-bold" onClick={salvar} disabled={isSaving}>
          {isSaving ? "Salvando…" : rotuloSalvar}
        </Button>
      </div>
    </div>
  );

  const { abertos, historico } = separarPorPeriodo(ranks);
  const selecionado = selectedRank;
  const tipoDoForm = rankFormData.tipo_id ? tipoDe(Number(rankFormData.tipo_id)) : undefined;
  const criterioSelecionado = selecionado ? rotuloDoCriterio(tipoDe(selecionado.tipo_id)?.criterio) : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[32px] font-bold leading-tight">Rankings</h2>
        <p className="mt-2 text-[14.5px] text-muted-foreground">Configure os critérios de classificação e acompanhe as posições dos alunos.</p>
      </div>

      <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]">
        <div className="flex flex-col gap-5">
          <section className={card}>
            {cabecalho(
              "Tipos de ranking",
              "Catálogo da plataforma — o critério define como as posições são calculadas",
            )}

            <div className="flex flex-col gap-2.5 px-[22px] pb-[22px]">
              {isLoading && tipos.length === 0 ? (
                [0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-muted" />)
              ) : tipos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum tipo de ranking cadastrado na plataforma.</p>
              ) : (
                tipos.map((tipo) => {
                  const crit = criterioValido(tipo.criterio);
                  const Icone = ICONE_CRITERIO[crit];
                  const usando = abertos.filter((r) => r.tipo_id === tipo.id).length;
                  return (
                    <div key={tipo.id} className="flex items-center gap-3.5 rounded-[14px] bg-muted px-4 py-3.5">
                      <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/20 text-primary">
                        <Icone className="h-[15px] w-[15px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{tipo.nome}</p>
                        {tipo.descricao && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{tipo.descricao}</p>}
                      </div>
                      <span className="whitespace-nowrap rounded-full bg-primary/15 px-3 py-1 text-[10.5px] font-bold capitalize text-primary">{rotuloDoCriterio(tipo.criterio)}</span>
                      <span className="whitespace-nowrap text-[10.5px] font-semibold text-muted-foreground">
                        {usando === 0 ? "sem ranking" : `${usando} ${usando === 1 ? "ranking" : "rankings"}`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className={card}>
            {cabecalho(
              "Rankings ativos",
              "Clique para ver as posições",
              <Button variant="outline" className="rounded-full font-semibold" onClick={() => abrirRank()} disabled={tipos.length === 0}>
                <Plus className="mr-2 h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Novo ranking
              </Button>,
            )}

            {rankForm &&
              painelForm(
                rankForm.id ? "Editar ranking" : "Novo ranking",
                () => setRankForm(null),
                <>
                  <div>
                    <Label className={rotuloCampo}>Tipo *</Label>
                    <Select value={rankFormData.tipo_id} onValueChange={(v) => setRankFormData({ ...rankFormData, tipo_id: v })}>
                      <SelectTrigger className={campo} aria-label="Tipo de ranking">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {tipos.map((t) => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.nome} · {rotuloDoCriterio(t.criterio)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {tipoDoForm && <p className="mt-1 text-[11.5px] text-muted-foreground">{oQueOTipoMede(tipoDoForm)}</p>}
                    {errosRank.tipo_id && <p className="mt-1 text-xs text-destructive">{errosRank.tipo_id}</p>}
                  </div>
                  <div>
                    <Label className={rotuloCampo}>Turma *</Label>
                    {/* Sem "Geral": `ranks_posse_ins` exige turma do professor (42501 sem ela) e a
                        view junta os alunos pela turma do ranking. */}
                    <Select value={rankFormData.classe_id} onValueChange={(v) => setRankFormData({ ...rankFormData, classe_id: v })}>
                      <SelectTrigger className={campo} aria-label="Turma do ranking">
                        <SelectValue placeholder="Escolha a turma" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.descricao || `Turma ${c.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errosRank.classe_id && <p className="mt-1 text-xs text-destructive">{errosRank.classe_id}</p>}
                  </div>
                  <div>
                    <Label htmlFor="rank-periodo" className={rotuloCampo}>Período *</Label>
                    <Input id="rank-periodo" className={campo} value={rankFormData.periodo} onChange={(e) => setRankFormData({ ...rankFormData, periodo: e.target.value })} placeholder="Ex.: 2026.2" aria-invalid={!!errosRank.periodo} />
                    <p className="mt-1 text-[11.5px] text-muted-foreground">{avisoDoPeriodo(tipoDoForm?.criterio)}</p>
                    {errosRank.periodo && <p className="mt-1 text-xs text-destructive">{errosRank.periodo}</p>}
                  </div>
                </>,
                handleSubmitRank,
                rankForm.id ? "Salvar ranking" : "Criar ranking",
              )}

            <div className="flex flex-col gap-2.5 px-[22px] pb-[22px]">
              {isLoading && ranks.length === 0 ? (
                [0, 1].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-2xl bg-muted" />)
              ) : abertos.length === 0 ? (
                <div className="space-y-3 rounded-xl border-2 border-dashed border-border py-10 text-center">
                  <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold">Nenhum ranking criado ainda</p>
                    <p className="mt-1 text-xs text-muted-foreground">Crie um ranking para acompanhar as posições dos alunos.</p>
                  </div>
                </div>
              ) : (
                abertos.map((rank) => {
                  if (novoPeriodo?.rankId === rank.id) {
                    return (
                      <div key={rank.id} role="alertdialog" aria-label={`Novo período de ${titulo(rank)}`} className="rounded-[14px] border border-primary bg-primary/10 px-[17px] py-[15px]">
                        <p className="text-[13.5px] font-bold">Abrir um período novo em “{titulo(rank)}”?</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          O período “{rank.periodo || "sem nome"}” fecha agora e o pódio dele fica congelado no histórico, só para leitura.{" "}
                          {avisoDoPeriodo(tipoDe(rank.tipo_id)?.criterio)}
                        </p>
                        <Label htmlFor={`novo-periodo-${rank.id}`} className={`${rotuloCampo} mt-3 block`}>
                          Nome do período novo
                        </Label>
                        <Input
                          id={`novo-periodo-${rank.id}`}
                          className={campo}
                          value={novoPeriodo.nome}
                          onChange={(e) => setNovoPeriodo({ ...novoPeriodo, nome: e.target.value, erro: null })}
                          aria-invalid={!!novoPeriodo.erro}
                        />
                        {novoPeriodo.erro && <p className="mt-1 text-xs text-destructive">{novoPeriodo.erro}</p>}
                        <div className="mt-3 flex justify-end gap-2.5">
                          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setNovoPeriodo(null)}>
                            Cancelar
                          </Button>
                          <Button size="sm" className="rounded-full font-bold" onClick={() => handleNovoPeriodo(rank)} disabled={isSaving}>
                            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            {isSaving ? "Abrindo…" : "Abrir período"}
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  if (excluirRank === rank.id) {
                    return (
                      <div key={rank.id}>
                        {confirmacao(
                          `Excluir o ranking “${titulo(rank)}”?`,
                          detalheDaExclusao(rank, ranks),
                          "Excluir ranking",
                          () => setExcluirRank(null),
                          () => handleDeleteRank(rank.id),
                        )}
                      </div>
                    );
                  }
                  const ativo = selecionado?.id === rank.id;
                  return (
                    <div
                      key={rank.id}
                      className={`flex items-center gap-3 rounded-[14px] border px-4 py-3.5 ${ativo ? "border-primary bg-primary/10" : "border-transparent bg-muted hover:border-border"}`}
                    >
                      <button type="button" onClick={() => setSelectedRank(rank)} aria-pressed={ativo} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${ativo ? "text-primary" : ""}`}>{titulo(rank)}</p>
                          <p className="mt-1 text-[11.5px] text-muted-foreground">{rank.periodo || "Sem período"}</p>
                        </div>
                        <ChevronRight className={`h-[17px] w-[17px] flex-none ${ativo ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
                      </button>
                      <div className="flex gap-1.5">
                        <button type="button" className={botaoRedondo} onClick={() => abrirNovoPeriodo(rank)} aria-label={`Novo período de ${titulo(rank)}`} title="Novo período">
                          <CalendarPlus className="h-[13px] w-[13px]" />
                        </button>
                        <button type="button" className={botaoRedondo} onClick={() => abrirRank(rank)} aria-label={`Editar ${titulo(rank)}`}>
                          <Pencil className="h-[13px] w-[13px]" />
                        </button>
                        <button type="button" className={`${botaoRedondo} text-destructive hover:text-destructive`} onClick={() => setExcluirRank(rank.id)} aria-label={`Excluir ${titulo(rank)}`}>
                          <Trash2 className="h-[13px] w-[13px]" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {historico.length > 0 && (
            <section className={card} aria-label="Histórico de períodos">
              {cabecalho("Histórico", "Períodos encerrados: o pódio ficou congelado no fechamento")}
              <div className="flex flex-col gap-2.5 px-[22px] pb-[22px]">
                {historico.map((rank) => {
                  const ativo = selecionado?.id === rank.id;
                  return (
                    <button
                      key={rank.id}
                      type="button"
                      onClick={() => setSelectedRank(rank)}
                      aria-pressed={ativo}
                      className={`flex items-center gap-3 rounded-[14px] border px-4 py-3 text-left ${ativo ? "border-primary bg-primary/10" : "border-transparent bg-muted hover:border-border"}`}
                    >
                      <History className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13.5px] font-semibold ${ativo ? "text-primary" : ""}`}>{titulo(rank)}</p>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {rank.periodo || "Sem período"} · encerrado em {dataDoFechamento(rank.fim)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <section className="overflow-hidden rounded-[20px] border border-primary bg-card" aria-live="polite">
          {selecionado ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b bg-muted px-6 py-5">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-primary">Posições · critério {criterioSelecionado}</p>
                  <h3 className="mt-1.5 text-[22px] font-bold">{titulo(selecionado)}</h3>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {!estaAberto(selecionado) && (
                    <span className="whitespace-nowrap rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary">
                      Histórico · encerrado em {dataDoFechamento(selecionado.fim)}
                    </span>
                  )}
                  {selecionado.periodo && (
                    <span className="whitespace-nowrap rounded-full border bg-background px-3.5 py-1.5 text-[11.5px] text-muted-foreground">{selecionado.periodo}</span>
                  )}
                </div>
              </div>

              {rankPosicoes.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                  {estaAberto(selecionado) ? "Nenhuma posição registrada neste ranking ainda." : "Este período fechou sem nenhum aluno classificado."}
                </p>
              ) : (
                <>
                  <ol className="grid items-end gap-3 px-6 pb-6 pt-8 [grid-template-columns:1fr_1.15fr_1fr]">
                    {podio(rankPosicoes).map(({ lugar, aluno }) => {
                      if (!aluno) return <li key={lugar} aria-hidden="true" />;
                      const estilo = PODIO[lugar];
                      return (
                        <li key={lugar} className="flex flex-col items-center gap-2">
                          <span aria-hidden="true" className={`flex items-center justify-center rounded-full font-extrabold ${estilo.avatar}`}>
                            {iniciais(aluno.aluno_nome)}
                          </span>
                          <span className={`text-center ${estilo.nome}`}>{aluno.aluno_nome || "Sem nome"}</span>
                          <span className="text-xs text-muted-foreground">{formatarPontos(aluno.pontuacao)} pts</span>
                          <span className={`flex w-full items-center justify-center rounded-t-[14px] border font-display font-bold ${estilo.base}`}>
                            <span className="sr-only">Posição </span>
                            {lugar}
                          </span>
                        </li>
                      );
                    })}
                  </ol>

                  {resto.length > 0 && (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-muted text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                          <th className="w-14 px-6 py-[11px] font-semibold">#</th>
                          <th className="py-[11px] font-semibold">Aluno</th>
                          <th className="py-[11px] font-semibold">Perfil</th>
                          <th className="px-6 py-[11px] text-right font-semibold">Pontos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {restoVisivel.map((pos, i) => {
                          const perfil = perfis.get(pos.aluno_id);
                          return (
                            <tr key={pos.aluno_id} className="border-t">
                              <td className="px-6 py-[13px] text-sm font-bold text-muted-foreground">{pos.posicao ?? i + 4}</td>
                              <td className="py-[13px] pr-2 text-[13.5px] font-semibold">{pos.aluno_nome || "Sem nome"}</td>
                              <td className="py-[13px] pr-2">
                                {perfil && (
                                  <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                                    <span aria-hidden="true" className="h-[11px] w-[11px] rounded-full" style={{ background: COR_DO_PERFIL[perfil].marca }} />
                                    {NOME_DO_PERFIL[perfil]}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-[13px] text-right text-[13.5px] font-bold">{formatarPontos(pos.pontuacao)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  <div className="flex items-center gap-3 border-t px-6 py-[15px] text-[11.5px] text-muted-foreground">
                    <span>
                      {Math.min(3 + restoVisivel.length, rankPosicoes.length)} de {rankPosicoes.length} alunos
                    </span>
                    {resto.length > POR_PAGINA && (
                      <Button variant="outline" size="sm" className="ml-auto rounded-full" onClick={() => setVerTodas((v) => !v)}>
                        {verTodas ? "Ver menos" : "Ver todas as posições"}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="px-6 py-16 text-center">
              <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">Selecione um ranking para ver as posições.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
