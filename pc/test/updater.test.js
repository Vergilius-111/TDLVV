'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const updater = require('../src/updater');

let pass = 0;
function ok(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log('ok - ' + name); })
    .catch((e) => { console.error('FAIL - ' + name + ': ' + (e && e.stack || e)); process.exitCode = 1; });
}

(async () => {
  await ok('parseVer 去掉 v 前缀并拆数字', () => {
    assert.deepStrictEqual(updater.parseVer('v0.6.9'), [0, 6, 9]);
    assert.deepStrictEqual(updater.parseVer('0.6.9-beta'), [0, 6, 9]);
  });

  await ok('cmpVer 正确比较大小', () => {
    assert.strictEqual(updater.cmpVer('0.6.9', '0.6.8'), 1);
    assert.strictEqual(updater.cmpVer('0.6.8', '0.6.9'), -1);
    assert.strictEqual(updater.cmpVer('0.6.8', '0.6.8'), 0);
    assert.strictEqual(updater.cmpVer('v1.0.0', '0.9.9'), 1);
    assert.strictEqual(updater.cmpVer('0.7', '0.6.9'), 1);
  });

  await ok('shortNotes 只取本次版本要点，跳过安装包表格和旧版本', () => {
    const body = [
      '### 本次安装包',
      '| 平台 | 文件 |',
      '| --- | --- |',
      '',
      '### v0.6.10',
      '- 修复同名团队重复显示',
      '- 加快重连',
      '',
      '### v0.6.9',
      '- 旧版本说明不该出现'
    ].join('\n');
    const notes = updater.shortNotes(body, 'v0.6.10');
    assert.deepStrictEqual(notes, ['修复同名团队重复显示', '加快重连']);
  });

  await ok('pickAsset 按平台选安装包', () => {
    const release = {
      assets: [
        { name: 'TDLVV-Setup-v0.6.10.exe', browser_download_url: 'https://x/a.exe', size: 1 },
        { name: 'TDLVV-mac-universal-v0.6.10.zip', browser_download_url: 'https://x/b.zip', size: 2 }
      ]
    };
    assert.strictEqual(updater.pickAsset(release, 'win32', 'x64').name, 'TDLVV-Setup-v0.6.10.exe');
    assert.strictEqual(updater.pickAsset(release, 'darwin', 'arm64').name, 'TDLVV-mac-universal-v0.6.10.zip');
  });

  await ok('startDownload 跟随跳转并写出完整文件', async () => {
    const payload = Buffer.from('tdlvv-update-bytes');
    const srv = http.createServer((req, res) => {
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/file' });
        return res.end();
      }
      res.writeHead(200, { 'Content-Length': payload.length, 'Content-Type': 'application/octet-stream' });
      res.end(payload);
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + srv.address().port;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdlvv-update-'));
    const dest = path.join(dir, 'setup.exe');
    const progress = [];
    const task = updater.startDownload({
      url: base + '/redirect',
      dest,
      onProgress: (p) => progress.push(p.percent)
    });
    const r = await task.promise;
    await new Promise((resolve) => srv.close(resolve));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'tdlvv-update-bytes');
    assert.ok(progress.length > 0);
    assert.strictEqual(progress[progress.length - 1], 100);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log('\n' + pass + ' passed');
})();
