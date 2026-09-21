



export function BrainHexProfileCards(p:{ title: string; text: string; icon: React.ComponentType<{ className?: string }> }) {
    const Icon = p.icon;
  return (
    <div
              className="group relative overflow-hidden rounded-lg border border-border/50 bg-card/50 p-5 transition-all duration-300 hover:border-primary/50 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 relative">
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-muted border border-border">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <h3 className="font-semibold text-base leading-snug tracking-tight break-words group-hover:text-primary transition-colors duration-300">
                    {p.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {p.text}
                  </p>
                </div>
              </div>
            </div>
  );
}
