'use strict';
// 主机模式下的极简 HTTP 服务：局域网直连 + 公网隧道都走它（v3：角色权限）
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const fileStore = require('./files');

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
 * @param {string} opts.viewerCode     持久化的查看者设备码（只读身份）
 * @param {function} opts.onViewerCode 查看者设备码变化回调（落盘）
 * @param {object} opts.files          任务文件存储（src/files.js 的 createStore 实例）
 * @param {function} opts.onChange     状态变化回调（落盘 + 刷新界面）
 * @param {function} opts.onTokens     令牌变化回调（落盘）
 */
function startHost(opts) {
  const state = opts.state;
  const files = opts.files;

  function mirrorMemberFile(task, meta) {
    if (!task || !meta || !meta.storedRel || !files || !files.root) return;
    const wanted = task.folderRel || fileStore.taskFolderRel(state.boardId, task.text, task.id);
    const rel = fileStore.ensureTaskFolder(files.root, wanted, task.id);
    if (rel) task.folderRel = rel;
    const src = files.resolve(meta.storedRel, meta.root);
    if (!src || !fs.existsSync(src)) return;
    const dst = path.join(files.root, task.folderRel, fileStore.safeName(meta.displayName || '任务文件'));
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    } catch (e) { /* ignore */ }
  }
  const tokens = new Map(Object.entries(opts.tokens || {})); // token -> memberId（查看者用特殊前缀）
  const results = new Map(); // requestId -> {status, token, memberId, at}
  const lastSeenAt = new Map();
  const memberCodes = new Map(Object.entries(opts.deviceCodes || {}).filter(([, code]) => typeof code === 'string' && code));
  const VIEWER_ID = '__viewer__'; // 查看者的虚拟成员 id（只读，不在 members 列表里）
  let viewerCode = String(opts.viewerCode || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);

  // 启动时合并历史遗留的同名幽灵成员（同一人断连重进留下的重复 id），
  // 并把 token / 设备码迁到保留 id，避免「一个离线一个在线」和统计分母错乱。
  function migrateDuplicateMembers() {
    const map = store.mergeDuplicateMembers(state);
    const ids = Object.keys(map);
    if (!ids.length) return false;
    for (const [tok, id] of tokens) {
      if (map[id]) tokens.set(tok, map[id]);
    }
    for (const [oldId, code] of memberCodes) {
      if (map[oldId]) {
        memberCodes.delete(oldId);
        memberCodes.set(map[oldId], code);
      }
    }
    // 已退出列表里的旧 id 也一并换掉，避免复活时又生成幽灵
    if (Array.isArray(state.leftMembers)) {
      state.leftMembers.forEach((m) => { if (m && map[m.id]) m.id = map[m.id]; });
    }
    state.rev++;
    persistTokens();
    persistCodes();
    changed('merge-members');
    return true;
  }

  function isViewer(member) {
    return !!member && member.id === VIEWER_ID;
  }
  function viewerMember() {
    return { id: VIEWER_ID, name: '查看者', avatar: '👀', role: 'viewer', online: true };
  }

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
    } while ([...memberCodes.values()].includes(code) || code === viewerCode);
    return code;
  }
  function ensureViewerCode() {
    if (viewerCode) return viewerCode;
    viewerCode = makeUniqueCode();
    if (typeof opts.onViewerCode === 'function') opts.onViewerCode(viewerCode);
    return viewerCode;
  }
  function setViewerCode(rawCode) {
    const code = String(rawCode || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
    if (code.length !== 6) return { ok: false, error: '设备码要 6 位数字或字母' };
    if ([...memberCodes.values()].includes(code)) return { ok: false, error: '这个设备码已经被成员使用' };
    viewerCode = code;
    if (typeof opts.onViewerCode === 'function') opts.onViewerCode(viewerCode);
    return { ok: true, code };
  }
  function resetViewerCode() {
    const code = makeUniqueCode();
    viewerCode = code;
    if (typeof opts.onViewerCode === 'function') opts.onViewerCode(viewerCode);
    return { ok: true, code };
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
    if (code === viewerCode) return { ok: false, error: '这个设备码已经被查看者使用' };
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
  // 静默检测成员在群状态：定时把超时未心跳的成员标记为离线并推送。
  // touch 本身不改 rev、不触发推送，所以这里主动提升 rev 让所有客户端同步。
  function scanPresence() {
    if (store.expirePresence(state)) {
      state.rev = (Number(state.rev) || 0) + 1;
      changed('presence');
    }
  }
  // 成员心跳：节流刷新 lastSeen；从离线恢复时提升 rev 让界面同步上线状态
  function heartbeat(memberId, now = Date.now()) {
    const last = lastSeenAt.get(memberId) || 0;
    if (now - last <= 5000) return;
    lastSeenAt.set(memberId, now);
    if (store.touch(state, memberId)) {
      state.rev = (Number(state.rev) || 0) + 1;
      changed('presence');
    }
  }
  function memberOf(token) {
    const id = tokens.get(token);
    if (!id) return null;
    if (id === VIEWER_ID) return viewerMember();
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
      roleTag: m.roleTag || '',
      online: m.role === 'owner' ? true : !!m.online,
      lastSeen: Number(m.lastSeen) || 0
    };
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

  function mobileTaskView(t, member) {
    const creator = state.members.find((m) => m.id === t.creatorId);
    const ids = Array.isArray(t.assigneeIds) && t.assigneeIds.length ? t.assigneeIds : (t.assigneeId ? [t.assigneeId] : []);
    const assignees = ids.map((id) => state.members.find((m) => m.id === id)).filter(Boolean);
    const me = member ? store.displayName(member) : '';
    // 个人打勾进度：应完成 = 指派成员（没指派则发布范围内的可见成员）
    const all = state.members || [];
    const eligible = ids.length
      ? all.filter((m) => ids.includes(m.id))
      : all.filter((m) => store.visibleTo(state, t, m.id));
    const by = (t.personalDoneBy && typeof t.personalDoneBy === 'object') ? t.personalDoneBy : {};
    const doneIds = eligible.filter((m) => by[m.id]).map((m) => m.id);
    // 成员提交的文件：创建者/管理员/查看者看全部，成员只看自己+主文件
    const canSeeAll = isViewer(member) || store.isManager(member.role) || t.creatorId === member.id;
    const memberFiles = [];
    Object.keys(t.memberFiles || {}).forEach((mid) => {
      if (!canSeeAll && mid !== member.id) return;
      const brief = fileBrief(t.memberFiles[mid]);
      if (!brief) return;
      const m = state.members.find((x) => x.id === mid);
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
      myDone: !!by[member.id],
      progress: { done: doneIds.length, total: eligible.length, names: doneIds.map((id) => {
        const m = state.members.find((x) => x.id === id);
        return m ? store.displayName(m) : '';
      }).filter(Boolean) }
    };
  }

  function mobileStateBody(member, since) {
    if (since && Number(state.rev) === since) {
      return { ok: true, unchanged: true, rev: state.rev };
    }
    const viewer = isViewer(member);
    const tasks = (state.tasks || [])
      .filter((t) => viewer || store.visibleTo(state, t, member.id))
      .map((t) => mobileTaskView(t, member));
    return {
      ok: true,
      rev: state.rev,
      boardId: state.boardId,
      boardName: state.boardName,
      me: memberView(member),
      viewer,
      members: (state.members || []).map(memberView),
      tasks,
      canPublish: !viewer && store.isManager(member.role),
      canManage: !viewer && store.isManager(member.role),
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
    const token = store.rid(24);
    // 查看者码：只读身份，看得到全部任务和文件
    if (viewerCode && code === viewerCode) {
      tokens.set(token, VIEWER_ID);
      persistTokens();
      return {
        ok: true, token, viewer: true,
        me: memberView(viewerMember()),
        boardId: state.boardId,
        boardName: state.boardName
      };
    }
    const member = codeOwner(code);
    if (!member) return { ok: false, error: '设备码无效，请让创建者检查或重置' };
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
    // 按安装标识复用身份：同一个人断连后重新进群，还是原来的成员 id，不再多出一个同名幽灵
    let member = store.findMemberByClientId(state, req.clientId);
    if (member) {
      store.reviveMember(state, member);
      if (req.name && member.name !== req.name) member.name = String(req.name).slice(0, 12);
      if (req.avatar) member.avatar = req.avatar;
      // 旧 token 全部失效，只保留这次新发的，避免旧连接继续心跳造成状态错乱
      for (const [tok, id] of tokens) if (id === member.id) tokens.delete(tok);
    } else {
      member = store.addMember(state, req.name, req.avatar, req.clientId);
    }
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
        heartbeat(member.id);
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
        const clientId = String(body.clientId || '').trim().slice(0, 64);
        const reqObj = store.addPending(state, name, body.avatar, clientId);
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
        heartbeat(member.id);
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
        if (isViewer(member)) return send(res, 403, { error: '查看者不能上传文件' });
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
          else {
            store.attachMemberFile(state, task.id, member.id, bumped);
            mirrorMemberFile(task, bumped);
          }
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
        if (!isCreator) mirrorMemberFile(task, saved);
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
        const wantMember = String(u.searchParams.get('member') || '');
        if (wantMember) {
          if (wantMember !== member.id && !isViewer(member) && !store.isManager(member.role)) {
            return send(res, 403, { error: '只有创建者、管理员或文件提交者本人能打开这份文件' });
          }
          const memberMeta = store.memberFile(task, wantMember);
          if (!memberMeta || !memberMeta.storedRel) return send(res, 404, { error: '这位成员还没有提交文件' });
          const memberAbs = files.resolve(memberMeta.storedRel, memberMeta.root);
          if (!memberAbs || !fs.existsSync(memberAbs)) return send(res, 404, { error: '文件不存在' });
          return sendFile(res, memberMeta.displayName, fs.readFileSync(memberAbs));
        }
        let meta = task.file;
        if (!isViewer(member) && u.searchParams.get('copy') === '1' && member.id !== task.creatorId) {
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
            mirrorMemberFile(task, saved);
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
        if (isViewer(member)) return send(res, 403, { error: '查看者只能查看，不能修改团队数据' });
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

        const action = { ...body };
        const changedNow = store.apply(state, action, member.id);
        heartbeat(member.id);
        if (changedNow) {
          if (type === 'addTask' && action.createdId && files) {
            const task = store.findTask(state, action.createdId);
            if (task) {
              const wanted = task.folderRel || fileStore.taskFolderRel(state.boardId, task.text, task.id);
              const rel = fileStore.ensureTaskFolder(files.root, wanted, task.id);
              if (rel) task.folderRel = rel;
            }
          }
          if (type === 'removeMember') revoke(body.id);
          changed(type);
        }
        return send(res, 200, {
          ok: true,
          changed: changedNow,
          createdId: type === 'addTask' && action.createdId ? action.createdId : '',
          state: state
        });
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

  // 启动合并 + 定时兜底（有人重新入群后可能产生新的同名成员）
  migrateDuplicateMembers();
  const mergeTimer = setInterval(migrateDuplicateMembers, 60 * 1000);
  if (mergeTimer.unref) mergeTimer.unref();

  // 静默心跳：每 10 秒扫描一次成员在线状态（离线阈值 45 秒）
  const presenceTimer = setInterval(scanPresence, 10000);
  if (presenceTimer.unref) presenceTimer.unref();

  return {
    server,
    get port() {
      const a = server.address();
      return a && a.port ? a.port : 0;
    },
    close() {
      try { clearInterval(mergeTimer); } catch (e) { /* ignore */ }
      try { clearInterval(presenceTimer); } catch (e) { /* ignore */ }
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
    ensureViewerCode,
    getViewerCode() { return viewerCode; },
    setViewerCode,
    resetViewerCode,
    isViewer,
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
