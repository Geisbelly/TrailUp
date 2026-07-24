// Blobs de gradiente desfocados (roxo -> magenta -> ambar), o mesmo padrao
// decorativo usado na secao "Guardioes" — reaproveitado nas demais secoes
// publicas para dar consistencia visual ao site inteiro (fundo escuro +
// blobs vibrantes + cards com vidro), no lugar de fundos lisos.
type BlobPreset = "corners" | "top-center" | "single-left";

const PRESETS: Record<BlobPreset, React.CSSProperties[]> = {
  corners: [
    {
      top: "-10%",
      left: "-8%",
      width: "32rem",
      height: "26rem",
      background: "radial-gradient(ellipse, hsl(266 85% 45% / 0.45), transparent 70%)",
    },
    {
      bottom: "-15%",
      right: "-6%",
      width: "30rem",
      height: "24rem",
      background: "radial-gradient(ellipse, hsl(330 75% 50% / 0.3), transparent 70%)",
    },
    {
      top: "20%",
      right: "18%",
      width: "20rem",
      height: "18rem",
      background: "radial-gradient(ellipse, hsl(38 85% 55% / 0.18), transparent 70%)",
    },
  ],
  "top-center": [
    {
      top: "-18%",
      left: "20%",
      width: "34rem",
      height: "22rem",
      background: "radial-gradient(ellipse, hsl(266 85% 45% / 0.4), transparent 70%)",
    },
    {
      top: "-10%",
      right: "10%",
      width: "26rem",
      height: "20rem",
      background: "radial-gradient(ellipse, hsl(330 75% 50% / 0.28), transparent 70%)",
    },
  ],
  "single-left": [
    {
      top: "10%",
      left: "-12%",
      width: "28rem",
      height: "28rem",
      background: "radial-gradient(ellipse, hsl(266 85% 45% / 0.35), transparent 70%)",
    },
  ],
};

const GradientBlobs = ({ preset = "corners", className = "" }: { preset?: BlobPreset; className?: string }) => {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden="true">
      {PRESETS[preset].map((style, i) => (
        <div key={i} className="absolute rounded-full blur-3xl" style={{ ...style, mixBlendMode: "screen" }} />
      ))}
    </div>
  );
};

export default GradientBlobs;
