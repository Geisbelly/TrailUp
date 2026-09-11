import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Medal, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  acharMetrica,
  descreverConquista,
  METRICAS,
  montarConquista,
  PERFIS_BRAINHEX,
  type EscopoDaConquista,
} from "@/lib/conquistaDaTurma";

type Props = {
  classeId: number | null;
  classeDescricao?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ConquistaDaClasse = {
  id: number;
  nome: string;
  descricao: string | null;
  tipo: string;
  criterio: Record<string, unknown> | null;
  pontos_recompensa: number | null;
  escopo: string | null;
  perfil_alvo: string | null;
};

const SEM_PERFIL = "__sem_perfil__";

export function ConquistaDialog({
  classeId,
  classeDescricao,
  open,
  onOpenChange,
}: Props) {
  const [lista, setLista] = useState<ConquistaDaClasse[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [teto, setTeto] = useState<number | null>(null);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [metrica, setMetrica] = useState<string>(METRICAS[0].metrica);
  const [limiar, setLimiar] = useState<string>(String(METRICAS[0].sugestao));
  const [pontos, setPontos] = useState("20");
  const [escopo, setEscopo] = useState<EscopoDaConquista>("comum");
  const [perfilAlvo, setPerfilAlvo] = useState<string>(SEM_PERFIL);

  const definicao = useMemo(() => acharMetrica(metrica), [metrica]);

  const carregar = useCallback(async () => {
    if (!classeId) return;
    setCarregando(true);

    const { data, error } = await supabase
      .from("conquistas")
      .select("id, nome, descricao, tipo, criterio, pontos_recompensa, escopo, perfil_alvo")
      .eq("classe_id", classeId)
      .order("id", { ascending: true });

    setCarregando(false);

    if (error) {
      toast.error("Não foi possível carregar as conquistas da turma.");
      setLista([]);
      return;
    }
    setLista((data ?? []) as ConquistaDaClasse[]);
  }, [classeId]);

  useEffect(() => {
    if (!open) return;
    void carregar();

    // O teto vem do banco, não de uma constante aqui: dois lugares com o mesmo
    // limite divergem.
    void (async () => {
      const { data } = await supabase
        .from("app_config")
        .select("valor")
        .eq("chave", "conquista_recompensa_maxima")
        .maybeSingle();
      const lido = Number(String(data?.valor ?? "").replace(/[^0-9]/g, ""));
      setTeto(Number.isFinite(lido) && lido > 0 ? lido : null);
    })();
  }, [open, carregar]);

  // Trocar de métrica troca o limiar sugerido: "300" faz sentido para minutos e
  // nenhum para "dias seguidos".
  useEffect(() => {
    const d = acharMetrica(metrica);
    if (d) setLimiar(String(d.sugestao));
  }, [metrica]);

  function limpar() {
    setNome("");
    setDescricao("");
    setEscopo("comum");
    setPerfilAlvo(SEM_PERFIL);
  }

  async function salvar() {
    const resultado = montarConquista({
      classeId,
      nome,
      descricao,
      metrica,
      limiar: limiar.trim() === "" ? null : Number(limiar),
      pontos: pontos.trim() === "" ? null : Number(pontos),
      escopo,
      perfilAlvo: perfilAlvo === SEM_PERFIL ? null : perfilAlvo,
      tetoDePontos: teto,
      tiposEmUso: lista.map((c) => c.tipo),
    });

    if (resultado.erro || !resultado.linha) {
      toast.error(resultado.erro ?? "Não foi possível montar a conquista.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from("conquistas").insert(resultado.linha);
    setSalvando(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`"${resultado.linha.nome}" criada.`);
    limpar();
    void carregar();
  }

  async function remover(id: number, nomeDaConquista: string) {
    const { error } = await supabase.from("conquistas").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`"${nomeDaConquista}" removida.`);
    void carregar();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Medal className="w-4 h-4" /> Conquistas da turma
          </DialogTitle>
          <DialogDescription>
            Turma: <span className="font-semibold">{classeDescricao ?? "—"}</span>. Só
            os alunos desta turma são avaliados por elas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="conquista-nome">Nome</Label>
          <Input
            id="conquista-nome"
            placeholder="Ex.: Maratonista da turma"
            value={nome}
            maxLength={80}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="conquista-descricao">Descrição (opcional)</Label>
          <Input
            id="conquista-descricao"
            placeholder="O que o aluno precisa fazer"
            value={descricao}
            maxLength={160}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="conquista-metrica">O que é medido</Label>
            <Select value={metrica} onValueChange={setMetrica}>
              <SelectTrigger id="conquista-metrica">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICAS.map((m) => (
                  <SelectItem key={m.metrica} value={m.metrica}>
                    {m.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conquista-limiar">
              {definicao?.rotuloDoLimiar ?? "Limiar"}
            </Label>
            <Input
              id="conquista-limiar"
              type="number"
              min={definicao?.minimo}
              max={definicao?.maximo}
              inputMode="numeric"
              value={limiar}
              onChange={(e) => setLimiar(e.target.value)}
            />
          </div>
        </div>

        {definicao ? (
          <p className="-mt-1 text-xs text-muted-foreground">{definicao.ajuda}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="conquista-pontos">Pontos</Label>
            <Input
              id="conquista-pontos"
              type="number"
              min={0}
              max={teto ?? undefined}
              inputMode="numeric"
              value={pontos}
              onChange={(e) => setPontos(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {teto ? `Até ${teto} por conquista.` : "Somados ao ranking."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conquista-escopo">Para quem</Label>
            <Select
              value={escopo}
              onValueChange={(v) => {
                const proximo = v as EscopoDaConquista;
                setEscopo(proximo);
                if (proximo === "comum") setPerfilAlvo(SEM_PERFIL);
              }}
            >
              <SelectTrigger id="conquista-escopo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comum">Toda a turma</SelectItem>
                <SelectItem value="perfil">Só um perfil</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {escopo === "perfil" ? (
          <div className="space-y-1.5">
            <Label htmlFor="conquista-perfil">Perfil BrainHex</Label>
            <Select value={perfilAlvo} onValueChange={setPerfilAlvo}>
              <SelectTrigger id="conquista-perfil">
                <SelectValue placeholder="Escolha o perfil" />
              </SelectTrigger>
              <SelectContent>
                {PERFIS_BRAINHEX.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={salvando || !classeId}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {salvando ? "Criando..." : "Criar conquista"}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>Já cadastradas nesta turma</Label>
          <ScrollArea className="h-44 rounded-md border">
            <div className="p-2 space-y-1">
              {carregando ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Carregando…
                </p>
              ) : lista.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma conquista própria desta turma ainda. As conquistas gerais
                  do TrailUp continuam valendo.
                </p>
              ) : (
                lista.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-start gap-2 rounded-md border p-2.5"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {descreverConquista({
                          classe_id: classeId ?? 0,
                          nome: c.nome,
                          descricao: c.descricao,
                          categoria: "",
                          tipo: c.tipo,
                          criterio: c.criterio ?? {},
                          pontos_recompensa: Number(c.pontos_recompensa ?? 0),
                          escopo: (c.escopo === "perfil" ? "perfil" : "comum"),
                          perfil_alvo: c.perfil_alvo,
                        })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => remover(c.id, c.nome)}
                      aria-label={`Remover ${c.nome}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <p className="text-xs text-muted-foreground">
            Remover apaga também quem já desbloqueou — os pontos já creditados
            continuam no histórico.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ConquistaDialog;
