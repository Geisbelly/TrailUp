import { describe, expect, it } from "vitest";
import { lerDisponibilidade, type Disponibilidade } from "./disponibilidade";
import { lerPainel, type PainelTecnico } from "./painelTecnico";
import { lerSaudeDosClientes, type SaudeDosClientes } from "./saudeDosClientes";
import { dadoVelho, montarVisaoGeral, totaisDosClientes } from "./visaoGeral";

const AGORA = new Date("2026-11-05T12:00:00Z");
const painel = (extra: Record<string, unknown> = {}) => lerPainel({ gerado_em: "2026-11-05T11:59:30Z", gatilhos: [{ id: "g", titulo: "G", estado: "ok", detalhe: "" }], ...extra }) as PainelTecnico;
const monitor = (extra: Record<string, unknown> = {}) => lerDisponibilidade({ gerado_em: "x", alvos: [{ id: "api", nome: "API", estado: "ok" }], ...extra }) as Disponibilidade;
const clientes = (extra: Record<string, unknown> = {}) => lerSaudeDosClientes({ ...extra }) as SaudeDosClientes;

const montar = (p = painel(), d: Disponibilidade | null = monitor(), c: SaudeDosClientes | null = clientes()) =>
  montarVisaoGeral({ painel: p, disponibilidade: d, clientes: c, disponibilidadeLida: true, clientesLidos: true, agora: AGORA });

describe("montarVisaoGeral", () => {
  it("só diz que está tudo bem quando tudo foi medido e nada acusou", () => {
    const v = montar();
    expect(v.veredito).toBe("ok");
    expect(v.pendencias).toEqual([]);
  });

  it("alvo fora do ar é grave, e o incidente dele não conta de novo", () => {
    const d = monitor({
      alvos: [{ id: "api", nome: "API", estado: "queda", estado_desde: "2026-11-05T11:50:00Z" }],
      incidentes: [{ id: 7, alvo_id: "api", tipo: "queda", inicio: "x", fim: null, minutos: 10 }],
    });
    const v = montar(painel(), d);
    expect(v.veredito).toBe("fora_do_ar");
    expect(v.pendencias.map((p) => p.id)).toEqual(["alvo-api"]);
    expect(v.porAba.disponibilidade).toBe(1);
  });

  it("sinal do banco com incidente aberto entra, e incidente já fechado não", () => {
    const d = monitor({
      incidentes: [
        { id: 1, alvo_id: "banco_espaco", tipo: "degradacao", inicio: "x", fim: null, minutos: 30 },
        { id: 2, alvo_id: "ia", tipo: "degradacao", inicio: "x", fim: "y", minutos: 30 },
      ],
    });
    const v = montar(painel(), d);
    expect(v.veredito).toBe("atencao");
    expect(v.pendencias.map((p) => p.titulo)).toEqual(["Degradação: Espaço do banco"]);
  });

  it("não inventa limiar: chamada com erro sem incidente aberto não vira pendência", () => {
    const v = montar(painel(), monitor({ ia: { chamadas: 10, erros: 1 } }));
    expect(v.veredito).toBe("ok");
  });

  it("sem medição não é ok: gatilho e alvo sem dado viram lacuna", () => {
    const v = montar(painel({ gatilhos: [{ id: "g", titulo: "G", estado: "sem_dado", detalhe: "" }] }), monitor({ alvos: [{ id: "web", nome: "Web", estado: "sem_dado" }] }));
    expect(v.veredito).toBe("sem_certeza");
    expect(v.pendencias.every((p) => p.nivel === "lacuna")).toBe(true);
    expect(v.porAba.geracao).toBe(0); // lacuna não vira contador de alerta
  });

  it("leitura que falhou é lacuna; leitura que ainda não voltou, não", () => {
    expect(montar(painel(), null, null).veredito).toBe("sem_certeza");
    const carregando = montarVisaoGeral({ painel: painel(), disponibilidade: null, clientes: null, disponibilidadeLida: false, clientesLidos: false, agora: AGORA });
    expect(carregando.pendencias).toEqual([]);
  });

  it("junta as invariantes em um item, e erro novo de cliente pede atenção", () => {
    const p = painel({ invariantes: [{ invariante: "I1", ok: false, linhas: 2, rodado_em: "x" }, { invariante: "I2", ok: true, linhas: 0, erro: "boom", rodado_em: "x" }, { invariante: "I3", ok: true, linhas: 0, rodado_em: "x" }] });
    const c = clientes({ erros: [{ superficie: "app", assinatura: "a", tipo: "tela", nome: "TypeError", vezes: 3, pessoas: 2, nova: true }] });
    const v = montar(p, monitor(), c);
    expect(v.pendencias.map((x) => x.titulo)).toEqual(["2 invariantes falhando", "1 erro novo nos clientes"]);
    expect(v.porAba).toMatchObject({ geracao: 1, clientes: 1 });
  });

  it("os graves vêm antes dos demais", () => {
    const p = painel({ fila: { processing_travados: 1 } });
    const d = monitor({ alvos: [{ id: "api", nome: "API", estado: "queda" }] });
    expect(montar(p, d).pendencias.map((x) => x.nivel)).toEqual(["critico", "atencao"]);
  });

  it("dado de 5 minutos atrás não sustenta um ok", () => {
    expect(dadoVelho("2026-11-05T11:56:00Z", AGORA)).toBe(false);
    expect(dadoVelho("2026-11-05T11:55:00Z", AGORA)).toBe(true);
    expect(montar(painel({ gerado_em: "2026-11-05T11:40:00Z" })).veredito).toBe("sem_certeza");
  });
});

it("totaisDosClientes soma as superfícies", () => {
  expect(totaisDosClientes(clientes({ superficies: [{ superficie: "app", sessoes: 5, sessoes_com_erro: 1 }, { superficie: "web", sessoes: 2, sessoes_com_erro: 0 }] }))).toEqual({ sessoes: 7, comErro: 1 });
});
