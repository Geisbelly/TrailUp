import { Link } from "react-router-dom";
import { DESIGN_ART } from "@/lib/design-art";

export function AuthScenery() {
  return <div className="auth-scenery" data-page-background aria-hidden="true"><img src={DESIGN_ART.landscape} alt="" width="1200" height="675" /></div>;
}

export function AuthBrand() {
  return (
    <Link to="/" className="auth-brand" aria-label="TrailUp, voltar ao início">
      <img className="auth-star" src={DESIGN_ART.star} alt="" width="64" height="64" />
    </Link>
  );
}
