import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Download from "@/components/Download";
import Footer from "@/components/Footer";
import Header from "@/components/Header";



const Index = () => {
  
  return (
    <div className="min-h-screen">
      <Header/>
      <Hero />
      <div id="features">
        <Features />
      </div>
      <div id="download">
        <Download />
      </div>
      <Footer />
    </div>
  );
};

export default Index;
