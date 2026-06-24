import {PROFILES} from "@/features/signup/brainhex"
import { Info } from "lucide-react";
import { BrainHexProfileCards } from "@/components/auth/BrainHexProfileCards";

export default function BrainHexIntroStep() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Section */}
      <div className="space-y-2 text-center md:text-left">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Descubra seu Perfil BrainHex
        </h2>
        <p className="text-muted-foreground max-w-2xl">
          Abaixo estão os perfis que compõem sua identidade de aprendizado.
          No próximo passo, você avaliará de <b>0 a 10</b> o quanto se identifica com cada um.
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
          Não existe perfil certo ou errado. O resultado servirá apenas para personalizar sua 
          jornada no <span className="font-semibold text-primary">TrailUp</span>.
        </p>
      </div>
    </div>
  );
}