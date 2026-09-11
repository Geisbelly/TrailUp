// src/models/EventoAluno.ts
import { supabase } from '@/database/supabase';
import { construirEscritaDePontos } from '@/services/progressoEscritas';
import { gravarProgresso } from '@/services/progressoOutbox';

/**
 * Classe de domínio para eventos do aluno.
 * Mapeia a tabela public.eventos_aluno.
 */
export class EventoAluno {
  public readonly id: number;
  public aluno_id: string | null;
  public tipo: string;
  public referencia: string | null;
  public valor: number | null;
  public criado_em: string | null;

  private constructor(data: {
    id: number;
    aluno_id: string | null;
    tipo: string;
    referencia: string | null;
    valor: number | null;
    criado_em: string | null;
  }) {
    this.id = data.id;
    this.aluno_id = data.aluno_id;
    this.tipo = data.tipo;
    this.referencia = data.referencia ?? null;
    this.valor = data.valor ?? null;
    this.criado_em = data.criado_em ?? null;
  }

  /** 🔄 Constrói a partir de uma linha do banco */
  static fromRow(row: any): EventoAluno {
    return new EventoAluno({
      id: row.id,
      aluno_id: row.aluno_id,
      tipo: row.tipo,
      referencia: row.referencia,
      valor: row.valor,
      criado_em: row.criado_em,
    });
  }

  /** 🔍 Busca um evento específico por ID */
  static async findById(id: number): Promise<EventoAluno | null> {
    const { data, error } = await supabase
      .from('eventos_aluno')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? EventoAluno.fromRow(data) : null;
  }

  /** 📋 Lista eventos de um aluno */
  static async listByAluno(aluno_id: string, limit = 50): Promise<EventoAluno[]> {
    const { data, error } = await supabase
      .from('eventos_aluno')
      .select('*')
      .eq('aluno_id', aluno_id)
      .order('criado_em', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map(EventoAluno.fromRow);
  }

  /** 🔥 Busca últimos N eventos de um tipo específico */
  static async listByTipo(
    aluno_id: string, 
    tipo: string, 
    limit = 10
  ): Promise<EventoAluno[]> {
    const { data, error } = await supabase
      .from('eventos_aluno')
      .select('*')
      .eq('aluno_id', aluno_id)
      .eq('tipo', tipo)
      .order('criado_em', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map(EventoAluno.fromRow);
  }

  /** 📊 Agrupa eventos por tipo com contagem */
  static async getStatsByAluno(aluno_id: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('eventos_aluno')
      .select('tipo')
      .eq('aluno_id', aluno_id);

    if (error) throw error;

    const stats: Record<string, number> = {};
    for (const row of data ?? []) {
      stats[row.tipo] = (stats[row.tipo] ?? 0) + 1;
    }
    return stats;
  }

  /** ⏱️ Tempo médio entre eventos de um tipo (em minutos) */
  static async getTempoMedioEntre(
    aluno_id: string, 
    tipo: string
  ): Promise<number | null> {
    const eventos = await EventoAluno.listByTipo(aluno_id, tipo, 50);
    if (eventos.length < 2) return null;

    let totalMs = 0;
    for (let i = 1; i < eventos.length; i++) {
      const anterior = new Date(eventos[i].criado_em ?? 0).getTime();
      const atual = new Date(eventos[i - 1].criado_em ?? 0).getTime();
      totalMs += atual - anterior;
    }

    return totalMs / (eventos.length - 1) / 1000 / 60; // minutos
  }

  /**
   * 🆕 Registra um evento de pontuação.
   *
   * Passa pela fila durável: se a rede estiver oscilando ou o sistema matar o
   * app, a escrita fica no disco e sai na próxima abertura. Antes disto o
   * ponto simplesmente não existia -- o aluno fazia o trabalho e o rank não
   * sabia, sem nenhum aviso.
   *
   * Repetir a entrega é seguro porque `construirEscritaDePontos` carimba uma
   * `idempotencia_key` ANTES da primeira tentativa: a segunda bate no índice
   * `eventos_aluno_idempotencia_unico`, devolve 23505, e a fila trata 23505
   * como definitivo -- ou seja, sai da fila em vez de pagar de novo.
   *
   * Não devolve a linha criada (e por isso não se chama mais `create`): quando
   * a escrita é enfileirada, não existe linha ainda. Quem precisa do evento
   * relê a lista -- é o que o `ConquistaRankContext` já faz.
   *
   * `aluno_id` nulo é descartado: evento sem dono não pontua ninguém e só
   * ocuparia a fila até bater no NOT NULL.
   */
  static async registrar(input: {
    aluno_id: string | null;
    tipo: string;
    referencia?: string | number | null;
    valor?: number | null;
  }): Promise<void> {
    if (!input.aluno_id) return;

    await gravarProgresso(
      construirEscritaDePontos({
        alunoId: input.aluno_id,
        tipo: input.tipo,
        referencia: input.referencia ?? null,
        valor: input.valor ?? 0,
      })
    );
  }

  /** 🔢 Contador de eventos por tipo (ex: "atividade_concluida") */
  static async countByTipo(aluno_id: string, tipo: string): Promise<number> {
    const { count, error } = await supabase
      .from('eventos_aluno')
      .select('*', { count: 'exact', head: true })
      .eq('aluno_id', aluno_id)
      .eq('tipo', tipo);

    if (error) throw error;
    return count ?? 0;
  }

  /** 🗑️ Remove evento do banco */
  async delete(): Promise<void> {
    const { error } = await supabase
      .from('eventos_aluno')
      .delete()
      .eq('id', this.id);

    if (error) throw error;
  }

  /** 📦 Serialização JSON */
  toJSON() {
    return {
      id: this.id,
      aluno_id: this.aluno_id,
      tipo: this.tipo,
      referencia: this.referencia,
      valor: this.valor,
      criado_em: this.criado_em,
    };
  }
}
