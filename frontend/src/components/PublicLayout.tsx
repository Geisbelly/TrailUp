import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";
import { DESIGN_ART } from "@/lib/design-art";

export function PublicLayout({ children, scene = DESIGN_ART.forest, className = "" }: {
  children?: ReactNode;
  scene?: string;
  className?: string;
}) {
  return (
    <div className={`public-page ${className}`}>
      <div className="public-scenery" data-page-background aria-hidden="true">
        <img src={scene} alt="" width="1600" height="900" />
      </div>
      <Header />
      <main className="public-main journey-width">{children}</main>
      <Footer />
    </div>
  );
}

export function PublicPageTitle({ title, eyebrow, children }: {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <header className="public-page-title">
      {eyebrow && <p className="journey-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}
