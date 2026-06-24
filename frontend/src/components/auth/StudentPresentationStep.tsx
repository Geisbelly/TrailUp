import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Zap, BrainCircuit, MonitorPlay } from "lucide-react";
import { cn } from "@/lib/utils";

const MODO_APRESENTACAO_OPTIONS = [
  {
    value: "imediato",
    label: "Imediato",
    description: "Feedback instantâneo. Errou? O sistema corrige na hora para você avançar rápido.",
    icon: Zap
  },
  {
    value: "pensante",
    label: "Pensante",
    description: "Feedback reflexivo. Errou? O sistema dá dicas e te incentiva a tentar novamente.",
    icon: BrainCircuit
  }
];

export default function StudentPresentationStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="text-center space-y-2 mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <MonitorPlay className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-medium text-white">Estilo de Feedback</h3>
        <p className="text-sm text-zinc-400 max-w-sm mx-auto">
          Como você prefere que o TrailUp reaja quando você responde uma questão?
        </p>
      </div>

      <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODO_APRESENTACAO_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = value === opt.value;

          return (
            <label
              key={opt.value}
              htmlFor={opt.value}
              className={cn(
                "relative flex flex-col items-start p-5 rounded-xl border cursor-pointer transition-all duration-300 h-full",
                "hover:bg-zinc-800/50 hover:-translate-y-1",
                isSelected
                  ? "bg-primary/10 border-primary/50 shadow-[0_0_15px_-3px_rgba(124,58,237,0.3)]"
                  : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
              )}
            >
              <div className="flex justify-between w-full mb-4">
                <div className={cn(
                  "p-2.5 rounded-lg transition-colors duration-300", 
                  isSelected ? "bg-primary text-white shadow-lg shadow-primary/25" : "bg-zinc-800 text-zinc-400"
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                
                <div className="mt-1">
                  <RadioGroupItem value={opt.value} id={opt.value} className="sr-only" />
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-zinc-600 bg-transparent"
                    )}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white animate-in zoom-in duration-300" />}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className={cn("text-base font-semibold transition-colors duration-300", isSelected ? "text-primary" : "text-zinc-200")}>
                  {opt.label}
                </span>
                <p className="text-sm text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">
                  {opt.description}
                </p>
              </div>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}