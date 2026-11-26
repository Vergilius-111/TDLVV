'use strict';
// 用 ntfy.sh 的公共话题做「邀请码 → 公网地址」的映射，不需要账号
const https = require('https');

const BASE = 'https://ntfy.sh';
const PREFIX = 'tnx-';

function topicFor(code) {
  return PREFIX + String(code || '').toLowerCase().replace(/[^0-9a-z]/g, '');
}

function httpsJson(method, path, body, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(
      { host: 'ntfy.sh', path, method, timeout, headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, payload ? { 'Content-Length': payload.length } : {}) },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** 主机发布自己的公网地址，30 分钟后过期，由主机定时续期 */
async function publish(code, data) {
  const payload = JSON.stringify({ ...data, ts: Date.now() });
  await httpsJson('POST', `/${topicFor(code)}`, payload, 8000);
  return true;
}

/** 加入方按邀请码查最新地址；找不到返回 null */
async function read(code) {
  try {
    const raw = await httpsJson('GET', `/${topicFor(code)}/json?poll=1&since=12h`, null, 8000);
    const lines = raw.split('\n').filter(Boolean);
    let last = null;
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.event === 'message' && ev.message) last = ev.message;
      } catch (e) {
        /* ignore */
      }
    }
    if (!last) return null;
    let data = last;
    // ntfy 的 message 字段有时会被再包一层字符串，多解几次
    for (let i = 0; i < 3 && typeof data === 'string'; i++) {
      try {
        data = JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    return data && data.u ? data : null;
  } catch (e) {
    return null;
  }
}

module.exports = { publish, read, topicFor, BASE };
