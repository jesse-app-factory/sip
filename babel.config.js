// Shared by Metro (for `expo start` and `expo export`) and by Jest, which
// transforms every `.ts`/`.tsx` file through babel-jest using this config.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
