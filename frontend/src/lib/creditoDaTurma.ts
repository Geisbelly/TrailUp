// Credito concedido pelo professor: presenca, participacao e ponto extra de
// atividade em sala.
//
// A concessao em si e uma RPC (`registrar_credito_da_turma`), que confere no
// banco se a classe e do professor, se o tipo pode ser concedido, se o valor
// faz sentido e se ele cabe no teto. Nada aqui substitui essa checagem -- o que
// este modulo faz e montar o pedido e recusar cedo o que o servidor recusaria
// de qualquer jeito, para o professor nao descobrir o erro depois de clicar.
//
// Chamava-se `presencaDaTurma` enquanto so havia presenca e participacao. O
// nome passou a mentir quando entrou o ponto extra, e nome que mente ja custou
// caro neste repo.

export type TipoConcessao =
  | "presenca_aula"
  | "participacao_aula"
  | "participacao_extra";

export interface PedidoDeCredito {
  classeId: number;
  /** `null` significa a turma inteira, resolvida no banco. */
  alunos: string[] | null;
  tipo: TipoConcessao;
  /** `null` usa o padrao guardado em `app_config`. */
  valor: number | null;
  /** `YYYY-MM-DD`. Entra na referencia do evento e deduplica por dia. */
  data: string;
  /**
   * Rotulo do credito. Obrigatorio em `participacao_extra`, onde tambem entra
   * na referencia -- e o que separa duas atividades do mesmo dia.
   */
  motivo: string | null;
}

export interface EntradaDeCredito {
  classeId: number | null;
  tipo: TipoConcessao;
  /** `null` = turma inteira. Lista vazia e erro, nao turma inteira. */
  alunosSelecionados: string[] | null;
  valor: number | null;
  data: string;
  hoje: string;
  motivo?: string | null;
  /**
   * Teto de `app_config.credito_extra_maximo`. Opcional: quando o console nao
   * conseguiu ler a configuracao, o banco continua sendo quem recusa.
   */
  tetoDeValor?: number | null;
}

// Uniao discriminada seria mais expressiva, mas este projeto compila com
// `strictNullChecks: false` e o TypeScript nao estreita `{ok:true}|{ok:false}`
// nessa configuracao -- o `erro` fica inacessivel depois do `if`. Duas chaves
// mutuamente exclusivas funcionam em qualquer configuracao.
export interface ResultadoDoPedido {
  /** `null` quando o pedido e valido. */
  erro: string | null;
  /** `null` quando ha erro. */
  pedido: PedidoDeCredito | null;
}

function recusar(erro: string): ResultadoDoPedido {
  return { erro, pedido: null };
}

/** Tipo que o professor atribui caso a caso, sem padrao razoavel. */
export function exigeValor(tipo: TipoConcessao): boolean {
  return tipo === "participacao_aula" || tipo === "participacao_extra";
}

/** Tipo cujo rotulo e parte da identidade do credito. */
export function exigeMotivo(tipo: TipoConcessao): boolean {
  return tipo === "participacao_extra";
}

export function montarPedidoDeCredito(entrada: EntradaDeCredito): ResultadoDoPedido {
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
    return recusar("Não dá para registrar crédito em aula que ainda não aconteceu.");
  }

  const motivo = (entrada.motivo ?? "").trim();

  // O motivo do ponto extra nao e enfeite: ele entra na referencia do evento,
  // e e por ele que duas atividades em sala do mesmo dia nao colidem na
  // deduplicacao. Sem ele, a segunda seria descartada em silencio.
  if (exigeMotivo(entrada.tipo) && motivo === "") {
    return recusar("Diga o que está sendo creditado — o aluno vê esse rótulo.");
  }

  // Participacao e discricionaria por natureza -- no estudo de referencia, o
  // professor atribuia conforme a qualidade da contribuicao. Nao ha padrao
  // razoavel para ela nem para atividade de sala, entao o valor e obrigatorio.
  if (exigeValor(entrada.tipo) && (entrada.valor === null || entrada.valor <= 0)) {
    return recusar(
      entrada.tipo === "participacao_extra"
        ? "Informe quantos pontos vale a atividade."
        : "Informe quantos pontos vale a participação.",
    );
  }

  if (entrada.valor !== null && entrada.valor <= 0) {
    return recusar("Os pontos precisam ser maiores que zero.");
  }

  // `valor` e a coluna que o rank soma: um zero a mais viraria lider de turma.
  // O banco recusa de todo jeito; recusar aqui evita a ida perdida.
  if (
    entrada.tetoDeValor != null &&
    entrada.valor !== null &&
    entrada.valor > entrada.tetoDeValor
  ) {
    return recusar(`O máximo por crédito é ${entrada.tetoDeValor} pontos.`);
  }

  return {
    erro: null,
    pedido: {
      classeId: entrada.classeId,
      alunos: entrada.alunosSelecionados,
      tipo: entrada.tipo,
      valor: entrada.valor,
      data: entrada.data,
      motivo: motivo === "" ? null : motivo,
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
      ? "Esse aluno já tinha esse registro."
      : "Todos já tinham esse registro.";
  }

  const quem = concedidos === 1 ? "1 aluno creditado" : `${concedidos} alunos creditados`;
  const repetidos = pedidos - concedidos;

  if (repetidos > 0) {
    const jaTinham = repetidos === 1 ? "1 já tinha" : `${repetidos} já tinham`;
    return `${quem}. ${jaTinham} esse registro.`;
  }

  return `${quem}.`;
}

/** Argumentos da RPC, com os nomes que o banco espera. */
export function argumentosDaRpc(pedido: PedidoDeCredito) {
  return {
    p_classe_id: pedido.classeId,
    p_alunos: pedido.alunos,
    p_tipo: pedido.tipo,
    p_valor: pedido.valor,
    p_data: pedido.data,
    p_motivo: pedido.motivo,
  };
}

/**
 * O cliente do Supabase so aceita nomes de RPC que estao nos tipos gerados, e
 * `registrar_credito_da_turma` so entra la depois da migracao rodar. O cast
 * fica aqui, num lugar so, e some quando os tipos forem regerados.
 */
export interface ClienteRpc {
  rpc: (
    nome: string,
    argumentos: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export async function registrarCredito(
  cliente: ClienteRpc,
  pedido: PedidoDeCredito,
): Promise<{ concedidos: number; erro: string | null }> {
  const { data, error } = await cliente.rpc(
    "registrar_credito_da_turma",
    argumentosDaRpc(pedido),
  );

  if (error) return { concedidos: 0, erro: error.message };
  return { concedidos: Number(data ?? 0), erro: null };
}

// ---------------------------------------------------------------------------
// Historico
// ---------------------------------------------------------------------------

export interface LinhaDoHistorico {
  id: number;
  aluno_id: string;
  nome_aluno: string | null;
  tipo: string;
  valor: number | null;
  motivo: string | null;
  data_credito: string | null;
}

/** Como o credito aparece no historico. */
export function rotularTipo(tipo: string): string {
  if (tipo === "presenca_aula") return "Presença";
  if (tipo === "participacao_aula") return "Participação";
  if (tipo === "participacao_extra") return "Atividade em sala";
  return tipo;
}

export interface GrupoDoHistorico {
  /** `YYYY-MM-DD`, ou string vazia quando a linha nao trouxe data. */
  data: string;
  tipo: string;
  motivo: string | null;
  /** Soma dos pontos concedidos naquele lote. */
  pontos: number;
  alunos: number;
  nomes: string[];
}

/**
 * Agrupa o historico por lote concedido -- (data, tipo, motivo).
 *
 * Uma concessao vira uma linha POR ALUNO em `eventos_aluno`, entao a turma de
 * 30 alunos gera 30 linhas identicas fora do nome. Listar linha a linha faria
 * o professor rolar trinta itens para ver uma unica chamada de presenca.
 */
export function agruparHistorico(
  linhas: readonly LinhaDoHistorico[],
): GrupoDoHistorico[] {
  const porLote = new Map<string, GrupoDoHistorico>();

  for (const linha of linhas) {
    const data = linha.data_credito ?? "";
    const chave = `${data}|${linha.tipo}|${linha.motivo ?? ""}`;
    const existente = porLote.get(chave);
    const pontos = Number(linha.valor ?? 0);
    const nome = linha.nome_aluno ?? "Aluno";

    if (existente) {
      existente.pontos += Number.isFinite(pontos) ? pontos : 0;
      existente.alunos += 1;
      existente.nomes.push(nome);
      continue;
    }

    porLote.set(chave, {
      data,
      tipo: linha.tipo,
      motivo: linha.motivo,
      pontos: Number.isFinite(pontos) ? pontos : 0,
      alunos: 1,
      nomes: [nome],
    });
  }

  // Mais recente primeiro: o professor quer ver o que acabou de lancar.
  return Array.from(porLote.values()).sort((a, b) => b.data.localeCompare(a.data));
}
