import { supabase } from '@/database/supabase';

/**
 * Modelo POO de Notificação.
 * Representa uma linha da tabela `public.notificacoes`.
 */
export class Notificacao {
  public readonly id: number;
  public aluno_id: string | null;
  public titulo: string;
  public corpo: string;
  public tipo: string | null;
  public horario_envio: string | null;
  public status: string;
  public read: boolean;
  public created_at: string | null;

  private constructor(data: {
    id: number;
    aluno_id: string | null;
    titulo: string;
    corpo: string;
    tipo: string | null;
    horario_envio: string | null;
    status: string;
    read: boolean;
    created_at: string | null;
  }) {
    this.id = data.id;
    this.aluno_id = data.aluno_id ?? null;
    this.titulo = data.titulo;
    this.corpo = data.corpo;
    this.tipo = data.tipo ?? null;
    this.horario_envio = data.horario_envio ?? null;
    this.status = data.status ?? 'enviada';
    this.read = data.read;
    this.created_at = data.created_at ?? null;
  }

  /** 🔄 Constrói a partir de uma linha do banco */
  static fromRow(row: any): Notificacao {
    return new Notificacao({
      id: row.id,
      aluno_id: row.aluno_id,
      titulo: row.titulo,
      corpo: row.corpo,
      tipo: row.tipo,
      horario_envio: row.horario_envio,
      status: row.status,
      read:row.read,
      created_at: row.created_at,
    });
  }

  /** 🔍 Busca uma notificação por ID */
  static async findById(id: number): Promise<Notificacao | null> {
    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? Notificacao.fromRow(data) : null;
  }

  /** 📋 Lista notificações de um aluno */
  static async listByAluno(aluno_id: string, limit = 20): Promise<Notificacao[]> {
    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('aluno_id', aluno_id)
      .order('horario_envio', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map(Notificacao.fromRow);
  }

  /** ✉️ Cria uma nova notificação */
  static async create(input: {
    aluno_id: string | null;
    titulo: string;
    corpo: string;
    tipo?: string | null;
    horario_envio?: string | null;
    status?: string;
  }): Promise<Notificacao> {
    const { data, error } = await supabase
      .from('notificacoes')
      .insert({
        aluno_id: input.aluno_id ?? null,
        titulo: input.titulo,
        corpo: input.corpo,
        tipo: input.tipo ?? null,
        horario_envio: input.horario_envio ?? new Date().toISOString(),
        read: false,
        status: input.status ?? 'pendente',
      })
      .select('*')
      .single();

    if (error) throw error;
    return Notificacao.fromRow(data);
  }

  /** 🕓 Atualiza o status da notificação */
  async updateStatus(status: string): Promise<void> {
    const { error } = await supabase
      .from('notificacoes')
      .update({ status })
      .eq('id', this.id);

    if (error) throw error;
    this.status = status;
  }
  /** 🕓 Atualiza o status da notificação */
  async updateRead(): Promise<void> {
    const { error } = await supabase
      .from('notificacoes')
      .update({ read: !this.read })
      .eq('id', this.id);

    if (error) throw error;
    this.read = !this.read;
  }

  /** 🗑️ Remove a notificação */
  async delete(): Promise<void> {
    const { error } = await supabase
      .from('notificacoes')
      .delete()
      .eq('id', this.id);

    if (error) throw error;
  }

  /** 📦 Serialização limpa */
  toJSON() {
    return {
      id: this.id,
      aluno_id: this.aluno_id,
      titulo: this.titulo,
      corpo: this.corpo,
      tipo: this.tipo,
      horario_envio: this.horario_envio,
      status: this.status,
      read: this.read,
      created_at: this.created_at,
    };
  }
}
