import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <PublicLayout>
      <div className="public-empty">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p>Página não encontrada.</p>
        <Link to="/" className="journey-button"><ArrowLeft size={18} />Voltar ao início</Link>
      </div>
    </PublicLayout>
  );
};

export default NotFound;
