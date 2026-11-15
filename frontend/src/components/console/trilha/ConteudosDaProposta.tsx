import { useMemo, useState } from "react";
import { Check, ChevronDown, Clapperboard, FileText, Layers, ListChecks } from "lucide-react";
import { TextoRico } from "@/components/textoRico/TextoRico";
import type { AiTopico } from "./proposta";
import { conteudosParaRevisao, ehAlternativaCorreta, nomeDoTipoDaAtividade, type ConteudoDaRevisao } from "./revisaoDaProposta";

const ROTULO = "mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function CorpoDoConteudo({ c }: { c: ConteudoDaRevisao }) {
  const ehTexto = c.tipo === "texto";
  return (
    <div className="space-y-4 border-t border-border px-3 pb-3 pt-3">
      <section>
        <p className={ROTULO}><FileText className="h-3.5 w-3.5" aria-hidden="true" />{ehTexto ? "Texto, como o aluno vai ler" : "Endereço"}</p>
        {c.texto.trim() ? (
          ehTexto ? (
            <div className="max-h-80 overflow-auto rounded-[10px] bg-muted/40 px-3 py-2 text-[13px] leading-relaxed">
              <TextoRico texto={c.texto} formato="rico" />
            </div>
          ) : (
            <p className="break-all rounded-[10px] bg-muted/40 px-3 py-2 font-mono text-[12px]">{c.texto}</p>
          )
        ) : (
          <p className="text-[12px] font-semibold text-warning">Sem texto: a IA não escreveu este conteúdo.</p>
        )}
      </section>

      {c.cards.length > 0 && (
        <section>
          <p className={ROTULO}><Layers className="h-3.5 w-3.5" aria-hidden="true" />{plural(c.cards.length, "card", "cards")}</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {c.cards.map((card, i) => (
              <li key={`${card.titulo}-${i}`} className="rounded-[10px] bg-muted/40 px-3 py-2">
                <p className="text-[12.5px] font-semibold">{card.titulo}</p>
                {card.descricao && <p className="mt-0.5 text-[12px] text-muted-foreground">{card.descricao}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.atividades.length > 0 && (
        <section>
          <p className={ROTULO}><ListChecks className="h-3.5 w-3.5" aria-hidden="true" />{plural(c.atividades.length, "atividade", "atividades")}</p>
          <ol className="space-y-2">
            {c.atividades.map((a, i) => {
              const alternativas = (a.alternativas ?? []).filter((x) => String(x ?? "").trim());
              const marcouAlguma = alternativas.some((x) => ehAlternativaCorreta(x, a.resposta_correta));
              return (
                <li key={`${a.enunciado}-${i}`} className="rounded-[10px] bg-muted/40 px-3 py-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">{nomeDoTipoDaAtividade(a.tipo)}</p>
                  <div className="mt-0.5 text-[13px]">
                    <TextoRico texto={a.enunciado} formato="rico" />
                  </div>
                  {alternativas.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {alternativas.map((alt, j) => {
                        const certa = ehAlternativaCorreta(alt, a.resposta_correta);
                        return (
                          <li key={`${alt}-${j}`} className={`flex items-start gap-1.5 text-[12.5px] ${certa ? "font-semibold text-success" : ""}`}>
                            {certa ? <Check className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden="true" /> : <span aria-hidden="true" className="w-3.5 flex-none text-center">·</span>}
                            <span>{alt}{certa && <span className="sr-only"> (resposta certa)</span>}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {a.resposta_correta && !marcouAlguma && (
                    <p className="mt-1.5 text-[12px]">
                      <span className="font-semibold">Resposta esperada: </span>
                      {a.resposta_correta}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {c.midias.length > 0 && (
        <section>
          <p className={ROTULO}><Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />{plural(c.midias.length, "mídia sugerida", "mídias sugeridas")}</p>
          <ul className="space-y-1">
            {c.midias.map((m, i) => (
              <li key={`${m.titulo}-${i}`} className="rounded-[10px] bg-muted/40 px-3 py-2 text-[12.5px]">
                <span className="font-semibold">{m.titulo}</span>
                <span className="text-muted-foreground"> · {m.tipo}</span>
                {m.descricao && <p className="mt-0.5 text-[12px] text-muted-foreground">{m.descricao}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Os conteúdos de um tópico da proposta, cada um abrindo com o texto, os cards e as atividades. */
export function ConteudosDaProposta({ topico }: { topico: AiTopico }) {
  const itens = useMemo(() => conteudosParaRevisao(topico), [topico]);
  // Um aberto por vez: o texto renderizado de vários conteúdos juntos ficaria longo demais.
  const [aberto, setAberto] = useState<string | null>(itens[0]?.chave ?? null);

  if (itens.length === 0) return <p className="text-[12px] text-muted-foreground">Este tópico ainda não tem conteúdo.</p>;

  return (
    <ol className="space-y-1.5" aria-label={`Conteúdos de ${topico.nome}`}>
      {itens.map((c, i) => {
        const estaAberto = aberto === c.chave;
        const painel = `revisao-${topico.ordem}-${i}`;
        return (
          <li key={c.chave} className="rounded-[12px] border border-border bg-card">
            <button
              type="button"
              aria-expanded={estaAberto}
              aria-controls={painel}
              onClick={() => setAberto(estaAberto ? null : c.chave)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{i + 1}. {c.titulo}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {c.tipo} · {plural(c.cards.length, "card", "cards")} · {plural(c.atividades.length, "atividade", "atividades")}
                  {c.midias.length > 0 ? ` · ${plural(c.midias.length, "mídia", "mídias")}` : ""}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 flex-none transition-transform ${estaAberto ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {estaAberto && (
              <div id={painel}>
                <CorpoDoConteudo c={c} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
