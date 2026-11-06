import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, ListOrdered } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSugestaoAluno, type SugestaoAlunoResponse } from "./personalizacoesApi";
import {
  dadosDaEvidencia,
  formatarFracao,
  formatarPercentual,
  historicoMaisRecentePrimeiro,
  leiturasDeEfetividade,
  rotuloDaAcao,
  rotuloDaConfianca,
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

// Hipótese em warning de propósito: é o peso por perfil, e sem o destaque o
// professor o leria como recomendação comprovada.
const CORES_DA_CONFIANCA: Record<string, string> = {
  forte: "border-success/40 text-success",
  moderada: "border-info/40 text-info",
  hipotese: "border-warning/40 text-warning",
  dado_do_aluno: "border-border text-foreground",
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

            {/* Por que essa ordem (#66): a regra, a confiança dela e os
                números do aluno. Sugestão anterior à #66 não tem evidências e
                cai nos motivos em texto. */}
            {ordem.some(
              (item) => (item.evidencias?.length ?? 0) > 0 || item.motivos.length > 0
            ) && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Por quê</p>
                <ul className="space-y-3">
                  {ordem
                    .filter(
                      (item) =>
                        (item.evidencias?.length ?? 0) > 0 || item.motivos.length > 0
                    )
                    .map((item) => (
                      <li key={`porque-${item.formato}`} className="space-y-1.5 text-xs">
                        <strong className="text-sm text-foreground">
                          {item.posicao}º {rotuloDoFormato(item.formato)}
                        </strong>
                        {item.evidencias?.length ? (
                          <ul className="space-y-1.5">
                            {item.evidencias.map((evidencia, indice) => {
                              const dadosLegiveis = dadosDaEvidencia(evidencia);
                              return (
                                <li
                                  key={`${item.formato}-${evidencia.regra}-${indice}`}
                                  className="rounded-md border border-border/60 p-2"
                                >
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge
                                      variant="outline"
                                      className={`font-normal ${
                                        CORES_DA_CONFIANCA[evidencia.confianca] ??
                                        "border-border"
                                      }`}
                                    >
                                      {rotuloDaConfianca(evidencia.confianca)}
                                    </Badge>
                                    {evidencia.fontes.length > 0 && (
                                      <span className="text-muted-foreground">
                                        {evidencia.fontes.join(", ")}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-foreground">{evidencia.enunciado}</p>
                                  {dadosLegiveis.length > 0 && (
                                    <p className="mt-0.5 text-muted-foreground">
                                      {dadosLegiveis.join(" · ")}
                                    </p>
                                  )}
                                  {evidencia.referencias_rag?.length ? (
                                    <ul className="mt-1 text-muted-foreground">
                                      {evidencia.referencias_rag.map((referencia) => (
                                        <li
                                          key={`${referencia.regra}-${referencia.fontes.join("-")}`}
                                        >
                                          Evidência curada {referencia.regra}
                                          {referencia.fontes.length > 0
                                            ? ` · ${referencia.fontes.join(", ")}`
                                            : ""}
                                          {referencia.confianca
                                            ? ` · confiança ${referencia.confianca}`
                                            : ""}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">{item.motivos.join("; ")}</p>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
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
