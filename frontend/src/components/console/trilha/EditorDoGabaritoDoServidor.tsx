// O gabarito de código, numérica e expressão no editor da questão (spec B, PR 4).
//
// Só o formulário: validar e montar é de `montarGabarito`, e gravar é de `useTopicCrud`. A prévia
// do valor e o botão "Conferir" usam o mesmo código da edge que corrige o aluno
// (`conferenciaNoConsole.ts`), então o que confere aqui confere no aluno.

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BlocoDeCodigo } from "@/components/textoRico/BlocoDeCodigo";
import { TextoRico } from "@/components/textoRico/TextoRico";
import {
  carregarMathjs,
  conferirExemploCom,
  previaDoValorCom,
  type ResultadoDoExemplo,
} from "@/lib/conferenciaNoConsole";
import type { MathJs } from "../../../../supabase/functions/questao-conferir-resposta/conferir.ts";

import type { FormatoNoServidor } from "./formatoDaQuestao";
import {
  DIMENSOES,
  FORMULARIO_PADRAO,
  LINGUAGENS,
  MAXIMO_DE_CRITERIOS,
  ehQuimica,
  montarGabarito,
  type FormularioDoGabarito,
} from "./gabaritoDoServidor";

type Props = {
  formato: FormatoNoServidor;
  valor: FormularioDoGabarito | undefined;
  onChange: (valor: FormularioDoGabarito) => void;
  /** Ainda lendo o gabarito salvo: o formulário fica travado para não salvar o padrão por cima. */
  carregando?: boolean;
  classeDoCampo: string;
  classeDoRotulo: string;
};

function useMathjs(ligado: boolean): MathJs | null {
  const [math, setMath] = useState<MathJs | null>(null);
  useEffect(() => {
    if (!ligado || math) return;
    let vivo = true;
    carregarMathjs()
      .then((m) => vivo && setMath(m))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [ligado, math]);
  return math;
}

function textoDoResultado(r: ResultadoDoExemplo): { texto: string; certo: boolean } {
  if ("esperadaInvalida" in r) return { texto: "A conferência não entende o gabarito. Revise o valor esperado.", certo: false };
  if (r.correta) return { texto: "Confere: o aluno acertaria.", certo: true };
  if (r.motivo === "unidade_incompativel") return { texto: "Não confere: a unidade é de outra grandeza.", certo: false };
  if (r.motivo === "expressao_invalida") return { texto: "Não confere: a conferência não consegue ler esta resposta.", certo: false };
  return { texto: "Não confere: o aluno erraria.", certo: false };
}

export function EditorDoGabaritoDoServidor({ formato, valor, onChange, carregando = false, classeDoCampo, classeDoRotulo }: Props) {
  const f = valor ?? FORMULARIO_PADRAO;
  const mudar = (parcial: Partial<FormularioDoGabarito>) => onChange({ ...f, ...parcial });
  const math = useMathjs(formato !== "code");
  const [exemplos, setExemplos] = useState<[string, string]>(["", ""]);
  const montado = useMemo(() => montarGabarito(formato, f), [formato, f]);
  const previaDoValor = formato === "numeric" && math && f.referencia.trim() ? previaDoValorCom(math, f.referencia) : null;
  const quimica = formato === "expression" && ehQuimica(f.referencia);

  return (
    <fieldset disabled={carregando} className="space-y-3 rounded border border-border bg-muted/40 p-3 text-xs">
      <p className="text-muted-foreground">
        O gabarito fica só no servidor: o aluno não o recebe nem depois de responder, a não ser que a questão libere.
      </p>

      {formato === "code" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="gabarito-linguagem" className={classeDoRotulo}>Linguagem</Label>
            <select
              id="gabarito-linguagem"
              value={f.linguagem}
              onChange={(e) => mudar({ linguagem: e.target.value })}
              className={`${classeDoCampo} w-full`}
            >
              <option value="">Não informar</option>
              {LINGUAGENS.map((l) => (
                <option key={l.valor} value={l.valor}>{l.rotulo}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="gabarito-codigo" className={classeDoRotulo}>Código de referência</Label>
            <Textarea
              id="gabarito-codigo"
              value={f.referencia}
              onChange={(e) => mudar({ referencia: e.target.value })}
              spellCheck={false}
              rows={6}
              className={`${classeDoCampo} font-mono text-xs`}
              placeholder="Uma solução correta. A IA compara a do aluno com esta e com os critérios."
            />
            {f.referencia.trim() ? <BlocoDeCodigo codigo={f.referencia} linguagem={f.linguagem || null} /> : null}
          </div>
          <div className="space-y-1">
            <Label className={classeDoRotulo}>Critérios de correção</Label>
            {f.criterios.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={c}
                  aria-label={`Critério ${i + 1}`}
                  onChange={(e) => mudar({ criterios: f.criterios.map((x, j) => (j === i ? e.target.value : x)) })}
                  className={`${classeDoCampo} h-8 text-xs`}
                  placeholder="Ex.: trata a lista vazia"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={`Remover critério ${i + 1}`}
                  onClick={() => mudar({ criterios: f.criterios.filter((_, j) => j !== i) })}
                >
                  <X size={12} />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={f.criterios.length >= MAXIMO_DE_CRITERIOS}
              onClick={() => mudar({ criterios: [...f.criterios, ""] })}
              className="h-7 w-full border border-dashed border-border text-xs"
            >
              <Plus size={12} className="mr-1" /> Adicionar critério
            </Button>
          </div>
        </>
      )}

      {formato === "numeric" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="gabarito-valor" className={classeDoRotulo}>Valor esperado, com a unidade se houver</Label>
            <Input
              id="gabarito-valor"
              value={f.referencia}
              onChange={(e) => mudar({ referencia: e.target.value })}
              className={classeDoCampo}
              placeholder="Ex.: 10 m/s, 9,8 m/s², 1,5 × 10^3"
            />
            {f.referencia.trim() && math ? (
              <p className={previaDoValor ? "text-muted-foreground" : "text-destructive"}>
                {previaDoValor ? `A conferência entende: ${previaDoValor}` : "A conferência não entende este valor."}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="gabarito-tolerancia" className={classeDoRotulo}>
                Tolerância {f.tipoTolerancia === "relativa" ? "(%)" : "(na unidade do valor)"}
              </Label>
              <Input
                id="gabarito-tolerancia"
                inputMode="decimal"
                value={f.tolerancia}
                onChange={(e) => mudar({ tolerancia: e.target.value })}
                className={classeDoCampo}
                placeholder="Padrão: 1%"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gabarito-tipo-tolerancia" className={classeDoRotulo}>Tipo</Label>
              <select
                id="gabarito-tipo-tolerancia"
                value={f.tipoTolerancia}
                onChange={(e) => mudar({ tipoTolerancia: e.target.value === "absoluta" ? "absoluta" : "relativa" })}
                className={`${classeDoCampo} w-full`}
              >
                <option value="relativa">Relativa</option>
                <option value="absoluta">Absoluta</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="gabarito-dimensao" className={classeDoRotulo}>Grandeza (opcional: dá atalhos de unidade no app)</Label>
            <select
              id="gabarito-dimensao"
              value={f.dimensao}
              onChange={(e) => mudar({ dimensao: e.target.value })}
              className={`${classeDoCampo} w-full`}
            >
              <option value="">Nenhuma</option>
              {DIMENSOES.map((d) => (
                <option key={d.valor} value={d.valor}>{d.rotulo}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {formato === "expression" && (
        <>
          <div className="space-y-1">
            <Label htmlFor="gabarito-expressao" className={classeDoRotulo}>Expressão esperada (LaTeX)</Label>
            <Input
              id="gabarito-expressao"
              value={f.referencia}
              onChange={(e) => mudar({ referencia: e.target.value })}
              spellCheck={false}
              className={`${classeDoCampo} font-mono`}
              placeholder="Ex.: \frac{x^{2}}{2} + 3x   ou   \ce{2H2 + O2 -> 2H2O}"
            />
            {f.referencia.trim() ? (
              <div className="rounded border border-border bg-background p-2">
                <TextoRico texto={f.referencia.includes("$") ? f.referencia : `$${f.referencia}$`} formato="rico" />
              </div>
            ) : null}
          </div>
          {quimica ? (
            <p className="text-muted-foreground">
              Equação química: a conferência compara espécies e coeficientes, então variáveis e domínio não valem.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3 space-y-1 sm:col-span-1">
                <Label htmlFor="gabarito-variaveis" className={classeDoRotulo}>Variáveis</Label>
                <Input
                  id="gabarito-variaveis"
                  value={f.variaveis}
                  onChange={(e) => mudar({ variaveis: e.target.value })}
                  className={classeDoCampo}
                  placeholder="x, y (vazio: as da esperada)"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gabarito-dominio-de" className={classeDoRotulo}>Domínio: de</Label>
                <Input id="gabarito-dominio-de" inputMode="decimal" value={f.dominioDe} onChange={(e) => mudar({ dominioDe: e.target.value })} className={classeDoCampo} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gabarito-dominio-ate" className={classeDoRotulo}>até</Label>
                <Input id="gabarito-dominio-ate" inputMode="decimal" value={f.dominioAte} onChange={(e) => mudar({ dominioAte: e.target.value })} className={classeDoCampo} />
              </div>
            </div>
          )}
        </>
      )}

      {formato !== "code" && (
        <div className="space-y-1 border-t border-border pt-3">
          <Label className={classeDoRotulo}>Conferir com respostas de exemplo</Label>
          {exemplos.map((exemplo, i) => {
            const resultado =
              exemplo.trim() && math && montado.ok
                ? textoDoResultado(conferirExemploCom(math, formato, montado.gabarito, exemplo))
                : null;
            return (
              <div key={i} className="space-y-0.5">
                <Input
                  value={exemplo}
                  aria-label={`Resposta de exemplo ${i + 1}`}
                  onChange={(e) => setExemplos((atual) => (i === 0 ? [e.target.value, atual[1]] : [atual[0], e.target.value]))}
                  className={`${classeDoCampo} h-8 text-xs`}
                  placeholder={i === 0 ? "Uma resposta que deve valer" : "Uma que não deve"}
                />
                {resultado ? <p className={resultado.certo ? "text-success" : "text-muted-foreground"}>{resultado.texto}</p> : null}
              </div>
            );
          })}
        </div>
      )}

      {!montado.ok && f.referencia.trim() ? <p className="text-destructive">{montado.erro}</p> : null}
    </fieldset>
  );
}
