import { CheckSquare } from "lucide-react";
import {
  PERFIS_BRAINHEX,
  type PerfilBrainHex,
  type PropostaDeDesafio,
} from "../../../../supabase/functions/generate-content-ai/desafios.ts";
import { alternarPerfil, gradeDaCruzadinha } from "./desafiosNaRevisao";

/**
 * A terceira lista da fila de sugestões, "Desafios (missão)": o que o professor seleciona vira
 * missão da turma pela RPC `missao_desafio_criar`, ativa na hora, para os perfis marcados.
 *
 * Na v1 só dá para selecionar e mudar os perfis. Resposta, alternativas e palavras não se editam
 * aqui: o que a edge mandou já passou pelas regras da RPC (`normalizarDesafios`), e editar exigiria
 * repetir essa conferência no console.
 */

type Props = {
  desafios: PropostaDeDesafio[];
  selecionados: Set<number>;
  /** Os perfis-alvo de cada proposta, na mesma posição; começam no padrão do tipo. */
  perfis: PerfilBrainHex[][];
  onAlternar: (indice: number) => void;
  onPerfis: (indice: number, perfis: PerfilBrainHex[]) => void;
};

const NOME_DO_PERFIL = (perfil: PerfilBrainHex) => perfil.charAt(0).toUpperCase() + perfil.slice(1);

function rotuloDoTipo(p: PropostaDeDesafio): string {
  if (p.tipo === "cruzadinha") return "Cruzadinha";
  return p.desafio.formato === "multipla" ? "Lógica · múltipla escolha" : "Lógica · resposta curta";
}

function MiniaturaDaGrade({ proposta }: { proposta: Extract<PropostaDeDesafio, { tipo: "cruzadinha" }> }) {
  const grade = gradeDaCruzadinha(proposta.desafio, proposta.resposta);
  return (
    <div
      role="img"
      aria-label={`Grade da cruzadinha, ${proposta.desafio.linhas} por ${proposta.desafio.colunas}`}
      className="inline-grid gap-px rounded border border-border bg-border p-px"
      style={{ gridTemplateColumns: `repeat(${proposta.desafio.colunas}, 0.875rem)` }}
    >
      {grade.flatMap((linha, l) =>
        linha.map((casa, c) => (
          <span
            key={`${l}-${c}`}
            className={`relative flex h-3.5 w-3.5 items-center justify-center text-[8px] font-bold leading-none ${
              casa ? "bg-background text-foreground" : "bg-muted"
            }`}
          >
            {casa?.numero !== undefined && (
              <span className="absolute left-px top-0 text-[5px] font-normal text-muted-foreground">{casa.numero}</span>
            )}
            {casa?.letra}
          </span>
        )),
      )}
    </div>
  );
}

function Resposta({ proposta }: { proposta: PropostaDeDesafio }) {
  if (proposta.tipo === "cruzadinha") {
    return (
      <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
        {proposta.desafio.palavras.map((p) => (
          <li key={`${p.numero}${p.direcao}`}>
            {p.numero} {p.direcao === "h" ? "→" : "↓"} {p.pista}
            {" — "}
            <span className="text-success">{proposta.resposta.palavras[`${p.numero}${p.direcao}`]}</span>
          </li>
        ))}
      </ul>
    );
  }
  const { desafio, resposta } = proposta;
  if (desafio.formato === "multipla") {
    return (
      <p className="mt-1 text-[10px] text-muted-foreground">
        Alternativas: {desafio.alternativas.join(" · ")}
        {" · Resposta: "}
        <span className="text-success">{resposta.aceitas.join(" · ")}</span>
      </p>
    );
  }
  return (
    <p className="mt-1 text-[10px] text-muted-foreground">
      Resposta: <span className="text-success">{resposta.aceitas.join(" · ")}</span>
    </p>
  );
}

export function ListaDeDesafios({ desafios, selecionados, perfis, onAlternar, onPerfis }: Props) {
  if (desafios.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Desafios (missão) ({desafios.length})
      </p>
      <div className="space-y-2">
        {desafios.map((proposta, idx) => {
          const marcado = selecionados.has(idx);
          const perfisDaProposta = perfis[idx] ?? proposta.perfis;
          return (
            <div
              key={idx}
              className={`rounded-lg border p-3 transition-colors ${
                marcado ? "border-warning/40 bg-warning/15" : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={marcado ? "true" : "false"}
                aria-label={`Selecionar ${proposta.titulo}`}
                onClick={() => onAlternar(idx)}
                className="flex w-full items-start gap-3 text-left"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    marcado ? "border-warning bg-warning" : "border-border"
                  }`}
                >
                  {marcado && <CheckSquare className="h-3 w-3 text-foreground" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{proposta.titulo}</span>
                    <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {rotuloDoTipo(proposta)}
                    </span>
                  </span>
                  {proposta.tipo === "logica" && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{proposta.desafio.enunciado}</span>
                  )}
                </span>
              </button>

              <div className="mt-2 pl-7">
                {proposta.tipo === "cruzadinha" && <MiniaturaDaGrade proposta={proposta} />}
                <Resposta proposta={proposta} />
                <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="Perfis que recebem o desafio">
                  <span className="mr-1 text-[10px] text-muted-foreground">Perfis:</span>
                  {PERFIS_BRAINHEX.map((perfil) => {
                    const ligado = perfisDaProposta.includes(perfil);
                    return (
                      <button
                        key={perfil}
                        type="button"
                        aria-pressed={ligado ? "true" : "false"}
                        title={ligado && perfisDaProposta.length === 1 ? "O desafio precisa de pelo menos um perfil." : undefined}
                        onClick={() => onPerfis(idx, alternarPerfil(perfisDaProposta, perfil))}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                          ligado
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >{NOME_DO_PERFIL(perfil)}</button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Recompensa: moedas e pontos de missão, para quem acertar.
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
