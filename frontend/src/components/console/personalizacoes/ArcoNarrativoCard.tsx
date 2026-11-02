import { useEffect, useMemo, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { ARCO_MAXIMO, arcoMudou, contarCaracteres, salvarArco, validarArco, type ArcoSalvo, type BancoDoArco } from "./arcoNarrativo";

// Direto no Supabase: a RLS (`classe_arco_narrativo_professor_all`) só deixa o dono da turma ler
// e escrever. Salvar dispara a regeração pelo gatilho do banco; o console não chama a API.
const bancoDoArco: BancoDoArco = {
  async ler(classeId) {
    const { data, error } = await supabase
      .from("classe_arco_narrativo")
      .select("texto, updated_at")
      .eq("classe_id", classeId)
      .maybeSingle();
    if (error) throw error;
    return data ? { texto: data.texto, atualizadoEm: data.updated_at } : null;
  },
  async gravar(classeId, texto) {
    const { data, error } = await supabase
      .from("classe_arco_narrativo")
      .upsert({ classe_id: classeId, texto }, { onConflict: "classe_id" })
      .select("texto, updated_at")
      .single();
    if (error) throw error;
    return { texto: data.texto, atualizadoEm: data.updated_at };
  },
  async apagar(classeId) {
    const { error } = await supabase.from("classe_arco_narrativo").delete().eq("classe_id", classeId);
    if (error) throw error;
  },
};

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;

export function ArcoNarrativoCard({ classeId }: { classeId: number | null }) {
  const [salvo, setSalvo] = useState<ArcoSalvo | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!classeId) {
      setSalvo(null);
      setRascunho("");
      return;
    }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    bancoDoArco
      .ler(classeId)
      .then((arco) => {
        if (!vivo) return;
        setSalvo(arco);
        setRascunho(arco?.texto ?? "");
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [classeId]);

  const validacao = useMemo(() => validarArco(rascunho), [rascunho]);
  const mudou = arcoMudou(salvo, rascunho);
  const caracteres = contarCaracteres(rascunho);

  const salvar = async () => {
    if (!classeId || !mudou || validacao.ok === false) return;
    setSalvando(true);
    setErro(null);
    try {
      const resultado = await salvarArco(bancoDoArco, classeId, rascunho);
      setSalvo(resultado);
      setRascunho(resultado?.texto ?? "");
      toast.success(
        resultado
          ? "Arco salvo. O material da turma vai ser gerado de novo com esta história."
          : "Arco removido. O material da turma vai ser gerado de novo sem história.",
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  if (!classeId) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Selecione uma turma para escrever a história dela.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4" aria-hidden="true" />
          História da turma
        </CardTitle>
        <CardDescription>
          O cenário, os personagens e o fio que liga os tópicos. O material dos sete perfis é escrito dentro desta
          história, e cada guia continua contando do seu jeito. Ligue a história ao que a turma estuda: história solta
          do conteúdo não ajuda o aluno.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {carregando ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando a história...
          </p>
        ) : (
          <>
            <Textarea
              aria-label="História da turma"
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              rows={8}
              placeholder="Ex.: A turma é a tripulação da nave Aurora. Cada tópico é um sistema da estação Vega que precisa voltar a funcionar..."
              disabled={salvando}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className={validacao.ok === false ? "text-destructive" : undefined}>
                {caracteres.toLocaleString("pt-BR")} / {ARCO_MAXIMO.toLocaleString("pt-BR")} caracteres
              </span>
              {salvo?.atualizadoEm && <span>Salva em {quando(salvo.atualizadoEm)}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Salvar uma história diferente gera de novo o material personalizado da turma inteira. Com a geração
              automática desligada, o material novo sai quando você pedir.
            </p>
            {validacao.ok === false && <p className="text-xs text-destructive">{validacao.erro}</p>}
            {erro && <p className="text-xs text-destructive">{erro}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                className="rounded-full font-bold"
                onClick={() => void salvar()}
                disabled={!mudou || validacao.ok === false || salvando}
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : rascunho.trim() ? "Salvar história" : "Remover história"}
              </Button>
              {mudou && !salvando && (
                <Button variant="outline" className="rounded-full" onClick={() => setRascunho(salvo?.texto ?? "")}>
                  Desfazer
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
