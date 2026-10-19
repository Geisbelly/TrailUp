// Configuracao dinamica por cima do app.json.
//
// Build web publicado na Vercel (trailup.vercel.app/aluno): o script
// `frontend/scripts/build-aluno-web.mjs` define EXPO_WEB_BASE_URL=/aluno e
// EXPO_WEB_OUTPUT=single. Fora dele (dev local, EAS/Android) nada muda: o app
// continua na raiz do servidor e com a saida definida no app.json.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL;
  const output = process.env.EXPO_WEB_OUTPUT;

  return {
    ...config,
    web: {
      ...config.web,
      ...(output ? { output } : {}),
    },
    experiments: {
      ...config.experiments,
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};
