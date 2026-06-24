import { Check, Star, Lock, Gift, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface TopicoStatus {
  id: number;
  nome: string;
  status: 'concluido' | 'disponivel' | 'bloqueado';
  percentual: number;
}

interface StudentTrailVisualizationProps {
  studentName: string;
  classeName: string;
  xp: number;
  xpTotal: number;
  topicos: TopicoStatus[];
  perfilDominante: string;
  viewMode?: 'hexagon' | 'list';
}

// Cores baseadas no perfil BrainHex dominante
const PROFILE_COLORS: Record<string, { primary: string; glow: string; bg: string }> = {
  Achiever: { primary: 'hsl(142 76% 36%)', glow: 'hsl(142 76% 50%)', bg: 'hsl(142 76% 36% / 0.2)' },
  Seeker: { primary: 'hsl(217 91% 60%)', glow: 'hsl(217 91% 70%)', bg: 'hsl(217 91% 60% / 0.2)' },
  Mastermind: { primary: 'hsl(262 83% 58%)', glow: 'hsl(262 83% 70%)', bg: 'hsl(262 83% 58% / 0.2)' },
  Conqueror: { primary: 'hsl(0 72% 51%)', glow: 'hsl(0 72% 65%)', bg: 'hsl(0 72% 51% / 0.2)' },
  Socializer: { primary: 'hsl(330 81% 60%)', glow: 'hsl(330 81% 75%)', bg: 'hsl(330 81% 60% / 0.2)' },
  Daredevil: { primary: 'hsl(32 95% 44%)', glow: 'hsl(32 95% 60%)', bg: 'hsl(32 95% 44% / 0.2)' },
  Survivor: { primary: 'hsl(199 89% 48%)', glow: 'hsl(199 89% 60%)', bg: 'hsl(199 89% 48% / 0.2)' },
};

const HexagonNode = ({ 
  topico, 
  colors, 
  isLast 
}: { 
  topico: TopicoStatus; 
  colors: typeof PROFILE_COLORS.Achiever;
  isLast: boolean;
}) => {
  const getStatusIcon = () => {
    switch (topico.status) {
      case 'concluido':
        return <Check className="w-8 h-8 text-white" />;
      case 'disponivel':
        return <Star className="w-8 h-8 text-white" />;
      case 'bloqueado':
        return <Lock className="w-6 h-6 text-muted-foreground" />;
    }
  };

  const getStatusStyles = () => {
    switch (topico.status) {
      case 'concluido':
        return {
          bg: colors.primary,
          border: colors.glow,
          shadow: `0 0 20px ${colors.glow}`,
          opacity: 1,
        };
      case 'disponivel':
        return {
          bg: colors.bg,
          border: colors.primary,
          shadow: `0 0 30px ${colors.glow}`,
          opacity: 1,
        };
      case 'bloqueado':
        return {
          bg: 'hsl(var(--muted))',
          border: 'hsl(var(--border))',
          shadow: 'none',
          opacity: 0.5,
        };
    }
  };

  const styles = getStatusStyles();

  return (
    <div className="flex flex-col items-center">
      {/* Hexagon Container */}
      <div 
        className="relative"
        style={{ opacity: styles.opacity }}
      >
        {/* Hexagon Shape */}
        <div 
          className="w-24 h-24 flex items-center justify-center relative"
          style={{
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            backgroundColor: styles.bg,
            boxShadow: styles.shadow,
          }}
        >
          {/* Inner border effect */}
          <div 
            className="absolute inset-1 flex items-center justify-center"
            style={{
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
              border: `2px solid ${styles.border}`,
            }}
          >
            {getStatusIcon()}
          </div>
        </div>
        
        {/* Glow effect for disponivel */}
        {topico.status === 'disponivel' && (
          <div 
            className="absolute inset-0 animate-pulse"
            style={{
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
              background: `linear-gradient(to bottom, ${colors.glow} 0%, transparent 100%)`,
              opacity: 0.3,
            }}
          />
        )}
      </div>

      {/* Topic Name Badge */}
      <div 
        className={cn(
          "mt-2 px-4 py-2 rounded-lg text-sm font-medium text-center max-w-[140px]",
          topico.status === 'bloqueado' ? "bg-muted text-muted-foreground" : "text-white"
        )}
        style={{
          backgroundColor: topico.status !== 'bloqueado' ? colors.primary : undefined,
        }}
      >
        {topico.nome}
      </div>

      {/* Status Label */}
      <span className={cn(
        "text-xs mt-1",
        topico.status === 'concluido' && "text-green-500",
        topico.status === 'disponivel' && "text-primary",
        topico.status === 'bloqueado' && "text-muted-foreground"
      )}>
        {topico.status === 'concluido' && 'Concluído'}
        {topico.status === 'disponivel' && 'Disponível'}
        {topico.status === 'bloqueado' && 'Bloqueado'}
      </span>

      {/* Connection Line */}
      {!isLast && (
        <div 
          className="w-0.5 h-8 mt-2"
          style={{ 
            backgroundColor: topico.status !== 'bloqueado' ? colors.primary : 'hsl(var(--border))',
          }}
        >
          <div 
            className="w-2 h-2 rounded-full mx-auto mt-6"
            style={{ 
              backgroundColor: topico.status !== 'bloqueado' ? colors.primary : 'hsl(var(--border))',
            }}
          />
        </div>
      )}
    </div>
  );
};

const ListNode = ({ 
  topico, 
  colors 
}: { 
  topico: TopicoStatus; 
  colors: typeof PROFILE_COLORS.Achiever;
}) => {
  const getStatusIcon = () => {
    switch (topico.status) {
      case 'concluido':
        return <Check className="w-5 h-5" />;
      case 'disponivel':
        return <Gift className="w-5 h-5" />;
      case 'bloqueado':
        return <Lock className="w-5 h-5" />;
    }
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border-2 transition-all",
        topico.status === 'concluido' && "border-primary/50 bg-primary/10",
        topico.status === 'disponivel' && "border-primary bg-primary/20 shadow-lg",
        topico.status === 'bloqueado' && "border-muted bg-muted/30 opacity-60"
      )}
      style={{
        borderColor: topico.status !== 'bloqueado' ? colors.primary : undefined,
        boxShadow: topico.status === 'disponivel' ? `0 0 20px ${colors.glow}` : undefined,
      }}
    >
      {/* Hexagon Icon */}
      <div 
        className={cn(
          "w-14 h-14 flex items-center justify-center",
          topico.status === 'bloqueado' && "text-muted-foreground"
        )}
        style={{
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          backgroundColor: topico.status !== 'bloqueado' ? colors.primary : 'hsl(var(--muted))',
          color: topico.status !== 'bloqueado' ? 'white' : undefined,
        }}
      >
        {getStatusIcon()}
      </div>

      {/* Content */}
      <div className="flex-1">
        <h4 className={cn(
          "font-semibold",
          topico.status === 'bloqueado' && "text-muted-foreground"
        )}>
          {topico.nome}
        </h4>
        <p className="text-sm text-muted-foreground">
          {topico.status === 'concluido' && 'Concluído'}
          {topico.status === 'disponivel' && 'Disponível'}
          {topico.status === 'bloqueado' && 'Bloqueado'}
        </p>
      </div>

      {/* Arrow */}
      <ChevronRight className={cn(
        "w-5 h-5",
        topico.status === 'bloqueado' && "text-muted-foreground"
      )} />
    </div>
  );
};

export default function StudentTrailVisualization({
  studentName,
  classeName,
  xp,
  xpTotal,
  topicos,
  perfilDominante,
  viewMode = 'hexagon',
}: StudentTrailVisualizationProps) {
  const colors = PROFILE_COLORS[perfilDominante] || PROFILE_COLORS.Mastermind;
  const xpPercentage = (xp / xpTotal) * 100;

  return (
    <Card className="overflow-hidden">
      <CardHeader 
        className="text-white"
        style={{ backgroundColor: colors.primary }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80">TRILHA</p>
            <CardTitle className="text-2xl">{classeName}</CardTitle>
          </div>
          <Badge 
            variant="secondary" 
            className="text-sm"
            style={{ backgroundColor: colors.bg, color: colors.primary }}
          >
            {perfilDominante}
          </Badge>
        </div>
        
        {/* XP Progress */}
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Progresso</span>
            <span>XP {xp}/{xpTotal}</span>
          </div>
          <Progress 
            value={xpPercentage} 
            className="h-2 bg-white/20"
          />
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground mb-4">
          Visualizando trilha de <strong>{studentName}</strong>
        </p>

        {viewMode === 'hexagon' ? (
          <div className="flex flex-col items-center gap-2 py-6">
            {topicos.map((topico, index) => (
              <HexagonNode 
                key={topico.id} 
                topico={topico} 
                colors={colors}
                isLast={index === topicos.length - 1}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {topicos.map((topico) => (
              <ListNode 
                key={topico.id} 
                topico={topico} 
                colors={colors}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
