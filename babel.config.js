module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind v4: 'nativewind/babel' es un PRESET, no un plugin.
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
