// Inscrição feita na própria página, no lugar do Google Forms dentro de um iframe.
//
// As respostas vão direto para o mesmo formulário (`formResponse`, pelos `entry.*` das perguntas),
// então a planilha, a aprovação e os e-mails do Apps Script continuam iguais. O navegador não
// consegue ler a resposta do Google (o envio é `no-cors`), por isso cada envio leva um código
// aleatório no campo "Código do site", e a página pergunta ao App da Web do script (`doGet`, em
// Planilha.gs) se aquele código chegou. A resposta é só `{"recebida": true|false}`: nada da
// planilha sai de lá, e ela continua privada.
//
// Os `entry.*` são do formulário publicado hoje. Se ele for recriado, os números mudam: sem o id
// dele aqui, a página volta sozinha para o Google Forms em vez de mandar respostas para o vazio.

import { ACESSO, CAMPOS_DE_IDENTIFICACAO } from "./pesquisaProfessores";

/** Termo de consentimento: o mesmo texto de CONFIG.tcle no Code.gs (o teste compara os dois). */
export const TERMO_DE_CONSENTIMENTO: readonly (readonly [titulo: string, texto: string])[] = [
  [
    "1. Sobre a avaliação",
    "O TrailUp é uma plataforma de aprendizagem criada num Trabalho de Conclusão de Curso de Ciência da Computação da Ulbra Palmas. Esta etapa é a validação com especialistas em ensino (docentes da área de TI, docentes de outras áreas e pedagogos): antes de levar o sistema a uma turma, a pesquisa quer saber se ele é fácil de usar, se as métricas ajudam o professor e quanto trabalho ele exige. Nenhum aluno participa desta etapa; a fase com alunos vem depois, com aprovação do Comitê de Ética em Pesquisa. Resultados negativos valem tanto quanto os positivos: o que não funcionar é o que mais orienta a correção do sistema.",
  ],
  [
    "2. O que você vai fazer",
    "Primeiro, a inscrição: este termo e a sua identificação. Depois, com o acesso que a equipe envia ao seu e-mail, usar o TrailUp numa turma de demonstração, sem alunos reais, seguindo um roteiro de tarefas curtas no console do professor e na tela do aluno, e responder ao formulário de avaliação. Leva cerca de uma hora (uns 35 minutos usando o sistema e uns 25 respondendo) e pode ser feito em mais de uma vez.\n\nNão há entrevista nem gravação. Nenhuma pergunta é obrigatória, e você pode parar a qualquer momento fechando a página antes de enviar. Você pode usar conteúdo seu no console. O que for usado numa geração por IA é enviado ao modelo de linguagem, por isso não inclua dados pessoais nem material de terceiros que você não possa compartilhar.",
  ],
  [
    "3. Seus dados e como você aparece",
    "O formulário pede a sua identificação (nome, e-mail, instituição, titulação e formação), porque a validação se apoia na qualificação de quem avalia.\n\n" +
      ACESSO +
      "\n\nNo fim da avaliação você escolhe como ela aparece na monografia: (a) com o seu nome e titulação, só depois de ver o seu quadro e confirmar; (b) com um código (E1, E2…) e o seu perfil, sem o nome; ou (c) só nos resultados agregados. Pode trocar a escolha até a versão final da monografia, pelo formulário de atualização ou pelo contato abaixo. Com o nome, a sua opinião fica pública; nas outras escolhas, como os participantes são poucos, alguém ainda pode reconhecer você por um comentário, por isso os trechos citados são curtos e revisados. Fora do que você autorizar, a identificação fica só com a equipe.\n\nDo seu uso do sistema, a pesquisa só confere se a tarefa de gerar material foi feita. As respostas são baixadas para um computador da equipe, apagadas do formulário online e guardadas até a entrega da versão final do TCC; depois, são destruídas. A turma, o conteúdo que você puser nela e os acessos de teste são apagados ao fim.",
  ],
  [
    "4. Participação voluntária",
    "Participar é voluntário, não tem custo e não é pago. Você pode recusar, desistir ou pedir a retirada das suas respostas a qualquer momento, pelo contato abaixo, sem nenhum prejuízo. Você recebe um resumo dos resultados.",
  ],
  [
    "5. Contato",
    "Orientador: Prof. Esp. Fábio Castro Araújo – fabio.araujo@ulbra.br. Pesquisadora: Geisbelly Victória Feitosa Moraes Domiciano – geisbelly@rede.ulbra.br.",
  ],
];

export const ACEITE = "Li e concordo em participar";
export const RECUSA = "Não quero participar";
export const PERGUNTA_DO_ACEITE = "Consentimento";
export const AJUDA_DO_ACEITE =
  'Ao marcar "Li e concordo em participar", declaro que sou docente de ensino superior ou profissional da área pedagógica, tenho 18 anos ou mais, li este termo e aceito participar.';

export type FormularioDoSite = {
  /** O trecho `1FAIpQL…` do link de resposta (`/forms/d/e/<id>/viewform`). */
  id: string;
  aceite: string;
  codigo: string;
  /** pergunta (como em CAMPOS_DE_IDENTIFICACAO) → entry */
  campos: Readonly<Record<string, string>>;
};

/** Lidos do formulário publicado em 23/11/2026 (FB_PUBLIC_LOAD_DATA_ da página de resposta). */
export const FORMULARIOS_DO_SITE: readonly FormularioDoSite[] = [
  {
    id: "1FAIpQLSd8tEkjERY2u8ukrV_t1tNhBKG1biVycaqhC3shKjYZ7masLg",
    aceite: "entry.1856163268",
    codigo: "entry.1128973931",
    campos: {
      "Nome completo": "entry.1023748481",
      "E-mail (será o seu login no TrailUp e o contato da pesquisa)": "entry.956423821",
      "Instituição em que atua": "entry.2135179022",
      "Papel em que você avalia o sistema": "entry.290236963",
      "Maior titulação": "entry.1175403525",
      "Área da sua formação (graduação e pós)": "entry.631982505",
      "Você tem formação pedagógica?": "entry.728972337",
      "Disciplinas que leciona ou acompanha": "entry.1024648433",
      "Tempo de atuação no ensino superior": "entry.1909345729",
      "Já usou em aula um ambiente virtual com painel de dados dos alunos?": "entry.1794412071",
      "Já usou elementos de jogo (pontos, ranking, missões) em aula?": "entry.1768454497",
      "Com que frequência usa IA generativa para preparar aulas?": "entry.1309958821",
      "Em que aparelho você vai usar o sistema?": "entry.1324459087",
    },
  },
];

export const PERGUNTA_DO_EMAIL = CAMPOS_DE_IDENTIFICACAO[1].pergunta;

/** O formulário do site que corresponde ao link configurado, ou null (a página usa o Google Forms). */
export function formularioDoSite(link: string | null): FormularioDoSite | null {
  if (!link) return null;
  const id = /\/forms\/d\/e\/([A-Za-z0-9_-]+)\//.exec(new URL(link).pathname)?.[1];
  return FORMULARIOS_DO_SITE.find(f => f.id === id) ?? null;
}

/** Só aceita o App da Web do Apps Script (`script.google.com/macros/s/<id>/exec`) em https. */
export function linkDaConfirmacao(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto.trim()) return null;
  let url: URL;
  try {
    url = new URL(bruto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "script.google.com") return null;
  if (!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) return null;
  return `${url.origin}${url.pathname}`;
}

export const urlDoEnvio = (formulario: FormularioDoSite) =>
  `https://docs.google.com/forms/d/e/${formulario.id}/formResponse`;

export const urlDaConferencia = (confirmacao: string, codigo: string) =>
  `${confirmacao}?codigo=${encodeURIComponent(codigo)}`;

export type Respostas = Readonly<Record<string, string>>;

/**
 * Corpo do envio. Só vai o que foi respondido (nada é obrigatório), o aceite e o código.
 * `pageHistory` diz ao Forms que as duas páginas (termo e identificação) foram vistas; sem ele o
 * Google descarta as respostas da segunda.
 */
export function corpoDoEnvio(formulario: FormularioDoSite, respostas: Respostas, codigo: string): URLSearchParams {
  const corpo = new URLSearchParams();
  corpo.set(formulario.aceite, ACEITE);
  for (const [pergunta, entry] of Object.entries(formulario.campos)) {
    const valor = respostas[pergunta]?.trim();
    if (valor) corpo.set(entry, valor);
  }
  corpo.set(formulario.codigo, codigo);
  corpo.set("pageHistory", "0,1");
  return corpo;
}

/**
 * O Forms recusa em silêncio um e-mail que a validação dele não aceita, e o envio `no-cors` não
 * vê a recusa: a página confere antes. Vazio passa (nada é obrigatório).
 */
export function emailAceito(email: string): boolean {
  const e = email.trim();
  return e === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Só `true` de verdade conta: qualquer outra coisa (erro, HTML de login, campo a mais) é "ainda não". */
export function lerConfirmacao(bruto: unknown): boolean {
  return !!bruto && typeof bruto === "object" && (bruto as Record<string, unknown>).recebida === true;
}

/** Espera entre as conferências: o Forms leva uns segundos para a resposta aparecer. ~30 s ao todo. */
export const ESPERAS_DA_CONFERENCIA_MS: readonly number[] = [2000, 2000, 3000, 3000, 4000, 4000, 5000, 7000];
