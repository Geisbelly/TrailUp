import { bossVisuals, normalizeBossVisual } from '@/lib/bossVisuals';

export function BossVisualPicker({ value, onChange, disabled = false }: {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const selected = normalizeBossVisual(value);
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100">
      <legend className="px-2 font-semibold">Visual do boss deste conteúdo</legend>
      <p className="text-xs text-slate-300">Escolha a aparência exibida ao aluno. Vida, dano e regras da batalha não mudam. A escolha é salva junto com o conteúdo.</p>
      <div role="group" aria-label="Visuais do boss" className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
        <button type="button" aria-pressed={!selected} onClick={() => onChange(null)} className={`min-h-32 rounded-lg border-2 p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${!selected ? 'border-violet-400 bg-violet-950' : 'border-slate-700 bg-slate-900'}`}>
          Automático<br /><span className="text-xs text-slate-300">Manter visual da personalização</span>
        </button>
        {bossVisuals.map((boss) => (
          <button key={boss.id} type="button" aria-pressed={selected === boss.id} onClick={() => onChange(boss.id)} className={`rounded-lg border-2 p-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${selected === boss.id ? 'border-violet-400 bg-violet-950' : 'border-slate-700 bg-slate-900 hover:border-slate-400'}`}>
            <img src={`${import.meta.env.BASE_URL}bosses/${boss.id}.png`} alt="" loading="lazy" className="mx-auto h-24 w-full object-contain" />
            <span className="mt-2 block">{boss.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
