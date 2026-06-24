export class Questao {
  public resposta_aluno: string | null;
  public correta_aluno: boolean | null;
  public ultima_tentativa: number | null;
  public acertos_percentual: number | null;
  public tempo_gasto_seg: number | null;
  public mostrar_gabarito_ao_errar: boolean;

  // Campos opcionais para renderizacao de midia vinculada
  public metadata: Record<string, unknown> | null;
  public midia: unknown;
  public midias: unknown[] | null;
  public media: unknown[] | null;
  public anexos: unknown[] | null;
  public arquivos: unknown[] | null;
  public fontes: unknown[] | null;
  public materiais: unknown[] | null;
  public audio_url: string | null;
  public video_url: string | null;
  public imagem_url: string | null;
  public image_url: string | null;
  public pdf_url: string | null;
  public arquivo_url: string | null;
  public file_url: string | null;
  public document_url: string | null;
  public documento_url: string | null;
  public apresentacao_url: string | null;
  public embed_html: string | null;
  public html: string | null;

  constructor(
    public id: number,
    public enunciado: string,
    public tipo: string | null,
    public alternativas: unknown | null,
    public resposta_correta: string | null,
    public midia_url: string | null,
    extras?: {
      resposta_aluno?: string | null;
      correta_aluno?: boolean | null;
      ultima_tentativa?: number | null;
      acertos_percentual?: number | null;
      tempo_gasto_seg?: number | null;
      mostrar_gabarito_ao_errar?: boolean | null;
      metadata?: Record<string, unknown> | null;
      midia?: unknown;
      midias?: unknown[] | null;
      media?: unknown[] | null;
      anexos?: unknown[] | null;
      arquivos?: unknown[] | null;
      fontes?: unknown[] | null;
      materiais?: unknown[] | null;
      audio_url?: string | null;
      video_url?: string | null;
      imagem_url?: string | null;
      image_url?: string | null;
      pdf_url?: string | null;
      arquivo_url?: string | null;
      file_url?: string | null;
      document_url?: string | null;
      documento_url?: string | null;
      apresentacao_url?: string | null;
      embed_html?: string | null;
      html?: string | null;
    }
  ) {
    this.resposta_aluno = extras?.resposta_aluno ?? null;
    this.correta_aluno = extras?.correta_aluno ?? null;
    this.ultima_tentativa = extras?.ultima_tentativa ?? null;
    this.acertos_percentual = extras?.acertos_percentual ?? null;
    this.tempo_gasto_seg = extras?.tempo_gasto_seg ?? null;
    this.mostrar_gabarito_ao_errar = extras?.mostrar_gabarito_ao_errar ?? true;

    this.metadata = extras?.metadata ?? null;
    this.midia = extras?.midia ?? null;
    this.midias = extras?.midias ?? null;
    this.media = extras?.media ?? null;
    this.anexos = extras?.anexos ?? null;
    this.arquivos = extras?.arquivos ?? null;
    this.fontes = extras?.fontes ?? null;
    this.materiais = extras?.materiais ?? null;
    this.audio_url = extras?.audio_url ?? null;
    this.video_url = extras?.video_url ?? null;
    this.imagem_url = extras?.imagem_url ?? null;
    this.image_url = extras?.image_url ?? null;
    this.pdf_url = extras?.pdf_url ?? null;
    this.arquivo_url = extras?.arquivo_url ?? null;
    this.file_url = extras?.file_url ?? null;
    this.document_url = extras?.document_url ?? null;
    this.documento_url = extras?.documento_url ?? null;
    this.apresentacao_url = extras?.apresentacao_url ?? null;
    this.embed_html = extras?.embed_html ?? null;
    this.html = extras?.html ?? null;
  }
}
