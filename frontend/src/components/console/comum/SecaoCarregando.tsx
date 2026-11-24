/**
 * Esqueleto genérico de uma aba do console, no mesmo padrão de `DashboardCarregando` e
 * `TurmasCarregando` (`console-skeleton`): aparece enquanto o código da aba baixa ou enquanto o
 * console confere se a aba pode ser aberta. Antes era um spinner solto (ou nada), e a tela pulava
 * do vazio para o esqueleto da aba.
 */
export function SecaoCarregando({ rotulo = "Carregando…" }: { rotulo?: string }) {
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite">
      <span className="sr-only">{rotulo}</span>
      <div className="console-skeleton h-[62px]" />
      <div className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="console-skeleton h-[130px]" style={{ animationDelay: `${0.1 + i * 0.15}s` }} />
        ))}
      </div>
      <div className="console-skeleton h-[240px]" style={{ animationDelay: ".5s" }} />
    </div>
  );
}
