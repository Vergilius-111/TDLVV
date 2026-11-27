'use strict';
// 数据模型 + 所有状态变更都收敛到这里（v3：多团队 / 角色 / 截止与提醒 / 头像）
const crypto = require('crypto');
const files = require('./files');

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 去掉易混字符 0/O/1/I
const MEMBER_COLORS = ['#E57373', '#4DB6AC', '#7986CB', '#FFB74D', '#4FC3F7', '#AED581', '#BA68C8', '#FF8A65'];
const AVATARS = [
  '🐱', '🐶', '🦊', '🐼', '🐯', '🐸', '🐙', '🐳', '🦉', '🐧',
  '🐰', '🐻', '🐨', '🐵', '🦄', '🐢', '🦋', '🌻', '🍀', '⭐',
];

const HOST_ID = 'host';
const MAX_REMIND_HOURS = 48;
const INVITE_TTL_MS = 10 * 60 * 1000;
// 成员超过这个时间没有任何心跳（state/mobile-state 轮询），静默判定为离线
const PRESENCE_OFFLINE_MS = 45000;

function rid(n = 6) {
  return crypto.randomBytes(16).toString('hex').slice(0, n);
}

function makeInviteCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function issueInvite(state) {
  const now = Date.now();
  state.inviteCode = makeInviteCode();
  state.inviteCodeAt = now;
  state.inviteCodeExpiresAt = now + INVITE_TTL_MS;
  state.rev = (Number(state.rev) || 0) + 1;
  return state.inviteCode;
}

function inviteExpired(state, now = Date.now()) {
  return !!(state && state.inviteCodeExpiresAt && now > Number(state.inviteCodeExpiresAt));
}

function isManager(role) {
  return role === 'owner' || role === 'admin';
}

function createBoard(opts) {
  const o = opts || {};
  const kind = o.kind || 'host';
  const isLocal = kind === 'local';
  return {
    rev: 1,
    boardId: rid(8),
    boardName: o.name || (isLocal ? '我的任务' : '新团队'),
    inviteCode: isLocal ? '' : makeInviteCode(),
    inviteCodeAt: isLocal ? 0 : Date.now(),
    inviteCodeExpiresAt: isLocal ? 0 : Date.now() + INVITE_TTL_MS,
    createdAt: Date.now(),
    kind,
    members: [
      {
        id: isLocal ? 'me' : HOST_ID,
        name: String(o.ownerName || '我').slice(0, 12),
        remark: '',
        avatar: o.ownerAvatar || AVATARS[0],
        color: MEMBER_COLORS[0],
        role: 'owner',
        roleTag: '',
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        online: true
      }
    ],
    pending: [],
    notices: [],
    templates: [],
    tasks: [],
    leftMembers: []
  };
}

/**
 * 静默扫描成员在群状态：超过阈值没心跳的成员标记为离线。
 * 只改 online 字段并返回是否有变化；创建者自己（owner）恒在线。
 * 调用方据此提升 rev / 推送界面。
 */
function expirePresence(state, now = Date.now(), offlineMs = PRESENCE_OFFLINE_MS) {
  let changed = false;
  (state.members || []).forEach((m) => {
    if (m.role === 'owner') {
      if (m.online !== true) { m.online = true; changed = true; }
      return;
    }
    const stale = now - (Number(m.lastSeen) || 0) > offlineMs;
    if (stale && m.online !== false) { m.online = false; changed = true; }
    else if (!stale && m.online !== true) { m.online = true; changed = true; }
  });
  return changed;
}

/** 统一的三态判定：我 / 在线 / 离线 / 已退出（leftMembers 里有同 id 记录） */
function memberPresence(state, member, meId, now = Date.now(), offlineMs = PRESENCE_OFFLINE_MS) {
  if (!member) return 'left';
  if (member.id === meId) return 'me';
  if (member.role === 'owner') return 'online';
  if (member.online === false || now - (Number(member.lastSeen) || 0) > offlineMs) return 'offline';
  return 'online';
}

/** 对外显示的名字：优先备注 */
function displayName(m) {
  if (!m) return '';
  return (m.remark && m.remark.trim()) || m.name;
}

function findTask(state, id) {
  return state.tasks.find((t) => t.id === id) || null;
}

function memberColor(state) {
  return MEMBER_COLORS[state.members.length % MEMBER_COLORS.length];
}

function addPending(state, name, avatar, clientId) {
  const clean = String(name || '').trim().slice(0, 12);
  if (!clean) return null;
  const req = { id: rid(8), name: clean, avatar: avatar || AVATARS[0], createdAt: Date.now() };
  const cid = String(clientId || '').trim();
  if (cid) req.clientId = cid;
  state.pending.push(req);
  // 同一个人重复申请，只保留最新一条：优先按安装标识，没有再按名字
  state.pending = state.pending.filter((p) => {
    const same = cid && p.clientId
      ? p.clientId === cid
      : p.name === clean;
    return !same || p.id === req.id;
  });
  state.rev++;
  return req;
}

function findPending(state, requestId) {
  return (state.pending || []).find((p) => p.id === requestId) || null;
}

function takePending(state, requestId) {
  const req = findPending(state, requestId);
  if (req) {
    state.pending = state.pending.filter((p) => p.id !== requestId);
    state.rev++;
  }
  return req;
}

function addMember(state, name, avatar, clientId) {
  const clean = String(name || '').trim().slice(0, 12);
  if (!clean) return null;
  const m = {
    id: rid(6),
    name: clean,
    remark: '',
    avatar: avatar || AVATARS[0],
    color: memberColor(state),
    role: 'member',
    roleTag: '',
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    online: true
  };
  const cid = String(clientId || '').trim();
  if (cid) m.clientId = cid;
  state.members.push(m);
  state.rev++;
  return m;
}

/** 按安装标识找已有成员（含已退出的），用于重新入群时复用同一个 id，避免幽灵成员 */
function findMemberByClientId(state, clientId) {
  const cid = String(clientId || '').trim();
  if (!cid) return null;
  const inMembers = (state.members || []).find((m) => m && m.clientId === cid);
  if (inMembers) return inMembers;
  const inLeft = (state.leftMembers || []).find((m) => m && m.clientId === cid);
  return inLeft || null;
}

/** 复活一个已退出的成员：移回成员列表、恢复在线；返回实际用的成员对象 */
function reviveMember(state, member) {
  if (!member) return null;
  const left = state.leftMembers || [];
  const idx = left.findIndex((m) => m && m.id === member.id);
  if (idx >= 0) left.splice(idx, 1);
  if (!(state.members || []).some((m) => m && m.id === member.id)) state.members.push(member);
  member.lastSeen = Date.now();
  member.online = true;
  state.rev++;
  return member;
}

/**
 * 合并同名幽灵成员：同一个安装 clientId 相同，或历史遗留同名非创建者成员，
 * 只保留最近活跃的那个，把旧 id 在任务里的引用（指派/完成/个人文件）迁到保留 id。
 * 返回 {oldId: keepId} 映射，供服务端把 token/设备码一并迁移。
 */
function mergeDuplicateMembers(state) {
  const map = {};
  const groups = new Map();
  (state.members || []).forEach((m) => {
    if (!m || m.role === 'owner' || m.id === HOST_ID) return;
    const key = String(m.name || '').trim();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // 只合并"同一身份"的重复：clientId 相同，或至少一方没有 clientId（历史遗留）。
    // 两个都有各自不同 clientId 的同名成员 = 真的是两台不同设备，不能合并。
    const cids = Array.from(new Set(list.map((m) => m.clientId).filter(Boolean)));
    const sameIdentity = cids.length <= 1;
    if (!sameIdentity) continue;
    // 优先保留有 clientId 的；其次保留最近活跃的
    list.sort((a, b) => {
      const ac = a.clientId ? 1 : 0;
      const bc = b.clientId ? 1 : 0;
      if (ac !== bc) return bc - ac;
      return (Number(b.lastSeen) || 0) - (Number(a.lastSeen) || 0);
    });
    const keep = list[0];
    const dups = list.slice(1);
    for (const old of dups) {
      map[old.id] = keep.id;
      remapMemberRefs(state, old.id, keep.id);
    }
    state.members = state.members.filter((m) => !dups.includes(m));
    state.rev++;
  }
  return map;
}

/** 把成员 id 的所有引用从 fromId 改到 toId（幽灵成员合并时用） */
function remapMemberRefs(state, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  (state.tasks || []).forEach((t) => {
    if (Array.isArray(t.assigneeIds)) {
      t.assigneeIds = Array.from(new Set(t.assigneeIds.map((id) => (id === fromId ? toId : id))));
    }
    if (t.assigneeId === fromId) t.assigneeId = toId;
    if (t.doneById === fromId) t.doneById = toId;
    if (t.memberFiles && t.memberFiles[fromId]) {
      if (!t.memberFiles[toId]) t.memberFiles[toId] = t.memberFiles[fromId];
      delete t.memberFiles[fromId];
    }
  });
  if (state.memberFiles && state.memberFiles[fromId]) {
    if (!state.memberFiles[toId]) state.memberFiles[toId] = state.memberFiles[fromId];
    delete state.memberFiles[fromId];
  }
}

function touch(state, memberId) {
  const m = state.members.find((x) => x.id === memberId);
  if (!m) return false;
  const wasOffline = m.online === false;
  m.lastSeen = Date.now();
  m.online = true;
  return wasOffline; // 从离线恢复上线：调用方可据此推送状态变化
}

function clampHours(h) {
  const n = Math.round(Number(h) || 0);
  if (!n) return 0;
  return Math.min(MAX_REMIND_HOURS, Math.max(1, n));
}

/** 截止时间 + 提前 N 小时 → 提醒时间；没有截止时间就按"从现在起 N 小时" */
function computeRemindAt(dueAt, hours) {
  const h = clampHours(hours);
  if (!h) return 0;
  if (dueAt) return Number(dueAt) - h * 3600 * 1000;
  return Date.now() + h * 3600 * 1000;
}

function memberById(state, id) {
  return (state && state.members ? state.members.find((m) => m.id === id) : null) || null;
}

function requireManager(state, actorId, what) {
  const me = memberById(state, actorId);
  if (!me || !isManager(me.role)) throw new Error(what || '只有创建者或管理员可以操作');
  return me;
}

/** 任务内容 / 链接 / 截止时间只有发起人或管理员能改 */
function requireTaskEditor(state, task, actorId, what) {
  const me = memberById(state, actorId);
  if (!(isManager(me && me.role) || task.creatorId === actorId)) throw new Error(what);
  return me;
}

function cleanRoleTag(v) {
  return String(v || '').replace(/^#+/, '').trim().slice(0, 8);
}

/** 模板字段：最多 20 行；字段名 20 字，值 300 字 */
function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => ({
      label: String((f && f.label) || '').trim().slice(0, 20),
      value: String((f && f.value) || '').trim().slice(0, 300)
    }))
    .filter((f) => f.label || f.value)
    .slice(0, 20);
}

/** 任务附件元信息。文件内容由主进程/主机服务保存，state 里只放相对路径和可选根目录 */
function normalizeFileMeta(meta, member) {
  if (!meta || !meta.storedRel) throw new Error('文件信息不完整');
  const name = String(meta.displayName || meta.name || '任务文件').trim().slice(0, 120);
  const storedRel = String(meta.storedRel || '').replace(/\\/g, '/').slice(0, 500);
  if (!storedRel || storedRel.includes('..')) throw new Error('文件路径不合法');
  return {
    id: String(meta.id || rid(10)),
    displayName: name,
    storedRel,
    root: String(meta.root || '').slice(0, 1000),
    size: Math.max(0, Math.min(500 * 1024 * 1024, Math.floor(Number(meta.size) || 0))),
    ext: String(meta.ext || '').slice(0, 20),
    version: Math.max(1, Math.min(9999, Math.floor(Number(meta.version) || 1))),
    uploadedById: member ? member.id : String(meta.uploadedById || ''),
    uploadedByName: member ? displayName(member) : String(meta.uploadedByName || '').slice(0, 20),
    uploadedAt: Number(meta.uploadedAt) || Date.now()
  };
}

/**
 * 把文件挂到任务上。已有文件时不直接覆盖，先进入 pendingFile，等创建者/管理员确认。
 * 只由主进程/主机文件接口调用，不暴露成远程 action。
 */
function attachFile(state, taskId, memberId, meta) {
  const t = findTask(state, taskId);
  const m = memberById(state, memberId);
  if (!t || !m) throw new Error('任务或成员不存在');
  if (!visibleTo(state, t, memberId)) throw new Error('你看不到这条任务');
  const file = normalizeFileMeta(meta, m);
  const canReplace = state.kind === 'local' || isManager(m.role) || (t.creatorId && t.creatorId === memberId);
  if (t.file && !canReplace) {
    if (t.file.storedRel === file.storedRel) return false;
    t.pendingFile = file;
  } else {
    t.file = file;
    t.pendingFile = null;
  }
  state.rev++;
  return true;
}

/** 成员个人副本：不覆盖创建者原文件，也不进入待审批版本 */
function attachMemberFile(state, taskId, memberId, meta) {
  const t = findTask(state, taskId);
  const m = memberById(state, memberId);
  if (!t || !m) throw new Error('任务或成员不存在');
  if (!visibleTo(state, t, memberId)) throw new Error('你看不到这条任务');
  const file = normalizeFileMeta(meta, m);
  if (!t.memberFiles || typeof t.memberFiles !== 'object') t.memberFiles = {};
  t.memberFiles[m.id] = file;
  state.rev++;
  return true;
}

function memberFile(task, memberId) {
  if (!task || !task.memberFiles) return null;
  return task.memberFiles[memberId] || null;
}

/** 任务的指派成员列表：新数据用 assigneeIds，旧数据的单个 assigneeId 自动兼容 */
function assigneeIdsOf(task) {
  if (!task) return [];
  const out = [];
  const push = (id) => { if (id && !out.includes(id)) out.push(id); };
  if (Array.isArray(task.assigneeIds)) task.assigneeIds.forEach(push);
  else if (task.assigneeId) push(task.assigneeId);
  return out;
}


/** 任务链接：网页或本机路径，只保留一种。空值表示没挂链接 */
function normalizeLink(type, target) {
  const kind = type === 'url' || type === 'path' ? type : '';
  let value = String(target || '').trim().slice(0, 1000);
  if (!kind || !value) return { linkType: '', linkTarget: '' };
  if (kind === 'url') {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
      throw new Error('只能填 http / https 网址');
    }
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    let u;
    try {
      u = new URL(value);
    } catch (e) {
      throw new Error('只能填 http / https 网址');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('只能填 http / https 网址');
    return { linkType: 'url', linkTarget: u.toString() };
  }
  if (!/^(?:[a-zA-Z]:[\\/]|\\\\|\/|~[\\/])/.test(value)) throw new Error('请填写完整路径');
  return { linkType: 'path', linkTarget: value };
}

/**
 * 发布范围：全员 / 按角色 / 部分成员。只有创建者或管理员能指定非全员范围
 */
function normalizeAudience(state, audience, actorId) {
  const all = { type: 'all', roles: [], memberIds: [] };
  if (!audience || !audience.type || audience.type === 'all') return all;
  if (state.kind === 'local') return all;
  const me = memberById(state, actorId);
  if (!isManager(me && me.role)) throw new Error('只有创建者或管理员能指定发布范围');
  const type = audience.type === 'roles' ? 'roles' : 'members';
  if (type === 'roles') {
    const known = new Set(state.members.map((m) => cleanRoleTag(m.roleTag)).filter(Boolean));
    const roles = Array.from(new Set((audience.roles || []).map(cleanRoleTag).filter((r) => known.has(r)))).slice(0, 10);
    if (!roles.length) throw new Error('按角色发布至少要选一个有角色标签的成员');
    return { type, roles, memberIds: [] };
  }
  const ids = new Set(state.members.map((m) => m.id));
  const memberIds = Array.from(new Set((audience.memberIds || []).filter((id) => ids.has(id)))).slice(0, 200);
  if (!memberIds.length) throw new Error('部分发布至少要选一个成员');
  return { type, roles: [], memberIds };
}

/** 某个成员能不能看到这条任务（创建者 / 管理员 / 任务发起人始终可见） */
function visibleTo(state, task, memberId) {
  if (!state || state.kind === 'local') return true;
  const a = task && task.audience;
  if (!a || !a.type || a.type === 'all') return true;
  const me = memberById(state, memberId);
  if (!me) return false;
  if (isManager(me.role)) return true;
  if (task.creatorId && task.creatorId === memberId) return true;
  if (a.type === 'members') return (a.memberIds || []).includes(memberId);
  const tag = cleanRoleTag(me.roleTag);
  return !!tag && (a.roles || []).includes(tag);
}

/**
 * 执行一个动作。返回 true 表示状态有变化（需要广播/落盘）
 * 权限不足时 throw Error（调用方转成提示）
 */
function apply(state, action, actorId) {
  if (!action || !state) return false;
  const type = action.type;

  switch (type) {
    case 'addTask': {
      const text = String(action.text || '').trim();
      if (!text) return false;
      if (state.kind !== 'local') {
        const me = memberById(state, actorId);
        if (!isManager(me && me.role)) throw new Error('只有创建者或管理员能新增任务');
      }
      const dueAt = Number(action.dueAt) || 0;
      const remindHours = clampHours(action.remindHours);
      const audience = normalizeAudience(state, action.audience, actorId);
      const link = normalizeLink(action.linkType, action.linkTarget);
      const fields = normalizeFields(action.fields);
      const newId = rid(8);
      action.createdId = newId;
      // 个人清单里的任务没有指派概念，只有团队任务才允许带指派对象（可多选）
      const assigneeIds = [];
      if (state.kind !== 'local') {
        const raw = Array.isArray(action.assigneeIds)
          ? action.assigneeIds
          : (action.assigneeId ? [action.assigneeId] : []);
        raw.forEach((id) => {
          if (!id || assigneeIds.includes(id)) return;
          if (!memberById(state, id)) throw new Error('指派对象不存在');
          if (!visibleTo(state, { audience }, id)) throw new Error('这个成员看不到这条任务');
          assigneeIds.push(id);
        });
      }
      state.tasks.unshift({
        id: newId,
        text,
        assigneeIds: assigneeIds.slice(),
        assigneeId: assigneeIds[0] || '',
        creatorId: actorId,
        createdAt: Date.now(),
        done: false,
        doneAt: 0,
        doneById: '',
        doneByName: '',
        closed: false,
        closedAt: 0,
        closedByName: '',
        pinned: false,
        pinnedAt: 0,
        pinnedByName: '',
        dueAt,
        remindHours,
        remindAt: computeRemindAt(dueAt, remindHours),
        importedFrom: '',
        audience,
        linkType: link.linkType,
        linkTarget: link.linkTarget,
        fields,
        personalDoneBy: {},
        folderRel: files.taskFolderRel(state.boardId, text, newId),
        file: null,
        pendingFile: null,
        memberFiles: {}
      });
      break;
    }
    /** 个人页面的打勾：只记自己的完成时间，不改团队任务的整体状态 */
    case 'togglePersonalDone': {
      const t = findTask(state, action.id);
      if (!t) return false;
      const me = memberById(state, actorId);
      if (!me) throw new Error('找不到当前成员');
      if (!visibleTo(state, t, actorId)) throw new Error('你看不到这条任务');
      if (!t.personalDoneBy || typeof t.personalDoneBy !== 'object') t.personalDoneBy = {};
      if (t.personalDoneBy[actorId]) delete t.personalDoneBy[actorId];
      else t.personalDoneBy[actorId] = Date.now();
      break;
    }
    case 'toggleTask': {
      const t = findTask(state, action.id);
      if (!t) return false;
      if (state.kind !== 'local') {
        const me = memberById(state, actorId);
        const own = !!me && assigneeIdsOf(t).includes(actorId);
        if (!isManager(me && me.role) && !own) {
          throw new Error('只有创建者、管理员，或被指派的成员能标记完成');
        }
      }
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : 0;
      const m = memberById(state, actorId);
      t.doneById = t.done ? actorId : '';
      t.doneByName = t.done && m ? displayName(m) : '';
      if (t.done) t.remindAt = 0;
      break;
    }
    case 'setMemberStats': {
      const me = memberById(state, actorId);
      if (!me) return false;
      const total = Math.max(0, Math.min(100000, Math.floor(Number(action.total) || 0)));
      const open = Math.max(0, Math.min(total, Math.floor(Number(action.open) || 0)));
      if (me.stats && me.stats.total === total && me.stats.open === open) return false;
      me.stats = { total, open, at: Date.now() };
      break;
    }
    case 'acceptFileUpdate': {
      const t = findTask(state, action.id);
      if (!t) return false;
      requireManager(state, actorId, '只有创建者或管理员能确认文件更新');
      if (!t.pendingFile) return false;
      t.file = t.pendingFile;
      t.pendingFile = null;
      break;
    }
    case 'rejectFileUpdate': {
      const t = findTask(state, action.id);
      if (!t) return false;
      requireManager(state, actorId, '只有创建者或管理员能拒绝文件更新');
      if (!t.pendingFile) return false;
      t.pendingFile = null;
      break;
    }
    case 'saveTemplate': {
      if (state.kind === 'local') throw new Error('个人清单不保存团队模板');
      requireManager(state, actorId, '只有创建者或管理员能保存任务模板');
      const name = String(action.name || '').trim().slice(0, 20);
      const fields = normalizeFields(action.fields);
      if (!name) throw new Error('模板名称不能为空');
      if (!fields.length) throw new Error('模板至少要有 1 行字段');
      const id = action.id || '';
      const old = id ? (state.templates || []).find((x) => x.id === id) : null;
      if (old) {
        old.name = name;
        old.fields = fields;
        old.updatedAt = Date.now();
      } else {
        state.templates = state.templates || [];
        if (state.templates.length >= 5) throw new Error('最多保存 5 个任务模板');
        state.templates.unshift({ id: rid(8), name, fields, createdAt: Date.now() });
        state.templates = state.templates.slice(0, 5);
      }
      break;
    }
    case 'deleteTemplate': {
      if (state.kind === 'local') throw new Error('个人清单不保存团队模板');
      requireManager(state, actorId, '只有创建者或管理员能删除任务模板');
      const before = (state.templates || []).length;
      state.templates = (state.templates || []).filter((x) => x.id !== action.id);
      if (state.templates.length === before) return false;
      break;
    }
    case 'editTask': {
      const t = findTask(state, action.id);
      if (!t) return false;
      if (typeof action.text === 'string') {
        requireTaskEditor(state, t, actorId, '只有任务发起人（或管理员）能改任务内容');
        const text = action.text.trim();
        if (!text) return false;
        t.text = text;
      }
      if (Array.isArray(action.assigneeIds) || typeof action.assigneeId === 'string') {
        // 个人清单没有指派；团队指派只有创建者或管理员能做，且对象必须能看到这条任务
        if (state.kind !== 'local') {
          requireManager(state, actorId, '只有创建者或管理员能指派任务');
          const raw = Array.isArray(action.assigneeIds)
            ? action.assigneeIds
            : (action.assigneeId ? [action.assigneeId] : []);
          const want = [];
          raw.forEach((id) => {
            if (!id || want.includes(id)) return;
            if (!memberById(state, id)) throw new Error('指派对象不存在');
            if (!visibleTo(state, t, id)) throw new Error('这个成员看不到这条任务');
            want.push(id);
          });
          if (JSON.stringify(assigneeIdsOf(t)) !== JSON.stringify(want)) {
            t.assigneeIds = want;
            t.assigneeId = want[0] || '';
          }
        }
      }
      if (action.linkType !== undefined) {
        requireTaskEditor(state, t, actorId, '只有任务发起人（或管理员）能改任务链接');
        const link = normalizeLink(action.linkType, action.linkTarget);
        t.linkType = link.linkType;
        t.linkTarget = link.linkTarget;
      }
      if (action.dueAt !== undefined || action.remindHours !== undefined) {
        requireTaskEditor(state, t, actorId, '只有任务发起人（或管理员）能改截止和提醒');
        if (action.dueAt !== undefined) t.dueAt = Number(action.dueAt) || 0;
        if (action.remindHours !== undefined) t.remindHours = clampHours(action.remindHours);
        t.remindAt = computeRemindAt(t.dueAt, t.remindHours);
        t.remindedAt = 0;
      }
      if (action.fields !== undefined) {
        requireTaskEditor(state, t, actorId, '只有任务发起人或管理员能改模板字段');
        t.fields = normalizeFields(action.fields);
      }
      break;
    }
    case 'deleteTask': {
      const t = findTask(state, action.id);
      if (!t) return false;
      const me = requireTaskEditor(state, t, actorId, '只有任务发起人（或管理员）能关闭这条任务');
      // 已完成 / 已关闭的记录、自己清单里的任务：直接删掉
      // 团队里未完成的任务：改为「关闭」，成员那边在已完成里留一条带标签的记录
      if (t.done || t.closed || state.kind === 'local') {
        state.tasks = state.tasks.filter((x) => x.id !== action.id);
      } else {
        t.closed = true;
        t.closedAt = Date.now();
        t.closedByName = me ? displayName(me) : '';
        t.remindAt = 0;
      }
      break;
    }
    case 'pinTask': {
      const t = findTask(state, action.id);
      if (!t) return false;
      const me = memberById(state, actorId);
      // 个人清单随便置顶自己的；团队里的任务只有创建者 / 管理员能置顶
      if (state.kind !== 'local' && !isManager(me && me.role)) {
        throw new Error('团队任务只有创建者或管理员能置顶');
      }
      const on = action.on === undefined ? !t.pinned : !!action.on;
      if (on === !!t.pinned) return false;
      t.pinned = on;
      t.pinnedAt = on ? Date.now() : 0;
      t.pinnedByName = on && me ? displayName(me) : '';
      break;
    }
    case 'addNotice': {
      if (state.kind === 'local') throw new Error('个人清单不发团队通知');
      requireManager(state, actorId, '只有创建者或管理员能发团队通知');
      const text = String(action.text || '').trim().slice(0, 300);
      if (!text) return false;
      const me = memberById(state, actorId);
      state.notices.unshift({
        id: rid(8),
        text,
        authorId: actorId,
        authorName: me ? displayName(me) : '',
        createdAt: Date.now()
      });
      state.notices = state.notices.slice(0, 20);
      break;
    }
    case 'updateNotice': {
      requireManager(state, actorId, '只有创建者或管理员能修改团队通知');
      const notice = (state.notices || []).find((n) => n.id === action.id);
      if (!notice) throw new Error('这条通知已经不存在了');
      const text = String(action.text || '').trim().slice(0, 300);
      if (!text) {
        state.notices = (state.notices || []).filter((n) => n.id !== action.id);
        break;
      }
      if (notice.text === text) return false;
      notice.text = text;
      notice.editedAt = Date.now();
      const me = memberById(state, actorId);
      notice.editorName = me ? displayName(me) : '';
      break;
    }
    case 'deleteNotice': {
      requireManager(state, actorId, '只有创建者或管理员能删团队通知');
      const before = (state.notices || []).length;
      state.notices = (state.notices || []).filter((n) => n.id !== action.id);
      if (state.notices.length === before) return false;
      break;
    }
    case 'renameBoard': {
      requireManager(state, actorId, '只有创建者或管理员能改团队名');
      const name = String(action.name || '').trim().slice(0, 20);
      if (!name) return false;
      state.boardName = name;
      break;
    }
    case 'renameMember': {
      const id = action.id || actorId;
      if (id !== actorId) requireManager(state, actorId, '只有创建者或管理员能改别人的名字');
      const m = state.members.find((x) => x.id === id);
      if (!m) return false;
      const name = String(action.name || '').trim().slice(0, 12);
      if (!name) return false;
      m.name = name;
      break;
    }
    case 'setRemark': {
      requireManager(state, actorId, '只有创建者或管理员能加备注');
      const m = state.members.find((x) => x.id === action.id);
      if (!m) return false;
      m.remark = String(action.remark || '').trim().slice(0, 20);
      break;
    }
    case 'setMemberTag': {
      requireManager(state, actorId, '只有创建者或管理员能设置角色标签');
      const m = state.members.find((x) => x.id === action.id);
      if (!m) return false;
      const tag = cleanRoleTag(action.tag);
      if (tag === (m.roleTag || '')) return false;
      m.roleTag = tag;
      break;
    }
    case 'setAvatar': {
      const id = action.id || actorId;
      if (id !== actorId) requireManager(state, actorId, '不能改别人的头像');
      const m = state.members.find((x) => x.id === id);
      if (!m) return false;
      m.avatar = String(action.avatar || '').slice(0, 4) || AVATARS[0];
      break;
    }
    case 'setRole': {
      const me = requireManager(state, actorId, '只有创建者能任命管理员');
      if (me.role !== 'owner') throw new Error('只有创建者能移交或任命管理员');
      const m = state.members.find((x) => x.id === action.id);
      if (!m || m.role === 'owner') return false;
      const role = action.role === 'admin' ? 'admin' : 'member';
      m.role = role;
      break;
    }
    case 'transferOwner': {
      const me = requireManager(state, actorId, '只有创建者能移交团队');
      if (me.role !== 'owner') throw new Error('只有创建者能移交团队');
      const m = state.members.find((x) => x.id === action.id);
      if (!m || m.id === me.id) return false;
      m.role = 'owner';
      me.role = 'admin';
      break;
    }
    case 'removeMember': {
      requireManager(state, actorId, '只有创建者或管理员能移除成员');
      const idx = state.members.findIndex((m) => m.id === action.id);
      if (idx < 0) return false;
      if (state.members[idx].role === 'owner') throw new Error('创建者不能被移除，只能先移交');
      const removed = state.members[idx];
      // 留一条退出记录，让创建者能看到「某某已退出/被移除」，而不是凭空消失
      if (!Array.isArray(state.leftMembers)) state.leftMembers = [];
      if (!state.leftMembers.some((x) => x.id === removed.id)) {
        state.leftMembers.push({
          id: removed.id,
          name: removed.name || '',
          remark: removed.remark || '',
          avatar: removed.avatar || '',
          role: removed.role || 'member',
          roleTag: removed.roleTag || '',
          leftAt: Date.now()
        });
      }
      state.members.splice(idx, 1);
      break;
    }
    case 'regenerateCode': {
      requireManager(state, actorId, '只有创建者或管理员能重置邀请码');
      issueInvite(state);
      break;
    }
    case 'clearDone': {
      requireManager(state, actorId, '只有创建者或管理员能清理已完成');
      state.tasks = state.tasks.filter((t) => !t.done);
      break;
    }
    default:
      return false;
  }
  state.rev++;
  return true;
}

/**
 * 同名团队去重：在保留 keepId 团队的前提下，找出所有同名的 client 团队。
 * 场景：成员被移出/退出后重新加入创建人的同名团队，旧的本地记录没删，
 * 切换栏会出现两个同名团队。加入新团队时调用，只留最新加入的那个。
 * 纯函数：不修改入参，返回 { teams, removed }，由调用方负责清理被移除团队的资源。
 */
function dedupeTeamsByName(teams, name, keepId) {
  const key = String(name || '').trim();
  if (!key || !Array.isArray(teams)) return { teams, removed: [] };
  const removed = teams.filter(
    (t) => t.id !== keepId && t.kind === 'client' && String(t.name || '').trim() === key
  );
  if (!removed.length) return { teams, removed: [] };
  return { teams: teams.filter((t) => !removed.includes(t)), removed };
}

module.exports = {
  AVATARS,
  dedupeTeamsByName,
  HOST_ID,
  PRESENCE_OFFLINE_MS,
  expirePresence,
  memberPresence,
  rid,
  makeInviteCode,
  issueInvite,
  inviteExpired,
  createBoard,
  findTask,
  addPending,
  findPending,
  takePending,
  addMember,
  findMemberByClientId,
  reviveMember,
  mergeDuplicateMembers,
  remapMemberRefs,
  touch,
  apply,
  displayName,
  isManager,
  cleanRoleTag,
  normalizeAudience,
  normalizeFields,
  normalizeFileMeta,
  attachFile,
  attachMemberFile,
  memberFile,
  assigneeIdsOf,
  visibleTo,
  clampHours,
  computeRemindAt
};
