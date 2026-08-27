import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, ListOrdered } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSugestaoAluno, type SugestaoAlunoResponse } from "./personalizacoesApi";
import {
  formatarFracao,
  formatarPercentual,
  historicoMaisRecentePrimeiro,
  leiturasDeEfetividade,
  rotuloDaAcao,
  rotuloDoFormato,
} from "./sugestaoDisplay";

type Props = {
  alunoId: string;
  topicoId?: number;
  resolveToken: () => Promise<string>;
};

const CORES_DA_ACAO: Record<string, string> = {
  criada: "border-info/40 text-info",
  revisada: "border-warning/40 text-warning",
  mantida: "border-border text-muted-foreground",
};

/**
 * Ordem aconselhada de material do aluno, com o histórico das decisões e a
 * efetividade delas.
 *
 * O histórico inclui as decisões "mantida" de propósito: sem elas não há como
 * distinguir um motor estável de um motor que nunca rodou, e o professor ficaria
 * sem saber se o silêncio é bom sinal ou falha.
 */
export function SugestaoMaterialCard({ alunoId, topicoId, resolveToken }: Props) {
  const [dados, setDados] = useState<SugestaoAlunoResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const token = await resolveToken();
      setDados(await fetchSugestaoAluno(token, { alunoId, topicoId }));
    } catch (causa) {
      setDados(null);
      setErro(causa instanceof Error ? causa.message : String(causa));
    } finally {
      setCarregando(false);
    }
  }, [alunoId, resolveToken, topicoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const historico = historicoMaisRecentePrimeiro(dados?.historico);
  const leituras = leiturasDeEfetividade(dados?.efetividade);
  const ordem = dados?.atual?.ordem ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="h-4 w-4" aria-hidden="true" />
          Sugestão de material
          {dados?.atual && (
            <Badge variant="outline" className="font-normal">
              versão {dados.atual.versao}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Ordem <strong>aconselhada</strong> de consumo, calculada pelo perfil e pelas preferências
          do aluno e revisada pela telemetria. O aluno segue livre para abrir qualquer formato — é
          essa liberdade que permite medir se a sugestão ajudou.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {carregando && !dados ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando sugestão...
          </p>
        ) : erro ? (
          <p className="text-sm text-destructive" role="alert">
            {erro}
          </p>
        ) : (
          <>
            {/* Ordem atual */}
            {ordem.length > 0 ? (
              <ol className="flex flex-wrap items-center gap-2">
                {ordem.map((item, indice) => (
                  <li key={`${item.formato}-${item.posicao}`} className="flex items-center gap-2">
                    <span className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm">
                      <span className="mr-1.5 text-xs text-muted-foreground">{item.posicao}º</span>
                      {rotuloDoFormato(item.formato)}
                    </span>
                    {indice < ordem.length - 1 && (
                      <ArrowRight
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {topicoId == null
                  ? "Selecione um tópico para ver a ordem aconselhada deste aluno."
                  : "Ainda não há sugestão para este tópico — ela é criada quando o aluno abre o material."}
              </p>
            )}

            {/* Por que essa ordem */}
            {ordem.some((item) => item.motivos.length > 0) && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {ordem
                  .filter((item) => item.motivos.length > 0)
                  .map((item) => (
                    <li key={`motivo-${item.formato}`}>
                      <strong className="text-foreground">{rotuloDoFormato(item.formato)}:</strong>{" "}
                      {item.motivos.join("; ")}
                    </li>
                  ))}
              </ul>
            )}

            {/* Efetividade */}
            <div className="grid gap-3 sm:grid-cols-2">
              {leituras.map((leitura) => (
                <div key={leitura.rotulo} className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">{leitura.rotulo}</p>
                  <p className="text-lg font-semibold text-foreground">{leitura.valor}</p>
                  {/* A ressalva anda junto do numero: sem ela, "duas observacoes"
                      passaria por conclusao, e e o erro que o professor nao tem
                      como detectar sozinho. */}
                  {leitura.ressalva && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-warning">
                      <AlertTriangle
                        className="mt-0.5 h-3 w-3 shrink-0"
                        aria-hidden="true"
                      />
                      {leitura.ressalva}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Historico */}
            {historico.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Histórico de decisões ({historico.length})
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Versão</th>
                        <th className="py-2 pr-3 font-medium">Decisão</th>
                        <th className="py-2 pr-3 font-medium">Aconselhado</th>
                        <th className="py-2 pr-3 font-medium">Abriu nesta ordem</th>
                        <th className="py-2 pr-3 font-medium">Aderência</th>
                        <th className="py-2 font-medium">Desempenho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.map((linha) => (
                        <tr
                          key={`${linha.topico_id}-${linha.versao}-${linha.acao}`}
                          className="border-b border-border/60 last:border-0"
                        >
                          <td className="py-2 pr-3 text-muted-foreground">{linha.versao}</td>
                          <td className="py-2 pr-3">
                            <Badge
                              variant="outline"
                              className={`font-normal ${
                                CORES_DA_ACAO[linha.acao] ?? "border-border"
                              }`}
                            >
                              {rotuloDaAcao(linha.acao)}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {linha.ordem_sugerida.map(rotuloDoFormato).join(" → ") || "—"}
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {linha.ordem_observada.map(rotuloDoFormato).join(" → ") || "—"}
                          </td>
                          <td className="py-2 pr-3">{formatarFracao(linha.aderencia)}</td>
                          <td className="py-2">{formatarPercentual(linha.desempenho)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
