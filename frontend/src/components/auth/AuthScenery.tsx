import { Link } from "react-router-dom";
import { DESIGN_ART } from "@/lib/design-art";
import { useSceneMotion } from "@/hooks/useSceneMotion";
import SceneNature from "../SceneNature";

export function AuthScenery() {
  const { ref, active } = useSceneMotion<HTMLDivElement>();
  return (
    <div ref={ref} className="auth-scenery" data-page-background aria-hidden="true" data-motion-active={active}>
      <img src={DESIGN_ART.landscape} alt="" width="1200" height="675" />
      <SceneNature quiet />
    </div>
  );
}

export function AuthBrand() {
  return (
    <Link to="/" className="auth-brand" aria-label="TrailUp, voltar ao início">
      <img className="auth-star" src={DESIGN_ART.star} alt="" width="64" height="64" />
    </Link>
  );
}
