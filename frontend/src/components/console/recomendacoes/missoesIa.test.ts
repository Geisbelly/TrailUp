import { describe, expect, it } from "vitest";
import {
  MAX_TENTATIVAS_DO_PEDIDO,
  contarPendentesDaTurma,
  eMigracaoPendente,
  lerLimites,
  mensagemDoPedido,
  opcoesDeQuantidade,
  pedidoMaisRecente,
  podePedir,
  situacaoDoPedido,
  taxaDeAprovacao,
  textoDaTaxa,
  type LimitesDeMissoesIa,
  type PedidoDeMissoesIa,
} from "./missoesIa";

const limites: LimitesDeMissoesIa = { padrao: 3, minimo: 1, maximo: 5, pedidos_por_dia: 3, pedidos_restantes: 2 };
const pedido = (p: Partial<PedidoDeMissoesIa>): PedidoDeMissoesIa => ({
  id: "a",
  classe_id: 10,
  topico_id: null,
  quantidade: 3,
  status: "pendente",
  tentativas: 0,
  gerados: null,
  ultimo_erro: null,
  created_at: "2026-11-02T10:00:00Z",
  finalizado_em: null,
  ...p,
});

describe("lerLimites", () => {
  it("lê o que a RPC devolve", () => {
    expect(lerLimites({ padrao: 3, minimo: 1, maximo: 5, pedidos_por_dia: 3, pedidos_restantes: 2 })).toEqual(limites);
  });
  it("não confia no formato: faixa quebrada ainda deixa pedir e o padrão fica dentro dela", () => {
    expect(lerLimites({ padrao: 99, minimo: 2, maximo: 4, pedidos_por_dia: 0, pedidos_restantes: -3 })).toEqual({
      padrao: 4,
      minimo: 2,
      maximo: 4,
      pedidos_por_dia: 1,
      pedidos_restantes: 0,
    });
    expect(lerLimites({ minimo: 5, maximo: 2 })?.maximo).toBe(5);
  });
  it("resposta que não é objeto vira nulo, sem estourar", () => {
    expect(lerLimites(null)).toBeNull();
    expect(lerLimites("x")).toBeNull();
    expect(lerLimites(undefined)).toBeNull();
  });
});

describe("opcoesDeQuantidade e podePedir", () => {
  it("a faixa inteira, do menor ao maior", () => {
    expect(opcoesDeQuantidade(limites)).toEqual([1, 2, 3, 4, 5]);
    expect(opcoesDeQuantidade({ minimo: 2, maximo: 2 })).toEqual([2]);
    expect(opcoesDeQuantidade({ minimo: 5, maximo: 1 })).toEqual([]);
  });
  it("só pede com limite lido, pedido sobrando e menos pendentes que o teto", () => {
    expect(podePedir(limites, 0)).toBe(true);
    expect(podePedir(limites, 4)).toBe(true);
    expect(podePedir(limites, 5)).toBe(false);
    expect(podePedir({ ...limites, pedidos_restantes: 0 }, 0)).toBe(false);
    expect(podePedir(null, 0)).toBe(false);
  });
});

describe("situacaoDoPedido", () => {
  it("pedido novo está na fila, e isso não é erro (a API pode estar fora do ar)", () => {
    const s = situacaoDoPedido(pedido({}));
    expect(s.tipo).toBe("na_fila");
    expect(s.texto).toMatch(/sair desta tela/);
  });
  it("já tentou e falhou: diz a tentativa, sem despejar o erro técnico", () => {
    const s = situacaoDoPedido(pedido({ tentativas: 2, ultimo_erro: "StructuredOutputError: Traceback ..." }));
    expect(s.tipo).toBe("tentando");
    expect(s.texto).toContain(`tentativa 2 de ${MAX_TENTATIVAS_DO_PEDIDO}`);
    expect(s.texto).not.toMatch(/Traceback|StructuredOutputError/);
  });
  it("a tentativa mostrada nunca passa do máximo", () => {
    expect(situacaoDoPedido(pedido({ tentativas: 9, ultimo_erro: "x" })).texto).toContain(`${MAX_TENTATIVAS_DO_PEDIDO} de ${MAX_TENTATIVAS_DO_PEDIDO}`);
  });
  it("concluído diz quantas, no singular e no plural", () => {
    expect(situacaoDoPedido(pedido({ status: "concluido", gerados: 1 })).texto).toBe("A IA propôs 1 missão. Decida abaixo.");
    expect(situacaoDoPedido(pedido({ status: "concluido", gerados: 3 })).texto).toBe("A IA propôs 3 missões. Decida abaixo.");
  });
  it("falhou diz o motivo quando dá para dizer e convida a pedir de novo", () => {
    const sem = situacaoDoPedido(pedido({ status: "falhou", ultimo_erro: "Nenhum provedor LLM disponivel" }));
    expect(sem.tipo).toBe("falhou");
    expect(sem.texto).toContain("a IA está indisponível agora");
    expect(sem.texto).toContain("pedir de novo");
    expect(situacaoDoPedido(pedido({ status: "falhou", ultimo_erro: "o modelo não trouxe nenhuma proposta válida" })).texto).toContain(
      "nenhuma proposta passou nas regras",
    );
    expect(situacaoDoPedido(pedido({ status: "falhou", ultimo_erro: "coisa estranha" })).texto).not.toContain("(");
  });
});

describe("taxaDeAprovacao", () => {
  it("aprovadas ÷ decididas; pendente não entra", () => {
    const t = taxaDeAprovacao([{ aprovacao: "aprovada" }, { aprovacao: "aprovada" }, { aprovacao: "recusada" }, { aprovacao: "pendente" }]);
    expect(t).toEqual({ aprovadas: 2, decididas: 3, pct: (2 / 3) * 100 });
    expect(textoDaTaxa(t)).toBe("67% das missões da IA aprovadas nos últimos 30 dias (2 de 3)");
  });
  it("nada decidido é sem número, não 0%", () => {
    const t = taxaDeAprovacao([{ aprovacao: "pendente" }]);
    expect(t.pct).toBeNull();
    expect(textoDaTaxa(t)).toBe("Nenhuma missão da IA decidida nos últimos 30 dias");
    expect(taxaDeAprovacao([]).pct).toBeNull();
  });
});

describe("pendentes e pedidos por turma", () => {
  it("conta só as pendentes da turma", () => {
    const linhas = [
      { classe_id: 10, aprovacao: "pendente" },
      { classe_id: 10, aprovacao: "aprovada" },
      { classe_id: 20, aprovacao: "pendente" },
      { classe_id: 10, aprovacao: "pendente" },
    ];
    expect(contarPendentesDaTurma(linhas, 10)).toBe(2);
    expect(contarPendentesDaTurma(linhas, 30)).toBe(0);
  });
  it("o pedido mais recente da turma, com desempate estável", () => {
    const pedidos = [
      pedido({ id: "a", created_at: "2026-11-02T10:00:00Z" }),
      pedido({ id: "c", created_at: "2026-11-02T12:00:00Z" }),
      pedido({ id: "b", created_at: "2026-11-02T12:00:00Z" }),
      pedido({ id: "z", classe_id: 20, created_at: "2026-11-02T13:00:00Z" }),
    ];
    expect(pedidoMaisRecente(pedidos, 10)?.id).toBe("c");
    expect(pedidoMaisRecente(pedidos, 99)).toBeNull();
  });
});

describe("mensagemDoPedido", () => {
  it("usa a mensagem do banco, que já diz o que fazer", () => {
    expect(mensagemDoPedido({ code: "22023", message: "A quantidade vai de 1 a 5." })).toBe("A quantidade vai de 1 a 5.");
    expect(mensagemDoPedido({ code: "54000", message: "Limite de 3 pedidos por dia atingido. Tente amanhã." })).toContain("Tente amanhã");
    expect(mensagemDoPedido({ code: "42501", message: "Turma não encontrada ou sem permissão." })).toContain("sem permissão");
  });
  it("erro que não é do banco vira aviso genérico, sem vazar o técnico", () => {
    expect(mensagemDoPedido({ code: "XX000", message: "connection reset by peer" })).toBe("Não foi possível pedir as sugestões agora. Tente de novo em instantes.");
    expect(mensagemDoPedido(null)).toContain("Não foi possível");
  });
});

describe("eMigracaoPendente", () => {
  it("reconhece função, tabela ou coluna ausente", () => {
    expect(eMigracaoPendente({ code: "42883" })).toBe(true);
    expect(eMigracaoPendente({ code: "PGRST202" })).toBe(true);
    expect(eMigracaoPendente({ code: "PGRST205" })).toBe(true);
    expect(eMigracaoPendente({ message: "Could not find the function public.missao_ia_limites in the schema cache" })).toBe(true);
  });
  it("outro erro não esconde a seção", () => {
    expect(eMigracaoPendente(null)).toBe(false);
    expect(eMigracaoPendente({ code: "42501", message: "permission denied" })).toBe(false);
    expect(eMigracaoPendente({ message: "algo sobre missao_ia_ mas funcionando" })).toBe(false);
  });
});
