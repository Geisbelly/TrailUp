import { Button } from "@/components/ui/button";
import { BRAINHEX_QUESTIONS, BrainHexAnswers, SCALE_MAX } from "@/features/signup/brainhex";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BrainHexQuizStep({
  answers,
  onChange,
  page,
  setPage,
  perPage = 5,
}: {
  answers: BrainHexAnswers;
  onChange: (next: BrainHexAnswers) => void;
  page: number;
  setPage: (p: number) => void;
  perPage?: number;
}) {
  const totalQuestions = BRAINHEX_QUESTIONS.length;
  const totalPages = Math.ceil(totalQuestions / perPage);
  const start = page * perPage;
  const end = Math.min(start + perPage, totalQuestions);
  const current = BRAINHEX_QUESTIONS.slice(start, end);

  // Calcula progresso total baseado nas respostas preenchidas
  const answeredCount = Object.keys(answers).length;
  const progressPercentage = (answeredCount / totalQuestions) * 100;

  // Validação da página atual
  const validateCurrentPage = () => current.every((q) => typeof answers[q.id] === "number");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto p-4">
      
      {/* Header com Barra de Progresso */}
      <div className="space-y-3">
        <div className="flex justify-between items-end text-sm">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Questionário BrainHex</h2>
            <p className="text-muted-foreground text-xs mt-1">
              Toque no número que melhor representa você.
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {Math.round(progressPercentage)}% concluído
          </span>
        </div>
        <div className="h-2 w-full bg-secondary/30 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Lista de Perguntas */}
      <div className="space-y-6">
        {current.map((q, idx) => {
          const value = typeof answers[q.id] === "number" ? answers[q.id] : null;
          const isAnswered = value !== null;

          return (
            <div 
              key={q.id} 
              className={cn(
                "group relative rounded-xl border p-5 transition-all duration-300",
                "bg-card/40 hover:bg-card/60",
                isAnswered ? "border-primary/20 shadow-sm" : "border-border/50"
              )}
            >
              {/* Texto da Pergunta */}
              <div className="flex gap-4 mb-4">
                <span className="text-xs font-mono text-muted-foreground/50 mt-1 block shrink-0">
                  #{start + idx + 1}
                </span>
                <h3 className="text-base font-medium leading-relaxed text-foreground/90">
                  {q.text}
                </h3>
              </div>

              {/* Escala de "Bolinhas" (Botões) - Centralizado */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {Array.from({ length: SCALE_MAX+1 }).map((_, i) => {
                    const isSelected = value === i;
                    // Cores dinâmicas para feedback visual da intensidade
                    const intensityColor = isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted hover:bg-muted-foreground/20 text-muted-foreground";

                    return (
                      <button
                        key={i}
                        onClick={() => onChange({ ...answers, [q.id]: i } as BrainHexAnswers)}
                        className={cn(
                          "h-9 w-9 sm:h-10 sm:w-10 rounded-full text-sm font-semibold transition-all duration-200",
                          "flex items-center justify-center border border-transparent",
                          "focus:outline-none focus:ring-2 focus:ring-primary/30",
                          intensityColor,
                          isSelected && "scale-110 shadow-md ring-2 ring-offset-2 ring-offset-background ring-primary/60"
                        )}
                      >
                        {i}
                      </button>
                    );
                  })}
                </div>
                
                {/* Legendas dos extremos */}
                <div className="flex justify-between px-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 select-none pt-1">
                  <span>Discordo</span>
                  <span>Concordo</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t border-border/40">
        <Button 
          variant="ghost" 
          disabled={page === 0} 
          onClick={() => setPage(Math.max(0, page - 1))}
          className="pl-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Anterior
        </Button>

        {page < totalPages - 1 ? (
          <Button
            onClick={() => {
              if (!validateCurrentPage()) {
                toast.error("Por favor, responda todas as perguntas antes de continuar.");
                return;
              }
              setPage(page + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="px-6"
          >
            Próximo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => {
              if (!validateCurrentPage()) {
                toast.error("Por favor, responda todas as perguntas desta página.");
                return;
              }
              toast.success("Perfil analisado com sucesso!");
            }}
            className="px-6 bg-primary hover:bg-primary/90"
          >
            Finalizar Análise
            <Check className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}