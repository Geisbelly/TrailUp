



export function BrainHexProfileCards(p:{ key: string; title: string; text: string; icon:    React.ComponentType<{ className?: string }> }) {
    const Icon = p.icon;
  return (
    <div
              key={p.key}
              className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 p-5 transition-all duration-300 hover:border-primary/50 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-start gap-4">
                {/* Icon Container with Glow Effect */}
                <div className="shrink-0 relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 group-hover:scale-105 transition-transform duration-300">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-semibold text-base leading-none tracking-tight group-hover:text-primary transition-colors duration-300">
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
