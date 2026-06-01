const fs = require('fs');
const code = fs.readFileSync(__dirname + '/js/config.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/js/engine.js', 'utf8') + '\nreturn PricingEngine;';
const PricingEngine = new Function(code)();

let pass = 0, fail = 0;
function test(n, fn) { try { fn(); console.log(`✅ ${n}`); pass++; } catch(e) { console.log(`❌ ${n}: ${e.message}`); fail++; } }
function eq(a, b, l) { if (a !== b) throw new Error(`${l}: ${a} !== ${b}`); }

// === 原有测试 ===
test('用户示例: NO.4 5C-FILM 0.50*1240*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'NO.4',thickness:'0.50',width:'1240',length:'C',film1:'5C-FILM',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8680); eq(r.detail.costNoTax, 7990); eq(r.detail.saleTax, 8880);
});

test('2B 无膜 1.00*1240*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'2B',thickness:'1.00',width:'1240',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8000); eq(r.detail.saleTax, 8200);
});

test('8K 镜面 0.50*1219*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'8K',thickness:'0.50',width:'1219',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8940);
});

test('8K黄钛金 7C+垫纸 0.50*1219*2500', () => {
  const r = PricingEngine.calculate({material:'201',surface:'8K黄钛金',thickness:'0.50',width:'1219',length:'2500',film1:'7C-FILM',film2:'垫纸',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 10130); eq(r.detail.saleTax, 10630);
});

test('双面抛光 0.50*1000*2000', () => {
  const r = PricingEngine.calculate({material:'201',surface:'双面抛光',thickness:'0.50',width:'1000',length:'2000',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8600); eq(r.detail.saleTax, 9300);
});

test('拉丝黑钛金 0.60*1219*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'拉丝黑钛金',thickness:'0.60',width:'1219',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8730);
});

test('错误处理: 无效厚度', () => {
  const r = PricingEngine.calculate({material:'201',surface:'2B',thickness:'5.00',width:'1240',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, false); eq(r.errors.some(e => e.includes('厚度')), true);
});

test('8K 宽板 1.00*1500*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'8K',thickness:'1.00',width:'1500',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 9020); eq(r.detail.saleTax, 9420);
});

test('NO.4 宽板 1.50*1500*C', () => {
  const r = PricingEngine.calculate({material:'201',surface:'NO.4',thickness:'1.50',width:'1500',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true); eq(r.detail.costTax, 8200);
});

// === 新增：压延料测试 ===
test('压延料 NO.4 0.50*1240*C (压延0.50-0.59=+500)', () => {
  const r = PricingEngine.calculate({material:'201J2',surface:'NO.4',thickness:'0.50',width:'1240',length:'C',film1:'',film2:'',basePrice:7800,isYanYan:true});
  eq(r.success, true); eq(r.detail.thickSurcharge, 500);
  eq(r.detail.thickTable, '压延料');
  // 7800+500+127.39 = 8427.39 -> round10 = 8430
  eq(r.detail.costTax, 8430);
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
  eq(r.detail.costTax, 9330);
});

// === 自由文本解析测试 ===
test('自由文本: 宏旺201J1 NO.4 5C-FILM 0.50*1240*C', () => {
  const p = PricingEngine.parseFreeText('宏旺201J1 NO.4 5C-FILM 0.50*1240*C', {'201J1':8700});
  eq(p !== null, true); eq(p.material, '201J1'); eq(p.surface, 'NO.4');
  eq(p.thickness, 0.50); eq(p.width, 1240); eq(p.length, 'C'); eq(p.film1, '5C-FILM');
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

// === 小珠光(LINEN)测试 ===
test('BA linen 0.45mm → 450元/吨 (单面抛光150+小珠光300)', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'BA linen', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false
  });
  eq(r.success, true);
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.surfaceFeePerTon, 150);
  eq(r.detail.costTax, 9150);
});

test('8K linen 0.45mm → 707.71+300=1007.71元/吨', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'8K linen', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false
  });
  eq(r.success, true);
  eq(r.detail.hasLinen, true);
  eq(r.detail.surfaceFeePerTon, 707.71);
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.costTax, 9710);
});

test('小珠光 alias: 镜面8k黄钛金小珠光 0.50mm', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'镜面8k黄钛金小珠光', thickness:'0.50', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false
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
    film1:'', film2:'', basePrice:7800, isYanYan:false
  });
  eq(r.success, true);
  eq(r.detail.afpFeeSqm, 2); // 亮光(默认)
  eq(r.detail.surfaceFeePerTon, 1415.43); // 5 * 283.09
  eq(r.detail.afpPerTon, 566.17); // 2 * 283.09
  eq(r.detail.costTax, 10680);
});

test('AFP: 拉丝古铜哑光抗指纹 = 组合价 15元/sqm 0.45mm', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'拉丝古铜哑光抗指纹', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false
  });
  eq(r.success, true);
  eq(r.detail.surfaceFeePerTon, Math.round(15 * (1000/7.85/0.45) * 100) / 100);
});

test('AFP: 青古铜 alias → 8K古铜', () => {
  eq(PricingEngine.normalizeSurface('青古铜'), '8K古铜');
  eq(PricingEngine.normalizeSurface('黄古铜'), '8K古铜');
  eq(PricingEngine.normalizeSurface('红古铜'), '8K古铜');
});

test('AFP: 拉丝黄钛金哑光抗指纹 = 拉丝黄钛金+AFP(matte)', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'拉丝黄钛金哑光抗指纹', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false
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
    thickness: '0.50', width: '1220', length: '2440',
    film1: '5C-FILM', film2: '', isYanYan: false, basePrice: 8000
  });
  eq(r.success, true, '430B/2BA with surface should succeed');
  eq(r.detail.surfaceFeePerTon > 0, true, 'should have surface fee');
  eq(r.detail.surface, '8K黑钛金', 'surface should be recognized');
});


console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
