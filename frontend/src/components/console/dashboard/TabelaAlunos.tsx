import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filtrarPorBusca } from "./filtros";
import { nomeExibidoDoPerfil } from "./perfilCores";
import { PerfilAvatar, PerfilChip } from "./PerfilVisual";
import { faixaDoAbandono, type FaixaDeAbandono } from "./risco";
import { filtrarPorPerfil, paginar, perfisPresentes, TODOS_OS_PERFIS } from "./tabela";

export type AlunoDaTabela = {
  id: string;
  nome: string;
  email: string;
  classe_id: number;
  classe_nome: string;
  perfilDominante: string;
  notaMedia: number;
  porcentagemConcluida: number;
  acertosPercentual: number;
  abandonoPct?: number | null;
  temNota?: boolean;
  temAcertos?: boolean;
};

const ROTULO_DA_FAIXA: Record<FaixaDeAbandono, { texto: string; cor: string }> = {
  saudavel: { texto: "saudável", cor: "hsl(var(--success))" },
  atencao: { texto: "atenção", cor: "hsl(var(--warning))" },
  critico: { texto: "crítico", cor: "hsl(var(--destructive))" },
};

export default function TabelaAlunos<T extends AlunoDaTabela>({
  alunos,
  mostrarClasse,
  mostrarAbandono,
  onAbrir,
}: {
  alunos: T[];
  mostrarClasse: boolean;
  /** Só quando a view de engajamento trouxe abandono por aluno. */
  mostrarAbandono: boolean;
  onAbrir: (aluno: T) => void;
}) {
  const [busca, setBusca] = useState("");
  const [perfil, setPerfil] = useState(TODOS_OS_PERFIS);
  const [pagina, setPagina] = useState(1);

  const perfis = useMemo(() => perfisPresentes(alunos), [alunos]);
  const filtrados = useMemo(() => filtrarPorPerfil(filtrarPorBusca(alunos, busca), perfil), [alunos, busca, perfil]);
  const pag = paginar(filtrados, pagina);

  useEffect(() => setPagina(1), [alunos, busca, perfil]);
  useEffect(() => {
    if (perfil !== TODOS_OS_PERFIS && !perfis.includes(perfil)) setPerfil(TODOS_OS_PERFIS);
  }, [perfil, perfis]);

  // Pesos do protótipo; a última coluna (botão de abrir) tem largura fixa.
  const pesos = [2.3, ...(mostrarClasse ? [1.2] : []), 1.5, 0.7, 1.5, 0.8, ...(mostrarAbandono ? [0.9] : [])];
  const somaDosPesos = pesos.reduce((a, b) => a + b, 0);
  const larguras = pesos.map((p) => `${((p / somaDosPesos) * 100).toFixed(2)}%`);
  const th = "console-label-sm !text-[11px] px-[7px] py-3 first:pl-[26px] last:pr-[26px]";
  const td = "px-[7px] py-[15px] first:pl-[26px] last:pr-[26px]";

  return (
    <section aria-labelledby="alunos-da-turma" className="overflow-hidden rounded-[20px] border border-border bg-card">
      <div className="flex flex-wrap items-center gap-4 px-[26px] pb-[18px] pt-[22px]">
        <div className="min-w-0">
          <h3 id="alunos-da-turma" className="text-lg text-foreground">Alunos da turma</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Clique em um aluno para abrir o detalhe e a trilha dele</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Buscar aluno por nome ou e-mail"
              placeholder="Buscar por nome ou e-mail…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 text-[13px]"
            />
          </div>
          <Select value={perfil} onValueChange={setPerfil}>
            <SelectTrigger aria-label="Filtrar por perfil" className="w-auto min-w-[160px] gap-2 bg-background text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_OS_PERFIS}>Todos os perfis</SelectItem>
              {perfis.map((p) => (
                <SelectItem key={p} value={p}>
                  {nomeExibidoDoPerfil(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={`w-full ${mostrarAbandono ? "min-w-[900px]" : "min-w-[820px]"} table-fixed border-collapse text-left`}>
          <colgroup>
            {larguras.map((largura, i) => (
              <col key={i} style={{ width: largura }} />
            ))}
            <col style={{ width: 66 }} />
          </colgroup>
          <thead className="bg-muted">
            <tr>
              <th scope="col" className={th}>Aluno</th>
              {mostrarClasse && <th scope="col" className={th}>Turma</th>}
              <th scope="col" className={th}>Perfil dominante</th>
              <th scope="col" className={th}>Nota</th>
              <th scope="col" className={th}>Progresso na trilha</th>
              <th scope="col" className={th}>Acertos</th>
              {mostrarAbandono && <th scope="col" className={th}>Abandono</th>}
              <th scope="col" className={th}><span className="sr-only">Abrir</span></th>
            </tr>
          </thead>
          <tbody>
            {pag.itens.map((aluno) => (
              <tr
                key={`${aluno.id}-${aluno.classe_id}`}
                onClick={() => onAbrir(aluno)}
                className="cursor-pointer border-t border-border transition-colors hover:bg-muted/50 focus-within:bg-muted/50"
              >
                <td className={td}>
                  <div className="flex min-w-0 items-center gap-[13px]">
                    <PerfilAvatar nome={aluno.nome} perfil={aluno.perfilDominante} />
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-semibold text-foreground">{aluno.nome}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{aluno.email}</div>
                    </div>
                  </div>
                </td>
                {mostrarClasse && <td className={`${td} truncate text-[13px] text-muted-foreground`}>{aluno.classe_nome}</td>}
                <td className={td}>
                  <PerfilChip perfil={aluno.perfilDominante} />
                </td>
                <td className={`${td} text-[14.5px] font-bold text-foreground`}>{aluno.temNota === false ? "—" : aluno.notaMedia.toFixed(1)}</td>
                <td className={td}>
                  <div className="flex items-center gap-[9px]">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--border))]" aria-hidden="true">
                      <div
                        className="h-full bg-[hsl(var(--console-violet))]"
                        style={{ width: `${Math.min(100, Math.max(0, aluno.porcentagemConcluida))}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs text-muted-foreground">{aluno.porcentagemConcluida.toFixed(0)}%</span>
                  </div>
                </td>
                <td className={`${td} text-[13.5px] text-foreground`}>{aluno.temAcertos === false ? "—" : `${aluno.acertosPercentual.toFixed(0)}%`}</td>
                {mostrarAbandono && (
                  <td className={td}>
                    {aluno.abandonoPct == null ? (
                      <span className="text-[13.5px] text-muted-foreground">—</span>
                    ) : (
                      <>
                        <div className="text-[13.5px] font-semibold text-foreground">{Math.round(aluno.abandonoPct)}%</div>
                        <div className="mt-0.5 text-[10.5px] font-semibold" style={{ color: ROTULO_DA_FAIXA[faixaDoAbandono(aluno.abandonoPct)].cor }}>
                          {ROTULO_DA_FAIXA[faixaDoAbandono(aluno.abandonoPct)].texto}
                        </div>
                      </>
                    )}
                  </td>
                )}
                <td className={td}>
                  {/* Linha inteira clicável para o mouse; o botão é o caminho do
                      teclado e do leitor de tela, sem quebrar a semântica de tabela. */}
                  <button
                    type="button"
                    aria-label={`Abrir detalhes de ${aluno.nome}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAbrir(aluno);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pag.total === 0 ? (
        <p className="border-t border-border py-8 text-center text-sm text-muted-foreground">Nenhum aluno encontrado com esses filtros.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-[26px] py-[15px] text-[13px] text-muted-foreground">
          <div aria-live="polite">
            Mostrando {pag.primeiro}–{pag.ultimo} de {pag.total} {pag.total === 1 ? "aluno" : "alunos"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pag.pagina <= 1} onClick={() => setPagina(pag.pagina - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={pag.pagina >= pag.totalPaginas} onClick={() => setPagina(pag.pagina + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
