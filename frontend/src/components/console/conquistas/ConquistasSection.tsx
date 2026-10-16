import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CabecalhoDePagina, EstadoVazioDaPagina, ErroDaPagina } from "../comum/PaginaDoConsole";
import { CartaoDaConquista } from "./CartaoDaConquista";
import { FormularioDaConquista } from "./FormularioDaConquista";
import {
  alternarConquista,
  criarConquistas,
  lerTeto,
  listarConquistasDaTurma,
  salvarConquista,
  TETO_PADRAO,
  traduzirErro,
  type ConquistaDaTurma,
} from "./conquistasApi";
import { COR_PADRAO, ICONE_PADRAO } from "./aparencia";
import { FORMULARIO_VAZIO, type FormularioDeConquista, type LinhaDeConquista } from "./formulario";
import { noTeto, rotuloDoTeto, textoDeAlternar } from "./textos";

type Turma = { id: number; descricao: string | null };

function formularioDe(c: ConquistaDaTurma): FormularioDeConquista {
  return {
    ...FORMULARIO_VAZIO,
    nome: c.nome,
    descricao: c.descricao,
    icone: c.criterio.aparencia?.icone ?? ICONE_PADRAO,
    cor: c.criterio.aparencia?.cor ?? COR_PADRAO,
    metrica: c.criterio.metrica.chave,
    limiar: String(c.criterio.limiar),
    escopo: c.escopo === "perfil" ? "perfil" : "geral",
    perfis: c.perfil ? [c.perfil] : [],
    pontos: String(c.pontos),
  };
}

type FormAberto = { inicial: FormularioDeConquista; editando: ConquistaDaTurma | null; chave: number };

export default function ConquistasSection({ professorId }: { professorId?: string }) {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState<number | null>(null);
  const [conquistas, setConquistas] = useState<ConquistaDaTurma[]>([]);
  const [teto, setTeto] = useState(TETO_PADRAO);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [detalhe, setDetalhe] = useState("");
  const [form, setForm] = useState<FormAberto | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroDoServidor, setErroDoServidor] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<ConquistaDaTurma | null>(null);
  const [alternando, setAlternando] = useState(false);

  const carregar = useCallback(async () => {
    if (!professorId) return;
    setEstado("carregando");
    try {
      const { data, error } = await supabase.from("classe").select("id, descricao").eq("professor_id", professorId).order("id");
      if (error) throw error;
      const lista = (data ?? []) as Turma[];
      setTurmas(lista);
      const atual = lista.find((t) => t.id === turmaId)?.id ?? lista[0]?.id ?? null;
      setTurmaId(atual);
      setTeto(await lerTeto());
      setConquistas(atual ? await listarConquistasDaTurma(atual) : []);
      setEstado("ok");
    } catch (e) {
      setDetalhe(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "erro desconhecido");
      setEstado("erro");
    }
  }, [professorId, turmaId]);

  // Só recarrega por troca de professor; a troca de turma tem o seu próprio caminho.
  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  const trocarTurma = async (id: number) => {
    setTurmaId(id);
    setEstado("carregando");
    try {
      setConquistas(await listarConquistasDaTurma(id));
      setEstado("ok");
    } catch (e) {
      setDetalhe((e as { message?: string })?.message ?? "erro desconhecido");
      setEstado("erro");
    }
  };

  const recarregarLista = async () => {
    if (turmaId) setConquistas(await listarConquistasDaTurma(turmaId));
  };

  const abrirNova = () => {
    setErroDoServidor(null);
    setForm({ inicial: FORMULARIO_VAZIO, editando: null, chave: Date.now() });
  };
  const abrirEdicao = (c: ConquistaDaTurma) => {
    setErroDoServidor(null);
    setForm({ inicial: formularioDe(c), editando: c, chave: Date.now() });
  };

  const salvar = async (linhas: LinhaDeConquista[]) => {
    if (!turmaId || !form) return;
    setSalvando(true);
    setErroDoServidor(null);
    try {
      if (form.editando) {
        await salvarConquista(turmaId, form.editando.id, linhas[0]);
      } else {
        const r = await criarConquistas(turmaId, linhas);
        if (r.erro) {
          setErroDoServidor(r.criadas.length > 0 ? `${r.criadas.length} de ${linhas.length} foram criadas. ${r.erro}` : r.erro);
          await recarregarLista();
          return;
        }
      }
      await recarregarLista();
      setForm(null);
      toast.success(form.editando ? "Conquista atualizada." : linhas.length > 1 ? `${linhas.length} conquistas criadas.` : "Conquista criada.");
    } catch (e) {
      setErroDoServidor(traduzirErro(e as { code?: string; message?: string }));
    } finally {
      setSalvando(false);
    }
  };

  const confirmarAlternar = async () => {
    if (!alvo) return;
    setAlternando(true);
    try {
      await alternarConquista(alvo.id, !alvo.ativa);
      await recarregarLista();
      toast.success(alvo.ativa ? "Conquista desativada." : "Conquista reativada.");
      setAlvo(null);
    } catch (e) {
      toast.error(traduzirErro(e as { code?: string; message?: string }));
    } finally {
      setAlternando(false);
    }
  };

  const textoDoAlvo = useMemo(() => (alvo ? textoDeAlternar(alvo) : null), [alvo]);
  const cheio = noTeto(conquistas.length, teto);

  return (
    <div>
      <CabecalhoDePagina
        titulo="Conquistas"
        subtitulo="Conquistas exclusivas desta turma, além das já disponíveis na plataforma."
        acao={
          estado === "ok" && turmaId ? (
            <div className="flex flex-col items-end gap-1.5">
              <Button className="rounded-full font-bold" onClick={abrirNova} disabled={cheio}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Nova conquista
              </Button>
              <span className="text-xs text-muted-foreground">{rotuloDoTeto(conquistas.length, teto)}</span>
            </div>
          ) : undefined
        }
      />

      {estado === "carregando" && (
        <div role="status" className="flex items-center justify-center py-16" aria-label="Carregando conquistas">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {estado === "erro" && <ErroDaPagina titulo="Não foi possível carregar as conquistas" detalhe={detalhe} onTentarNovamente={() => void carregar()} />}

      {estado === "ok" && turmas.length === 0 && (
        <EstadoVazioDaPagina icone={Trophy} titulo="Crie uma turma primeiro" texto="As conquistas desta tela pertencem a uma turma. Crie a primeira em Turmas." />
      )}

      {estado === "ok" && turmaId && (
        <div className="space-y-4">
          {turmas.length > 1 && (
            <Select value={String(turmaId)} onValueChange={(v) => void trocarTurma(Number(v))}>
              <SelectTrigger className="w-[260px] rounded-[14px]" aria-label="Turma">
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

          <p className="rounded-[14px] bg-muted px-4 py-3 text-[12.5px] text-muted-foreground">
            A plataforma já traz 27 conquistas globais — as conquistas abaixo são adicionais, só desta turma.
          </p>

          {conquistas.length === 0 ? (
            <EstadoVazioDaPagina
              icone={Trophy}
              titulo="Nenhuma conquista desta turma ainda"
              texto="Crie a primeira: escolha o que medir, o mínimo para ganhar e a recompensa."
              acao={{ rotulo: "Nova conquista", onClick: abrirNova }}
            />
          ) : (
            <ul className="space-y-3">
              {conquistas.map((c) => (
                <CartaoDaConquista key={c.id} conquista={c} onEditar={() => abrirEdicao(c)} onAlternar={() => setAlvo(c)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {form && (
        <FormularioDaConquista
          key={form.chave}
          aberto
          inicial={form.inicial}
          editando={form.editando !== null}
          concedidas={form.editando?.concedidas ?? 0}
          salvando={salvando}
          erroDoServidor={erroDoServidor}
          onSalvar={(l) => void salvar(l)}
          onCancelar={() => setForm(null)}
        />
      )}

      <AlertDialog open={alvo !== null} onOpenChange={(v) => !v && !alternando && setAlvo(null)}>
        <AlertDialogContent className="max-w-[480px] rounded-[20px] bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[19px]">{textoDoAlvo?.titulo}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p className="text-sm font-semibold text-foreground">{textoDoAlvo?.pergunta}</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{textoDoAlvo?.corpo}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:justify-between">
            <AlertDialogCancel disabled={alternando} className="mt-0 rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={alternando}
              onClick={(e) => {
                e.preventDefault();
                void confirmarAlternar();
              }}
              className="rounded-full font-bold"
            >
              {alternando ? "Salvando…" : textoDoAlvo?.confirmar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
