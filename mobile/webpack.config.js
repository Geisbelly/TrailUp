// webpack.config.js
const { withExpo } = require('@expo/webpack-config');

module.exports = (env, argv) => {
  const config = withExpo(env, argv);

  // usa o build web da Skia
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    '@shopify/react-native-skia': '@shopify/react-native-skia/lib/module/web',
    // 🔥 BLOQUEIA react-native-youtube-iframe NO WEB 🔥
    'react-native-youtube-iframe': false,
  };

  return config;
};
