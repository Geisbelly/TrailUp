import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CONSENTIMENTO_RESPONSAVEL_VERSAO,
  FINALIDADES,
  NENHUMA_FINALIDADE,
  RELACOES,
  hojeEmBrasilia,
  registrarTermoPapel,
  validarTermoPapel,
  type DadosTermoPapel,
  type Finalidade,
  type Relacao,
} from "./termosResponsavel";

const BOTAO =
  "rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/**
 * "Termo do responsável recebido" (#195, caminho C). O professor transcreve o
 * que está ASSINADO no papel: data, nome, relação e cada finalidade marcada.
 * Tudo começa desmarcado — marcar é afirmar que o responsável marcou.
 */
export function FormTermoPapel({
  alunoId,
  nomeDoAluno,
  semDataNascimento,
  onSalvo,
  onCancelar,
}: {
  alunoId: string;
  nomeDoAluno: string;
  semDataNascimento: boolean;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const id = useId();
  const [aceito, setAceito] = useState(true);
  const [dataAssinatura, setDataAssinatura] = useState(hojeEmBrasilia());
  const [nome, setNome] = useState("");
  const [relacao, setRelacao] = useState<Relacao | "">("");
  const [finalidades, setFinalidades] = useState(NENHUMA_FINALIDADE);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const marcar = (chave: Finalidade, valor: boolean) =>
    setFinalidades((prev) => {
      const prox = { ...prev, [chave]: valor };
      if (chave === "camera" && valor) prox.emocional = true;
      if (chave === "emocional" && !valor) prox.camera = false;
      return prox;
    });

  const salvar = async () => {
    const dados: DadosTermoPapel = { alunoId, aceito, dataAssinatura, nome, relacao, finalidades };
    const invalido = validarTermoPapel(dados);
    if (invalido) {
      setErro(invalido);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await registrarTermoPapel(dados);
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar o termo.");
    } finally {
      setSalvando(false);
    }
  };

  const campo = "mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div role="group" aria-labelledby={`${id}-titulo`} className="rounded-[14px] border border-[hsl(var(--console-violet))] bg-card px-[15px] py-[13px]">
      <div id={`${id}-titulo`} className="text-[13.5px] font-semibold text-foreground">
        Termo do responsável recebido — {nomeDoAluno}
      </div>
      <p className="mt-1 text-[11.5px] leading-normal text-muted-foreground">
        Transcreva o termo em papel (versão {CONSENTIMENTO_RESPONSAVEL_VERSAO}). Guarde o papel assinado com a escola.
        {semDataNascimento ? " O aluno ainda precisa informar a data de nascimento no app para sair do modo restrito." : ""}
      </p>

      <fieldset className="mt-3 flex gap-4 text-[13px]">
        <legend className="sr-only">Decisão do responsável</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" name={`${id}-decisao`} checked={aceito} onChange={() => setAceito(true)} /> Autorizou
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name={`${id}-decisao`} checked={!aceito} onChange={() => setAceito(false)} /> Não autorizou / revogou
        </label>
      </fieldset>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[11.5px] font-semibold text-muted-foreground">
          Data da assinatura
          <input type="date" value={dataAssinatura} max={hojeEmBrasilia()} onChange={(e) => setDataAssinatura(e.target.value)} className={campo} />
        </label>
        {aceito && (
          <label className="text-[11.5px] font-semibold text-muted-foreground">
            Relação com o aluno
            <select value={relacao} onChange={(e) => setRelacao(e.target.value as Relacao | "")} className={campo}>
              <option value="">Selecione</option>
              {RELACOES.map((r) => (
                <option key={r.valor} value={r.valor}>{r.rotulo}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {aceito && (
        <>
          <label className="mt-3 block text-[11.5px] font-semibold text-muted-foreground">
            Nome do responsável
            <input type="text" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} className={campo} />
          </label>
          <fieldset className="mt-3">
            <legend className="text-[11.5px] font-semibold text-muted-foreground">Finalidades marcadas no termo</legend>
            <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
              {FINALIDADES.map((f) => (
                <label key={f.chave} className="flex items-center gap-2 text-[13px] text-foreground">
                  <input type="checkbox" checked={finalidades[f.chave]} onChange={(e) => marcar(f.chave, e.target.checked)} />
                  {f.rotulo}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-[12px] text-destructive">
          {erro}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2.5">
        <button type="button" disabled={salvando} onClick={onCancelar} className={cn(BOTAO, "border border-border text-foreground hover:bg-muted")}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => void salvar()}
          className={cn(BOTAO, "bg-[hsl(var(--console-violet))] font-bold text-white hover:opacity-90")}
        >
          {salvando ? "Registrando…" : "Registrar termo"}
        </button>
      </div>
    </div>
  );
}
