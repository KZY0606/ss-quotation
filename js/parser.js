/**
 * KK不锈钢报价系统 - Excel 解析与导出
 */
const ExcelParser = (() => {



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
        else if (h.includes('材质')) item.material = val;
        else if (h.includes('表面')) item.surface = val;
        else if (h.includes('厚度') || h.includes('thickness')) item.thickness = val;
        else if (h.includes('宽度') || h.includes('width')) item.width = val;
        else if (h.includes('长度') || h.includes('length')) item.length = val;
        else if (h.includes('规格') || h.includes('spec')) {
          const spec = PricingEngine.parseSpec(val);
          if (spec) { item.thickness = spec.thickness; item.width = spec.width; item.length = spec.length; }
        }
        else if (h.includes('膜1') || h === '保护膜' || h.includes('film1') || h.includes('膜一')) item.film1 = val;
        else if (h.includes('膜2') || h.includes('film2') || h.includes('膜二')) item.film2 = val;
        else if (h.includes('压延') || h.includes('yan') || h.includes('yanyan')) item.isYanYan = val === '是' || val === 'Y' || val === 'yes';
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

  function exportToExcel(results, filename) {
    const rows = [];
    // 给客户看的简洁表头
    rows.push(['产地', '材质', '表面', '规格', '膜', '价格']);

    for (const r of results) {
      if (!r.success) {
        rows.push([r.index, '', '', '', '', `错误: ${r.errors.join('; ')}`]);
        continue;
      }
      const d = r.detail;
      // 规格: 厚度*宽度*长度
      const spec = `${d.thickness}*${d.width}*${d.length}`;
      // 膜: 合并膜1+膜2
      const film = [d.film1, d.film2].filter(Boolean).join(' + ') || '-';
      // 价格 = 不含税售价（对外就叫"价格"）
      rows.push([
        d.origin || '',
        d.material || '',
        d.surface || '',
        spec,
        film,
        d.saleNoTax
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, // 产地
      { wch: 10 }, // 材质
      { wch: 16 }, // 表面
      { wch: 22 }, // 规格
      { wch: 24 }, // 膜
      { wch: 14 }  // 价格
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '报价单');

    // 隐藏工作表：保存完整明细，必要时可手动取消隐藏
    const detailRows = _buildDetailRows(results);
    if (detailRows.length > 0) {
      const ds = XLSX.utils.aoa_to_sheet(detailRows);
      XLSX.utils.book_append_sheet(wb, ds, '内部明细');
      wb.Sheets['内部明细'].hidden = true; // Excel 隐藏工作表
      // 列宽
      ds['!cols'] = [
        { wch: 5 },  { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 16 },
        { wch: 10 }, { wch: 10 }, { wch: 12 },
        { wch: 16 }, { wch: 16 }
      ];
    }

    XLSX.writeFile(wb, filename || 'KK报价.xlsx');
  }

  function _buildDetailRows(results) {
    const rows = [];
    rows.push([
      '序号', '产地', '材质', '表面', '厚度(mm)', '宽度(mm)', '长度',
      '保护膜1', '保护膜2', '基价(元/吨)',
      '厚度加价(元/吨)', '表面加工费(元/吨)', '小珠光(元/吨)', '抗指纹(元/吨)', '膜1费用(元/吨)', '膜2费用(元/吨)',
      '含税成本(元/吨)', '不含税成本(元/吨)',
      '毛边/齐边', '卷板/平板', '销售加价(元/吨)',
      '含税售价(元/吨)', '不含税售价(元/吨)'
    ]);
    for (const r of results) {
      if (!r.success) {
        rows.push([r.index, '', '', '', '', '', '', '', '', '', `错误: ${r.errors.join('; ')}`]);
        continue;
      }
      const d = r.detail;
      rows.push([
        r.index, d.origin || '', d.material || '', d.surface || '',
        d.thickness, d.width, d.length,
        d.film1 || '', d.film2 || '', d.basePrice,
        d.thickSurcharge, d.surfaceFeePerTon, d.linenFeePerTon, d.afpPerTon,
        d.film1PerTon, d.film2PerTon,
        d.costTax, d.costNoTax,
        d.edgeType === 'rough' ? '毛边' : '齐边',
        d.boardType === 'coil' ? '卷板' : '平板',
        d.markup,
        d.saleTax, d.saleNoTax
      ]);
    }
    return rows;
  }

  return { parseExcel, exportToExcel, parseContainerFormat };
})();
