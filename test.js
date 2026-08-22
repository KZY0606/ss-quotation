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
  const r = PricingEngine.calculate({material:'201',surface:'8K黄钛金',thickness:'0.50',width:'1219',length:'2500',film1:'7C-FILM',film2:'垫纸',basePrice:7800, packing: '木架' });
  eq(r.success, true); eq(r.detail.costTax, 10080); eq(r.detail.saleTax, 10480); // 平板销售加价细分后 1219*2500 std 组 = 400（原 trim_sheet 500）
});

test('双面抛光 0.50*1000*2000', () => {
  const r = PricingEngine.calculate({material:'201',surface:'双面抛光',thickness:'0.50',width:'1000',length:'2000',film1:'',film2:'',basePrice:7800, packing: '木架' });
  eq(r.success, true); eq(r.detail.costTax, 8600); eq(r.detail.saleTax, 9200); // 1000齐边 1001-2000 新细分 std_1000_s=600（2026-08-22）
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
  , packing: '木架' });
  eq(r.success, true);
  eq(r.detail.linenFeePerTon, 300);
  eq(r.detail.surfaceFeePerTon, 150);
  eq(r.detail.costTax, 9150);
});

test('8K linen 0.45mm → 707.71+300=1007.71元/吨', () => {
  const r = PricingEngine.calculate({
    material:'201J2', surface:'8K linen', thickness:'0.45', width:'1240', length:'2500',
    film1:'', film2:'', basePrice:7800, isYanYan:false
  , packing: '木架' });
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
  , packing: '木架' });
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
  , packing: '木架' });
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
  , packing: '木架' });
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
  , packing: '木架' });
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
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'8K', thickness:'0.55', width:'1000', length:'2500', film1:'', film2:'', basePrice:7800, packing: '木架' });
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

test('宽度白名单: 304 0.50*1220*C → 报错（1220 不在可计算宽度）', () => {
  const r = PricingEngine.calculate({material:'304',surface:'2B',thickness:'0.50',width:'1220',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, false, '1220 应被白名单拦截');
  eq(r.errors.some(e => e.includes('不在可计算宽度')), true, '应提示宽度白名单错误: ' + JSON.stringify(r.errors));
});

test('宽度白名单: 1280 可计算且为毛边（304；201 已按用户规则禁用 1280）', () => {
  const r = PricingEngine.calculate({material:'304',surface:'2B',thickness:'0.50',width:'1280',length:'C',film1:'',film2:'',basePrice:7800});
  eq(r.success, true, '1280 应可计算: ' + JSON.stringify(r.errors));
  eq(r.detail.edgeType, 'rough', '1280 应为毛边');
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

test('430B/2BA 瑞钢 8K黑钛金 0.50*1250*2440 → 识别表面, 用304加工费', () => {
  const r = PricingEngine.calculate({
    origin: '瑞钢', material: '430B/2BA', surface: '8K黑钛金',
    thickness: '0.50', width: '1250', length: '2440',
    film1: '5C-FILM', film2: '', isYanYan: false, basePrice: 8000
  , packing: '木架' });
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
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'8K', thickness:'0.55-0.60', width:'1240', length:'C', film1:'', film2:'', basePrice:8000});
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
test('上克 430/BA 厚度加价与 430B/BA 相同（2026-08-21 新表：对齐 410S/BA）', () => {
  const g = t => PricingEngine.getThicknessSurcharge(t, false, '430/BA', '上克', 'BA');
  eq(g(0.23), 1200, '0.23 → 1200（0.22-0.23）');
  eq(g(0.25), 1000, '0.25 → 1000（0.24-0.26）');
  eq(g(0.30), 600, '0.30 → 600（430B-BA 表 0.30-0.35）');
  eq(g(0.50), 0, '0.50 → 0（0.50-1.20）');
  eq(g(1.30), 100, '1.30 → 100（1.21-1.50）');
  // 与甬金 430/BA 同表
  eq(PricingEngine.getThicknessSurcharge(0.30, false, '430/BA', '甬金', 'BA'), 600, '甬金 430/BA 同价');
  eq(PricingEngine.getThicknessSurcharge(0.21, false, '430/BA', '上克', 'BA'), null, '0.21 低于下限 → null');
  eq(PricingEngine.getThicknessSurcharge(1.51, false, '430/BA', '上克', 'BA'), null, '1.51 超上限 → null');
});
test('宏旺 410S/2BA 厚度加价与宏旺其他 400 系相同（2026-08-21 改名后；08-21 新闭区间表）', () => {
  const g = t => PricingEngine.getThicknessSurcharge(t, false, '410S/2BA', '宏旺', '2BA');
  eq(g(0.24), 1600, '0.24 → 1600（0.21-0.24 首档）');
  eq(g(0.25), 1300, '0.25 → 1300（0.25-0.26）');
  eq(g(0.26), 1300, '0.26 → 1300（0.25-0.26）');
  eq(g(0.27), 900, '0.27 → 900（0.27-0.29）');
  eq(g(0.30), 750, '0.30 → 750（单点档）');
  eq(g(0.31), 650, '0.31 → 650（0.31-0.36）');
  eq(g(0.36), 650, '0.36 → 650（0.31-0.36）');
  eq(g(0.40), 300, '0.40 → 300（0.40-0.42）');
  eq(g(0.43), 200, '0.43 → 200（0.43-0.49）');
  eq(g(0.50), 100, '0.50 → 100（0.50-0.51）');
  eq(g(0.51), 100, '0.51 → 100（0.50-0.51）');
  eq(g(0.52), 0, '0.52 → 0');
  eq(g(2.00), 0, '2.00 → 0');
  eq(g(2.01), null, '2.01 超上限 null');
  // 甬金/上克 410S/BA 新表（2026-08-21 调整：0.22-0.23→1200, 0.24-0.26→1000, 0.27-0.29→800, 0.30-0.35→600）
  eq(PricingEngine.getThicknessSurcharge(0.23, false, '410S/BA', '甬金', 'BA'), 1200, '甬金 410S/BA 0.23 → 1200');
  eq(PricingEngine.getThicknessSurcharge(0.25, false, '410S/BA', '上克', 'BA'), 1000, '上克 410S/BA 0.25 → 1000');
  eq(PricingEngine.getThicknessSurcharge(0.30, false, '410S/BA', '甬金', 'BA'), 600, '甬金 410S/BA 0.30 → 600');
  eq(PricingEngine.getThicknessSurcharge(0.30, false, '410S/BA', '上克', 'BA'), 600, '上克 410S/BA 0.30 → 600');
  eq(PricingEngine.getThicknessSurcharge(0.38, false, '410S/BA', '甬金', 'BA'), 400, '甬金 410S/BA 0.38 → 400');
  eq(PricingEngine.getThicknessSurcharge(0.45, false, '410S/BA', '甬金', 'BA'), 200, '甬金 410S/BA 0.45 → 200');
  eq(PricingEngine.getThicknessSurcharge(0.60, false, '410S/BA', '甬金', 'BA'), 0, '甬金 410S/BA 0.60 → 0');
  eq(PricingEngine.getThicknessSurcharge(1.30, false, '410S/BA', '甬金', 'BA'), 100, '甬金 410S/BA 1.30 → 100');
  eq(PricingEngine.getThicknessSurcharge(1.51, false, '410S/BA', '甬金', 'BA'), null, '甬金 410S/BA 1.51 超上限 → null');
  eq(PricingEngine.getThicknessSurcharge(0.21, false, '410S/BA', '甬金', 'BA'), null, '甬金 410S/BA 0.21 低于下限 → null');
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
  const r1500 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.35', width:'1500', length:'2500', basePrice:10000, packing: '木架' });
  eq(r1500.success, true, '甬金316L 0.35*1500 可算');
  eq(r1500.detail.widthSurcharge, 300, '薄料 1500 宽厚度加价 +300');
  eq(r1500.detail.thickSurcharge, 1500, '0.35 加价 1200+300=1500');
  const r1240 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.35', width:'1240', length:'2500', basePrice:10000, packing: '木架' });
  eq(r1240.success, true, '1240 宽可算');
  eq(r1240.detail.widthSurcharge, 0, '1240 宽不加价');
  eq(r1240.detail.thickSurcharge, 1200, '1240 宽 0.35 加价 1200');
  const r060 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.60', width:'1500', length:'2500', basePrice:10000, packing: '木架' });
  eq(r060.detail.widthSurcharge, 0, '0.60 厚超 0.50 不加宽价');
  const r1530 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.50', width:'1530', length:'2500', basePrice:10000, packing: '木架' });
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
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'NO.4', thickness:'0.55', width:'1240', length:'2500', film1:'7C-IMPORT-FILM', film2:'', basePrice:7800, packing: '木架' });
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
  const r = PricingEngine.calculate({origin:'德龙', material:'304', surface:'8K黄钛金(板)/S', thickness:'0.50', width:'1240', length:'2500', basePrice:10000, packing: '木架' });
  eq(r.success, true, '带 /S 表面正常计算');
  eq(r.detail.normSurface, '8K黄钛金/S', 'normSurface 保留 /S');
});

test('宏旺304 新增 0.26-0.27 +1500（2026-08-21）', () => {
  const g = (o, t) => PricingEngine.getThicknessSurcharge(t, false, '304', o);
  eq(g('宏旺', 0.26), 1500, '宏旺 0.26 → 1500');
  eq(g('宏旺', 0.27), 1500, '宏旺 0.27 → 1500');
  eq(g('宏旺', 0.28), 1300, '宏旺 0.28 → 1300（原首档）');
  eq(g('宏旺', 0.80), 300, '宏旺 0.80 → 300');
  eq(g('宏旺', 3.00), 300, '宏旺 3.00 → 300（上限）');
  eq(g('宏旺', 0.25), null, '宏旺 0.25 超薄 → null');
  eq(g('德龙', 0.26), null, '德龙 0.26 不受影响 → null');
  eq(g('德龙', 0.28), 1300, '德龙 0.28 仍 1300');
  eq(g('张浦', 0.26), null, '张浦 0.26 → null（0.28 起）');
  const r = PricingEngine.calculate({origin:'宏旺', material:'304', surface:'2B', thickness:'0.26', width:'1240', length:'2500', basePrice:10000, packing: '木架' });
  eq(r.success, true, '宏旺 304 0.26 可算');
  eq(r.detail.thickSurcharge, 1500, '宏旺 304 0.26 厚度加价 1500');
});

test('宽度 1524：归类档4/齐边（2026-08-21）', () => {
  eq(PricingEngine.getWidthBand201(1524), 4, '1524 → 档4 (1500/1530)');
  eq(PricingEngine.getEdgeType(1524), 'trim', '1524 判定为齐边');
  // 201 宽板按厚度分档
  const r201 = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'2B', thickness:'0.9', width:'1524', length:'2500', basePrice:8000, packing: '木架' });
  eq(r201.success, true, '201J2 0.9*1524 可算（厚度档 t2）');
  // 304
  const r304 = PricingEngine.calculate({origin:'宏旺', material:'304', surface:'2B', thickness:'0.5', width:'1524', length:'2500', basePrice:10000, packing: '木架' });
  eq(r304.success, true, '304 0.5*1524 可算');
  // 甬金316L 薄料 1524 命中 1500/1530 加价区间
  const r316 = PricingEngine.calculate({origin:'甬金', material:'316L', surface:'2B', thickness:'0.35', width:'1524', length:'2500', basePrice:10000, packing: '木架' });
  eq(r316.success, true, '甬金316L 0.35*1524 可算');
  eq(r316.detail.widthSurcharge, 300, '甬金316L 薄料 1524 → +300');
});

test('美金换算 cnToUsd（2026-08-21）', () => {
  eq(PricingEngine.cnToUsd(6709.7, 670.97), 1000, '6709.7元 / 6.7097 = 1000美元');
  eq(Math.round(PricingEngine.cnToUsd(10000, 670.97) * 100) / 100, 1490.38, '10000元 → 1490.38美元');
  eq(PricingEngine.cnToUsd(10000, 0), null, '汇率 0 → null');
  eq(PricingEngine.cnToUsd('abc', 670.97), null, '非法金额 → null');
});

test('附加费用 addExtras（2026-08-21）', () => {
  // 全勾选：运营费200 + 利息100 + 利润500 = 800
  const e1 = PricingEngine.addExtras(10000, {
    opFee: { on: true, val: 200 },
    interest: { on: true, val: 100 },
    profit: { on: true, val: 500 }
  });
  eq(e1.cny, 10800, '10000 + 800 = 10800');
  eq(e1.extra, 800, '附加合计 800');
  // 部分勾选：只勾利润
  const e2 = PricingEngine.addExtras(10000, { opFee: { on: false, val: 200 }, interest: { on: true, val: 0 }, profit: { on: true, val: 500 } });
  eq(e2.cny, 10500, '只算利润 500');
  // 未勾选 / 空
  eq(PricingEngine.addExtras(10000, null).cny, 10000, '无附加 → 原价');
  eq(PricingEngine.addExtras(10000, {}).cny, 10000, '空对象 → 原价');
  eq(PricingEngine.addExtras('abc', null), null, '非法金额 → null');
});

test('总价 calcTotal（2026-08-21 按吨数算总价）', () => {
  // 10000×2 + 8000×1.5 = 32000；汇率 670.96 → 32000×100/670.96 ≈ 4769.29
  const t = PricingEngine.calcTotal([10000, 8000], [2, 1.5], 670.96);
  eq(t.cny, 32000, '人民币总价 = Σ(单价×重量)');
  eq(Math.round(t.usd * 100) / 100, 4769.29, '美元总价 = 人民币总价/汇率');
  eq(t.count, 2, '有重量行数 2');
  // 未填重量（0）不算
  const t2 = PricingEngine.calcTotal([10000, 8000], [2, 0], 670.96);
  eq(t2.cny, 20000, '重量0行不计入');
  eq(t2.count, 1, '有效行数 1');
  // 全空
  const t3 = PricingEngine.calcTotal([10000, 8000], [0, null], 670.96);
  eq(t3.cny, 0, '全空 → 0');
  eq(t3.count, 0, '有效行数 0');
  // 非法
  eq(PricingEngine.calcTotal([10000], [2], 0), null, '汇率 0 → null');
  eq(PricingEngine.calcTotal(null, null, 670.96).cny, 0, '空数组 → 0');
});

test('贸易术语 addUsdSurcharge（2026-08-21）', () => {
  // EXW 10000元，FOB 加价 $50/吨，汇率 670.96 → +50×6.7096=335.48 → 10335.48
  const r = PricingEngine.addUsdSurcharge(10000, 50, 670.96);
  eq(Math.round(r.cny * 100) / 100, 10335.48, '人民币价 = EXW + 加价×汇率');
  eq(Math.round(r.usd * 100) / 100, 1540.4, '美元价 = EXW美元 + 加价');
  // 无加价
  const r0 = PricingEngine.addUsdSurcharge(10000, 0, 670.96);
  eq(Math.round(r0.cny), 10000, '加价 0 → 原价');
  // 非法
  eq(PricingEngine.addUsdSurcharge(10000, 50, 0), null, '汇率 0 → null');
  eq(PricingEngine.addUsdSurcharge('abc', 50, 670.96), null, '非法金额 → null');
});

test('宏旺 410S/BA 改名 410S/2BA（2026-08-21）', () => {
  // 厚度表：宏旺 410S/2BA 走 430W-2BA 同价表
  const v = PricingEngine.getThicknessSurcharge(0.5, false, '410S/2BA', '宏旺');
  eq(v !== null, true, '宏旺 410S/2BA 有厚度加价');
  eq(v, PricingEngine.getThicknessSurcharge(0.5, false, '430W/2BA', '宏旺'), '与 430W/2BA 同价');
  // 页面基价层已拦截宏旺 410S/BA（PRODUCTS_400 已移除该产品）
  // calculate 全链路（basePrice 直接传，绕过基价面板）
  const r = PricingEngine.calculate({origin:'宏旺', material:'410S/2BA', surface:'2B', thickness:'0.5', width:'1240', length:'2500', basePrice:8000, packing: '木架' });
  eq(r.success, true, '宏旺 410S/2BA 0.5 可算');
  // 甬金/上克 410S/BA 不受影响
  eq(PricingEngine.getThicknessSurcharge(0.5, false, '410S/BA', '甬金') !== null, true, '甬金 410S/BA 仍正常');
});

test('400系彩色表面对标304价（2026-08-21）', () => {
  const calc = (m, s, t) => PricingEngine.calculate({origin:'宏旺', material:m, surface:s, thickness:t, width:'1240', length:'2500', basePrice:8000, packing: '木架' });
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
  const r = PricingEngine.calculate({origin:'北港', material:'201J5', surface:'NO.4', thickness:'0.5', width:'1240', length:'2500', basePrice:8000, packing: '木架' });
  eq(r.success, false, '北港 J5 报错不计算');
  eq(r.errors.some(e => e.includes('北港 J5 未提供厚度加价')), true, '报错文案含北港 J5 提示');
  // 其他 201 材质不受影响
  const r2 = PricingEngine.calculate({origin:'青山', material:'201J2', surface:'2B', thickness:'0.5', width:'1240', length:'2500', basePrice:8000, packing: '木架' });
  eq(r2.success, true, '青山 201J2 正常计算');
  eq(r2.detail.thickSurcharge, 500, '201J2 厚度加价 500');
});



// ===== 平板销售加价细分（2026-08-22 用户规则，出口木架基准；仅 1219/1240 平板） =====
function sheetMarkupCase(label, material, width, length, expectMarkup, expectSuccess, origin, thickness) {
  const r = PricingEngine.calculate({origin: origin || '', material, surface: '2B', thickness: thickness || '0.50', width, length: String(length), film1: '', film2: '', basePrice: 7800, packing: '木架' });
  if (expectSuccess) {
    eq(r.success, true, label + ' 应成功: ' + JSON.stringify(r.errors));
    eq(r.detail.markup, expectMarkup, label + ' 加价应=' + expectMarkup + ' 实际=' + r.detail.markup);
  } else {
    eq(r.success, false, label + ' 应报错（长度区间外）: ' + JSON.stringify(r.errors));
  }
}
test('平板加价: std 1240 2100-2500 = 300', () => sheetMarkupCase('std1240s', '201J2', 1240, 2440, 300, true));
test('平板加价: std 1240 3000-4000 = 350', () => sheetMarkupCase('std1240l', '201J2', 1240, 3000, 350, true));
test('平板加价: std 1219 2100-2500 = 400', () => sheetMarkupCase('std1219s', '201J2', 1219, 2500, 400, true));
test('平板加价: std 1219 3000-4000 = 450', () => sheetMarkupCase('std1219l', '304', 1219, 4000, 450, true));
test('平板加价: 430B/2BA 1240 2440 = 300（410/430 归 std 组）', () => sheetMarkupCase('std430', '430B/2BA', 1240, 2440, 300, true, '瑞钢'));
test('平板加价: 316L 1240 2100-2500 = 500', () => sheetMarkupCase('316l1240s', '316L', 1240, 2440, 500, true, '张浦'));
test('平板加价: 316L 1240 3000-4000 = 550', () => sheetMarkupCase('316l1240l', '316L', 1240, 3050, 550, true, '张浦'));
test('平板加价: 316L 1219 2100-2500 = 700', () => sheetMarkupCase('316l1219s', '316L', 1219, 2440, 700, true, '张浦'));
test('平板加价: 316L 1219 3000-4000 = 750', () => sheetMarkupCase('316l1219l', '316L', 1219, 3500, 750, true, '张浦'));
test('平板加价: 长度区间外报错 1240*2800', () => sheetMarkupCase('l2800', '201J2', 1240, 2800, null, false));
test('平板加价: 长度区间外报错 1240*1800', () => sheetMarkupCase('l1800', '201J2', 1240, 1800, null, false));
test('平板加价: 长度区间外报错 1219*4500', () => sheetMarkupCase('l4500', '316L', 1219, 4500, null, false, '张浦'));
test('平板加价: 1000齐边 2001-4000 = 650（新细分，原旧价700）', () => sheetMarkupCase('w1000', '201J2', 1000, 2440, 650, true));
test('平板加价: 201 1250 不计算（2026-08-22 用户规则，201 无 1250mm 宽度）', () => {
  const r = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'1.00', width:'1250', length:'2440', film1:'', film2:'', basePrice: 7800, packing: '木架'});
  eq(r.success, false, '201 1250 平板应报错');
  eq(r.errors.join(',').includes('1250'), true, '错误含 1250 提示');
});
test('平板加价: 316L 1250 2100-2500 = 900（新细分，原旧价500）', () => sheetMarkupCase('w1250_316', '316L', 1250, 2440, 900, true, '张浦'));
test('平板加价: 卷板不受影响 1240*C = 200', () => sheetMarkupCase('coil1240', '201J2', 1240, 'C', 200, true));

// ===== 1030 毛边 / 1000 齐边 平板销售加价细分（2026-08-22 用户规则，出口木架基准）=====
test('平板加价: std 1030 1001-2000 = 500（1030毛边）', () => sheetMarkupCase('std1030s', '201J2', 1030, 2000, 500, true));
test('平板加价: std 1030 2001-4000 = 550（1030毛边）', () => sheetMarkupCase('std1030l', '201J2', 1030, 2100, 550, true));
test('平板加价: std 1000 1001-2000 = 600（1000齐边）', () => sheetMarkupCase('std1000s', '201J2', 1000, 1500, 600, true));
test('平板加价: std 1000 2001-4000 = 650（1000齐边）', () => sheetMarkupCase('std1000l', '201J2', 1000, 3500, 650, true));
test('平板加价: 316L 1030 1001-2000 = 700（1030毛边）', () => sheetMarkupCase('316l1030s', '316L', 1030, 1800, 700, true, '张浦'));
test('平板加价: 316L 1030 2001-4000 = 750（1030毛边）', () => sheetMarkupCase('316l1030l', '316L', 1030, 3000, 750, true, '张浦'));
test('平板加价: 316L 1000 1001-2000 = 900（1000齐边）', () => sheetMarkupCase('316l1000s', '316L', 1000, 1500, 900, true, '张浦'));
test('平板加价: 316L 1000 2001-4000 = 950（1000齐边）', () => sheetMarkupCase('316l1000l', '316L', 1000, 2500, 950, true, '张浦'));
test('平板加价: 1030 长度边界 2000=s / 2001=l', () => {
  const r1 = PricingEngine.calculate({origin:'', material:'201J2', surface:'2B', thickness:'0.50', width:'1030', length:'2000', film1:'', film2:'', basePrice: 7800, packing: '木架'});
  eq(r1.success, true, '2000 应成功: ' + JSON.stringify(r1.errors)); eq(r1.detail.markup, 500);
  const r2 = PricingEngine.calculate({origin:'', material:'201J2', surface:'2B', thickness:'0.50', width:'1030', length:'2001', film1:'', film2:'', basePrice: 7800, packing: '木架'});
  eq(r2.success, true); eq(r2.detail.markup, 550);
});
test('平板加价: 1000 长度边界 2000=s / 2001=l', () => {
  const r1 = PricingEngine.calculate({origin:'', material:'201J2', surface:'2B', thickness:'0.50', width:'1000', length:'2000', film1:'', film2:'', basePrice: 7800, packing: '木架'});
  eq(r1.success, true, '2000 应成功: ' + JSON.stringify(r1.errors)); eq(r1.detail.markup, 600);
  const r2 = PricingEngine.calculate({origin:'', material:'201J2', surface:'2B', thickness:'0.50', width:'1000', length:'2001', film1:'', film2:'', basePrice: 7800, packing: '木架'});
  eq(r2.success, true); eq(r2.detail.markup, 650);
});
test('平板加价: 1030 长度区间外报错 1030*1000', () => sheetMarkupCase('1030l1000', '201J2', 1030, 1000, null, false));
test('平板加价: 1000 长度区间外报错 1000*4500', () => sheetMarkupCase('1000l4500', '201J2', 1000, 4500, null, false));
test('平板加价: 1030 木箱 = 基准+50（1030*1500 std 木箱 = 550）', () => {
  const r = PricingEngine.calculate({origin:'', material:'201J2', surface:'2B', thickness:'0.50', width:'1030', length:'1500', film1:'', film2:'', basePrice: 7800, packing: '木箱'});
  eq(r.success, true, JSON.stringify(r.errors)); eq(r.detail.markup, 550);
});

// ===== 1250 齐边 / 1280 毛边 平板销售加价细分（2026-08-22 用户规则，出口木架基准；304 与 410/430 分开定价）=====
test('平板加价: 410/430 1280 2100-2500 = 400（1280毛边）', () => sheetMarkupCase('4104301280s', '430B/2BA', 1280, 2440, 400, true, '瑞钢'));
test('平板加价: 410/430 1280 3000-4000 = 450（1280毛边）', () => sheetMarkupCase('4104301280l', '430B/2BA', 1280, 3500, 450, true, '瑞钢'));
test('平板加价: 410/430 1250 2100-2500 = 600（1250齐边）', () => sheetMarkupCase('4104301250s', '430B/2BA', 1250, 2440, 600, true, '瑞钢'));
test('平板加价: 410/430 1250 3000-4000 = 650（1250齐边）', () => sheetMarkupCase('4104301250l', '410S/2BA', 1250, 3000, 650, true, '宏旺'));
test('平板加价: 304 1280 2100-2500 = 600（1280毛边）', () => sheetMarkupCase('3041280s', '304', 1280, 2440, 600, true, '德龙'));
test('平板加价: 304 1280 3000-4000 = 650（1280毛边）', () => sheetMarkupCase('3041280l', '304', 1280, 3500, 650, true, '德龙'));
test('平板加价: 304 1250 2100-2500 = 800（1250齐边）', () => sheetMarkupCase('3041250s', '304', 1250, 2440, 800, true, '德龙'));
test('平板加价: 304 1250 3000-4000 = 850（1250齐边）', () => sheetMarkupCase('3041250l', '304', 1250, 3500, 850, true, '德龙'));
test('平板加价: 316L 1280 2100-2500 = 700（1280毛边）', () => sheetMarkupCase('316l1280s', '316L', 1280, 2440, 700, true, '张浦'));
test('平板加价: 316L 1280 3000-4000 = 750（1280毛边）', () => sheetMarkupCase('316l1280l', '316L', 1280, 3500, 750, true, '张浦'));
test('平板加价: 316L 1250 3000-4000 = 950（1250齐边）', () => sheetMarkupCase('316l1250l', '316L', 1250, 3500, 950, true, '张浦'));
test('平板加价: 201 1250 卷板也报错 + 304 1250 照常（对照）', () => {
  const r1 = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'1.00', width:'1250', length:'C', film1:'', film2:'', basePrice: 7800});
  eq(r1.success, false, '201 1250 卷板应报错');
  const r2 = PricingEngine.calculate({material:'304', surface:'2B', thickness:'0.50', width:'1250', length:'2440', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r2.success, true, '304 1250 仍可算: ' + JSON.stringify(r2.errors)); eq(r2.detail.markup, 800);
});
test('平板加价: 1280 长度边界 2500=s / 3000=l（304）', () => {
  const r1 = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'0.50', width:'1280', length:'2500', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r1.success, true, '2500 应成功: ' + JSON.stringify(r1.errors)); eq(r1.detail.markup, 600);
  const r2 = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'0.50', width:'1280', length:'3000', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r2.success, true); eq(r2.detail.markup, 650);
});
test('平板加价: 1250 长度区间外报错 1250*2800（304）', () => sheetMarkupCase('3041250bad', '304', 1250, 2800, null, false, '德龙'));
test('平板加价: 1280 长度区间外报错 1280*1800（430）', () => sheetMarkupCase('4301280bad', '430', 1280, 1800, null, false, '瑞钢'));
test('平板加价: 304 1280 木箱 = 650（600+50）', () => {
  const r = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'0.50', width:'1280', length:'2440', film1:'', film2:'', basePrice: 13000, packing: '木箱'});
  eq(r.success, true, JSON.stringify(r.errors)); eq(r.detail.markup, 650);
});

// ===== 1500 齐边 / 1530 毛边 平板销售加价细分（2026-08-22 用户规则，出口木架基准；201/304/410/430 合并 std 组，316L 独立）=====
// 长度区间：2100-3055 = s，3056-4000 = l（与 1219/1240/1250/1280 的 2100-2500/3000-4000 不同）
test('平板加价: std 1530 2100-3055 = 400（1530毛边）', () => sheetMarkupCase('std1530s', '201J2', 1530, 2440, 400, true, '', '1.00'));
test('平板加价: std 1530 3056-4000 = 450（1530毛边）', () => sheetMarkupCase('std1530l', '304', 1530, 3500, 450, true, '德龙'));
test('平板加价: std 1500 2100-3055 = 500（1500齐边）', () => sheetMarkupCase('std1500s', '201J2', 1500, 2440, 500, true, '', '1.00'));
test('平板加价: std 1500 3056-4000 = 550（1500齐边）', () => sheetMarkupCase('std1500l', '304', 1500, 3500, 550, true, '德龙'));
test('平板加价: 316L 1530 2100-3055 = 600（1530毛边）', () => sheetMarkupCase('316l1530s', '316L', 1530, 2440, 600, true, '张浦'));
test('平板加价: 316L 1530 3056-4000 = 650（1530毛边）', () => sheetMarkupCase('316l1530l', '316L', 1530, 3500, 650, true, '张浦'));
test('平板加价: 316L 1500 2100-3055 = 800（1500齐边）', () => sheetMarkupCase('316l1500s', '316L', 1500, 2440, 800, true, '张浦'));
test('平板加价: 316L 1500 3056-4000 = 850（1500齐边）', () => sheetMarkupCase('316l1500l', '316L', 1500, 3500, 850, true, '张浦'));
test('平板加价: 1500/1530 边界 3055=s 3056=l（std 1530）', () => {
  const r1 = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'0.50', width:'1530', length:'3055', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r1.success, true, '3055 应成功: ' + JSON.stringify(r1.errors)); eq(r1.detail.markup, 400);
  const r2 = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'0.50', width:'1530', length:'3056', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r2.success, true, '3056 应成功: ' + JSON.stringify(r2.errors)); eq(r2.detail.markup, 450);
  const r3 = PricingEngine.calculate({origin:'张浦', material:'316L', surface:'2B', thickness:'0.50', width:'1500', length:'3055', film1:'', film2:'', basePrice: 15000, packing: '木架'});
  eq(r3.success, true, '1500 3055 应成功'); eq(r3.detail.markup, 800);
  const r4 = PricingEngine.calculate({origin:'张浦', material:'316L', surface:'2B', thickness:'0.50', width:'1500', length:'3056', film1:'', film2:'', basePrice: 15000, packing: '木架'});
  eq(r4.success, true, '1500 3056 应成功'); eq(r4.detail.markup, 850);
});
test('平板加价: 1500/1530 长度区间外报错 1530*2000 / 1500*4100', () => {
  const r1 = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'0.50', width:'1530', length:'2000', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r1.success, false, '1530*2000 应报错'); eq(r1.errors.length > 0, true);
  const r2 = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'0.50', width:'1500', length:'4100', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r2.success, false, '1500*4100 应报错'); eq(r2.errors.length > 0, true);
});
test('平板加价: 201 1530 走新细分价 400（std 组含 201）', () => sheetMarkupCase('std1530s_201', '201J2', 1530, 2440, 400, true, '', '1.00'));
test('平板加价: 316L 1530 木箱 = 650（600+50）', () => {
  const r = PricingEngine.calculate({origin:'张浦', material:'316L', surface:'2B', thickness:'0.50', width:'1530', length:'2440', film1:'', film2:'', basePrice: 15000, packing: '木箱'});
  eq(r.success, true, JSON.stringify(r.errors)); eq(r.detail.markup, 650);
});
test('平板加价: 1524 归类 1500 同价（2026-08-22 用户规则，齐边，2100-3055=500）', () => sheetMarkupCase('w1524_1500s', '201J2', 1524, 2440, 500, true, '', '1.00'));
test('平板加价: 316L 1524 归类 1500（2100-3055=800 / 3056-4000=850）', () => {
  const r1 = PricingEngine.calculate({origin:'张浦', material:'316L', surface:'2B', thickness:'1.00', width:'1524', length:'2440', film1:'', film2:'', basePrice: 15000, packing: '木架'});
  eq(r1.success, true, JSON.stringify(r1.errors)); eq(r1.detail.markup, 800);
  const r2 = PricingEngine.calculate({origin:'张浦', material:'316L', surface:'2B', thickness:'1.00', width:'1524', length:'3500', film1:'', film2:'', basePrice: 15000, packing: '木架'});
  eq(r2.success, true, JSON.stringify(r2.errors)); eq(r2.detail.markup, 850);
});
test('平板加价: 1524 长度区间外报错 1524*2000（区间 2100-3055/3056-4000）', () => sheetMarkupCase('w1524_bad', '304', 1524, 2000, null, false, '德龙', '1.00'));
test('平板加价: 1524 边界 3055=s 3056=l（std）', () => {
  const r1 = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'1.00', width:'1524', length:'3055', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r1.success, true, JSON.stringify(r1.errors)); eq(r1.detail.markup, 500);
  const r2 = PricingEngine.calculate({origin:'德龙', material:'304', surface:'2B', thickness:'1.00', width:'1524', length:'3056', film1:'', film2:'', basePrice: 13000, packing: '木架'});
  eq(r2.success, true, JSON.stringify(r2.errors)); eq(r2.detail.markup, 550);
});
test('平板加价: 201 1280 不计算（2026-08-22 用户规则，卷板/平板都报错）', () => {
  const r1 = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'1.00', width:'1280', length:'2440', film1:'', film2:'', basePrice: 7800, packing: '木架'});
  eq(r1.success, false, '201 1280 平板应报错'); eq(r1.errors.join(',').includes('1280'), true, '错误含 1280 提示: ' + JSON.stringify(r1.errors));
  const r2 = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'1.00', width:'1280', length:'C', film1:'', film2:'', basePrice: 7800});
  eq(r2.success, false, '201 1280 卷板应报错');
  const r3 = PricingEngine.calculate({material:'304', surface:'2B', thickness:'1.00', width:'1280', length:'2440', film1:'', film2:'', basePrice: 7800, packing: '木架'});
  eq(r3.success, true, '304 1280 仍可算: ' + JSON.stringify(r3.errors));
});


// ===== 包装方式（2026-08-22 用户规则：平板必填 木架/木箱，卷板不校验，木箱=木架+50） =====
test('包装: 平板未填包装方式 → 报错', () => {
  const r = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'0.50', width:'1240', length:'2440', film1:'', film2:'', basePrice: 7800});
  eq(r.success, false, '应报错: ' + JSON.stringify(r.errors));
  eq(r.errors.some(e => e.includes('包装方式')), true, '应提示填写包装方式');
});
test('包装: 平板木架 = 基准价（1219*2500 std = 400）', () => {
  const r = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'0.50', width:'1219', length:'2500', film1:'', film2:'', basePrice: 7800, packing:'木架'});
  eq(r.success, true); eq(r.detail.markup, 400); eq(r.detail.packing, '木架');
});
test('包装: 平板木箱 = 基准+50（1219*2500 std = 450）', () => {
  const r = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'0.50', width:'1219', length:'2500', film1:'', film2:'', basePrice: 7800, packing:'木箱'});
  eq(r.success, true); eq(r.detail.markup, 450);
});
test('包装: 316L 木箱 1240*2440 = 550（500+50）', () => {
  const r = PricingEngine.calculate({origin:'张浦', material:'316L', surface:'2B', thickness:'0.50', width:'1240', length:'2440', film1:'', film2:'', basePrice: 7800, packing:'木箱'});
  eq(r.success, true); eq(r.detail.markup, 550);
});
test('包装: 非1219/1240平板木箱 = 旧价+50（1250 现为 201 禁用宽度，改 1500 验证 500+50=550）', () => {
  const r = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'1.00', width:'1500', length:'2440', film1:'', film2:'', basePrice: 7800, packing:'木箱'});
  eq(r.success, true, JSON.stringify(r.errors)); eq(r.detail.markup, 550);
});
test('包装: 卷板未填包装正常计算（1240*C）', () => {
  const r = PricingEngine.calculate({material:'201J2', surface:'2B', thickness:'0.50', width:'1240', length:'C', film1:'', film2:'', basePrice: 7800});
  eq(r.success, true, JSON.stringify(r.errors)); eq(r.detail.markup, 200);
});
test('包装: 自由文本识别"木箱"', () => {
  const p = PricingEngine.parseFreeText('201J2 2B 0.50*1240*2440 木箱', {});
  eq(p.packing, '木箱', '应识别木箱');
});
test('包装: 自由文本识别"木架"', () => {
  const p = PricingEngine.parseFreeText('201J2 2B 0.50*1240*2440 木架', {});
  eq(p.packing, '木架', '应识别木架');
});

// ===== 计价公式 v1.0.67：不含税售价 = (基价+厚度加价)×0.92 + 表面加工费(含纹路/AFP) + 膜费 + 销售加价；含税售价 = 各项直接相加（2026-08-22 用户规则）=====
test('新公式: 8K卷板 表面费不打折 saleNoTax=8600', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'8K', thickness:'0.55', width:'1240', length:'C', film1:'', film2:'', basePrice: 8000});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.materialNoTaxRaw, 7820, '材料不含税 (8000+500)×0.92=7820 实际=' + r.detail.materialNoTaxRaw);
  eq(r.detail.saleNoTax, 8600, 'saleNoTax 应 8600 实际=' + r.detail.saleNoTax);
  eq(r.detail.saleTax, 9280, '含税售价不变 9080+200=9280 实际=' + r.detail.saleTax);
});
test('新公式: 8K+5C膜 平板 膜费不打折 saleNoTax=8930', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'8K', thickness:'0.55', width:'1240', length:'2440', film1:'5C-FILM', film2:'', basePrice: 8000, packing: '木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.saleNoTax, 8930, '7820+579.04+231.62+300=8930.66→8930 实际=' + r.detail.saleNoTax);
  eq(r.detail.saleTax, 9610, '含税售价 9310.66→9310+300=9610 实际=' + r.detail.saleTax);
});
test('新公式: 无表面膜时 saleNoTax=(材料×0.92)+加价 8120', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'2B', thickness:'0.55', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing: '木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.saleNoTax, 8120, '7820+300=8120 实际=' + r.detail.saleNoTax);
  eq(r.detail.saleTax, 8800, '8500+300=8800 实际=' + r.detail.saleTax);
});
test('新公式: 316L 1530 木架 saleNoTax=14950 saleTax=16200（含税不变）', () => {
  const r = PricingEngine.calculate({origin:'张浦', material:'316L', surface:'2B', thickness:'1.00', width:'1530', length:'2440', film1:'', film2:'', basePrice: 15100, packing: '木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.materialNoTaxRaw, 14352, '(15100+500)×0.92=14352 实际=' + r.detail.materialNoTaxRaw);
  eq(r.detail.saleNoTax, 14950, '14352+600=14952→14950 实际=' + r.detail.saleNoTax);
  eq(r.detail.saleTax, 16200, '15600+600=16200 实际=' + r.detail.saleTax);
});

// ===== 单张普磨8K（v1.0.69：2026-08-23 用户规则，按张加工；费用按厚度 5 档，区别于卷磨8K）=====
test('单张普磨8K: 0.55mm 3元/㎡', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单张普磨8K', thickness:'0.55', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 3, 'sqm 应 3 实际=' + r.detail.surfaceFeeSqm);
});
test('单张普磨8K: 1.30mm 5元/㎡', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单张普磨8K', thickness:'1.30', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 5, 'sqm 应 5 实际=' + r.detail.surfaceFeeSqm);
});
test('单张普磨8K: 1.70mm 7元/㎡', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单张普磨8K', thickness:'1.70', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 7, 'sqm 应 7 实际=' + r.detail.surfaceFeeSqm);
});
test('单张普磨8K: 2.30mm 9元/㎡', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单张普磨8K', thickness:'2.30', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 9, 'sqm 应 9 实际=' + r.detail.surfaceFeeSqm);
});
test('单张普磨8K: 2.80mm 11元/㎡（2026-08-23 调整）', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单张普磨8K', thickness:'2.80', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 11, 'sqm 应 11 实际=' + r.detail.surfaceFeeSqm);
});
test('单张普磨8K 别名: 单磨8K/普磨8K → 3元', () => {
  const r1 = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单磨8K', thickness:'0.55', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  const r2 = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'普磨8K', thickness:'0.55', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  eq(r1.success && r1.detail.surfaceFeeSqm === 3, true, '单磨8K sqm=' + r1.detail.surfaceFeeSqm);
  eq(r2.success && r2.detail.surfaceFeeSqm === 3, true, '普磨8K sqm=' + r2.detail.surfaceFeeSqm);
});
test('卷磨8K 区分: 0.55mm 仍 2.5元/㎡（别名 卷磨8K 同样）', () => {
  const r1 = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'8K', thickness:'0.55', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  const r2 = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'卷磨8K', thickness:'0.55', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  eq(r1.detail.surfaceFeeSqm, 2.5, '8K 卷磨 sqm 应 2.5 实际=' + r1.detail.surfaceFeeSqm);
  eq(r2.detail.surfaceFeeSqm, 2.5, '卷磨8K sqm 应 2.5 实际=' + r2.detail.surfaceFeeSqm);
});
test('单张普磨8K 宽板 1530: 316L 0.55mm 3元/㎡', () => {
  const r = PricingEngine.calculate({origin:'张浦', material:'316L', surface:'单张普磨8K', thickness:'0.55', width:'1530', length:'2440', film1:'', film2:'', basePrice: 15100, packing:'木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 3, '宽板 sqm 应 3 实际=' + r.detail.surfaceFeeSqm);
});

test('单张普磨8K 卷板: 自动按卷磨8K 计价 2.5元/㎡', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单张普磨8K', thickness:'0.55', width:'1240', length:'C', film1:'', film2:'', basePrice: 8000});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 2.5, '卷板应按卷磨8K 2.5 实际=' + r.detail.surfaceFeeSqm);
});
test('单张普磨8K 卷板 1.30mm: 按卷磨8K 4.5元/㎡', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单张普磨8K', thickness:'1.30', width:'1240', length:'C', film1:'', film2:'', basePrice: 8000});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 4.5, '卷板1.30应按卷磨8K 4.5 实际=' + r.detail.surfaceFeeSqm);
});
test('单张普磨8K 平板 2.80mm 仍 11元/㎡', () => {
  const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface:'单张普磨8K', thickness:'2.80', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
  eq(r.success, true, JSON.stringify(r.errors));
  eq(r.detail.surfaceFeeSqm, 11, '平板 2.80 应 11 实际=' + r.detail.surfaceFeeSqm);
});

// ===== 单张8K 系列其余 4 个品质（v1.0.71：2026-08-23 用户规则；按张加工，仅限平板，宽度 1219/1240/1250mm）=====
const SINGLE8K_TABLES = {
  '单张高普8K': [4, 6, 8, 10, 12],
  '单张普精8K': [7, 9, 11, 13, 15],
  '单张精磨8K': [10, 12, 14, 16, 18],
  '单张超精8K': [20, 22, 24, 26, 28]
};
Object.entries(SINGLE8K_TABLES).forEach(([surf, prices]) => {
  test(surf + ': 5档费用 ' + prices.join('/'), () => {
    const thks = ['0.55', '1.30', '1.70', '2.30', '2.80'];
    thks.forEach((th, i) => {
      const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface: surf, thickness: th, width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
      eq(r.success, true, JSON.stringify(r.errors));
      eq(r.detail.surfaceFeeSqm, prices[i], surf + ' ' + th + 'mm sqm 应 ' + prices[i] + ' 实际=' + r.detail.surfaceFeeSqm);
    });
  });
  test(surf + ': 别名识别', () => {
    const alias = { '单张高普8K': '高普8K', '单张普精8K': '普精8K', '单张精磨8K': '精磨8K', '单张超精8K': '超精8K' }[surf];
    const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface: alias, thickness:'0.55', width:'1240', length:'2440', film1:'', film2:'', basePrice: 8000, packing:'木架'});
    eq(r.success && r.detail.surfaceFeeSqm === prices[0], true, alias + ' sqm=' + (r.success ? r.detail.surfaceFeeSqm : 'ERR'));
  });
  test(surf + ': 卷板自动按卷磨8K(2.5)', () => {
    const r = PricingEngine.calculate({origin:'宏旺', material:'201J2', surface: surf, thickness:'0.55', width:'1240', length:'C', film1:'', film2:'', basePrice: 8000});
    eq(r.success && r.detail.surfaceFeeSqm === 2.5, true, '卷板 sqm=' + (r.success ? r.detail.surfaceFeeSqm : 'ERR'));
  });
  test(surf + ': 1500mm 超宽度报错', () => {
    const r = PricingEngine.calculate({origin:'张浦', material:'316L', surface: surf, thickness:'1.00', width:'1500', length:'2440', film1:'', film2:'', basePrice: 15100, packing:'木架'});
    eq(r.success, false, surf + ' 1500mm 应报错 实际 success=' + r.success);
  });
});

console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
process.exit(fail > 0 ? 1 : 0);
