const fs = require('fs');
// Load the engine which re-exports everything from config
const code = fs.readFileSync(__dirname + '/js/config.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/js/engine.js', 'utf8') + '\nreturn PricingEngine;';
const PricingEngine = new Function(code)();

// Access internal config through PricingEngine's exposed properties
const SURFACE_FEES_304 = PricingEngine.SURFACE_FEES_304;
const SURFACE_FEES = PricingEngine.SURFACE_FEES;
const SURFACE_ALIASES = {};

// Build SURFACE_ALIASES from the code
// Actually let me just look at what normalizeSurface does
console.log("=== normalize tests ===");
console.log("No.4 ->", PricingEngine.normalizeSurface('No.4'));
console.log("NO.4 ->", PricingEngine.normalizeSurface('NO.4'));
console.log("no.4 ->", PricingEngine.normalizeSurface('no.4'));
console.log("8K ->", PricingEngine.normalizeSurface('8K'));
console.log("8K黑钛金 ->", PricingEngine.normalizeSurface('8K黑钛金'));
console.log("拉丝黑钛金 ->", PricingEngine.normalizeSurface('拉丝黑钛金'));

// Check 304 surface fees
console.log("\n=== SURFACE_FEES_304 keys ===");
const keys304 = Object.keys(SURFACE_FEES_304);
console.log("Count:", keys304.length);
keys304.sort().forEach(k => console.log("  '" + k + "'"));

// Direct lookups
console.log("\n=== Direct lookups ===");
console.log("SURFACE_FEES_304['No.4']:", SURFACE_FEES_304['No.4'] ? 'exists' : 'undefined');
console.log("SURFACE_FEES_304['NO.4']:", SURFACE_FEES_304['NO.4'] ? 'exists' : 'undefined');
console.log("SURFACE_FEES_304['8K黑钛金']:", SURFACE_FEES_304['8K黑钛金'] ? 'exists' : 'undefined');

// Full calculate test for 430B/2BA with each possible surface
const testSurfaces = ['No.4', '8K黑钛金', '拉丝黑钛金', '8K'];
console.log("\n=== Full calc with 430B/2BA (basePrice=8000) ===");
for (const surf of testSurfaces) {
  const r = PricingEngine.calculate({
    origin: '瑞钢', material: '430B/2BA', surface: surf,
    thickness: '0.50', width: '1220', length: '2440',
    film1: '5C-FILM', film2: '', isYanYan: false, basePrice: 8000
  });
  console.log(`\nsurface="${surf}": success=${r.success}, normSurface=${r.detail.normSurface}`);
  if (r.success) {
    console.log(`  surfaceFeePerTon=${r.detail.surfaceFeePerTon}, saleTax=${r.detail.saleTax}`);
  } else {
    console.log(`  errors: ${r.errors?.join('; ')}`);
  }
}

// Also test 430B/2BA with no surface (should get "无")
console.log("\n=== 430B/2BA with no surface ===");
const rNoSurf = PricingEngine.calculate({
  origin: '瑞钢', material: '430B/2BA', surface: '无',
  thickness: '0.50', width: '1220', length: '2440',
  film1: '5C-FILM', film2: '', isYanYan: false, basePrice: 8000
});
console.log("success:", rNoSurf.success);
console.log("normSurface:", rNoSurf.detail.normSurface);
console.log("surfaceFeePerTon:", rNoSurf.detail.surfaceFeePerTon);
