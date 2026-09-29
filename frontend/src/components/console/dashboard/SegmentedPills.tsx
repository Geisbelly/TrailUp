import { cn } from "@/lib/utils";

export default function SegmentedPills<T extends string>({
  ariaLabel,
  opcoes,
  valor,
  onChange,
  className,
}: {
  ariaLabel: string;
  opcoes: { value: T; label: string }[];
  valor: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1", className)}
    >
      {opcoes.map((opcao) => {
        const ativa = valor === opcao.value;
        return (
          <button
            key={opcao.value}
            type="button"
            aria-pressed={ativa}
            onClick={() => onChange(opcao.value)}
            className={cn(
              "whitespace-nowrap rounded-full px-[15px] py-[7px] text-[13px] font-semibold transition-colors",
              ativa ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opcao.label}
          </button>
        );
      })}
    </div>
  );
}
