// Proxy para resolvers (jiti, Tailwind CLI) que no siguen package exports.
const mod = require('./dist/tailwind-preset.js');
module.exports = mod.default ?? mod;
