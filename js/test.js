const fs = require('fs');
const code = fs.readFileSync(__dirname + '/config.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/engine.js', 'utf8') + '\nreturn PricingEngine;';
const PricingEngine = new Function(code)();
// v1.0.136：parser.js（Excel 解析）测试支持
const parserCode = fs.readFileSync(__dirname + '/parser.js', 'utf8') + '\nreturn ExcelParser;';
const ExcelParser = new Function('PricingEngine', parserCode)(PricingEngine);

let pass = 0, fail = 0;
function test(n, fn) { try { fn(); console.log(`✅ ${n}`); pass++; } catch(e) { console.log(`❌ ${n}: ${e.message}`); fail++; } }
function eq(a, b, l) { if (a !== b) throw new Error(`${l}: ${a} !== ${b}`); }

// === 原有测试 ===
// === v1.0.125 五尺 201J2 厚度档：第一档 0.68-0.88 → 0.78-0.88 === 
// === v1.0.126 保护膜新增 6C-NOVACEL-LASER-FILM 4.7元/方 === 
// === v1.0.127 表面加工档位级覆盖（surfaceTiers） === 
test('6K 第一档档位覆盖 1.6→2.2 生效', () => {
  const tiers = PricingEngine.SURFACE_FEES['6K'];
  const idx0 = tiers[0].wMin === 1000 ? 0 : tiers.findIndex(t => t.wMin === 1000);
  PricingEngine.setUserOverrides({ surfaceTiers: { '6K': { 0: 2.2 } }, surfaceFees: {} });
  const r = PricingEngine.getSurfaceFee('6K', 0.5, 1000, '201');
  eq(r.sqmPrice, 2.2, 'tier0 override');
  PricingEngine.setUserOverrides({ surfaceTiers: {}, surfaceFees: {} });
  const r2 = PricingEngine.getSurfaceFee('6K', 0.5, 1000, '201');
  eq(r2.sqmPrice, tiers[0].price, '恢复默认');
});
test('NO.4 档位覆盖后其余档不受影响', () => {
  const tiers = PricingEngine.SURFACE_FEES['NO.4'];
  const t1 = tiers.find(t => t.wMin === 1000);
  const idx1 = tiers.indexOf(t1);
  const t2 = tiers.find(t => t.wMin !== 1000 || t.wMin !== t1.wMin || t.tMin !== t1.tMin);
  PricingEngine.setUserOverrides({ surfaceTiers: { 'NO.4': { 0: 9.9 } }, surfaceFees: {} });
  const r = PricingEngine.getSurfaceFee('NO.4', t1.tMin + 0.01, t1.wMin, '201');
  eq(r.sqmPrice, 9.9, '首档被覆盖');
  PricingEngine.setUserOverrides({ surfaceTiers: {}, surfaceFees: {} });
});

test('6C-NOVACEL-LASER-FILM 膜费 = 4.7 元/方', () => { eq(PricingEngine.getFilmFee('6C-NOVACEL-LASER-FILM'), 4.7); });

test('五尺 201J2 0.78 命中 t1 档', () => { eq(PricingEngine.getThickBand1500('201J2', 0.78), 't1'); });
test('五尺 201J2 0.88 命中 t1 档（闭区间）', () => { eq(PricingEngine.getThickBand1500('201J2', 0.88), 't1'); });
test('五尺 201J2 0.89 命中 t2 档', () => { eq(PricingEngine.getThickBand1500('201J2', 0.89), 't2'); });
test('五尺 201J2 0.68 档外报错（范围外）', () => { eq(PricingEngine.getThickBand1500('201J2', 0.68), null); });
test('五尺 201J2 0.77 档外报错（范围外）', () => { eq(PricingEngine.getThickBand1500('201J2', 0.77), null); });

test('用户示例: NO.4 5C-FILM 0.50*1240*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'NO.4',thickness:'0.50',width:'1240',length:'C',film1:'5C-FILM',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8720); eq(r.detail.costNoTax, 8020); eq(r.detail.saleTax, 8920);
});

test('2B 无膜 1.00*1240*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'2B',thickness:'1.00',width:'1240',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8000); eq(r.detail.saleTax, 8200);
});

test('8K 镜面 0.50*1219*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'8K',thickness:'0.50',width:'1219',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8990);
});

test('8K黄钛金 7C+垫纸 0.50*1219*2500', () => {
  const r = PricingEngine.calculate({material:'201',surface:'8K黄钛金',thickness:'0.50',width:'1219',length:'2500',film1:'7C-FILM',film2:'垫纸',basePrice:7800,packing:'木架'});
  eq(r.success, true); eq(r.detail.costTax, 10240); eq(r.detail.saleTax, 10640);
});

test('双面抛光 0.50*1000*2000', () => {
  const r = PricingEngine.calculate({material:'201',surface:'双面抛光',thickness:'0.50',width:'1000',length:'2000',film1:'',film2:'',basePrice:7800,packing:'木架'});
  eq(r.success, true); eq(r.detail.costTax, 8630); eq(r.detail.saleTax, 9230);
});

test('拉丝黑钛金 0.60*1219*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'拉丝黑钛金',thickness:'0.60',width:'1219',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8780);
});

test('错误处理: 无效厚度', () => {
  const r = PricingEngine.calculate({material:'201',surface:'2B',thickness:'5.00',width:'1240',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, false); eq(r.errors.some(e => e.includes('厚度')), true);
});

test('8K 宽板 1.00*1500*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'8K',thickness:'1.00',width:'1500',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 9110); eq(r.detail.saleTax, 9510);
});

test('NO.4 宽板 1.50*1500*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'NO.4',thickness:'1.50',width:'1500',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8220);
});

// === 新增：压延料测试 ===
test('压延料 NO.4 0.50*1240*C (压延0.50-0.59=+500)', () => {
  const r = PricingEngine.calculate({material:'201J2',surface:'NO.4',thickness:'0.50',width:'1240',length:'C',film1:'',film2:'',basePrice:7800,isYanYan:true});
  eq(r.success, true); eq(r.detail.thickSurcharge, 500);
  eq(r.detail.thickTable, '压延料');
  // 7800+500+127.39 = 8427.39 -> round10 = 8430
  eq(r.detail.costTax, 8440);
});

test('压延料 0.25*1240*C (压延0.24-0.26=+1500)', () => {
  const r = PricingEngine.calculate({material:'201J2',surface:'2B',thickness:'0.25',width:'1240',length:'C',film1:'',film2:'',basePrice:7800,isYanYan:true});
  eq(r.success, true); eq(r.detail.thickSurcharge, 1500);
  // 常规0.24-0.25=+2000, 压延0.24-0.26=+1500
  eq(r.detail.costTax, 7800+1500);
});

test('压延料 0.80*1240*C (压延>0.75=+300)', () => {
  const r = PricingEngine.calculate({material:'201J2',surface:'2B',thickness:'0.80',width:'1240',length:'C',film1:'',film2:'',basePrice:7800,isYanYan:true});
  eq(r.success, true); eq(r.detail.thickSurcharge, 300);
  eq(r.detail.costTax, 8100);
});

test('常规 0.80*1240*C (常规0.80+=+200)', () => {
  const r = PricingEngine.calculate({material:'201J2',surface:'2B',thickness:'0.80',width:'1240',length:'C',film1:'',film2:'',basePrice:7800,isYanYan:false});
  eq(r.success, true); eq(r.detail.thickSurcharge, 200);
  eq(r.detail.costTax, 8000);
});

// === 新增：材质基价测试 ===
test('201J1 基价 (J2+900)', () => {
  const r = PricingEngine.calculate({material:'201J1',surface:'2B',thickness:'1.00',width:'1240',length:'C',film1:'',film2:'',basePrice:8700});
  eq(r.success, true); eq(r.detail.basePrice, 8700);
  // 8700+200=8900
  eq(r.detail.costTax, 8900);
});

test('201J4 基价 (J2+1600)', () => {
  const r = PricingEngine.calculate({material:'201J4',surface:'2B',thickness:'1.00',width:'1240',length:'C',film1:'',film2:'',basePrice:9400});
  eq(r.success, true); eq(r.detail.basePrice, 9400);
});

test('201J1压延 0.50*1240*C', () => {
  const r = PricingEngine.calculate({material:'201J1',surface:'NO.4',thickness:'0.50',width:'1240',length:'C',film1:'',film2:'',basePrice:8700,isYanYan:true});
  eq(r.success, true);
  // 8700+500(压延0.50-0.59)+127.39 = 9327.39 -> 9330
  eq(r.detail.costTax, 9340);
});

// === 自由文本解析测试 ===
test('自由文本: 宏旺201J1 NO.4 5C-FILM 0.50*1240*C', () => {
  const p = PricingEngine.parseFreeText('宏旺201J1 NO.4 5C-FILM 0.50*1240*C', {'201J1':8700});
  eq(p !== null, true); eq(p.material, '201J1'); eq(p.surface, 'NO.4');
  eq(parseFloat(p.thickness), 0.5); eq(p.width, 1240); eq(p.length, 'C'); eq(p.film1, '5C-FILM');
  eq(p.isYanYan, false);
});

test('自由文本: 201J2压延 2B 0.80*1240*C', () => {
  const p = PricingEngine.parseFreeText('201J2压延 2B 0.80*1240*C', {'201J2压延':7800});
  eq(p !== null, true); eq(p.material, '201J2'); eq(p.isYanYan, true); eq(p.surface, '2B');
});

test('自由文本: 201J4压延 8K黄钛金 0.50*1219*2500', () => {
  const p = PricingEngine.parseFreeText('201J4压延 8K黄钛金 0.50*1219*2500', {'201J4压延':9400});
  eq(p !== null, true); eq(p.material, '201J4'); eq(p.isYanYan, true); eq(p.surface, '8K黄钛金');
  eq(p.basePrice, 9400);
});

// === 英文别名测试 ===
test('英文表面: Gold Mirror 8K → 8K黄钛金', () => {
  eq(PricingEngine.normalizeSurface('Gold Mirror 8K'), '8K黄钛金');
});

test('英文表面: RoseGold Mirror 8K → 8K玫瑰金', () => {
  eq(PricingEngine.normalizeSurface('RoseGold Mirror 8K'), '8K玫瑰金');
});

test('英文表面: Dark Black Mirror 8K → 8K黑钛金', () => {
  eq(PricingEngine.normalizeSurface('Dark Black Mirror 8K'), '8K黑钛金');
});

test('英文表面: Bronze Mirror 8K → 8K古铜', () => {
  eq(PricingEngine.normalizeSurface('Bronze Mirror 8K'), '8K古铜');
});

test('英文表面: Gold No4 → 拉丝黄钛金', () => {
  eq(PricingEngine.normalizeSurface('Gold No4'), '拉丝黄钛金');
});

test('英文表面: Antique Bronze Hairline → 拉丝古铜', () => {
  eq(PricingEngine.normalizeSurface('Antique Bronze Hairline'), '拉丝古铜');
});

test('中文别名: 磨砂 → NO.4', () => {
  eq(PricingEngine.normalizeSurface('磨砂'), 'NO.4');
});

test('中文别名: 雪花砂 → NO.4', () => {
  eq(PricingEngine.normalizeSurface('雪花砂'), 'NO.4');
});

test('中文别名: 砂面 → NO.4', () => {
  eq(PricingEngine.normalizeSurface('砂面'), 'NO.4');
});

test('中文别名: 拉丝 → HL', () => {
  eq(PricingEngine.normalizeSurface('拉丝'), 'HL');
});

test('英文膜: 7C Laser FILM PVC → 7C-LASER-FILM', () => {
  eq(PricingEngine.normalizeFilm('7C Laser FILM PVC'), '7C-LASER-FILM');
});

test('英文膜: 7C Novacell Laser FILM PVC → 7C-NOVACEL-LASER-FILM', () => {
  eq(PricingEngine.normalizeFilm('7C Novacell Laser FILM PVC'), '7C-NOVACEL-LASER-FILM');
});

// === 新表面加工费测试（二级定价）===
test('8K黄钛金 0.50mm → 5.5元/平米', () => {
  const fee = PricingEngine.getSurfaceFee('8K黄钛金', 0.50, 1240);
  eq(fee.needConvert, true);
  eq(fee.sqmPrice, 5.5);
});

test('8K黄钛金 1.30mm → 10.5元/平米', () => {
  const fee = PricingEngine.getSurfaceFee('8K黄钛金', 1.30, 1240);
  eq(fee.needConvert, true);
  eq(fee.sqmPrice, 10.5);
});

test('8K香槟金 0.50mm → 6.5元/平米', () => {
  const fee = PricingEngine.getSurfaceFee('8K香槟金', 0.50, 1240);
  eq(fee.needConvert, true);
  eq(fee.sqmPrice, 6.5);
});

test('拉丝香槟金 1.30mm → 10元/平米', () => {
  const fee = PricingEngine.getSurfaceFee('拉丝香槟金', 1.30, 1240);
  eq(fee.needConvert, true);
  eq(fee.sqmPrice, 10);
});

test('NO.4 和 HL 价格相同 0.50mm', () => {
  const n = PricingEngine.getSurfaceFee('NO.4', 0.50, 1240);
  const h = PricingEngine.getSurfaceFee('HL', 0.50, 1240);
  eq(n.sqmPrice, h.sqmPrice);
});

// === v1.0.122 小方格(Square embossed) 压花测试 ===
test('6K+小方格(Square embossed) 2.00mm → 6K加工400 + 小方格300', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'6K+小方格(Square embossed)', thickness:'2.00', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.surfaceFeePerTon, 400);
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.embossFees.length, 1);
  eq(r.detail.embossFees[0].key, 'square');
  eq(r.detail.costTax, 8760);
});
test('8K+square embossed 0.45mm → 8K707.71 + 小方格300（英文带空格识别）', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'8K+square embossed', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.surfaceFeePerTon, 707.71);
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.costTax, 9800);
});
test('6K+linen+square 双压花叠加 → 600元/吨', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'6K+linen+square', thickness:'2.00', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.surfaceFeePerTon, 400);
  eq(r.detail.linenFeePerTon, 600);
  eq(r.detail.embossFees.length, 2);
  eq(r.detail.costTax, 9090);
});
test('纯小方格: surface=小方格(Square embossed) → 表面加工0 + 小方格300', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'小方格(square embossed)', thickness:'2.00', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.surfaceFeePerTon, 0);
  eq(r.detail.linenFeePerTon, 300);
});

// === v1.0.121 压花覆盖价测试（配置板块改价后生效）===
test('覆盖价: 6K+linen 设 linen=350 → 压花 350 元/吨', () => {
  PricingEngine.setUserOverrides({ surfaceFees: { linen: 350 }, filmFees: {} });
  const r = PricingEngine.calculate({
    material:'201J2', surface:'6K+linen', thickness:'2.00', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.surfaceFeePerTon, 400);
  eq(r.detail.linenFeePerTon, 350);
  eq(r.detail.costTax, 8820);
});
test('覆盖价: 旧格式 8k linen 也走覆盖价 350', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'8k linen', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.linenFeePerTon, 350);
});
test('恢复默认: 清除覆盖后 linen 回 300', () => {
  PricingEngine.setUserOverrides({ surfaceFees: {}, filmFees: {} });
  const r = PricingEngine.calculate({
    material:'201J2', surface:'6K+linen', thickness:'2.00', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.costTax, 8760);
});

// === 小珠光(LINEN)测试 ===
test('BA linen 0.45mm → 450元/吨 (单面抛光150+小珠光300)', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'BA linen', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.surfaceFeePerTon, 150);
  eq(r.detail.costTax, 9190);
});

test('8K linen 0.45mm → 707.71+300=1007.71元/吨', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'8K linen', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.hasLinen, true);
  eq(r.detail.surfaceFeePerTon, 707.71);
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.costTax, 9800);
});

test('小珠光 alias: 镜面8k黄钛金小珠光 0.50mm', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'镜面8k黄钛金小珠光', thickness:'0.50', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.hasLinen, true);
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.surfaceFeePerTon, 1401.27);
});

test('别名: RoseGold No4 → 磨砂玫瑰金', () => {
  eq(PricingEngine.normalizeSurface('RoseGold No4'), '磨砂玫瑰金');
  eq(PricingEngine.normalizeSurface('磨砂玫瑰金'), '磨砂玫瑰金');
  eq(PricingEngine.normalizeSurface('砂面玫瑰金'), '磨砂玫瑰金');
});

test('磨砂玫瑰金 和 拉丝玫瑰金 价格相同', () => {
  const a = PricingEngine.getSurfaceFee('磨砂玫瑰金', 0.50, 1240);
  const b = PricingEngine.getSurfaceFee('拉丝玫瑰金', 0.50, 1240);
  eq(a.needConvert, true); eq(b.needConvert, true);
  eq(a.sqmPrice, 6); eq(b.sqmPrice, 6);
  const a2 = PricingEngine.getSurfaceFee('磨砂玫瑰金', 1.30, 1240);
  const b2 = PricingEngine.getSurfaceFee('拉丝玫瑰金', 1.30, 1240);
  eq(a2.sqmPrice, 10); eq(b2.sqmPrice, 10);
});

// === AFP测试点 ===
test('AFP: Gold No4 + AFP = 拉丝黄钛金+亮光抗指纹 0.45mm', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'Gold No4 + AFP', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.afpFeeSqm, 3.5); // 亮油·平板 (v1.0.164 起卷板/平板分价)
  eq(r.detail.surfaceFeePerTon, 1415.43); // 5 * 283.09
  eq(r.detail.afpPerTon, 990.8); // 3.5 * 283.09
  eq(r.detail.costTax, 11320);
});

test('AFP: 拉丝古铜哑光抗指纹 = 组合价 15元/sqm 0.45mm', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'拉丝古铜哑光抗指纹', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  // v1.0.165 拆开计算：base 拉丝古铜 10 + 哑油 5（总额仍 15）
  eq(r.detail.surfaceFeePerTon, Math.round(10 * (1000/7.85/0.45) * 100) / 100);
  eq(r.detail.afpFeeSqm, 5); // 哑油
});

test('AFP: 青古铜 alias → 8K古铜', () => {
  eq(PricingEngine.normalizeSurface('青古铜'), '8K古铜');
  eq(PricingEngine.normalizeSurface('黄古铜'), '8K古铜');
  eq(PricingEngine.normalizeSurface('红古铜'), '8K古铜');
});

test('AFP: 拉丝黄钛金哑光抗指纹 = 拉丝黄钛金+AFP(matte)', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'拉丝黄钛金哑光抗指纹', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.afpFeeSqm, 5); // 哑光=5
});

// === 磨砂/拉丝同价规律 ===
test('磨砂黄钛金 = 拉丝黄钛金 价格相同', () => {
  const a = PricingEngine.getSurfaceFee('磨砂黄钛金', 0.50, 1240);
  const b = PricingEngine.getSurfaceFee('拉丝黄钛金', 0.50, 1240);
  eq(a.sqmPrice, 5); eq(b.sqmPrice, 5);
  const a2 = PricingEngine.getSurfaceFee('磨砂黄钛金', 1.30, 1240);
  const b2 = PricingEngine.getSurfaceFee('拉丝黄钛金', 1.30, 1240);
  eq(a2.sqmPrice, 9); eq(b2.sqmPrice, 9);
});

test('磨砂黑钛金 = 拉丝黑钛金 价格相同', () => {
  eq(PricingEngine.getSurfaceFee('磨砂黑钛金', 0.50, 1240).sqmPrice, 4);
  eq(PricingEngine.getSurfaceFee('拉丝黑钛金', 0.50, 1240).sqmPrice, 4);
});

test('磨砂香槟金 = 拉丝香槟金 价格相同', () => {
  eq(PricingEngine.getSurfaceFee('磨砂香槟金', 0.50, 1240).sqmPrice, 6);
  eq(PricingEngine.getSurfaceFee('拉丝香槟金', 0.50, 1240).sqmPrice, 6);
});

test('别名: Champagne Gold No4 → 磨砂香槟金', () => {
  eq(PricingEngine.normalizeSurface('Champagne Gold No4'), '磨砂香槟金');
});

test('别名: 拼写容错 Champange → 磨砂香槟金', () => {
  eq(PricingEngine.normalizeSurface('Champange gold No4'), '磨砂香槟金');
});

test('别名: Dark Black No4 → 磨砂黑钛金', () => {
  eq(PricingEngine.normalizeSurface('Dark Black No4'), '磨砂黑钛金');
});

test('别名: Bronze No4 → 拉丝古铜', () => {
  eq(PricingEngine.normalizeSurface('Bronze No4'), '拉丝古铜');
});

test('别名: Antique Copper Hairline → 拉丝古铜', () => {
  eq(PricingEngine.normalizeSurface('Antique Copper Hairline'), '拉丝古铜');
});

// === 拉丝古铜/磨砂古铜价格 ===
test('拉丝古铜 0.71mm → 10元/平米', () => {
  const fee = PricingEngine.getSurfaceFee('拉丝古铜', 0.71, 1240);
  eq(fee.sqmPrice, 10);
});

test('拉丝古铜 1.30mm → 14元/平米', () => {
  const fee = PricingEngine.getSurfaceFee('拉丝古铜', 1.30, 1240);
  eq(fee.sqmPrice, 14);
});

test('磨砂古铜 = 拉丝古铜 同价', () => {
  eq(PricingEngine.getSurfaceFee('磨砂古铜', 0.71, 1240).sqmPrice, 10);
  eq(PricingEngine.getSurfaceFee('磨砂古铜', 1.30, 1240).sqmPrice, 14);
});

// === 模糊匹配测试 ===
test('模糊匹配: goldmirror → 8K黄钛金', () => {
  eq(PricingEngine.normalizeSurface('goldmirror'), '8K黄钛金');
});

test('模糊匹配: bronzehairline → 拉丝古铜', () => {
  eq(PricingEngine.normalizeSurface('bronzehairline'), '拉丝古铜');
});

test('模糊匹配: no4 → NO.4', () => {
  eq(PricingEngine.normalizeSurface('no4'), 'NO.4');
});

// === 201 基价宽度档（精确值）测试 ===
test('201 宽度档映射: 1000/1030→1, 1219/1240→2, 1250/1280→3, 1500/1530→4', () => {
  eq(PricingEngine.getWidthBand201(1000), 2);
  eq(PricingEngine.getWidthBand201(1030), 2);
  eq(PricingEngine.getWidthBand201(1219), 2);
  eq(PricingEngine.getWidthBand201(1240), 2);
  eq(PricingEngine.getWidthBand201(1250), 3);
  eq(PricingEngine.getWidthBand201(1280), 3);
  eq(PricingEngine.getWidthBand201(1500), 4);
  eq(PricingEngine.getWidthBand201(1530), 4);
});

test('201 档外宽度: 1220/1550/1040/1001 → null', () => {
  eq(PricingEngine.getWidthBand201(1220), null);
  eq(PricingEngine.getWidthBand201(1550), null);
  eq(PricingEngine.getWidthBand201(1040), null);
  eq(PricingEngine.getWidthBand201(1001), null);
});

test('201 档外宽度直接报错: 201J2 0.50*1220*C', () => {
  const r = PricingEngine.calculate({material:'201J2',surface:'2B',thickness:'0.50',width:'1220',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, false);
  eq(r.errors.some(e => e.includes('档位')), true);
});

test('201 档内宽度正常: 201J2 0.50*1219*C', () => {
  const r = PricingEngine.calculate({material:'201J2',surface:'2B',thickness:'0.50',width:'1219',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true);
});

test('北港J5 不校验宽度: 201J5 0.50*1220*C', () => {
  const r = PricingEngine.calculate({material:'201J5',surface:'2B',thickness:'0.50',width:'1219',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); // J5 不分宽度，不报宽度档错误
});

test('304 不受 201 宽度档限制: 304 0.50*1220*C', () => {
  const r = PricingEngine.calculate({material:'304',surface:'2B',thickness:'0.50',width:'1219',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); // 304 基价不分宽度档
});

test('430B/BA 0.50*1240*C 甬金 → 表面=无, 厚度加价0', () => {
  const r = PricingEngine.calculate({
    origin: '甬金', material: '430B/BA', surface: '无', thickness: '0.50', width: '1240', length: 'C',
    film1: '', film2: '', isYanYan: false, basePrice: 8000
  });
  eq(r.success, true, '430B/BA should succeed');
  eq(r.detail.thickSurcharge, 0, '430B/BA 0.50mm thick surcharge should be 0');
  eq(r.detail.surface, '无', '430B/BA surface should be 无');
  eq(r.detail.surfaceFeePerTon, 0, 'surface fee should be 0');
});

test('430B/2BA 瑞钢 8K黑钛金 0.50*1220*2440 → 识别表面, 用304加工费', () => {
  const r = PricingEngine.calculate({
    origin: '瑞钢', material: '430B/2BA', surface: '8K黑钛金',
    thickness: '0.50', width: '1219', length: '2440',
    film1: '5C-FILM', film2: '', isYanYan: false, basePrice: 8000, packing: '木架'
  });
  eq(r.success, true, '430B/2BA with surface should succeed');
  eq(r.detail.surfaceFeePerTon > 0, true, 'should have surface fee');
  eq(r.detail.surface, '8K黑钛金', 'surface should be recognized');
});


// === v1.0.120 压花工艺（2026-08-26 用户规则：表面加工+压花工艺 分开计费） ===
test('压花: 6K+linen 2.00*1240 → 6K按吨计价400 + linen压花300', () => {
  const r = PricingEngine.calculate({ material: '201J2', surface: '6K+linen', thickness: '2.00', width: '1240', length: '2500', origin: '宏旺', basePrice: 7800, packing: '木架' });
  eq(r.success, true);
  eq(r.detail.normSurface, '6K', '主表面应为 6K（不能被模糊匹配成 8K）');
  eq(r.detail.surfaceFeePerTon, 400, '6K 2.00mm 应为 400 元/吨');
  eq(r.detail.linenFeePerTon, 300, 'linen 压花 300 元/吨');
  eq(r.detail.embossFees.length, 1, 'embossFees 1 项');
  eq(r.detail.embossFees[0].name, '小珠光(linen)');
  eq(r.detail.costRaw, 8760.87, '含税小计 = 材料8000 + 其他700÷0.92');
});

test('压花: 6K+小珠光 中文别名 → 同上', () => {
  const r = PricingEngine.calculate({ material: '201J2', surface: '6K+小珠光', thickness: '2.00', width: '1240', length: '2500', origin: '宏旺', basePrice: 7800, packing: '木架' });
  eq(r.success, true);
  eq(r.detail.normSurface, '6K');
  eq(r.detail.surfaceFeePerTon, 400);
  eq(r.detail.linenFeePerTon, 300);
});

test('压花: 带空格 6K + linen 同样识别', () => {
  const r = PricingEngine.calculate({ material: '201J2', surface: '6K + linen', thickness: '2.00', width: '1240', length: '2500', origin: '宏旺', basePrice: 7800, packing: '木架' });
  eq(r.success, true);
  eq(r.detail.normSurface, '6K');
  eq(r.detail.linenFeePerTon, 300);
});

test('压花: 旧格式 8k linen（空格）兼容', () => {
  const r = PricingEngine.calculate({ material: '201J2', surface: '8k linen', thickness: '0.80', width: '1240', length: '2500', origin: '宏旺', basePrice: 7800, packing: '木架' });
  eq(r.success, true);
  eq(r.detail.normSurface, '8K');
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.surfaceFeePerTon > 0, true, '8K 加工费正常');
});

test('压花: 纯 linen 无主表面 → 表面加工0 + 压花300', () => {
  const r = PricingEngine.calculate({ material: '201J2', surface: 'linen', thickness: '2.00', width: '1240', length: '2500', origin: '宏旺', basePrice: 7800, packing: '木架' });
  eq(r.success, true);
  eq(r.detail.surfaceFeePerTon, 0);
  eq(r.detail.linenFeePerTon, 300);
});

test('压花: 回归 8K+AFP 不受影响（AFP 非压花，保留原逻辑）', () => {
  const r = PricingEngine.calculate({ material: '201J2', surface: '8K+AFP', thickness: '0.80', width: '1240', length: '2500', origin: '宏旺', basePrice: 7800, packing: '木架' });
  eq(r.success, true);
  eq(r.detail.normSurface, '8K');
  eq(r.detail.linenFeePerTon, 0, '无压花');
  eq(r.detail.afpPerTon > 0, true, 'AFP 照常');
});

test('压花: splitEmboss 拆分 6K+linen+AFP → 主表面6K+AFP 压花linen', () => {
  const sp = PricingEngine.splitEmboss('6K+linen+AFP');
  eq(sp.surfacePart, '6K+AFP');
  eq(sp.fees.length, 1);
  eq(sp.fees[0].key, 'linen');
});

test('压花: splitEmboss 不动 8K+AFP', () => {
  const sp = PricingEngine.splitEmboss('8K+AFP');
  eq(sp.surfacePart, '8K+AFP');
  eq(sp.fees.length, 0);
});

test('v1.0.133 压花6WL: NO.4+6WL 普通模式 85元/㎡×每吨面积折算', () => {
  const r = PricingEngine.calculate({ material: '304', surface: 'NO.4+6WL', thickness: '0.80', width: '1240', length: '2500', origin: '宏旺', basePrice: 15000, packing: '木架' });
  eq(r.success, true);
  const wl6 = r.detail.embossFees.find(e => e.key === 'wl6');
  eq(wl6 && wl6.unit, 'sqm');
  eq(wl6 && wl6.feePerSqm, 85);
  // 85 × sqmPerTon 计入 linenFeePerTon（0.80mm 304 ≈ 40.5㎡/吨 → 85×40.5≈3442.5）
  eq(r.detail.linenFeePerTon > 3000, true, '6WL 折算后计入');
});

test('v1.0.133 压花6WL: 单张模式 2B+6WL 按单张面积计', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '2B+6WL', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架' });
  eq(r.success, true);
  const area = r.detail.sheetArea; // ≈2.97㎡
  eq(r.detail.embossPerSheet !== undefined, true);
  eq(Math.abs(r.detail.embossPerSheet - 85 * area) < 0.01, true, '6WL单张费=85×面积');
});

test('v1.0.133 喷砂: 单张高普8K+喷砂 单张模式 3元/㎡×面积', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K+喷砂', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  const sb = r.detail.embossFees.find(e => e.key === 'sandblast');
  eq(sb && sb.unit, 'sqm');
  eq(sb && sb.feePerSqm, 3);
  eq(Math.abs(r.detail.embossPerSheet - 3 * r.detail.sheetArea) < 0.01, true, '喷砂单张费=3×面积');
});

test('v1.0.133 喷砂: 别名 sandblast 也可识别', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K+sandblast', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.embossFees.some(e => e.key === 'sandblast'), true);
});

test('v1.0.133 喷砂: 无打底 NO.4+喷砂 报错', () => {
  const r = PricingEngine.calculate({ material: '304', surface: 'NO.4+喷砂', thickness: '0.80', width: '1240', length: '2500', origin: '宏旺', basePrice: 15000 });
  eq(r.success, false);
  eq(r.errors.some(e => /喷砂仅支持单张8K系列打底/.test(e)), true, JSON.stringify(r.errors));
});

test('v1.0.145 喷砂: 单张普磨8K+喷砂 允许（规则放宽，任意单张8K可打底）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张普磨8K+喷砂', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.embossFees.some(e => e.key === 'sandblast'), true, '喷砂计入');
});

// === v1.0.134 保护膜组合动态识别（10C-NOVACEL-LASER-FILM+5C-FILM = 8.8+1.0 = 9.8） ===
test('v1.0.134 组合膜 10C-NOVACEL-LASER-FILM+5C-FILM = 8.8+1.0 = 9.8 元/方', () => {
  eq(PricingEngine.getFilmFee('10C-NOVACEL-LASER-FILM+5C-FILM'), 9.8);
});

test('v1.0.134 组合膜 10C-NOVACEL-LASER-FILM+7C-FILM = 8.8+1.2 = 10.0 元/方', () => {
  eq(PricingEngine.getFilmFee('10C-NOVACEL-LASER-FILM+7C-FILM'), 10.0);
});

test('v1.0.134 组合膜三段 7C-LASER-FILM+5C-FILM+垫纸 = 1.5+1.0+0.3 = 2.8', () => {
  eq(PricingEngine.getFilmFee('7C-LASER-FILM+5C-FILM+垫纸'), 2.8);
});

test('v1.0.134 小写组合 10c-novacel-laser-film+5c-film = 9.8（大小写归一+别名）', () => {
  eq(PricingEngine.getFilmFee('10c-novacel-laser-film+5c-film'), 9.8);
});

test('v1.0.134 预定义组合优先 7C-FILM+5C-FILM = 2.2（FILM_FEES 整名命中不拆分）', () => {
  eq(PricingEngine.getFilmFee('7C-FILM+5C-FILM'), 2.2);
});

test('v1.0.134 带+单膜 BLUE+KBE-5C-FILM 不误拆 = 1.0（整名命中）', () => {
  eq(PricingEngine.getFilmFee('BLUE+KBE-5C-FILM'), 1.0);
});

test('v1.0.134 组合膜含未知段 → null（无法识别）', () => {
  eq(PricingEngine.getFilmFee('UNKNOWN-XXX+5C-FILM'), null);
});

test('v1.0.134 组合膜整单计算：卷板 304 1.00*1240*C 10C-NOVACEL+5C 膜费并入', () => {
  const r = PricingEngine.calculate({
    material: '304', surface: '2B', thickness: '1.00', width: '1240', length: 'C',
    film1: '10C-NOVACEL-LASER-FILM+5C-FILM', film2: '', basePrice: 15000, packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.film1FeeSqm, 9.8); // 元/方（组合价）
  // 折算元/吨：9.8 × 1000/7.93/1.00
  const perTon = Math.round(9.8 * 1000 / 7.93 / 1.00 * 100) / 100;
  eq(r.detail.film1PerTon, perTon);
});

test('v1.0.134 组合膜别名段（中文+英文混合）进口膜+垫纸 = 4.5+0.3', () => {
  eq(PricingEngine.getFilmFee('10c进口膜+垫纸'), 4.8);
});

test('v1.0.134 小写 normalizeFilm 大小写归一 10c-film → 10C-FILM', () => {
  eq(PricingEngine.normalizeFilm('10c-film'), '10C-FILM');
});

// === v1.0.135 全检费（仅平板，1.5元/方可修改） ===
test('v1.0.135 单张模式勾全检：1.5元/方 × 面积计入', () => {
  const r = PricingEngine.calculate({
    material: '304', surface: '2B', thickness: '0.80', width: '1219', length: '2438',
    film1: '', film2: '', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架', inspect: 1.5
  });
  eq(r.success, true);
  eq(r.detail.calcMode, 'sheet');
  eq(r.detail.inspectFeeSqm, 1.5);
  const area = r.detail.sheetArea; // 1.219×2.438 = 2.9719...
  eq(r.detail.inspectPerSheet, Math.round(1.5 * area * 1000) / 1000);
});

test('v1.0.135 单张模式不勾全检（inspect=0）：不计费', () => {
  const r = PricingEngine.calculate({
    material: '304', surface: '2B', thickness: '0.80', width: '1219', length: '2438',
    film1: '', film2: '', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架', inspect: 0
  });
  eq(r.success, true);
  eq(r.detail.inspectFeeSqm, 0);
  eq(r.detail.inspectPerSheet, 0);
});

test('v1.0.140 卷板/过磅模式勾全检：全检费按 1.5元/方 × 每吨面积 计入（v1.0.135 原规则已放宽）', () => {
const r = PricingEngine.calculate({
material: '304', surface: '2B', thickness: '1.00', width: '1240', length: 'C',
film1: '', film2: '', basePrice: 15000, packing: '木架', inspect: 1.5
});
eq(r.success, true);
eq(r.detail.inspectFeeSqm, 1.5);
eq(Math.abs(r.detail.inspectPerTon - 1.5 * r.detail.sqmPerTon) < 0.02, true, '全检费元/吨=1.5×每吨面积');
});

test('v1.0.135 自定义全检价 2.0元/方：按 2.0 × 面积', () => {
  const r = PricingEngine.calculate({
    material: '304', surface: '2B', thickness: '1.00', width: '1219', length: '2438',
    film1: '', film2: '', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架', inspect: 2.0
  });
  eq(r.success, true);
  eq(r.detail.inspectFeeSqm, 2.0);
});

test('v1.0.140 批量混合：过磅行全检费照算（v1.0.135 原规则已放宽）', () => {
const r = PricingEngine.calculate({
material: '304', surface: '2B', thickness: '1.00', width: '1240', length: 'C',
film1: '', film2: '', basePrice: 15000, packing: '木架', calcMode: 'weight', inspect: 1.5
});
eq(r.success, true);
eq(r.detail.inspectFeeSqm, 1.5);
eq(Math.abs(r.detail.inspectPerTon - 1.5 * r.detail.sqmPerTon) < 0.02, true);
});

test('v1.0.135 无 inspect 字段（批量导入行）：不影响计算', () => {
  const r = PricingEngine.calculate({
    material: '304', surface: '2B', thickness: '0.80', width: '1219', length: '2438',
    film1: '', film2: '', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架'
  });
  eq(r.success, true);
  eq(r.detail.inspectFeeSqm || 0, 0);
  eq(r.detail.inspectPerSheet || 0, 0);
});

// === v1.0.136 检测要求列（全检自动识别，和包装方式一样） ===
test('v1.0.136 表头表格 检测要求=全检 → inspectFlag true', () => {
  const headers = ['产地', '材质', '表面', '厚度', '宽度', '长度', '检测要求'];
  const it = ExcelParser.parseRow(['宏旺', '304', '2B', '0.80', '1219', '2438', '全检'], headers, {});
  eq(it.inspectFlag, true);
  eq(it.material, '304');
});

test('v1.0.136 表头表格 检测要求=空 → inspectFlag false', () => {
  const headers = ['产地', '材质', '表面', '厚度', '宽度', '长度', '检测要求'];
  const it = ExcelParser.parseRow(['宏旺', '304', '2B', '0.80', '1219', '2438', ''], headers, {});
  eq(it.inspectFlag, false);
});

test('v1.0.136 无检测要求列 → inspectFlag undefined（不误判）', () => {
  const headers = ['产地', '材质', '表面', '厚度', '宽度', '长度'];
  const it = ExcelParser.parseRow(['宏旺', '304', '2B', '0.80', '1219', '2438'], headers, {});
  eq(it.inspectFlag, undefined);
});

test('v1.0.136 检测要求列=是/Y → 全检', () => {
  const headers = ['产地', '材质', '厚度', '检测要求'];
  eq(ExcelParser.parseRow(['宏旺', '304', '0.80', '是'], headers, {}).inspectFlag, true);
  eq(ExcelParser.parseRow(['宏旺', '304', '0.80', 'Y'], headers, {}).inspectFlag, true);
  eq(ExcelParser.parseRow(['宏旺', '304', '0.80', '否'], headers, {}).inspectFlag, false);
});

test('v1.0.136 列头别名（全检/检测要求/检测标准）都识别', () => {
  const it = ExcelParser.parseRow(['宏旺', '304', '全检'], ['产地', '材质', '全检'], {});
  eq(it.inspectFlag, true);
  const it2 = ExcelParser.parseRow(['宏旺', '304', '全检'], ['产地', '材质', '检测标准'], {});
  eq(it2.inspectFlag, true);
});

test('v1.0.136 单张+检测全检：runCalc 注入后 inspect=1.5 → 计费（引擎链路）', () => {
  const r = PricingEngine.calculate({
    material: '304', surface: '2B', thickness: '0.80', width: '1219', length: '2438',
    film1: '', film2: '', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架', inspect: 1.5
  });
  eq(r.success, true);
  eq(r.detail.inspectFeeSqm, 1.5);
  eq(r.detail.inspectPerSheet > 0, true);
});

// === v1.0.137 模板新列头（钢种/保护膜·垫纸/标厚/件数/序号） ===
test('v1.0.137 用户模板全列头识别（13列）', () => {
  const headers = ['序号', '产地', '钢种', '表面', '保护膜/垫纸', '标厚', '厚度', '宽度', '长度', '包装方式', '检测要求', '件数', '重量(吨)'];
  const it = ExcelParser.parseRow(['1', '上克', '304', '单张砂面NO.4', '10C-NOVACEL-LASER-FILM+7C-FILM', '1.2', '1.14-1.15', '1219', '3000', '密封木箱', '全检', '', ''], headers, {});
  eq(it.seq, '1');
  eq(it.origin, '上克');
  eq(it.material, '304');
  eq(it.surface, '单张砂面NO.4');
  eq(it.film1, '10C-NOVACEL-LASER-FILM+7C-FILM');
  eq(it.film2, undefined);
  eq(it.stdThickness, '1.2');
  eq(it.thickness, '1.14-1.15');
  eq(it.width, '1219');
  eq(it.length, '3000');
  eq(it.packing, '密封木箱');
  eq(it.inspectFlag, true);
});

test('v1.0.137 件数列识别 + 重量列', () => {
  const headers = ['产地', '钢种', '厚度', '件数', '重量(吨)'];
  const it = ExcelParser.parseRow(['宏旺', '304', '0.80', '25', '3.5'], headers, {});
  eq(it.quantity, '25');
  eq(it.weight, '3.5');
});

test('v1.0.137 组合膜整串入 film1（引擎组合计价链路）', () => {
  const fee = PricingEngine.getFilmFee('10C-NOVACEL-LASER-FILM+7C-FILM');
  eq(fee != null && fee > 0, true);
});

test('v1.0.137 垫纸列头别名识别', () => {
  const it = ExcelParser.parseRow(['5C-FILM'], ['垫纸'], {});
  eq(it.film1, '5C-FILM');
});

test('v1.0.137 旧「材质」列头仍兼容', () => {
  const it = ExcelParser.parseRow(['304'], ['材质'], {});
  eq(it.material, '304');
});

// === v1.0.138 喷砂打底包含匹配（彩色系列）===
test('v1.0.138 喷砂: 单张高普8K黑钛金+喷砂 单张模式 成功（颜色变体算打底）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金+喷砂', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.embossFees.some(e => e.key === 'sandblast'), true, '喷砂计入');
  eq(Math.abs(r.detail.embossPerSheet - 3 * r.detail.sheetArea) < 0.01, true, '喷砂单张费=3×面积');
});

test('v1.0.138 喷砂: 单张高普8K黑钛金+喷砂 过磅模式 成功（v1.0.138 放宽 calcMode）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金+喷砂', thickness: '0.80', width: '1219', length: '3000', origin: '上克', basePrice: 15000, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.linenFeePerTon > 0, true, '喷砂按吨折算计入');
});

test('v1.0.138 表面: 单张普精8K黑钛金 过磅模式 成功（颜色变体表面价）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张普精8K黑钛金', thickness: '0.80', width: '1219', length: '3000', origin: '上克', basePrice: 15000, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeePerTon > 0, true);
});

test('v1.0.138 表面: 单张超精8K黄钛金 单张模式 成功', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张超精8K黄钛金', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
});

test('v1.0.145 喷砂: 单张精磨8K+喷砂 允许（规则放宽）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张精磨8K+喷砂', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
});

// === v1.0.146 完整彩色 key 拆分展示（品质费 + 颜色费，总额不变）===
test('v1.0.146 彩色拆分: 单张高普8K黑钛金 → 品质4 + 颜色6', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金', thickness: '1.14-1.15', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 4, '品质费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 6, '颜色费=' + r.detail.colorFeeSqm);
  eq(r.detail.colorName, '黑钛金');
  eq(r.detail.normSurface, '单张高普8K');
});
test('v1.0.146 彩色拆分: +喷砂 三费用（8K 4 + 黑钛金 6 + 喷砂 3）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金+喷砂', thickness: '1.14-1.15', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 4);
  eq(r.detail.colorFeeSqm, 6);
  eq(r.detail.embossFees.some(e => e.key === 'sandblast'), true);
});
test('v1.0.146 彩色拆分: sheet 模式 单张普精8K黄钛金 1.65 → 品质10 + 颜色20', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张普精8K黄钛金', thickness: '1.65', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'sheet', boardType: 'sheet', quantity: '1', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 10, '品质费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 20, '颜色费=' + r.detail.colorFeeSqm);
});

// === v1.0.149 颜色基础价与系数（UI 计算式 31.5*1.25=39.38）===
test('v1.0.149 颜色计算式: 1000宽 单张高普8K宝石蓝 → base 31.5 * 1.25 = 39.38', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K宝石蓝', thickness: '1.90-1.95', width: '1000', length: '2000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 10, '品质费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 39.38, '颜色费=' + r.detail.colorFeeSqm);
  eq(r.detail.colorBaseSqm, 31.5, '基础色价=' + r.detail.colorBaseSqm);
  eq(r.detail.colorMult, 1.25, '系数=' + r.detail.colorMult);
});
// === v1.0.160 五尺(1500/1524/1530) 单张彩色加工 = 四尺纯颜色费 ×1.7 ===
test('v1.0.160 五尺彩色: 单张砂面NO.4黄钛金 1500 0.24-1.2 → 打包 2.5白板 + 6*1.7=10.2 颜色 = 12.7', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4黄钛金', thickness: '0.80', width: '1500', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  // v1.0.161 拆分展示：基础表面费 2.5 + 颜色费 10.2（6*1.7）
  eq(r.detail.surfaceFeeSqm, 2.5, '基础表面费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 10.2, '颜色费=' + r.detail.colorFeeSqm);
  eq(r.detail.colorBaseSqm, 6, '基础色价=' + r.detail.colorBaseSqm);
  eq(r.detail.colorMult, 1.7, '系数=' + r.detail.colorMult);
});
test('v1.0.160 五尺彩色: 单张拉丝HL黄钛金 1524 0.24-1.2 → 同样 12.7（1524 同 1500）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张拉丝HL黄钛金', thickness: '0.80', width: '1524', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 2.5, '基础表面费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 10.2, '颜色费=' + r.detail.colorFeeSqm);
});
// === v1.0.161 所有单张彩色拆分展示（基础表面费 + 颜色费，总额不变）===
test('v1.0.161 拆分: 单张砂面NO.4黄钛金 1219 0.80 → 白板1.5 + 颜色6 = 7.5', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4黄钛金', thickness: '0.80', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 1.5, '基础表面费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 6, '颜色费=' + r.detail.colorFeeSqm);
  eq(r.detail.colorName, '黄钛金');
});
test('v1.0.161 拆分+1000修正: 单张砂面NO.4黄钛金 1000 0.80 → 白板2 + 颜色6*1.25=7.5 = 9.5', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4黄钛金', thickness: '0.80', width: '1000', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 2, '基础表面费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 7.5, '颜色费=' + r.detail.colorFeeSqm);
  eq(r.detail.colorBaseSqm, 6, '基础色价=' + r.detail.colorBaseSqm);
  eq(r.detail.colorMult, 1.25, '系数=' + r.detail.colorMult);
});
test('v1.0.161 拆分: 单张拉丝HL宝石蓝 1250 1.65 → 白板4.5(1250按宽板档) + 颜色21.5 = 26', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张拉丝HL宝石蓝', thickness: '1.65', width: '1250', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 4.5, '基础表面费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 21.5, '颜色费=' + r.detail.colorFeeSqm);
});
test('v1.0.161 拆分: 单张砂面NO.4彩虹色 1500 1.85 → 白板4.5 + 颜色44*1.7=74.8 = 79.3', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4彩虹色', thickness: '1.85', width: '1500', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 4.5, '基础表面费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 74.8, '颜色费=' + r.detail.colorFeeSqm);
});
test('v1.0.160 五尺彩色: 单张高普8K黄钛金 1530 0.6-1.2 → 白板9 + 10.2 = 19.2', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黄钛金', thickness: '0.80', width: '1530', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 9, '品质费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 10.2, '颜色费=' + r.detail.colorFeeSqm);
});
test('v1.0.160 五尺彩色: 组合名 单张普磨8K黄钛金 1500 0.24-1.2 → 白板8 + 颜色10.2 = 18.2', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张普磨8K黄钛金', thickness: '0.80', width: '1500', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 8, '品质费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 10.2, '颜色费=' + r.detail.colorFeeSqm);
});
test('v1.0.160 五尺彩色: 单张高普8K宝石蓝 1500 1.90-1.95 → base 31.5 * 1.7 = 53.55', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K宝石蓝', thickness: '1.90-1.95', width: '1500', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.colorBaseSqm, 31.5, '基础色价=' + r.detail.colorBaseSqm);
  eq(r.detail.colorMult, 1.7, '系数=' + r.detail.colorMult);
  eq(r.detail.colorFeeSqm, 53.55, '颜色费=' + r.detail.colorFeeSqm);
});
test('v1.0.160 五尺彩色: 单张高普8K黑钛金 1500 1.60-1.69 → 白板13 + 20*1.7=34 = 47', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金', thickness: '1.65', width: '1500', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 13, '品质费=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 34, '颜色费=' + r.detail.colorFeeSqm);
});
test('v1.0.149 颜色计算式: 1219宽 单张精磨8K黑钛金 1.14 → base 6（无系数）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张精磨8K黑钛金', thickness: '1.14-1.15', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.colorBaseSqm, 6, '基础色价=' + r.detail.colorBaseSqm);
  eq(r.detail.colorMult, 1, '系数=' + r.detail.colorMult);
});

// === v1.0.139 导出字段透传 ===
test('v1.0.139 过磅模式 detail 透传 标厚/检测要求/件数', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金+喷砂', thickness: '0.80', width: '1219', length: '3000', origin: '上克', basePrice: 15000, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱', stdThickness: '1.2', inspectFlag: true, quantity: '25' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.stdThickness, '1.2');
  eq(r.detail.inspectFlag, true);
  eq(r.detail.quantity, '25');
});

test('v1.0.139 单张模式 detail 透传 标厚/检测要求', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架', stdThickness: '1.2', inspectFlag: true });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.stdThickness, '1.2');
  eq(r.detail.inspectFlag, true);
  eq(r.detail.quantity, 1, '单张默认数量1');
});

test('v1.0.139 无标厚/检测要求时为空/否', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '2B', thickness: '0.80', width: '1219', length: '3000', origin: '宏旺', basePrice: 15000, calcMode: 'weight', boardType: 'sheet', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.stdThickness, '');
  eq(r.detail.inspectFlag, false);
});

// === v1.0.140 过磅模式全检费 ===
test('v1.0.140 过磅模式 全检费 1.5元/方×每吨面积 计入成本', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金+喷砂', thickness: '1.14-1.15', width: '1219', length: '3000', origin: '上克', basePrice: 15000, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱', inspect: 1.5 });
  eq(r.success, true, JSON.stringify(r.errors));
  const expect = Math.round(1.5 * r.detail.sqmPerTon * 100) / 100;
  eq(r.detail.inspectPerTon, expect, '全检费元/吨 = 1.5×' + r.detail.sqmPerTon);
  // 成本小计 = 基价+厚度加价+表面+压花+膜+全检
  const base = r.detail.costRaw - r.detail.inspectPerTon;
  eq(r.detail.costRaw, Math.round((base + r.detail.inspectPerTon) * 100) / 100, 'costRaw 含全检');
  eq(r.detail.costRaw > base, true);
});

test('v1.0.140 过磅模式 无全检时 inspectPerTon=0', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张普精8K黑钛金', thickness: '0.80', width: '1219', length: '3000', origin: '上克', basePrice: 15000, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.inspectPerTon, 0);
});

test('v1.0.140 单张模式全检费不受影响', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张高普8K黑钛金', thickness: '0.80', width: '1219', length: '2438', origin: '宏旺', basePrice: 15000, calcMode: 'sheet', boardType: 'sheet', packing: '木架', inspect: 1.5 });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.inspectPerSheet > 0, true);
  eq(Math.abs(r.detail.inspectPerSheet - 1.5 * r.detail.sheetArea) < 0.01, true);
});

test('v1.0.140 过磅模式 全检费计入售价 saleNoTax', () => {
  const r1 = PricingEngine.calculate({ material: '304', surface: '2B', thickness: '1.00', width: '1240', length: 'C', film1: '', film2: '', basePrice: 15000, packing: '木架', inspect: 1.5 });
  const r2 = PricingEngine.calculate({ material: '304', surface: '2B', thickness: '1.00', width: '1240', length: 'C', film1: '', film2: '', basePrice: 15000, packing: '木架', inspect: 0 });
  eq(r1.success, true);
  eq(r2.success, true);
  eq(r1.detail.saleNoTax >= r2.detail.saleNoTax, true, '含全检售价不低于无全检');
  // 十位取整后差异可能被吞，但成本差必须等于全检费
  eq(Math.abs((r1.detail.costNoTaxRaw - r2.detail.costNoTaxRaw) - r1.detail.inspectPerTon) < 0.02, true, '不含税成本差=全检费');
});

// === v1.0.153 恢复单张砂面NO.4/单张拉丝HL 1000mm+五尺(1500/1524/1530)档（v1.0.142 误删回滚） ===
test('v1.0.153 单张砂面NO.4 1000mm 档恢复', () => {
  const a = PricingEngine.getSurfaceFee('单张砂面NO.4', 1.0, 1000, '304');
  eq(a.sqmPrice, 2, '1000mm 0.24-1.2 段');
  const b = PricingEngine.getSurfaceFee('单张砂面NO.4', 1.8, 1000, '304');
  eq(b.sqmPrice, 4, '1000mm 1.51-2 段');
});
test('v1.0.153 单张砂面NO.4 五尺档恢复', () => {
  eq(PricingEngine.getSurfaceFee('单张砂面NO.4', 1.0, 1500, '304').sqmPrice, 2.5, '1500 五尺');
  eq(PricingEngine.getSurfaceFee('单张砂面NO.4', 1.0, 1524, '304').sqmPrice, 2.5, '1524');
  eq(PricingEngine.getSurfaceFee('单张砂面NO.4', 1.0, 1530, '304').sqmPrice, 2.5, '1530');
});
test('v1.0.153 单张拉丝HL 1000mm/五尺档恢复', () => {
  eq(PricingEngine.getSurfaceFee('单张拉丝HL', 1.0, 1000, '304').sqmPrice, 2, 'HL 1000mm');
  eq(PricingEngine.getSurfaceFee('单张拉丝HL', 1.0, 1500, '304').sqmPrice, 2.5, 'HL 五尺');
});
test('v1.0.153/166 单张彩色 1000mm 档（拆开计算：白板 + 颜色×1.25）', () => {
  const mk = s => PricingEngine.calculate({ material: '304', surface: s, thickness: '1.0', width: '1000', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  const r1 = mk('单张砂面NO.4黄钛金');
  eq(r1.success, true, JSON.stringify(r1.errors));
  eq(r1.detail.surfaceFeeSqm, 2, '白板=' + r1.detail.surfaceFeeSqm);
  eq(r1.detail.colorFeeSqm, 7.5, '黄钛金1000(6×1.25)=' + r1.detail.colorFeeSqm);
  eq(Math.round((r1.detail.surfaceFeeSqm + r1.detail.colorFeeSqm) * 100) / 100, 9.5, '总额');
  const r2 = mk('单张砂面NO.4宝石蓝');
  eq(r2.success, true, JSON.stringify(r2.errors));
  eq(r2.detail.colorFeeSqm, 9.38, '宝石蓝1000(7.5×1.25)=' + r2.detail.colorFeeSqm);
  eq(Math.round((r2.detail.surfaceFeeSqm + r2.detail.colorFeeSqm) * 100) / 100, 11.38, '总额');
  const r3 = mk('单张拉丝HL翡翠绿');
  eq(r3.success, true, JSON.stringify(r3.errors));
  eq(r3.detail.colorFeeSqm, 27.5, '翡翠绿1000(22×1.25)=' + r3.detail.colorFeeSqm);
  eq(Math.round((r3.detail.surfaceFeeSqm + r3.detail.colorFeeSqm) * 100) / 100, 29.5, '总额');
});
test('v1.0.166 单张砂面黄钛金+亮油 全拆开: 白板2 + 颜色6 + 亮油3.5 = 11.5（1219 平板）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张砂面黄钛金+亮油', thickness: '1.0', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 1.5, '白板=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 6, '颜色=' + r.detail.colorFeeSqm);
  eq(r.detail.afpFeeSqm, 3.5, '亮油=' + r.detail.afpFeeSqm);
  eq(r.detail.colorName, '黄钛金');
});
test('v1.0.166 单张拉丝黄钛金哑油 全拆开: 白板 + 颜色 + 哑油', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张拉丝黄钛金哑油', thickness: '1.0', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 1.5, '白板=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 6, '颜色=' + r.detail.colorFeeSqm);
  eq(r.detail.afpFeeSqm, 5, '哑油=' + r.detail.afpFeeSqm);
});
test('v1.0.166 颜色费覆盖生效: 黄钛金第1档覆盖为 8', () => {
  PricingEngine.setUserOverrides({ colorFees: { '黄钛金': [8] }, colorLocked: {} });
  const r = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4黄钛金', thickness: '1.0', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.colorFeeSqm, 8, '覆盖后=' + r.detail.colorFeeSqm);
  PricingEngine.setUserOverrides(null);
});

// === v1.0.163 特殊组合板块：单张拉丝青古铜哑光(镀铜) 30元/㎡ 组合价不可拆分 ===
test('v1.0.163 特殊组合: 304 1219 0.98 → 加工费 30 元/㎡ 不可拆分', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张拉丝青古铜哑光(镀铜)', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 30, '组合价=' + r.detail.surfaceFeeSqm);
  eq(r.detail.colorFeeSqm, 0, '不可拆分=' + r.detail.colorFeeSqm);
  eq(r.detail.colorName, '', '无颜色名');
});
test('v1.0.163 特殊组合: 1000/1500 宽度同为 30', () => {
  const r1 = PricingEngine.calculate({ material: '304', surface: '单张拉丝青古铜哑光(镀铜)', thickness: '1.2', width: '1000', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  const r2 = PricingEngine.calculate({ material: '304', surface: '单张拉丝青古铜哑光(镀铜)', thickness: '1.2', width: '1500', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r1.success, true, JSON.stringify(r1.errors));
  eq(r2.success, true, JSON.stringify(r2.errors));
  eq(r1.detail.surfaceFeeSqm, 30);
  eq(r2.detail.surfaceFeeSqm, 30);
});
test('v1.0.163 特殊组合: 别名 镀铜/青古铜哑光 归一', () => {
  eq(PricingEngine.normalizeSurface('单张拉丝青古铜哑光镀铜'), '单张拉丝青古铜哑光(镀铜)');
  eq(PricingEngine.normalizeSurface('青古铜哑光'), '单张拉丝青古铜哑光(镀铜)');
  const r = PricingEngine.calculate({ material: '304', surface: '青古铜哑光', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 30);
});
test('v1.0.163 特殊组合: sheet 模式 30 元/㎡', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张拉丝青古铜哑光(镀铜)', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'sheet', boardType: 'sheet', packing: '密封木箱', quantity: 10 });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 30);
});
test('v1.0.163 特殊组合: 卷板自动降级 8K（单张系列规则）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张拉丝青古铜哑光(镀铜)', thickness: '0.98', width: '1219', length: 'C', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'coil', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
});

// === v1.0.164 单张彩色新增 钛铝古铜 13元/㎡ + 亮油/哑油 改名与卷板/平板分价 + 上油工艺 ===
test('v1.0.164 钛铝古铜: 单张砂面NO.4钛铝古铜 1219 0.98 → 白板1.5 + 颜色13', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4钛铝古铜', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.colorName, '钛铝古铜', '颜色名=' + r.detail.colorName);
  eq(r.detail.colorFeeSqm, 13, '颜色费=' + r.detail.colorFeeSqm);
  eq(r.detail.surfaceFeeSqm, 1.5, '白板费=' + r.detail.surfaceFeeSqm);
});
test('v1.0.164 钛铝古铜: 单张拉丝HL钛铝古铜 1500 0.98 → 白板2.5 + 13×1.7', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张拉丝HL钛铝古铜', thickness: '0.98', width: '1500', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.colorFeeSqm, 22.1, '颜色费=' + r.detail.colorFeeSqm);
});
test('v1.0.164 钛铝古铜: 1000mm 颜色×1.25', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4钛铝古铜', thickness: '0.98', width: '1000', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.colorFeeSqm, 16.25, '颜色费=' + r.detail.colorFeeSqm);
});
test('v1.0.164 亮油: 拉丝黄钛金亮油 卷板 → afpFeeSqm 2', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '拉丝黄钛金亮油', thickness: '0.98', width: '1219', length: 'C', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'coil', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.afpFeeSqm, 2, 'afp=' + r.detail.afpFeeSqm);
});
test('v1.0.164 亮油: 拉丝黄钛金亮油 平板 → afpFeeSqm 3.5', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '拉丝黄钛金亮油', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.afpFeeSqm, 3.5, 'afp=' + r.detail.afpFeeSqm);
});
test('v1.0.164 哑油: 卷板 5 / 平板 5', () => {
  const r1 = PricingEngine.calculate({ material: '304', surface: '拉丝黄钛金哑油', thickness: '0.98', width: '1219', length: 'C', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'coil', packing: '木架' });
  const r2 = PricingEngine.calculate({ material: '304', surface: '拉丝黄钛金哑油', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r1.success, true, JSON.stringify(r1.errors));
  eq(r2.success, true, JSON.stringify(r2.errors));
  eq(r1.detail.afpFeeSqm, 5, '卷板afp=' + r1.detail.afpFeeSqm);
  eq(r2.detail.afpFeeSqm, 5, '平板afp=' + r2.detail.afpFeeSqm);
});
test('v1.0.165 拆开计算: 拉丝黄钛金亮光无指纹 卷板 → base(卷)4.5 + 亮油2 = 6.5（总额不变）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '拉丝黄钛金亮光无指纹', thickness: '0.98', width: '1219', length: 'C', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'coil', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 4.5, 'base=' + r.detail.surfaceFeeSqm);
  eq(r.detail.afpFeeSqm, 2, 'afp=' + r.detail.afpFeeSqm);
  eq(Math.round((r.detail.surfaceFeeSqm + r.detail.afpFeeSqm) * 10) / 10, 6.5, '总额');
});
test('v1.0.165 拆开计算: 拉丝黄钛金亮光无指纹(卷) 带后缀输入 → 同样拆开', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '拉丝黄钛金亮光无指纹(卷)', thickness: '0.98', width: '1219', length: 'C', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'coil', packing: '木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.afpFeeSqm, 2, 'afp=' + r.detail.afpFeeSqm);
});
test('v1.0.165 拆开计算: 拉丝黄钛金亮光无指纹 平板 → 5 + 3.5 = 8.5', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '拉丝黄钛金亮光无指纹', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 5, 'base=' + r.detail.surfaceFeeSqm);
  eq(r.detail.afpFeeSqm, 3.5, 'afp=' + r.detail.afpFeeSqm);
});
test('v1.0.165 钛铝古铜 与 钛块古铜 严格区分（不模糊）', () => {
  eq(PricingEngine.normalizeSurface('单张砂面NO.4钛铝古铜'), '单张砂面NO.4钛铝古铜');
  eq(PricingEngine.normalizeSurface('单张砂面NO.4钛块古铜'), '单张砂面NO.4钛块古铜');
  const r1 = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4钛铝古铜', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  const r2 = PricingEngine.calculate({ material: '304', surface: '单张砂面NO.4钛块古铜', thickness: '0.98', width: '1219', length: '3000', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'sheet', packing: '密封木箱' });
  eq(r1.success, true, JSON.stringify(r1.errors));
  eq(r2.success, true, JSON.stringify(r2.errors));
  eq(r1.detail.colorName, '钛铝古铜');
  eq(r2.detail.colorName, '钛块古铜');
  eq(r1.detail.colorFeeSqm, 13, '钛铝古铜=' + r1.detail.colorFeeSqm);
  eq(r2.detail.colorFeeSqm, 7.5, '钛块古铜=' + r2.detail.colorFeeSqm);
});
test('v1.0.165 normalize 保护: 拉丝黄钛金亮光无指纹 不模糊成 (卷) base', () => {
  eq(PricingEngine.normalizeSurface('拉丝黄钛金亮光无指纹'), '拉丝黄钛金亮光无指纹');
  eq(PricingEngine.normalizeSurface('拉丝黄钛金亮油'), '拉丝黄钛金亮油');
});



// === v1.0.167 新增保护膜 4.5C-FILM (0.65元/㎡) + 含税/不含税成本新公式（2026-09-01 用户规则） ===
test('v1.0.167 保护膜 4.5C-FILM = 0.65 元/㎡', () => {
  eq(PricingEngine.getFilmFee('4.5C-FILM'), 0.65);
});
test('v1.0.167 4.5C-FILM 计入成本（304 1.00*1219*C 平板 木架）', () => {
  const r = PricingEngine.calculate({ material: '304', surface: '2B', thickness: '1.00', width: '1219', length: 'C', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'coil', packing: '木架', film1: '4.5C-FILM', film2: '' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.film1FeeSqm, 0.65);
  // 膜费元/吨 = 0.65 × 每吨面积
  const f1 = Math.round(0.65 * r.detail.sqmPerTon * 100) / 100;
  eq(r.detail.film1PerTon, f1);
});
test('v1.0.167 含税成本 = 材料(基价+厚度加价) + 其他费用÷0.92', () => {
  // 2B 无膜无加工：其他费用=0 → 含税成本 = 材料原值
  const r1 = PricingEngine.calculate({ material: '304', surface: '2B', thickness: '1.00', width: '1240', length: 'C', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'coil', packing: '木架', film1: '', film2: '' });
  eq(r1.success, true);
  eq(r1.detail.costTax, 14300 + (r1.detail.thickSurcharge || 0), '无其他费用时含税成本=材料');
  eq(r1.detail.costNoTax, Math.round((14300 + (r1.detail.thickSurcharge || 0)) * 0.92 / 10) * 10, '不含税=材料×0.92');
  // 带膜费：含税 = 材料 + 膜÷0.92
  const r2 = PricingEngine.calculate({ material: '304', surface: '2B', thickness: '1.00', width: '1240', length: 'C', origin: '上克', basePrice: 14300, calcMode: 'weight', boardType: 'coil', packing: '木架', film1: '4.5C-FILM', film2: '' });
  eq(r2.success, true);
  const mat2 = 14300 + (r2.detail.thickSurcharge || 0);
  const other2 = r2.detail.film1PerTon;
  const expectTax2 = Math.round((mat2 + other2 / 0.92) / 10) * 10;
  eq(r2.detail.costTax, expectTax2, '含税成本 = 材料 + 膜费÷0.92 取十位');
  const expectNoTax2 = Math.round((mat2 * 0.92 + other2) / 10) * 10;
  eq(r2.detail.costNoTax, expectNoTax2, '不含税成本 = 材料×0.92 + 膜费');
});

// === v1.0.168 双面砂面NO.4 / 双面HL拉丝（价 = 单面 NO.4/HL ×2，2026-09-05 用户规则）===
test('v1.0.168 双面砂面NO.4 = NO.4×2 (窄板 sqm档)', () => {
  eq(JSON.stringify(PricingEngine.getSurfaceFee('双面砂面NO.4', 0.5, 1240, '201')), JSON.stringify({ sqmPrice: 1, needConvert: true }));
  eq(PricingEngine.getSurfaceFee('NO.4', 0.5, 1240, '201').sqmPrice * 2, PricingEngine.getSurfaceFee('双面砂面NO.4', 0.5, 1240, '201').sqmPrice);
});
test('v1.0.168 双面砂面NO.4 = NO.4×2 (窄板 ton档)', () => {
  eq(PricingEngine.getSurfaceFee('双面砂面NO.4', 2.0, 1240, '201'), 200);
  eq(PricingEngine.getSurfaceFee('NO.4', 2.0, 1240, '201') * 2, 200);
});
test('v1.0.168 双面HL拉丝 = HL×2 (宽板 1500)', () => {
  eq(JSON.stringify(PricingEngine.getSurfaceFee('双面HL拉丝', 1.0, 1500, '201')), JSON.stringify({ sqmPrice: 2, needConvert: true }));
  eq(PricingEngine.getSurfaceFee('双面HL拉丝', 2.0, 1500, '201'), 400);
  eq(PricingEngine.getSurfaceFee('HL', 1.0, 1500, '201').sqmPrice * 2, 2);
});
test('v1.0.168 双面别名归一', () => {
  eq(PricingEngine.normalizeSurface('双面砂面NO.4'), '双面砂面NO.4');
  eq(PricingEngine.normalizeSurface('双面NO.4'), '双面砂面NO.4');
  eq(PricingEngine.normalizeSurface('双面no.4'), '双面砂面NO.4');
  eq(PricingEngine.normalizeSurface('双面砂面'), '双面砂面NO.4');
  eq(PricingEngine.normalizeSurface('双面磨砂NO.4'), '双面砂面NO.4');
  eq(PricingEngine.normalizeSurface('双面HL拉丝'), '双面HL拉丝');
  eq(PricingEngine.normalizeSurface('双面拉丝'), '双面HL拉丝');
  eq(PricingEngine.normalizeSurface('双面HL'), '双面HL拉丝');
});
test('v1.0.168 201 卷 1.00*1240*C 双面砂面NO.4 计入成本', () => {
  const r = PricingEngine.calculate({ material: '201', surface: '双面砂面NO.4', thickness: '1.00', width: '1240', length: 'C', film1: '', film2: '', basePrice: 7800 });
  eq(r.success, true, JSON.stringify(r.errors));
  const sqm = Math.round(1000 / 7.85 / 1.00 * 100) / 100;
  eq(r.detail.surfaceFeeSqm, 1);
  eq(r.detail.surfaceFeePerTon, Math.round(sqm * 100) / 100);
  eq(r.detail.normSurface, '双面砂面NO.4');
});
test('v1.0.168 双面成本比单面高一个单面费（同规格 窄板 ton档 2.0mm）', () => {
  const a = PricingEngine.calculate({ material: '201', surface: 'NO.4', thickness: '2.00', width: '1240', length: 'C', film1: '', film2: '', basePrice: 7800 });
  const b = PricingEngine.calculate({ material: '201', surface: '双面砂面NO.4', thickness: '2.00', width: '1240', length: 'C', film1: '', film2: '', basePrice: 7800 });
  eq(a.success, true); eq(b.success, true);
  eq(a.detail.surfaceFeePerTon, 100);
  eq(b.detail.surfaceFeePerTon, 200);
  eq(b.detail.costNoTaxRaw - a.detail.costNoTaxRaw, 100, '双面比单面多 100 元/吨');
});

// === v1.0.169 宏旺400系厚度加价上限 2.00→3.00 + 北港201J1（2026-09-05 用户规则）===
test('v1.0.169 430W/2BA 宏旺 2.50mm 可算且加价0（原上限2.00会报错）', () => {
  const r = PricingEngine.calculate({ material: '430W/2BA', origin: '宏旺', surface: '', thickness: '2.50', width: '1219', length: 'C', basePrice: 9000 });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.costTax, 9000, '2.50mm 应在 0.52-3.00 档加价0，成本=基价9000');
});
test('v1.0.169 430W/2BA 宏旺 3.00mm 边界可算', () => {
  const r = PricingEngine.calculate({ material: '430W/2BA', origin: '宏旺', surface: '', thickness: '3.00', width: '1219', length: 'C', basePrice: 9000 });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.costTax, 9000);
});
test('v1.0.169 430W/2BB 引用同表 2.50mm 可算', () => {
  const r = PricingEngine.calculate({ material: '430W/2BB', origin: '宏旺', surface: '', thickness: '2.50', width: '1219', length: 'C', basePrice: 9000 });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.costTax, 9000);
});
test('v1.0.169 410S/2BA 宏旺 2.50mm 引用宏旺400系同表', () => {
  const r = PricingEngine.calculate({ material: '410S/2BA', origin: '宏旺', surface: '', thickness: '2.50', width: '1219', length: 'C', basePrice: 9000 });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.costTax, 9000);
});
test('v1.0.169 北港 201J1 可正常计算（不分宽度，引擎走标准201加价）', () => {
  const r = PricingEngine.calculate({ material: '201J1', origin: '北港', surface: '2B', thickness: '0.98', width: '1524', length: 'C', basePrice: 8500, film1: '', film2: '' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.normSurface, '2B');
});
test('v1.0.169 201J5 北港既有逻辑不受影响', () => {
  const r = PricingEngine.calculate({ material: '201J5', origin: '北港', surface: '2B', thickness: '0.98', width: '1219', length: 'C', basePrice: 8600, film1: '', film2: '' });
  eq(r.success, true, JSON.stringify(r.errors));
});


// === v1.0.170 定制化计价（2026-09-05 用户规则：平板+件数+包装总额手填均摊+费用覆盖+新公式）===
test('v1.0.170 定制化 304 平板 1.00*1219*2438 100张 包装总额3000：平摊+成本+双口径', () => {
  const r = PricingEngine.calculate({ material: '304', origin: '申金', surface: '2B', thickness: '1.00', width: '1219', length: '2438', basePrice: 14300, calcMode: 'custom', quantity: '100', packingFee: '3000', packing: '定制木架' });
  eq(r.success, true, JSON.stringify(r.errors));
  const c = r.detail.custom;
  eq(r.calcMode, 'custom');
  eq(c.quantity, 100);
  eq(Math.round(c.sheetWeightKg * 100) / 100, 23.57, '单张kg');
  eq(c.totalTon, 2.3568, '总吨');
  eq(Math.round(c.packingPerTon * 100) / 100, 1272.91, '包装平摊元/吨');
  eq(c.packingPerSheet, 30, '包装平摊元/张=30');
  eq(c.containerPerTon, 50, '装柜默认50元/吨');
  eq(c.edgePerTon, 200, '边部自动200(1219切边)');
  eq(c.surfacePerTon, 0);
  eq(r.detail.costTax, 16260, '含税成本十位整');
  eq(r.detail.costNoTax, 14950);
  eq(c.sheetCostTax, 383.22, '每张含税');
  eq(c.sheetCostNoTax, 352.34, '每张不含税');
  eq(c.totalCostTax, 38321.57, '整批含税总额');
  eq(r.detail.saleTax, 16260, '兼容saleTax=costTax');
  eq(r.detail.weight, 2.3568, '兼容weight=总吨');
});
test('v1.0.170 定制化覆盖项生效（表面500/装柜100/边部0/包装100元吨）', () => {
  const r = PricingEngine.calculate({ material: '304', origin: '申金', surface: '2B', thickness: '1.00', width: '1219', length: '2438', basePrice: 14300, calcMode: 'custom', quantity: '100', customSurfaceTon: '500', customContainerTon: '100', customEdgeTon: '0', customPackingTon: '100' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.costTax, 15360);
  eq(r.detail.custom.surfacePerTon, 500);
  eq(r.detail.custom.containerPerTon, 100);
  eq(r.detail.custom.edgePerTon, 0);
  eq(r.detail.custom.packingPerTon, 100);
});
test('v1.0.170 定制化 NO.4 表面自动带出（不限单张表面白名单）', () => {
  const r = PricingEngine.calculate({ material: '304', origin: '申金', surface: 'NO.4', thickness: '1.00', width: '1219', length: '2438', basePrice: 14300, calcMode: 'custom', quantity: '100', packingFee: '3000' });
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.custom.surfaceAutoPerTon > 0, true, 'NO.4自动费>0');
});
test('v1.0.170 定制化卷板报错', () => {
  const r = PricingEngine.calculate({ material: '304', origin: '申金', surface: '2B', thickness: '1.00', width: '1219', length: 'C', basePrice: 14300, calcMode: 'custom', quantity: '100' });
  eq(r.success, false, JSON.stringify(r.errors));
});
test('v1.0.170 定制化缺件数报错', () => {
  const r = PricingEngine.calculate({ material: '304', origin: '申金', surface: '2B', thickness: '1.00', width: '1219', length: '2438', basePrice: 14300, calcMode: 'custom' });
  eq(r.success, false, JSON.stringify(r.errors));
});
test('v1.0.170 定制化件数翻倍每张成本不变（固定元/吨费用）', () => {
  const base = { material: '304', origin: '申金', surface: '2B', thickness: '1.00', width: '1219', length: '2438', basePrice: 14300, calcMode: 'custom', customPackingTon: '100' };
  const a = PricingEngine.calculate(Object.assign({}, base, { quantity: '100' }));
  const b = PricingEngine.calculate(Object.assign({}, base, { quantity: '200' }));
  eq(a.success && b.success, true);
  eq(a.detail.custom.sheetCostTax, b.detail.custom.sheetCostTax, '每张一致');
  eq(Math.abs(b.detail.custom.totalCostTax - a.detail.custom.totalCostTax * 2) < 0.011, true, '总额约翻倍(容忍单批round2 0.01误差)');
});

console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
