import { storeIconKind } from "@/services/loja/storeTheme";
import { UtilityIcon } from "@/components/UtilityIcon";

export function StoreMarkIcon({
  size = 34,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <UtilityIcon kind="store" size={size} />
  );
}

export function StoreItemIcon({
  effect,
  size = 52,
}: {
  effect?: string | null;
  color: string;
  size?: number;
}) {
  const kind = storeIconKind(effect);
  return <UtilityIcon kind={kind === "format" ? "book" : kind} size={size} />;
}
