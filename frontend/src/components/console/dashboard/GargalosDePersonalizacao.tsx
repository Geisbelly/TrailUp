import { AlertTriangle } from "lucide-react";
import { TEXTO_DO_ESTADO } from "./disponibilidade";
import type { EstadoDosGargalos } from "./useGargalosDePersonalizacao";

/**
 * Gargalos de personalização (#15): por formato do material-base, quantos estão prontos, na fila ou
 * gerando, e quantos falharam. A ação fica na aba Personalizações ("Reprocessar falhas"); aqui o
 * professor só vê onde está travando. Status por texto e ícone, nunca só por cor.
 */
export default function GargalosDePersonalizacao({ estado }: { estado: EstadoDosGargalos }) {
  const { gargalos, carregando, erro } = estado;

  let resumo: string | null = null;
  if (gargalos && gargalos.registros > 0) {
    resumo =
      gargalos.falhas === 0 && gargalos.pendentes === 0
        ? "Nenhum material travado."
        : [
            gargalos.falhas > 0 && `${gargalos.falhas} ${gargalos.falhas === 1 ? "material falhou" : "materiais falharam"}`,
            gargalos.pendentes > 0 &&
              `${gargalos.pendentes} ${gargalos.pendentes === 1 ? "está na fila ou gerando" : "estão na fila ou gerando"}`,
          ]
            .filter(Boolean)
            .join(" e ") + ".";
  }

  return (
    <section aria-labelledby="gargalos-de-personalizacao" className="min-w-0 rounded-[20px] border border-border bg-card px-[26px] py-6">
      <h3 id="gargalos-de-personalizacao" className="text-lg text-foreground">Gargalos de personalização</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Material-base por formato, somando todos os tópicos e perfis da turma. Para tentar de novo, use "Reprocessar
        falhas" na aba Personalizações.
      </p>

      {carregando ? (
        <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>
      ) : erro ? (
        <p className="mt-4 text-sm text-muted-foreground" role="alert">
          {TEXTO_DO_ESTADO.erro}
        </p>
      ) : !gargalos || gargalos.registros === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum material personalizado gerado nesta turma ainda.</p>
      ) : (
        <>
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            {gargalos.falhas > 0 && <AlertTriangle className="h-4 w-4 flex-none" aria-hidden="true" />}
            {resumo}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-left text-[13.5px]">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Formato</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Prontos</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Na fila ou gerando</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Falharam</th>
                </tr>
              </thead>
              <tbody>
                {gargalos.formatos.map((f) => (
                  <tr key={f.formato} className="border-t border-border">
                    <th scope="row" className="px-3 py-2.5 font-semibold text-foreground">{f.rotulo}</th>
                    <td className="px-3 py-2.5 text-foreground">{f.prontos}</td>
                    <td className={`px-3 py-2.5 ${f.pendentes > 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                      {f.pendentes}
                    </td>
                    <td className={`px-3 py-2.5 ${f.falhas > 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                      {f.falhas > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          {f.falhas}
                        </span>
                      ) : (
                        f.falhas
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
