import React from "react";
import { SocialPersonCard } from "./SocialPersonCard";
import type { SocialPerson } from "@/services/social/socialModel";
export function SocialInviteCard({ person, accent, onAccept, onDecline }: { person: SocialPerson; accent: string; onAccept: () => void; onDecline: () => void }) {
  return <SocialPersonCard person={person} accent={accent} actionLabel="Aceitar" onAction={onAccept} secondaryLabel="Recusar" onSecondary={onDecline} />;
}

