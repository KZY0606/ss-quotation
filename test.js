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
  eq(r.success, true); eq(r.detail.costTax, 10080); eq(r.detail.saleTax, 10580);
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
  eq(p.thickness, '0.50'); eq(p.width, 1240); eq(p.length, 'C'); eq(p.film1, '5C-FILM');
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

// === 201 基价宽度档（精确值）测试 ===
test('201 宽度档映射: 1000/1030→2(并入1219/1240), 1219/1240→2, 1250/1280→3, 1500/1530→4', () => {
  eq(PricingEngine.getWidthBand201(1000), 2, '1000 并入 1219/1240 档（用户确认取消 1000/1030 独立档）');
  eq(PricingEngine.getWidthBand201(1030), 2, '1030 并入 1219/1240 档');
  eq(PricingEngine.getWidthBand201(1219), 2);
  eq(PricingEngine.getWidthBand201(1240), 2);
  eq(PricingEngine.getWidthBand201(1250), 3);
  eq(PricingEngine.getWidthBand201(1280), 3);
  eq(PricingEngine.getWidthBand201(1500), 4);
  eq(PricingEngine.getWidthBand201(1530), 4);
});
test('calculate: 宽度1000 订单用 1219/1240 档基价正常计算', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'8K', thickness:'0.55', width:'1000', length:'2500', film1:'', film2:'', basePrice:7800});
  eq(r.success, true, '1000mm 不报宽度档错误，基价用 b2');
  eq(r.detail.basePrice, 7800);
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
  const r = PricingEngine.calculate({material:'201J5',surface:'2B',thickness:'0.50',width:'1220',length:'C',film1:'',film2:'',basePrice:7800});
  // 2026-08-21：J5 无厚度加价数据，报错而非宽度档错误（原断言 success=true 已随规则变更）
  eq(r.success, false);
  eq(r.errors.some(e => e.includes('北港 J5 未提供厚度加价')), true, '报错为无厚度加价提示');
});

test('304 不受 201 宽度档限制: 304 0.50*1220*C', () => {
  const r = PricingEngine.calculate({material:'304',surface:'2B',thickness:'0.50',width:'1220',length:'C',film1:'',film2:'',basePrice:7800});
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
    thickness: '0.50', width: '1220', length: '2440',
    film1: '5C-FILM', film2: '', isYanYan: false, basePrice: 8000
  });
  eq(r.success, true, '430B/2BA with surface should succeed');
  eq(r.detail.surfaceFeePerTon > 0, true, 'should have surface fee');
  eq(r.detail.surface, '8K黑钛金', 'surface should be recognized');
});

// === 1500/1530 宽板厚度分档 ===
test('getThickBand1500: 201J1 边界值 t1-t6', () => {
  eq(PricingEngine.getThickBand1500('201J1', 0.55), 't1');
  eq(PricingEngine.getThickBand1500('201J1', 0.67), 't1');
  eq(PricingEngine.getThickBand1500('201J1', 0.68), 't2');
  eq(PricingEngine.getThickBand1500('201J1', 0.88), 't3');
  eq(PricingEngine.getThickBand1500('201J1', 1.18), 't4');
  eq(PricingEngine.getThickBand1500('201J1', 1.28), 't5');
  eq(PricingEngine.getThickBand1500('201J1', 1.37), 't5');
  eq(PricingEngine.getThickBand1500('201J1', 1.38), 't6');
  eq(PricingEngine.getThickBand1500('201J1', 2.0), 't6');
  eq(PricingEngine.getThickBand1500('201J1', 0.54), null, '低于 0.55 应报错');
});
test('getThickBand1500: 201J2 四档', () => {
  eq(PricingEngine.getThickBand1500('201J2', 0.68), 't1');
  eq(PricingEngine.getThickBand1500('201J2', 0.88), 't1');
  eq(PricingEngine.getThickBand1500('201J2', 0.89), 't2');
  eq(PricingEngine.getThickBand1500('201J2', 1.18), 't3');
  eq(PricingEngine.getThickBand1500('201J2', 1.57), 't3');
  eq(PricingEngine.getThickBand1500('201J2', 1.58), 't4');
  eq(PricingEngine.getThickBand1500('201J2', 0.67), null, '低于 0.68 应报错');
});
test('getThickBand1500: 201J3 六档（第二档修正为 0.88-1.17）', () => {
  eq(PricingEngine.getThickBand1500('201J3', 0.85), 't1');
  eq(PricingEngine.getThickBand1500('201J3', 0.87), 't1');
  eq(PricingEngine.getThickBand1500('201J3', 0.88), 't2');
  eq(PricingEngine.getThickBand1500('201J3', 1.09), 't2', '1.09-1.17 应在第二档');
  eq(PricingEngine.getThickBand1500('201J3', 1.17), 't2');
  eq(PricingEngine.getThickBand1500('201J3', 1.18), 't3');
  eq(PricingEngine.getThickBand1500('201J3', 1.28), 't4');
  eq(PricingEngine.getThickBand1500('201J3', 1.38), 't5');
  eq(PricingEngine.getThickBand1500('201J3', 1.57), 't5');
  eq(PricingEngine.getThickBand1500('201J3', 1.58), 't6');
  eq(PricingEngine.getThickBand1500('201J3', 0.84), null, '低于 0.85 应报错');
});
test('getThickBand1500: J4/J5/其他材质无厚度分档', () => {
  eq(PricingEngine.getThickBand1500('201J4', 1.0), null);
  eq(PricingEngine.getThickBand1500('201J5', 1.0), null);
  eq(PricingEngine.getThickBand1500('304', 1.0), null);
  eq(PricingEngine.getThickBand1500('201J1', 'abc'), null);
});
test('calculate: 1500宽 201J1 厚度0.60（t1 内）校验通过', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J1', surface:'', thickness:'0.60', width:'1500', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r.success, true);
});
test('calculate: 1500宽 201J1 厚度0.50（低于0.55）报错', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J1', surface:'', thickness:'0.50', width:'1500', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r.success, false, '应失败');
  eq(r.errors.join(';').includes('厚度档位'), true, '应提示厚度不在档位');
});
test('calculate: 1530宽 201J3 厚度1.10（t2 内）校验通过', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J3', surface:'', thickness:'1.10', width:'1530', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r.success, true);
});
test('calculate: 1500宽 201J4 暂不支持', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J4', surface:'', thickness:'1.00', width:'1500', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r.success, false, '应失败');
  eq(r.errors.join(';').includes('暂不支持 201J4'), true);
});
test('calculate: 1219宽 201J2（普通档）不受厚度分档影响', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'', thickness:'0.60', width:'1219', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r.success, true, '普通档应正常');
});

// === 边类型（毛边/齐边）===
test('getEdgeType: 1250 为齐边 (trim)', () => {
  eq(PricingEngine.getEdgeType(1250), 'trim', '1250 应为齐边（用户确认）');
});
test('getEdgeType: 1280 为毛边 (rough)', () => {
  eq(PricingEngine.getEdgeType(1280), 'rough');
});
test('getEdgeType: 1240/1260/1270 毛边，1000/1219/1220/1500 齐边', () => {
  eq(PricingEngine.getEdgeType(1240), 'rough');
  eq(PricingEngine.getEdgeType(1260), 'rough');
  eq(PricingEngine.getEdgeType(1270), 'rough');
  eq(PricingEngine.getEdgeType(1000), 'trim');
  eq(PricingEngine.getEdgeType(1219), 'trim');
  eq(PricingEngine.getEdgeType(1220), 'trim');
  eq(PricingEngine.getEdgeType(1500), 'trim');
  eq(PricingEngine.getEdgeType(1530), 'rough');
});
test('getEdgeType: 列表外宽度返回 null', () => {
  eq(PricingEngine.getEdgeType(1245), null);
  eq(PricingEngine.getEdgeType(999), null);
});

// === 表面加工费宽度范围（1280 纳入常规档，1500-1530 独立）===
test('getSurfaceFee: 8K 1280mm 与 1250mm 同价（常规档）', () => {
  eq(PricingEngine.getSurfaceFee('8K', 0.55, 1280, '201J2').sqmPrice, 2.5, '1280 应匹配常规档');
  eq(PricingEngine.getSurfaceFee('8K', 0.55, 1250, '201J2').sqmPrice, 2.5, '1250 不变');
});
test('getSurfaceFee: 8K 1500/1530 走宽板档独立价', () => {
  eq(PricingEngine.getSurfaceFee('8K', 0.60, 1500, '201J2').sqmPrice, 8.0, '1500 宽板价');
  eq(PricingEngine.getSurfaceFee('8K', 0.60, 1530, '201J2').sqmPrice, 8.0, '1530 宽板价');
});
test('getSurfaceFee: 8K 厚档 1.30mm × 1280 与 1250 同价', () => {
  eq(PricingEngine.getSurfaceFee('8K', 1.30, 1280, '201J2').sqmPrice, 4.5);
});
test('getSurfaceFee: NO.4 1280 与 1250 同价（ton 档 1.30mm）', () => {
  eq(PricingEngine.getSurfaceFee('NO.4', 1.30, 1280, '201J2'), 100, '1280 ton 档');
  eq(PricingEngine.getSurfaceFee('NO.4', 1.30, 1250, '201J2'), 100, '1250 ton 档');
});
test('getSurfaceFee: 宽度范围外（900）仍返回 null', () => {
  eq(PricingEngine.getSurfaceFee('8K', 0.55, 900, '201J2'), null);
});

// === 厚度范围（导入识别/计算/导出保留）===
test('parseThicknessRange: 范围与单值', () => {
  eq(PricingEngine.parseThicknessRange('0.55-0.60').min, 0.55);
  eq(PricingEngine.parseThicknessRange('0.55-0.60').max, 0.60);
  eq(PricingEngine.parseThicknessRange('0.55~0.60').min, 0.55);
  eq(PricingEngine.parseThicknessRange('0.55 - 0.60').max, 0.60);
  eq(PricingEngine.parseThicknessRange('0.55').min, 0.55);
  eq(PricingEngine.parseThicknessRange('0.55').max, 0.55);
  eq(PricingEngine.parseThicknessRange('abc'), null);
});
test('calculate: 厚度范围 0.55-0.60 正常计算且 detail 保留范围', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'8K', thickness:'0.55-0.60', width:'1250', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r.success, true, '范围应正常计算（取下限 0.55）');
  eq(r.detail.thickness, '0.55-0.60', 'detail 保留范围字符串');
  eq(r.detail.surfaceFeePerTon > 0, true, '8K 表面费已算');
});
test('parseSpec: 范围规格 0.55-0.60*1240*2500', () => {
  const p = PricingEngine.parseSpec('0.55-0.60*1240*2500');
  eq(p.thickness, '0.55-0.60');
  eq(p.width, 1240);
  eq(p.length, '2500');
});
test('parseFreeText: 范围规格文本', () => {
  const p = PricingEngine.parseFreeText('宏旺 201J2 8K 0.55-0.60*1240*2500 C', {});
  eq(p.thickness, '0.55-0.60', '范围保留');
  eq(p.width, 1240);
});
test('calculate: 1500 宽板 + 厚度范围 0.55-0.60 落 J1 档', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J1', surface:'', thickness:'0.55-0.60', width:'1500', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r.success, true, '范围下限 0.55 在 1500 档 J1 厚度范围');
});

// === 产地/材质调整（2026-08-20）===
test('430W/2BA（宏旺）厚度加价：10 档半开区间边界（2026-08-20 用户提供，独立于 430B/2BA 瑞钢）', () => {
  const g = t => PricingEngine.getThicknessSurcharge(t, false, '430W/2BA', '宏旺', '2BA');
  eq(g(0.21), 1600, '0.21 首档');
  eq(g(0.24), 1600, '0.24 含首档');
  eq(g(0.25), 1300, '0.25 第二档(0.24,0.26]');
  eq(g(0.26), 1300, '0.26 含第二档');
  eq(g(0.27), 900, '0.27 第三档(0.26,0.29]');
  eq(g(0.29), 900, '0.29 含第三档');
  eq(g(0.30), 750, '0.30 第四档(0.29,0.30]');
  eq(g(0.31), 650, '0.31 第五档(0.30,0.36]');
  eq(g(0.36), 650, '0.36 含第五档');
  eq(g(0.37), 400, '0.37 第六档(0.36,0.39]');
  eq(g(0.39), 400, '0.39 含第六档');
  eq(g(0.40), 300, '0.40 第七档(0.39,0.42]');
  eq(g(0.42), 300, '0.42 含第七档');
  eq(g(0.43), 200, '0.43 第八档(0.42,0.49]');
  eq(g(0.49), 200, '0.49 含第八档');
  eq(g(0.50), 100, '0.50 第九档(0.49,0.51]');
  eq(g(0.51), 100, '0.51 含第九档');
  eq(g(0.52), 0, '0.52 第十档不加价');
  eq(g(2.00), 0, '2.00 含第十档');
  eq(g(2.01), null, '2.01 超上限返回 null');
  // 与瑞钢 430B/2BA 不同：同厚度价不同
  eq(g(0.30), 750, '0.30 宏旺 750（瑞钢 0.30 → 600）');
  eq(g(0.50), 100, '0.50 宏旺 100（瑞钢 0.50 → 0）');
});
test('430W/2BB（宏旺）与 430W/2BA 同厚度加价', () => {
  const g2bb = t => PricingEngine.getThicknessSurcharge(t, false, '430W/2BB', '宏旺', '2BB');
  eq(g2bb(0.24), 1600, '0.24 → 1600');
  eq(g2bb(0.30), 750, '0.30 → 750');
  eq(g2bb(0.50), 100, '0.50 → 100');
  eq(g2bb(0.52), 0, '0.52 → 0');
  eq(g2bb(2.00), 0, '2.00 → 0');
  eq(g2bb(2.01), null, '2.01 超上限 null');
});
test('上克 430/BA 厚度加价与 430B/BA 相同', () => {
  const g = t => PricingEngine.getThicknessSurcharge(t, false, '430/BA', '上克', 'BA');
  eq(g(0.30), 650, '0.30 → 650（430B-BA 表 0.30-0.35）');
  eq(g(0.50), 0, '0.50 → 0（0.50-1.20）');
  eq(g(1.30), 100, '1.30 → 100（1.21-1.50）');
  // 与甬金 430/BA 同表
  eq(PricingEngine.getThicknessSurcharge(0.30, false, '430/BA', '甬金', 'BA'), 650, '甬金 430/BA 同价');
});
test('宏旺 410S/BA 厚度加价与宏旺其他 400 系相同（独立于甬金/上克 410S/BA）', () => {
  const g = t => PricingEngine.getThicknessSurcharge(t, false, '410S/BA', '宏旺', 'BA');
  eq(g(0.24), 1600, '0.24 → 1600（宏旺 10 档表首档）');
  eq(g(0.30), 750, '0.30 → 750（第四档）');
  eq(g(0.50), 100, '0.50 → 100（第九档）');
  eq(g(0.52), 0, '0.52 → 0');
  eq(g(2.00), 0, '2.00 → 0');
  eq(g(2.01), null, '2.01 超上限 null');
  // 甬金/上克 410S/BA 不受影响（旧表 0.30-0.35 → 650）
  eq(PricingEngine.getThicknessSurcharge(0.30, false, '410S/BA', '甬金', 'BA'), 650, '甬金 410S/BA 0.30 → 650');
  eq(PricingEngine.getThicknessSurcharge(0.30, false, '410S/BA', '上克', 'BA'), 650, '上克 410S/BA 0.30 → 650');
});
test('430W 未配置组合返回 null（不误用 201 加价）', () => {
  eq(PricingEngine.getThicknessSurcharge(0.50, false, '430W/BA', '宏旺', 'BA'), null, '430W/BA 不存在（宏旺只有 430W/2BA）→ null');
  eq(PricingEngine.getThicknessSurcharge(0.50, false, '430W/NO.4', '宏旺', 'NO.4'), null, '430W/NO.4 未配置 → null');
});
test('316L 甬金/太钢：未提供厚度加价数据 → null 报错（2026-08-20）', () => {
  eq(PricingEngine.getThicknessSurcharge(0.50, false, '316L', '太钢'), null, '太钢 316L 无数据 → null');
  eq(PricingEngine.getThicknessSurcharge(2.00, false, '316L', '太钢'), null, '太钢 316L 2.00 → null（不落通用表）');
  eq(PricingEngine.getThicknessSurcharge(0.30, false, '316L', '张浦'), 1400, '张浦 316L 仍有表不受影响');
});
test('316L 甬金 17 档新表 + 薄料 1500/1530 宽度加价（2026-08-21）', () => {
  const g = t => PricingEngine.getThicknessSurcharge(t, false, '316L', '甬金');
  eq(g(0.27), 2100, '0.27 → 2100');
  eq(g(0.29), 1400, '0.29 → 1400');
  eq(g(0.32), 1400, '0.32 → 1400');
  eq(g(0.34), 1200, '0.34 → 1200');
  eq(g(0.37), 1200, '0.37 → 1200');
  eq(g(0.39), 1000, '0.39 → 1000');
  eq(g(0.40), 1000, '0.40 → 1000');
  eq(g(0.42), 1000, '0.42 → 1000');
  eq(g(0.49), 800, '0.49 → 800');
  eq(g(0.50), 700, '0.50 → 700');
  eq(g(0.59), 700, '0.59 → 700');
  eq(g(0.69), 600, '0.69 → 600');
  eq(g(0.79), 500, '0.79 → 500');
  eq(g(0.89), 400, '0.89 → 400');
  eq(g(0.99), 400, '0.99 → 400');
  eq(g(1.19), 400, '1.19 → 400（1.2 归下档）');
  eq(g(1.20), 300, '1.20 → 300');
  eq(g(3.00), 300, '3.00 → 300（上限）');
  eq(g(3.10), null, '3.10 超上限 → null');
  // 宽度加价：calculate 级验证
  const r1500 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.35', width:'1500', length:'2500', basePrice:10000});
  eq(r1500.success, true, '甬金316L 0.35*1500 可算');
  eq(r1500.detail.widthSurcharge, 300, '薄料 1500 宽厚度加价 +300');
  eq(r1500.detail.thickSurcharge, 1500, '0.35 加价 1200+300=1500');
  const r1240 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.35', width:'1240', length:'2500', basePrice:10000});
  eq(r1240.success, true, '1240 宽可算');
  eq(r1240.detail.widthSurcharge, 0, '1240 宽不加价');
  eq(r1240.detail.thickSurcharge, 1200, '1240 宽 0.35 加价 1200');
  const r060 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.60', width:'1500', length:'2500', basePrice:10000});
  eq(r060.detail.widthSurcharge, 0, '0.60 厚超 0.50 不加宽价');
  const r1530 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.50', width:'1530', length:'2500', basePrice:10000});
  eq(r1530.detail.widthSurcharge, 300, '0.50*1530 薄料 +300');
});
test('316L 张浦新 16 档表（2026-08-20）', () => {
  const g = t => PricingEngine.getThicknessSurcharge(t, false, '316L', '张浦');
  eq(g(0.27), 2100, '张浦 316L 0.27 → 2100');
  eq(g(0.29), 1400, '0.29 → 1400');
  eq(g(0.32), 1400, '0.32 → 1400');
  eq(g(0.37), 1200, '0.37 → 1200');
  eq(g(0.42), 1000, '0.42 → 1000（新档 0.38-0.42）');
  eq(g(0.49), 900, '0.49 → 900');
  eq(g(0.50), 900, '0.50 → 900');
  eq(g(0.60), 900, '0.60 → 900');
  eq(g(0.70), 700, '0.70 → 700');
  eq(g(0.80), 600, '0.80 → 600');
  eq(g(1.00), 500, '1.00 → 500');
  eq(g(1.20), 450, '1.20 → 450');
  eq(g(1.50), 400, '1.50 → 400');
  eq(g(2.00), 300, '2.00 → 300');
  eq(g(2.99), 300, '2.99 → 300（2.01-2.99 档）');
  eq(g(3.00), 700, '3.00 → 700（归 3.00-6.00 档，连续区间）');
  eq(g(5.00), 700, '5.00 → 700');
  eq(g(6.00), 700, '6.00 → 700（上限内）');
  eq(g(6.10), null, '6.10 超上限 → null');
});
test('张浦 304 厚度上限 6.00mm（2026-08-20）', () => {
  const g = t => PricingEngine.getThicknessSurcharge(t, false, '304', '张浦');
  eq(g(0.30), 1300, '张浦 304 0.30 → 1300');
  eq(g(0.50), 600, '张浦 304 0.50 → 600');
  eq(g(0.80), 300, '张浦 304 0.80 → 300');
  eq(g(3.00), 300, '张浦 304 3.00 → 300');
  eq(g(5.00), 300, '张浦 304 5.00 → 300（6.00 内）');
  eq(g(6.00), 300, '张浦 304 6.00 → 300（上限）');
  eq(g(6.10), null, '张浦 304 6.10 超上限 → null');
  eq(PricingEngine.getThicknessSurcharge(5.00, false, '304', '德龙'), null, '德龙 304 5.00 仍超 3.00 上限 → null（不受张浦影响）');
});
test('freeText: 430W/2BA 材质识别', () => {
  const p = PricingEngine.parseFreeText('宏旺 430W/2BA 0.40*1240*2500', {});
  eq(p !== null, true);
  eq(p.material, '430W/2BA');
  eq(p.thickness, '0.40');
});
test('进口膜 7C/8C/10C：单价与别名', () => {
  eq(PricingEngine.getFilmFee('7C-IMPORT-FILM'), 3.3, '7C进口膜 3.3');
  eq(PricingEngine.getFilmFee('8C-IMPORT-FILM'), 4.0, '8C进口膜 4.0');
  eq(PricingEngine.getFilmFee('10C-IMPORT-FILM'), 4.5, '10C进口膜 4.5');
  eq(PricingEngine.normalizeFilm('7C进口膜'), '7C-IMPORT-FILM', '7C进口膜→标准名');
  eq(PricingEngine.normalizeFilm('进口膜7C'), '7C-IMPORT-FILM', '进口膜7C→标准名');
  eq(PricingEngine.normalizeFilm('8c进口膜'), '8C-IMPORT-FILM');
  eq(PricingEngine.normalizeFilm('进口膜10c'), '10C-IMPORT-FILM');
  eq(PricingEngine.normalizeFilm('7c-import-film'), '7C-IMPORT-FILM');
  eq(PricingEngine.normalizeFilm('7c'), '7C-FILM', '普通 7C 仍指向 7C-FILM（不被进口膜影响）');
});
test('freeText: 含“7C进口膜”不误匹配为普通 7C-FILM', () => {
  const p = PricingEngine.parseFreeText('宏旺 201J2 NO.4 7C进口膜 0.55*1240*2500', {'201J2':7800});
  eq(p !== null, true);
  eq(p.film1, '7C-IMPORT-FILM', '应识别为进口膜而非 7C-FILM');
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'NO.4', thickness:'0.55', width:'1240', length:'2500', film1:'7C-IMPORT-FILM', film2:'', basePrice:7800});
  eq(r.success, true, '进口膜正常计算');
});
test('1500/1530 宽板厚度上限 3.00mm：3.00 可算、3.05 报错', () => {
  eq(PricingEngine.getThickBand1500('201J1', 3.00), 't6', '3.00 落 J1 t6');
  eq(PricingEngine.getThickBand1500('201J2', 3.00), 't4', '3.00 落 J2 t4');
  eq(PricingEngine.getThickBand1500('201J3', 3.00), 't6', '3.00 落 J3 t6');
  eq(PricingEngine.getThickBand1500('201J1', 3.05), null, '3.05 超上限返回 null');
  eq(PricingEngine.getThickBand1500('201J2', 3.05), null);
  eq(PricingEngine.getThickBand1500('201J3', 3.05), null);
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J1', surface:'8K', thickness:'3.00', width:'1500', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r.success, true, '3.00mm 宽板正常计算');
  const r2 = PricingEngine.calculate({origin:'宏旺', material:'201J1', surface:'8K', thickness:'3.05', width:'1500', length:'C', film1:'', film2:'', basePrice:8000});
  eq(r2.success, false, '3.05mm 宽板报错');
});

test('彩色表面小炉/大炉 /S /L（2026-08-21）', () => {
  eq(PricingEngine.normalizeSurface('8K黄钛金(板)/S'), '8K黄钛金/S', '后缀 /S 归一化');
  eq(PricingEngine.normalizeSurface('8K黄钛金(板)S'), '8K黄钛金/S', '无斜杠 S 同样识别');
  eq(PricingEngine.normalizeSurface('8K黄钛金(板)L'), '8K黄钛金/L', '无斜杠 L 同样识别');
  eq(PricingEngine.normalizeSurface('8k黄钛金(板) s'), '8K黄钛金/S', '空格分隔小写后缀');
  eq(PricingEngine.normalizeSurface('8K黄钛金(板)/L'), '8K黄钛金/L', '后缀 /L 归一化');
  eq(PricingEngine.normalizeSurface('8k黄钛金(板)/s'), '8K黄钛金/S', '小写后缀');
  eq(PricingEngine.normalizeSurface('8K黄钛金(板)'), '8K黄钛金', '无后缀默认大炉键');
  eq(PricingEngine.normalizeSurface('HL'), 'HL', 'HL 不被误判为 L 后缀');
  eq(PricingEngine.normalizeSurface('NO.4'), 'NO.4', 'NO.4 不受影响');
  eq(PricingEngine.normalizeSurface('砂面/拉丝(NO.4/HL)黄钛金(板)/S'), '拉丝黄钛金/S', '砂面/拉丝基础别名+/S');
  eq(PricingEngine.normalizeSurface('砂面/拉丝(NO.4/HL)黄钛金(板)S'), '拉丝黄钛金/S', '砂面/拉丝无斜杠 S');
  const fee = (s, t, w, mat) => PricingEngine.getSurfaceFee(PricingEngine.normalizeSurface(s), t, w, mat || '304');
  eq(fee('8K黄钛金(板)/S', 0.5, 1240).sqmPrice, 10, '8K黄钛金小炉 10 元/方');
  eq(fee('8K黄钛金(板)/L', 0.5, 1240).sqmPrice, 5.5, '8K黄钛金大炉 5.5');
  eq(fee('8K黄钛金(板)', 0.5, 1240).sqmPrice, 5.5, '无后缀默认大炉价');
  eq(fee('8K黄钛金(板)S', 0.5, 1240).sqmPrice, 10, '无斜杠 S 小炉价');
  eq(fee('8K玫瑰金(板)/S', 0.5, 1240).sqmPrice, 10, '8K玫瑰金小炉 10');
  eq(fee('8K香槟金(板)/S', 0.5, 1240).sqmPrice, 10, '8K香槟金小炉 10');
  eq(fee('砂面/拉丝(NO.4/HL)黄钛金(板)/S', 0.5, 1240).sqmPrice, 7.5, '砂面/拉丝黄钛金小炉 7.5');
  eq(fee('砂面/拉丝(NO.4/HL)玫瑰金(板)/S', 0.5, 1240).sqmPrice, 7.5, '砂面/拉丝玫瑰金小炉 7.5');
  eq(fee('砂面/拉丝(NO.4/HL)香槟金(板)/S', 0.5, 1240).sqmPrice, 7.5, '砂面/拉丝香槟金小炉 7.5');
  eq(fee('拉丝黄钛金(板)/L', 0.5, 1240).sqmPrice, 5, '拉丝黄钛金大炉 5');
  eq(fee('磨砂黄钛金(板)/S', 0.5, 1240).sqmPrice, 7.5, '磨砂黄钛金小炉同价 7.5');
  const r = PricingEngine.calculate({origin:'德龙', material:'304', surface:'8K黄钛金(板)/S', thickness:'0.50', width:'1240', length:'2500', basePrice:10000});
  eq(r.success, true, '带 /S 表面正常计算');
  eq(r.detail.normSurface, '8K黄钛金/S', 'normSurface 保留 /S');
});

test('400系彩色表面对标304价（2026-08-21）', () => {
  const calc = (m, s, t) => PricingEngine.calculate({origin:'宏旺', material:m, surface:s, thickness:t, width:'1240', length:'2500', basePrice:8000});
  // 8K黑钛金：304特例价 10（通用表 5）——400系必须同样用 10
  eq(calc('430BA','8K黑钛金(板)','0.50').detail.surfaceFeeSqm, 10, '430BA 8K黑钛金 = 304 特例价 10');
  eq(calc('410S-BA-宏旺','8K黑钛金(板)','0.50').detail.surfaceFeeSqm, 10, '410S-BA-宏旺 8K黑钛金 = 10');
  eq(calc('430W-2BA','8K黑钛金(板)','0.50').detail.surfaceFeeSqm, 10, '430W-2BA 8K黑钛金 = 10');
  eq(calc('430','8K黑钛金(板)','0.50').success, false, '430 纯材质无厚度表仍报厚度错（不影响表面）');
  // 6 品种彩色：400系与304同价（通用表）
  eq(calc('430BA','8K黄钛金(板)','0.50').detail.surfaceFeeSqm, 5.5, '430BA 8K黄钛金 = 5.5');
  eq(calc('430BA','8K黄钛金(板)/S','0.50').detail.surfaceFeeSqm, 10, '430BA 8K黄钛金小炉 = 10');
  eq(calc('430BA','砂面/拉丝(NO.4/HL)黄钛金(板)/S','0.50').detail.surfaceFeeSqm, 7.5, '430BA 砂面拉丝黄钛金小炉 = 7.5');
  eq(calc('430BA','8K玫瑰金(板)/L','0.50').detail.surfaceFeeSqm, 6.5, '430BA 8K玫瑰金大炉 = 6.5');
});

test('北港 J5 无厚度加价暂不计算（2026-08-21）', () => {
  const r = PricingEngine.calculate({origin:'北港', material:'201J5', surface:'NO.4', thickness:'0.5', width:'1240', length:'2500', basePrice:8000});
  eq(r.success, false, '北港 J5 报错不计算');
  eq(r.errors.some(e => e.includes('北港 J5 未提供厚度加价')), true, '报错文案含北港 J5 提示');
  // 其他 201 材质不受影响
  const r2 = PricingEngine.calculate({origin:'青山', material:'201J2', surface:'2B', thickness:'0.5', width:'1240', length:'2500', basePrice:8000});
  eq(r2.success, true, '青山 201J2 正常计算');
  eq(r2.detail.thickSurcharge, 500, '201J2 厚度加价 500');
});


console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
