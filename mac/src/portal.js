'use strict';
// 主页设备码服务：一个设备码看到「我」的全部团队任务，并以「我本人」的身份操作。
// 与团队设备码（server.js，绑定单个团队里的某个成员）不同，这里聚合本机所有团队，
// 并通过回调把操作/文件转发到对应团队（host 直接改 state，client 经 Remote）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');

function readBody(req, max = 400 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function readRaw(req, max = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('file too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,x-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(body);
}

function sendFile(res, name, buffer) {
  const safe = encodeURIComponent(String(name || 'task-file').slice(0, 200));
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${safe}`,
    'Cache-Control': 'no-store'
  });
  res.end(buffer);
}

let PAGE_HTML = '';
function sendPage(res) {
  try {
    if (!PAGE_HTML) PAGE_HTML = fs.readFileSync(path.join(__dirname, 'portal.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(PAGE_HTML);
  } catch (e) {
    send(res, 500, { error: '聚合页面文件缺失' });
  }
}

function fileBrief(meta) {
  if (!meta || !meta.storedRel) return null;
  return {
    displayName: meta.displayName || '任务文件',
    size: Number(meta.size) || 0,
    version: Number(meta.version) || 1,
    uploadedByName: meta.uploadedByName || '',
    uploadedAt: Number(meta.uploadedAt) || 0
  };
}

function memberView(m) {
  if (!m) return null;
  return {
    id: m.id,
    name: store.displayName(m),
    avatar: m.avatar || '',
    role: m.role || 'member',
    roleTag: m.roleTag || '',
    online: m.role === 'owner' ? true : !!m.online,
    lastSeen: Number(m.lastSeen) || 0
  };
}

/** 任务视图：以团队里「我」这个成员的身份计算可见范围与进度 */
function taskView(state, t, meId) {
  const members = state.members || [];
  const me = members.find((m) => m.id === meId) || members[0];
  const creator = members.find((m) => m.id === t.creatorId);
  const ids = Array.isArray(t.assigneeIds) && t.assigneeIds.length ? t.assigneeIds : (t.assigneeId ? [t.assigneeId] : []);
  const assignees = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const eligible = ids.length
    ? members.filter((m) => ids.includes(m.id))
    : members.filter((m) => store.visibleTo(state, t, m.id));
  const by = (t.personalDoneBy && typeof t.personalDoneBy === 'object') ? t.personalDoneBy : {};
  const doneIds = eligible.filter((m) => by[m.id]).map((m) => m.id);
  const canSeeAll = !!me && (store.isManager(me.role) || t.creatorId === me.id);
  const memberFiles = [];
  Object.keys(t.memberFiles || {}).forEach((mid) => {
    if (!canSeeAll && me && mid !== me.id) return;
    const brief = fileBrief(t.memberFiles[mid]);
    if (!brief) return;
    const m = members.find((x) => x.id === mid);
    memberFiles.push(Object.assign({ memberId: mid, memberName: m ? store.displayName(m) : brief.uploadedByName }, brief));
  });
  return {
    id: t.id,
    text: t.text,
    done: !!t.done,
    closed: !!t.closed,
    createdAt: t.createdAt || 0,
    dueAt: t.dueAt || 0,
    remindAt: t.remindAt || 0,
    remindHours: Number(t.remindHours) || 0,
    doneAt: t.doneAt || 0,
    doneByName: t.doneByName || '',
    closedByName: t.closedByName || '',
    creatorId: t.creatorId || '',
    creatorName: creator ? store.displayName(creator) : '',
    assigneeId: t.assigneeId || '',
    assigneeName: assignees.length ? store.displayName(assignees[0]) : '',
    assigneeIds: assignees.map((m) => m.id),
    assigneeNames: assignees.map((m) => store.displayName(m)),
    audience: t.audience || { type: 'all' },
    linkType: t.linkType || '',
    linkTarget: t.linkTarget || '',
    pinned: !!t.pinned,
    fields: (t.fields || []).map((f) => ({ label: f.label || '', value: f.value || '' })),
    file: fileBrief(t.file),
    pendingFile: fileBrief(t.pendingFile),
    memberFiles,
    folderRel: t.folderRel || '',
    personalDoneBy: by,
    myDone: !!(me && by[me.id]),
    progress: {
      done: doneIds.length,
      total: eligible.length,
      names: doneIds.map((id) => {
        const m = members.find((x) => x.id === id);
        return m ? store.displayName(m) : '';
      }).filter(Boolean)
    }
  };
}

/**
 * 启动主页设备码聚合服务。
 * @param {object} opts
 * @param {function} opts.getCode          当前主页设备码（空字符串表示未生成）
 * @param {function} opts.getTeams         本机团队列表 [{id,kind,name,role,meId,state,online}]
 * @param {function} opts.applyAction      (teamId, type, payload) => Promise<{ok,error}>
 * @param {function} opts.readFile         (teamId, taskId, memberId) => Promise<{ok,name,buffer,error}>
 * @param {function} opts.uploadFile       (teamId, taskId, name, buffer) => Promise<{ok,error}>
 * @param {function} opts.onListen         (port) => void
 * @param {function} opts.onError          (err) => void
 */
function startPortal(opts) {
  const tokens = new Set(); // 主页设备码是全权 token，代表「我本人」
  const getCode = opts.getCode || (() => '');
  const getTeams = opts.getTeams || (() => []);
  const applyAction = opts.applyAction || (async () => ({ ok: false, error: '操作暂不可用' }));
  const readFile = opts.readFile || (async () => ({ ok: false, error: '文件暂不可用' }));
  const uploadFile = opts.uploadFile || (async () => ({ ok: false, error: '上传暂不可用' }));

  function cleanCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
  }
  function authorized(req, u) {
    const token = req.headers['x-token'] || u.searchParams.get('token');
    return !!token && tokens.has(token);
  }
  function teamById(id) {
    return (getTeams() || []).find((t) => t.id === id) || null;
  }

  function aggregate() {
    const teams = getTeams() || [];
    let rev = 0;
    const out = [];
    teams.forEach((t) => {
      const st = t.state;
      if (!st) return;
      rev = (rev + (Number(st.rev) || 0)) % 2147483647;
      const me = (st.members || []).find((m) => m.id === t.meId) || (st.members || [])[0];
      out.push({
        id: t.id,
        name: st.boardName || t.name || '团队',
        kind: t.kind,
        role: (me && me.role) || 'member',
        meId: t.meId,
        online: t.kind === 'client' ? !!t.online : true,
        me: me ? memberView(me) : null,
        members: (st.members || []).map(memberView),
        tasks: (st.tasks || [])
          .filter((x) => store.visibleTo(st, x, t.meId))
          .map((x) => taskView(st, x, t.meId)),
        canPublish: t.kind === 'local' || !!(me && store.isManager(me.role))
      });
    });
    return { rev, teams: out };
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') return send(res, 204, {});
    try {
      if ((u.pathname === '/p' || u.pathname === '/p/' || u.pathname === '/') && req.method === 'GET') {
        return sendPage(res);
      }
      if (u.pathname === '/api/info') {
        return send(res, 200, { app: 'tdlvv-portal' });
      }
      if (u.pathname === '/api/portal/login' && req.method === 'POST') {
        const body = await readBody(req);
        const code = cleanCode(body.code);
        const expected = cleanCode(getCode());
        if (!expected) return send(res, 403, { error: '还没有生成主页设备码，请在本机主页生成' });
        if (code !== expected) return send(res, 403, { error: '设备码无效' });
        const token = store.rid(24);
        tokens.add(token);
        return send(res, 200, { ok: true, token });
      }
      if (!authorized(req, u)) return send(res, 401, { error: '登录已失效，请用设备码重新进入' });

      if (u.pathname === '/api/portal/state' && req.method === 'GET') {
        const data = aggregate();
        const since = Number(u.searchParams.get('since') || 0);
        if (since && data.rev === since) return send(res, 200, { ok: true, unchanged: true, rev: data.rev });
        return send(res, 200, Object.assign({ ok: true }, data));
      }
      if (u.pathname === '/api/portal/action' && req.method === 'POST') {
        const body = await readBody(req);
        const teamId = String(body.teamId || '');
        const type = String(body.type || '');
        if (!teamId || !type) return send(res, 400, { error: '缺少团队或操作类型' });
        if (!teamById(teamId)) return send(res, 404, { error: '团队不存在' });
        const payload = Object.assign({}, body);
        delete payload.teamId;
        delete payload.type;
        const r = await applyAction(teamId, type, payload);
        if (!r || !r.ok) return send(res, 400, { error: (r && r.error) || '操作失败' });
        return send(res, 200, { ok: true, changed: !!(r && r.changed), createdId: r.createdId || '' });
      }
      if (u.pathname === '/api/portal/file' && req.method === 'GET') {
        const teamId = String(u.searchParams.get('teamId') || '');
        const taskId = String(u.searchParams.get('task') || '');
        const memberId = String(u.searchParams.get('member') || '');
        if (!teamById(teamId)) return send(res, 404, { error: '团队不存在' });
        const r = await readFile(teamId, taskId, memberId);
        if (!r || !r.ok) return send(res, 404, { error: (r && r.error) || '文件不存在' });
        return sendFile(res, r.name, r.buffer);
      }
      if (u.pathname === '/api/portal/upload' && req.method === 'POST') {
        const teamId = String(u.searchParams.get('teamId') || '');
        const taskId = String(u.searchParams.get('task') || '');
        const name = String(u.searchParams.get('name') || '任务文件');
        if (!teamById(teamId)) return send(res, 404, { error: '团队不存在' });
        const buffer = await readRaw(req);
        if (!buffer.length) return send(res, 400, { error: '文件是空的' });
        const r = await uploadFile(teamId, taskId, name, buffer);
        if (!r || !r.ok) return send(res, 400, { error: (r && r.error) || '上传失败' });
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      return send(res, 400, { error: String(err && err.message ? err.message : err) });
    }
  });

  server.on('error', (err) => { if (typeof opts.onError === 'function') opts.onError(err); });
  server.listen(opts.port || 0, '0.0.0.0', () => {
    if (typeof opts.onListen === 'function') opts.onListen(server.address().port);
  });

  return {
    server,
    /** 重置设备码时清掉全部已登录 token，旧链接立即失效 */
    invalidate() { tokens.clear(); },
    port() { return server.address() ? server.address().port : 0; },
    close() { try { server.close(); } catch (e) { /* ignore */ } }
  };
}

module.exports = { startPortal, taskView, memberView, fileBrief };
