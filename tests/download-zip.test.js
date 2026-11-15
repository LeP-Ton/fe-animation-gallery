const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('../vendor/jszip.min.js');

test('预览ZIP保留标准文件头、中文路径与二进制内容，CRC校验可通过', async () => {
  const content = Buffer.from([0x47, 0x49, 0x46, 0x00, 0x03, 0x04, 0xff, 0x80]);
  const zip = new JSZip();
  zip.file('动画/原始预览.gif', content);
  zip.file('来源与选择清单.json', JSON.stringify({ 备注: '中文路径与字节完整性验证' }));
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE', streamFiles: true });
  assert.deepEqual(bytes.subarray(0, 4), Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert.deepEqual(bytes.subarray(-22, -18), Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const restored = await JSZip.loadAsync(bytes, { checkCRC32: true });
  assert.deepEqual(await restored.file('动画/原始预览.gif').async('nodebuffer'), content);
  assert.equal(JSON.parse(await restored.file('来源与选择清单.json').async('string')).备注, '中文路径与字节完整性验证');
});
