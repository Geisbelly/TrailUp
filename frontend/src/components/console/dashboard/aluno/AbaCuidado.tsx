import { textoAntesDepois } from "../guia";
import { textoDaOrigem, textoDaResposta, textoDasAcoes, type MomentoDeCuidado } from "./cuidado";
import type { Aluno } from "./tipos";
import { useCuidadoDoAluno } from "./useCuidadoDoAluno";

const QUANDO = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function quando(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : QUANDO.format(d);
}

const EXPLICACAO =
  "Momentos em que o app tirou a pressão do estudo, porque o uso sugeriu cansaço ou porque o aluno disse ao Guia que não estava bem. " +
  "Você vê o que aconteceu e o que o app fez, nunca o que o aluno escreveu.";

function Momento({ m, topico }: { m: MomentoDeCuidado; topico: string }) {
  const acoes = textoDasAcoes(m.acoes);
  const resposta = textoDaResposta(m.resposta);
  const temAntesDepois = m.tentativas_antes > 0 || m.tentativas_depois > 0;
  return (
    <li className="border-b border-border/60 py-4 last:border-0">
      <p className="text-[12px] font-semibold text-muted-foreground">
        {quando(m.criado_em)} · {topico}
      </p>
      <p className="mt-1 text-[13.5px] text-foreground">{textoDaOrigem(m)}</p>
      {acoes && <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/90">{acoes}</p>}
      {(resposta || temAntesDepois) && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          {resposta}
          {resposta && temAntesDepois ? " · " : ""}
          {temAntesDepois && `Acerto nas tentativas antes → depois: ${textoAntesDepois(m)}`}
        </p>
      )}
    </li>
  );
}

export default function AbaCuidado({ aluno }: { aluno: Aluno }) {
  const { dados, estado } = useCuidadoDoAluno(aluno.id, aluno.classe_id);

  if (estado.tipo === "indisponivel") {
    return (
      <div className="rounded-[20px] border border-border bg-card px-[30px] py-[50px] text-center">
        <h3 className="text-lg text-foreground">Momentos de cuidado ainda não disponíveis</h3>
        <p className="mx-auto mt-3 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
          O banco deste ambiente ainda não tem o registro dos momentos de cuidado. Assim que ele for instalado, eles aparecem aqui.
        </p>
      </div>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <div role="alert" className="rounded-[20px] border border-destructive/50 bg-card p-6 text-sm text-foreground">
        Não foi possível carregar os momentos de cuidado. Detalhe: {estado.detalhe}
      </div>
    );
  }
  if (estado.tipo === "carregando") {
    return (
      <div role="status" aria-live="polite">
        <div className="console-skeleton h-[200px]" />
      </div>
    );
  }
  if (dados.momentos.length === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card px-10 py-16 text-center">
        <p className="text-[15px] text-muted-foreground">Nenhum momento de cuidado foi registrado para este aluno.</p>
        <p className="mx-auto mt-3 max-w-[460px] text-[12.5px] leading-relaxed text-muted-foreground">
          Só aparece aqui quem consentiu com o modo de cuidado. O que o aluno escreveu ao Guia nunca é mostrado.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-border bg-card px-7 py-[26px]">
      <h3 className="text-lg text-foreground">Momentos de cuidado</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{EXPLICACAO}</p>
      <ul className="mt-3">
        {dados.momentos.map((m, i) => (
          <Momento
            key={`${m.criado_em}-${i}`}
            m={m}
            topico={m.topico_id === null ? "Fora de um tópico" : (dados.topicos.get(m.topico_id) ?? "Tópico")}
          />
        ))}
      </ul>
    </div>
  );
}
