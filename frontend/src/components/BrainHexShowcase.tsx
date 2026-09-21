import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PROFILE_WORLDS } from "@/lib/design-art";
import { useInView } from "@/hooks/useInView";

export default function BrainHexShowcase() {
  const [selected, setSelected] = useState("mastermind");
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <section className="journey-profiles" id="perfis" aria-labelledby="profiles-title">
      <div ref={ref} className="journey-width journey-section-heading" data-revealed={inView}>
        <p className="journey-eyebrow">Os guardiões da trilha</p>
        <h2 id="profiles-title">Encontre <em>seu guia.</em></h2>
        <p>Sete jeitos de aprender. Um caminho que tem a ver com você.</p>
      </div>
      <Tabs value={selected} onValueChange={setSelected} className="profile-worlds">
        <TabsList className="profile-world-tabs" aria-label="Perfis de aprendizado">
          {PROFILE_WORLDS.map(profile => (
            <TabsTrigger key={profile.key} value={profile.key} title={profile.label} className="profile-world-tab" style={{ "--profile-color": profile.color } as CSSProperties}>
              <img src={profile.emblem} alt="" width="64" height="64" loading="lazy" />
              <span>{profile.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {PROFILE_WORLDS.map(profile => (
          <TabsContent key={profile.key} value={profile.key} data-profile={profile.key} className="profile-world-panel" style={{ "--profile-color": profile.color } as CSSProperties}>
            <div className="profile-world-visual">
              <figure className="profile-guide-stage" style={{ "--guide-floor": `${profile.guide.floor}%` } as CSSProperties}>
                <img className="profile-guide-terrain" src={profile.guide.scene} alt={`Cenário do perfil ${profile.label}`} width="1600" height="900" loading="lazy" />
                <div className="profile-guide-figure" style={{
                  width: `${Math.min(28, 55 * 9 / 16 * profile.guide.grounding.width / profile.guide.grounding.height)}%`,
                  aspectRatio: `${profile.guide.grounding.width} / ${profile.guide.grounding.height}`,
                  "--guide-baseline-offset": `${100 * (profile.guide.grounding.height - profile.guide.grounding.baseline) / profile.guide.grounding.height}%`,
                } as CSSProperties}>
                  {profile.guide.grounding.contacts.map((contact, index) => (
                    <span key={index} className="profile-guide-contact" aria-hidden="true" style={{
                      left: `${100 * contact.x / profile.guide.grounding.width}%`,
                      top: `${100 * contact.y / profile.guide.grounding.height}%`,
                      width: `${100 * contact.width / profile.guide.grounding.width}%`,
                    }} />
                  ))}
                  <img className="profile-guide-art" src={profile.guide.art} alt={`${profile.guide.name}, guia do perfil ${profile.label}`} width={profile.guide.grounding.width} height={profile.guide.grounding.height} loading="lazy" />
                </div>
              </figure>
              <div className="profile-world-shade" aria-hidden="true" />
            </div>
            <div className="journey-width profile-world-content">
              <div className="profile-world-copy">
                <img className="profile-panel-emblem" src={profile.emblem} alt="" width="80" height="80" loading="lazy" />
                <p className="journey-eyebrow">{profile.label}</p>
                <h3>{profile.guide.name}</h3>
                <p className="profile-guide-title">{profile.guide.title}</p>
                <p className="profile-world-motto">{profile.title}</p>
                <p className="profile-world-description">{profile.description}</p>
                <Link to="/cadastro-aluno" className="journey-link">Descobrir meu perfil <ArrowRight size={18} /></Link>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
