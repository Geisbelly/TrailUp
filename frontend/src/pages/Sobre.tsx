import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART } from "@/lib/design-art";

const values = [
  { art: DESIGN_ART.compass, title: "Personalização", text: "Cada aluno recebe uma trilha adaptada ao seu perfil de aprendizado." },
  { art: DESIGN_ART.trophy, title: "Engajamento", text: "Desafios e conquistas que dão significado a cada etapa da jornada." },
  { art: DESIGN_ART.community, title: "Comunidade", text: "Aprendizado colaborativo, troca de descobertas e suporte mútuo." },
];

export default function Sobre() {
  return (
    <PublicLayout scene={DESIGN_ART.dawn}>
      <PublicPageTitle title="Sobre o TrailUp" eyebrow="Nossa história">
        Educação universitária, gamificação e um caminho de aprendizado que respeita cada aluno.
      </PublicPageTitle>
      <section className="public-band public-editorial">
        <div><h2>Nossa missão</h2><p>O TrailUp nasceu para transformar a forma como universitários aprendem. Acreditamos que cada estudante merece uma experiência que respeite suas preferências, motivações e estilo cognitivo.</p></div>
        <div><h2>Uma ideia que virou jornada</h2><p>O projeto começou como um TCC para investigar como gamificação e personalização podem melhorar o engajamento de estudantes universitários. A pesquisa e a prototipagem deram origem à adaptação do modelo BrainHex ao contexto educacional.</p></div>
      </section>
      <section className="public-band" aria-labelledby="values-title">
        <h2 id="values-title">O que nos move</h2>
        <div className="public-art-row">{values.map(value => <article key={value.title}><img src={value.art} alt="" width="96" height="96" /><h3>{value.title}</h3><p>{value.text}</p></article>)}</div>
      </section>
      <section className="public-band public-editorial">
        <div><h2>Tecnologia e ciência</h2><p>O modelo BrainHex, a personalização e a análise de progresso orientam a construção de trilhas. Professores acompanham suas turmas, enquanto os alunos descobrem diferentes formas de aprender.</p></div>
        <div className="flex flex-col items-start justify-center gap-4"><Link className="journey-button journey-button-coral" to="/cadastro-aluno">Começar minha jornada <ArrowRight size={18} /></Link><Link className="journey-link" to="/blog/pesquisa-tcc">Conhecer a pesquisa <ArrowRight size={16} /></Link></div>
      </section>
    </PublicLayout>
  );
}
