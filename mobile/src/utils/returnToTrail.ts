import type { Router } from 'expo-router';

export function returnToTrail(router: Pick<Router, 'canGoBack' | 'back' | 'replace'>) {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/trilha');
}
