import { useState } from "react";
import { motion } from "framer-motion";
import { PROFILES } from "@/features/signup/brainhex";

// Nomes de guia oficiais (fonte: api/app/services/personalizacao.py
// _BRAINHEX_GUIDE_PERSONAS). As citacoes sao autorais, escritas para capturar
// o tom_voz de cada perfil nas assinaturas editoriais do backend — nao sao
// geradas por IA, sao um asset fixo da marca.
const GUIDES: Record<string, { name: string; quote: string }> = {
  seeker: {
    name: "Orion, o Explorador",
    quote: "Todo mapa esconde uma pergunta melhor que a resposta.",
  },
  survivor: {
    name: "Valka, a Sobrevivente",
    quote: "Sobreviver é ter um plano B. Redundância não é desperdício.",
  },
  daredevil: {
    name: "Rexa, a Aventureira",
    quote: "Hesitar é a única forma de perder.",
  },
  mastermind: {
    name: "Atena, a Estrategista",
    quote: "Toda pergunta certa já contém metade da resposta.",
  },
  conqueror: {
    name: "Drako, o Conquistador",
    quote: "Não existe segundo lugar na sua própria jornada.",
  },
  socializer: {
    name: "Luma, a Socializadora",
    quote: "Ninguém chega longe sozinho — nem mesmo você.",
  },
  achiever: {
    name: "Auri, a Realizadora",
    quote: "Cada marco conquistado abre o próximo caminho.",
  },
};

const PROFILE_LIST = Object.values(PROFILES);

const BrainHexShowcase = () => {
  const [activeKey, setActiveKey] = useState(PROFILE_LIST[0].key);
  const active = PROFILE_LIST.find((p) => p.key === activeKey) ?? PROFILE_LIST[0];
  const activeGuide = GUIDES[active.key];
  const ActiveIcon = active.icon;
  const activeColor = active.textColor.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#a78c07";

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="container mx-auto">
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Conheça os{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              7 perfis
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Cada aluno encontra um guia que fala a sua língua. Escolha um perfil e veja como a
            jornada muda de cara.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-[1fr_1fr] gap-10 items-start">
          {/* Grade de perfis */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {PROFILE_LIST.map((profile, index) => {
              const Icon = profile.icon;
              const isActive = profile.key === activeKey;
              const color = profile.textColor.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#a78c07";
              return (
                <motion.button
                  key={profile.key}
                  type="button"
                  onClick={() => setActiveKey(profile.key)}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-xl border p-4 text-left transition-colors duration-300 flex flex-col items-start gap-3"
                  style={{
                    borderColor: isActive ? color : "hsl(var(--border))",
                    backgroundColor: isActive ? `${color}1a` : "hsl(var(--card) / 0.5)",
                    boxShadow: isActive ? `0 0 24px ${color}40` : "none",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-300"
                    style={{ backgroundColor: `${color}26` }}
                  >
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <span className="font-semibold text-sm">{profile.title.split(" ")[0]}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Preview do perfil ativo */}
          <motion.div
            key={active.key}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="rounded-2xl border p-8 relative overflow-hidden"
            style={{
              borderColor: `${activeColor}55`,
              background: `linear-gradient(160deg, ${activeColor}1f 0%, hsl(var(--card)) 60%)`,
            }}
          >
            <div
              className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-30"
              style={{ backgroundColor: activeColor }}
            />
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 relative"
              style={{ backgroundColor: `${activeColor}26`, boxShadow: `0 0 30px ${activeColor}55` }}
            >
              <ActiveIcon className="w-8 h-8" style={{ color: activeColor }} />
            </div>
            <p className="text-sm uppercase tracking-wide text-muted-foreground mb-1">
              Seu guia
            </p>
            <h3 className="text-2xl font-bold mb-4" style={{ color: activeColor }}>
              {activeGuide.name}
            </h3>
            <p className="text-lg italic text-foreground/90 leading-relaxed">
              &ldquo;{activeGuide.quote}&rdquo;
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default BrainHexShowcase;
