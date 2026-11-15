const test = require('node:test');
const assert = require('node:assert/strict');
const { filterUnits, chooseVariant, makeExport } = require('../src/catalog-core.js');

// 骑弓的同一资源含无盾已核查版、待核查版和附带变身，防止筛选漏出未核查版本。
const variants = [
  { id: 'bow-safe', label: '弓', weapon: 'bow', kind: 'humanoid', shield: 'verified_no', characters: ['黄忠'], absolutePath: '/原库/弓.gif' },
  { id: 'sword-unknown', label: '剑', weapon: 'sword', kind: 'humanoid', shield: 'unknown', characters: [], absolutePath: '/原库/剑.gif' },
  { id: 'transform', label: '变身', weapon: 'transform', kind: 'transformation', shield: 'unknown', characters: [], absolutePath: '/原库/变身.gif' },
];
const unit = { id: 'rider', name: '弓骑原型', sourceGroup: '骑兵', categories: ['archer', 'cavalry'], appearance: '人类', reviewState: 'included', gender: '男', searchText: '弓骑 作者甲', defaultVariant: 'sword-unknown', variants, absolutePath: '/原库' };
const pending = { ...unit, id: 'pending', name: '待确认角色', reviewState: 'pending', variants: [{ ...variants[2], id: 'uncertain', kind: 'uncertain' }] };
const defaults = { category: 'all', sourceGroup: 'all', query: '', weapon: 'all', shield: 'all', appearance: 'all', gender: 'all', sort: 'name', includeRelated: false };

test('骑弓可以在弓兵和骑兵找到，但待确认不混入明确人形页', () => {
  for (const category of ['archer', 'cavalry']) {
    const result = filterUnits([unit, pending], { ...defaults, category }, {});
    assert.equal(result.length, 1);
    assert.equal(result[0].unit.id, 'rider');
    assert.equal(result[0].variants.length, 2);
  }
});

test('无盾筛选精确到GIF，不把同一资源其他版本当作已核查', () => {
  const result = filterUnits([unit], { ...defaults, shield: 'verified_no' }, {});
  assert.deepEqual(result[0].variants.map(v => v.id), ['bow-safe']);
  assert.equal(chooseVariant(result[0], 'sword-unknown').id, 'bow-safe');
});

test('变身默认收起，打开附加版本后才出现', () => {
  assert.equal(filterUnits([unit], defaults, {})[0].variants.length, 2);
  assert.equal(filterUnits([unit], { ...defaults, includeRelated: true }, {})[0].variants.length, 3);
});

test('外形待确认页能查看歧义版本，收藏后也能在我的挑选找到', () => {
  const favorites = { uncertain: { note: '留待核对', savedAt: '2026-11-15' } };
  assert.equal(filterUnits([pending], { ...defaults, category: 'pending' }, {})[0].variants[0].id, 'uncertain');
  assert.equal(filterUnits([pending], { ...defaults, category: 'favorites' }, favorites)[0].variants[0].id, 'uncertain');
});

test('搜索能匹配已有对应人物和用户保存的备注', () => {
  assert.equal(filterUnits([unit], { ...defaults, query: '黄忠 作者甲' }, {}).length, 1);
  assert.equal(filterUnits([unit], { ...defaults, query: '关羽改刀' }, { 'sword-unknown': { note: '关羽改刀' } }).length, 1);
});

test('导出保留同一角色的多个GIF与人物备注，不只导出一个资源名', () => {
  const output = makeExport([unit], { 'bow-safe': { note: '黄忠首选', savedAt: '今天' }, 'sword-unknown': { note: '近战备选', savedAt: '今天' } }, '导出时刻');
  assert.equal(output.挑选数量, 2);
  assert.deepEqual(output.挑选.map(v => v.原始GIF链接), ['/原库/弓.gif', '/原库/剑.gif']);
  assert.equal(output.挑选[1].拟对应人物或备注, '近战备选');
});

test('全库入口保留待确认与其他素材，五类人形仍不混入待确认', () => {
  const other = { ...unit, id: 'machine', name: '载具', primary: 'other', categories: ['other'], reviewState: 'other', appearance: '其他素材', variants: [{ ...variants[0], id: 'machine-gif', kind: 'nonhuman' }] };
  assert.equal(filterUnits([unit, pending, other], { ...defaults, includeRelated: true }, {}).length, 3);
  assert.equal(filterUnits([unit, pending, other], { ...defaults, category: 'archer' }, {}).length, 1);
});

test('原库分类筛选不会与人形副分类混淆', () => {
  const other = { ...unit, id: 'different', sourceGroup: '另一个原始分类' };
  const result = filterUnits([unit, other], { ...defaults, sourceGroup: '骑兵' }, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].unit.id, 'rider');
});
