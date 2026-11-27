'use strict';
// 应用内「检查更新」：只查 GitHub Releases 的最新版本并提示，不自动下载/安装。
// 需要卸载时，把 API / PAGE 两个常量换掉即可（page 应是能下载安装包的页面）。
const https = require('https');

const API = 'https://api.github.com/repos/Vergilius-111/TDLVV/releases/latest';
const PAGE = 'https://github.com/Vergilius-111/TDLVV/releases/latest';

/** 把 "v0.6.9" / "0.6.9-beta" 之类的版本号拆成数字数组 */
function parseVer(v) {
  return String(v || '')
    .replace(/^v/i, '')
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
}

/** a > b 返回 1，a < b 返回 -1，相等返回 0 */
function cmpVer(a, b) {
  const x = parseVer(a);
  const y = parseVer(b);
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * 查询最新版本。永远 resolve，不抛异常，失败时返回 ok:false，调用方静默处理即可。
 * @param {string} current 当前应用版本 app.getVersion()
 */
function check(current) {
  const cur = String(current || '');
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    let req;
    try {
      req = https.get(
        API,
        {
          headers: {
            'User-Agent': 'TDLVV-Updater',
            'Accept': 'application/vnd.github+json'
          },
          timeout: 8000
        },
        (res) => {
          let buf = '';
          res.on('data', (c) => {
            buf += c;
            if (buf.length > 1024 * 1024) req.destroy(new Error('response too large'));
          });
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) return finish({ ok: false, error: 'HTTP ' + res.statusCode, url: PAGE, current: cur });
              const j = JSON.parse(buf);
              const latest = String((j && (j.tag_name || j.name)) || '').trim();
              if (!latest) return finish({ ok: false, error: 'empty release', url: PAGE, current: cur });
              finish({
                ok: true,
                current: cur,
                latest,
                available: cmpVer(latest, cur) > 0,
                url: String(j.html_url || PAGE),
                notes: String((j && j.body) || '').slice(0, 800)
              });
            } catch (e) {
              finish({ ok: false, error: String((e && e.message) || e), url: PAGE, current: cur });
            }
          });
        }
      );
    } catch (e) {
      return finish({ ok: false, error: String((e && e.message) || e), url: PAGE, current: cur });
    }
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => finish({ ok: false, error: String((e && e.message) || e), url: PAGE, current: cur }));
  });
}

module.exports = { check, cmpVer, parseVer, API, PAGE };
