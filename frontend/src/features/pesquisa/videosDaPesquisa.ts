// Vídeos e PDF da cartilha da pesquisa com professores.
//
// Os arquivos ficam no R2, sob `publico/pesquisa/`, e saem pelo gateway (`storage-redirect`) sem
// sessão nem link assinado: é o único prefixo que ele serve assim (ver `caminho.ts` da função).
// Quem sobe é a equipe, com `scripts/pesquisa-videos/subir-para-o-r2.mjs`; os caminhos de lá e
// daqui são os mesmos (o teste compara).
//
// Cada vídeo tem página própria (`/pesquisa/professores/videos/<slug>`), para ser compartilhado
// sozinho, sem a cartilha inteira.

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
    slug: "apresentacao",
    titulo: "Conheça o TrailUp",
    papel: "Apresentação",
    descricao:
      "O que é o TrailUp: o mesmo conteúdo da aula vira experiências diferentes para cada aluno, com guias, missões e guildas, e o professor revisa o material personalizado antes de publicar.",
    duracao: "3 min",
    arquivo: `${PASTA}apresentacao-trailup.mp4`,
    poster: `${PASTA}apresentacao-trailup.jpg`,
  },
  {
    slug: "para-o-professor",
    titulo: "Não é falta de vontade, é falta de tempo",
    papel: "Para o professor",
    descricao:
      "O dia de quem dá aula: várias turmas, ritmos diferentes e pouco tempo para acompanhar cada estudante. E como o painel, a Lumi e as missões ajudam nisso.",
    duracao: "1 min 43 s",
    arquivo: `${PASTA}para-o-professor.mp4`,
    poster: `${PASTA}para-o-professor.jpg`,
  },
  {
    slug: "guia",
    titulo: "Guia em vídeo: do cadastro à trilha",
    papel: "Guia",
    descricao:
      "O primeiro acesso passo a passo: confirmar o cadastro pelo e-mail, responder ao questionário de preferências, completar o perfil e chegar à trilha introdutória.",
    duracao: "3 min 10 s",
    arquivo: `${PASTA}guia-primeiro-acesso.mp4`,
    poster: `${PASTA}guia-primeiro-acesso.jpg`,
  },
];

export const PDF_DA_CARTILHA = "publico/pesquisa/cartilha-pesquisa-professores.pdf";

export const caminhoDoVideo = (video: Pick<VideoDaPesquisa, "slug">) => `${CAMINHO_DA_CARTILHA}/videos/${video.slug}`;

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
