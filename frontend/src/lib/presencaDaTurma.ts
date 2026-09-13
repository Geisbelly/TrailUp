// Presenca e participacao presencial concedidas pelo professor.
//
// A concessao em si e uma RPC (`registrar_presenca_da_turma`), que confere no
// banco se a classe e do professor, se o tipo pode ser concedido e se o valor
// faz sentido. Nada aqui substitui essa checagem -- o que este modulo faz e
// montar o pedido e recusar cedo o que o servidor recusaria de qualquer jeito,
// para o professor nao descobrir o erro depois de clicar.

export type TipoConcessao = "presenca_aula" | "participacao_aula";

export interface PedidoDePresenca {
  classeId: number;
  /** `null` significa a turma inteira, resolvida no banco. */
  alunos: string[] | null;
  tipo: TipoConcessao;
  /** `null` usa o padrao guardado em `app_config`. */
  valor: number | null;
  /** `YYYY-MM-DD`. Entra na referencia do evento e deduplica por dia. */
  data: string;
}

export interface EntradaDePresenca {
  classeId: number | null;
  tipo: TipoConcessao;
  /** `null` = turma inteira. Lista vazia e erro, nao turma inteira. */
  alunosSelecionados: string[] | null;
  valor: number | null;
  data: string;
  hoje: string;
}

// Uniao discriminada seria mais expressiva, mas este projeto compila com
// `strictNullChecks: false` e o TypeScript nao estreita `{ok:true}|{ok:false}`
// nessa configuracao -- o `erro` fica inacessivel depois do `if`. Duas chaves
// mutuamente exclusivas funcionam em qualquer configuracao.
export interface ResultadoDoPedido {
  /** `null` quando o pedido e valido. */
  erro: string | null;
  /** `null` quando ha erro. */
  pedido: PedidoDePresenca | null;
}

function recusar(erro: string): ResultadoDoPedido {
  return { erro, pedido: null };
}

export function montarPedidoDePresenca(entrada: EntradaDePresenca): ResultadoDoPedido {
  if (!entrada.classeId) {
    return recusar("Escolha uma turma.");
  }

  if (entrada.alunosSelecionados !== null && entrada.alunosSelecionados.length === 0) {
    // Lista vazia nao pode virar "turma inteira" por engano -- seria o oposto
    // do que o professor pediu.
    return recusar("Selecione ao menos um aluno.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.data)) {
    return recusar("Data invalida.");
  }

  if (entrada.data > entrada.hoje) {
    return recusar("Não dá para registrar presença em aula que ainda não aconteceu.");
  }

  // Participacao e discricionaria por natureza -- no estudo de referencia, o
  // professor atribuia conforme a qualidade da contribuicao. Nao ha padrao
  // razoavel para ela, entao o valor e obrigatorio.
  if (entrada.tipo === "participacao_aula" && (entrada.valor === null || entrada.valor <= 0)) {
    return recusar("Informe quantos pontos vale a participação.");
  }

  if (entrada.valor !== null && entrada.valor <= 0) {
    return recusar("Os pontos precisam ser maiores que zero.");
  }

  return {
    erro: null,
    pedido: {
      classeId: entrada.classeId,
      alunos: entrada.alunosSelecionados,
      tipo: entrada.tipo,
      valor: entrada.valor,
      data: entrada.data,
    },
  };
}

/**
 * O banco ignora quem ja tinha registro naquele dia, entao o numero devolvido
 * pode ser menor que o pedido. Dizer isso evita o professor clicar de novo
 * achando que falhou.
 */
export function descreverResultado(concedidos: number, pedidos: number): string {
  if (concedidos === 0) {
    return pedidos === 1
      ? "Esse aluno já tinha registro nesse dia."
      : "Todos já tinham registro nesse dia.";
  }

  const quem = concedidos === 1 ? "1 aluno registrado" : `${concedidos} alunos registrados`;
  const repetidos = pedidos - concedidos;

  if (repetidos > 0) {
    const jaTinham = repetidos === 1 ? "1 já tinha" : `${repetidos} já tinham`;
    return `${quem}. ${jaTinham} registro nesse dia.`;
  }

  return `${quem}.`;
}

/** Argumentos da RPC, com os nomes que o banco espera. */
export function argumentosDaRpc(pedido: PedidoDePresenca) {
  return {
    p_classe_id: pedido.classeId,
    p_alunos: pedido.alunos,
    p_tipo: pedido.tipo,
    p_valor: pedido.valor,
    p_data: pedido.data,
  };
}

/**
 * O cliente do Supabase so aceita nomes de RPC que estao nos tipos gerados, e
 * `registrar_presenca_da_turma` so entra la depois da migracao rodar. O cast
 * fica aqui, num lugar so, e some quando os tipos forem regerados.
 */
export interface ClienteRpc {
  rpc: (
    nome: string,
    argumentos: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export async function registrarPresenca(
  cliente: ClienteRpc,
  pedido: PedidoDePresenca,
): Promise<{ concedidos: number; erro: string | null }> {
  const { data, error } = await cliente.rpc(
    "registrar_presenca_da_turma",
    argumentosDaRpc(pedido),
  );

  if (error) return { concedidos: 0, erro: error.message };
  return { concedidos: Number(data ?? 0), erro: null };
}
