// Vídeos e PDF da cartilha da pesquisa com professores.
//
// Os arquivos ficam no R2, sob `publico/pesquisa/`, e saem pelo gateway (`storage-redirect`) sem
// sessão nem link assinado: é o único prefixo que ele serve assim (ver `caminho.ts` da função).
// Quem sobe é a equipe, com `scripts/pesquisa-videos/subir-para-o-r2.mjs`; os caminhos de lá e
// daqui são os mesmos (o teste compara).
//
// Cada vídeo tem página própria, para ser compartilhado sozinho: na pesquisa,
// `/pesquisa/professores/videos/<slug>`; no resto do site (início, Sobre, Download, Diário),
// `/videos/<slug>`. Os arquivos são os mesmos.

import { CAMINHO_DA_CARTILHA } from "./pesquisaProfessores";

export type VideoDaPesquisa = {
  slug: string;
  titulo: string;
  /** Para quem é o vídeo, numa frase: aparece acima do título. */
  papel: string;
  descricao: string;
  duracao: string;
  /** Caminho no R2 (sempre sob `publico/pesquisa/`). */
  arquivo: string;
  poster: string;
};

const PASTA = "publico/pesquisa/videos/";

export const VIDEOS_DA_PESQUISA: readonly VideoDaPesquisa[] = [
  {
    slug: "passo-a-passo",
    titulo: "A pesquisa, passo a passo",
    papel: "Para quem vai avaliar",
    descricao:
      "Quem pode participar, as três fases (inscrição, acesso e avaliação) e as oito tarefas do roteiro: seis no console e duas no app, com o aluno de teste. Vale ver antes de começar.",
    duracao: "4 min 36 s",
    arquivo: `${PASTA}pesquisa-passo-a-passo.mp4`,
    poster: `${PASTA}pesquisa-passo-a-passo.jpg`,
  },
  {
    slug: "apresentacao",
    titulo: "Conheça o TrailUp",
    papel: "Apresentação",
    descricao:
      "O mesmo conteúdo da aula chega de um jeito diferente para cada aluno, com guias, missões e guildas. Antes de publicar, o professor revisa o material personalizado.",
    duracao: "3 min",
    arquivo: `${PASTA}apresentacao-trailup.mp4`,
    poster: `${PASTA}apresentacao-trailup.jpg`,
  },
  {
    slug: "para-o-professor",
    titulo: "O tempo de quem dá aula",
    papel: "Para o professor",
    descricao:
      "Várias turmas, cada aluno num ritmo e pouco tempo para acompanhar todo mundo. O vídeo mostra onde o painel, a Lumi e as missões entram nessa rotina.",
    duracao: "1 min 43 s",
    arquivo: `${PASTA}para-o-professor.mp4`,
    poster: `${PASTA}para-o-professor.jpg`,
  },
  {
    slug: "guia",
    titulo: "Primeiro acesso, passo a passo",
    papel: "Guia",
    descricao:
      "Do e-mail de confirmação até a trilha introdutória, passando pelo questionário de preferências e pelo perfil do aluno.",
    duracao: "3 min 10 s",
    arquivo: `${PASTA}guia-primeiro-acesso.mp4`,
    poster: `${PASTA}guia-primeiro-acesso.jpg`,
  },
];

export const PDF_DA_CARTILHA = "publico/pesquisa/cartilha-pesquisa-professores.pdf";

export const caminhoDoVideo = (video: Pick<VideoDaPesquisa, "slug">) => `${CAMINHO_DA_CARTILHA}/videos/${video.slug}`;

/** Página do vídeo fora da pesquisa. */
export const CAMINHO_DOS_VIDEOS = "/videos";
export const caminhoDoVideoNoSite = (video: Pick<VideoDaPesquisa, "slug">) => `${CAMINHO_DOS_VIDEOS}/${video.slug}`;

/** Vídeo no fim de cada artigo do Diário (`/blog/<id>`), pelo assunto. */
export const VIDEO_DO_ARTIGO: Readonly<Record<string, string>> = {
  // A apresentação mostra os sete guias, um por perfil BrainHex.
  brainhex: "apresentacao",
  seeker: "apresentacao",
  survivor: "apresentacao",
  daredevil: "apresentacao",
  mastermind: "apresentacao",
  conqueror: "apresentacao",
  socializer: "apresentacao",
  achiever: "apresentacao",
  "pesquisa-tcc": "para-o-professor",
};

export function videoPorSlug(slug: string | undefined): VideoDaPesquisa | null {
  return VIDEOS_DA_PESQUISA.find(v => v.slug === slug) ?? null;
}

/**
 * Link público de um arquivo sob `publico/` pelo gateway do projeto. null sem a URL do Supabase
 * (a seção some em vez de mostrar player quebrado) ou para caminho fora de `publico/`, que o
 * gateway recusaria sem sessão.
 */
export function linkPublico(supabaseUrl: unknown, caminho: string): string | null {
  if (typeof supabaseUrl !== "string" || !supabaseUrl.trim()) return null;
  if (!caminho.startsWith("publico/")) return null;
  let base: URL;
  try {
    base = new URL(supabaseUrl.trim());
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1") return null;
  const url = new URL("/functions/v1/storage-redirect", base.origin);
  url.searchParams.set("path", caminho);
  return url.toString();
}

/** `linkPublico` com o projeto deste build. */
export const linkDoArquivo = (caminho: string) => linkPublico(import.meta.env.VITE_SUPABASE_URL, caminho);
