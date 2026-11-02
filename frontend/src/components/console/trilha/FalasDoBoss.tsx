import { useState } from "react";
import { toast } from "sonner";
import { lerMomentos, resumoDasFalas, rotuloDoPerfil, totalDeFalas, type FalaDoBoss } from "./bossFalas";
import { useFalasDoBoss } from "./useFalasDoBoss";

function LinhaDoPerfil({ fala, onAlterar }: { fala: FalaDoBoss; onAlterar: (ativa: boolean) => Promise<void> }) {
  const [salvando, setSalvando] = useState(false);
  const momentos = lerMomentos(fala.falas);
  const rotulo = rotuloDoPerfil(fala.perfil);

  const alterar = async (ativa: boolean) => {
    setSalvando(true);
    try {
      await onAlterar(ativa);
    } catch {
      toast.error("Não foi possível alterar esta fala. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <li className={`rounded-lg border p-3 ${fala.ativa ? "border-slate-700 bg-slate-900" : "border-amber-700/60 bg-slate-900/60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">{rotulo}</p>
          <p className="truncate text-sm font-semibold text-slate-100">{fala.nome}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
          <input
            type="checkbox"
            checked={fala.ativa}
            disabled={salvando}
            onChange={(e) => void alterar(e.target.checked)}
            aria-label={`Mostrar as falas de ${rotulo} aos alunos`}
            className="h-4 w-4 accent-violet-400"
          />
          {fala.ativa ? "Mostrando aos alunos" : "Desligada"}
        </label>
      </div>
      {!fala.ativa && (
        <p className="mt-2 text-xs text-amber-200">
          Os alunos deste perfil ouvem as falas fixas do app. Se a IA gerar um texto novo para este conteúdo, ela volta a ser mostrada.
        </p>
      )}
      <details className="mt-2 text-xs text-slate-300">
        <summary className="w-fit cursor-pointer rounded-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          Ler as {totalDeFalas(fala.falas)} falas
        </summary>
        <dl className="mt-2 space-y-2">
          {momentos.map((m) => (
            <div key={m.chave}>
              <dt className="font-semibold text-slate-200">{m.rotulo}</dt>
              <dd>
                <ul className="list-disc space-y-0.5 pl-5">
                  {m.falas.map((texto, i) => (
                    <li key={i}>{texto}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </li>
  );
}

/**
 * O que o boss deste conteúdo diz ao aluno, por perfil. A IA gera em lote quando a turma é gerada e o
 * aluno ouve direto; aqui o professor lê e pode desligar (o aluno volta às falas fixas). Só aparece
 * para conteúdo já salvo e some quando a migration 20261102_19 ainda não foi aplicada.
 */
export default function FalasDoBoss({ conteudoId }: { conteudoId: number | null }) {
  const { linhas, estado, definirAtiva } = useFalasDoBoss(conteudoId);
  if (conteudoId === null || estado.tipo === "indisponivel") return null;

  const resumo = resumoDasFalas(linhas);
  return (
    <section aria-labelledby={`falas-boss-${conteudoId}`} className="space-y-3 rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100">
      <div>
        <h3 id={`falas-boss-${conteudoId}`} className="px-0 font-semibold">
          Falas do boss geradas pela IA
        </h3>
        <p className="mt-1 text-xs text-slate-300">
          É o que o aluno ouve na batalha deste conteúdo, escrito pela IA no tom de cada perfil. Leia e desligue o que não quiser mostrar; nome e texto não são editáveis aqui.
        </p>
      </div>
      {estado.tipo === "carregando" ? (
        <div role="status" aria-live="polite" className="console-skeleton h-[64px]" />
      ) : estado.tipo === "erro" ? (
        <p role="alert" className="text-xs text-red-300">
          Não foi possível carregar as falas do boss. Detalhe: {estado.detalhe}
        </p>
      ) : resumo.total === 0 ? (
        <p className="text-xs text-slate-300">
          Ainda não há falas geradas para este conteúdo. Elas aparecem aqui depois que a geração da turma roda, para os perfis que têm batalha: Sobrevivente, Aventureiro e Conquistador.
        </p>
      ) : (
        <>
          {resumo.desligadas > 0 && (
            <p className="text-xs text-amber-200">
              {resumo.desligadas === 1 ? "1 perfil está com as falas desligadas." : `${resumo.desligadas} perfis estão com as falas desligadas.`}
            </p>
          )}
          <ul className="space-y-2">
            {linhas.map((l) => (
              <LinhaDoPerfil key={l.id} fala={l} onAlterar={(ativa) => definirAtiva(l.id, ativa)} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
