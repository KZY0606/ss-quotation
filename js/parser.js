/**
 * Excel 解析器
 * 依赖: SheetJS (xlsx) CDN
 */
const ExcelParser = (() => {

  /**
   * 读取上传的 Excel 文件，返回解析后的数据行数组
   * 支持：
   * 1. 标准列格式（有表头）
   * 2. 自由文本格式（每行一条描述）
   */
  function parseExcel(file, basePrice) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

          if (jsonData.length === 0) {
            resolve([]);
            return;
          }

          // 检测是否有表头
          const firstRow = jsonData[0].map(c => String(c).trim().toLowerCase());
          const hasHeader = detectHeader(firstRow);

          let rows;
          if (hasHeader) {
            rows = jsonData.slice(1); // 跳过表头
          } else {
            rows = jsonData;
          }

          const results = [];
          for (const row of rows) {
            if (!row || row.every(c => String(c).trim() === '')) continue;

            const parsed = parseRow(row, hasHeader ? firstRow : null, basePrice);
            if (parsed) results.push(parsed);
          }

          resolve(results);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 检测第一行是否为表头
   */
  function detectHeader(firstRow) {
    const headerKeywords = ['产地', '材质', '表面', '厚度', '宽度', '长度', '保护膜', '规格', '膜', 'film', 'thickness', 'surface'];
    let matchCount = 0;
    for (const cell of firstRow) {
      for (const kw of headerKeywords) {
        if (cell.includes(kw)) { matchCount++; break; }
      }
    }
    return matchCount >= 2;
  }

  /**
   * 解析单行数据
   */
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

  /**
   * 导出计算结果为 Excel 文件
   */
  function exportToExcel(results, filename) {
    const rows = [];

    // 表头
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
        r.index, r.detail.origin || '', r.detail.material || '', r.detail.surface || '', r.detail.thickness, r.detail.width, r.detail.length,
        r.detail.film1 || '', r.detail.film2 || '', r.detail.basePrice,
        r.detail.thickSurcharge, r.detail.surfaceFeePerTon, r.detail.film1PerTon, r.detail.film2PerTon,
        r.detail.costTax, r.detail.costNoTax,
        r.detail.edgeType === 'rough' ? '毛边' : '齐边',
        r.detail.boardType === 'coil' ? '卷板' : '平板',
        r.detail.markup,
        r.detail.saleTax, r.detail.saleNoTax
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 设置列宽
    ws['!cols'] = [
      { wch: 5 },  // 序号
      { wch: 10 }, // 产地
      { wch: 10 }, // 材质
      { wch: 20 }, // 表面
      { wch: 10 }, // 厚度
      { wch: 10 }, // 宽度
      { wch: 10 }, // 长度
      { wch: 16 }, // 膜1
      { wch: 16 }, // 膜2
      { wch: 12 }, // 基价
      { wch: 14 }, // 厚度加价
      { wch: 14 }, // 表面加工费
      { wch: 12 }, // 膜1费用
      { wch: 12 }, // 膜2费用
      { wch: 16 }, // 含税成本
      { wch: 16 }, // 不含税成本
      { wch: 10 }, // 边类型
      { wch: 10 }, // 板类型
      { wch: 12 }, // 销售加价
      { wch: 16 }, // 含税售价
      { wch: 16 }, // 不含税售价
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '报价结果');
    XLSX.writeFile(wb, filename || '报价结果.xlsx');
  }

  return { parseExcel, exportToExcel };
})();
