import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import { cn } from "@/lib/utils";
import { buscarAlunos, type AlunoCandidato } from "../turmas/matriculas";

export const CLASSE_SELECT = "h-9 max-w-full rounded-lg border border-border bg-background px-2 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

async function chamar(funcao: string, argumentos: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await supabase.rpc(funcao as never, argumentos as never);
  if (error) throw new Error(error.code === "42501" ? "Sem permissão." : error.message || "Falha ao falar com o banco.");
  return data;
}

/** Lê direto do banco, como o painel técnico: a tela não pode cair junto com a API. */
export function useLeitura<T>(funcao: string, argumentos: Record<string, unknown>, ler: (dado: unknown) => T | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(createRequestGuard());
  const chave = JSON.stringify(argumentos);

  const carregar = useCallback(async () => {
    const pedido = guarda.current.next();
    try {
      const lido = ler(await chamar(funcao, JSON.parse(chave)));
      if (!pedido.isCurrent()) return;
      if (!lido) return setErro("Resposta inesperada do banco.");
      setDados(lido);
      setErro(null);
    } catch (e) {
      if (pedido.isCurrent()) setErro(e instanceof Error ? e.message : "Falha ao ler.");
    }
  }, [funcao, chave, ler]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { dados, erro, carregar };
}

/** Roda uma escrita, relê e avisa. A frase de erro é a do banco. Devolve a resposta, ou null se falhou. */
export function useEscrita(depois: () => Promise<void>) {
  const [ocupado, setOcupado] = useState(false);
  const escrever = useCallback(
    async (funcao: string, argumentos: Record<string, unknown>, sucesso: string | ((resposta: unknown) => string)) => {
      setOcupado(true);
      try {
        const resposta = await chamar(funcao, argumentos);
        await depois();
        toast.success(typeof sucesso === "string" ? sucesso : sucesso(resposta));
        return resposta;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [depois],
  );
  return { ocupado, escrever };
}

export type Escrever = ReturnType<typeof useEscrita>["escrever"];

export function Estado({ erro }: { erro: string | null }) {
  if (erro) return <p role="alert" className="text-[13px] text-destructive">Não foi possível carregar: {erro}</p>;
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
    </p>
  );
}

export function CampoDeBusca({ rotulo, valor, onChange, contagem, className }: { rotulo: string; valor: string; onChange: (v: string) => void; contagem?: string; className?: string }) {
  return (
    <div className={cn("flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring", className)}>
      <Search className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        aria-label={rotulo}
        placeholder={rotulo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      {contagem && (
        <span aria-live="polite" className="flex-none text-[11.5px] text-muted-foreground">
          {contagem}
        </span>
      )}
    </div>
  );
}

const RESULTADOS_VISIVEIS = 5;

/** Busca por nome ou e-mail e age com um clique. `excluir` some da lista: quem já está não tem o que fazer aqui. */
export function SeletorDeAluno({ alunos, excluir, acao, rotulo, ocupado, onEscolher }: { alunos: AlunoCandidato[]; excluir: string[]; acao: string; rotulo: string; ocupado: boolean; onEscolher: (alunoId: string) => void }) {
  const [termo, setTermo] = useState("");
  const resultados = useMemo(() => buscarAlunos(alunos, termo, new Set(excluir)).filter((a) => !a.jaMatriculado), [alunos, termo, excluir]);
  const visiveis = resultados.slice(0, RESULTADOS_VISIVEIS);
  const restantes = resultados.length - visiveis.length;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-2.5">
      <CampoDeBusca rotulo={rotulo} valor={termo} onChange={setTermo} />
      {visiveis.length === 0 ? (
        <p className="px-1 text-[12.5px] text-muted-foreground">{termo.trim() ? `Ninguém encontrado com “${termo.trim()}”.` : "Todos os alunos já estão aqui."}</p>
      ) : (
        <ul aria-label="Resultados da busca" className="flex flex-col">
          {visiveis.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 border-t border-border py-1.5 first:border-t-0">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold text-foreground">{a.nome}</div>
                {a.email && a.email !== a.nome && <div className="truncate text-[11.5px] text-muted-foreground">{a.email}</div>}
              </div>
              <Button type="button" size="sm" variant="outline" disabled={ocupado} aria-label={`${acao} ${a.nome}`} onClick={() => onEscolher(a.id)}>
                {acao}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {restantes > 0 && <p className="px-1 text-[11.5px] text-muted-foreground">Mais {restantes}. Refine a busca.</p>}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[12.5px] text-muted-foreground">{children}</p>;
}
