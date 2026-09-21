import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Hero from "@/components/Hero";
import BrainHexShowcase from "@/components/BrainHexShowcase";
import Features from "@/components/Features";
import Download from "@/components/Download";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
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
        <BrainHexShowcase />
        <Download />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
