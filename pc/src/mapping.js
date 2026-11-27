'use strict';
// 「邀请码 → 创建者公网地址」的映射。
// 默认用 ntfy.sh 公共话题（无需账号）；也可配置自有中继服务，国内更稳。
// 写入时两边并行双写（任一成功即可），读取时优先自有中继、失败回退 ntfy —— 迁移期间不会断。
const http = require('http');
const https = require('https');

const NTFY_BASE = String(process.env.TDLVV_NTFY_BASE || 'https://ntfy.sh').replace(/\/+$/, '');
const PREFIX = 'tnx-';

// 运行时由主进程注入：用户配置的自有中继根地址（如 https://relay.example.com）
let relayBase = '';
function setRelayUrl(url) {
  relayBase = String(url || '').trim().replace(/\/+$/, '');
  if (relayBase && !/^https?:\/\//i.test(relayBase)) relayBase = '';
  return relayBase;
}
function getRelayUrl() { return relayBase; }

function topicFor(code) {
  return PREFIX + String(code || '').toLowerCase().replace(/[^0-9a-z]/g, '');
}

/** 通用 JSON 请求：完整 URL，自动选 http/https */
function requestJson(fullUrl, method, body, timeout = 8000) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(fullUrl); } catch (e) { return reject(e); }
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method,
        timeout,
        headers: Object.assign(
          { 'Content-Type': 'text/plain; charset=utf-8' },
          payload ? { 'Content-Length': payload.length } : {}
        )
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
          resolve(raw);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * 主机发布自己的公网地址，30 分钟后过期，由主机定时续期。
 * code 可以传数组：除了邀请码，还会用稳定的 boardId 再发一份。
 * 邀请码每 10 分钟自动更换，成员本地保存的是旧码；用 boardId 查地址才不会在隧道换址后失联。
 */
async function publish(code, data) {
  const codes = [...new Set((Array.isArray(code) ? code : [code]).filter(Boolean).map(String))];
  if (!codes.length) return false;
  const payload = { ...data, ts: Date.now() };
  const jobs = [];

  for (const key of codes) {
    // ntfy.sh（原路径，保证老成员仍能读到）
    jobs.push(
      requestJson(`${NTFY_BASE}/${topicFor(key)}`, 'POST', payload, 8000).then(() => true, () => false)
    );
    // 自有中继（配置了才写）
    if (relayBase) {
      jobs.push(
        requestJson(`${relayBase}/map`, 'POST', { code: key, ...payload }, 8000).then(() => true, () => false)
      );
    }
  }

  const results = await Promise.all(jobs);
  if (!results.some(Boolean)) throw new Error('all relays failed');
  return true;
}

/** 把 ntfy 消息体（可能被多层字符串包裹）解成对象 */
function decodeMessage(raw) {
  let data = raw;
  for (let i = 0; i < 3 && typeof data === 'string'; i++) {
    try { data = JSON.parse(data); } catch (e) { return null; }
  }
  return data && typeof data === 'object' ? data : null;
}

async function readRelay(code) {
  if (!relayBase) return null;
  try {
    const raw = await requestJson(`${relayBase}/map?code=${encodeURIComponent(code)}`, 'GET', null, 8000);
    const data = decodeMessage(raw);
    return data && data.u ? data : null;
  } catch (e) {
    return null;
  }
}

async function readNtfy(code) {
  try {
    const raw = await requestJson(
      `${NTFY_BASE}/${topicFor(code)}/json?poll=1&since=12h`,
      'GET',
      null,
      8000
    );
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
    const data = decodeMessage(last);
    return data && data.u ? data : null;
  } catch (e) {
    return null;
  }
}

/** 按多个 key 查最新地址：先并行查中继，再并行回退 ntfy；返回第一个命中的 */
async function readAny(codes) {
  const keys = [...new Set((Array.isArray(codes) ? codes : [codes]).filter(Boolean).map(String))];
  if (!keys.length) return null;

  const relayHits = await Promise.all(keys.map(readRelay));
  const relayHit = relayHits.find((d) => d && d.u);
  if (relayHit) return relayHit;

  const ntfyHits = await Promise.all(keys.map(readNtfy));
  return ntfyHits.find((d) => d && d.u) || null;
}

/** 加入方按邀请码查最新地址；找不到返回 null */
async function read(code) {
  return readAny([code]);
}

module.exports = { publish, read, readAny, topicFor, setRelayUrl, getRelayUrl, BASE: NTFY_BASE };
