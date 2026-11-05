// Visão geral do painel técnico: responde "está tudo bem?" e diz onde olhar. Não cria limiar nem refaz
// conta. Quem decide o que é problema é o banco (estado do alvo, incidente aberto, gatilho, invariante);
// aqui só se junta o que ele já disse, sem contar duas vezes o mesmo problema.
import { rotuloDaOrigem, rotuloDoIncidente, type Disponibilidade } from "./disponibilidade";
import { contarAlertas, formatarMinutos, haQuanto, type PainelTecnico } from "./painelTecnico";
import type { SaudeDosClientes } from "./saudeDosClientes";

export type AbaDeDetalhe = "disponibilidade" | "clientes" | "acessos" | "geracao";
export type NivelDaPendencia = "critico" | "atencao" | "lacuna";
export type Veredito = "fora_do_ar" | "atencao" | "sem_certeza" | "ok";

export type Pendencia = { id: string; nivel: NivelDaPendencia; titulo: string; detalhe: string; aba: AbaDeDetalhe };

export type VisaoGeral = { veredito: Veredito; titulo: string; pendencias: Pendencia[]; porAba: Record<AbaDeDetalhe, number> };

/** A partir daqui o dado já não serve para decidir na hora, e a tela precisa avisar (Google SRE: 4 a 5 min). */
export const MINUTOS_PARA_DADO_VELHO = 5;
const FILA_PARADA_MIN = 360; // o mesmo destaque do "pedido mais antigo" na aba de geração

export function dadoVelho(iso: string, agora: Date): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && agora.getTime() - t >= MINUTOS_PARA_DADO_VELHO * 60_000;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function doMonitor(d: Disponibilidade, agora: Date): Pendencia[] {
  const saida: Pendencia[] = [];
  const foraDoAr = new Set(d.alvos.filter((a) => a.estado === "queda").map((a) => a.id));
  for (const a of d.alvos) {
    if (a.estado === "queda") {
      saida.push({ id: `alvo-${a.id}`, nivel: "critico", titulo: `${a.nome} fora do ar`, detalhe: a.estado_desde ? `Caiu ${haQuanto(a.estado_desde, agora)}.` : "Início não registrado.", aba: "disponibilidade" });
    } else if (a.estado === "sem_dado") {
      saida.push({ id: `alvo-${a.id}`, nivel: "lacuna", titulo: `${a.nome} sem medição`, detalhe: `Última sonda: ${haQuanto(a.ultima_sonda_em, agora)}. Sem medição não dá para dizer que está no ar.`, aba: "disponibilidade" });
    }
  }
  // O alvo fora do ar já tem o seu item: repetir o incidente dele seria alertar duas vezes pela mesma causa.
  for (const i of d.incidentes) {
    if (i.fim || foraDoAr.has(i.alvo_id)) continue;
    saida.push({
      id: `incidente-${i.id}`,
      nivel: i.tipo === "queda" ? "critico" : "atencao",
      titulo: `${rotuloDoIncidente(i.tipo)}: ${rotuloDaOrigem(i.alvo_id, d.alvos)}`,
      detalhe: `Aberto há ${formatarMinutos(i.minutos)}.${i.motivo ? ` ${i.motivo}.` : ""}`,
      aba: "disponibilidade",
    });
  }
  if (d.alertas.desistidos > 0) {
    saida.push({ id: "alertas-desistidos", nivel: "atencao", titulo: "Alertas por e-mail não saíram", detalhe: `${plural(d.alertas.desistidos, "alerta foi desistido", "alertas foram desistidos")} depois das tentativas. O aviso pode não estar chegando.`, aba: "disponibilidade" });
  }
  return saida;
}

function daGeracao(p: PainelTecnico): Pendencia[] {
  const saida: Pendencia[] = [];
  if (p.fila.processing_travados > 0) {
    saida.push({ id: "fila-travados", nivel: "atencao", titulo: "Jobs travados na fila", detalhe: `${plural(p.fila.processing_travados, "job está", "jobs estão")} em andamento há mais de 1 hora.`, aba: "geracao" });
  }
  if ((p.fila.pending_mais_antigo_min ?? 0) > FILA_PARADA_MIN) {
    saida.push({ id: "fila-parada", nivel: "atencao", titulo: "Fila sem andar", detalhe: `O pedido mais antigo espera há ${formatarMinutos(p.fila.pending_mais_antigo_min)}.`, aba: "geracao" });
  }
  if (p.atividade.analise_com_erro > 0) {
    saida.push({ id: "analise-erro", nivel: "atencao", titulo: "Análises com erro", detalhe: `${plural(p.atividade.analise_com_erro, "análise está", "análises estão")} com erro na fila.`, aba: "geracao" });
  }
  for (const g of p.gatilhos) {
    if (g.estado === "alerta") saida.push({ id: `gatilho-${g.id}`, nivel: "atencao", titulo: g.titulo, detalhe: g.detalhe, aba: "geracao" });
  }
  const invariantes = p.invariantes.filter((i) => !i.ok || i.erro !== null);
  if (invariantes.length > 0) {
    saida.push({ id: "invariantes", nivel: "atencao", titulo: plural(invariantes.length, "invariante falhando", "invariantes falhando"), detalhe: invariantes.slice(0, 4).map((i) => i.invariante).join(", ") + (invariantes.length > 4 ? ` e mais ${invariantes.length - 4}` : ""), aba: "geracao" });
  }
  const semDado = p.gatilhos.length - contarAlertas(p.gatilhos) - p.gatilhos.filter((g) => g.estado === "ok").length;
  if (semDado > 0) {
    saida.push({ id: "gatilhos-sem-dado", nivel: "lacuna", titulo: plural(semDado, "gatilho sem dado", "gatilhos sem dado"), detalhe: "Ainda não há medida suficiente para dizer se estão dentro do esperado.", aba: "geracao" });
  }
  return saida;
}

function dosClientes(c: SaudeDosClientes): Pendencia[] {
  const novos = c.erros.filter((e) => e.nova);
  if (novos.length === 0) return [];
  const pessoas = novos.reduce((soma, e) => soma + e.pessoas, 0);
  return [{ id: "erros-novos", nivel: "atencao", titulo: plural(novos.length, "erro novo nos clientes", "erros novos nos clientes"), detalhe: `${novos[0].nome ?? "Erro sem nome"}${novos.length > 1 ? " e outros" : ""}. Atingiu ${plural(pessoas, "pessoa", "pessoas")}.`, aba: "clientes" }];
}

const ORDEM: Record<NivelDaPendencia, number> = { critico: 0, atencao: 1, lacuna: 2 };

export function montarVisaoGeral(entrada: {
  painel: PainelTecnico;
  disponibilidade: Disponibilidade | null;
  clientes: SaudeDosClientes | null;
  /** Falso enquanto a primeira leitura não voltou: carregando não é falta de dado. */
  disponibilidadeLida: boolean;
  clientesLidos: boolean;
  agora: Date;
}): VisaoGeral {
  const { painel, disponibilidade, clientes, disponibilidadeLida, clientesLidos, agora } = entrada;
  const pendencias: Pendencia[] = [...daGeracao(painel)];
  if (disponibilidade) pendencias.push(...doMonitor(disponibilidade, agora));
  else if (disponibilidadeLida) pendencias.push({ id: "monitor-sem-leitura", nivel: "lacuna", titulo: "Monitor sem leitura", detalhe: "Não foi possível ler as sondas. O estado dos serviços é desconhecido.", aba: "disponibilidade" });
  if (clientes) pendencias.push(...dosClientes(clientes));
  else if (clientesLidos) pendencias.push({ id: "clientes-sem-leitura", nivel: "lacuna", titulo: "Clientes sem leitura", detalhe: "Não foi possível ler os erros vistos nos clientes.", aba: "clientes" });
  if (painel.gerado_em && dadoVelho(painel.gerado_em, agora)) {
    pendencias.push({ id: "dado-velho", nivel: "lacuna", titulo: "Dados desatualizados", detalhe: `Última leitura ${haQuanto(painel.gerado_em, agora)}. O estado pode ter mudado.`, aba: "geracao" });
  }
  pendencias.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);

  const porAba: Record<AbaDeDetalhe, number> = { disponibilidade: 0, clientes: 0, acessos: 0, geracao: 0 };
  pendencias.forEach((p) => {
    if (p.nivel !== "lacuna") porAba[p.aba] += 1;
  });

  const conta = (n: NivelDaPendencia) => pendencias.filter((p) => p.nivel === n).length;
  if (conta("critico") > 0) return { veredito: "fora_do_ar", titulo: plural(conta("critico"), "problema grave agora", "problemas graves agora"), pendencias, porAba };
  if (conta("atencao") > 0) return { veredito: "atencao", titulo: `No ar, com ${plural(conta("atencao"), "ponto", "pontos")} de atenção`, pendencias, porAba };
  if (conta("lacuna") > 0) return { veredito: "sem_certeza", titulo: `Nada em alerta, mas ${plural(conta("lacuna"), "ponto está", "pontos estão")} sem dado`, pendencias, porAba };
  return { veredito: "ok", titulo: "Tudo dentro do esperado", pendencias, porAba };
}

export function totaisDosClientes(c: SaudeDosClientes): { sessoes: number; comErro: number } {
  return c.superficies.reduce((t, s) => ({ sessoes: t.sessoes + s.sessoes, comErro: t.comErro + s.sessoes_com_erro }), { sessoes: 0, comErro: 0 });
}
