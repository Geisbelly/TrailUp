import { bossVisuals, normalizeBossVisual } from '@/lib/bossVisuals';

export function BossVisualPicker({ value, onChange, disabled = false }: {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const selected = normalizeBossVisual(value);
  const opcao = (ativa: boolean) =>
    `rounded-[14px] border-2 p-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
      ativa ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
    }`;
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Visual do boss</legend>
      <p className="text-xs text-muted-foreground">Escolha a aparência exibida ao aluno. Vida, dano e regras da batalha não mudam. A escolha é salva junto com o conteúdo.</p>
      <div role="group" aria-label="Visuais do boss" className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
        <button type="button" aria-pressed={!selected} onClick={() => onChange(null)} className={`${opcao(!selected)} min-h-32 text-sm`}>
          Automático<br /><span className="text-xs text-muted-foreground">Manter visual da personalização</span>
        </button>
        {bossVisuals.map((boss) => (
          <button key={boss.id} type="button" aria-pressed={selected === boss.id} onClick={() => onChange(boss.id)} className={opcao(selected === boss.id)}>
            <img src={`${import.meta.env.BASE_URL}bosses/${boss.id}.png`} alt="" loading="lazy" className="mx-auto h-24 w-full object-contain" />
            <span className="mt-2 block">{boss.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
