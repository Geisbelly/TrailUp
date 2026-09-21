type EnrolledClass = { classe_id: number; aluno_id: string };

/** Só confirma uma escolha explícita entre as matrículas do aluno atual. */
export function findSelectedClass<T extends EnrolledClass>(
  classes: readonly T[],
  classId: number | null | undefined,
  userId: string | null | undefined,
): T | null {
  if (!userId || classId == null) return null;
  return classes.find((item) => item.classe_id === classId && item.aluno_id === userId) ?? null;
}

/** Um link de tópico não pode abrir o conteúdo de outra turma após a escolha. */
export function isTopicOutsideSelectedClass(
  pathname: string,
  selectedClass: { topicos: readonly { id: number }[] },
): boolean {
  const match = pathname.match(/\/trilha\/([^/?#]+)/);
  if (!match || match[1] === "index") return false;
  const topicId = Number(match[1]);
  return !selectedClass.topicos.some((topic) => topic.id === topicId);
}
