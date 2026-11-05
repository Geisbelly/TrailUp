import { useEffect, useId, useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  ABERTURA_PADRAO,
  aberturaCabe,
  codigoDoNome,
  imagemDaMoldura,
  precoParaGravar,
  problemaDaImagem,
  problemaDoRascunho,
  problemaDoTamanho,
  TELA_DA_MOLDURA,
  type Abertura,
  type ConquistaDoSistema,
  type MolduraAdmin,
  type RascunhoDaMoldura,
} from "./administracao";
import { CLASSE_SELECT } from "./comum";
import { apagarImagemDaMoldura, enviarImagemDaMoldura } from "./imagemDaMoldura";

const ORIGENS: { value: RascunhoDaMoldura["origem"]; label: string }[] = [
  { value: "loja", label: "Loja" },
  { value: "conquista", label: "Conquista" },
  { value: "acao", label: "Rara (ação no app)" },
];

const EIXOS: { chave: keyof Abertura; rotulo: string; min: number; max: number }[] = [
  { chave: "x", rotulo: "Horizontal", min: 0, max: TELA_DA_MOLDURA },
  { chave: "y", rotulo: "Vertical", min: 0, max: TELA_DA_MOLDURA },
  { chave: "radius", rotulo: "Tamanho", min: 20, max: 128 },
];

function tamanhoDaImagem(url: string): Promise<{ largura: number; altura: number }> {
  return new Promise((resolver, rejeitar) => {
    const imagem = new Image();
    imagem.onload = () => resolver({ largura: imagem.naturalWidth, altura: imagem.naturalHeight });
    imagem.onerror = () => rejeitar(new Error("Não foi possível abrir a imagem."));
    imagem.src = url;
  });
}

/** A foto entra por baixo, como no app: é o que mostra se a abertura acertou o miolo da moldura. */
function Previa({ imagem, abertura, nome }: { imagem: string; abertura: Abertura | null; nome: string }) {
  const escala = (v: number) => `${(v / TELA_DA_MOLDURA) * 100}%`;
  return (
    <div className="relative mx-auto aspect-square w-44 flex-none overflow-hidden rounded-xl bg-muted/40">
      {abertura && (
        <span
          aria-hidden="true"
          className="absolute rounded-full bg-[hsl(var(--console-violet))]/50"
          style={{ left: escala(abertura.x - abertura.radius), top: escala(abertura.y - abertura.radius), width: escala(abertura.radius * 2), height: escala(abertura.radius * 2) }}
        />
      )}
      <img src={imagem} alt={`Prévia da moldura ${nome}`} className="absolute inset-0 h-full w-full object-contain" />
    </div>
  );
}

export function FormDaMoldura({ moldura, conquistas, onFechar, onSalvo }: { moldura: MolduraAdmin | null; conquistas: ConquistaDoSistema[]; onFechar: () => void; onSalvo: () => Promise<void> }) {
  const id = useId();
  const [rascunho, setRascunho] = useState<RascunhoDaMoldura>({
    nome: moldura?.nome ?? "",
    origem: (moldura?.origem as RascunhoDaMoldura["origem"]) ?? "loja",
    preco: moldura?.preco === null || moldura?.preco === undefined ? "" : String(moldura.preco),
    conquista: moldura?.conquista_id ? String(moldura.conquista_id) : "",
  });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [abertura, setAbertura] = useState<Abertura>(moldura?.abertura ?? ABERTURA_PADRAO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(
    () => () => {
      if (previa) URL.revokeObjectURL(previa);
    },
    [previa],
  );

  const disponiveis = useMemo(() => conquistas.filter((c) => !c.moldura || c.moldura === moldura?.codigo), [conquistas, moldura]);
  const imagem = previa ?? (moldura ? imagemDaMoldura(moldura) : null);
  // Moldura do pacote mantém a abertura medida no app enquanto a imagem não for trocada.
  const editaAbertura = Boolean(arquivo) || Boolean(moldura?.imagem_url);
  const codigo = moldura?.codigo ?? codigoDoNome(rascunho.nome);
  const campo = (mudanca: Partial<RascunhoDaMoldura>) => setRascunho((r) => ({ ...r, ...mudanca }));

  const escolherArquivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const escolhido = e.target.files?.[0];
    e.target.value = "";
    if (!escolhido) return;
    const problema = problemaDaImagem(escolhido);
    if (problema) return setErro(problema);
    const url = URL.createObjectURL(escolhido);
    try {
      const { largura, altura } = await tamanhoDaImagem(url);
      const tamanhoRuim = problemaDoTamanho(largura, altura);
      if (tamanhoRuim) {
        URL.revokeObjectURL(url);
        return setErro(tamanhoRuim);
      }
    } catch (falha) {
      URL.revokeObjectURL(url);
      return setErro(falha instanceof Error ? falha.message : "Imagem inválida.");
    }
    setErro(null);
    setArquivo(escolhido);
    setPrevia(url);
  };

  const salvar = async () => {
    const problema = problemaDoRascunho(rascunho) ?? (!moldura && !arquivo ? "Escolha a imagem da moldura." : null) ?? (!moldura && !codigo ? "O nome precisa ter letras ou números." : null) ?? (editaAbertura && !aberturaCabe(abertura) ? "A abertura precisa caber na imagem." : null);
    if (problema) return setErro(problema);
    const preco = precoParaGravar(rascunho.origem, rascunho.preco);
    setSalvando(true);
    setErro(null);
    let enviada: string | null = null;
    try {
      if (arquivo) enviada = await enviarImagemDaMoldura(codigo, arquivo);
      const trocaAbertura = enviada ?? moldura?.imagem_url ?? null;
      const { data, error } = await supabase.rpc("admin_moldura_gravar" as never, {
        p_nova: !moldura,
        p_codigo: codigo,
        p_nome: rascunho.nome.trim(),
        p_origem: rascunho.origem,
        p_preco: preco.ok ? preco.preco : null,
        p_conquista: rascunho.origem === "conquista" ? Number(rascunho.conquista) : null,
        p_ativa: moldura?.ativa ?? true,
        p_imagem_url: trocaAbertura,
        p_abertura: trocaAbertura ? abertura : null,
      } as never);
      if (error) throw new Error(error.code === "42501" ? "Sem permissão." : error.message);
      const anterior = (data as { imagem_anterior?: string | null } | null)?.imagem_anterior;
      await apagarImagemDaMoldura(anterior).catch(() => toast.warning("A imagem nova entrou, mas o arquivo antigo ficou no armazenamento."));
      await onSalvo();
      toast.success(moldura ? "Moldura salva." : "Moldura cadastrada.");
      onFechar();
    } catch (falha) {
      // O registro não apontou para o arquivo novo: ele não pode ficar sobrando no bucket.
      await apagarImagemDaMoldura(enviada).catch(() => undefined);
      setErro(falha instanceof Error ? falha.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !salvando && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{moldura ? `Editar ${moldura.nome}` : "Nova moldura"}</DialogTitle>
          <DialogDescription>
            PNG ou WebP quadrado, com o miolo transparente, de pelo menos {TELA_DA_MOLDURA} px e até 1 MB. Imagem nova chega só em versões do app que leem a imagem do banco.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            {imagem ? <Previa imagem={imagem} abertura={editaAbertura ? abertura : null} nome={rascunho.nome || "nova"} /> : <div className="flex aspect-square w-44 items-center justify-center rounded-xl border border-dashed border-border text-center text-[12px] text-muted-foreground">Sem imagem</div>}
            <label className="inline-flex cursor-pointer justify-center rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold text-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
              {imagem ? "Trocar imagem" : "Escolher imagem"}
              <input type="file" accept="image/png,image/webp" className="sr-only" onChange={(e) => void escolherArquivo(e)} />
            </label>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <label className="text-[11.5px] font-semibold text-muted-foreground">
              Nome
              <Input value={rascunho.nome} maxLength={60} onChange={(e) => campo({ nome: e.target.value })} className="mt-1" />
            </label>
            <label className="text-[11.5px] font-semibold text-muted-foreground">
              Como ganhar
              <select className={`${CLASSE_SELECT} mt-1 block w-full`} value={rascunho.origem} onChange={(e) => campo({ origem: e.target.value as RascunhoDaMoldura["origem"] })}>
                {ORIGENS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {rascunho.origem === "loja" && (
              <label className="text-[11.5px] font-semibold text-muted-foreground">
                Preço em moedas
                <Input type="number" min={1} max={1000} value={rascunho.preco} onChange={(e) => campo({ preco: e.target.value })} className="mt-1" />
              </label>
            )}
            {rascunho.origem === "conquista" && (
              <label className="text-[11.5px] font-semibold text-muted-foreground">
                Conquista que libera
                <select className={`${CLASSE_SELECT} mt-1 block w-full`} value={rascunho.conquista} onChange={(e) => campo({ conquista: e.target.value })}>
                  <option value="">Escolha</option>
                  {disponiveis.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {rascunho.origem === "acao" && <p className="text-[12px] text-muted-foreground">Depois de salvar, ligue a moldura a uma ação na lista abaixo do catálogo. Sem ação ligada, ela não aparece para os alunos.</p>}
            {!moldura && codigo && <p className="text-[11.5px] text-muted-foreground">Código: {codigo}. Ele não muda depois.</p>}
          </div>
        </div>

        {editaAbertura && (
          <fieldset aria-labelledby={`${id}-abertura`} className="flex flex-col gap-2">
            <legend id={`${id}-abertura`} className="text-[11.5px] font-semibold text-muted-foreground">
              Onde a foto entra
            </legend>
            {EIXOS.map((eixo) => (
              <label key={eixo.chave} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-[12.5px] text-foreground">
                {eixo.rotulo}
                <input type="range" min={eixo.min} max={eixo.max} value={abertura[eixo.chave]} onChange={(e) => setAbertura((a) => ({ ...a, [eixo.chave]: Number(e.target.value) }))} />
                <span className="text-right text-[11.5px] text-muted-foreground">{abertura[eixo.chave]}</span>
              </label>
            ))}
          </fieldset>
        )}

        {erro && (
          <p role="alert" className="text-[12.5px] text-destructive">
            {erro}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={salvando} onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
