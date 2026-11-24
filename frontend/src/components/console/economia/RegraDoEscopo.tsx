import { useCallback, useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  REGRA_VAZIA,
  carregarConfig,
  carregarRegraDoEscopo,
  salvarRegraDoEscopo,
  type ConfigDaTurma,
  type RegraDoEscopo as Regra,
} from "./economiaApi";
import { CAMPOS_DE_PRAZO, CAMPOS_DO_ESCOPO, erroDaFaixa, lerCampoInteiro, type ChaveDoEscopo, type ValoresDePrazo } from "./economiaRegras";

type Escopo = "topico" | "atividade";

const CAMPOS = [...CAMPOS_DE_PRAZO, ...CAMPOS_DO_ESCOPO];

function paraTexto(regra: Regra): Record<ChaveDoEscopo, string> {
  return Object.fromEntries(CAMPOS.map((c) => [c.chave, regra[c.chave] == null ? "" : String(regra[c.chave])])) as Record<ChaveDoEscopo, string>;
}

/** O que vale quando o campo fica vazio: o tópico (só para a atividade) e, sem ele, a turma. */
function herdado(chave: ChaveDoEscopo, turma: ConfigDaTurma, topico: Regra | null): number | null {
  const doTopico = topico?.[chave];
  if (doTopico != null) return doTopico;
  if (chave === "uso_max_retry") return turma.retry_max_por_topico;
  if (chave === "moedas_conclusao" || chave === "moedas_aprovacao") return null;
  return turma[chave];
}

/**
 * Prazo e tempo extra que o aluno pode comprar na loja, e as moedas a mais, para um tópico ou uma
 * atividade. Fica dentro do editor de cada um; o padrão da turma fica em Turmas → Editar. Vazio
 * herda: a atividade segue o tópico, e o tópico segue a turma (a loja lê nessa ordem).
 */
export function RegraDoEscopo({ classeId, escopo, alvoId, topicoId }: { classeId: number; escopo: Escopo; alvoId: number; topicoId?: number }) {
  const id = useId();
  const [turma, setTurma] = useState<ConfigDaTurma | null>(null);
  const [doTopico, setDoTopico] = useState<Regra | null>(null);
  const [regra, setRegra] = useState<Regra>(REGRA_VAZIA);
  const [campos, setCampos] = useState<Record<ChaveDoEscopo, string>>(paraTexto(REGRA_VAZIA));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [config, propria, topico] = await Promise.all([
        carregarConfig(classeId),
        carregarRegraDoEscopo(classeId, escopo, alvoId),
        escopo === "atividade" && topicoId ? carregarRegraDoEscopo(classeId, "topico", topicoId) : Promise.resolve(null),
      ]);
      setTurma(config);
      setDoTopico(topico);
      setRegra(propria);
      setCampos(paraTexto(propria));
      setErro("");
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [classeId, escopo, alvoId, topicoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = async () => {
    if (!turma) return;
    const lidos = Object.fromEntries(CAMPOS.map((c) => [c.chave, lerCampoInteiro(campos[c.chave], c.max)])) as Record<ChaveDoEscopo, number | null>;
    const invalido = CAMPOS.find((c) => Number.isNaN(lidos[c.chave]));
    if (invalido) {
      toast.error(`${invalido.rotulo}: use um número inteiro de 0 a ${invalido.max.toLocaleString("pt-BR")}, ou deixe vazio.`);
      return;
    }
    const valendo = Object.fromEntries(
      CAMPOS_DE_PRAZO.map((c) => [c.chave, lidos[c.chave] ?? herdado(c.chave, turma, doTopico)]),
    ) as ValoresDePrazo;
    const faixa = erroDaFaixa(valendo, turma.prazo_max_dias_total);
    if (faixa) {
      toast.error(faixa);
      return;
    }
    setSalvando(true);
    try {
      const nova: Regra = { ...regra, ...lidos };
      await salvarRegraDoEscopo(classeId, escopo, alvoId, nova);
      setRegra(nova);
      toast.success(escopo === "topico" ? "Regra do tópico salva." : "Regra da atividade salva.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const dono = escopo === "topico" ? "a turma" : "o tópico e, sem ele, a turma";

  return (
    <details className="rounded-[14px] border border-border bg-card/40 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Prazo, tempo e moedas da loja</summary>
      {erro ? (
        <div className="mt-3 space-y-2 text-sm">
          <p role="alert" className="text-destructive">Não foi possível carregar a regra: {erro}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void carregar()}>Tentar de novo</Button>
        </div>
      ) : !turma ? (
        <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-primary" aria-label="Carregando" />
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-normal text-muted-foreground">
            Quanto o aluno pode estender {escopo === "topico" ? "as atividades deste tópico" : "esta atividade"} com os itens da loja, e as moedas a
            mais quando você aprova a entrega (nota de 60% ou mais). Campo vazio segue {dono}, que aparece em cinza.
          </p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))]">
            {CAMPOS.map((c) => {
              const valor = herdado(c.chave, turma, doTopico);
              return (
                <div key={c.chave}>
                  <label htmlFor={`${id}-${c.chave}`} className="text-xs font-semibold text-foreground">{c.rotulo}</label>
                  <Input
                    id={`${id}-${c.chave}`}
                    inputMode="numeric"
                    value={campos[c.chave]}
                    onChange={(e) => setCampos((atual) => ({ ...atual, [c.chave]: e.target.value }))}
                    placeholder={valor == null ? "padrão" : String(valor)}
                    className="mt-1"
                  />
                </div>
              );
            })}
          </div>
          <Button type="button" size="sm" className="rounded-full" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : escopo === "topico" ? "Salvar regra do tópico" : "Salvar regra da atividade"}
          </Button>
        </div>
      )}
    </details>
  );
}
