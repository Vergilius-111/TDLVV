'use strict';
// 主机模式下的极简 HTTP 服务：局域网直连 + 公网隧道都走它（v3：角色权限）
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const BEACON_PORT = 41234;
const REQ_TTL = 10 * 60 * 1000; // 审批结果保留 10 分钟，够客户端轮询到

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 400) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
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
      if (size > max) {
        reject(new Error('file too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
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

let MOBILE_HTML = '';
function sendMobilePage(res) {
  try {
    if (!MOBILE_HTML) MOBILE_HTML = fs.readFileSync(path.join(__dirname, 'mobile.html'), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(MOBILE_HTML);
  } catch (e) {
    send(res, 500, { error: '手机页面文件缺失' });
  }
}

/**
 * @param {object} opts
 * @param {object} opts.state          权威状态（原地修改）
 * @param {number} opts.port           0 = 随机端口
 * @param {object} opts.tokens         持久化的 token -> memberId
 * @param {object} opts.deviceCodes    持久化的 memberId -> 固定设备码
 * @param {function} opts.onDeviceCodes 设备码变化回调（落盘）
 * @param {object} opts.files          任务文件存储（src/files.js 的 createStore 实例）
 * @param {function} opts.onChange     状态变化回调（落盘 + 刷新界面）
 * @param {function} opts.onTokens     令牌变化回调（落盘）
 */
function startHost(opts) {
  const state = opts.state;
  const files = opts.files;
  const tokens = new Map(Object.entries(opts.tokens || {})); // token -> memberId
  const results = new Map(); // requestId -> {status, token, memberId, at}
  const lastSeenAt = new Map();
  const memberCodes = new Map(Object.entries(opts.deviceCodes || {}).filter(([, code]) => typeof code === 'string' && code));

  function persistTokens() {
    if (typeof opts.onTokens === 'function') {
      opts.onTokens(Object.fromEntries(tokens));
    }
  }
  function persistCodes() {
    if (typeof opts.onDeviceCodes === 'function') {
      opts.onDeviceCodes(Object.fromEntries(memberCodes));
    }
  }
  function codeOwner(code) {
    const clean = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    for (const [memberId, saved] of memberCodes) {
      if (saved === clean) {
        return state.members.find((m) => m.id === memberId) || null;
      }
    }
    return null;
  }
  function makeUniqueCode() {
    let code = '';
    do {
      code = store.makeInviteCode();
    } while ([...memberCodes.values()].includes(code));
    return code;
  }
  function ensureDeviceCode(memberId) {
    const member = state.members.find((m) => m.id === memberId);
    if (!member) return '';
    const saved = memberCodes.get(memberId);
    if (saved) return saved;
    const code = makeUniqueCode();
    memberCodes.set(memberId, code);
    persistCodes();
    return code;
  }
  function setDeviceCode(memberId, rawCode) {
    const member = state.members.find((m) => m.id === memberId);
    if (!member) return { ok: false, error: '成员不存在' };
    const code = String(rawCode || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    if (code.length !== 6) return { ok: false, error: '设备码要 6 位数字或字母' };
    for (const [otherId, saved] of memberCodes) {
      if (saved === code && otherId !== memberId) return { ok: false, error: '这个设备码已经被其他成员使用' };
    }
    memberCodes.set(memberId, code);
    persistCodes();
    return { ok: true, code };
  }
  function resetDeviceCode(memberId) {
    const member = state.members.find((m) => m.id === memberId);
    if (!member) return { ok: false, error: '成员不存在' };
    const code = makeUniqueCode();
    memberCodes.set(memberId, code);
    persistCodes();
    return { ok: true, code };
  }
  function changed(reason) {
    if (typeof opts.onChange === 'function') opts.onChange(reason);
  }
  function purge() {
    const now = Date.now();
    state.pending = (state.pending || []).filter((p) => now - p.createdAt < 30 * 60 * 1000);
    for (const [key, val] of results) {
      if (now - val.at > REQ_TTL) results.delete(key);
    }
  }
  function memberOf(token) {
    const id = tokens.get(token);
    if (!id) return null;
    return state.members.find((m) => m.id === id) || null;
  }
  function roleOf(memberId) {
    const m = state.members.find((x) => x.id === memberId);
    return m ? m.role : '';
  }

  function memberView(m) {
    if (!m) return null;
    return {
      id: m.id,
      name: store.displayName(m),
      avatar: m.avatar || '',
      role: m.role || 'member',
      roleTag: m.roleTag || ''
    };
  }

  function mobileTaskView(t) {
    const creator = state.members.find((m) => m.id === t.creatorId);
    const assignee = state.members.find((m) => m.id === t.assigneeId);
    return {
      id: t.id,
      text: t.text,
      done: !!t.done,
      closed: !!t.closed,
      createdAt: t.createdAt || 0,
      dueAt: t.dueAt || 0,
      remindAt: t.remindAt || 0,
      doneAt: t.doneAt || 0,
      creatorId: t.creatorId || '',
      creatorName: creator ? store.displayName(creator) : '',
      assigneeId: t.assigneeId || '',
      assigneeName: assignee ? store.displayName(assignee) : '',
      pinned: !!t.pinned,
      fields: (t.fields || []).map((f) => ({ label: f.label || '', value: f.value || '' }))
    };
  }

  function mobileStateBody(member, since) {
    if (since && Number(state.rev) === since) {
      return { ok: true, unchanged: true, rev: state.rev };
    }
    const tasks = (state.tasks || [])
      .filter((t) => store.visibleTo(state, t, member.id))
      .map(mobileTaskView);
    return {
      ok: true,
      rev: state.rev,
      boardId: state.boardId,
      boardName: state.boardName,
      me: memberView(member),
      members: (state.members || []).map(memberView),
      tasks,
      canPublish: store.isManager(member.role),
      templates: (state.templates || []).map((x) => ({ id: x.id, name: x.name, fields: x.fields || [] }))
    };
  }

  function issueDeviceCode(actorId) {
    if (!store.isManager(roleOf(actorId))) {
      return { ok: false, error: '只有创建者或管理员能查看设备登录码' };
    }
    const code = ensureDeviceCode(actorId);
    if (!code) return { ok: false, error: '找不到这个成员' };
    return { ok: true, code };
  }

  function loginDevice(rawCode) {
    const code = String(rawCode || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    const member = codeOwner(code);
    if (!member) return { ok: false, error: '设备码无效，请让创建者检查或重置' };
    const token = store.rid(24);
    tokens.set(token, member.id);
    persistTokens();
    return {
      ok: true,
      token,
      me: memberView(member),
      boardId: state.boardId,
      boardName: state.boardName
    };
  }

  function takeApproval(requestId, actorId) {
    if (!store.isManager(roleOf(actorId))) return { ok: false, error: '只有创建者或管理员能审批' };
    const req = store.takePending(state, requestId);
    if (!req) return { ok: false, error: '申请不存在或已处理' };
    return { ok: true, req };
  }

  function approve(requestId, actorId) {
    const p = takeApproval(requestId, actorId);
    if (!p.ok) return p;
    const req = p.req;
    const member = store.addMember(state, req.name, req.avatar);
    const token = store.rid(24);
    tokens.set(token, member.id);
    results.set(requestId, { status: 'approved', token, memberId: member.id, at: Date.now() });
    persistTokens();
    changed('approve');
    return { ok: true, member };
  }

  function reject(requestId, actorId) {
    const p = takeApproval(requestId, actorId);
    if (!p.ok) return p;
    results.set(requestId, { status: 'rejected', at: Date.now() });
    changed('reject');
    return { ok: true };
  }

  function revoke(memberId) {
    for (const [t, id] of tokens) {
      if (id === memberId) tokens.delete(t);
    }
    if (memberCodes.delete(memberId)) persistCodes();
    persistTokens();
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') return send(res, 204, {});
    purge();

    try {
      /* 手机端页面：只做任务查看和发布，不暴露文件上传 */
      if ((u.pathname === '/m' || u.pathname === '/m/') && req.method === 'GET') {
        return sendMobilePage(res);
      }

      /* 设备登录码换取 token；手机和笔记本都可以用 */
      if (u.pathname === '/api/device/login' && req.method === 'POST') {
        const body = await readBody(req);
        const r = loginDevice(body.code);
        if (!r.ok) return send(res, 403, r);
        return send(res, 200, r);
      }

      /* 已登录的管理员可以生成设备码；桌面端主要走本机 IPC */
      if (u.pathname === '/api/device/code' && req.method === 'POST') {
        const token = req.headers['x-token'] || u.searchParams.get('token');
        const member = memberOf(token);
        if (!member) return send(res, 401, { error: '未加入或已被移除' });
        const r = issueDeviceCode(member.id);
        return send(res, r.ok ? 200 : 403, r);
      }

      /* 手机端专用状态：只返回该成员可见的任务，去掉文件字段 */
      if (u.pathname === '/api/mobile/state' && req.method === 'GET') {
        const token = req.headers['x-token'] || u.searchParams.get('token');
        const member = memberOf(token);
        if (!member) return send(res, 401, { error: '未加入或已被移除' });
        const now = Date.now();
        const last = lastSeenAt.get(member.id) || 0;
        if (now - last > 5000) {
          lastSeenAt.set(member.id, now);
          store.touch(state, member.id);
        }
        const since = Number(u.searchParams.get('since') || 0);
        return send(res, 200, mobileStateBody(member, since));
      }

      /* 申请加入：只登记申请，不直接成为成员 */
      if (u.pathname === '/api/join' && req.method === 'POST') {
        const body = await readBody(req);
        const code = String(body.code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (!state.inviteCode || code !== state.inviteCode) {
          return send(res, 403, { error: '邀请码不正确，或已被重置' });
        }
        if (store.inviteExpired(state)) {
          return send(res, 403, { error: '邀请码已过期（10 分钟内有效），请让创建者重新生成' });
        }
        const name = String(body.name || '').trim().slice(0, 12);
        if (!name) return send(res, 400, { error: '请填写你的名字' });
        const reqObj = store.addPending(state, name, body.avatar);
        changed('pending');
        return send(res, 200, {
          ok: true,
          pending: true,
          requestId: reqObj.id,
          board: state.boardName,
          owner: store.displayName(state.members[0]),
          members: state.members.length
        });
      }

      /* 申请人轮询审批结果 */
      if (u.pathname === '/api/join/status' && req.method === 'GET') {
        const requestId = u.searchParams.get('requestId') || '';
        const r = results.get(requestId);
        if (!r) {
          const stillPending = store.findPending(state, requestId);
          return send(res, 200, { status: stillPending ? 'pending' : 'missing' });
        }
        if (r.status !== 'approved') return send(res, 200, { status: r.status });
        const member = state.members.find((m) => m.id === r.memberId);
        if (!member) return send(res, 200, { status: 'rejected' });
        return send(res, 200, {
          status: 'approved',
          token: r.token,
          me: member,
          state: state
        });
      }

      /* 成员拉状态 */
      if (u.pathname === '/api/state' && req.method === 'GET') {
        const token = req.headers['x-token'] || u.searchParams.get('token');
        const member = memberOf(token);
        if (!member) return send(res, 401, { error: '未加入或已被移除' });
        const now = Date.now();
        const last = lastSeenAt.get(member.id) || 0;
        if (now - last > 5000) {
          lastSeenAt.set(member.id, now);
          store.touch(state, member.id);
        }
        const since = Number(u.searchParams.get('since') || 0);
        if (since && Number(state.rev) === since) {
          return send(res, 200, { ok: true, unchanged: true, rev: state.rev });
        }
        return send(res, 200, { ok: true, state: state, rev: state.rev });
      }

      /* 任务文件上传：创建者保存原文件；其他成员保存自己的副本，不覆盖原稿 */
      if (u.pathname === '/api/file' && req.method === 'POST') {
        const token = req.headers['x-token'] || u.searchParams.get('token');
        const member = memberOf(token);
        if (!member) return send(res, 401, { error: '未加入或已被移除' });
        if (!files) return send(res, 500, { error: '主机文件目录未准备好' });
        const taskId = String(u.searchParams.get('task') || '');
        const name = String(u.searchParams.get('name') || '任务文件').slice(0, 160);
        const task = store.findTask(state, taskId);
        if (!task) return send(res, 404, { error: '任务不存在' });
        if (!store.visibleTo(state, task, member.id)) return send(res, 403, { error: '你看不到这条任务' });
        const buffer = await readRaw(req);
        const isCreator = task.creatorId === member.id || !task.file;
        if (!buffer.length) {
          // 空请求体 = 只确认"已提交"，不重复传内容：沿用现有副本并刷新提交时间
          let meta = isCreator ? task.file : store.memberFile(task, member.id);
          if (!meta && !isCreator) {
            if (!task.file) return send(res, 400, { error: '文件是空的' });
            const src = files.resolve(task.file.storedRel, task.file.root);
            if (!src || !fs.existsSync(src)) return send(res, 404, { error: '原文件不存在' });
            meta = files.saveMemberCopy({
              boardId: state.boardId,
              taskId: task.id,
              originalName: task.file.displayName || '任务文件',
              sourceMemberName: task.file.uploadedByName || '',
              memberId: member.id,
              memberName: store.displayName(member),
              version: 1,
              buffer: fs.readFileSync(src)
            });
            store.attachMemberFile(state, task.id, member.id, meta);
          }
          if (!meta) return send(res, 400, { error: '文件是空的' });
          const bumped = Object.assign({}, meta, {
            uploadedByName: store.displayName(member),
            uploadedAt: Date.now()
          });
          if (isCreator) store.attachFile(state, task.id, member.id, bumped);
          else store.attachMemberFile(state, task.id, member.id, bumped);
          changed(isCreator ? 'file' : 'memberFile');
          return send(res, 200, { ok: true, state: state, file: bumped, changed: true });
        }
        const memberCopy = store.memberFile(task, member.id);
        const lastVersion = isCreator
          ? Math.max(
              Number(task.file && task.file.version) || 0,
              Number(task.pendingFile && task.pendingFile.version) || 0,
              Number(u.searchParams.get('version')) || 0
            )
          : Math.max(Number(memberCopy && memberCopy.version) || 0, Number(u.searchParams.get('version')) || 0);
        const saved = isCreator
          ? files.saveVersion({
              boardId: state.boardId,
              taskId: task.id,
              originalName: name,
              memberName: store.displayName(member),
              version: lastVersion + 1,
              buffer
            })
          : files.saveMemberCopy({
              boardId: state.boardId,
              taskId: task.id,
              originalName: name,
              memberId: member.id,
              memberName: store.displayName(member),
              version: lastVersion + 1,
              buffer
            });
        const changedNow = isCreator
          ? store.attachFile(state, task.id, member.id, saved)
          : store.attachMemberFile(state, task.id, member.id, saved);
        if (changedNow) changed(isCreator ? 'file' : 'memberFile');
        return send(res, 200, { ok: true, state: state, file: saved, changed: changedNow });
      }

      /* 任务文件下载：创建者取原稿；成员取自己的副本，没有就先在共享目录生成 */
      if (u.pathname === '/api/file' && req.method === 'GET') {
        const token = req.headers['x-token'] || u.searchParams.get('token');
        const member = memberOf(token);
        if (!member) return send(res, 401, { error: '未加入或已被移除' });
        if (!files) return send(res, 500, { error: '主机文件目录未准备好' });
        const task = store.findTask(state, String(u.searchParams.get('task') || ''));
        if (!task) return send(res, 404, { error: '任务不存在' });
        if (!store.visibleTo(state, task, member.id)) return send(res, 403, { error: '你看不到这条任务' });
        let meta = task.file;
        if (u.searchParams.get('copy') === '1' && member.id !== task.creatorId) {
          meta = store.memberFile(task, member.id);
          let abs = meta ? files.resolve(meta.storedRel, meta.root) : '';
          if (!abs || !fs.existsSync(abs)) {
            if (!task.file) return send(res, 404, { error: '这条任务还没有文件' });
            const src = files.resolve(task.file.storedRel, task.file.root);
            if (!src || !fs.existsSync(src)) return send(res, 404, { error: '原文件不存在' });
            const saved = files.saveMemberCopy({
              boardId: state.boardId,
              taskId: task.id,
              originalName: task.file.displayName || '任务文件',
              sourceMemberName: task.file.uploadedByName || '',
              memberId: member.id,
              memberName: store.displayName(member),
              version: (Number(meta && meta.version) || 0) + 1,
              buffer: fs.readFileSync(src)
            });
            store.attachMemberFile(state, task.id, member.id, saved);
            changed('memberFile');
            meta = saved;
          }
        }
        if (!meta || !meta.storedRel) return send(res, 404, { error: '这条任务还没有文件' });
        const abs = files.resolve(meta.storedRel, meta.root);
        if (!abs) return send(res, 404, { error: '文件路径不合法' });
        if (!fs.existsSync(abs)) return send(res, 404, { error: '文件不存在' });
        return sendFile(res, meta.displayName, fs.readFileSync(abs));
      }

      /* 成员提交修改 / 管理操作 */
      if (u.pathname === '/api/action' && req.method === 'POST') {
        const token = req.headers['x-token'] || u.searchParams.get('token');
        const member = memberOf(token);
        if (!member) return send(res, 401, { error: '未加入或已被移除' });
        const body = await readBody(req);
        const type = body && body.type;

        if (type === 'approveRequest') {
          const r = approve(body.requestId, member.id);
          return send(res, r.ok ? 200 : 403, r.ok ? { ok: true, state: state } : { error: r.error });
        }
        if (type === 'rejectRequest') {
          const r = reject(body.requestId, member.id);
          return send(res, r.ok ? 200 : 403, r.ok ? { ok: true, state: state } : { error: r.error });
        }
        if (type === 'leaveTeam') {
          // 主动退出：吊销自己的令牌 + 从成员里移除
          revoke(member.id);
          const changedNow = store.apply(state, { type: 'removeMember', id: member.id }, state.members[0].id);
          if (changedNow) changed('leave');
          return send(res, 200, { ok: true });
        }

        const changedNow = store.apply(state, { ...body }, member.id);
        store.touch(state, member.id);
        if (changedNow) {
          if (type === 'removeMember') revoke(body.id);
          changed(type);
        }
        return send(res, 200, { ok: true, changed: changedNow, state: state });
      }

      if (u.pathname === '/api/info') {
        return send(res, 200, {
          app: 'tdlvv',
          board: state.boardName,
          owner: store.displayName(state.members[0])
        });
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      return send(res, 400, { error: String(err && err.message ? err.message : err) });
    }
  });

  server.on('error', (err) => {
    if (typeof opts.onError === 'function') opts.onError(err);
  });

  server.listen(opts.port || 0, '0.0.0.0', () => {
    if (typeof opts.onListen === 'function') opts.onListen(server.address().port);
  });

  return {
    server,
    get port() {
      const a = server.address();
      return a && a.port ? a.port : 0;
    },
    close() {
      try {
        server.close();
      } catch (e) {
        /* ignore */
      }
    },
    approve,
    reject,
    revoke,
    issueDeviceCode,
    ensureDeviceCode,
    setDeviceCode,
    resetDeviceCode,
    getDeviceCodes() {
      return Object.fromEntries(memberCodes);
    },
    get memberCount() {
      return state.members.length;
    },
    tokensMap: tokens
  };
}

module.exports = { startHost, BEACON_PORT };
