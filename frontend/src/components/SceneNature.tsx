import type { CSSProperties } from "react";
import forestLife from "@/assets/design/forest-life.webp";

export default function SceneNature({ quiet = false }: { quiet?: boolean }) {
  return (
    <div className="scene-nature" aria-hidden="true" data-quiet={quiet}
      style={{ "--nature-atlas": `url("${forestLife}")` } as CSSProperties}>
      <div className="nature-foliage nature-foliage-left"><span className="nature-sprig" /></div>
      <div className="nature-foliage nature-foliage-right"><span className="nature-sprig" /></div>
      <div className="nature-flight-field">
        {(quiet ? [1, 2] : [1, 2, 3]).map(index => (
          <span className={`nature-flight nature-flight-${index}`} key={index}>
            <span className="nature-butterfly">
              <span className="nature-wing nature-wing-left" />
              <span className="nature-wing nature-wing-right" />
              <span className="nature-body" />
            </span>
          </span>
        ))}
      </div>
      <div className="nature-leaf-field">
        {(quiet ? [1] : [1, 2]).map(index => (
          <span className={`nature-leaf-path nature-leaf-path-${index}`} key={index}>
            <span className="nature-leaf" />
          </span>
        ))}
      </div>
    </div>
  );
}
