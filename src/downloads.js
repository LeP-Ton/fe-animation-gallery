/* 预览包在访客浏览器生成；原始工程包通过公开Release下载。 */
(function () {
  'use strict';
  const data = window.ANIMATION_CATALOG;
  const $ = id => document.getElementById(id);
  const size = bytes => bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + ' GiB' : (bytes / 1024 ** 2).toFixed(1) + ' MiB';
  let busy = false;
  function save(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function previewZip(entries, filename, report) {
    if (busy) { report('已有预览包正在生成，请稍候。'); return; }
    if (!entries.length) { report('先选择至少一个 GIF。'); return; }
    const bytes = entries.reduce((sum, entry) => sum + entry.variant.byteSize, 0);
    if (bytes > 200 * 1024 ** 2) { report('所选 GIF 超过 200 MiB，请分批打包或直接下载原始分类包。'); return; }
    busy = true;
    const zip = new JSZip();
    const sources = [];
    const creditUnits = new Map();
    try {
      let done = 0;
      for (let offset = 0; offset < entries.length; offset += 4) {
        await Promise.all(entries.slice(offset, offset + 4).map(async ({ unit, variant, note }) => {
          const response = await fetch(variant.gifUrl);
          if (!response.ok) throw new Error('无法下载：' + variant.filename);
          zip.file(variant.relativePath, await response.arrayBuffer());
          creditUnits.set(unit.id, unit);
          sources.push({ 素材: unit.name, 版本: variant.version, 源路径: variant.relativePath, 来源: variant.absolutePath, 备注: note || '', SHA256: variant.sha256 });
          report('正在整理 GIF：' + (++done) + ' / ' + entries.length);
        }));
      }
      for (const unit of creditUnits.values()) {
        const response = await fetch(unit.creditsUrl);
        if (!response.ok) throw new Error('作者说明未能载入，请稍后重试。');
        zip.file(unit.relativePath + '/CREDITS.txt', await response.text());
      }
      zip.file('来源与选择清单.json', JSON.stringify({ 说明: '本包仅含GIF预览与作者说明；PNG、图集、BIN/DMP和脚本请下载原始分类包。素材权利与使用要求以原作者说明为准。', 来源仓库: data.upstreamUrl, GIF数量: entries.length, 素材: sources }, null, 2));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, meta => report('正在打包：' + Math.round(meta.percent) + '%'));
      save(blob, filename);
      report('预览包已下载：' + entries.length + ' 个 GIF');
    } catch (error) { report(error.message || '下载未完成，请稍后重试。'); }
    finally { busy = false; }
  }
  const full = data.packages.find(item => item.sourceGroup === null);
  $('download-complete').href = full.url;
  $('download-complete').textContent = '下载全库原始资源 · ' + size(full.byteSize);
  const list = $('package-list');
  for (const item of data.packages.filter(item => item.sourceGroup !== null)) {
    const anchor = document.createElement('a');
    anchor.href = item.url;
    anchor.className = 'package-link';
    const title = document.createElement('strong');
    title.textContent = item.sourceGroup;
    const info = document.createElement('small');
    info.textContent = size(item.byteSize) + ' · ' + item.fileCount.toLocaleString() + ' 个文件';
    anchor.append(title, info);
    list.append(anchor);
  }
  $('downloads-button').addEventListener('click', () => $('downloads-dialog').showModal());
  $('close-downloads').addEventListener('click', () => $('downloads-dialog').close());
  $('download-checksums').addEventListener('click', () => save(new Blob([JSON.stringify(data.packages, null, 2)], { type: 'application/json' }), '资源包SHA256校验清单.json'));
  window.GalleryDownloads = { previewZip };
})();
