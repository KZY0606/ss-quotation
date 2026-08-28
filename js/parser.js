/**
 * KK不锈钢报价系统 - Excel 解析与导出
 */
const ExcelParser = (() => {



  // 安全设置数字格式：exceljs 加载模板后相同样式的 cell 共享同一 style 对象，
  // 直接 cell.numFmt= 会污染所有同样式格（如 A 列序号全变 ¥/$）——深拷贝 style 再改
  function setNumFmt(cell, fmt) {
    if (!fmt || !cell) return;
    try {
      const s = JSON.parse(JSON.stringify(cell.style));
      s.numFmt = fmt;
      cell.style = s;
    } catch (e) { /* 忽略 */ }
  }

  // 集装箱格式解析：装货清单，每行两组数据
  function parseContainerFormat(rows) {
    const items = [];

    // 提取材质：""201 GRADE""
    let material = '201J2';
    for (const row of rows) {
      const t = String(row[1] || row[0] || '').toUpperCase();
      const m = t.match(/(\d{3})\s*GRADE/i);
      if (m) { material = m[1] + 'J2'; break; }
    }

    // 辅助: 提取厚度值
    function stripThk(v) {
      const s = String(v || '').trim().replace(/\s*MM\s*/i, '').trim();
      return s;
    }

    // 辅助: 从容器标题提取规格
    function extractSpec(cell) {
      const s = String(cell || '');
      const m = s.match(/(\d+)\s*X\s*(\d+)/i);
      return m ? { width: m[1], length: m[2] } : null;
    }

    // 辅助: 读取一组数据并提取括号膜
    function parseGroup(row, thkIdx, surfIdx, wgtIdx, defW, defL) {
      const thkVal = stripThk(row[thkIdx]);
      if (!thkVal || isNaN(parseFloat(thkVal))) return null;
      let surfRaw = String(row[surfIdx] || '').trim();
      if (!surfRaw || surfRaw.toUpperCase() === 'TOTAL') return null;

      // 提取括号内的膜信息: "GOLD MIRROR(7C-FILM+5C-FILM)"
      let film1 = '', film2 = '';
      const parenMatch = surfRaw.match(/\(([^)]+)\)/);
      if (parenMatch) {
        const parts = parenMatch[1].split('+').map(s => s.trim());
        for (const p of parts) {
          const norm = PricingEngine.normalizeFilm(p);
          if (norm) {
            if (!film1) film1 = norm;
            else if (!film2 && norm !== film1) film2 = norm;
          }
        }
        surfRaw = surfRaw.replace(parenMatch[0], '').trim();
      }

      return {
        surface: surfRaw, thickness: thkVal,
        width: defW, length: defL,
        film1, film2
      };
    }

    // 首次遍历：收集所有容器标题中的规格
    const specs = {}; // colIdx -> {width, length}
    let hasContainer = false;
    for (const row of rows) {
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').toUpperCase();
        if (cell.includes('CONTAINER')) {
          hasContainer = true;
          const spec = extractSpec(cell);
          if (spec) specs[c] = spec;
        }
      }
    }

    if (!hasContainer) return null; // 不是集装箱格式

    // 默认规格
    const defaultSpec = { width: '1240', length: '2500' };

    // 第二遍：解析数据行
    // 左组: col 1(thk), 2(surf), 3(wgt); 右组: col 6(thk), 7(surf), 8(wgt)
    for (const row of rows) {
      // 跳过空行和标题行
      const rowText = row.map(c => String(c || '')).join(' ').toUpperCase();
      if (rowText.includes('CONTAINER') || rowText.includes('GRADE') || rowText.trim() === '') continue;

      // 左组
      const s1 = specs[1] || specs[0] || defaultSpec;
      const left = parseGroup(row, 1, 2, 3, s1.width, s1.length);
      if (left) {
        items.push({ origin: '宏旺', material, surface: left.surface,
          thickness: left.thickness, width: left.width, length: left.length,
          film1: left.film1 || '', film2: left.film2 || '', isYanYan: false, basePrice: 0 });
      }

      // 右组
      const s2 = specs[6] || specs[7] || defaultSpec;
      const right = parseGroup(row, 6, 7, 8, s2.width, s2.length);
      if (right) {
        items.push({ origin: '宏旺', material, surface: right.surface,
          thickness: right.thickness, width: right.width, length: right.length,
          film1: right.film1 || '', film2: right.film2 || '', isYanYan: false, basePrice: 0 });
      }
    }

    return items;
  }

  function parseExcel(file, basePrice) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).filter(r => r.some(c => c !== ''));

          const items = [];
          let headers = null;
          let headerRowIdx = -1;

          // 检测表头行
          for (let i = 0; i < Math.min(5, rows.length); i++) {
            const rowText = rows[i].join(' ').toLowerCase();
            if (rowText.includes('材质') || rowText.includes('表面') || rowText.includes('厚度')) {
              headers = rows[i];
              headerRowIdx = i;
              break;
            }
            // 检测英文表头: THICKNESS / MATERIAL / PVC
            if (rowText.includes('thickness') && rowText.includes('material')) {
              headers = rows[i];
              headerRowIdx = i;
              break;
            }
          }

          if (headers) {
            // 判断是否英文表头格式
            const hText = headers.join(' ').toLowerCase();
            const isEnglish = hText.includes('thickness');

            if (isEnglish) {
              // 英文表头格式：THICKNESS | MATERIAL J2 1240 x 2500 | WEIGHT | QTY | PVC
              // 从 MATERIAL 表头单元格提取材质和规格
              const matHeader = String(headers[1] || '').trim(); // B1
              const materialMatch = matHeader.match(/(J\d+)\s+(\d+)\s*x\s*(\d+)/i);
              const defaultMaterial = materialMatch ? '201' + materialMatch[1].toUpperCase() : '201J2';
              const defaultWidth = materialMatch ? materialMatch[2] : '1240';
              const defaultLength = materialMatch ? materialMatch[3] : '2500';

              for (let i = headerRowIdx + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0] && !row[1]) continue; // 跳过空行
                const thkRaw = String(row[0] || '').trim().replace(/\s*mm\s*/i, '');
                const surfRaw = String(row[1] || '').trim();
                const filmRaw = String(row[4] || '').trim();
                if (!thkRaw || !surfRaw) continue;
                // 跳过分类标题行（没有厚度数字的纯文本行）
                if (isNaN(parseFloat(thkRaw))) continue;

                // 标准化表面名（仅用于计算，原文保留）
                const normSurface = PricingEngine.normalizeSurface(surfRaw);
                const film = PricingEngine.normalizeFilm(filmRaw);

                items.push({
                  origin: '宏旺',
                  material: defaultMaterial,
                  surface: surfRaw, // 保持原始英文
                  thickness: thkRaw,
                  width: defaultWidth,
                  length: defaultLength,
                  film1: film || '',
                  film2: '',
                  isYanYan: false,
                  basePrice: 0
                });
              }
            } else {
              // 有表头：从表头下一行开始解析
              for (let i = headerRowIdx + 1; i < rows.length; i++) {
                const item = parseRow(rows[i], headers, basePrice);
                if (item) {
                  // 如果 row 里没有规格, 看是否有 厚度/宽度/长度 列，或组合"规格"列
                  if (!item.thickness) {
                    // 优先检查组合"规格"列：如 "0.24*1000*2000" → 厚度*宽度*长度
                    const specIdx = headers.findIndex(h => /规格|spec/i.test(h));
                    if (specIdx >= 0 && rows[i][specIdx]) {
                      const specStr = String(rows[i][specIdx]).replace(/×/g, '*').replace(/x/gi, '*').trim();
                      const parts = specStr.split('*').map(p => p.trim());
                      if (parts.length >= 3) {
                        item.thickness = parts[0];
                        item.width = parts[1];
                        item.length = parts.slice(2).join('*');
                      }
                    }
                    // 无组合规格列则尝试单独列
                    if (!item.thickness) {
                      const thicknessIdx = headers.findIndex(h => /厚度|thickness/i.test(h));
                      const widthIdx = headers.findIndex(h => /宽度|width/i.test(h));
                      const lengthIdx = headers.findIndex(h => /长度|length/i.test(h));
                      if (thicknessIdx >= 0 && rows[i][thicknessIdx]) item.thickness = String(rows[i][thicknessIdx]).trim();
                      if (widthIdx >= 0 && rows[i][widthIdx]) item.width = String(rows[i][widthIdx]).trim();
                      if (lengthIdx >= 0 && rows[i][lengthIdx]) item.length = String(rows[i][lengthIdx]).trim();
                    }
                  }
                  items.push(item);
                }
              }
            }
          } else {
            // 尝试集装箱格式解析
            const containerItems = parseContainerFormat(rows);
            if (containerItems && containerItems.length > 0) {
              items.push.apply(items, containerItems);
            } else {
              // 无表头且非集装箱：每行作为自由文本解析
              // 先用 join 空格，再用 enhanced parseFreeText
              for (const row of rows) {
                const text = row.join(' ').trim();
                if (!text) continue;
                const parsed = PricingEngine.parseFreeText(text, basePrice);
                if (typeof parsed === 'object') items.push(parsed);
              }
            }
          }

          resolve(items);
        } catch (err) {
          console.error('Excel parse error:', err);
          resolve([]);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function parseRow(row, headers, basePrice) {
    if (headers) {
      const item = { basePrice };
      for (let i = 0; i < headers.length; i++) {
        const val = String(row[i] || '').trim();
        const h = headers[i];

        if (h.includes('产地') || h.includes('origin')) item.origin = val;
        else if (h.includes('序号') || h === '#' || h.toLowerCase() === 'no' || h.toLowerCase() === 'no.') item.seq = val;
        // v1.0.137：模板列头「钢种」（兼容旧「材质」）
        else if (h.includes('钢种') || h.includes('材质') || h.includes('material') || h.includes('grade')) item.material = val;
        else if (h.includes('表面')) item.surface = val;
        else if (h.includes('厚度') || h.includes('thickness')) item.thickness = val;
        else if (h.includes('宽度') || h.includes('width')) item.width = val;
        else if (h.includes('长度') || h.includes('length')) item.length = val;
        else if (h.includes('规格') || h.includes('spec')) {
          const spec = PricingEngine.parseSpec(val);
          if (spec) { item.thickness = spec.thickness; item.width = spec.width; item.length = spec.length; }
        }
        else if (h.includes('膜1') || h.includes('film1') || h.includes('膜一')) item.film1 = val;
        else if (h.includes('膜2') || h.includes('film2') || h.includes('膜二')) item.film2 = val;
        // v1.0.137：模板列头「保护膜/垫纸」统一一列（值可为组合膜如 10C-NOVACEL-LASER-FILM+7C-FILM，整串入 film1 由引擎组合计价）
        else if (h.includes('保护膜') || h.includes('垫纸') || h === '膜' || h.toLowerCase() === 'film') item.film1 = val;
        // v1.0.137：「件数」「标厚」列
        else if (h.includes('件数') || h.includes('数量') || h.includes('qty') || h.includes('quantity')) item.quantity = val;
        else if (h.includes('标厚')) item.stdThickness = val;
        else if (h.includes('重量') || h.includes('weight')) item.weight = val;
        else if (h.includes('包装费') || h.includes('packingFee') || h.includes('packing_fee')) item.packingFee = parseFloat(val) > 0 ? parseFloat(val) : 0;
        else if (h.includes('包装') || h.includes('packing')) { const pv = parseFloat(val); item.packing = (val && isNaN(pv)) ? val : ''; if (!isNaN(pv) && val !== '') item.packingFee = pv; }
        else if (h.includes('压延') || h.includes('yan') || h.includes('yanyan')) item.isYanYan = val === '是' || val === 'Y' || val === 'yes';
        // v1.0.136 检测要求列：写「全检」→ inspectFlag（runCalc 时注入全局全检单价），空/其他不勾
        else if (h.includes('检测') || h.includes('全检') || h.includes('inspect')) item.inspectFlag = val === '全检' || val === '是' || val === 'Y' || val === 'yes';
      }
      return item;
    }

    // 无表头：自由文本
    const text = row.join(' ').trim();
    if (!text) return null;
    const specRegex = /(\d+\.?\d*)\s*[*×xX]\s*(\d+\.?\d*)\s*[*×xX]\s*(\S+)/;
    if (specRegex.test(text)) {
      const parsed = PricingEngine.parseFreeText(text, basePrice);
      if (typeof parsed === 'object') return parsed;
    }
    const spec = PricingEngine.parseSpec(text);
    if (spec) return { ...spec, basePrice };
    return null;
  }

  // 厚度显示：范围原样保留，单值保留2位小数
  function fmtExportThk(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/\d\s*[-~—–]\s*\d/.test(s)) return s;
    const n = parseFloat(s);
    return isNaN(n) ? s : n.toFixed(2);
  }

  async function exportToExcel(results, filename, termInfo) {
    const ti = termInfo || { term: 'EXW', fobUsd: 0, cifUsd: 0, rate: 670.97, extras: null };
    // v1.0.130：表头前加标题行，标注贸易术语（EXW/FOB/CIF 价格）；术语同时保留在合计行(总价前一格)
    const termLabel = (ti.term === 'FOB' || ti.term === 'CIF') ? ti.term + ' 价格' : 'EXW 价格';
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('报价单');
    const titleRow = ws.addRow(['不锈钢报价单（' + termLabel + '）']);
    ws.mergeCells(titleRow.number, 1, titleRow.number, 20);
    titleRow.getCell(1).font = { bold: true, size: 14 };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.addRow(['NO.序号', 'PRODUCER制造商', 'GRADE钢种', 'SURFACE表面', 'FILM/PAPER保护膜/垫纸', 'THK厚度/MM', 'THK TOL厚度公差/MM', 'WIDTH宽度/MM', 'LENGH长度/MM', 'Edge边', 'PCS件数', 'MT重量(吨)', 'UNIT FOB单价(RMB)', 'UNIT FOB单价(USD)', 'TOTAL合计(RMB)', 'TOTAL合计(USD)', 'PACKING包装方式', 'PRINT喷码要求', 'INSPECTION检测要求', 'WEIGHT/PACK单包重']);
    ws.columns = [
      { width: 6 }, { width: 13 }, { width: 10 }, { width: 24 }, { width: 34 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 11 }, { width: 10 },
      { width: 8 }, { width: 10 }, { width: 11 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 11 }, { width: 11 }, { width: 13 }
    ];
    let totalCny = 0, totalUsd = 0, totalW = 0, hasWeight = false, hasSheetRows = false;

    for (const r of results) {
      if (!r.success) {
        ws.addRow([r.index, '', '', '', '', '', '', '', '', '', '', '', `错误: ${r.errors.join('; ')}`, '', '', '', '', '', '', '']);
        continue;
      }
      const d = r.detail;
      // 规格: 厚度*宽度*长度（厚度支持范围如 0.55-0.60，原样保留；单值保留2位小数）
      const spec = `${fmtExportThk(d.thickness)}*${d.width}*${d.length}`;
      // 保护膜: 合并膜1+膜2
      const film = [d.film1, d.film2].filter(Boolean).join(' + ') || '-';
      // 重量（吨）：来自导入的表格，无则不填
      const w = (d.weight != null && d.weight > 0) ? d.weight : null;
      // 边：毛边 Mill Edge / 齐边 Slit Edge（只用英文）
      const edge = d.edgeType === 'rough' ? 'Mill Edge' : 'Slit Edge';
      // 术语加价（FOB/CIF = EXW + 美元加价）+ 附加费用（人民币/吨）→ 不含税最终单价
      if (d && d.calcMode === 'sheet') {
        hasSheetRows = true;
        const usdV = PricingEngine.cnToUsd(d.sheetSaleNoTax != null ? d.sheetSaleNoTax : d.sheetPrice, ti.rate);
        const exPrice = d.sheetSaleNoTax != null ? d.sheetSaleNoTax : d.sheetPrice;
        totalCny += exPrice; totalUsd += (usdV || 0); totalW += 1; hasWeight = true;
        ws.addRow([
          r.index,
          d.origin || '',
          (d.material || '') + (d.isYanYan ? '压延' : ''),
          d.surface || '',
          film,
          d.stdThickness || '',
          fmtExportThk(d.thickness),
          d.width,
          d.length,
          edge,
          (d.quantity != null && d.quantity !== '') ? d.quantity : '',
          '',
          Math.round(exPrice),
          usdV == null ? '' : Math.round(usdV * 100) / 100,
          Math.round(exPrice),
          usdV == null ? '' : Math.round(usdV * 100) / 100,
          d.packingName || d.packing || '',
          '',
          d.inspectFlag ? '全检' : '',
          ''
        ]);
        continue;
      }
      const s = ti.term === 'FOB' ? (ti.fobUsd || 0) : (ti.term === 'CIF' ? (ti.cifUsd || 0) : 0);
      const tp = PricingEngine.addUsdSurcharge(d.saleNoTax, s, ti.rate);
      const base = tp ? tp.cny : d.saleNoTax;
      const ex = PricingEngine.addExtras(base, ti.extras || null);
      const cny = ex ? ex.cny : base;
      const usdV = PricingEngine.cnToUsd(cny, ti.rate);
      const amtCny = (w != null && usdV != null) ? cny * w : null;
      const amtUsd = (w != null && usdV != null) ? usdV * w : null;
      if (amtCny != null) { totalCny += cny * w; totalUsd += usdV * w; totalW += w; hasWeight = true; }
      ws.addRow([
        r.index,
        d.origin || '',
        (d.material || '') + (d.isYanYan ? '压延' : ''),
        d.surface || '',
        film,
        d.stdThickness || '',
        fmtExportThk(d.thickness),
        d.width,
        d.length,
        edge,
        (d.quantity != null && d.quantity !== '') ? d.quantity : '',
        w != null ? w : '',
        Math.round(cny),
        usdV == null ? '' : Math.round(usdV * 100) / 100,
        amtCny != null ? Math.round(amtCny) : '',
        amtUsd != null ? Math.round(amtUsd * 100) / 100 : '',
        d.packing || '',
        '',
        d.inspectFlag ? '全检' : '',
        ''
      ]);
    }
    // v1.0.141: 按用户最新模板去掉合计行（数据区后留空）

    // 样式：外边框+内框（加粗 medium）、数据居中、表头加粗
    const borderAll = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = borderAll;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
    });
    ws.getRow(1).eachCell((c) => { c.font = { bold: true }; });
    // 数字格式：人民币 ¥ 整数、美元 $ 两位小数（数据行+合计行）
    for (let R = 2; R <= ws.rowCount; R++) {
      const row = ws.getRow(R);
      [13, 15].forEach((C) => { const c = row.getCell(C); if (typeof c.value === 'number') setNumFmt(c, '#,##0'); });
      [14, 16].forEach((C) => { const c = row.getCell(C); if (typeof c.value === 'number') setNumFmt(c, '#,##0.00'); });
    }

    // 隐藏工作表：保存完整明细，必要时可手动取消隐藏
    const detailRows = _buildDetailRows(results, ti);
    if (detailRows.length > 0) {
      const ds = wb.addWorksheet('价格明细');
      detailRows.forEach(arr => ds.addRow(arr));
      const widths = [5, 10, 10, 20, 10, 10, 10, 16, 16, 12, 14, 14, 12, 12, 12, 16, 16, 10, 10, 12, 24, 16, 16, 14, 14, 12, 14, 16, 10, 14, 16];
      widths.forEach((w2, i) => { ds.getColumn(i + 1).width = w2; });
      ds.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = borderAll;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
      });
      ds.getRow(1).eachCell((c) => { c.font = { bold: true }; });
    }

    // 8. 打印设置 v1.0.143：横向 A4、所有列一页宽、窄边距（2026-08-28 用户：打印预览要像图三）
    ws.pageSetup.orientation = 'landscape';
    ws.pageSetup.paperSize = 9; // A4
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
    ws.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'KK报价.xlsx';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }


  // v1.0.141: 导出合同（基于用户合同模板 xlsx：单 sheet Sheet1，填入报价结果 + 合同信息）
  async function exportContract(results, filename, opts) {
    const ti = opts || { term: 'EXW', fobUsd: 0, cifUsd: 0, rate: 670.97, extras: null, contractNo: '', orderTrack: '', buyer: '', containers: 1, deposit: '', currency: 'RMB', sprayCode: '' };
    if (typeof KK_CONTRACT_TEMPLATE_B64 === 'undefined' || !KK_CONTRACT_TEMPLATE_B64) throw new Error('合同模板未加载');
    let bytes;
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      bytes = Buffer.from(KK_CONTRACT_TEMPLATE_B64, 'base64');
    } else {
      const bin = atob(KK_CONTRACT_TEMPLATE_B64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    const ws = wb.getWorksheet('Sheet1') || wb.getWorksheet(1);
    if (!ws) throw new Error('合同模板无 Sheet1');
    const isRmb = (ti.currency || 'RMB') === 'RMB';

    // 1. 合同号 / 订单跟踪号（模板红字保留）
    ws.getCell('P1').value = 'Contract number: ' + (ti.contractNo || '');
    ws.getCell('P2').value = 'Order track number: ' + (ti.orderTrack || 'Remarks, if any');
    // 2. 买方（保留红色提醒字体）
    ws.getCell('A4').value = '买方（Buyer）：' + (ti.buyer || '');
    const a4 = ws.getCell('A4');
    // 显式设置完整字体：宋体14粗红（模板原样），避免 Object.assign 兼容问题
    if (a4.font) a4.font = { name: '宋体', size: 14, bold: true, color: { argb: 'FFFF0000' } };
    // 3. 日期（当天）
    const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const now = new Date();
    const dateStr = now.getDate() + ' ' + MON[now.getMonth()] + ' ' + now.getFullYear();
    ws.getCell('P4').value = 'Date:' + dateStr;
    // 4. 表头币种（模板默认 USD；RMB 模式改表头）
    if (isRmb) {
      ws.getCell('L8').value = 'UNIT FOB \n单价 (RMB/T)';
      ws.getCell('M8').value = 'TOTAL\n合计(RMB)';
    }

    // 5. 数据行（18 列：A序号 B钢种 C表面 D衬纸/贴膜 E厚度 F公差 G宽 H长 I边部 J件数 K重量MT L单价 M合计 N喷码 O打包 P单包重）
    const okRows = results.filter(r => r.success).length;
    let extra = 0;
    if (okRows > 9) {
      extra = okRows - 9;
      // exceljs spliceRows 会丢失 18 行及以下的合并区——先记录、拆除，插行后按 extra 平移重建
      // 注意：ws._merges 键=主格地址（如 'A26'），值=Range 对象（.model={top,left,bottom,right}）
      const keepMerges = [];
      Object.keys(ws._merges || {}).forEach(addr => {
        const rng = ws._merges[addr];
        const m = rng && rng.model ? rng.model : rng;
        if (m && typeof m.top === 'number') keepMerges.push({ top: m.top, left: m.left, bottom: m.bottom, right: m.right });
      });
      keepMerges.forEach(m => {
        try { ws.unMergeCells(m.top, m.left, m.bottom, m.right); } catch (e) {}
      });
      ws.spliceRows(18, 0, ...new Array(extra).fill(null));
      // 重建：合并区按 extra 平移（只有 bottom>=18 的才需要平移；数据行区 9-17 无合并）
      keepMerges.forEach(m => {
        const top = m.top >= 18 ? m.top + extra : m.top;
        const bottom = m.bottom >= 18 ? m.bottom + extra : m.bottom;
        try { ws.mergeCells(top, m.left, bottom, m.right); } catch (e) {}
      });
      const src = ws.getRow(9);
      for (let rn = 18; rn <= 17 + extra; rn++) {
        const dst = ws.getRow(rn);
        dst.height = src.height;
        for (let c = 1; c <= 16; c++) {
          const sc = src.getCell(c), dc = dst.getCell(c);
          dc.style = JSON.parse(JSON.stringify(sc.style));
        }
      }
    }
    for (let rn = 9; rn <= 17 + extra; rn++) {
      const row = ws.getRow(rn);
      for (let c = 1; c <= 16; c++) row.getCell(c).value = null;
    }
    let rn = 9;
    for (const r of results) {
      const row = ws.getRow(rn);
      if (!r.success) {
        row.getCell(1).value = r.index;
        row.getCell(2).value = '错误: ' + r.errors.join('; ');
        rn++;
        continue;
      }
      const d = r.detail;
      const film = [d.film1, d.film2].filter(Boolean).join(' + ') || '-';
      const w = (d.weight != null && d.weight > 0) ? d.weight : null;
      const edge = d.edgeType === 'rough' ? '毛边' : '切边';
      // 单价：RMB = 不含税售价（元/吨）；USD = ÷汇率
      let cny;
      if (d.calcMode === 'sheet') {
        cny = d.sheetSaleNoTax != null ? d.sheetSaleNoTax : d.sheetPrice;
      } else {
        const s = ti.term === 'FOB' ? (ti.fobUsd || 0) : (ti.term === 'CIF' ? (ti.cifUsd || 0) : 0);
        const tp = PricingEngine.addUsdSurcharge(d.saleNoTax, s, ti.rate);
        const base = tp ? tp.cny : d.saleNoTax;
        const ex = PricingEngine.addExtras(base, ti.extras || null);
        cny = ex ? ex.cny : base;
      }
      const unit = isRmb ? Math.round(cny) : (cny != null ? Math.round(cny * 100 / ti.rate * 100) / 100 : null);
      row.getCell(1).value = r.index;                                   // A 序号
      row.getCell(2).value = [d.origin, d.material].filter(Boolean).join('') || ''; // B 钢种（产地+材质，如 甬金304）
      row.getCell(3).value = d.surface || '';                           // C 表面
      row.getCell(4).value = film;                                      // D 衬纸/贴膜
      row.getCell(5).value = d.stdThickness != null ? d.stdThickness : ''; // E 厚度
      row.getCell(6).value = fmtExportThk(d.thickness);                 // F 厚度公差
      row.getCell(7).value = d.width != null ? d.width : '';            // G 宽度
      row.getCell(8).value = d.length != null ? d.length : '';          // H 长度
      row.getCell(9).value = edge;                                      // I 边部
      row.getCell(10).value = (d.quantity != null && d.quantity !== '') ? d.quantity : ''; // J 件数
      row.getCell(11).value = w;                                        // K 重量 MT
      row.getCell(12).value = unit;                                     // L 单价
      row.getCell(13).value = { formula: 'K' + rn + '*L' + rn };        // M 合计（公式保留）
      row.getCell(14).value = (ti.sprayCode || '') ? '见附件' : '无';    // N 喷码
      row.getCell(15).value = d.calcMode === 'sheet' ? (d.packingName || d.packing || '') : (d.packing || ''); // O 打包要求
      row.getCell(16).value = null;                                     // P 单包重（留空）
      rn++;
    }
    // 6. 合计行公式（spliceRows 后重写，保持 SUM 公式）
    const lastData = 9 + okRows - 1;
    const weightRow = 18 + extra;
    ws.getCell('J' + weightRow).value = { formula: 'SUM(J9:J' + lastData + ')' };
    ws.getCell('K' + weightRow).value = { formula: 'SUM(K9:K' + lastData + ')' };
    ws.getCell('M' + weightRow).value = { formula: 'SUM(M9:M' + lastData + ')' };
    // 7. 集装箱数 + 定金
    const ctn = ti.containers || 1;
    const ctnRow = 19 + extra;
    ws.getCell('A' + ctnRow).value = 'Total ' + ctn + ' CONTAINERS / 共' + ctn + '柜';
    ws.getCell('J' + ctnRow).value = 'Advanced payment 定金：' + (ti.deposit || '');
    // 8. 贸易术语（备注行右侧，模板原为 FOB NANSHA/FOB南沙）
    const termRow = 20 + extra;
    const TERM_CN = { EXW: 'EXW工厂交货', FOB: 'FOB离岸价', CIF: 'CIF到岸价' };
    ws.getCell('J' + termRow).value = (ti.term || 'EXW') + '\n' + (TERM_CN[ti.term] || '');
    // 8.5 补充要求 S.R. 标题行标红（黑体18红，用户要求）
    {
      const srRow = 23 + extra;
      const sr = ws.getCell('A' + srRow);
      if (sr.font) sr.font = Object.assign({}, sr.font, { color: { argb: 'FFFF0000' } });
    }
    // 9. 数据行多时分页：合计行后分页——第一页=表头+数据+合计，第二页=Total+备注+条款+银行+签字（整块不被拆）
    // 注意：不能用 fitToPage（fit 模式下 WPS/Excel 忽略手动分页符，银行区会被自动分页切开）
    if (extra > 0) {
      const brkRow = 18 + extra + 1; // 合计行的下一行（Total 行）
      try {
        if (Array.isArray(ws.rowBreaks)) {
          ws.rowBreaks.push({ id: brkRow, man: 1, min: 0, max: 16383 });
        } else if (ws.rowBreaks && typeof ws.rowBreaks.add === 'function') {
          ws.rowBreaks.add({ id: brkRow, man: 1, min: 0, max: 16383 });
        }
      } catch (e) { /* 分页失败不影响导出 */ }
    }
    // 10. 数字格式
    for (let R = 9; R <= lastData; R++) {
      const row = ws.getRow(R);
      const c12 = row.getCell(12); if (typeof c12.value === 'number') setNumFmt(c12, isRmb ? '#,##0' : '#,##0.00');
      const c13 = row.getCell(13); if (c13.value && c13.value.formula) setNumFmt(c13, isRmb ? '#,##0' : '#,##0.00');
    }
    // 11. 打印设置：横向 A4、所有列一页宽、窄边距
    ws.pageSetup.orientation = 'landscape';
    ws.pageSetup.paperSize = 9;
    // 动态缩放：按第一页（表头+数据+合计）实际高度自适应，让数据完整展开
    // fitToPage 会让 WPS/Excel 忽略手动分页符（银行区会被自动分页切开），所以手动算 scale
    try {
      const PAGE_H = 540; // A4 横向可打印高度 pt（595 - 0.5*72 边距上下）
      let head = 0;
      for (let r = 1; r <= 8; r++) head += ws.getRow(r).height || 15; // 表头区 R1-R8
      const dataRows = 9 + extra;                       // 数据行数（含空行到合计前）
      const totalH = head + dataRows * 35 + 21 + 2;     // +合计行 21pt
      let sc = Math.floor((PAGE_H / totalH) * 100);
      sc = Math.max(40, Math.min(62, sc));              // 40%~62%（62% 列宽一页上限）
      ws.pageSetup.scale = sc;
    } catch (e) { ws.pageSetup.scale = 62; }
    ws.pageSetup.fitToPage = false;
    ws.page_setup = ws.pageSetup;
    ws.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'KK合同.xlsx';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }


  function _buildDetailRows(results, termInfo) {
    const ti = termInfo || { term: 'EXW', fobUsd: 0, cifUsd: 0, rate: 670.97, extras: null };
    // 不含税术语价（FOB/CIF = EXW + 美元加价），返回人民币
    const termCny = (saleNoTax, s) => {
      const tp = PricingEngine.addUsdSurcharge(saleNoTax, s, ti.rate);
      return tp ? Math.round(tp.cny) : saleNoTax;
    };
    const termUsd = (saleNoTax, s) => Math.round(termCny(saleNoTax, s) * 100 / ti.rate * 100) / 100;
    // 附加费用单行值（未勾选 → 0）
    const exVal = k => {
      const it = (ti.extras || {})[k];
      return (it && it.on && it.val > 0) ? it.val : 0;
    };
    const exTotal = () => exVal('opFee') + exVal('interest') + exVal('profit');
    const fmtCny = v => '¥' + Math.round(v).toLocaleString();
    const fmtUsd = v => '$' + (Math.round(v * 100) / 100).toLocaleString();
    const rows = [];
    rows.push([
      '序号', '产地', '材质', '表面', '厚度(mm)', '宽度(mm)', '长度',
      '保护膜1', '保护膜2', '基价(元/吨)',
      '厚度加价(元/吨)', '表面加工费(元/吨)', '小珠光(元/吨)', '抗指纹(元/吨)', '膜1费用(元/吨)', '膜2费用(元/吨)',
      '含税成本(元/吨)', '不含税成本(元/吨)',
      '毛边/齐边', '卷板/平板', '销售加价(元/吨)',
      'EXW售价(元/吨)', 'FOB售价(美元/吨)', 'CIF售价(美元/吨)',
      '运营费(元/吨)', '资金占用利息(元/吨)', '利润(元/吨)', '附加费合计(元/吨)',
      '售价(元/吨)',
      '重量(吨)', '金额(元)', '金额(美元)'
    ]);
    let sumCny = 0, sumUsd = 0, hasW = false;
    for (const r of results) {
      if (!r.success) {
        rows.push([r.index, '', '', '', '', '', '', '', '', '', `错误: ${r.errors.join('; ')}`]);
        continue;
      }
      const d = r.detail;
      // 最终不含税售价 = 术语价（FOB/CIF 加价后，基于不含税）+ 附加费
      const curS = ti.term === 'FOB' ? (ti.fobUsd || 0) : (ti.term === 'CIF' ? (ti.cifUsd || 0) : 0);
      const finalCny = termCny(d.saleNoTax, curS) + exTotal();
      const finalUsd = finalCny * 100 / ti.rate;
      const w = (d.weight != null && d.weight > 0) ? d.weight : null;
      const amtCny = w != null ? finalCny * w : null;
      const amtUsd = w != null ? finalUsd * w : null;
      if (w != null) { sumCny += finalCny * w; sumUsd += finalUsd * w; hasW = true; }
      rows.push([
        r.index, d.origin || '', d.material || '', d.surface || '',
        d.thickness, d.width, d.length,
        d.film1 || '', d.film2 || '', d.basePrice,
        d.thickSurcharge, d.surfaceFeePerTon, d.linenFeePerTon, d.afpPerTon,
        d.film1PerTon, d.film2PerTon,
        d.costTax, d.costNoTax,
        d.edgeType === 'rough' ? '毛边' : '齐边',
        d.boardType === 'coil' ? '卷板' : '平板',
        d.markupDetail ? (d.markupDetail.group === 'sheet'
          ? d.markup + '（边部' + d.markupDetail.edgeFee + '+' + (d.markupDetail.rackLabel || '木架') + d.markupDetail.rackFee + '+装柜' + d.markupDetail.packFee + '+损耗' + d.markupDetail.lossFee + '）'
          : d.markup + '（边部' + d.markupDetail.edgeFee + '+包装' + d.markupDetail.packingFee + '+装柜' + d.markupDetail.containerFee + '）') : d.markup,
        fmtCny(termCny(d.saleNoTax, 0)),
        fmtUsd(termUsd(d.saleNoTax, ti.fobUsd || 0)),
        fmtUsd(termUsd(d.saleNoTax, ti.cifUsd || 0)),
        exVal('opFee'), exVal('interest'), exVal('profit'), exTotal(),
        fmtCny(finalCny),
        w != null ? w : '', amtCny != null ? fmtCny(amtCny) : '', amtUsd != null ? fmtUsd(amtUsd) : ''
      ]);
    }
    // 合计行（有重量才加）
    if (hasW) {
      const tail = Array(29).fill('');
      tail.push('总价');
      tail.push(fmtCny(sumCny));
      tail.push(fmtUsd(sumUsd));
      rows.push(tail);
    }
    return rows;
  }

  return { parseExcel, exportToExcel, exportContract, parseContainerFormat, parseRow };
})();
