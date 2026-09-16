import type { ImageSourcePropType } from 'react-native';
import { normalizeBrainHexProfile, type BrainHexProfile } from './brainHexProfiles';

export const designStar: ImageSourcePropType = require('@/assets/design/trailup-star.png');
export const publicScenery: ImageSourcePropType = require('@/assets/design/entry-world.webp');

export const journeyObjects = {
  trophy: require('@/assets/design/object-trophy.png'),
  gold: require('@/assets/design/object-gold.png'),
  silver: require('@/assets/design/object-silver.png'),
  bronze: require('@/assets/design/object-bronze.png'),
  bag: require('@/assets/design/object-bag.png'),
  chest: require('@/assets/design/object-chest.png'),
  bell: require('@/assets/design/object-bell.png'),
  deadline: require('@/assets/design/object-deadline.png'),
  hint: require('@/assets/design/object-hint.png'),
  book: require('@/assets/design/object-book.png'),
  retry: require('@/assets/design/object-retry.png'),
  community: require('@/assets/design/object-community.png'),
  coin: require('@/assets/design/object-coin.png'),
  compass: require('@/assets/design/object-compass.png'),
  calendar: require('@/assets/design/object-calendar.png'),
  bolt: require('@/assets/design/object-bolt.png'),
  completion: require('@/assets/design/object-completion.png'),
  map: require('@/assets/design/object-map.png'),
  steps: require('@/assets/design/object-steps.png'),
} satisfies Record<string, ImageSourcePropType>;

export const profileEmblems: Record<BrainHexProfile, ImageSourcePropType> = {
  seeker: require('@/assets/design/emblem-seeker.png'),
  survivor: require('@/assets/design/emblem-survivor.png'),
  daredevil: require('@/assets/design/emblem-daredevil.png'),
  mastermind: require('@/assets/design/emblem-mastermind.png'),
  conqueror: require('@/assets/design/emblem-conqueror.png'),
  socializer: require('@/assets/design/emblem-socializer.png'),
  achiever: require('@/assets/design/emblem-achiever.png'),
};

export const profileBanners: Record<BrainHexProfile, ImageSourcePropType> = {
  seeker: require('@/assets/design/world-seeker.webp'),
  survivor: require('@/assets/design/world-survivor.webp'),
  daredevil: require('@/assets/design/world-daredevil.webp'),
  mastermind: require('@/assets/design/world-mastermind.webp'),
  conqueror: require('@/assets/design/world-conqueror.webp'),
  socializer: require('@/assets/design/world-socializer.webp'),
  achiever: require('@/assets/design/world-achiever.webp'),
};

export const journeyMaps: Record<BrainHexProfile, ImageSourcePropType> = {
  seeker: require('@/assets/design/map-seeker.webp'),
  survivor: require('@/assets/design/map-survivor.webp'),
  daredevil: require('@/assets/design/map-daredevil.webp'),
  mastermind: require('@/assets/design/map-mastermind.webp'),
  conqueror: require('@/assets/design/map-conqueror.webp'),
  socializer: require('@/assets/design/map-socializer.webp'),
  achiever: require('@/assets/design/map-achiever.webp'),
};

export const profileFrames: Record<BrainHexProfile, ImageSourcePropType> = {
  seeker: require('@/assets/design/frame-seeker.png'),
  survivor: require('@/assets/design/frame-survivor.png'),
  daredevil: require('@/assets/design/frame-daredevil.png'),
  mastermind: require('@/assets/design/frame-mastermind.png'),
  conqueror: require('@/assets/design/frame-conqueror.png'),
  socializer: require('@/assets/design/frame-socializer.png'),
  achiever: require('@/assets/design/frame-achiever.png'),
};

export const profileTotems: Record<BrainHexProfile, ImageSourcePropType> = {
  seeker: require('@/assets/design/totem-seeker.png'),
  survivor: require('@/assets/design/totem-survivor.png'),
  daredevil: require('@/assets/design/totem-daredevil.png'),
  mastermind: require('@/assets/design/totem-mastermind.png'),
  conqueror: require('@/assets/design/totem-conqueror.png'),
  socializer: require('@/assets/design/totem-socializer.png'),
  achiever: require('@/assets/design/totem-achiever.png'),
};

export const trailSceneries: Record<BrainHexProfile, ImageSourcePropType> = {
  seeker: require('@/assets/design/trail-seeker.webp'),
  survivor: require('@/assets/design/trail-survivor.webp'),
  daredevil: require('@/assets/design/trail-daredevil.webp'),
  mastermind: require('@/assets/design/trail-mastermind.webp'),
  conqueror: require('@/assets/design/trail-conqueror.webp'),
  socializer: require('@/assets/design/trail-socializer.webp'),
  achiever: require('@/assets/design/trail-achiever.webp'),
};

export const rankingArenas: Record<BrainHexProfile, ImageSourcePropType> = {
  seeker: require('@/assets/design/arena-seeker.webp'),
  survivor: require('@/assets/design/arena-survivor.webp'),
  daredevil: require('@/assets/design/arena-daredevil.webp'),
  mastermind: require('@/assets/design/arena-mastermind.webp'),
  conqueror: require('@/assets/design/arena-conqueror.webp'),
  socializer: require('@/assets/design/arena-socializer.webp'),
  achiever: require('@/assets/design/arena-achiever.webp'),
};

export function getProfileArtwork(profile: string | null | undefined, placement: 'banner' | 'map' | 'trail' | 'rank'): ImageSourcePropType {
  const assets = placement === 'banner' ? profileBanners : placement === 'map' ? journeyMaps : placement === 'rank' ? rankingArenas : trailSceneries;
  return assets[normalizeBrainHexProfile(profile) ?? 'mastermind'];
}
