import { useEffect, useMemo } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  BrainHexAnswers,
  BrainHexProfileKey,
  computeBrainHexResult,
  PROFILES,
  resolveRepresentativeBrainHexResults,
} from "@/features/signup/brainhex";
import { cn } from "@/lib/utils";

type BrainHexResultStepProps = {
  answers: BrainHexAnswers;
  selectedProfile: BrainHexProfileKey | null;
  onSelectProfile: (profile: BrainHexProfileKey) => void;
};

export default function BrainHexResultStep({
  answers,
  selectedProfile,
  onSelectProfile,
}: BrainHexResultStepProps) {
  const result = useMemo(() => computeBrainHexResult(answers), [answers]);
  const representativeProfiles = useMemo(
    () => resolveRepresentativeBrainHexResults(result.sorted),
    [result.sorted],
  );
  const activeProfile =
    representativeProfiles.find((profile) => profile.key === selectedProfile) ??
    representativeProfiles[0];
  const config = PROFILES[activeProfile?.key ?? "seeker"];
  const ActiveIcon = config.icon;

  useEffect(() => {
    if (
      representativeProfiles[0] &&
      !representativeProfiles.some((profile) => profile.key === selectedProfile)
    ) {
      onSelectProfile(representativeProfiles[0].key);
    }
  }, [onSelectProfile, representativeProfiles, selectedProfile]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="space-y-2 text-center">
        <div className="mb-2 inline-flex items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-500">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Análise completa!</h2>
        <p className="text-sm text-zinc-400">
          {representativeProfiles.length > 1
            ? "Escolha por qual dos seus perfis representativos deseja começar."
            : "Este é o perfil que mais representa você."}
        </p>
      </div>

      {representativeProfiles.length > 1 && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-zinc-300">
            Qual perfil você quer usar primeiro?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {representativeProfiles.map((profile) => {
              const profileConfig = PROFILES[profile.key];
              const ProfileIcon = profileConfig.icon;
              const selected = profile.key === activeProfile.key;

              return (
                <button
                  key={profile.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectProfile(profile.key)}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                    selected
                      ? profileConfig.cardStyle
                      : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-600",
                  )}
                >
                  <span className="rounded-lg border border-white/10 bg-zinc-950/60 p-2">
                    <ProfileIcon className={cn("h-5 w-5", profileConfig.textColor)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-white">
                      {profile.label}
                    </span>
                    <span className="text-xs text-zinc-400">{profile.percent}% de afinidade</span>
                  </span>
                  {selected && (
                    <CheckCircle2 className={cn("h-5 w-5", profileConfig.textColor)} />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500">
            Você poderá alternar entre estes perfis depois, na aba Perfil do aplicativo.
          </p>
        </fieldset>
      )}

      <div className="group relative">
        <div
          className={cn(
            "absolute inset-0 opacity-20 blur-2xl transition-opacity duration-500 group-hover:opacity-30",
            config.bgColor,
          )}
        />
        <Card
          className={cn(
            "relative overflow-hidden border bg-zinc-900/50 p-6 backdrop-blur-xl",
            config.cardStyle,
          )}
        >
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/50 shadow-lg">
              <ActiveIcon className={cn("h-10 w-10", config.textColor)} />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Perfil escolhido para começar
              </span>
              <h1 className="text-3xl font-bold text-white">{activeProfile.label}</h1>
              <p className={cn("text-sm font-medium", config.textColor)}>{config.text}</p>
            </div>
            <div className="mt-2 h-4 w-full rounded-full border border-white/5 bg-zinc-950/50 p-0.5">
              <div
                className={cn("h-full rounded-full", config.bgColor)}
                style={{ width: `${activeProfile.percent}%` }}
              />
            </div>
            <span className="font-mono text-xs text-zinc-500">
              {activeProfile.percent}% de compatibilidade
            </span>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="pl-1 text-sm font-medium text-zinc-400">Composição detalhada</h3>
        <div className="grid gap-3">
          {result.sorted.map((profile) => {
            const profileConfig = PROFILES[profile.key];
            const ProfileIcon = profileConfig.icon;
            return (
              <div
                key={profile.key}
                className="flex items-center gap-4 rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-3"
              >
                <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2 text-zinc-400">
                  <ProfileIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-zinc-200">{profile.label}</span>
                    <span className="font-mono text-xs text-zinc-500">{profile.percent}%</span>
                  </div>
                  <Progress
                    value={profile.percent}
                    className="h-1.5 bg-zinc-950"
                    indicatorClassName={cn(profileConfig.bgColor, "opacity-80")}
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
