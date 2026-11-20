import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ClipboardCheck, Copy, ListChecks, Pencil, Power, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aguardaDecisao, origemDe, podeEditar, rotuloDaOrigem, rotuloDoEscopo } from "./aprovacao";
import {
  opcoesDePerfilDaLinha,
  percentualDeEntrega,
  respostaDoDesafio,
  resumoDeEntregas,
  resumoDoDesafio,
  rotuloDoPerfil,
  rotuloDoPrazo,
  rotuloDoTipoDoDesafio,
  trocasDePerfil,
} from "./missao";
import type { LinhaDoDesafio, Missao } from "./missoesApi";

export type TrocaDePerfil = { id: number; perfil: string };

/**
 * Cartão da lista de missões.
 *
 * Dois caminhos, duas caras: `entrega` mostra nota, entregas e os atalhos para o tópico e para
 * a correção; `meta` mostra o critério e nada disso — ela não tem atividade atrás, então
 * `topicoId` é nulo e um link para `/console/trilha/null/editar` levaria a lugar nenhum.
 *
 * Propostas da IA e missões do professor podem ser editadas; as missões do sistema têm painel
 * próprio. Pendente ganha Aprovar e Recusar quando quem monta passa os dois callbacks.
 *
 * A missão-desafio (#1149) chega aqui já agrupada (`agruparDesafios`): um cartão por grupo, com o
 * selo "Desafio" e os perfis. Ela não se edita, não se duplica e não se exclui por aqui; o
 * professor desativa o grupo inteiro e troca o perfil das linhas que existem. O desafio que o
 * servidor gerou sozinho (`20261120_03`) chega pendente: o cartão mostra o enunciado inteiro e a
 * resposta, e Aprovar e Recusar valem para o grupo todo.
 */
export function CartaoDaMissao({
  missao,
  onEditar,
  onDuplicar,
  onExcluir,
  onAprovar,
  onRecusar,
  decidindo = false,
  onAlternarDesafio,
  onTrocarPerfis,
  alternando = false,
}: {
  missao: Missao;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
  onAprovar?: () => void;
  onRecusar?: () => void;
  decidindo?: boolean;
  /** Só no desafio: liga ou desliga todas as linhas do grupo. */
  onAlternarDesafio?: () => void;
  /**
   * Só no desafio: troca o perfil das linhas que já existem. Quem monta mostra o aviso (de sucesso
   * ou de erro) e recarrega a lista; a promessa não rejeita, e o cartão só fecha a edição.
   */
  onTrocarPerfis?: (trocas: TrocaDePerfil[]) => Promise<void>;
  alternando?: boolean;
}) {
  if (missao.desafio != null) {
    return (
      <CartaoDoDesafio
        missao={missao}
        onAlternar={onAlternarDesafio}
        onTrocarPerfis={onTrocarPerfis}
        alternando={alternando}
        onAprovar={onAprovar}
        onRecusar={onRecusar}
        decidindo={decidindo}
      />
    );
  }
  const editavel = podeEditar(missao);
  const decidir = aguardaDecisao(missao) && onAprovar && onRecusar;
  const pct = percentualDeEntrega(missao.entregues, missao.total);
  const entrega = missao.caminho === "entrega";
  return (
    <li className="rounded-[20px] border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-full break-words sm:truncate text-[16.5px] font-bold">{missao.titulo}</h3>
            {missao.aprovacao === "pendente" && (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Aguarda você
              </span>
            )}
            {!editavel && (
              <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                {rotuloDaOrigem(origemDe(missao.origem))}
              </span>
            )}
            {missao.perfilAlvo && (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-primary">
                {rotuloDoPerfil(missao.perfilAlvo)}
              </span>
            )}
            {missao.aprovacao === "recusada" && (
              <span className="rounded-full bg-destructive/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-destructive">
                Recusada
              </span>
            )}
            {!missao.ativa && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                Desativada
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {entrega ? missao.topicoNome : missao.criterioRotulo}
          </p>
        </div>
        <div className="flex gap-1.5">
          {editavel && (
            <Button variant="ghost" size="sm" className="rounded-full" onClick={onEditar} aria-label={`Editar ${missao.titulo}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onDuplicar} aria-label={`Duplicar ${missao.titulo}`}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:text-destructive" onClick={onExcluir} aria-label={`Excluir ${missao.titulo}`}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {missao.objetivo && <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{missao.objetivo}</p>}
      {missao.aprovacao === "recusada" && missao.motivoRecusa && (
        <p className="mt-2 text-[12.5px] text-destructive">Motivo da recusa: {missao.motivoRecusa}</p>
      )}
      {!editavel && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">O texto é de quem propôs. Para mudar, duplique: a cópia passa a ser sua.</p>
      )}

      <dl className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Quem cumpre</dt>
          <dd className="mt-1 text-sm font-semibold">{rotuloDoEscopo(missao.escopo)}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Prazo</dt>
          <dd className="mt-1 text-sm font-semibold">{rotuloDoPrazo(missao.prazo)}</dd>
        </div>
        {entrega ? (
          <>
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Nota</dt>
              <dd className="mt-1 text-sm font-semibold">{missao.pontos} pts{missao.moedas > 0 && ` · ${missao.moedas} moedas`}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Entregas</dt>
              <dd className="mt-1 text-sm font-semibold">{resumoDeEntregas(missao.entregues, missao.total)}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Critério</dt>
            <dd className="mt-1 text-sm font-semibold">{missao.criterioRotulo}</dd>
          </div>
        )}
      </dl>

      {decidir && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full font-bold" onClick={onAprovar} disabled={decidindo} aria-label={`Aprovar ${missao.titulo}`}>
            <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Aprovar
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={onRecusar} disabled={decidindo} aria-label={`Recusar ${missao.titulo}`}>
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Recusar
          </Button>
        </div>
      )}

      {entrega && (
        <>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Entregas de ${missao.titulo}: ${pct}%`}
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {missao.topicoId != null && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to={`/console/trilha/${missao.topicoId}/editar`}>
                  <ListChecks className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Editar itens no tópico
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/console/notas">
                <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Corrigir entregas
              </Link>
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

const SELO = "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide";
const ROTULO = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function CartaoDoDesafio({
  missao,
  onAlternar,
  onTrocarPerfis,
  alternando,
  onAprovar,
  onRecusar,
  decidindo,
}: {
  missao: Missao;
  onAlternar?: () => void;
  onTrocarPerfis?: (trocas: TrocaDePerfil[]) => Promise<void>;
  alternando: boolean;
  onAprovar?: () => void;
  onRecusar?: () => void;
  decidindo: boolean;
}) {
  // Dois desafios do mesmo tipo no mesmo conteúdo têm o mesmo título: o resumo é o que os separa.
  const resumo = resumoDoDesafio(missao.desafio);
  const pendente = aguardaDecisao(missao);
  const decidir = pendente && onAprovar && onRecusar;
  return (
    <li className="rounded-[20px] border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-full break-words sm:truncate text-[16.5px] font-bold">{missao.titulo}</h3>
            <span className={`${SELO} bg-violet-500/15 text-violet-700 dark:text-violet-300`}>Desafio</span>
            {pendente && <span className={`${SELO} bg-amber-500/20 text-amber-700 dark:text-amber-400`}>Esperando aprovação</span>}
            {missao.aprovacao === "recusada" && <span className={`${SELO} bg-destructive/15 text-destructive`}>Recusado</span>}
            {!missao.ativa && <span className={`${SELO} bg-muted text-muted-foreground`}>Desativada</span>}
          </div>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{rotuloDoTipoDoDesafio(missao.desafio)}</p>
        </div>
        {onAlternar && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onAlternar}
            disabled={alternando}
            aria-label={`${missao.ativa ? "Desativar" : "Reativar"} ${missao.titulo}`}
          >
            <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {alternando ? "Aguarde…" : missao.ativa ? "Desativar" : "Reativar"}
          </Button>
        )}
      </div>

      {pendente ? (
        <ParaConferir desafio={missao.desafio} resposta={missao.respostaDoDesafio} />
      ) : (
        resumo && <p className="mt-3 line-clamp-2 text-[13px] font-medium">{resumo}</p>
      )}
      {missao.objetivo && <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">{missao.objetivo}</p>}
      {missao.aprovacao === "recusada" && missao.motivoRecusa && (
        <p className="mt-2 text-[12.5px] text-destructive">Motivo da recusa: {missao.motivoRecusa}</p>
      )}
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        {pendente && "Gerado pela IA a partir do conteúdo. Nenhum aluno vê enquanto você não aprovar. "}
        O texto e a resposta são da IA e não se editam. Você pode desativar o desafio ou trocar os perfis; acrescentar perfil ainda não dá.
      </p>

      <dl className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
        <div>
          <dt className={ROTULO}>Quem cumpre</dt>
          <dd className="mt-1 text-sm font-semibold">{rotuloDoEscopo(missao.escopo)}</dd>
        </div>
        <div>
          <dt className={ROTULO}>Prazo</dt>
          <dd className="mt-1 text-sm font-semibold">{rotuloDoPrazo(missao.prazo)}</dd>
        </div>
        <div>
          <dt className={ROTULO}>Recompensa</dt>
          <dd className="mt-1 text-sm font-semibold">Moedas e pontos, para quem acertar</dd>
        </div>
      </dl>

      <PerfisDoDesafio key={missao.linhasDoDesafio.map((l) => `${l.id}:${l.perfilAlvo}`).join(",")} titulo={missao.titulo} linhas={missao.linhasDoDesafio} onTrocar={onTrocarPerfis} />

      {decidir && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full font-bold" onClick={onAprovar} disabled={decidindo} aria-label={`Aprovar ${missao.titulo}`}>
            <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Aprovar
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={onRecusar} disabled={decidindo} aria-label={`Recusar ${missao.titulo}`}>
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Recusar
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * O que o professor confere antes de aprovar: o enunciado inteiro (com as alternativas) ou as
 * pistas, e a resposta lida de `missao_desafio_gabarito`.
 */
function ParaConferir({ desafio, resposta }: { desafio: unknown; resposta: unknown }) {
  const d = desafio && typeof desafio === "object" && !Array.isArray(desafio) ? (desafio as Record<string, unknown>) : null;
  const logica = d?.tipo === "logica";
  const alternativas = logica && Array.isArray(d?.alternativas) ? d.alternativas.filter((a): a is string => typeof a === "string") : [];
  const respostas = respostaDoDesafio(desafio, resposta);
  return (
    <div className="mt-3 space-y-3 rounded-[14px] bg-muted/50 p-3">
      {logica && typeof d?.enunciado === "string" && <p className="whitespace-pre-line text-[13px] font-medium">{d.enunciado}</p>}
      {alternativas.length > 0 && (
        <div>
          <p className={ROTULO}>Alternativas</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {alternativas.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className={ROTULO}>{logica ? "Resposta" : "Respostas da cruzadinha"}</p>
        {respostas.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-[13px] font-semibold">
            {respostas.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[12.5px] text-muted-foreground">Não foi possível ler a resposta agora. Recarregue a página antes de aprovar.</p>
        )}
      </div>
    </div>
  );
}

function PerfisDoDesafio({
  titulo,
  linhas,
  onTrocar,
}: {
  titulo: string;
  linhas: LinhaDoDesafio[];
  onTrocar?: (trocas: TrocaDePerfil[]) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<number, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cancelar = () => {
    setEditando(false);
    setRascunho({});
    setErro(null);
  };

  const salvar = async () => {
    if (!onTrocar) return;
    let trocas: TrocaDePerfil[];
    try {
      trocas = trocasDePerfil(linhas, rascunho);
    } catch (e) {
      setErro((e as Error).message);
      return;
    }
    if (trocas.length === 0) {
      cancelar();
      return;
    }
    setSalvando(true);
    setErro(null);
    // `onTrocar` não rejeita: o erro do banco vira aviso na seção, que recarrega a lista.
    try {
      await onTrocar(trocas);
      cancelar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-4">
      <p className={ROTULO}>Perfis</p>
      {!editando ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {linhas.map((l) => (
            <span key={l.id} className={`${SELO} bg-primary/15 text-primary`}>
              {rotuloDoPerfil(l.perfilAlvo)}
            </span>
          ))}
          {onTrocar && (
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setEditando(true)} aria-label={`Trocar perfis de ${titulo}`}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Trocar perfis
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-1.5 space-y-2">
          {linhas.map((l, i) => (
            <label key={l.id} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="w-16 text-muted-foreground">Perfil {i + 1}</span>
              <select
                value={rascunho[l.id] ?? l.perfilAlvo}
                onChange={(e) => {
                  setRascunho((r) => ({ ...r, [l.id]: e.target.value }));
                  setErro(null);
                }}
                disabled={salvando}
                aria-label={`Perfil ${i + 1} de ${titulo}`}
                className="h-9 rounded-[12px] border bg-background px-2 text-[13px] appearance-auto"
              >
                {opcoesDePerfilDaLinha(linhas, rascunho, l.id).map((p) => (
                  <option key={p} value={p}>
                    {rotuloDoPerfil(p)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="text-[11.5px] text-muted-foreground">
            Cada perfil aparece uma vez. Para trocar dois perfis entre si, passe um deles por um perfil livre primeiro.
          </p>
          {erro && (
            <p role="alert" className="text-xs text-destructive">
              {erro}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-full font-bold" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar perfis"}
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={cancelar} disabled={salvando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
