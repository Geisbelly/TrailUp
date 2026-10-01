import { describe, expect, it } from "vitest";
import { formatarTempo, montarJornada, type EventoDoApp, type SessaoDeTopico } from "./jornada";

const TOPICOS = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 100 + n, nome: `Tópico ${n}`, ordem: n }));

let seq = 0;
type Acao =
  | { abre: number }
  | { conclui: number }
  | { responde: number; questao?: number; tentativa?: number; certo: boolean }
  | { concluiTopico: true };

/** Eventos de uma visita ao tópico `n`, a partir de `inicio`, um a cada 10 s. */
function visita(n: number, inicio: string, acoes: Acao[]): EventoDoApp[] {
  const base = new Date(inicio).getTime();
  const ev = (i: number, campos: Partial<EventoDoApp>): EventoDoApp => ({
    id: `e${String(++seq).padStart(4, "0")}`,
    occurred_at: new Date(base + i * 10_000).toISOString(),
    event_name: "topic_open",
    topico_id: 100 + n,
    conteudo_id: null,
    atividade_id: null,
    questao_id: null,
    attempt_number: null,
    is_correct: null,
    ...campos,
  });
  return [
    ev(0, {}),
    ...acoes.map((a, i) =>
      "abre" in a
        ? ev(i + 1, { event_name: "content_open", conteudo_id: a.abre })
        : "conclui" in a
          ? ev(i + 1, { event_name: "content_complete", conteudo_id: a.conclui })
          : "responde" in a
            ? ev(i + 1, {
                event_name: "question_attempt",
                atividade_id: a.responde,
                questao_id: a.questao ?? a.responde + 1000,
                attempt_number: a.tentativa ?? 1,
                is_correct: a.certo,
              })
            : ev(i + 1, { event_name: "topic_complete" }),
    ),
  ];
}

const sessao = (n: number, aberto_em: string, duracao_sec: number): SessaoDeTopico => ({ topico_id: 100 + n, aberto_em, duracao_sec });

// Os 10 passos do protótipo (linhas 891-901): ok, ok, ok, errou, 2ª tentativa,
// ok (parcial), fora de ordem, retorno, ok, abandonou.
const eventosDoPrototipo = [
  ...visita(1, "2026-03-04T19:12:00Z", [{ abre: 1 }, { conclui: 1 }]),
  ...visita(1, "2026-03-04T20:28:00Z", [{ responde: 11, certo: true }, { responde: 12, certo: true }]),
  ...visita(2, "2026-03-07T08:41:00Z", [{ abre: 2 }, { conclui: 2 }]),
  ...visita(2, "2026-03-07T10:02:00Z", [{ responde: 21, certo: false }]),
  ...visita(2, "2026-03-07T11:34:00Z", [{ abre: 2 }, { responde: 21, tentativa: 2, certo: true }]),
  ...visita(3, "2026-03-11T20:05:00Z", [{ abre: 3 }]),
  ...visita(4, "2026-03-12T07:58:00Z", [{ abre: 4 }, { conclui: 4 }]),
  ...visita(3, "2026-03-15T21:14:00Z", [{ conclui: 3 }, { responde: 31, certo: true }]),
  ...visita(5, "2026-03-20T14:32:00Z", [{ responde: 51, certo: true }, { responde: 52, certo: false }, { responde: 52, tentativa: 2, certo: true }]),
  ...visita(6, "2026-03-21T22:40:00Z", [{ abre: 6 }]),
];
const sessoesDoPrototipo = [
  sessao(3, "2026-03-11T20:05:01Z", 60),
  sessao(3, "2026-03-11T20:06:01Z", 60),
  sessao(6, "2026-03-21T22:40:02Z", 180),
];

const jornada = montarJornada({
  eventos: eventosDoPrototipo,
  topicos: TOPICOS,
  sessoes: sessoesDoPrototipo,
  totalAtividades: 10,
  topicosConcluidos: new Set([101, 102, 103, 104, 105]),
  agora: new Date("2026-03-30T12:00:00Z"), // 9 dias depois do último passo
});

describe("montarJornada — casos do protótipo", () => {
  it("classifica os 10 passos como no protótipo", () => {
    expect(jornada.passos.map((p) => p.tipo)).toEqual(["ok", "ok", "ok", "err", "retry", "ok", "skip", "back", "ok", "drop"]);
    expect(jornada.passos.map((p) => p.topicoNumero)).toEqual([1, 1, 2, 2, 2, 3, 4, 3, 5, 6]);
  });

  it("conectores: seguiu / repetiu / pulou / voltou", () => {
    expect(jornada.passos.map((p) => p.conector?.rotulo ?? null)).toEqual([
      null,
      "seguiu",
      "seguiu",
      "seguiu",
      "repetiu",
      "seguiu",
      "pulou p/ 4", // entrou no 4 com o 3 inacabado, e voltou a ele depois
      "voltou p/ 3",
      "pulou p/ 5", // do 3 para o 5 pelo número, sem ser desvio (o 4 já tinha sido feito)
      "seguiu",
    ]);
  });

  it("resumo dos desvios", () => {
    expect(jornada.resumo).toEqual({ retornos: 1, foraDeOrdem: 1, repeticoes: 1, abandonos: 1 });
    expect(jornada.passagensRapidas).toBe(0);
  });

  it("campos do passo: tentativa, refez, visita, tempo e progresso", () => {
    const [, , , errou, repetiu, parcial, , , , abandono] = jornada.passos;
    expect(errou).toMatchObject({ respostas: 1, certas: 0, visitaNoTopico: 2, refez: [] });
    expect(repetiu).toMatchObject({ respostas: 1, certas: 1, visitaNoTopico: 3, refez: [21] });
    expect(repetiu.atividades[0].tentativas[0]).toEqual({ questaoId: 1021, numero: 2, correta: true });
    // Parcial: abriu sem concluir; vira passo pelo tempo registrado (2 min).
    expect(parcial).toMatchObject({ conteudosAbertos: [3], conteudosConcluidos: [], tempoSeg: 120 });
    expect(abandono.tempoSeg).toBe(180);
    // Sem registro em estudo_sessoes, tempo é null (não zero).
    expect(jornada.passos[0].tempoSeg).toBeNull();
    // Progresso: atividades da trilha acertadas até ali (11, 12 → 20%; +21 → 30%...).
    expect(jornada.passos.map((p) => p.progressoPct)).toEqual([0, 20, 20, 20, 30, 30, 30, 40, 60, 60]);
  });

  it("um passo pode ter mais de um desvio; a cor fica com o mais grave", () => {
    const eventos = [
      ...visita(1, "2026-03-01T10:00:00Z", [{ responde: 11, certo: true }]),
      ...visita(2, "2026-03-01T11:00:00Z", [{ responde: 21, certo: true }]),
      ...visita(1, "2026-03-01T12:00:00Z", [{ responde: 11, tentativa: 2, certo: false }]),
    ];
    const j = montarJornada({ eventos, topicos: TOPICOS, sessoes: [], totalAtividades: 4, topicosConcluidos: new Set([101, 102]), agora: new Date("2026-03-02T00:00:00Z") });
    expect(j.passos[2].desvios).toEqual(["back", "retry", "err"]);
    expect(j.passos[2].tipo).toBe("back");
  });
});

describe("montarJornada — regras de montagem", () => {
  it("passagem rápida não vira passo; pausa de 30 min separa visitas do mesmo tópico", () => {
    const eventos = [
      ...visita(1, "2026-03-01T10:00:00Z", []), // só abriu o tópico
      ...visita(1, "2026-03-01T10:20:00Z", [{ responde: 11, certo: true }]), // 20 min depois: mesma visita
      ...visita(2, "2026-03-01T12:00:00Z", [{ abre: 2 }]), // sem estudo
    ];
    const j = montarJornada({ eventos, topicos: TOPICOS, sessoes: [], totalAtividades: 1, topicosConcluidos: new Set(), agora: new Date("2026-03-01T13:00:00Z") });
    expect(j.passos).toHaveLength(1);
    expect(j.passos[0].ref).toBe(`evento:${eventos[0].id}`);
    expect(j.passagensRapidas).toBe(1);
  });

  it("começar fora do primeiro tópico é fora de ordem; último passo recente não é abandono", () => {
    const eventos = visita(3, "2026-03-01T10:00:00Z", [{ responde: 31, certo: true }]);
    const j = montarJornada({ eventos, topicos: TOPICOS, sessoes: [], totalAtividades: 1, topicosConcluidos: new Set(), agora: new Date("2026-03-03T10:00:00Z") });
    expect(j.passos[0].desvios).toEqual(["skip"]);
    expect(j.resumo.abandonos).toBe(0);
  });

  it("ignora evento de tópico que não está na trilha e trilha sem atividade dá progresso null", () => {
    const fora = visita(1, "2026-03-01T10:00:00Z", [{ conclui: 9 }]).map((e) => ({ ...e, topico_id: 999 }));
    const dentro = visita(1, "2026-03-01T11:00:00Z", [{ conclui: 1 }]);
    const j = montarJornada({ eventos: [...fora, ...dentro], topicos: TOPICOS, sessoes: [], totalAtividades: 0, topicosConcluidos: new Set([101]), agora: new Date("2026-03-01T12:00:00Z") });
    expect(j.passos).toHaveLength(1);
    expect(j.passos[0].progressoPct).toBeNull();
    expect(j.passagensRapidas).toBe(0);
  });
});

describe("formatarTempo", () => {
  it("sem registro é traço, não zero", () => {
    expect(formatarTempo(null)).toBe("—");
    expect(formatarTempo(45)).toBe("45 s");
    expect(formatarTempo(360)).toBe("6 min");
    expect(formatarTempo(3900)).toBe("1 h 5 min");
  });
});
