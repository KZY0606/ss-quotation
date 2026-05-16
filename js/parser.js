/**
 * KK不锈钢报价系统 - Excel 解析与导出
 */
const ExcelParser = (() => {

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
          for (let i = 0; i < Math.min(3, rows.length); i++) {
            const rowText = rows[i].join(' ').toLowerCase();
            if (rowText.includes('材质') || rowText.includes('表面') || rowText.includes('厚度')) {
              headers = rows[i];
              headerRowIdx = i;
              break;
            }
          }

          if (headers) {
            // 有表头：从表头下一行开始解析
            for (let i = headerRowIdx + 1; i < rows.length; i++) {
              const item = parseRow(rows[i], headers, basePrice);
              if (item) {
                // 如果 row 里没有规格, 看是否有 厚度/宽度/长度 列
                if (!item.thickness) {
                  const thicknessIdx = headers.findIndex(h => h.includes('厚度'));
                  const widthIdx = headers.findIndex(h => h.includes('宽度'));
                  const lengthIdx = headers.findIndex(h => h.includes('长度'));
                  if (thicknessIdx >= 0 && rows[i][thicknessIdx]) item.thickness = String(rows[i][thicknessIdx]).trim();
                  if (widthIdx >= 0 && rows[i][widthIdx]) item.width = String(rows[i][widthIdx]).trim();
                  if (lengthIdx >= 0 && rows[i][lengthIdx]) item.length = String(rows[i][lengthIdx]).trim();
                }
                items.push(item);
              }
            }
          } else {
            // 无表头：每行作为自由文本解析
            for (const row of rows) {
              const text = row.join(' ').trim();
              if (!text) continue;
              const parsed = PricingEngine.parseFreeText(text, basePrice);
              if (typeof parsed === 'object') items.push(parsed);
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
    rows.push(['产地', '材质', '规格', '膜', '价格']);

    for (const r of results) {
      if (!r.success) {
        rows.push([r.index, '', '', '', `错误: ${r.errors.join('; ')}`]);
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
        spec,
        film,
        d.saleNoTax
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, // 产地
      { wch: 10 }, // 材质
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
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
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
      '厚度加价(元/吨)', '表面加工费(元/吨)', '膜1费用(元/吨)', '膜2费用(元/吨)',
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
        d.thickSurcharge, d.surfaceFeePerTon, d.film1PerTon, d.film2PerTon,
        d.costTax, d.costNoTax,
        d.edgeType === 'rough' ? '毛边' : '齐边',
        d.boardType === 'coil' ? '卷板' : '平板',
        d.markup,
        d.saleTax, d.saleNoTax
      ]);
    }
    return rows;
  }

  return { parseExcel, exportToExcel };
})();
