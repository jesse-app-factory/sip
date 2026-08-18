// Shared by Metro (for `expo start` and `expo export`) and by Jest, which
// transforms every `.ts`/`.tsx` file through babel-jest using this config.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // `react-native-reanimated` does not work without its Babel plugin, which
    // ships in `react-native-worklets` from Reanimated 4 onwards and must be
    // listed last. `babel-preset-expo` also injects it when the package is
    // installed — Babel resolves both entries to the same plugin, so the code
    // emitted is identical — but naming it here keeps the requirement visible
    // instead of resting on the preset's auto-detection.
    plugins: ['react-native-worklets/plugin'],
  };
};
