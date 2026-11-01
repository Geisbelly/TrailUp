import { estadoDoCronometro, formatarDuracao, textoDaOrigem, textoDasTentativas } from "./tentativas";
import type { RegraDoCronometro, ResumoDaAtividade } from "./tentativas";
import type { Aluno } from "./tipos";
import { useTentativasDoAluno } from "./useTentativasDoAluno";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function TextoDaRegra({ regra }: { regra: RegraDoCronometro }) {
  if (regra.duracaoSeg === null && regra.faixas.length === 0) {
    return <p className="mt-3 text-[12.5px] text-muted-foreground">A regra do cronômetro ainda não está disponível neste ambiente.</p>;
  }
  return (
    <ul className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-foreground/90">
      {regra.duracaoSeg !== null && (
        <li>
          Cada tentativa cronometrada tem {formatarDuracao(regra.duracaoSeg)}
          {regra.toleranciaSeg ? `, com ${formatarDuracao(regra.toleranciaSeg)} de folga de rede` : ""}, contados pelo relógio do servidor.
        </li>
      )}
      <li>O tempo não muda a nota: a nota é a da última tentativa entregue.</li>
      {regra.faixas.length > 0 && (
        <li>
          Entregar no tempo rende XP, uma vez por atividade:{" "}
          {regra.faixas.map((f) => `${fmt(f.xp)} XP a partir de ${f.minimo}%`).join(", ")}.
        </li>
      )}
    </ul>
  );
}

function CelulaDaNota({ r }: { r: ResumoDaAtividade }) {
  if (!r.ultima) return <span className="text-muted-foreground">—</span>;
  const { pontos, pontosMax, acertos } = r.ultima;
  return (
    <span>
      {pontos !== null && pontosMax !== null ? `${fmt(pontos)}/${fmt(pontosMax)}` : "—"}
      {acertos !== null && <span className="text-muted-foreground"> · {fmt(acertos)}%</span>}
      {r.feitas > 1 && r.primeiraAcertos !== null && (
        <span className="block text-[11px] text-muted-foreground">1ª tentativa: {fmt(r.primeiraAcertos)}%</span>
      )}
    </span>
  );
}

function CelulaDoTempo({ r }: { r: ResumoDaAtividade }) {
  if (!r.ultima) return <span className="text-muted-foreground">{r.emAberto ? "em andamento" : "—"}</span>;
  if (!r.ultima.cronometrada) return <span className="text-muted-foreground">sem cronômetro · {formatarDuracao(r.ultima.duracaoSeg)}</span>;
  return (
    <span>
      {r.ultima.noTempo ? "no tempo" : "fora do tempo"}
      <span className="text-muted-foreground"> · {formatarDuracao(r.ultima.duracaoSeg)}</span>
    </span>
  );
}

export default function AbaTentativas({ aluno }: { aluno: Aluno }) {
  const { dados, carregando, erro } = useTentativasDoAluno(aluno.id, aluno.classe_id);
  const cronometro = estadoDoCronometro(dados.escolha, aluno.perfilDominante);

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando tentativas…</p>;
  if (erro) return <p className="text-sm text-destructive">Não foi possível carregar as tentativas: {erro}</p>;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_2fr]">
      <div className="rounded-[20px] border border-border bg-card px-7 py-[26px]">
        <div className="console-eyebrow">Cronômetro</div>
        <h3 className="mt-2 text-[22px] text-foreground">{cronometro.ligado ? "Ligado" : "Desligado"}</h3>
        <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
          {textoDaOrigem(cronometro.origem)}
          {cronometro.desde ? ` · desde ${new Date(cronometro.desde).toLocaleDateString("pt-BR")}` : ""}
        </p>
        {cronometro.motivo && <p className="mt-2 text-[12.5px] text-foreground/90">Motivo: {cronometro.motivo}</p>}
        <TextoDaRegra regra={dados.regra} />
      </div>

      <div className="min-w-0 rounded-[20px] border border-border bg-card px-7 py-[26px]">
        <h3 className="text-lg text-foreground">Tentativas por atividade</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Da atividade mexida por último para a mais antiga</p>
        {dados.atividades.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">O aluno ainda não começou nenhuma atividade pelo app novo.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-semibold">Atividade</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Tentativas</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Última nota</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Tempo</th>
                  <th scope="col" className="py-2 font-semibold">Bônus</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {dados.atividades.map((r) => (
                  <tr key={r.atividadeId} className="border-b border-border/60 align-top last:border-0">
                    <th scope="row" className="py-2.5 pr-3 font-semibold">{r.titulo}</th>
                    <td className="py-2.5 pr-3">
                      {textoDasTentativas(r.feitas, r.maximo)}
                      {r.maximo !== null && r.feitas >= r.maximo && <span className="block text-[11px] text-muted-foreground">esgotadas</span>}
                    </td>
                    <td className="py-2.5 pr-3"><CelulaDaNota r={r} /></td>
                    <td className="py-2.5 pr-3"><CelulaDoTempo r={r} /></td>
                    <td className="py-2.5">{r.bonusXp > 0 ? `${fmt(r.bonusXp)} XP` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
