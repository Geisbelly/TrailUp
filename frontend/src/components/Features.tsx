import { DESIGN_ART } from "@/lib/design-art";

const features = [
  { id: "trilhas", art: DESIGN_ART.map, number: "01", title: "Abra novos caminhos", text: "Uma trilha de aprendizado, uma descoberta de cada vez." },
  { id: "conhecimento", art: DESIGN_ART.book, number: "02", title: "Aprenda do seu jeito", text: "Conhecimento que acompanha seu ritmo e sua forma de pensar." },
  { id: "conquistas", art: DESIGN_ART.trophy, number: "03", title: "Celebre cada conquista", text: "Desafios, emblemas e a satisfação de ver o quanto você evoluiu." },
  { id: "comunidade", art: DESIGN_ART.community, number: "04", title: "Vá mais longe, junto", text: "Colegas de jornada para compartilhar o que você descobriu." },
];

export default function Features() {
  return (
    <section className="journey-features" id="experiencia" aria-labelledby="experience-title">
      <div className="journey-width feature-content">
        <div className="journey-section-heading">
          <p className="journey-eyebrow">A jornada</p>
          <h2 id="experience-title">Aprender é explorar<br /><em>o que vem a seguir.</em></h2>
          <p>Pequenos passos. Novas ideias. Um universo para descobrir.</p>
        </div>
        <div className="journey-feature-grid">
          {features.map(feature => (
            <article key={feature.id} id={feature.id} className="journey-feature">
              <div className="feature-art"><img src={feature.art} alt="" loading="lazy" width="160" height="160" /></div>
              <div>
                <span className="feature-number">{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
