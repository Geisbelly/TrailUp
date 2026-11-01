import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroDaPagina } from "../comum/PaginaDoConsole";
import { carregarFundos, criarFundo, encerrarFundo, type FundoDaTurma } from "./economiaApi";
import { ROTULO_DO_FUNDO, progressoDoFundo } from "./economiaRegras";

/**
 * Fundo da turma (#144): a recompensa coletiva. O professor abre com uma meta e o benefício; os
 * alunos doam pelo app; bateu a meta, o professor entrega e marca aqui. Cancelar devolve as moedas.
 * Tudo direto no Supabase (RPCs `fundo_turma_*`), sem API.
 */
export default function AbaFundo({ classeId }: { classeId: number }) {
  const [fundos, setFundos] = useState<FundoDaTurma[] | null>(null);
  const [doadores, setDoadores] = useState<Map<number, number>>(new Map());
  const [erro, setErro] = useState("");
  const [titulo, setTitulo] = useState("");
  const [beneficio, setBeneficio] = useState("");
  const [meta, setMeta] = useState("50");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await carregarFundos(classeId);
      setFundos(r.fundos);
      setDoadores(r.doadores);
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [classeId]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = async (acao: () => Promise<void>, sucesso: string) => {
    setSalvando(true);
    try {
      await acao();
      toast.success(sucesso);
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  if (erro) return <ErroDaPagina titulo="Não foi possível carregar o fundo" detalhe={erro} onTentarNovamente={() => void carregar()} />;
  if (!fundos) return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-primary" />;

  const ativo = fundos.find((f) => f.status === "aberto" || f.status === "atingido") ?? null;
  const historico = fundos.filter((f) => f !== ativo);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A recompensa coletiva: a turma junta moedas para um benefício que você escolhe. Cada aluno doa da própria carteira (a moeda
        individual, de Valores) e vê o total e a própria doação, nunca a dos colegas. Um fundo ativo por turma.
      </p>

      {ativo ? (
        <section aria-labelledby="fundo-ativo" className="rounded-[20px] border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="fundo-ativo" className="text-lg font-semibold">{ativo.titulo}</h3>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">{ROTULO_DO_FUNDO[ativo.status]}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Benefício: {ativo.beneficio}</p>
          <div
            role="progressbar"
            aria-label="Progresso do fundo"
            aria-valuemin={0}
            aria-valuemax={ativo.meta}
            aria-valuenow={Math.min(ativo.arrecadado, ativo.meta)}
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (100 * ativo.arrecadado) / ativo.meta)}%` }} />
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {progressoDoFundo(ativo.arrecadado, ativo.meta)} · {doadores.get(ativo.id) ?? 0} {(doadores.get(ativo.id) ?? 0) === 1 ? "aluno doou" : "alunos doaram"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              className="rounded-full"
              disabled={salvando || ativo.status !== "atingido"}
              onClick={() => void executar(() => encerrarFundo(ativo.id, true), "Benefício marcado como entregue.")}
            >
              Marcar benefício como entregue
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={salvando}
              onClick={() => {
                if (window.confirm("Cancelar o fundo devolve as moedas a todos que doaram. Continuar?")) {
                  void executar(() => encerrarFundo(ativo.id, false), "Fundo cancelado e moedas devolvidas.");
                }
              }}
            >
              Cancelar e devolver as moedas
            </Button>
          </div>
          {ativo.status === "aberto" && (
            <p className="mt-2 text-xs text-muted-foreground">"Marcar como entregue" libera quando a turma bater a meta.</p>
          )}
        </section>
      ) : (
        <form
          aria-labelledby="novo-fundo"
          className="space-y-3 rounded-[20px] border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void executar(async () => {
              await criarFundo(classeId, titulo, beneficio, Number(meta));
              setTitulo("");
              setBeneficio("");
            }, "Fundo aberto. Os alunos já podem doar pela loja.");
          }}
        >
          <h3 id="novo-fundo" className="text-lg font-semibold">Abrir um fundo</h3>
          <label className="block text-sm">
            Nome
            <Input value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Dia extra" className="mt-1" required />
          </label>
          <label className="block text-sm">
            Benefício que a turma ganha
            <Input value={beneficio} maxLength={300} onChange={(e) => setBeneficio(e.target.value)} placeholder="Ex.: +1 dia de prazo na próxima lista" className="mt-1" required />
          </label>
          <label className="block text-sm">
            Meta (moedas)
            <Input value={meta} inputMode="numeric" onChange={(e) => setMeta(e.target.value)} className="mt-1 w-40" required />
          </label>
          <Button type="submit" className="rounded-full" disabled={salvando}>
            Abrir fundo
          </Button>
        </form>
      )}

      {historico.length > 0 && (
        <section aria-labelledby="fundos-anteriores" className="rounded-[20px] border bg-card p-4">
          <h3 id="fundos-anteriores" className="mb-2 font-semibold">Fundos anteriores</h3>
          <ul className="space-y-1.5 text-sm">
            {historico.map((f) => (
              <li key={f.id} className="flex flex-wrap gap-x-2">
                <span className="font-semibold text-foreground">{f.titulo}</span>
                <span className="text-muted-foreground">
                  {ROTULO_DO_FUNDO[f.status]} · {progressoDoFundo(f.arrecadado, f.meta)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
