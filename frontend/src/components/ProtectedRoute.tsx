import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: ("professor" | "aluno")[];
  requireLiberado?: boolean;
}

export function ProtectedRoute({ 
  children, 
  allowedRoles,
  requireLiberado = false 
}: ProtectedRouteProps) {
  const { user, userRole, isLoading, isProfessorLiberado } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  if (requireLiberado && userRole === "professor" && !isProfessorLiberado) {
    return <Navigate to="/login" state={{ pendingApproval: true }} replace />;
  }

  return <>{children}</>;
}
