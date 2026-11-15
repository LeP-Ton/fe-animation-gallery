/* 页面只读取本地素材；挑选和备注写入浏览器，不修改原始文件。 */
(function () {
  'use strict';
  const data = window.ANIMATION_CATALOG;
  const core = window.CatalogCore;
  const $ = id => document.getElementById(id);
  if (!data || !core) {
    $('result-count').textContent = '索引未能载入，请确认 catalog-data.js 与页面位于同一目录。';
    return;
  }
  const storageKey = 'fe-animation-gallery-picks-v1';
  const validVariantIds = new Set(data.units.flatMap(unit => unit.variants.map(variant => variant.id)));
  let favorites = {};
  let notes = {};
  let storageWarning = false;
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const [id, value] of Object.entries(stored.favorites || {})) {
      if (validVariantIds.has(id) && value && typeof value === 'object') favorites[id] = { note: String(value.note || '').slice(0, 500), savedAt: String(value.savedAt || '') };
    }
    for (const [id, value] of Object.entries(stored.notes || {})) if (validVariantIds.has(id)) notes[id] = String(value || '').slice(0, 500);
  } catch (_) { storageWarning = true; }

  const defaults = { category: 'all', sourceGroup: 'all', query: '', weapon: 'all', shield: 'all', appearance: 'all', gender: 'all', sort: 'name', includeRelated: true, pageSize: 24 };
  const state = { ...defaults, page: 1, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches };
  const preferredVariants = new Map();
  const categories = Object.fromEntries(data.categories.map(category => [category.id, category]));
  const symbols = { all: '▦', infantry: '⚔', cavalry: '♞', archer: '➶', magic: '◇', support: '✧', other: '◈' };
  let entries = [];
  let pageEntries = [];
  let detail = null;
  let toastTimer;
  let queryTimer;
  let noteTimer;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function showToast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600);
  }
  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ favorites, notes }));
    } catch (_) {
      storageWarning = true;
      $('storage-status').textContent = '当前无法持久保存，请导出挑选清单';
    }
  }
  function favoriteCount() { return Object.keys(favorites).length; }
  function updateFavoriteCounts() { $('favorite-count').textContent = favoriteCount().toLocaleString(); }
  function setFavorite(variant, noteValue) {
    if (favorites[variant.id]) delete favorites[variant.id];
    else favorites[variant.id] = { note: noteValue ?? notes[variant.id] ?? '', savedAt: new Date().toISOString() };
    persist();
    updateFavoriteCounts();
  }
  function addBadge(container, label, type) { container.append(element('span', 'badge' + (type ? ' ' + type : ''), label)); }
  function fillBadges(container, unit, variant) {
    container.replaceChildren();
    addBadge(container, unit.gender);
    if (unit.appearance !== '人类') addBadge(container, unit.appearance, unit.reviewState === 'pending' ? 'uncertain' : '');
    if (unit.mount && unit.mount !== '步战') addBadge(container, unit.mount);
    const type = variant.shield === 'verified_no' ? 'safe' : ['seen_shield', 'named_shield'].includes(variant.shield) ? 'warn' : '';
    addBadge(container, variant.shieldLabel, type);
    if (variant.kind !== 'humanoid') addBadge(container, variant.kindLabel, 'uncertain');
  }

  const observer = new IntersectionObserver(changes => {
    for (const change of changes) {
      const image = change.target;
      image.dataset.visible = change.isIntersecting ? 'true' : 'false';
      const next = state.playing && change.isIntersecting ? image.dataset.gif : image.dataset.poster;
      if (next && image.getAttribute('src') !== next) image.src = next;
    }
  }, { rootMargin: '90px 0px' });

  function makeCard(entry) {
    const unit = entry.unit;
    let variant = core.chooseVariant(entry, preferredVariants.get(unit.id));
    const card = element('article', 'asset-card');
    const top = element('div', 'card-top');
    const category = element('span', 'card-category');
    category.append(element('i', 'category-dot ' + unit.primary));
    category.append(document.createTextNode(categories[unit.primary]?.name || '待确认'));
    if (unit.subtype) category.append(document.createTextNode(' · ' + unit.subtype));
    const favorite = element('button', 'favorite-button', '☆');
    favorite.type = 'button';
    top.append(category, favorite);
    const preview = element('button', 'preview-button');
    preview.type = 'button';
    preview.setAttribute('aria-label', '放大预览 ' + unit.name);
    const image = element('img');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 248;
    image.height = 160;
    preview.append(image);
    const info = element('div', 'card-info');
    const title = element('h2', 'card-title', unit.name);
    title.title = unit.name;
    const subtitle = element('div', 'card-subtitle', unit.author || unit.sourceGroupLabel);
    subtitle.title = unit.sourceGroup;
    const badges = element('div', 'card-badges');
    const selectRow = element('div', 'card-select');
    const select = element('select');
    select.setAttribute('aria-label', unit.name + ' 的 GIF 版本');
    for (const candidate of entry.variants) {
      const option = element('option', '', candidate.label);
      option.value = candidate.id;
      select.append(option);
    }
    const count = element('span', 'variant-count', entry.variants.length + ' 个 GIF');
    const mapping = element('div', 'mapping-line');
    selectRow.append(select, count);
    info.append(title, subtitle, badges, selectRow, mapping);
    card.append(top, preview, info);

    function refresh() {
      select.value = variant.id;
      image.dataset.gif = variant.gifUrl;
      image.dataset.poster = variant.posterUrl;
      image.alt = unit.name + ' · ' + variant.label;
      image.src = state.playing && image.dataset.visible === 'true' ? variant.gifUrl : variant.posterUrl;
      const chosen = Boolean(favorites[variant.id]);
      favorite.classList.toggle('selected', chosen);
      favorite.textContent = chosen ? '★' : '☆';
      favorite.setAttribute('aria-pressed', String(chosen));
      favorite.setAttribute('aria-label', (chosen ? '取消挑选 ' : '挑选 ') + unit.name + ' · ' + variant.label);
      favorite.title = chosen ? '取消这个 GIF 的挑选' : '挑选这个 GIF';
      fillBadges(badges, unit, variant);
      const note = favorites[variant.id]?.note || notes[variant.id];
      mapping.textContent = note ? '我的备注：' + note : variant.characters.length ? '候选：' + variant.characters.join('、') : '尚未指定对应人物';
      mapping.title = mapping.textContent;
    }
    select.addEventListener('change', () => {
      variant = entry.variants.find(candidate => candidate.id === select.value);
      preferredVariants.set(unit.id, variant.id);
      refresh();
    });
    favorite.addEventListener('click', () => {
      setFavorite(variant);
      refresh();
      if (state.category === 'favorites') render();
    });
    preview.addEventListener('click', () => openDetail(entry, variant.id));
    image.addEventListener('error', () => {
      if (image.getAttribute('src') !== variant.posterUrl) image.src = variant.posterUrl;
      image.alt = unit.name + '：GIF未能载入，可在详情中打开原始文件。';
    });
    refresh();
    observer.observe(image);
    return card;
  }

  function selectCategory(category) {
    state.category = category;
    state.page = 1;
    render();
  }
  function buildNavigation() {
    const rows = [{ id: 'all', name: '全部资源' }, ...data.categories];
    for (const category of rows) {
      const button = element('button', 'nav-button');
      button.type = 'button';
      button.dataset.category = category.id;
      const count = category.id === 'all' ? data.counts.includedUnits : data.units.filter(unit => unit.reviewState !== 'pending' && unit.categories.includes(category.id)).length;
      button.append(element('span', 'nav-symbol', symbols[category.id]), element('span', '', category.name), element('span', 'nav-count', count.toLocaleString()));
      button.addEventListener('click', () => selectCategory(category.id));
      $('category-nav').append(button);
    }
    $('favorites-nav').addEventListener('click', () => selectCategory('favorites'));
    $('pending-nav').addEventListener('click', () => selectCategory('pending'));
    $('pending-count').textContent = data.counts.pendingUnits;
    updateFavoriteCounts();
  }
  function syncControls() {
    $('search').value = state.query;
    for (const [id, key] of [['source-filter', 'sourceGroup'], ['weapon-filter', 'weapon'], ['shield-filter', 'shield'], ['appearance-filter', 'appearance'], ['gender-filter', 'gender'], ['sort-filter', 'sort'], ['page-size', 'pageSize']]) $(id).value = state[key];
    $('include-related').checked = state.includeRelated;
  }
  function resetFilters() {
    // 重置搜索条件时保留当前兵种，收藏页仍保留在收藏页。
    const category = state.category;
    Object.assign(state, defaults, { category, page: 1 });
    syncControls();
    render();
  }
  function render() {
    observer.disconnect();
    entries = core.filterUnits(data.units, state, favorites);
    const pages = Math.max(1, Math.ceil(entries.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);
    const offset = (state.page - 1) * state.pageSize;
    pageEntries = entries.slice(offset, offset + state.pageSize);
    $('results').replaceChildren(...pageEntries.map(makeCard));
    $('empty-state').hidden = entries.length > 0;
    $('results').hidden = entries.length === 0;
    const gifs = entries.reduce((sum, entry) => sum + entry.variants.length, 0);
    $('result-count').textContent = entries.length.toLocaleString() + ' 套资源 · ' + gifs.toLocaleString() + ' 个 GIF';
    $('result-hint').textContent = state.category === 'favorites' ? '保留具体 GIF 版本，可在详情中补充人物备注' : state.category === 'pending' ? '外形或跨形态动作尚不明确，供你逐项辨识' : '一张卡片对应一套原始资源，可切换其 GIF 版本';
    const current = categories[state.category];
    $('page-title').textContent = current ? current.name + '动画，一套一套看。' : state.category === 'favorites' ? '留住你看中的动作。' : state.category === 'pending' ? '这些外形，留给你再确认。' : '从动作里，找到你的灵感。';
    $('page-description').textContent = current ? current.description : state.category === 'favorites' ? '挑选精确到 GIF 版本。导出清单后，可继续做人物映射或改绘。' : state.category === 'pending' ? '这里保留边界素材和跨形态版本，不作为已确认的人形或无盾结论。' : '浏览全库 GBA 火纹动画，收藏喜欢的版本，下载预览或原始资源包。';
    for (const button of document.querySelectorAll('[data-category]')) button.classList.toggle('active', button.dataset.category === state.category);
    $('favorites-nav').classList.toggle('active', state.category === 'favorites');
    $('pending-nav').classList.toggle('active', state.category === 'pending');
    $('page-summary').textContent = entries.length ? '显示 ' + (offset + 1) + '–' + Math.min(offset + state.pageSize, entries.length) + '，共 ' + entries.length.toLocaleString() + ' 套' : '当前没有符合条件的素材';
    $('page-label').textContent = state.page + ' / ' + pages;
    $('previous-page').disabled = state.page <= 1;
    $('next-page').disabled = state.page >= pages;
  }

  function openDetail(entry, id) {
    detail = { entry, variant: entry.variants.find(variant => variant.id === id) || entry.variants[0] };
    $('detail-title').textContent = entry.unit.name;
    $('detail-category').textContent = entry.unit.categories.map(category => categories[category]?.name).filter(Boolean).join(' / ');
    $('detail-subtitle').textContent = entry.unit.sourceGroupLabel + (entry.unit.author ? ' · ' + entry.unit.author : '');
    $('detail-variant').replaceChildren(...entry.variants.map(variant => {
      const option = element('option', '', variant.label);
      option.value = variant.id;
      return option;
    }));
    $('detail-reason').textContent = entry.unit.reason;
    refreshDetail();
    $('detail-dialog').showModal();
  }
  function refreshDetail() {
    if (!detail) return;
    const { entry, variant } = detail;
    $('detail-image').src = variant.gifUrl;
    $('detail-image').alt = entry.unit.name + ' · ' + variant.label;
    $('detail-variant').value = variant.id;
    fillBadges($('detail-badges'), entry.unit, variant);
    $('detail-mapping').textContent = variant.characters.length ? '此前候选映射：' + variant.characters.join('、') : '尚未指定对应人物，你可以在下面记录自己的选择。';
    $('role-note').value = favorites[variant.id]?.note || notes[variant.id] || '';
    $('detail-favorite').textContent = favorites[variant.id] ? '★ 已挑选 · 点击取消' : '☆ 加入我的挑选';
    $('detail-favorite').setAttribute('aria-pressed', String(Boolean(favorites[variant.id])));
    $('note-status').textContent = '';
    $('detail-source').textContent = variant.absolutePath;
    $('download-category').href = entry.unit.packageUrl;
    $('download-category').title = entry.unit.sourceGroup;
    $('original-gif').href = variant.gifUrl;
    $('source-credits').href = entry.unit.creditsUrl;
    $('source-credits').hidden = !entry.unit.creditsUrl;
    preferredVariants.set(entry.unit.id, variant.id);
  }
  function saveNote() {
    if (!detail) return;
    const variant = detail.variant;
    const value = $('role-note').value.trim().slice(0, 500);
    notes[variant.id] = value;
    if (favorites[variant.id]) favorites[variant.id].note = value;
    persist();
    $('note-status').textContent = storageWarning ? '已暂存，请导出保存' : '备注已保存';
  }
  $('detail-variant').addEventListener('change', () => {
    clearTimeout(noteTimer);
    saveNote();
    detail.variant = detail.entry.variants.find(variant => variant.id === $('detail-variant').value);
    refreshDetail();
  });
  $('role-note').addEventListener('input', () => {
    clearTimeout(noteTimer);
    $('note-status').textContent = '正在保存…';
    noteTimer = setTimeout(saveNote, 300);
  });
  $('detail-favorite').addEventListener('click', () => {
    clearTimeout(noteTimer);
    saveNote();
    setFavorite(detail.variant, $('role-note').value.trim());
    refreshDetail();
  });
  $('close-detail').addEventListener('click', () => $('detail-dialog').close());
  $('detail-dialog').addEventListener('close', () => {
    clearTimeout(noteTimer);
    saveNote();
    $('detail-image').removeAttribute('src');
    detail = null;
    render();
  });
  $('copy-source').addEventListener('click', async () => {
    if (!detail) return;
    const value = detail.variant.absolutePath;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const field = element('textarea');
        field.value = value;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        $('detail-dialog').append(field);
        field.select();
        const success = document.execCommand('copy');
        field.remove();
        if (!success) throw new Error('复制失败');
      }
      showToast('原始来源链接已复制');
    } catch (_) { showToast('未能自动复制，可选中下方路径手动复制'); }
  });
  function downloadJSON(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = element('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('export-selection').addEventListener('click', () => {
    const output = core.makeExport(data.units, favorites, new Date().toISOString());
    if (!output.挑选数量) { showToast('先点击卡片上的 ☆，挑选至少一个 GIF'); return; }
    downloadJSON(output, '人形动画挑选-' + new Date().toISOString().slice(0, 10) + '.json');
    showToast('已导出 ' + output.挑选数量 + ' 个 GIF 的挑选记录');
  });
  function buildMethodDialog() {
    const content = $('method-content');
    content.append(element('p', '', '普通人类、具有人形身体的异族和人形怪物分开标注。骑射可同时出现在弓兵与骑兵；骑马施法、骑马支援也有副分类，因此各分类数量可能重叠。'));
    const stats = element('div', 'method-stats');
    for (const [number, label] of [[data.counts.scannedUnits, '全库资源目录'], [data.counts.pendingUnits, '外形待确认'], [data.counts.excludedUnits, '其他素材 / 器械']]) {
      const cell = element('div');
      cell.append(element('strong', '', number.toLocaleString()), document.createTextNode(label));
      stats.append(cell);
    }
    content.append(stats);
    const list = element('ul');
    for (const text of ['普通兵种按来源职业归类；混杂目录与君主目录有逐资源关键帧复核，仍不等于全动作逐帧验收。', '纯动物、无骑手坐骑、车辆、器械等不归入人形分类，仍保留在全库的其他素材入口。', '变身与兽形附加版本默认收起；外形有歧义的保留在「外形待确认」中。', '只有此前具体核对过的版本标为「已核查无盾」。未核查、名称写着无盾或空手无盾，都不自动视为主将可用。', '收藏按具体 GIF 保存，不改原文件。备注与挑选保存在当前浏览器和当前地址下，换浏览器或地址前请先导出 JSON。']) list.append(element('li', '', text));
    content.append(list);
    content.append(element('p', '', '人形分类以外的素材（仍可从全库入口浏览）：'));
    const excluded = element('div', 'exclusion-list');
    for (const item of data.exclusions) {
      const row = element('div', 'exclusion-row');
      row.append(element('strong', '', item.name), element('span', '', item.reason));
      if (item.gifUrl) {
        const anchor = element('a', 'text-button', '查看原始 GIF ↗');
        anchor.href = item.gifUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        row.append(anchor);
      }
      excluded.append(row);
    }
    content.append(excluded);
    if (data.noPreview.length) {
      content.append(element('p', '', '以下 ' + data.noPreview.length + ' 套原件暂没有可展示的有效人形 GIF，保留记录供核对：'));
      const missing = element('div', 'exclusion-list');
      for (const item of data.noPreview) {
        const row = element('div', 'exclusion-row');
        row.append(element('strong', '', item.name), element('span', '', item.reason + ' 原目录：' + item.relativePath));
        missing.append(row);
      }
      content.append(missing);
    }
  }
  $('method-button').addEventListener('click', () => $('method-dialog').showModal());
  $('close-method').addEventListener('click', () => $('method-dialog').close());
  $('download-manifest').addEventListener('click', () => downloadJSON(data, '人形动画完整筛选清单.json'));
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });

  $('search').addEventListener('input', () => {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => { state.query = $('search').value; state.page = 1; render(); }, 160);
  });
  for (const [id, key] of [['source-filter', 'sourceGroup'], ['weapon-filter', 'weapon'], ['shield-filter', 'shield'], ['appearance-filter', 'appearance'], ['gender-filter', 'gender'], ['sort-filter', 'sort']]) $(id).addEventListener('change', () => { state[key] = $(id).value; state.page = 1; render(); });
  $('include-related').addEventListener('change', () => { state.includeRelated = $('include-related').checked; state.page = 1; render(); });
  $('page-size').addEventListener('change', () => { state.pageSize = Number($('page-size').value); state.page = 1; render(); });
  $('reset-filters').addEventListener('click', resetFilters);
  $('empty-reset').addEventListener('click', resetFilters);
  $('brand-home').addEventListener('click', event => { event.preventDefault(); Object.assign(state, defaults, { page: 1 }); syncControls(); render(); });
  for (const [id, delta] of [['previous-page', -1], ['next-page', 1]]) $(id).addEventListener('click', () => { state.page += delta; render(); window.scrollTo({ top: 190, behavior: 'auto' }); });
  $('play-toggle').addEventListener('click', () => {
    state.playing = !state.playing;
    $('play-toggle').textContent = state.playing ? 'Ⅱ 暂停动画' : '▶ 播放本页';
    $('play-toggle').setAttribute('aria-pressed', String(state.playing));
    for (const image of $('results').querySelectorAll('img')) image.src = state.playing && image.dataset.visible === 'true' ? image.dataset.gif : image.dataset.poster;
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); }
  });

  $('download-gif').addEventListener('click', () => {
    if (!detail) return;
    const anchor = document.createElement('a');
    anchor.href = detail.variant.gifUrl;
    anchor.download = (detail.entry.unit.name + '-' + detail.variant.version).replace(/[\\/:*?"<>|]/g, '-') + '.gif';
    anchor.click();
  });
  $('download-unit-previews').addEventListener('click', () => {
    if (!detail) return;
    GalleryDownloads.previewZip(detail.entry.unit.variants.map(variant => ({ unit: detail.entry.unit, variant, note: notes[variant.id] || '' })), '动画GIF预览包.zip', showToast);
  });
  $('download-picks').addEventListener('click', () => {
    const entries = data.units.flatMap(unit => unit.variants.filter(variant => favorites[variant.id]).map(variant => ({ unit, variant, note: favorites[variant.id].note })));
    GalleryDownloads.previewZip(entries, '挑选的动画GIF.zip', showToast);
  });
  for (const group of data.sourceGroups) {
    const option = element('option', '', group);
    option.value = group;
    $('source-filter').append(option);
  }
  $('total-units').textContent = data.counts.includedUnits.toLocaleString();
  $('total-gifs').textContent = data.counts.humanoidGifs.toLocaleString();
  $('data-date').textContent = '索引更新 ' + data.generatedAt.slice(0, 10);
  if (storageWarning) $('storage-status').textContent = '当前无法持久保存，请导出挑选清单';
  for (const weapon of data.weapons) {
    const option = element('option', '', weapon.name);
    option.value = weapon.id;
    $('weapon-filter').append(option);
  }
  buildNavigation();
  buildMethodDialog();
  syncControls();
  if (!state.playing) { $('play-toggle').textContent = '▶ 播放本页'; $('play-toggle').setAttribute('aria-pressed', 'false'); }
  render();
})();
