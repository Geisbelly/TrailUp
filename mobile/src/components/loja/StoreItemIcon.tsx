import { journeyObjects } from "@/constants/designAssets";
import { storeIconKind } from "@/services/loja/storeTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ProfileArtwork } from "@/components/ProfileArtwork";

export function StoreMarkIcon({
  color,
  size = 22,
}: {
  color: string;
  size?: number;
}) {
  return (
    <MaterialCommunityIcons
      name="storefront-outline"
      size={size}
      color={color}
    />
  );
}

export function StoreItemIcon({
  effect,
  color,
  size = 52,
}: {
  effect?: string | null;
  color: string;
  size?: number;
}) {
  const kind = storeIconKind(effect);
  const artwork =
    kind === "deadline"
      ? journeyObjects.deadline
      : kind === "retry"
        ? journeyObjects.retry
        : kind === "format"
          ? journeyObjects.book
          : journeyObjects.hint;
  return (
    <ProfileArtwork
      source={artwork}
      color={color}
      width={size}
    />
  );
}
