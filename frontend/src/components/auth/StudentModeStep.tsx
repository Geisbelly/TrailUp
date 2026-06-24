import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BookOpen, HelpCircle, Shuffle, CheckCircle2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MODO_OPERACAO_OPTIONS = [
  {
    value: "Conteúdo Primeiro",
    label: "Conteúdo Primeiro",
    description: "Você prefere estudar a teoria antes de testar seus conhecimentos.",
    icon: BookOpen
  },
  {
    value: "Pergunta Primeiro",
    label: "Pergunta Primeiro",
    description: "Você gosta de ser desafiado logo de cara para descobrir o que precisa aprender.",
    icon: HelpCircle
  },
  {
    value: "Misto",
    label: "Misto",
    description: "Uma abordagem equilibrada, alternando entre teoria e prática.",
    icon: Shuffle
  },
  {
    value: "Perguntas Final",
    label: "Perguntas Final",
    description: "Foco total na leitura, deixando todos os testes para o encerramento.",
    icon: CheckCircle2
  },
];

export default function StudentModeStep({
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
          <Settings2 className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-medium text-white">Como você prefere aprender?</h3>
        <p className="text-sm text-zinc-400 max-w-sm mx-auto">
          O TrailUp adapta a ordem dos materiais para combinar com seu estilo cognitivo.
        </p>
      </div>

      <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-1 gap-3">
        {MODO_OPERACAO_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = value === opt.value;

          return (
            <label
              key={opt.value}
              htmlFor={opt.value}
              className={cn(
                "relative flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-300",
                "hover:bg-zinc-800/50",
                isSelected
                  ? "bg-primary/10 border-primary/50 shadow-[0_0_0_1px_rgba(124,58,237,0.5)]"
                  : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
              )}
            >
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

              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1.5 rounded-md transition-colors duration-300", 
                    isSelected ? "bg-primary/20 text-primary" : "bg-zinc-800 text-zinc-400"
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={cn("font-medium transition-colors duration-300", isSelected ? "text-primary" : "text-zinc-200")}>
                    {opt.label}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">
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