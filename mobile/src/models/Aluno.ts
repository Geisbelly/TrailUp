// src/models/Aluno.ts
import { getSessionSafe, supabase } from '@/database/supabase';
import { PerfilDoAluno } from './PerfilAluno';

export class Aluno {
  // campos da view
  public readonly id: string; // = aluno_id/user_id
  public nome: string;
  public email: string;
  public apelido: string | null = null;
  public descricao: string | null;
  public foto_url: string | null = null;
  public banner_url: string | null = null;
  public modoResposta: string | null;
  public modoOperacao_nome: string | null;
  public modoOperacao_descricao: string | null;
  public modoOperacao_ordem: unknown | null;
  

  // perfis associados
  public perfis: PerfilDoAluno[] = [];

  private constructor(row: any) {
    this.id = row.aluno_id;
    this.nome = row.nome;
    this.email = row.email;
    this.apelido = row.apelido ?? null;
    this.descricao = row.descricao ?? null;
    this.foto_url = row.foto_url ?? null;
    this.banner_url = row.banner_url ?? null;
    this.modoResposta = row.modo_resposta ?? null;
    this.modoOperacao_nome = row.modoOperacao_nome ?? null;
    this.modoOperacao_descricao = row.modoOperacao_descricao ?? null;
    this.modoOperacao_ordem = row.modoOperacao_ordem ?? null;
  }

  static async fromViewRow(row: any): Promise<Aluno> {
    if (!row) throw new Error('Linha inválida da vw_aluno_usuario');
    const aluno = new Aluno(row);
    await aluno.loadPerfis(); // ✅ Aguarda aqui
    return aluno;
  }

  /** Busca pela view */
  static async findById(id: string): Promise<Aluno | null> {
    const { data, error } = await supabase
      .from('vw_aluno_usuario')
      .select('*')
      .eq('aluno_id', id)
      .single();

    if (error && (error as any).code !== 'PGRST116') throw error;
    return data ? Aluno.fromViewRow(data) : null;
  }

  /** Sessão atual → carrega Aluno (ou null se não existir na view) */
  static async getCurrent(): Promise<Aluno | null> {
    const session = await getSessionSafe();
    const uid = session?.user?.id;
    if (!uid) return null;
    return await Aluno.findById(uid);
  }

  /**
   * Sessão atual → garante que exista linha em `alunos` com o mesmo id do auth.
   * Se não existir, cria usando email e (se tiver) nome do user metadata.
   * Retorna o Aluno carregado da view.
   */
  static async ensureCurrent(): Promise<Aluno> {
    const session = await getSessionSafe();
    const user = session?.user;
    if (!user) throw new Error('Sem sessão ativa');

    // tenta carregar da view
    const found = await Aluno.findById(user.id);
    if (found) return found;

    // cria linha em `alunos` (id = auth.users.id)
    const nome =
      (user.user_metadata?.name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split('@')[0] ||
      'Aluno';

    const { error: upsertErr } = await supabase
      .from('alunos')
      .upsert(
        { id: user.id, nome, email: user.email ?? '' },
        { onConflict: 'id' }
      );

    if (upsertErr) throw upsertErr;

    // carrega novamente da view
    const aluno = await Aluno.findById(user.id);
    if (!aluno) throw new Error('Falha ao criar/carregar aluno');
    return aluno;
  }

  /** Carrega perfis (aluno_perfil + perfil) */
  async loadPerfis(): Promise<void> {
    const { data, error } = await supabase
      .from('aluno_perfil')
      .select(`
        afinidade,
        criado_em,
        atualizado_em,
        perfil:perfil_id (
          id,
          nome,
          descricao,
          caracteristicas
        )
      `)
      .eq('aluno_id', this.id)
      .order('afinidade', { ascending: false });

    if (error) throw error;

    this.perfis = (data ?? []).map((row: any) => ({
      id: row.perfil?.id,
      nome: row.perfil?.nome ?? null,
      descricao: row.perfil?.descricao ?? null,
      caracteristicas: row.perfil?.caracteristicas ?? null,
      afinidade: Number(row.afinidade ?? 0),
      criado_em: row.criado_em ?? null,
      atualizado_em: row.atualizado_em ?? null,
    }));
  }

  /** Atualiza campos básicos em `alunos` */
  async save(): Promise<void> {
    const payload: Record<string, any> = {
      nome: this.nome,
      email: this.email,
      apelido: this.apelido,
      descricao: this.descricao,
      foto_url: this.foto_url,
      banner_url: this.banner_url,
    };
    if (this.modoResposta !== undefined) {
      payload.modo_resposta = this.modoResposta;
    }

    const { error } = await supabase
      .from('alunos')
      .update(payload)
      .eq('id', this.id);

    if (error) {
      const code = (error as any).code;
      if ((code === '42703' || code === 'PGRST204') && payload.modo_resposta !== undefined) {
        const fallbackPayload = { ...payload };
        delete (fallbackPayload as any).modo_resposta;
        (fallbackPayload as any).modoresposta = this.modoResposta;
        const { error: e2 } = await supabase.from('alunos').update(fallbackPayload).eq('id', this.id);
        if (!e2) return;
      }
      throw error;
    }
  }

  async setAfinidade(perfilId: number, afinidade: number): Promise<void> {
    if (afinidade < 0 || afinidade > 100) {
      throw new Error('Afinidade deve estar entre 0 e 100');
    }

    const { error } = await supabase
      .from('aluno_perfil')
      .upsert(
        { aluno_id: this.id, perfil_id: perfilId, afinidade, atualizado_em: new Date().toISOString() },
        { onConflict: 'aluno_id,perfil_id' }
      );

    if (error) throw error;

    const ix = this.perfis.findIndex(p => p.id === perfilId);
    if (ix >= 0) {
      this.perfis[ix].afinidade = afinidade;
      this.perfis[ix].atualizado_em = new Date().toISOString();
    } else {
      const { data: perfilRow, error: e2 } = await supabase
        .from('perfil')
        .select('id, nome, descricao, caracteristicas')
        .eq('id', perfilId)
        .single();
      if (e2) throw e2;

      this.perfis.push({
        id: perfilRow.id,
        nome: perfilRow.nome ?? null,
        descricao: perfilRow.descricao ?? null,
        caracteristicas: perfilRow.caracteristicas ?? null,
        afinidade,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      });
    }
    this.perfis.sort((a, b) => (b.afinidade ?? 0) - (a.afinidade ?? 0));
  }

  async removePerfil(perfilId: number): Promise<void> {
    const { error } = await supabase
      .from('aluno_perfil')
      .delete()
      .eq('aluno_id', this.id)
      .eq('perfil_id', perfilId);

    if (error) throw error;
    this.perfis = this.perfis.filter(p => p.id !== perfilId);
  }

  async refresh(): Promise<void> {
    const fresh = await Aluno.findById(this.id);
    if (!fresh) throw new Error('Aluno não encontrado ao dar refresh');
    Object.assign(this, fresh);
  }

  /** Atualiza perfil usando a função RPC fornecida (fn_atualizar_aluno_perfil) */
  async atualizarPerfilViaFuncao(params: {
    nome?: string | null;
    apelido?: string | null;
    modoOperacao_nome?: string | null;
    modoResposta?: string | null;
    descricao?: string | null;
    foto_url?: string | null;
    banner_url?: string | null;
  }): Promise<Aluno> {
    const applyLocal = async () => {
      try {
        await this.refresh();
        return;
      } catch {
        // se refresh falhar, aplica manualmente
        this.nome = params.nome ?? this.nome;
        (this as any).apelido = params.apelido ?? (this as any).apelido;
        this.descricao = params.descricao ?? this.descricao;
        this.modoOperacao_nome = params.modoOperacao_nome ?? this.modoOperacao_nome;
        this.modoResposta = params.modoResposta ?? this.modoResposta;
        (this as any).foto_url = params.foto_url ?? (this as any).foto_url;
        (this as any).banner_url = params.banner_url ?? (this as any).banner_url;
      }
    };

    const fallbackUpdate = async () => {
      let modoId: number | null = null;
      if (params.modoOperacao_nome) {
        const { data: modoRow, error: modoErr } = await supabase
          .from('modoOperacao')
          .select('id')
          .eq('nome', params.modoOperacao_nome)
          .limit(1)
          .single();
        if (!modoErr && modoRow?.id) modoId = modoRow.id;
      }

      const buildPayload = () => {
        const payload: Record<string, any> = {
          nome: params.nome ?? this.nome,
          apelido: params.apelido ?? this.apelido,
          descricao: params.descricao ?? this.descricao,
          foto_url: params.foto_url ?? this.foto_url,
          banner_url: params.banner_url ?? this.banner_url,
        };
        if (modoId !== null) payload.modooperacao_id = modoId;
        if (params.modoResposta !== undefined) {
          payload.modo_resposta = params.modoResposta;
        }
        return payload;
      };

      const tryUpdate = async (payload: Record<string, any>) => {
        const { error: upError } = await supabase.from('alunos').update(payload).eq('id', this.id);
        if (upError) {
          const code = (upError as any).code;
          if (code === '42703' || code === 'PGRST204') return false;
          throw upError;
        }
        return true;
      };

      const payload = buildPayload();
      const ok = await tryUpdate(payload);
      if (!ok && payload.modo_resposta !== undefined) {
        const altPayload = { ...payload };
        delete (altPayload as any).modo_resposta;
        (altPayload as any).modoresposta = params.modoResposta ?? this.modoResposta;
        await tryUpdate(altPayload);
      }
      await applyLocal();
    };

    const { error } = await supabase.rpc('fn_atualizar_aluno_perfil', {
      p_nome_completo: params.nome ?? null,
      p_apelido: params.apelido ?? null,
      p_modooperacao_nome: params.modoOperacao_nome ?? null,
      p_modo_resposta: params.modoResposta ?? null,
      p_descricao: params.descricao ?? null,
      p_foto_url: params.foto_url ?? null,
      p_banner_url: params.banner_url ?? null,
    });

    if (error) {
      console.warn('[Aluno] Falha no RPC fn_atualizar_aluno_perfil, aplicando fallback:', error);
      await fallbackUpdate();
      return this;
    }

    await applyLocal();

    if (params.modoResposta !== undefined) {
      const primary = await supabase.from('alunos').update({ modo_resposta: params.modoResposta }).eq('id', this.id);
      if (primary.error && ((primary.error as any).code === '42703' || (primary.error as any).code === 'PGRST204')) {
        const fallback = await supabase.from('alunos').update({ modoresposta: params.modoResposta }).eq('id', this.id);
        if (fallback.error) {
          console.warn('[Aluno] Falha ao atualizar modoResposta (update direto)', fallback.error);
        } else {
          this.modoResposta = params.modoResposta ?? this.modoResposta;
        }
      } else if (primary.error) {
        console.warn('[Aluno] Falha ao atualizar modoResposta (update direto)', primary.error);
      } else {
        this.modoResposta = params.modoResposta ?? this.modoResposta;
      }
    }
    return this;
  }

  /** Logout da sessão atual (se existir) */
  static async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  toJSON() {
    return {
      id: this.id,
      nome: this.nome,
      email: this.email,
      apelido: this.apelido,
      descricao: this.descricao,
      foto_url: this.foto_url,
      banner_url: this.banner_url,
      modoOperacao_nome: this.modoOperacao_nome,
      modoOperacao_descricao: this.modoOperacao_descricao,
      modoOperacao_ordem: this.modoOperacao_ordem,
      modoResposta: this.modoResposta,
      perfis: this.perfis,
    };
  }
}
