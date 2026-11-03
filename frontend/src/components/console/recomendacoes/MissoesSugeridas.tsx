import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { validarMotivoDeRecusa } from "../missoes/aprovacao";
import { rotuloDoCriterio } from "../missoes/criterio";
import {
  contarPendentesDaTurma,
  JANELA_DE_APROVACAO_DIAS,
  opcoesDeQuantidade,
  pedidoMaisRecente,
  podePedir,
  situacaoDoPedido,
  taxaDeAprovacao,
  textoDaTaxa,
  type MissaoSugerida,
} from "./missoesIa";
import { listarTopicosDaTurma } from "./missoesIaApi";
import { useMissoesSugeridas } from "./useMissoesSugeridas";

type Turma = { id: number; descricao: string | null };

const botao = "rounded-full px-[15px] py-2 text-xs font-semibold transition-colors disabled:opacity-60";
const campo = "max-w-full rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-foreground";
const formatarData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function CartaoDaSugestao({ missao, alvo, onDecidir }: { missao: MissaoSugerida; alvo: string | null; onDecidir: (aprovar: boolean, motivo?: string) => Promise<void> }) {
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const decidir = async (aprovar: boolean) => {
    let texto: string | undefined;
    if (!aprovar) {
      const v = validarMotivoDeRecusa(motivo);
      if ("erro" in v) {
        setErro(v.erro);
        return;
      }
      texto = v.motivo;
    }
    setSalvando(true);
    setErro(null);
    try {
      await onDecidir(aprovar, texto);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  };

  return (
    <li className="rounded-[18px] border border-[hsl(var(--console-violet))] bg-card px-[22px] py-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="rounded-full bg-[hsl(var(--console-violet)/.16)] px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-[hsl(var(--console-violet-text))]">
          Missão sugerida
        </span>
        <span className="text-[11px] text-muted-foreground">{rotuloDoCriterio(missao.criterio)}</span>
        {alvo && <span className="ml-auto text-[11px] text-muted-foreground">{alvo}</span>}
      </div>
      <h3 className="mt-2.5 text-[14.5px] font-semibold leading-normal text-foreground">{missao.titulo}</h3>
      <p className="mt-1 text-[13px] leading-normal text-foreground/90">{missao.descricao}</p>
      {missao.base_ia && <p className="mt-2 text-[11px] text-muted-foreground">Por que a IA sugeriu: {missao.base_ia}</p>}

      {!recusando ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={salvando}
            onClick={() => void decidir(true)}
            className={cn(botao, "border border-[hsl(var(--success))] bg-[hsl(var(--success)/.16)] text-foreground hover:bg-[hsl(var(--success)/.26)]")}
          >
            Aprovar
          </button>
          <button type="button" disabled={salvando} onClick={() => setRecusando(true)} className={cn(botao, "border border-border text-muted-foreground hover:text-foreground")}>
            Recusar
          </button>
          <span className="text-[11px] text-muted-foreground">Ao aprovar, a missão aparece para a turma.</span>
        </div>
      ) : (
        <div className="mt-3">
          <label htmlFor={`motivo-missao-${missao.id}`} className="mb-1.5 block text-[11.5px] text-muted-foreground">
            Por que recusa? (fica registrado)
          </label>
          <textarea
            id={`motivo-missao-${missao.id}`}
            value={motivo}
            maxLength={500}
            rows={2}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground"
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" disabled={salvando} onClick={() => { setRecusando(false); setErro(null); }} className={cn(botao, "border border-border text-muted-foreground hover:text-foreground")}>
              Cancelar
            </button>
            <button type="button" disabled={salvando} onClick={() => void decidir(false)} className={cn(botao, "bg-muted text-foreground")}>
              Confirmar recusa
            </button>
          </div>
        </div>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-xs text-[hsl(var(--destructive))]">
          {erro}
        </p>
      )}
    </li>
  );
}

/**
 * Missões que a IA propõe a pedido do professor. Nada chega ao aluno sem a aprovação daqui; pedir, ler e
 * decidir funcionam com a API fora do ar (só propor depende dela, e o pedido espera na fila).
 */
export default function MissoesSugeridas({ turmas }: { turmas: Turma[] }) {
  const classIds = useMemo(() => turmas.map((t) => t.id), [turmas]);
  const { limites, pendentes, decididas, historico: itensDoHistorico, pedidos, estado, pedir, decidir } = useMissoesSugeridas(classIds);
  const [classeId, setClasseId] = useState<number | null>(null);
  const [topicoId, setTopicoId] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState<number | null>(null);
  const [topicos, setTopicos] = useState<{ id: number; nome: string }[]>([]);
  const [pedindo, setPedindo] = useState(false);

  const turmaAtual = classeId ?? turmas[0]?.id ?? null;
  const nomeDaTurma = (id: number) => turmas.find((t) => t.id === id)?.descricao ?? `Turma ${id}`;
  const qtd = quantidade ?? limites?.padrao ?? 3;

  useEffect(() => {
    setTopicoId(null);
    if (turmaAtual === null) return setTopicos([]);
    let vivo = true;
    void listarTopicosDaTurma(turmaAtual).then((lista) => vivo && setTopicos(lista));
    return () => {
      vivo = false;
    };
  }, [turmaAtual]);

  if (estado.tipo === "indisponivel" || estado.tipo === "carregando" || turmas.length === 0) return null;
  if (estado.tipo === "erro") {
    return (
      <p role="alert" className="rounded-[14px] border border-destructive/50 px-4 py-3 text-[12.5px] text-foreground">
        Não foi possível carregar as missões sugeridas. Detalhe: {estado.detalhe}
      </p>
    );
  }

  const pendentesDaTurma = turmaAtual === null ? 0 : contarPendentesDaTurma(pendentes, turmaAtual);
  const liberado = podePedir(limites, pendentesDaTurma);
  const ultimo = turmaAtual === null ? null : pedidoMaisRecente(pedidos, turmaAtual);
  const situacao = ultimo ? situacaoDoPedido(ultimo) : null;
  const desdeTaxa = Date.now() - JANELA_DE_APROVACAO_DIAS * 86_400_000;
  const decididasRecentes = decididas.filter((m) => new Date(m.atualizado_em).getTime() >= desdeTaxa);
  const taxa = taxaDeAprovacao(decididasRecentes);
  const historico = itensDoHistorico.filter((item) => turmaAtual === null || item.classe_id === turmaAtual);

  const fazerPedido = async () => {
    if (turmaAtual === null) return;
    setPedindo(true);
    try {
      await pedir(turmaAtual, topicoId, qtd);
      toast.success("Pedido enviado. A IA responde assim que puder.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível pedir agora.");
    } finally {
      setPedindo(false);
    }
  };

  const dica = !limites
    ? null
    : limites.pedidos_restantes === 0
      ? `Você usou os ${limites.pedidos_por_dia} pedidos de hoje.`
      : pendentesDaTurma >= limites.maximo
        ? `Decida as ${pendentesDaTurma} sugestões abaixo antes de pedir mais.`
        : `De ${limites.minimo} a ${limites.maximo} por pedido · ${limites.pedidos_restantes} de ${limites.pedidos_por_dia} pedidos restantes hoje.`;

  return (
    <section aria-labelledby="missoes-sugeridas" className="flex flex-col gap-3">
      <div>
        <h2 id="missoes-sugeridas" className="text-base font-bold text-foreground">
          Missões sugeridas pela IA {pendentes.length > 0 && `(${pendentes.length})`}
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Peça sugestões de metas para a turma. A IA propõe e <strong>nada chega ao aluno sem a sua aprovação</strong>. Só metas que o sistema mede sozinho,
          sem prazo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        {turmas.length > 1 && (
          <label className="flex min-w-0 max-w-full flex-col gap-1 text-[11.5px] text-muted-foreground">
            Turma
            <select value={turmaAtual ?? ""} onChange={(e) => setClasseId(Number(e.target.value))} className={campo}>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {nomeDaTurma(t.id)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex min-w-0 max-w-full flex-col gap-1 text-[11.5px] text-muted-foreground">
          Assunto
          <select value={topicoId ?? ""} onChange={(e) => setTopicoId(e.target.value === "" ? null : Number(e.target.value))} className={cn(campo, "max-w-[240px]")}>
            <option value="">A turma toda</option>
            {topicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 max-w-full flex-col gap-1 text-[11.5px] text-muted-foreground">
          Quantas
          <select value={qtd} onChange={(e) => setQuantidade(Number(e.target.value))} disabled={!limites} className={campo}>
            {(limites ? opcoesDeQuantidade(limites) : [qtd]).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!liberado || pedindo}
          onClick={() => void fazerPedido()}
          className={cn(botao, "border border-[hsl(var(--console-violet))] bg-[hsl(var(--console-violet)/.16)] py-2.5 text-[12.5px] text-foreground hover:bg-[hsl(var(--console-violet)/.26)]")}
        >
          {pedindo ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Pedindo…
            </span>
          ) : (
            "Pedir sugestões"
          )}
        </button>
        {dica && <p className="basis-full text-[11.5px] text-muted-foreground">{dica}</p>}
      </div>

      {situacao && (
        <p
          role={situacao.tipo === "falhou" ? "alert" : "status"}
          className={cn(
            "rounded-[14px] border px-4 py-3 text-[12.5px]",
            situacao.tipo === "falhou" ? "border-destructive/50 text-foreground" : "border-border text-muted-foreground",
          )}
        >
          {situacao.texto}
        </p>
      )}

      <p className="text-[11.5px] text-muted-foreground">{textoDaTaxa(taxa)}</p>

      <Tabs defaultValue="pendentes" className="w-full">
        <TabsList className="h-auto w-fit max-w-full flex-wrap justify-start rounded-full border bg-card p-1.5">
          <TabsTrigger value="pendentes" className="rounded-full">
            Pendentes {pendentes.length > 0 && `(${pendentes.length})`}
          </TabsTrigger>
          <TabsTrigger value="historico" className="rounded-full">
            Histórico {historico.length > 0 && `(${historico.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="mt-3">
          {pendentes.length > 0 ? (
            <ul className="flex flex-col gap-3" aria-label="Missões sugeridas aguardando decisão">
              {pendentes.map((m) => (
                  <CartaoDaSugestao
                    key={m.id}
                    missao={m}
                    alvo={turmas.length > 1 ? nomeDaTurma(m.classe_id) : null}
                    onDecidir={(aprovar, motivo) => decidir(m.id, aprovar, motivo)}
                  />
              ))}
            </ul>
          ) : (
            <p className="rounded-[14px] border border-border px-4 py-3 text-[12.5px] text-muted-foreground">
              Não há sugestões aguardando decisão.
            </p>
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-3">
          {historico.length > 0 ? (
            <ul className="flex flex-col gap-3" aria-label="Histórico das missões sugeridas pela IA">
              {historico.map((item) => (
                <li key={item.id} className="rounded-[18px] border border-border bg-card px-[22px] py-[18px]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.04em]",
                        item.evento === "aprovada"
                          ? "bg-[hsl(var(--success)/.16)] text-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.evento === "aprovada" ? "Aprovada" : "Recusada"}
                    </span>
                    {item.missao && <span className="text-[11px] text-muted-foreground">{rotuloDoCriterio(item.missao.criterio)}</span>}
                    {turmas.length > 1 && <span className="ml-auto text-[11px] text-muted-foreground">{nomeDaTurma(item.classe_id)}</span>}
                  </div>
                  <h3 className="mt-2.5 text-[14.5px] font-semibold leading-normal text-foreground">{item.missao?.titulo ?? "Missão removida"}</h3>
                  {item.missao?.descricao && <p className="mt-1 text-[13px] leading-normal text-foreground/90">{item.missao.descricao}</p>}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Decidida em {formatarData.format(new Date(item.created_at))}
                  </p>
                  {item.evento === "recusada" && item.motivo && (
                    <p className="mt-2 text-[12px] text-muted-foreground">Motivo da recusa: {item.motivo}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[14px] border border-border px-4 py-3 text-[12.5px] text-muted-foreground">
              Ainda não há sugestões aprovadas ou recusadas nesta turma.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
