import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Hero from "@/components/Hero";
import BrainHexShowcase from "@/components/BrainHexShowcase";
import Features from "@/components/Features";
import Download from "@/components/Download";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import VideoDoSite from "@/components/VideoDoSite";
const Index = () => {
  const { hash } = useLocation();

  useEffect(() => {
    // The lazy route mounts after the browser's initial anchor lookup.
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <div className="immersive-site">
      <Header />
      <main>
        <div className="journey-opening">
          <Hero />
          <div id="features">
            <Features />
          </div>
        </div>
        <section id="video" className="journey-width space-y-8 py-16" aria-labelledby="video-title">
          <div className="journey-section-heading">
            <p className="journey-eyebrow">Em vídeo</p>
            <h2 id="video-title">O TrailUp em <em>três minutos.</em></h2>
            <p>A mesma aula chega de um jeito diferente para cada aluno.</p>
          </div>
          <VideoDoSite slug="apresentacao" />
        </section>
        <BrainHexShowcase />
        <Download />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
