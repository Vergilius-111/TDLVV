'use strict';
// 应用内「检查更新」：查 GitHub Releases，直接在 App 内后台下载对应平台安装包。
// 需要卸载时，把 API / PAGE 两个常量换掉即可。
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

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

/** 只取本次版本的更新要点，忽略安装包表格和旧版本说明 */
function shortNotes(body, latest) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  const ver = String(latest || '').replace(/^v/i, '');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+/.test(lines[i]) && (!ver || lines[i].includes(ver))) { start = i + 1; break; }
  }
  if (start < 0) start = 0;
  const out = [];
  for (let i = start; i < lines.length && out.length < 8; i++) {
    const line = lines[i].trim();
    if (/^###\s+/.test(line)) break;
    if (!line || /^\|/.test(line) || /^本次安装包/.test(line)) continue;
    const m = line.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
    if (m) out.push(m[1].trim());
    else if (!out.length && !/^\*\*/.test(line)) out.push(line.replace(/\*\*/g, ''));
  }
  return out.slice(0, 6);
}

/** 按当前平台挑 Release 里最合适的安装包 */
function pickAsset(release, platform, arch) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  if (platform === 'win32') {
    return assets.find((a) => /setup/i.test(a.name || '') && /\.exe$/i.test(a.name || ''))
      || assets.find((a) => /\.exe$/i.test(a.name || '')) || null;
  }
  if (platform === 'darwin') {
    return assets.find((a) => /universal/i.test(a.name || '') && /\.zip$/i.test(a.name || ''))
      || assets.find((a) => /\.dmg$/i.test(a.name || ''))
      || assets.find((a) => /\.zip$/i.test(a.name || '')) || null;
  }
  return null;
}

function assetBrief(a) {
  if (!a) return null;
  return {
    name: String(a.name || '更新包'),
    size: Number(a.size) || 0,
    url: String(a.browser_download_url || ''),
    content_type: String(a.content_type || '')
  };
}

/**
 * 查询最新版本。永远 resolve，不抛异常，失败时返回 ok:false，调用方静默处理即可。
 * @param {string} current 当前应用版本 app.getVersion()
 * @param {string} platform process.platform
 * @param {string} arch process.arch
 */
function check(current, platform, arch) {
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
              const asset = assetBrief(pickAsset(j, platform, arch));
              finish({
                ok: true,
                current: cur,
                latest,
                available: cmpVer(latest, cur) > 0,
                url: String(j.html_url || PAGE),
                notes: shortNotes(j && j.body, latest),
                asset
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

function proxiedUrl(url, proxy) {
  const p = String(proxy || '').trim().replace(/\/+$/, '');
  return p ? p + '/' + String(url).replace(/^\/+/, '') : String(url);
}

/**
 * 后台下载安装包。支持 GitHub 302 跳转；proxy 是可选的下载加速前缀。
 * 返回 { promise, cancel() }，进度通过 onProgress({received,total,percent}) 回调。
 */
function startDownload({ url, dest, proxy, onProgress } = {}) {
  const target = String(url || '');
  const output = String(dest || '');
  if (!/^https?:\/\//i.test(target) || !output) {
    return { promise: Promise.resolve({ ok: false, error: '下载地址无效' }), cancel() {} };
  }
  let req = null;
  let file = null;
  let cancelled = false;
  const tmp = output + '.part';

  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      try { if (file) file.destroy(); } catch (err) { /* ignore */ }
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (err) { /* ignore */ }
      reject(e);
    };
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };

    const get = (rawUrl, redirects) => {
      let parsed;
      try { parsed = new URL(rawUrl); } catch (e) { return fail(e); }
      const lib = parsed.protocol === 'https:' ? https : http;
      req = lib.get(
        parsed.href,
        { headers: { 'User-Agent': 'TDLVV-Updater', 'Accept': 'application/octet-stream' }, timeout: 30000 },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (redirects >= 5) return fail(new Error('too many redirects'));
            return get(new URL(res.headers.location, parsed.href).href, redirects + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return fail(new Error('HTTP ' + res.statusCode));
          }
          const total = Number(res.headers['content-length']) || 0;
          try { fs.mkdirSync(path.dirname(output), { recursive: true }); } catch (e) { return fail(e); }
          file = fs.createWriteStream(tmp);
          let received = 0;
          file.on('error', fail);
          res.on('error', fail);
          res.on('data', (chunk) => {
            received += chunk.length;
            if (typeof onProgress === 'function') {
              onProgress({ received, total, percent: total ? Math.min(99, Math.round(received * 100 / total)) : 0 });
            }
            if (!file.write(chunk)) { res.pause(); file.once('drain', () => res.resume()); }
          });
          res.on('end', () => {
            file.end(() => {
              try { fs.renameSync(tmp, output); } catch (e) { return fail(e); }
              if (typeof onProgress === 'function') onProgress({ received, total, percent: 100 });
              done({ ok: true, path: output, size: received });
            });
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => {
        if (cancelled) {
          const err = new Error('cancelled');
          err.cancelled = true;
          return fail(err);
        }
        fail(e);
      });
    };

    get(proxiedUrl(target, proxy), 0);
  });

  return {
    promise,
    cancel() {
      cancelled = true;
      try { if (req) req.destroy(); } catch (e) { /* ignore */ }
    }
  };
}

module.exports = { check, cmpVer, parseVer, shortNotes, pickAsset, startDownload, API, PAGE };
