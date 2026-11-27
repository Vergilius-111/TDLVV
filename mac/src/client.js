'use strict';
// 加入方的客户端：局域网直连 / 公网隧道都走同一套 HTTP 接口
const dgram = require('dgram');
const http = require('http');
const https = require('https');
const mapping = require('./mapping');

const BEACON_PORT = 41234;

function request({ baseUrl, path, method = 'GET', token, body, timeout = 8000 }) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl.replace(/\/$/, '') + path);
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
          { 'Content-Type': 'application/json; charset=utf-8' },
          payload ? { 'Content-Length': payload.length } : {},
          token ? { 'x-token': token } : {}
        )
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (e) {
            return reject(new Error('对方返回的内容无法解析（可能被网络网关拦截）'));
          }
          if (res.statusCode >= 400) {
            const err = new Error(data.error || `请求失败(${res.statusCode})`);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          resolve(data);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('连接超时')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestRaw({ baseUrl, path, method = 'GET', token, body, timeout = 30000, expectBinary = false }) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl.replace(/\/$/, '') + path);
    const payload = Buffer.isBuffer(body) ? body : null;
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
          { 'Content-Type': 'application/octet-stream' },
          payload ? { 'Content-Length': payload.length } : {},
          token ? { 'x-token': token } : {}
        )
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          if (res.statusCode >= 400) {
            let msg = `请求失败(${res.statusCode})`;
            try { msg = JSON.parse(raw.toString('utf8')).error || msg; } catch (e) { /* ignore */ }
            const err = new Error(msg);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          if (expectBinary) {
            const cd = String(res.headers['content-disposition'] || '');
            let name = '';
            const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
            if (m) {
              try { name = decodeURIComponent(m[1]); } catch (e) { name = ''; }
            }
            return resolve({ buffer: raw, name });
          }
          try {
            resolve(raw.length ? JSON.parse(raw.toString('utf8')) : {});
          } catch (e) {
            reject(new Error('对方返回的内容无法解析'));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('连接超时')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

class Remote {
  constructor({ baseUrl, host, port, token }) {
    this.baseUrl = baseUrl || `http://${host}:${port}`;
    this.token = token || '';
  }

  /** 提交加入申请，返回 {requestId, board, owner}；clientId 让创建者认出这台安装 */
  async join(code, name, avatar, clientId) {
    return request({
      baseUrl: this.baseUrl,
      path: '/api/join',
      method: 'POST',
      body: { code, name, avatar, clientId: clientId || '' }
    });
  }

  /** 轮询审批结果 */
  async status(requestId) {
    return request({ baseUrl: this.baseUrl, path: `/api/join/status?requestId=${encodeURIComponent(requestId)}` });
  }

  async getState() {
    const r = await request({ baseUrl: this.baseUrl, path: '/api/state', token: this.token });
    return r.state;
  }

  /** 条件拉取：状态 rev 没变时只返回一个很小的 unchanged 响应 */
  async getStateSince(rev) {
    const q = Number(rev) ? `?since=${encodeURIComponent(Number(rev))}` : '';
    return request({ baseUrl: this.baseUrl, path: `/api/state${q}`, token: this.token });
  }

  async action(type, payload = {}) {
    const r = await request({
      baseUrl: this.baseUrl,
      path: '/api/action',
      method: 'POST',
      token: this.token,
      body: { type, ...payload }
    });
    return r.state;
  }

  async uploadTaskFile(taskId, name, buffer) {
    const q = new URLSearchParams({ task: String(taskId), name: String(name || '任务文件') });
    return requestRaw({
      baseUrl: this.baseUrl,
      path: `/api/file?${q.toString()}`,
      method: 'POST',
      token: this.token,
      body: buffer,
      timeout: 120000
    });
  }

  async downloadTaskFile(taskId, copy = false, memberId = '') {
    const q = `${copy ? 'copy=1&' : ''}${memberId ? `member=${encodeURIComponent(String(memberId))}&` : ''}task=${encodeURIComponent(String(taskId))}`;
    return requestRaw({
      baseUrl: this.baseUrl,
      path: `/api/file?${q}`,
      method: 'GET',
      token: this.token,
      timeout: 120000,
      expectBinary: true
    });
  }

  /** 只确认"已提交"（内容已经在对方那份里），不重复上传 */
  async submitTaskFile(taskId) {
    const q = new URLSearchParams({ task: String(taskId) });
    return requestRaw({
      baseUrl: this.baseUrl,
      path: `/api/file?${q.toString()}`,
      method: 'POST',
      token: this.token,
      timeout: 30000
    });
  }

  async leave() {
    return request({ baseUrl: this.baseUrl, path: '/api/action', method: 'POST', token: this.token, body: { type: 'leaveTeam' } });
  }
}

function openBeacon(onPacket, onError) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => onError());
  sock.on('message', (msg, rinfo) => {
    try {
      const p = JSON.parse(msg.toString());
      if (!p || p.app !== 'tdlvv' || !p.code) return;
      onPacket(p, rinfo);
    } catch (e) {
      /* ignore */
    }
  });
  sock.bind(BEACON_PORT, () => {
    try {
      sock.setBroadcast(true);
    } catch (e) {
      /* ignore */
    }
  });
  return sock;
}

function closeBeacon(sock) {
  try {
    sock.close();
  } catch (e) {
    /* ignore */
  }
}

function collectBeacons(duration = 5000, onEach) {
  return new Promise((resolve) => {
    const found = new Map();
    let sock = null;
    let timer = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      if (sock) closeBeacon(sock);
      resolve(Array.from(found.values()));
    };
    sock = openBeacon((p, rinfo) => {
      const key = `${rinfo.address}:${p.port}:${p.code}`;
      found.set(key, {
        code: String(p.code).toUpperCase(),
        bid: String(p.bid || '').toUpperCase(),
        board: p.board || '',
        owner: p.owner || '',
        addr: rinfo.address,
        port: Number(p.port) || 0
      });
      if (onEach) onEach(Array.from(found.values()));
    }, finish);
    timer = setTimeout(finish, duration);
  });
}

/**
 * 局域网广播发现：按邀请码或稳定 boardId 匹配主机。
 * 邀请码每 10 分钟轮换，成员本地存的旧码匹配不上新广播，所以重连时要用 boardId。
 */
function discover(code, timeout = 4000, boardId = '') {
  const target = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const targetBid = String(boardId || '').toUpperCase();
  if (!target && !targetBid) return Promise.resolve(null);
  return new Promise((resolve) => {
    let sock = null;
    let settled = false;
    let timer = null;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (sock) closeBeacon(sock);
      resolve(v);
    };
    sock = openBeacon((p, rinfo) => {
      const codeHit = target && String(p.code).toUpperCase() === target;
      const bidHit = targetBid && String(p.bid || '').toUpperCase() === targetBid;
      if (codeHit || bidHit) {
        finish({ host: rinfo.address, port: p.port, board: p.board, owner: p.owner, bid: String(p.bid || '') });
      }
    }, () => finish(null));
    timer = setTimeout(() => finish(null), timeout);
  });
}

/** 快速探测主机地址是否真的可用：401 说明服务在，只是没带 token */
async function probeHost(baseUrl) {
  try {
    await request({ baseUrl, path: '/api/state', timeout: 2000 });
    return true;
  } catch (e) {
    return !!(e && e.statusCode === 401);
  }
}

/** 手动地址：192.168.1.20:51234 或 https://xxx.trycloudflare.com */
function parseManual(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  if (/^https?:\/\//.test(s)) {
    try {
      const u = new URL(s);
      return { baseUrl: u.origin, host: u.hostname, port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)) };
    } catch (e) {
      return null;
    }
  }
  const m = s.match(/^([0-9a-zA-Z\.\-]+)(?::(\d+))?$/);
  if (!m || !m[2]) return null;
  return { baseUrl: `http://${m[1]}:${m[2]}`, host: m[1], port: Number(m[2]) };
}

/**
 * 找主机的顺序：手填地址 → 同网段直连（最快最稳，避免绕公网 WiFi 抖动） → 映射查公网地址。
 * 同局域网的两台电脑必须优先走内网：之前先查公网映射，笔记本 WiFi 连台式机的公网隧道，
 * 绕一大圈且容易断。邀请码每 10 分钟轮换，所以局域网发现优先用稳定的 boardId 匹配。
 */
async function resolveHost(code, manual, fallbackCode, boardId) {
  if (manual) {
    const m = parseManual(manual);
    if (m) return { baseUrl: m.baseUrl, via: 'manual', board: '' };
  }
  // 1) 同网段直连：用 boardId（稳定）+ 邀请码一起找，探测通了才用，避免选到已退出的旧主机
  const lan = await discover(code || fallbackCode, 1500, boardId || '');
  if (lan) {
    const lanUrl = `http://${lan.host}:${lan.port}`;
    if (await probeHost(lanUrl)) {
      return { baseUrl: lanUrl, via: 'lan', board: lan.board || '', owner: lan.owner || '' };
    }
  }
  // 2) 公网映射兜底（异地成员 / 同网段没找到时）
  const mp = await mapping.readAny([boardId, code, fallbackCode].filter(Boolean));
  if (mp && mp.u) return { baseUrl: mp.u, via: 'relay', board: mp.n || '', owner: mp.o || '' };
  return null;
}

module.exports = { Remote, discover, discoverAll: collectBeacons, parseManual, resolveHost, request, requestRaw };
