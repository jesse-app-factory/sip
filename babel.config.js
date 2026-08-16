// babel-preset-expo adds the react-native-worklets plugin automatically when the
// package is installed, which is what react-native-reanimated 4 needs.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
