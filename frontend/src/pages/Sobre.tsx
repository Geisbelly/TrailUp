import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART } from "@/lib/design-art";
import VideoDoSite from "@/components/VideoDoSite";
import { CAMINHO_DA_CARTILHA } from "@/features/pesquisa/pesquisaProfessores";

const values = [
  { art: DESIGN_ART.compass, title: "Personalização", text: "O conteúdo da aula chega no tom e no ritmo de cada perfil, e o professor revisa antes de liberar." },
  { art: DESIGN_ART.trophy, title: "Engajamento", text: "Missões, conquistas e eventos marcam cada passo do aluno na trilha." },
  { art: DESIGN_ART.community, title: "Comunidade", text: "Guildas e metas da turma para quem aprende melhor junto." },
];

export default function Sobre() {
  return (
    <PublicLayout scene={DESIGN_ART.dawn}>
      <PublicPageTitle title="Sobre o TrailUp" eyebrow="Nossa história">
        Um aplicativo de estudo para o ensino superior, em que o mesmo conteúdo chega a cada aluno de um jeito diferente.
      </PublicPageTitle>
      <section className="public-band public-editorial">
        <div><h2>De onde veio</h2><p>O TrailUp nasceu de uma inquietação com a educação no Brasil: faltam recursos, e alunos com tipos de inteligência diferentes acabam deixados para trás num ensino que trata todo mundo do mesmo jeito. A ideia virou o Trabalho de Conclusão de Curso de Geisbelly Victória, em Ciência da Computação na Ulbra Palmas.</p></div>
        <div><h2>Como funciona</h2><p>O professor cadastra o conteúdo da aula. Para cada tópico, o TrailUp gera texto, áudio e apresentação nos sete perfis do BrainHex, e o professor revisa o material antes de ele chegar à turma. No aplicativo, o aluno segue a trilha como um mapa, com o guia do seu perfil.</p></div>
      </section>
      <section className="public-band" aria-labelledby="video-title">
        <div className="public-page-title mb-10">
          <h2 id="video-title">Para quem dá aula</h2>
          <p>Um guia do console inteiro, do cadastro às métricas da turma, com uma turma de exemplo do começo ao fim.</p>
        </div>
        <VideoDoSite slug="guia-do-professor" />
      </section>
      <section className="public-band" aria-labelledby="values-title">
        <h2 id="values-title">O que nos move</h2>
        <div className="public-art-row">{values.map(value => <article key={value.title}><img src={value.art} alt="" width="96" height="96" /><h3>{value.title}</h3><p>{value.text}</p></article>)}</div>
      </section>
      <section className="public-band public-editorial">
        <div><h2>A pesquisa</h2><p>O TrailUp está em avaliação. Nesta fase, professores e pedagogos usam o sistema numa turma de demonstração e respondem a um questionário; o teste com alunos em sala vem depois. O perfil do BrainHex indica preferências de engajamento, e quem decide o que chega à turma é o professor.</p></div>
        <div className="flex flex-col items-start justify-center gap-4"><Link className="journey-button journey-button-coral" to="/cadastro-aluno">Começar minha jornada <ArrowRight size={18} /></Link><Link className="journey-link" to="/blog/pesquisa-tcc">Ler sobre a pesquisa <ArrowRight size={16} /></Link><Link className="journey-link" to={CAMINHO_DA_CARTILHA}>Avaliar o TrailUp como professor <ArrowRight size={16} /></Link></div>
      </section>
    </PublicLayout>
  );
}
