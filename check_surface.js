const fs = require('fs');
const code = fs.readFileSync(__dirname + '/js/config.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/js/engine.js', 'utf8') + '\nreturn PricingEngine;';
const PricingEngine = new Function(code)();

// Check "8K" surface
const norm8k = PricingEngine.normalizeSurface('8K');
console.log('normalizeSurface("8K"):', norm8k);
const cfgCode = fs.readFileSync(__dirname + '/js/config.js', 'utf8');
eval(cfgCode);
console.log('SURFACE_FEES["8K"]:', SURFACE_FEES['8K']);
console.log('SURFACE_FEES_304["8K"]:', SURFACE_FEES_304['8K']);
console.log('SURFACE_ALIASES["8k"]:', SURFACE_ALIASES['8k']);
