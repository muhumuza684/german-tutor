const fs = require('fs');
const path = require('path');

/**
 * Loads language data from the /data/{language}/ directory.
 * @param {string} language - e.g. 'german'
 * @param {string} dataType - e.g. 'lessons', 'phrases', 'stories', 'songs'
 * @returns {Array|null}
 */
function getLanguageData(language, dataType) {
  try {
    const filePath = path.join(__dirname, '..', 'data', language, `${dataType}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`[languageLoader] File not found: ${filePath}`);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[languageLoader] Error loading ${language}/${dataType}:`, err.message);
    return null;
  }
}

/**
 * Returns a list of available languages by checking folders in /data/
 * @returns {string[]}
 */
function getAvailableLanguages() {
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    return fs.readdirSync(dataDir).filter(f =>
      fs.statSync(path.join(dataDir, f)).isDirectory()
    );
  } catch (err) {
    console.error('[languageLoader] Could not list languages:', err.message);
    return [];
  }
}

module.exports = { getLanguageData, getAvailableLanguages };
