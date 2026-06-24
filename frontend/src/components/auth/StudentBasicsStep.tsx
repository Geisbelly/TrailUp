import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, AtSign, Sparkles } from "lucide-react";

export type StudentBasics = {
  nome: string;
  apelido: string;
};

export default function StudentBasicsStep({
  value,
  onChange,
}: {
  value: StudentBasics;
  onChange: (next: StudentBasics) => void;
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="text-center space-y-2 mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-medium text-white">Vamos começar pelo básico</h3>
        <p className="text-sm text-zinc-400">
          Precisamos saber quem você é para personalizar sua jornada.
        </p>
      </div>

      <div className="space-y-4">
        {/* Campo Nome */}
        <div className="space-y-2">
          <Label className="text-zinc-300 ml-1">Nome completo</Label>
          <div className="relative group">
            <User className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors duration-300" />
            <Input
              value={value.nome}
              onChange={(e) => onChange({ ...value, nome: e.target.value })}
              className="pl-10 h-11 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:ring-primary/20 focus:border-primary/50 transition-all duration-300"
              placeholder="Digite seu nome real"
            />
          </div>
        </div>

        {/* Campo Apelido */}
        <div className="space-y-2">
          <Label className="text-zinc-300 ml-1">Apelido (Nick)</Label>
          <div className="relative group">
            <AtSign className="absolute left-3 top-3 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors duration-300" />
            <Input
              value={value.apelido}
              onChange={(e) => onChange({ ...value, apelido: e.target.value })}
              className="pl-10 h-11 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:ring-primary/20 focus:border-primary/50 transition-all duration-300"
              placeholder="Como quer aparecer nos rankings?"
            />
          </div>
          <p className="text-[11px] text-zinc-500 ml-1">
            Esse será o nome visível para outros jogadores e professores.
          </p>
        </div>
      </div>
    </div>
  );
}