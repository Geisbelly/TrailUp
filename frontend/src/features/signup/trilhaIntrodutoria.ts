/** Introdução ao uso do produto, sem diagnóstico, nota, XP ou inferência de aprendizagem. */
export const ETAPAS_INTRODUCAO = [
  { id: 'perfil', titulo: 'Conheça suas preferências',
    texto: 'O questionário organiza preferências que você declarou. O perfil é uma sugestão exploratória: não é diagnóstico nem determina sua capacidade de aprender. Os percentuais distribuem afinidades e não são probabilidades de acerto. Experimente e ajuste suas preferências durante o uso.',
    pergunta: 'O que o perfil informa?',
    opcoes: ['Uma sugestão baseada nas minhas preferências', 'Uma medida da minha capacidade de aprender'], correta: 0 },
  { id: 'sessao', titulo: 'Experimente o percurso',
    texto: 'Nas trilhas da turma, selecione um tópico e abra o material disponível. Use as perguntas para tentar responder e confira o feedback. A ordem entre material e perguntas depende da preferência escolhida no cadastro. Se um material ainda estiver sendo preparado, aguarde a indicação de disponibilidade.',
    pergunta: 'Como continuar quando uma resposta precisa ser revista?',
    opcoes: ['Considerar o perfil como prova de que não consigo aprender', 'Conferir o feedback e voltar ao material quando necessário'], correta: 1 },
  { id: 'turma', titulo: 'Continue com sua turma',
    texto: 'Esta introdução está disponível mesmo sem matrícula. Para estudar os conteúdos de uma turma, peça ao professor para incluir sua conta. Depois, no aplicativo do aluno, atualize a lista e escolha a turma. O cadastro não dá acesso automático a conteúdos de outras turmas.',
    pergunta: 'Ainda não tenho turma. Qual é o próximo passo?',
    opcoes: ['Pedir ao professor a inclusão da minha conta', 'Acessar automaticamente qualquer turma'], correta: 0 },
] as const;

export function etapasConcluidas(etapas: readonly string[]): Set<string> {
  return new Set(etapas.filter(id => ETAPAS_INTRODUCAO.some(etapa => etapa.id === id)));
}

export function urlAppAluno(config: string | undefined): string | null {
  if (!config?.trim()) return null;
  try {
    const url = new URL(config);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url.href;
  } catch { return null; }
}
