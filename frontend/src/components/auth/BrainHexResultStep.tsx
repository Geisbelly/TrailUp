import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Trophy, Compass, Shield, Zap, Brain, Users, CheckCircle2,
  Sparkles, Share2, ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrainHexAnswers, computeBrainHexResult, PROFILES } from "@/features/signup/brainhex";



export default function BrainHexResultStep({ answers }: { answers: BrainHexAnswers }) {
  const result = computeBrainHexResult(answers);
  const topProfile = result.sorted[0];
  const config = PROFILES[topProfile.key.toLowerCase()] || PROFILES.seeker;
  const TopIcon = config.icon;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

      {/* Header de Sucesso */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-2 rounded-full bg-emerald-500/10 text-emerald-500 mb-2 border border-emerald-500/20">
          <Sparkles className="w-5 h-5" />
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Análise Completa!</h2>
        <p className="text-zinc-400 text-sm">Aqui está o seu perfil.</p>
      </div>

      {/* Card do Vencedor (Top Profile) */}
      <div className="relative group">
        <div className={cn(
          "absolute inset-0 blur-2xl opacity-20 transition-opacity duration-500 group-hover:opacity-30",
          config.bgColor
        )} />

        <Card className={cn(
          "relative p-6 border backdrop-blur-xl bg-zinc-900/50 overflow-hidden",
          config.cardStyle
        )}>
          <div className="flex flex-col items-center text-center space-y-4">
            <div className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:scale-110",
              "bg-zinc-950/50 border border-white/10"
            )}>
              <TopIcon className={cn("w-10 h-10", config.textColor)} />
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase tracking-widest font-semibold text-zinc-500">Seu Arquétipo Principal</span>
              <h1 className="text-3xl font-bold text-white">{topProfile.label}</h1>
              <p className={cn("text-sm font-medium", config.textColor)}>
                {config.text}
              </p>
            </div>

            <div className="w-full bg-zinc-950/50 rounded-full h-4 p-0.5 border border-white/5 mt-2">
              <div
                className={cn("h-full rounded-full transition-all duration-1000 ease-out", config.bgColor)}
                style={{ width: `${topProfile.percent}%` }}
              />
            </div>
            <span className="text-xs font-mono text-zinc-500">{topProfile.percent}% de compatibilidade</span>
          </div>
        </Card>
      </div>

      {/* Lista de Detalhes (Outros Perfis) */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-zinc-400 pl-1">Composição Detalhada</h3>
        <div className="grid gap-3">
          {result.sorted.slice(1).map((p, index) => {
            const subConfig = PROFILES[p.key.toLowerCase()] || PROFILES.seeker;
            const SubIcon = subConfig.icon;

            return (
              <div
                key={p.key}
                className="group/item flex items-center gap-4 p-3 rounded-lg border border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-300"
              >
                <div className="p-2 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-400 group-hover/item:text-zinc-200 transition-colors">
                  <SubIcon className="w-4 h-4" />
                </div>

                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-zinc-200">{p.label}</span>
                    <span className="text-zinc-500 text-xs font-mono">{p.percent}%</span>
                  </div>
                  <Progress
                    value={p.percent}
                    className="h-1.5 bg-zinc-950"
                    indicatorClassName={cn(subConfig.bgColor, "opacity-70 group-hover/item:opacity-100 transition-opacity")}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
