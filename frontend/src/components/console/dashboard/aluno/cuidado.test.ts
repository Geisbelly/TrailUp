import { describe, expect, it } from "vitest";
import { normalizarMomento, rpcAusente, textoDaOrigem, textoDaResposta, textoDasAcoes, textoDosFatos } from "./cuidado";

const PROIBIDAS = /ansiedade|ansios|crise|estresse|estressad|n[ií]vel|risco|desconforto/i;

describe("textos dos momentos de cuidado", () => {
  it("origem e ações viram as frases da spec", () => {
    expect(textoDaOrigem({ origem: "aluno_disse", fatos: {} })).toBe("O aluno disse ao Guia que não estava bem");
    expect(textoDaOrigem({ origem: "sinais_de_uso", fatos: { erros_seguidos: 6, minutos_sem_parar: 52 } })).toBe(
      "Sinais de uso: 6 erros seguidos, 52 min sem parar",
    );
    expect(textoDosFatos({ abandonos: 1 })).toBe("1 atividade largada sem concluir");
    expect(textoDasAcoes({ pausa_sugerida: true, cronometro_desligado: true, tecnica_oferecida: true })).toBe(
      "O app sugeriu uma pausa, desligou o cronômetro e ofereceu uma técnica de calma.",
    );
    expect(textoDasAcoes({ pausa_sugerida: true, tecnica_oferecida: true, cvv_indicado: true })).toBe(
      "O app sugeriu uma pausa e ofereceu uma técnica de calma, e o Guia indicou o CVV 188.",
    );
    expect(textoDasAcoes({ cvv_indicado: true })).toBe("O Guia indicou o CVV 188.");
    expect(textoDasAcoes({ pausa_sugerida: false })).toBe("");
    expect(textoDaResposta("pausou")).toBe("Fez a pausa");
    expect(textoDaResposta("continuou")).toBe("Preferiu continuar");
    expect(textoDaResposta(null)).toBe("");
  });

  it("nenhuma frase contém ansiedade, crise, estresse nem nível", () => {
    const acoes = ["pausa_sugerida", "cronometro_desligado", "tecnica_oferecida", "cvv_indicado"];
    const saidas: string[] = [];
    for (let mascara = 0; mascara < 1 << acoes.length; mascara++) {
      saidas.push(textoDasAcoes(Object.fromEntries(acoes.map((a, i) => [a, Boolean(mascara & (1 << i))]))));
    }
    for (const origem of ["aluno_disse", "sinais_de_uso"] as const) {
      saidas.push(textoDaOrigem({ origem, fatos: { erros_seguidos: 5, minutos_sem_parar: 50, abandonos: 2 } }));
    }
    saidas.push(textoDaResposta("pausou"), textoDaResposta("continuou"));
    for (const s of saidas) expect(s).not.toMatch(PROIBIDAS);
  });

  it("normaliza a linha da RPC e ignora o que não é fato nem ação", () => {
    const m = normalizarMomento({
      criado_em: "2026-11-20T15:00:00Z",
      topico_id: "10",
      origem: "aluno_disse",
      fatos: { erros_seguidos: "6" },
      acoes: { cvv_indicado: true, pausa_sugerida: "sim" },
      resposta: "outra",
      tentativas_antes: 2,
      acerto_antes_pct: "40.5",
      tentativas_depois: 0,
      acerto_depois_pct: null,
      nivel: "risco",
    });
    expect(m).toEqual({
      criado_em: "2026-11-20T15:00:00Z",
      topico_id: 10,
      origem: "aluno_disse",
      fatos: { erros_seguidos: 6 },
      acoes: { cvv_indicado: true, pausa_sugerida: false },
      resposta: null,
      tentativas_antes: 2,
      acerto_antes_pct: 40.5,
      tentativas_depois: 0,
      acerto_depois_pct: null,
    });
    expect("nivel" in m).toBe(false);
  });

  it("função ausente no banco é 'indisponível', não erro", () => {
    expect(rpcAusente({ code: "42883", message: "x" })).toBe(true);
    expect(rpcAusente({ code: "PGRST202", message: "Could not find the function public.cuidado_da_turma" })).toBe(true);
    expect(rpcAusente({ code: "42501", message: "turma nao e sua" })).toBe(false);
    expect(rpcAusente(null)).toBe(false);
  });
});
