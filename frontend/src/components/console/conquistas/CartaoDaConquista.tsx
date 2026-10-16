import { BookOpen, Flame, Medal, Pencil, Power, Rocket, Star, Target, Trophy, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeloDeStatus } from "../comum/PaginaDoConsole";
import { corDoIconeSobre, NOME_DO_PERFIL } from "../dashboard/perfilCores";
import { COR_PADRAO, corDaConquista, type IconeChave } from "./aparencia";
import type { ConquistaDaTurma } from "./conquistasApi";
import { descreverCriterio } from "./criterio";

const ICONES: Record<IconeChave, LucideIcon> = {
  trofeu: Trophy,
  estrela: Star,
  chama: Flame,
  alvo: Target,
  raio: Zap,
  livro: BookOpen,
  medalha: Medal,
  foguete: Rocket,
};

/** Ícone da conquista sobre a cor dela, com o contraste do ícone escolhido pela luminosidade da cor. */
export function IconeDaConquista({ icone, cor, tamanho = 40 }: { icone: string | undefined; cor: string; tamanho?: number }) {
  const Icone = ICONES[(icone as IconeChave) ?? "trofeu"] ?? Trophy;
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center rounded-full"
      style={{ width: tamanho, height: tamanho, background: cor, color: corDoIconeSobre(cor) }}
    >
      <Icone style={{ width: tamanho * 0.5, height: tamanho * 0.5 }} />
    </span>
  );
}

export function CartaoDaConquista({
  conquista,
  onEditar,
  onAlternar,
}: {
  conquista: ConquistaDaTurma;
  onEditar: () => void;
  onAlternar: () => void;
}) {
  const cor = corDaConquista(conquista.criterio.aparencia?.cor ?? COR_PADRAO, conquista.perfil);
  return (
    <li className={`flex flex-wrap items-center gap-4 rounded-[20px] border bg-card p-5 ${conquista.ativa ? "" : "opacity-70"}`}>
      <IconeDaConquista icone={conquista.criterio.aparencia?.icone} cor={cor} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-base font-bold">{conquista.nome}</h3>
          <SeloDeStatus tom={conquista.ativa ? "ativo" : "neutro"}>{conquista.ativa ? "Ativa" : "Desativada"}</SeloDeStatus>
        </div>
        {conquista.descricao && <p className="mt-1 text-[13px] text-muted-foreground">{conquista.descricao}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span>{descreverCriterio(conquista.criterio.metrica, conquista.criterio.limiar)}</span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1.5">
            {conquista.perfil ? (
              <>
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />
                {NOME_DO_PERFIL[conquista.perfil]}
              </>
            ) : (
              "Geral"
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span>+{conquista.pontos} pts</span>
          {conquista.concedidas > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{conquista.concedidas === 1 ? "1 aluno ganhou" : `${conquista.concedidas} alunos ganharam`}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="rounded-full" onClick={onEditar}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Editar
        </Button>
        <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" onClick={onAlternar}>
          <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {conquista.ativa ? "Desativar" : "Reativar"}
        </Button>
      </div>
    </li>
  );
}
