// src/models/EventoAluno.ts
import { supabase } from '@/database/supabase';
import {
  normalizeEventType,
  normalizeNonNegativeNumber,
  normalizeReferencia,
} from '@/utils/dataValidation';

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

  /** 🆕 Cria e retorna um novo evento */
  static async create(input: {
    aluno_id: string | null;
    tipo: string;
    referencia?: string | number | null;
    valor?: number | null;
  }): Promise<EventoAluno> {
    const tipoNormalizado = normalizeEventType(input.tipo, 'atividade');
    const referenciaNormalizada = normalizeReferencia(input.referencia ?? null);
    const valorNormalizado = normalizeNonNegativeNumber(input.valor ?? 0);

    const { data, error } = await supabase
      .from('eventos_aluno')
      .insert({
        aluno_id: input.aluno_id ?? null,
        tipo: tipoNormalizado,
        referencia: referenciaNormalizada,
        valor: valorNormalizado,
      })
      .select('*')
      .single();

    if (error) throw error;
    return EventoAluno.fromRow(data);
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
