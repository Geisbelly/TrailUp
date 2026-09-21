import { UtilityIcon } from "@/components/UtilityIcon";

export type JourneySection = "social" | "ranking" | "notifications" | "achievements" | "bag" | "store" | "settings";

/** Section artwork follows the active guide. */
export function JourneySymbol({ section, size = 58 }: {
  section: JourneySection;
  size?: number;
}) {
  return <UtilityIcon kind={section} size={size} />;
}
