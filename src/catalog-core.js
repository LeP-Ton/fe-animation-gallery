/* 分类、筛选和挑选导出使用纯函数，页面与验证脚本共用同一套规则。 */
(function (scope) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const isRelated = variant => variant.kind !== 'humanoid';
  function variantMatches(variant, filters) {
    if (!filters.includeRelated && isRelated(variant)) return false;
    if (filters.weapon !== 'all' && variant.weapon !== filters.weapon) return false;
    if (filters.shield !== 'all' && variant.shield !== filters.shield) return false;
    return true;
  }
  function filterUnits(units, filters, favorites) {
    const terms = normalize(filters.query).split(' ').filter(Boolean);
    const result = [];
    for (const unit of units) {
      const pending = unit.reviewState === 'pending';
      if (filters.category === 'pending' ? !pending : !['all', 'favorites', 'other'].includes(filters.category) && pending) continue;
      if (filters.sourceGroup && filters.sourceGroup !== 'all' && unit.sourceGroup !== filters.sourceGroup) continue;
      if (!['all', 'favorites', 'pending'].includes(filters.category) && !unit.categories.includes(filters.category)) continue;
      if (filters.appearance !== 'all' && unit.appearance !== filters.appearance) continue;
      if (filters.gender !== 'all' && unit.gender !== filters.gender) continue;
      // 待确认页本身就是人工辨识入口，不因附加版本开关而藏起候选。
      const variantFilters = pending || unit.primary === 'other' ? { ...filters, includeRelated: true } : filters;
      let variants = unit.variants.filter(v => variantMatches(v, variantFilters));
      if (filters.category === 'favorites') variants = variants.filter(v => Boolean(favorites[v.id]));
      if (!variants.length) continue;
      const noteText = unit.variants.map(v => favorites[v.id]?.note || '').join(' ');
      const searchable = normalize(unit.searchText + ' ' + noteText + ' ' + variants.map(v => v.label + ' ' + v.characters.join(' ')).join(' '));
      if (!terms.every(term => searchable.includes(term))) continue;
      result.push({ unit, variants });
    }
    if (filters.sort === 'variants') result.sort((a, b) => b.variants.length - a.variants.length || a.unit.name.localeCompare(b.unit.name));
    else if (filters.sort === 'reviewed') result.sort((a, b) => Number(b.variants.some(v => v.shield === 'verified_no')) - Number(a.variants.some(v => v.shield === 'verified_no')) || a.unit.name.localeCompare(b.unit.name));
    else result.sort((a, b) => a.unit.name.localeCompare(b.unit.name));
    return result;
  }
  function chooseVariant(entry, preferredId) {
    return entry.variants.find(v => v.id === preferredId) || entry.variants.find(v => v.id === entry.unit.defaultVariant) || entry.variants[0];
  }
  function makeExport(units, favorites, generatedAt) {
    const choices = [];
    for (const unit of units) for (const variant of unit.variants) {
      const favorite = favorites[variant.id];
      if (!favorite) continue;
      choices.push({ 素材名称: unit.name, 原始分类: unit.sourceGroup, 目录分类: unit.categories, 外形: unit.appearance, GIF版本: variant.label,
        原始GIF链接: variant.absolutePath, 原始GIF相对路径: variant.relativePath, 源资源目录: unit.absolutePath, 盾具核查: variant.shieldLabel, 已有候选人物: variant.characters,
        拟对应人物或备注: favorite.note || '', 挑选时间: favorite.savedAt || '' });
    }
    return { 说明: '浏览器挑选清单，不包含或改动原始GIF。未核查不等于无盾。', 导出时间: generatedAt, 挑选数量: choices.length, 挑选: choices };
  }
  const api = { normalize, variantMatches, filterUnits, chooseVariant, makeExport };
  scope.CatalogCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
