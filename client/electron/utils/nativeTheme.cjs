const nativeThemeSources = new Set(['system', 'light', 'dark']);

function normalizeNativeThemeSource(value, fallback = 'system') {
  return nativeThemeSources.has(value) ? value : fallback;
}

function getNativeThemeSourceFromConfig(config) {
  if (config && typeof config === 'object') {
    return normalizeNativeThemeSource(config.theme);
  }
  return normalizeNativeThemeSource(config);
}

function applyNativeThemeSource(nativeTheme, config) {
  const themeSource = getNativeThemeSourceFromConfig(config);
  if (nativeTheme && typeof nativeTheme === 'object') {
    nativeTheme.themeSource = themeSource;
  }
  return themeSource;
}

module.exports = {
  applyNativeThemeSource,
  getNativeThemeSourceFromConfig,
  normalizeNativeThemeSource,
};
