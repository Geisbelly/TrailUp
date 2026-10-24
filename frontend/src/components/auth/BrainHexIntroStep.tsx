import {PROFILES} from "@/features/signup/brainhex"
import { Info } from "lucide-react";
import { BrainHexProfileCards } from "@/components/auth/BrainHexProfileCards";

export default function BrainHexIntroStep() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Section */}
      <div className="space-y-2 text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Explore suas preferências
        </h2>
        <p className="text-muted-foreground max-w-2xl">
          Usamos nomes inspirados no BrainHex para sugerir experiências de estudo.
          No próximo passo, avalie de <b>0 a 5</b> o quanto cada afirmação combina com você hoje.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {Object.values(PROFILES).map((p) => {
          
          return (
            <BrainHexProfileCards
              key={p.key}
              title={p.title}
              text={p.text}
              icon={p.icon}></BrainHexProfileCards>
          );
        })}
      </div>

      {/* Info Footer */}
      <div className="rounded-lg border border-primary/10 bg-primary/5 p-4 flex gap-3 items-start text-sm text-muted-foreground">
        <Info className="h-5 w-5 text-primary/60 shrink-0 mt-0.5" />
        <p>
          Este questionário é uma adaptação exploratória do TrailUp, ainda sem validação
          com seu público. Ele não mede capacidade nem determina como você aprende melhor.
          Você escolherá por qual das sugestões deseja começar.
        </p>
      </div>
    </div>
  );
}