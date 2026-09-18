export type LockedNodeMessage = {
  title: string;
  body: string;
  requirement: string;
};

export function getLockedNodeMessage(
  nodeTitle: string,
  prerequisiteTitles: string[],
): LockedNodeMessage {
  const prerequisites = prerequisiteTitles.filter(Boolean);
  return {
    title: `${nodeTitle} está bloqueado`,
    body: prerequisites.length
      ? "Conclua os módulos anteriores para liberar este conteúdo."
      : "Este conteúdo ainda não foi liberado para a sua jornada.",
    requirement: prerequisites.length
      ? `Pré-requisitos: ${prerequisites.join(" e ")}.`
      : "Continue avançando na trilha para desbloqueá-lo.",
  };
}
