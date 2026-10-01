export function formatarAtualizadoHa(ultimaCarga: Date, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - ultimaCarga.getTime()) / 60_000);
  if (minutos < 1) return "Atualizado agora";
  if (minutos < 60) return `Atualizado há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `Atualizado há ${horas} h`;
}
