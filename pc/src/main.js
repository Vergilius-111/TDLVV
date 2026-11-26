'use strict';
const { app, BrowserWindow, ipcMain, clipboard, shell, Notification, Tray, Menu, nativeImage, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const { fileURLToPath } = require('url');

const store = require('./store');
const filePaths = require('./filepaths');
const notify = require('./notify');
const persist = require('./persist');
const backup = require('./backup');
const transfer = require('./transfer');
const fileStoreModule = require('./files');
const aiApi = require('./aiapi');
const { startHost, BEACON_PORT } = require('./server');
const { Remote, resolveHost, discoverAll } = require('./client');
const { Tunnel } = require('./tunnel');
const mapping = require('./mapping');

const SHOT = process.argv.includes('--shot');
// 调试用：启动后直接显示窗口（正常启动时命名过就只留托盘，方便调试时找不到窗口）
const SHOW_WINDOW = process.argv.includes('--show-window') || process.env.TDLVV_SHOW_WINDOW === '1';
const IS_DEV = !app.isPackaged;

// 从命令行/调试脚本启动时，控制台窗口一关 stdout 就断了，
// 之后任何 console.log 都会抛 EPIPE，Electron 会弹"主进程发生 JS 错误"的框。
// 这里把这类写失败的报错吞掉，同时不让它变成未捕获异常。
function silenceBrokenPipe(err) {
  return !!err && (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED' || err.code === 'ERR_STREAM_WRITE_AFTER_END');
}
try { process.stdout.on('error', (e) => { if (!silenceBrokenPipe(e)) throw e; }); } catch (e) { /* ignore */ }
try { process.stderr.on('error', (e) => { if (!silenceBrokenPipe(e)) throw e; }); } catch (e) { /* ignore */ }
process.on('uncaughtException', (err) => {
  if (silenceBrokenPipe(err)) return;
  // 其它未捕获异常仍然要让人看到（正式版不给控制台，就用错误框）
  try {
    if (IS_DEV) console.error('uncaughtException', err);
    else dialog.showErrorBox('TDLVV 运行时错误', String((err && err.stack) || err));
  } catch (e) { /* ignore */ }
});
if (process.platform === 'win32') app.setAppUserModelId('com.tasknotes.desktop');
const NEW_USER_DATA = path.join(app.getPath('appData'), 'TDLVV');
const OLD_USER_DATA = path.join(app.getPath('appData'), 'TaskNotes');
const CUSTOM_USER_DATA = process.argv.find((a) => a.startsWith('--user-data-dir='));

// 从 v0.2（TaskNotes）平滑迁到 TDLVV，老数据不丢（测试用的临时 profile 不参与迁移）
if (!CUSTOM_USER_DATA) {
  try {
    const hasNew = fs.existsSync(path.join(NEW_USER_DATA, 'teams.json')) || fs.existsSync(path.join(NEW_USER_DATA, 'board.json'));
    if (!hasNew && fs.existsSync(OLD_USER_DATA)) {
      fs.mkdirSync(NEW_USER_DATA, { recursive: true });
      for (const f of ['board.json', 'tokens.json', 'prefs.json']) {
        const src = path.join(OLD_USER_DATA, f);
        const dst = path.join(NEW_USER_DATA, f);
        if (fs.existsSync(src) && !fs.existsSync(dst)) fs.copyFileSync(src, dst);
      }
    }
  } catch (e) {
    /* ignore */
  }
  app.setPath('userData', NEW_USER_DATA);
}

let win = null;
let userMinimizingUntil = 0;
let userHidingUntil = 0;
let beaconTimer = null;
let beaconSock = null;
let listenSock = null;
let nearbyPruneTimer = null;
let reminderTimer = null;
let inviteTimer = null;
let backupTimer = null;
let dataDirty = false;
const liveNotifications = new Set();

const ctx = {
  named: false,
  myName: (os.userInfo().username || '我').slice(0, 12),
  avatar: store.AVATARS[0],
  theme: 'system',
  fontSize: 'm',
  lang: 'zh',
  pin: false,
  teams: [],
  activeId: 'local',
  pending: null, // 加入申请中 {requestId, baseUrl, code, board, owner}
  nearby: [],
  fired: {}, // 已提醒过的任务 key
  error: '',
  bounds: null, // 记住的窗口位置与大小（展开态）
  autoStart: true,
  notifyTasks: true,
  notifyDue: true,
  aiInstall: false,
  aiGreeted: false
};

let taskFiles = null;
let taskFilesRoot = '';
let aiServer = null;
let aiBridge = null;
const fileStoreCache = new Map(); // 绝对根目录 -> files store

/* ---------------- 存储 ---------------- */
const paths = {
  teams: () => path.join(app.getPath('userData'), 'teams.json'),
  prefs: () => path.join(app.getPath('userData'), 'prefs.json'),
  backups: () => path.join(app.getPath('userData'), 'backups')
};

function initTaskFiles() {
  const installDir = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
  taskFilesRoot = fileStoreModule.pickRoot({ installDir, userData: app.getPath('userData') });
  taskFiles = fileStoreModule.createStore(taskFilesRoot);
  fileStoreCache.set(path.resolve(taskFilesRoot), taskFiles);
  return taskFiles;
}

function storeForRoot(root) {
  const clean = path.resolve(String(root || taskFilesRoot));
  let s = fileStoreCache.get(clean);
  if (!s) {
    s = fileStoreModule.createStore(clean);
    fileStoreCache.set(clean, s);
  }
  return s;
}

function teamFileRoot(t) {
  if (!t) return taskFilesRoot;
  if (t.kind === 'client') return '';
  const root = t.filesRoot || (t.state && t.state.filesRoot) || taskFilesRoot;
  return path.resolve(String(root));
}

/** 稳定的团队文件服务：根目录变化后，旧的 server 引用也能读写新目录 */
function teamFileService(t) {
  return {
    get root() {
      return teamFileRoot(t);
    },
    saveVersion(opts) {
      return storeForRoot(teamFileRoot(t)).saveVersion(opts);
    },
    saveMemberCopy(opts) {
      return storeForRoot(teamFileRoot(t)).saveMemberCopy(opts);
    },
    resolve(rel, root) {
      return storeForRoot(root || teamFileRoot(t)).resolve(rel);
    }
  };
}

function fileMetaRoot(meta, fallback) {
  return filePaths.fileMetaRoot(meta, fallback || taskFilesRoot);
}

function collectFileMetas(state, fallbackRoot = taskFilesRoot) {
  return filePaths.collectFileMetas(state, fallbackRoot);
}

async function copyAllFilesToRoot(state, oldRoot, newRoot) {
  return filePaths.copyAllFilesToRoot(state, oldRoot, newRoot, storeForRoot);
}

function markLegacyFilesRoot(state, oldRoot) {
  return filePaths.markLegacyFilesRoot(state, oldRoot);
}

function startAiBridge() {
  if (aiServer) aiServer.close();
  aiBridge = null;
  const token = store.rid(24);
  aiServer = aiApi.startAiApi({
    token,
    version: app.getVersion(),
    userData: app.getPath('userData'),
    fileRoot: taskFilesRoot,
    taskFileRoot: taskFilesRoot,
    getTeams: () => ctx.teams,
    resolveFile: (rel, root) => storeForRoot(root || taskFilesRoot).resolve(rel),
    onReady: (info) => {
      aiBridge = info;
      if (win && !win.isDestroyed()) push();
    }
  });
}

function storedTeam(t) {
  return {
    id: t.id,
    kind: t.kind,
    name: t.name,
    meId: t.meId,
    code: t.code || '',
    baseUrl: t.baseUrl || '',
    token: t.token || '',
    tokens: t.tokens || {},
    deviceCodes: t.deviceCodes || {},
    seenTaskIds: Array.isArray(t.seenTaskIds) ? t.seenTaskIds.slice(-5000) : null,
    filesRoot: t.filesRoot || '',
    state: t.state
  };
}

function teamsPayload() {
  return { v: 3, activeId: ctx.activeId, teams: ctx.teams.map(storedTeam) };
}

function prefsPayload() {
  return {
    name: ctx.named ? ctx.myName : '',
    named: ctx.named,
    avatar: ctx.avatar,
    theme: ctx.theme,
    fontSize: ctx.fontSize,
    lang: ctx.lang,
    pin: ctx.pin,
    fired: ctx.fired,
    bounds: ctx.bounds || null,
    autoStart: !!ctx.autoStart,
    notifyTasks: !!ctx.notifyTasks,
    notifyDue: !!ctx.notifyDue,
    aiInstall: !!ctx.aiInstall,
    aiGreeted: !!ctx.aiGreeted
  };
}

function backupPayload() {
  return {
    app: 'TDLVV',
    type: 'tdlvv-backup',
    v: 1,
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    activeId: ctx.activeId,
    teams: ctx.teams.map(storedTeam),
    prefs: prefsPayload()
  };
}

function saveTeams() {
  try {
    persist.writeJson(paths.teams(), teamsPayload());
    dataDirty = true;
  } catch (e) {
    console.error('save teams failed', e);
    ctx.error = `保存数据失败：${e.message}`;
    if (win && !win.isDestroyed()) push();
  }
}

function savePrefs() {
  try {
    persist.writeJson(paths.prefs(), prefsPayload());
    dataDirty = true;
  } catch (e) {
    console.error('save prefs failed', e);
    ctx.error = `保存设置失败：${e.message}`;
    if (win && !win.isDestroyed()) push();
  }
}

function backupNow() {
  const name = backup.writeDaily(paths.backups(), backupPayload());
  dataDirty = false;
  return name;
}

function backupBeforeImport() {
  return backup.writeManual(paths.backups(), backupPayload(), '');
}

function startAutoBackup() {
  if (backupTimer) clearInterval(backupTimer);
  try {
    backupNow();
  } catch (e) {
    console.error('startup backup failed', e);
  }
  backupTimer = setInterval(() => {
    if (!dataDirty) return;
    try {
      backupNow();
    } catch (e) {
      console.error('auto backup failed', e);
    }
  }, 30 * 60 * 1000);
  if (backupTimer.unref) backupTimer.unref();
}

function ensureLocal() {
  let local = ctx.teams.find((t) => t.kind === 'local');
  if (!local) {
    local = {
      id: 'local',
      kind: 'local',
      name: '我的任务',
      meId: 'me',
      state: store.createBoard({ name: '我的任务', ownerName: ctx.myName, ownerAvatar: ctx.avatar, kind: 'local' }),
      online: true
    };
    ctx.teams.unshift(local);
  }
  return local;
}

function normalizeState(state) {
  if (!state) return;
  if (!Array.isArray(state.pending)) state.pending = [];
  if (!Array.isArray(state.notices)) state.notices = [];
  if (!Array.isArray(state.templates)) state.templates = [];
  if (!state.filesRoot) state.filesRoot = '';
  (state.members || []).forEach((m, i) => {
    if (!m.avatar) m.avatar = store.AVATARS[i % store.AVATARS.length];
    if (!m.role) m.role = 'member';
    if (m.remark === undefined) m.remark = '';
  });
  (state.tasks || []).forEach((t) => {
    if (t.dueAt === undefined) t.dueAt = 0;
    if (t.remindHours === undefined) t.remindHours = 0;
    if (t.remindAt === undefined) t.remindAt = 0;
    if (t.doneByName === undefined) t.doneByName = '';
    if (t.importedFrom === undefined) t.importedFrom = '';
    if (t.closed === undefined) t.closed = false;
    if (t.closedAt === undefined) t.closedAt = 0;
    if (t.closedByName === undefined) t.closedByName = '';
    if (t.pinned === undefined) t.pinned = false;
    if (t.pinnedAt === undefined) t.pinnedAt = 0;
    if (t.pinnedByName === undefined) t.pinnedByName = '';
    if (t.linkType === undefined) t.linkType = '';
    if (t.linkTarget === undefined) t.linkTarget = '';
    if (!Array.isArray(t.fields)) t.fields = [];
    if (!t.progressBy || typeof t.progressBy !== 'object') t.progressBy = {};
    if (t.file === undefined) t.file = null;
    if (t.pendingFile === undefined) t.pendingFile = null;
    if (!t.memberFiles || typeof t.memberFiles !== 'object') t.memberFiles = {};
  });
}

function applyPrefs(prefs) {
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  if (p.named && p.name) {
    ctx.myName = p.name;
    ctx.named = true;
  }
  if (p.avatar) ctx.avatar = p.avatar;
  if (p.theme) ctx.theme = p.theme;
  if (['s', 'm', 'l'].includes(p.fontSize)) ctx.fontSize = p.fontSize;
  if (['zh', 'en'].includes(p.lang)) ctx.lang = p.lang;
  ctx.pin = !!p.pin;
  ctx.fired = p.fired || {};
  ctx.notifyTasks = p.notifyTasks === undefined ? true : !!p.notifyTasks;
  ctx.notifyDue = p.notifyDue === undefined ? true : !!p.notifyDue;
  ctx.aiInstall = !!p.aiInstall;
  ctx.aiGreeted = !!p.aiGreeted;
}

function validTeamsData(data) {
  return !!data && Array.isArray(data.teams) && data.teams.length > 0;
}

function applyTeamsData(data) {
  ctx.teams = data.teams.map((t) => ({
    id: t.id,
    kind: t.kind,
    name: t.name || '团队',
    meId: t.meId,
    code: t.code || '',
    baseUrl: t.baseUrl || '',
    token: t.token || '',
    tokens: t.tokens || {},
    deviceCodes: t.deviceCodes || {},
    seenTaskIds: Array.isArray(t.seenTaskIds) ? t.seenTaskIds : null,
    filesRoot: t.filesRoot || '',
    state: t.state,
    online: t.kind !== 'client',
    error: '',
    failCount: 0
  }));
  ctx.activeId = data.activeId || 'local';
  ensureLocal();
  ctx.teams.forEach((t) => {
    normalizeState(t.state);
    bootTeam(t);
  });
}

function loadAll() {
  let prefs = {};
  let prefsBad = false;
  try {
    prefs = persist.readJson(paths.prefs()) || {};
  } catch (e) {
    prefs = {};
    prefsBad = true;
  }
  applyPrefs(prefs);
  if (prefs.bounds && typeof prefs.bounds === 'object') ctx.bounds = prefs.bounds;
  ctx.autoStart = prefs.autoStart === undefined ? true : !!prefs.autoStart;

  let data = null;
  let recovered = false;
  const teamsFile = paths.teams();
  const teamsFileExists = fs.existsSync(teamsFile);
  if (teamsFileExists) {
    try {
      const parsed = persist.readJson(teamsFile);
      if (validTeamsData(parsed)) data = parsed;
    } catch (e) {
      /* 主数据损坏，尝试自动备份 */
    }
  }
  if (!data && teamsFileExists) {
    const snap = backup.readLatest(paths.backups());
    if (snap && backup.validate(snap).ok && validTeamsData(snap)) {
      data = snap;
      recovered = true;
      if (prefsBad && snap.prefs) applyPrefs(snap.prefs);
    }
  }
  if (data) {
    applyTeamsData(data);
    if (recovered) {
      ctx.error = '数据文件损坏，已从最近自动备份恢复';
      saveTeams();
    }
    return true;
  }
  if (teamsFileExists) ctx.error = '数据文件损坏，且没有可用的自动备份';

  // 从 v0.2 的 board.json 迁移
  try {
    const old = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'board.json'), 'utf8'));
    if (old && old.myName && !ctx.named) {
      ctx.myName = old.myName;
      ctx.named = true;
    }
    if (old && old.mode === 'host' && old.state) {
      let oldTokens = {};
      try {
        oldTokens = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'tokens.json'), 'utf8')) || {};
      } catch (err) {
        oldTokens = {};
      }
      normalizeState(old.state);
      const t = {
        id: store.rid(8),
        kind: 'host',
        name: old.state.boardName,
        meId: old.me && old.me.id ? old.me.id : store.HOST_ID,
        state: old.state,
        tokens: oldTokens,
        online: true,
        error: '',
        failCount: 0
      };
      ctx.teams.push(t);
    } else if (old && old.remote && old.me) {
      const t = {
        id: store.rid(8),
        kind: 'client',
        name: '团队',
        meId: old.me.id,
        code: old.remote.code || '',
        baseUrl: old.remote.baseUrl || '',
        token: old.remote.token || '',
        state: null,
        online: false,
        error: '',
        failCount: 0
      };
      ctx.teams.push(t);
    }
  } catch (e) {
    /* 首次运行 */
  }
  ensureLocal();
  ctx.teams.forEach((t) => bootTeam(t));
  saveTeams();
  return ctx.teams.length > 1;
}

/* ---------------- 团队启动 ---------------- */
function refreshInviteCodes() {
  let changed = false;
  for (const t of ctx.teams) {
    if (t.kind !== 'host' || !t.state) continue;
    if (!t.state.inviteCode || !t.state.inviteCodeExpiresAt || store.inviteExpired(t.state)) {
      store.issueInvite(t.state);
      changed = true;
    }
  }
  if (changed) {
    saveTeams();
    push();
  }
}

function bootTeam(t) {
  if (t.kind === 'host') bootHostTeam(t);
  else if (t.kind === 'client') startPoll(t);
}

function bootHostTeam(t) {
  if (!t.state) return;
  if (!Array.isArray(t.state.pending)) t.state.pending = [];
  if (!t.state.inviteCode) t.state.inviteCode = store.makeInviteCode();
  const preferredRoot = t.filesRoot || t.state.filesRoot || taskFilesRoot;
  try {
    storeForRoot(preferredRoot);
    t.filesRoot = path.resolve(String(preferredRoot));
  } catch (e) {
    t.filesRoot = taskFilesRoot;
    setError(`团队文件目录不可用，已改用默认目录：${e.message}`);
  }
  t.state.filesRoot = t.filesRoot;
  t.server = startHost({
    state: t.state,
    port: 0,
    tokens: t.tokens || {},
    deviceCodes: t.deviceCodes || {},
    files: teamFileService(t),
    onChange: () => {
      saveTeams();
      push();
    },
    onTokens: (tokens) => {
      t.tokens = tokens;
      saveTeams();
    },
    onDeviceCodes: (codes) => {
      t.deviceCodes = codes;
      saveTeams();
    },
    onError: (err) => setError(`共享服务启动失败：${err.message}`),
    onListen: (port) => {
      t.hostPort = port;
      t.hostAddr = lanAddress();
      saveTeams();
      push();
    }
  });
  setTimeout(() => {
    if (!t.server) return;
    t.hostPort = t.server.port;
    t.hostAddr = lanAddress();
    startBeacon();
    saveTeams();
    push();
    startTunnel(t);
  }, 60);
}

function lanAddress() {
  const nets = os.networkInterfaces();
  let fallback = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(net.address)) return net.address;
        fallback = net.address;
      }
    }
  }
  return fallback;
}

function hostTeams() {
  return ctx.teams.filter((t) => t.kind === 'host' && t.state);
}

function startBeacon() {
  if (!beaconSock) {
    beaconSock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    beaconSock.on('error', () => {});
    beaconSock.bind(() => {
      try {
        beaconSock.setBroadcast(true);
      } catch (e) {
        /* ignore */
      }
    });
  }
  if (beaconTimer) return;
  beaconTimer = setInterval(() => {
    for (const t of hostTeams()) {
      if (!t.hostPort) continue;
      const payload = Buffer.from(
        JSON.stringify({
          app: 'tdlvv',
          code: t.state.inviteCode,
          port: t.hostPort,
          board: t.state.boardName,
          owner: store.displayName(t.state.members[0])
        })
      );
      try {
        beaconSock.send(payload, BEACON_PORT, '255.255.255.255', () => {});
      } catch (e) {
        /* ignore */
      }
    }
  }, 1500);
}

function stopBeacon() {
  if (beaconTimer) clearInterval(beaconTimer);
  beaconTimer = null;
  if (beaconSock) {
    try {
      beaconSock.close();
    } catch (e) {
      /* ignore */
    }
    beaconSock = null;
  }
}

/* ---------------- 局域网发现（只展示，不自动加入） ---------------- */
function startNearby() {
  if (listenSock) return;
  listenSock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  listenSock.on('error', () => {});
  listenSock.on('message', (msg, rinfo) => {
    try {
      const p = JSON.parse(msg.toString());
      if (!p || p.app !== 'tdlvv' || !p.code) return;
      const own = hostTeams().some((t) => t.state.inviteCode === p.code);
      if (own) return;
      const joined = ctx.teams.some((t) => t.kind === 'client' && (t.code === p.code || (t.state && t.state.inviteCode === p.code)));
      if (joined) return;
      const entry = {
        key: `${rinfo.address}:${p.port}:${p.code}`,
        code: String(p.code).toUpperCase(),
        board: p.board || '',
        owner: p.owner || '',
        addr: rinfo.address,
        port: Number(p.port) || 0,
        at: Date.now()
      };
      const exists = ctx.nearby.find((n) => n.key === entry.key);
      if (exists) {
        exists.at = entry.at;
        exists.board = entry.board;
        exists.owner = entry.owner;
      } else {
        ctx.nearby.push(entry);
        push();
      }
    } catch (e) {
      /* ignore */
    }
  });
  listenSock.bind(BEACON_PORT, () => {
    try {
      listenSock.setBroadcast(true);
    } catch (e) {
      /* ignore */
    }
  });
  nearbyPruneTimer = setInterval(() => {
    const before = ctx.nearby.length;
    ctx.nearby = ctx.nearby.filter((n) => Date.now() - n.at < 8000);
    if (before !== ctx.nearby.length) push();
  }, 3000);
}

/* ---------------- 公网隧道 + 邀请码映射 ---------------- */
function startTunnel(t) {
  if (t.tunnel) t.tunnel.stop();
  t.tunnel = new Tunnel({
    onUrl: (url) => {
      t.tunnelUrl = url;
      saveTeams();
      publishMapping(t);
      push();
    },
    onStatus: (s) => {
      t.tunnelState = s.state;
      t.tunnelReason = s.reason || '';
      push();
    }
  });
  t.tunnel.start(t.hostPort);
  if (t.publishTimer) clearInterval(t.publishTimer);
  t.publishTimer = setInterval(() => publishMapping(t), 25 * 60 * 1000);
}

async function publishMapping(t) {
  if (t.kind !== 'host' || !t.state || !t.tunnelUrl) return;
  try {
    await mapping.publish(t.state.inviteCode, {
      u: t.tunnelUrl,
      n: t.state.boardName,
      o: store.displayName(t.state.members[0])
    });
    t.mapState = 'ok';
    t.mapAt = Date.now();
  } catch (e) {
    t.mapState = 'fail';
  }
  push();
}

/* ---------------- 客户端轮询 ---------------- */
function stopPoll(t) {
  if (t.pollTimer) clearInterval(t.pollTimer);
  t.pollTimer = null;
}

function startPoll(t) {
  stopPoll(t);
  t.polling = false;
  t.pollTimer = setInterval(() => refreshTeam(t), 1500);
  refreshTeam(t);
}

async function refreshTeam(t) {
  if (t.kind !== 'client' || !t.baseUrl || t.polling) return;
  t.polling = true;
  const r = new Remote({ baseUrl: t.baseUrl, token: t.token });
  try {
    const res = await r.getStateSince(t.lastRev || 0);
    if (res && res.unchanged) {
      const cameOnline = !t.wasOnline;
      t.online = true;
      t.error = '';
      t.failCount = 0;
      t.wasOnline = true;
      if (Array.isArray(t.seenTaskIds)) {
        if (cameOnline) push();
        return;
      }
      if (t.state) {
        notifyTeamTasks(t, t.state, true);
        saveTeams();
      }
      if (cameOnline) push();
      return;
    }
    const state = res && res.state;
    if (state) {
      const prevRev = t.lastRev;
      const firstSync = !Array.isArray(t.seenTaskIds);
      normalizeState(state);
      t.state = state;
      t.online = true;
      t.error = '';
      t.failCount = 0;
      const me = state.members.find((m) => m.id === t.meId);
      if (!me) t.error = '你已被移出这个团队';
      if (state.rev !== prevRev || firstSync) {
        notifyTeamTasks(t, state, firstSync);
        t.lastRev = state.rev;
        saveTeams();
      }
      if (state.rev !== prevRev || !t.wasOnline) push();
      t.wasOnline = true;
    }
  } catch (e) {
    t.failCount = (t.failCount || 0) + 1;
    if (e.statusCode === 401) {
      t.online = false;
      t.wasOnline = false;
      t.error = '已被移出团队，或团队重置了邀请码';
      push();
    } else if (t.online) {
      t.online = false;
      t.wasOnline = false;
      t.error = '连不上创建者，正在重连…';
      push();
    }
    if (t.failCount % 5 === 0 && t.code) {
      try {
        const found = await resolveHost(t.code, '');
        if (found && found.baseUrl !== t.baseUrl) {
          t.baseUrl = found.baseUrl;
          saveTeams();
        }
      } catch (err) {
        /* ignore */
      }
    }
  } finally {
    t.polling = false;
  }
}

/* ---------------- 加入审批 ---------------- */
let statusTimer = null;

function startJoinStatusPoll() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(checkJoinStatus, 1000);
}

async function checkJoinStatus() {
  if (!ctx.pending) {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = null;
    return;
  }
  const p = ctx.pending;
  try {
    const r = new Remote({ baseUrl: p.baseUrl });
    const s = await r.status(p.requestId);
    if (s.status === 'approved') {
      clearInterval(statusTimer);
      statusTimer = null;
      normalizeState(s.state);
      const team = {
        id: store.rid(8),
        kind: 'client',
        name: s.state.boardName,
        meId: s.me.id,
        code: p.code,
        baseUrl: p.baseUrl,
        token: s.token,
        state: s.state,
        online: true,
        error: '',
        failCount: 0,
        lastRev: s.state.rev
      };
      ctx.teams.push(team);
      ctx.activeId = team.id;
      ctx.pending = null;
      saveTeams();
      startPoll(team);
      push();
    } else if (s.status === 'rejected') {
      ctx.pending = null;
      clearInterval(statusTimer);
      statusTimer = null;
      ctx.error = '创建者拒绝了你的申请';
      push();
    } else if (s.status === 'missing') {
      ctx.pending = null;
      clearInterval(statusTimer);
      statusTimer = null;
      ctx.error = '申请已过期，请重新申请';
      push();
    }
  } catch (e) {
    /* 网络抖动，下次再试 */
  }
}

function deviceLinkBase(t) {
  if (t && t.tunnelUrl && t.tunnelState === 'ready') return t.tunnelUrl.replace(/\/$/, '');
  if (t && t.hostAddr && t.hostPort) return `http://${t.hostAddr}:${t.hostPort}`;
  return '';
}

function parseDeviceLink(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('请粘贴设备登录链接');
  let url;
  try {
    url = new URL(text);
  } catch (e) {
    throw new Error('链接格式不对，请复制创建者电脑生成的完整链接');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('设备登录链接必须是 http 或 https 地址');
  }
  const code = String(url.searchParams.get('code') || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
  if (!code) throw new Error('链接里没有设备码，请重新生成');
  return { baseUrl: url.origin, code };
}

async function loginByDeviceLink(raw) {
  const { baseUrl, code } = parseDeviceLink(raw);
  const remote = new Remote({ baseUrl });
  const login = await remote.deviceLogin(code);
  if (!login || !login.token) throw new Error('设备码无效，请让创建者检查或重置');
  remote.token = login.token;
  const state = await remote.getState();
  if (!state) throw new Error('创建者电脑没有返回团队数据');
  normalizeState(state);
  const me = (state.members || []).find((m) => m.id === (login.me && login.me.id));
  if (!me) throw new Error('登录后找不到这个成员，可能已被移出团队');

  let team = ctx.teams.find((t) => t.kind === 'client' && t.state && t.state.boardId === state.boardId);
  if (!team) {
    team = {
      id: store.rid(8),
      kind: 'client',
      name: state.boardName,
      meId: me.id,
      code: '',
      baseUrl,
      token: login.token,
      state,
      online: true,
      error: '',
      failCount: 0,
      lastRev: state.rev
    };
    ctx.teams.push(team);
  } else {
    team.name = state.boardName;
    team.meId = me.id;
    team.baseUrl = baseUrl;
    team.token = login.token;
    team.state = state;
    team.online = true;
    team.error = '';
    team.failCount = 0;
    team.lastRev = state.rev;
    if (team.pollTimer) {
      clearTimeout(team.pollTimer);
      team.pollTimer = null;
      team.polling = false;
    }
  }
  // 第二台设备登录时，不把已经在桌面端看过的任务再弹一遍
  team.seenTaskIds = notify.visibleTaskIds(state, team.meId).slice(-5000);
  ctx.activeId = team.id;
  saveTeams();
  startPoll(team);
  push();
  return { ok: true, teamId: team.id, name: state.boardName, meId: team.meId };
}

/* ---------------- 视图 ---------------- */
function teamRole(t) {
  if (t.kind === 'local') return 'owner';
  const m = t.state && (t.state.members || []).find((x) => x.id === t.meId);
  return (m && m.role) || 'member';
}

function serializeTeam(t) {
  const state = t.state || null;
  return {
    id: t.id,
    kind: t.kind,
    name: state ? state.boardName : t.name,
    role: teamRole(t),
    meId: t.meId,
    online: t.kind === 'client' ? !!t.online : true,
    error: t.error || '',
    hostAddr: t.hostAddr || '',
    hostPort: t.hostPort || 0,
    tunnelUrl: t.tunnelUrl || '',
    tunnelState: t.tunnelState || 'off',
    mapState: t.mapState || '',
    filesRoot: (t.state && t.state.filesRoot) || (t.kind === 'host' ? t.filesRoot : '') || '',
    state
  };
}

function view() {
  return {
    named: ctx.named,
    myName: ctx.myName,
    avatar: ctx.avatar,
    theme: ctx.theme,
    fontSize: ctx.fontSize,
    lang: ctx.lang,
    fontScale: fontSizeScale(ctx.fontSize),
    pin: ctx.pin,
    autoStart: !!ctx.autoStart,
    notifyTasks: !!ctx.notifyTasks,
    notifyDue: !!ctx.notifyDue,
    shot: SHOT,
    activeId: ctx.activeId,
    error: ctx.error,
    pendingJoin: ctx.pending ? { board: ctx.pending.board, owner: ctx.pending.owner } : null,
    nearby: ctx.nearby.map((n) => ({ code: n.code, board: n.board, owner: n.owner, addr: n.addr, port: n.port })),
    teams: ctx.teams.map(serializeTeam),
    platform: process.platform,
    taskFilesRoot,
    ai: aiBridge ? { ...aiBridge, installPrompt: !!(ctx.aiInstall && !ctx.aiGreeted) } : null
  };
}

function push() {
  if (win && !win.isDestroyed()) win.webContents.send('state', view());
}

function setError(msg) {
  ctx.error = msg;
  push();
}

/* ---------------- 系统通知 ---------------- */
function focusNotifiedTask(teamId, taskId) {
  if (teamById(teamId)) {
    ctx.activeId = teamId;
    saveTeams();
  }
  showWindow();
  push();
  const send = () => {
    if (win && !win.isDestroyed()) win.webContents.send('notification:openTask', { teamId, taskId: taskId || '' });
  };
  setTimeout(send, 120);
}

function sendSystemNotification({ title, body, teamId, taskId }) {
  if (SHOT || !title || !body) return null;
  try {
    if (!Notification.isSupported()) return null;
    const n = new Notification({ title, body, silent: false });
    liveNotifications.add(n);
    const done = () => liveNotifications.delete(n);
    n.on('click', () => {
      done();
      focusNotifiedTask(teamId, taskId || '');
    });
    n.on('close', done);
    n.on('failed', done);
    n.show();
    return n;
  } catch (e) {
    return null;
  }
}

function notifyTeamTasks(t, state, first) {
  const pending = notify.pendingVisible(state, t.meId);
  if (ctx.notifyTasks) {
    if (first) {
      const summary = notify.summaryMessage(t.name || state.boardName, pending.length, ctx.lang);
      if (summary) sendSystemNotification({ ...summary, teamId: t.id });
    } else {
      const fresh = notify.newPendingTasks(state, t.meId, t.seenTaskIds);
      const msg = notify.newTaskMessage(t.name || state.boardName, fresh, t.meId, ctx.lang);
      if (msg) {
        sendSystemNotification({
          title: msg.title,
          body: msg.body,
          teamId: t.id,
          taskId: fresh.length === 1 ? msg.firstTaskId : ''
        });
      }
    }
  }
  t.seenTaskIds = notify.visibleTaskIds(state, t.meId).slice(-5000);
}

/* ---------------- 提醒 ---------------- */
function checkReminders() {
  const now = Date.now();
  for (const t of ctx.teams) {
    if (!t.state) continue;
    for (const task of t.state.tasks || []) {
      if (task.done || !task.remindAt) continue;
      if (!store.visibleTo(t.state, task, t.meId)) continue;
      if (!ctx.notifyDue) continue;
      if (task.remindAt > now || now - task.remindAt > 6 * 3600 * 1000) continue;
      const key = `${t.id}:${task.id}:${task.remindAt}`;
      if (ctx.fired[key]) continue;
      ctx.fired[key] = now;
      const when = task.dueAt ? `截止 ${fmtClock(task.dueAt)}` : `提前 ${task.remindHours} 小时提醒`;
      sendSystemNotification({
        title: `TDLVV · ${t.state.boardName}`,
        body: `${task.text}${when ? `（${when}）` : ''}`,
        teamId: t.id,
        taskId: task.id
      });
    }
  }
  savePrefs();
}

function fmtClock(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- 窗口 ---------------- */
let boundsTimer = null;
let miniOn = false;
let expandedBounds = null;
let dragOffset = null;
let tray = null;
let quitting = false;

function clampWindowBounds(b) {
  try {
    const disp = screen.getDisplayMatching({ x: b.x, y: b.y, width: b.width, height: b.height });
    const a = disp.workArea;
    const width = Math.min(a.width, Math.max(340, b.width));
    const height = Math.min(a.height, Math.max(460, b.height));
    const x = Math.min(Math.max(b.x, a.x), a.x + a.width - width);
    const y = Math.min(Math.max(b.y, a.y), a.y + a.height - height);
    return { x, y, width, height };
  } catch (e) {
    return null;
  }
}

let winBoundsAnim = null;
let miniPendingBounds = null;
let miniCommitTimer = null;
let miniAnim = null;
let mouseIgnored = false;
function setIgnoreMouse(on) {
  if (!win || win.isDestroyed()) return;
  if (mouseIgnored === !!on) return;
  mouseIgnored = !!on;
  try { win.setIgnoreMouseEvents(!!on, { forward: true }); } catch (e) { /* ignore */ }
}
function stopWinBoundsAnim() {
  if (winBoundsAnim) {
    clearTimeout(winBoundsAnim);
    winBoundsAnim = null;
  }
  setIgnoreMouse(false);
}
function holdMouse(ms) {
  if (winBoundsAnim) clearTimeout(winBoundsAnim);
  setIgnoreMouse(true);
  winBoundsAnim = setTimeout(() => {
    winBoundsAnim = null;
    setIgnoreMouse(false);
  }, Math.max(80, ms));
}
// 迷你条和主界面之间不再逐帧改窗口大小（透明窗口 resize 会掉帧），
// 窗口一次到位，内容由渲染层的 clip-path 做 0.5s 展开/收起。
function applyPendingMiniBounds() {
  if (!win || win.isDestroyed() || !miniPendingBounds) return;
  const to = miniPendingBounds;
  miniPendingBounds = null;
  if (miniCommitTimer) {
    clearTimeout(miniCommitTimer);
    miniCommitTimer = null;
  }
  try {
    win.setMinimumSize(320, 88);
    win.setBounds(to);
    miniOn = true;
    ctx.bounds = { ...(expandedBounds || to) };
    savePrefs();
  } catch (e) {
    /* ignore */
  }
  stopWinBoundsAnim();
}

function saveBoundsSoon() {
  if (boundsTimer) clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || miniOn || winBoundsAnim || SHOT) return;
    try {
      const b = win.getBounds();
      ctx.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      expandedBounds = { ...ctx.bounds };
      savePrefs();
    } catch (e) {
      /* ignore */
    }
  }, 400);
}

// 字号档位：小 / 中 / 大（整档上移，大号再新增一档更大的）
const FONT_SCALES = { s: 1.04, m: 1.16, l: 1.32 };
function fontSizeScale(size) {
  return FONT_SCALES[size] || FONT_SCALES.m;
}

function applyFontSize() {
  if (!win || win.isDestroyed()) return;
  const z = (ctx.fontSize === 's' || ctx.fontSize === 'l') ? FONT_SCALES[ctx.fontSize] : FONT_SCALES.m;
  try {
    win.webContents.setZoomFactor(z);
  } catch (e) {
    /* ignore */
  }
}

function togglePin(on) {
  ctx.pin = !!on;
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(ctx.pin, 'floating');
  savePrefs();
  refreshTrayMenu();
  push();
}

function hideFromTaskbar() {
  if (!win || win.isDestroyed() || process.platform !== 'win32') return;
  try {
    win.setSkipTaskbar(true);
  } catch (e) {
    /* ignore */
  }
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  hideFromTaskbar();
  win.focus();
}

function createTray() {
  try {
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '..', 'build', 'icon.png');
    let img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) img = nativeImage.createEmpty();
    tray = new Tray(img.resize({ width: 20, height: 20 }));
    tray.setToolTip('TDLVV 任务便签');
    const menu = Menu.buildFromTemplate([
      { label: '打开便签', click: showWindow },
      { type: 'separator' },
      {
        label: '置顶显示',
        type: 'checkbox',
        checked: !!ctx.pin,
        click: (item) => togglePin(item.checked)
      },
      {
        label: '开机自动启动',
        type: 'checkbox',
        checked: !!ctx.autoStart,
        click: (item) => setAutoStart(item.checked)
      },
      { type: 'separator' },
      {
        label: '退出 TDLVV',
        click: () => {
          quitting = true;
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', showWindow);
  } catch (e) {
    console.error('tray failed', e && e.message);
  }
}

function refreshTrayMenu() {
  if (!tray) return;
  try {
    tray.destroy();
  } catch (e) {
    /* ignore */
  }
  tray = null;
  createTray();
}

function applyAutoStart() {
  if (!app.isPackaged || SHOT) return;
  try {
    app.setLoginItemSettings({ openAtLogin: !!ctx.autoStart, path: process.execPath, args: [] });
  } catch (e) {
    console.error('autostart failed', e && e.message);
  }
}

function setAutoStart(on) {
  ctx.autoStart = !!on;
  savePrefs();
  refreshTrayMenu();
  applyAutoStart();
  push();
  return ctx.autoStart;
}

function recoverMiniWindow() {
  if (!win || win.isDestroyed() || !miniOn || quitting) return;
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.showInactive();
    if (ctx.pin) win.setAlwaysOnTop(true, 'floating');
  } catch (e) {
    /* ignore */
  }
}

function createWindow() {
  const saved = !SHOT && ctx.bounds ? clampWindowBounds(ctx.bounds) : null;
  const shotPos = SHOT && process.env.SHOT_BOUNDS ? JSON.parse(process.env.SHOT_BOUNDS) : null;
  const initialHeight = (shotPos && shotPos.height) || Math.min(680, screen.getPrimaryDisplay().workArea.height);
  win = new BrowserWindow({
    width: (shotPos && shotPos.width) || (saved ? saved.width : 408),
    height: initialHeight,
    x: shotPos ? shotPos.x : (saved ? saved.x : undefined),
    y: shotPos ? shotPos.y : (saved ? saved.y : undefined),
    minWidth: 340,
    minHeight: 460,
    frame: false,
    transparent: true,
    hasShadow: false,
    type: process.platform === 'win32' ? 'toolbar' : undefined,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: process.platform === 'win32',
    backgroundColor: '#00000000',
    title: 'TDLVV',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // 只在调试版（未打包或 --shot）里把渲染层日志打到 stdout；
  // 打包后的正式版没有控制台，写 stdout 反而可能触发 EPIPE
  if (IS_DEV || SHOT) {
    win.webContents.on('console-message', (e, ...args) => {
      try { console.log('RENDERER:', ...args); } catch (err) { /* ignore */ }
    });
    win.webContents.on('preload-error', (e, p, err) => {
      try { console.log('PRELOAD ERROR:', p, err && err.message); } catch (err2) { /* ignore */ }
    });
  }
  let resizeNotifyTimer = null;
  win.on('will-resize', (event, newBounds) => {
    if (!win || win.isDestroyed()) return;
    // 手动拉伸时也不让主界面超出当前屏幕工作区；动画/小条状态下不干预
    if (!miniOn && !winBoundsAnim && newBounds) {
      const safe = clampWindowBounds(newBounds);
      if (safe && (safe.x !== newBounds.x || safe.y !== newBounds.y || safe.width !== newBounds.width || safe.height !== newBounds.height)) {
        event.preventDefault();
        try { win.setBounds(safe); } catch (e) { /* ignore */ }
      }
    }
    win.webContents.send('win:resizing', true);
    clearTimeout(resizeNotifyTimer);
    resizeNotifyTimer = setTimeout(() => {
      if (win && !win.isDestroyed()) win.webContents.send('win:resizing', false);
    }, 2500);
  });
  win.on('resized', () => {
    clearTimeout(resizeNotifyTimer);
    if (win && !win.isDestroyed()) win.webContents.send('win:resizing', false);
    if (!miniOn && !winBoundsAnim) saveBoundsSoon();
  });
  // 按 Win+D / 切换全屏后，Windows 会把工具栏窗口一起最小化；简洁小条自己回来
  win.on('minimize', () => {
    if (Date.now() < userMinimizingUntil) return;
    setTimeout(recoverMiniWindow, 220);
  });
  win.on('hide', () => {
    if (Date.now() < userHidingUntil) return;
    setTimeout(recoverMiniWindow, 220);
  });

  win.once('ready-to-show', () => {
    applyFontSize();
    hideFromTaskbar();
    // 已起过名字：启动后只留后台进程 + 托盘，不弹前台窗口；首次使用才显示起名字界面
    const showOnStart = SHOT || SHOW_WINDOW || !ctx.named;
    if (showOnStart) {
      win.show();
      hideFromTaskbar();
      if (ctx.pin) win.setAlwaysOnTop(true, 'floating');
    } else if (process.platform === 'darwin' && app.dock) {
      try {
        app.dock.hide();
      } catch (e) {
        /* ignore */
      }
    }
    if (SHOT) {
      setTimeout(async () => {
        try {
          if (process.env.SHOT_CLICK) {
            await win.webContents.executeJavaScript(
              `(document.getElementById(${JSON.stringify(process.env.SHOT_CLICK)})||{click(){}}).click()`
            );
            await new Promise((r) => setTimeout(r, 600));
          }
          if (process.env.SHOT_JS) {
            await win.webContents.executeJavaScript(process.env.SHOT_JS);
            await new Promise((r) => setTimeout(r, 700));
          }
          const img = await win.webContents.capturePage();
          const p = path.join(app.getPath('userData'), 'shot.png');
          fs.writeFileSync(p, img.toPNG());
          console.log('SHOT ' + p);
        } catch (e) {
          console.error('shot failed', e);
        }
        app.quit();
      }, 1600);
    }
  });

  win.on('closed', () => {
    win = null;
  });
  win.on('move', saveBoundsSoon);
  win.on('resize', saveBoundsSoon);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* ---------------- IPC ---------------- */
function teamById(id) {
  return ctx.teams.find((t) => t.id === id) || null;
}

function syncLocalProfile() {
  const local = ensureLocal();
  const me = local.state.members.find((m) => m.id === 'me');
  if (me) {
    me.name = ctx.myName;
    me.avatar = ctx.avatar;
    local.state.rev++;
  }
}

function ensureMemberCopy(t, task, member) {
  if (!t || !task || !member) throw new Error('任务或成员不存在');
  if (t.kind === 'local' || task.creatorId === member.id) return task.file;
  const files = teamFileService(t);
  let meta = store.memberFile(task, member.id);
  if (meta) {
    const abs = files.resolve(meta.storedRel, meta.root);
    if (abs && fs.existsSync(abs)) return meta;
  }
  if (!task.file) throw new Error('这条任务还没有原文件');
  const src = files.resolve(task.file.storedRel, task.file.root);
  if (!src || !fs.existsSync(src)) throw new Error('创建者原文件不存在');
  const saved = files.saveMemberCopy({
    boardId: t.state.boardId,
    taskId: task.id,
    originalName: task.file.displayName || '任务文件',
    sourceMemberName: task.file.uploadedByName || '',
    memberId: member.id,
    memberName: store.displayName(member),
    version: (Number(meta && meta.version) || 0) + 1,
    buffer: fs.readFileSync(src)
  });
  store.attachMemberFile(t.state, task.id, member.id, saved);
  saveTeams();
  push();
  return store.memberFile(task, member.id);
}

function saveTaskFile(t, task, member, name, buffer) {
  const files = teamFileService(t);
  const isCreator = t.kind === 'local' || task.creatorId === member.id || !task.file;
  if (isCreator) {
    const last = Math.max(Number(task.file && task.file.version) || 0, Number(task.pendingFile && task.pendingFile.version) || 0);
    const saved = files.saveVersion({
      boardId: t.state.boardId,
      taskId: task.id,
      originalName: name || '任务文件',
      memberName: store.displayName(member),
      version: last + 1,
      buffer
    });
    const changedNow = store.attachFile(t.state, task.id, member.id, saved);
    return { saved, changed: changedNow };
  }
  const existing = store.memberFile(task, member.id);
  const saved = files.saveMemberCopy({
    boardId: t.state.boardId,
    taskId: task.id,
    originalName: name || '任务文件',
    memberId: member.id,
    memberName: store.displayName(member),
    version: (Number(existing && existing.version) || 0) + 1,
    buffer
  });
  const changedNow = store.attachMemberFile(t.state, task.id, member.id, saved);
  return { saved, changed: changedNow };
}

async function applyToTeam(t, type, payload) {  if (!t || !t.state) return { ok: false, error: '这个团队还没数据' };
  if (t.kind === 'local') {
    try {
      const action = { type, ...(payload || {}) };
      const changed = store.apply(t.state, action, 'me');
      if (changed) {
        t.name = t.state.boardName;
        saveTeams();
        push();
      }
      return { ok: true, changed, createdId: action.createdId || '' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  if (t.kind === 'host') {
    try {
      const action = { type, ...(payload || {}) };
      const changed = store.apply(t.state, action, t.meId);
      store.touch(t.state, t.meId);
      if (changed) {
        t.name = t.state.boardName;
        saveTeams();
        push();
        if (type === 'regenerateCode') publishMapping(t);
        if (type === 'removeMember' && t.server) t.server.revoke(payload.id);
      }
      return { ok: true, changed, createdId: action.createdId || '' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  if (!t.online) return { ok: false, error: '当前离线，连上创建者后再操作' };
  try {
    const remote = new Remote({ baseUrl: t.baseUrl, token: t.token });
    const state = await remote.action(type, payload || {});
    normalizeState(state);
    t.state = state;
    t.lastRev = state.rev;
    t.name = state.boardName;
    saveTeams();
    push();
    return { ok: true, changed: true };
  } catch (err) {
    return { ok: false, error: err.message || '操作失败' };
  }
}

/* ---------------- 导出 / 导入 ---------------- */
async function exportData(lang) {
  const text = transfer.dialogStrings(lang);
  const name = `TDLVV-backup-${backup.timeStamp()}.json`;
  const opts = {
    title: text.exportTitle,
    message: text.documents,
    defaultPath: path.join(app.getPath('documents'), name),
    filters: [{ name: text.filter, extensions: ['json'] }]
  };
  const picked = win && !win.isDestroyed()
    ? await dialog.showSaveDialog(win, opts)
    : await dialog.showSaveDialog(opts);
  if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
  try {
    persist.writeJson(picked.filePath, backupPayload(), { mode: 0o600 });
    return { ok: true, name: path.basename(picked.filePath) };
  } catch (e) {
    return { ok: false, error: e.message || '导出失败' };
  }
}

async function importData(lang) {
  const text = transfer.dialogStrings(lang);
  const opts = {
    title: text.importTitle,
    properties: ['openFile'],
    filters: [{ name: text.filter, extensions: ['json'] }]
  };
  const picked = win && !win.isDestroyed()
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts);
  if (picked.canceled || !picked.filePaths || !picked.filePaths[0]) {
    return { ok: false, canceled: true };
  }
  const file = picked.filePaths[0];
  try {
    const st = fs.statSync(file);
    if (st.size > 100 * 1024 * 1024) return { ok: false, error: '备份文件太大' };
  } catch (e) {
    return { ok: false, error: '读取备份文件失败' };
  }
  let data = null;
  try {
    data = persist.readJson(file);
  } catch (e) {
    return { ok: false, error: '不是有效的 TDLVV 备份文件' };
  }
  const res = transfer.applyImport(data, {
    teamsPath: paths.teams(),
    prefsPath: paths.prefs(),
    backupBeforeImport
  });
  if (!res.ok) return res;
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 1200);
  return res;
}

/* ---------------- 客户端文件缓存 ---------------- */
/** 记录：某个任务的本地缓存文件名 + 上次同步时的 mtime/size，用来判断"我改过没" */
let fileSyncMap = null;
function fileSyncFile() {
  return path.join(app.getPath('userData'), 'file-cache', 'sync.json');
}
function fileSync() {
  if (!fileSyncMap) {
    try {
      fileSyncMap = persist.readJson(fileSyncFile()) || {};
    } catch (e) {
      fileSyncMap = {};
    }
  }
  return fileSyncMap;
}
function saveFileSync() {
  try {
    persist.writeJson(fileSyncFile(), fileSync());
  } catch (e) {
    /* 只是缓存元数据，写失败不影响主体 */
  }
}
function fileSyncKey(teamId, taskId) {
  return `${teamId}|${taskId}`;
}
/** 每个任务单独一个缓存目录，避免两条任务同名文件互相覆盖 */
function cacheDirFor(teamId, taskId) {
  return path.join(
    app.getPath('userData'),
    'file-cache',
    fileStoreModule.safeName(String(teamId), 40),
    fileStoreModule.safeName(String(taskId), 40)
  );
}
function readCachedCopy(teamId, taskId) {
  const rec = fileSync()[fileSyncKey(teamId, taskId)];
  if (!rec || !rec.name) return null;
  const abs = path.join(cacheDirFor(teamId, taskId), rec.name);
  if (!fs.existsSync(abs)) return null;
  return { rec, abs };
}
/** 缓存文件是否被本机改过（Excel 保存会换新文件，mtime/size 一定变） */
function cachedCopyChanged(entry) {
  try {
    const st = fs.statSync(entry.abs);
    if (st.size !== Number(entry.rec.size || 0)) return true;
    return Math.round(st.mtimeMs) !== Math.round(Number(entry.rec.mtime) || 0);
  } catch (e) {
    return true;
  }
}
/** 客户端打开任务文件：先把本地改动回传，再取最新副本落盘打开 */
async function openClientTaskFile(t, task, opts) {
  const o = opts || {};
  const key = fileSyncKey(t.id, task.id);
  const dir = cacheDirFor(t.id, task.id);
  fs.mkdirSync(dir, { recursive: true });
  const remote = new Remote({ baseUrl: t.baseUrl, token: t.token });

  if (o.sync !== false) {
    const entry = readCachedCopy(t.id, task.id);
    if (entry && cachedCopyChanged(entry)) {
      let buf = null;
      try {
        buf = fs.readFileSync(entry.abs);
      } catch (err) {
        return { ok: false, error: '文件还开着（或被占用），先保存并关闭再点开' };
      }
      const up = await remote.uploadTaskFile(task.id, entry.rec.name, buf);
      if (!up || !up.ok) return { ok: false, error: (up && up.error) || '同步你上次的修改失败' };
      normalizeState(up.state);
      t.state = up.state;
      t.lastRev = up.state.rev;
      saveTeams();
      push();
    }
  }

  const r = await remote.downloadTaskFile(task.id, true);
  const name = fileStoreModule.safeName(r.name || (task.file && task.file.displayName) || '任务文件');
  const abs = path.join(dir, name);
  try {
    fs.writeFileSync(abs, r.buffer);
  } catch (err) {
    // 文件正被 Office 占用时不要覆盖，直接打开本地这一份
    if (fs.existsSync(abs)) return { ok: true, path: abs, warning: '文件正被占用，已打开本地版本' };
    return { ok: false, error: `写入文件失败：${(err && err.message) || ''}` };
  }
  const st = fs.statSync(abs);
  const mine = (t.state.memberFiles && t.state.memberFiles[t.meId]) || task.file || {};
  // 落盘后的这份内容 = 服务器上的最新副本，所以既作为"未改动"基线
  fileSync()[key] = { name, size: st.size, mtime: st.mtimeMs, version: Number(mine.version) || 0 };
  saveFileSync();
  return { ok: true, path: abs };
}

/** 客户端把本地这份（含未同步的改动）提交成新的成员副本 */
async function submitClientTaskFile(t, task) {
  const remote = new Remote({ baseUrl: t.baseUrl, token: t.token });
  const entry = readCachedCopy(t.id, task.id);
  let up = null;
  if (entry && cachedCopyChanged(entry)) {
    let buf = null;
    try {
      buf = fs.readFileSync(entry.abs);
    } catch (err) {
      return { ok: false, error: '文件还开着（或被占用），先在 Excel 里保存并关闭再提交' };
    }
    up = await remote.uploadTaskFile(task.id, entry.rec.name, buf);
  }
  if (!up) {
    // 本地没有缓存、或内容没变：只让服务器把"已提交"记下来，不重复传内容
    up = await remote.submitTaskFile(task.id);
  }
  if (!up || !up.ok) return { ok: false, error: (up && up.error) || '提交失败' };
  if (up.state) {
    normalizeState(up.state);
    t.state = up.state;
    t.lastRev = up.state.rev;
    saveTeams();
    push();
  }
  const key = fileSyncKey(t.id, task.id);
  if (up.file && fileSync()[key]) {
    fileSync()[key].version = Number(up.file.version) || fileSync()[key].version;
    saveFileSync();
  }
  return { ok: true, file: up.file };
}

/** 打开当前这份文件（不回传、不覆盖），用于弹窗里点文件名"先看看" */
async function previewTaskFile(t, task) {
  if (t.kind === 'client') {
    if (!t.online) return { ok: false, error: '当前离线，连上创建者后再打开文件' };
    const entry = readCachedCopy(t.id, task.id);
    if (entry) {
      const err = await shell.openPath(entry.abs);
      return err ? { ok: false, error: err } : { ok: true, path: entry.abs };
    }
    // 还没打开过：取一份副本到缓存再打开
    return openClientTaskFile(t, task, { sync: false });
  }
  const me = (t.state.members || []).find((m) => m.id === t.meId);
  if (!me) return { ok: false, error: '找不到当前成员' };
  const meta = ensureMemberCopy(t, task, me);
  const abs = teamFileService(t).resolve(meta.storedRel, meta.root);
  if (!abs || !fs.existsSync(abs)) return { ok: false, error: '文件不存在' };
  const err = await shell.openPath(abs);
  return err ? { ok: false, error: err } : { ok: true, path: abs };
}

function registerIpc() {
  ipcMain.handle('get:state', () => view());
  ipcMain.handle('data:export', (e, lang) => exportData(lang));
  ipcMain.handle('data:import', (e, lang) => importData(lang));

  ipcMain.handle('files:pickFolder', async (e, defaultPath) => {
    const opts = {
      title: '选择任务文件存放文件夹',
      defaultPath: String(defaultPath || taskFilesRoot || ''),
      properties: ['openDirectory', 'createDirectory']
    };
    const picked = win && !win.isDestroyed()
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (picked.canceled || !picked.filePaths || !picked.filePaths[0]) return { ok: false, canceled: true };
    return { ok: true, path: path.resolve(picked.filePaths[0]) };
  });

  ipcMain.handle('team:changeFilesRoot', async (e, { teamId, root }) => {
    const t = teamById(teamId);
    if (!t || !t.state) return { ok: false, error: '团队不存在' };
    if (t.kind !== 'host') return { ok: false, error: '只能在创建者电脑上修改文件存放位置' };
    const me = (t.state.members || []).find((m) => m.id === t.meId);
    if (!me || !store.isManager(me.role)) return { ok: false, error: '只有创建者或管理员能修改文件存放位置' };
    const oldRoot = teamFileRoot(t);
    let newRoot;
    try {
      newRoot = filePaths.normalizeStorageRoot(root, taskFilesRoot);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    if (newRoot === oldRoot) return { ok: true, root: newRoot, unchanged: true };
    if (filePaths.pathContains(oldRoot, newRoot)) {
      return { ok: false, error: '新位置不能放在当前团队文件目录里面，请换一个文件夹' };
    }
    const fileCount = collectFileMetas(t.state, oldRoot).length;
    let answer = { response: 0 };
    if (fileCount > 0) {
      const opts = {
        type: 'question',
        title: '修改文件存放位置',
        message: `要把现有 ${fileCount} 个文件复制到新位置吗？`,
        detail: `原位置：${oldRoot}\n新位置：${newRoot}\n\n复制全部文件最稳妥，复制成功后才切换；选择“仅新文件”时，旧任务仍会继续读取原位置。`,
        buttons: ['复制全部文件（推荐）', '仅新文件使用新位置', '取消'],
        defaultId: 0,
        cancelId: 2,
        noLink: true
      };
      answer = win && !win.isDestroyed()
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts);
    }
    if (answer.response === 2) return { ok: false, canceled: true };
    try {
      backupNow();
      if (answer.response === 0 && fileCount > 0) {
        await copyAllFilesToRoot(t.state, oldRoot, newRoot);
      } else if (fileCount > 0) {
        markLegacyFilesRoot(t.state, oldRoot);
      }
      fs.mkdirSync(path.join(newRoot, t.state.boardId), { recursive: true });
      t.filesRoot = newRoot;
      t.state.filesRoot = newRoot;
      t.state.rev = (Number(t.state.rev) || 0) + 1;
      saveTeams();
      push();
      return { ok: true, root: newRoot, copied: answer.response === 0 ? fileCount : 0 };
    } catch (err) {
      return { ok: false, error: `迁移文件失败，原位置未切换：${err.message}` };
    }
  });

  ipcMain.handle('profile:set', async (e, data) => {
    const name = String((data && data.name) || '').trim().slice(0, 12);
    const avatar = String((data && data.avatar) || '').slice(0, 4);
    if (name) ctx.myName = name;
    if (avatar) ctx.avatar = avatar;
    if (ctx.myName) ctx.named = true;
    savePrefs();
    syncLocalProfile();

    // 名字/头像同步到其它团队（失败不阻塞）
    for (const t of ctx.teams) {
      if (t.kind === 'local' || !t.state) continue;
      const me = (t.state.members || []).find((m) => m.id === t.meId);
      if (!me) continue;
      if (name && me.name !== name) {
        applyToTeam(t, 'renameMember', { id: t.meId, name }).catch(() => {});
      }
      if (avatar && me.avatar !== avatar) {
        applyToTeam(t, 'setAvatar', { id: t.meId, avatar }).catch(() => {});
      }
    }
    saveTeams();
    push();
    return { ok: true };
  });

  ipcMain.handle('theme:set', (e, theme) => {
    ctx.theme = ['dark', 'light', 'system'].includes(theme) ? theme : 'system';
    savePrefs();
    push();
    return ctx.theme;
  });

  ipcMain.handle('font:set', (e, size) => {
    ctx.fontSize = ['s', 'm', 'l'].includes(size) ? size : 'm';
    applyFontSize();
    savePrefs();
    push();
    return ctx.fontSize;
  });

  ipcMain.handle('lang:set', (e, lang) => {
    ctx.lang = ['zh', 'en'].includes(lang) ? lang : 'zh';
    savePrefs();
    push();
    return ctx.lang;
  });

  ipcMain.handle('team:create', async (e, { boardName, filesRoot }) => {
    if (!ctx.named) return { ok: false, error: '先填写你的名字' };
    const name = String(boardName || '').trim().slice(0, 20) || '我的团队';
    let root;
    try {
      root = filePaths.normalizeStorageRoot(filesRoot || taskFilesRoot, taskFilesRoot);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    const state = store.createBoard({ name, ownerName: ctx.myName, ownerAvatar: ctx.avatar, kind: 'host' });
    state.filesRoot = root;
    const t = {
      id: store.rid(8),
      kind: 'host',
      name,
      filesRoot: root,
      meId: store.HOST_ID,
      state,
      tokens: {},
      online: true,
      error: '',
      failCount: 0
    };
    try {
      fs.mkdirSync(path.join(root, state.boardId), { recursive: true });
    } catch (err) {
      return { ok: false, error: `创建团队文件目录失败：${err.message}` };
    }
    ctx.teams.push(t);
    ctx.activeId = t.id;
    bootTeam(t);
    saveTeams();
    push();
    return { ok: true, teamId: t.id, filesRoot: root };
  });

  function ownerHost(teamId) {
    const t = teamById(teamId);
    if (!t || t.kind !== 'host' || !t.server) return null;
    if (teamRole(t) !== 'owner') return null;
    return t;
  }

  ipcMain.handle('team:deviceCodes', (e, teamId) => {
    const t = ownerHost(teamId);
    if (!t) return { ok: false, error: '只有创建者能查看设备码' };
    const members = (t.state.members || []).map((m) => ({
      id: m.id,
      name: store.displayName(m),
      avatar: m.avatar || '👤',
      role: m.role || 'member',
      code: t.server.ensureDeviceCode(m.id)
    }));
    saveTeams();
    return { ok: true, members, meId: t.meId };
  });

  ipcMain.handle('team:deviceSetCode', (e, { teamId, memberId, code }) => {
    const t = ownerHost(teamId);
    if (!t) return { ok: false, error: '只有创建者能修改设备码' };
    const r = t.server.setDeviceCode(memberId, code);
    if (r.ok) saveTeams();
    return r;
  });

  ipcMain.handle('team:deviceResetCode', (e, { teamId, memberId }) => {
    const t = ownerHost(teamId);
    if (!t) return { ok: false, error: '只有创建者能重置设备码' };
    const r = t.server.resetDeviceCode(memberId);
    if (r.ok) saveTeams();
    return r;
  });

  ipcMain.handle('team:deviceLink', (e, payload = {}) => {
    const { teamId, memberId } = payload;
    const t = ownerHost(teamId);
    if (!t) return { ok: false, error: '只有创建者能生成设备链接' };
    const code = t.server.ensureDeviceCode(memberId || t.meId);
    if (!code) return { ok: false, error: '找不到这个成员' };
    const base = deviceLinkBase(t);
    if (!base) return { ok: false, error: '还没拿到可访问的地址，等公网通道就绪再试' };
    saveTeams();
    return {
      ok: true,
      url: `${base}/m?code=${encodeURIComponent(code)}`,
      code,
      network: t.tunnelState === 'ready' ? 'tunnel' : 'lan',
      base
    };
  });

  ipcMain.handle('team:deviceLogin', async (e, link) => {
    try {
      return await loginByDeviceLink(link);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || '设备登录失败') };
    }
  });

  ipcMain.handle('team:join', async (e, { code, manual }) => {
    const clean = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (clean.length < 4) return { ok: false, error: '邀请码至少 4 位' };
    if (!String(ctx.myName || '').trim()) return { ok: false, error: '先填写你的名字' };

    const found = await resolveHost(clean, manual || '');
    if (!found) {
      return {
        ok: false,
        error: '没找到这个邀请码：确认创建者开着 App；不同网络也没关系，只要他的公网通道正常；实在不行让他把「公网地址」发你，填到手动地址。'
      };
    }
    try {
      const r = new Remote({ baseUrl: found.baseUrl });
      const res = await r.join(clean, ctx.myName, ctx.avatar);
      ctx.pending = {
        requestId: res.requestId,
        baseUrl: found.baseUrl,
        code: clean,
        board: res.board,
        owner: res.owner
      };
      ctx.error = '';
      startJoinStatusPoll();
      push();
      return { ok: true, pending: true };
    } catch (err) {
      return { ok: false, error: err.message || '加入失败' };
    }
  });

  ipcMain.handle('team:cancelJoin', () => {
    ctx.pending = null;
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = null;
    push();
    return { ok: true };
  });

  ipcMain.handle('team:approve', (e, { teamId, requestId }) => {
    const t = teamById(teamId);
    if (!t || t.kind !== 'host' || !t.server) return { ok: false, error: '共享服务未启动' };
    const r = t.server.approve(requestId, t.meId);
    saveTeams();
    push();
    return r;
  });

  ipcMain.handle('team:reject', (e, { teamId, requestId }) => {
    const t = teamById(teamId);
    if (!t || t.kind !== 'host' || !t.server) return { ok: false, error: '共享服务未启动' };
    const r = t.server.reject(requestId, t.meId);
    saveTeams();
    push();
    return r;
  });

  ipcMain.handle('team:action', async (e, { teamId, type, payload }) => {
    const t = teamById(teamId);
    if (!t) return { ok: false, error: '团队不存在' };
    return applyToTeam(t, type, payload);
  });

  ipcMain.handle('team:switch', (e, id) => {
    if (teamById(id)) {
      ctx.activeId = id;
      saveTeams();
      push();
    }
    return { ok: true };
  });

  ipcMain.handle('team:refresh', async (e, id) => {
    const t = teamById(id);
    if (!t) return { ok: false, error: '团队不存在' };
    if (t.kind === 'client') await refreshTeam(t);
    return { ok: true, view: view() };
  });

  ipcMain.handle('team:leave', async (e, { teamId }) => {
    const t = teamById(teamId);
    if (!t) return { ok: false, error: '团队不存在' };
    if (t.kind === 'local') return { ok: false, error: '自己的任务清单不能退出' };

    if (t.kind === 'client' && t.online) {
      try {
        await new Remote({ baseUrl: t.baseUrl, token: t.token }).leave();
      } catch (err) {
        /* 对方不在线也允许本地退出 */
      }
    }
    stopPoll(t);
    if (t.kind === 'host' && t.server) {
      t.server.close();
      t.server = null;
    }
    if (t.tunnel) t.tunnel.stop();
    if (t.publishTimer) clearInterval(t.publishTimer);
    stopBeacon();

    // 已接收 / 已完成的任务不删，转到「我的任务」里，来源标成团队名，可手动删
    importTasks(t);

    ctx.teams = ctx.teams.filter((x) => x.id !== t.id);
    if (ctx.activeId === t.id) ctx.activeId = 'local';
    saveTeams();
    push();
    return { ok: true };
  });

  ipcMain.handle('clip', (e, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('open:external', (e, url) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return true;
  });

  ipcMain.handle('open:path', async (e, target) => {
    let p = String(target || '').trim();
    if (!p) return { ok: false, error: '路径为空' };
    try {
      if (/^file:\/\//i.test(p)) p = fileURLToPath(p);
      if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = path.join(os.homedir(), p.slice(1));
      if (!path.isAbsolute(p)) return { ok: false, error: '请填写完整路径' };
      if (!fs.existsSync(p)) return { ok: false, error: '路径不存在' };
      const err = await shell.openPath(p);
      return err ? { ok: false, error: err } : { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || '打开路径失败') };
    }
  });

  ipcMain.handle('task:attachFile', async (e, payload) => {
    const { teamId, taskId, name, data } = payload || {};
    const t = teamById(teamId);
    if (!t || !t.state) return { ok: false, error: '团队不存在' };
    const task = (t.state.tasks || []).find((x) => x.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    const buffer = Buffer.from(data || []);
    if (!buffer.length) return { ok: false, error: '文件是空的' };
    if (buffer.length > 200 * 1024 * 1024) return { ok: false, error: '文件不能超过 200MB' };
    const me = (t.state.members || []).find((m) => m.id === t.meId);
    if (!me) return { ok: false, error: '找不到当前成员' };
    try {
      if (t.kind === 'client') {
        if (!t.online) return { ok: false, error: '当前离线，连上创建者后再上传文件' };
        const remote = new Remote({ baseUrl: t.baseUrl, token: t.token });
        const r = await remote.uploadTaskFile(taskId, name, buffer);
        if (!r || !r.ok) return { ok: false, error: (r && r.error) || '上传失败' };
        normalizeState(r.state);
        t.state = r.state;
        t.lastRev = r.state.rev;
        saveTeams();
        push();
        return { ok: true, file: r.file };
      }
      const r = saveTaskFile(t, task, me, name, buffer);
      if (r.changed) {
        saveTeams();
        push();
      }
      return { ok: true, file: r.saved };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || '保存文件失败') };
    }
  });


  ipcMain.handle('task:openFile', async (e, { teamId, taskId }) => {
    const t = teamById(teamId);
    if (!t || !t.state) return { ok: false, error: '团队不存在' };
    const task = (t.state.tasks || []).find((x) => x.id === taskId);
    if (!task || !task.file) return { ok: false, error: '这条任务还没有文件' };
    try {
      let abs = '';
      if (t.kind === 'client') {
        if (!t.online) return { ok: false, error: '当前离线，连上创建者后再打开文件' };
        const r = await openClientTaskFile(t, task, { sync: true });
        if (!r.ok) return r;
        abs = r.path;
      } else {
        const me = (t.state.members || []).find((m) => m.id === t.meId);
        if (!me) return { ok: false, error: '找不到当前成员' };
        const meta = ensureMemberCopy(t, task, me);
        abs = teamFileService(t).resolve(meta.storedRel, meta.root);
      }
      if (!abs || !fs.existsSync(abs)) return { ok: false, error: '文件不存在' };
      const err = await shell.openPath(abs);
      return err ? { ok: false, error: err } : { ok: true, path: abs };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || '打开文件失败') };
    }
  });

  ipcMain.handle('task:previewFile', async (e, { teamId, taskId }) => {
    const t = teamById(teamId);
    if (!t || !t.state) return { ok: false, error: '团队不存在' };
    const task = (t.state.tasks || []).find((x) => x.id === taskId);
    if (!task || !task.file) return { ok: false, error: '这条任务还没有文件' };
    try {
      return await previewTaskFile(t, task);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || '打开文件失败') };
    }
  });

  /** 成员提交自己的文件：优先提交本机刚编辑的这一版，没有缓存就只标记已提交 */
  ipcMain.handle('task:submitFile', async (e, { teamId, taskId }) => {
    const t = teamById(teamId);
    if (!t || !t.state) return { ok: false, error: '团队不存在' };
    const task = (t.state.tasks || []).find((x) => x.id === taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    const me = (t.state.members || []).find((m) => m.id === t.meId);
    if (!me) return { ok: false, error: '找不到当前成员' };
    try {
      if (t.kind === 'client') {
        if (!t.online) return { ok: false, error: '当前离线，连上创建者后再提交' };
        return await submitClientTaskFile(t, task);
      }
      // 主机 / 个人清单：成员副本就在本机，读出来升一个版本
      const meta = ensureMemberCopy(t, task, me);
      const abs = teamFileService(t).resolve(meta.storedRel, meta.root);
      if (!abs || !fs.existsSync(abs)) return { ok: false, error: '找不到你的文件副本' };
      let buf = null;
      try {
        buf = fs.readFileSync(abs);
      } catch (err) {
        return { ok: false, error: '文件还开着（或被占用），先保存并关闭再提交' };
      }
      const saved = teamFileService(t).saveMemberCopy({
        boardId: t.state.boardId,
        taskId: task.id,
        originalName: meta.displayName || '任务文件',
        memberId: me.id,
        memberName: store.displayName(me),
        version: (Number(meta.version) || 0) + 1,
        buffer: buf
      });
      store.attachMemberFile(t.state, task.id, me.id, saved);
      saveTeams();
      push();
      return { ok: true, file: saved };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || '提交失败') };
    }
  });

  ipcMain.handle('files:info', () => ({
    ok: true,
    root: taskFilesRoot,
    defaultRoot: taskFilesRoot,
    teams: ctx.teams.filter((t) => t.kind === 'host').map((t) => ({ id: t.id, name: t.name, filesRoot: teamFileRoot(t) })),
    ai: aiBridge
  }));

  ipcMain.handle('ai:greeted', () => {
    ctx.aiGreeted = true;
    savePrefs();
    push();
    return { ok: true };
  });

  ipcMain.handle('win:pin', (e, on) => {
    togglePin(on);
    return ctx.pin;
  });

  ipcMain.on('win:dragStart', () => {
    if (!win || win.isDestroyed() || miniOn) return;
    try {
      const p = screen.getCursorScreenPoint();
      const b = win.getBounds();
      dragOffset = { x: p.x - b.x, y: p.y - b.y };
    } catch (e) {
      dragOffset = null;
    }
  });

  ipcMain.on('win:dragMove', () => {
    if (!win || win.isDestroyed() || !dragOffset) return;
    try {
      const p = screen.getCursorScreenPoint();
      win.setPosition(Math.round(p.x - dragOffset.x), Math.round(p.y - dragOffset.y));
    } catch (e) {
      /* ignore */
    }
  });

  ipcMain.on('win:dragEnd', () => {
    dragOffset = null;
    saveBoundsSoon();
  });

  ipcMain.handle('win:mini', (e, payload) => {
    if (!win || win.isDestroyed()) return { ok: false };
    const on = !!(payload && payload.on);
    const duration = Math.min(800, Math.max(0, Math.round(Number(payload && payload.duration) || 500)));
    miniAnim = null;
    try {
      if (on) {
        const wasMini = miniOn;
        if (!miniOn) {
          const cur = win.getBounds();
          expandedBounds = { x: cur.x, y: cur.y, width: cur.width, height: cur.height };
          ctx.bounds = { ...expandedBounds };
          miniOn = true;
        }
        const base = expandedBounds || win.getBounds();
        const h = Math.min(720, Math.max(88, Math.round(Number(payload.height) || 140)));
        // 渲染层给的是 CSS 像素偏移，窗口位置是设备像素：按当前缩放换算，
        // 并扣掉 .app 的 1px 边框，收起后任务行才能和裁切区域逐像素对齐
        let zoom = 1;
        try {
          zoom = win.webContents.getZoomFactor() || 1;
        } catch (e) {
          zoom = fontSizeScale(ctx.fontSize);
        }
        const offset = Math.max(0, Math.round(((Number(payload.topOffset) || 0) - 1) * zoom));
        const disp = screen.getDisplayMatching(base);
        const area = disp.workArea;
        const miniY = Math.min(Math.max(base.y + offset, area.y), area.y + area.height - h);
        const to = {
          x: Math.min(Math.max(base.x, area.x), area.x + area.width - base.width),
          y: miniY,
          width: Math.min(base.width, area.width),
          height: h
        };
        miniPendingBounds = to;
        win.setMinimumSize(320, 88);
        if (wasMini) {
          // 已经在小条里：只同步高度，不重复做收起动画
          miniPendingBounds = null;
          win.setBounds(to);
        } else {
          // 收起：窗口先保持主界面大小，渲染层用 clip-path 从上下裁到小条，
          // 裁完后再由 win:miniCommit 一次性缩窗口，避免透明窗口逐帧 resize 掉帧。
          holdMouse(duration + 40);
          if (miniCommitTimer) clearTimeout(miniCommitTimer);
          miniCommitTimer = setTimeout(applyPendingMiniBounds, duration + 120);
        }
      } else if (miniOn) {
        const raw = expandedBounds || ctx.bounds || win.getBounds();
        const target = clampWindowBounds(raw) || raw;
        if (miniCommitTimer) {
          clearTimeout(miniCommitTimer);
          miniCommitTimer = null;
        }
        miniPendingBounds = null;
        miniOn = false;
        stopWinBoundsAnim();
        win.setMinimumSize(340, 460);
        win.setBounds(target);
        expandedBounds = { ...target };
        ctx.bounds = { ...target };
        savePrefs();
        // 窗口已经一次到位；忽略鼠标 0.5s，让渲染层的 clip 动画不挡住桌面点击
        holdMouse(duration + 40);
      }
    } catch (err) {
      console.error('mini failed', err && err.message);
    }
    return { ok: true };
  });

  ipcMain.handle('win:miniCommit', () => {
    applyPendingMiniBounds();
    return { ok: true };
  });
  // 一次性收起/展开：渲染层已经把布局切好，这里同步把窗口搬到目标位置，
  // 中间不留“窗口还是大、内容已经裁掉”的空档，所以不会闪。
  // 收起动画：渲染层每帧给一个进度，这里把窗口上下边同时往里收，
  // 这样看到的是“窗口在缩小”，不会出现内容被裁掉、桌面从中间透出来的空洞。
  ipcMain.on('win:miniBegin', (e, payload) => {
    try {
      if (!win || win.isDestroyed()) {
        e.returnValue = { ok: false };
        return;
      }
      if (!miniOn) {
        const cur = win.getBounds();
        expandedBounds = { x: cur.x, y: cur.y, width: cur.width, height: cur.height };
        ctx.bounds = { ...expandedBounds };
        miniOn = true;
      }
      const base = expandedBounds || win.getBounds();
      const h = Math.min(720, Math.max(88, Math.round(Number(payload && payload.height) || 140)));
      // 顶边下移量由渲染层按设备像素算好传过来，两边用同一个整数，
      // 逐帧才能和内容的反向位移精确抵消，字不会上下抖
      const topDev = Math.max(0, Math.round(Number(payload && payload.topDev) || 0));
      miniAnim = { base, topDev, targetH: h, botDev: Math.max(0, base.height - h - topDev) };
      win.setMinimumSize(320, 88);
      if (miniCommitTimer) {
        clearTimeout(miniCommitTimer);
        miniCommitTimer = null;
      }
      miniPendingBounds = null;
      e.returnValue = { ok: true };
    } catch (err) {
      console.error('miniBegin failed', err && err.message);
      e.returnValue = { ok: false };
    }
  });

  // 这里不再靠“每帧报进度”，而是每帧直接告诉主进程窗口上/下边要收进来多少（设备像素），
  // 渲染层同时把卡片用负偏移顶出去，卡片在屏幕上是不动的，所以窗口怎么收内容都不会位移。
  ipcMain.on('win:miniStep', (e, payload) => {
    try {
      if (!win || win.isDestroyed()) {
        e.returnValue = { ok: false };
        return;
      }
      if (!miniOn) {
        const cur = win.getBounds();
        expandedBounds = { x: cur.x, y: cur.y, width: cur.width, height: cur.height };
        ctx.bounds = { ...expandedBounds };
        miniOn = true;
      }
      const base = expandedBounds || win.getBounds();
      const t = Math.max(0, Math.round(Number(payload && payload.topDev) || 0));
      const b = Math.max(0, Math.round(Number(payload && payload.botDev) || 0));
      win.setMinimumSize(320, 88);
      win.setBounds({
        x: base.x,
        y: base.y + t,
        width: base.width,
        height: Math.max(88, base.height - t - b)
      });
      e.returnValue = { ok: true };
    } catch (err) {
      console.error('miniStep failed', err && err.message);
      e.returnValue = { ok: false };
    }
  });

  ipcMain.on('win:miniFrame', (e, payload) => {
    if (!win || win.isDestroyed() || !miniAnim) return;
    const tp = Math.min(1, Math.max(0, Number(payload && payload.tp) || 0));
    const bp = Math.min(1, Math.max(0, Number(payload && payload.bp) || 0));
    const a = miniAnim;
    try {
      win.setBounds({
        x: a.base.x,
        y: a.base.y + Math.round(a.topDev * tp),
        width: a.base.width,
        height: Math.round(a.targetH + a.botDev * (1 - bp))
      });
    } catch (err) {
      /* ignore */
    }
  });

  ipcMain.on('win:miniNow', (e, payload) => {
    try {
      if (!win || win.isDestroyed()) return;
      const on = !!(payload && payload.on);
      miniAnim = null;
      if (on) {
        if (!miniOn) {
          const cur = win.getBounds();
          expandedBounds = { x: cur.x, y: cur.y, width: cur.width, height: cur.height };
          ctx.bounds = { ...expandedBounds };
          miniOn = true;
        }
        const base = expandedBounds || win.getBounds();
        const h = Math.min(720, Math.max(88, Math.round(Number(payload.height) || 140)));
        let zoom = 1;
        try {
          zoom = win.webContents.getZoomFactor() || 1;
        } catch (err) {
          zoom = fontSizeScale(ctx.fontSize);
        }
        const offset = Math.max(0, Math.round(((Number(payload.topOffset) || 0) - 1) * zoom));
        const disp = screen.getDisplayMatching(base);
        const area = disp.workArea;
        const miniY = Math.min(Math.max(base.y + offset, area.y), area.y + area.height - h);
        const to = {
          x: Math.min(Math.max(base.x, area.x), area.x + area.width - base.width),
          y: miniY,
          width: Math.min(base.width, area.width),
          height: h
        };
        if (miniCommitTimer) {
          clearTimeout(miniCommitTimer);
          miniCommitTimer = null;
        }
        miniPendingBounds = null;
        win.setMinimumSize(320, 88);
        win.setBounds(to);
        holdMouse(90);
      } else if (miniOn) {
        const raw = expandedBounds || ctx.bounds || win.getBounds();
        const target = clampWindowBounds(raw) || raw;
        if (miniCommitTimer) {
          clearTimeout(miniCommitTimer);
          miniCommitTimer = null;
        }
        miniPendingBounds = null;
        miniOn = false;
        stopWinBoundsAnim();
        win.setMinimumSize(340, 460);
        win.setBounds(target);
        expandedBounds = { ...target };
        ctx.bounds = { ...target };
        savePrefs();
        holdMouse(90);
      }
    } catch (err) {
      console.error('miniNow failed', err && err.message);
    }
    e.returnValue = { ok: true };
  });
  ipcMain.on('win:miniCommitNow', (e) => {
    applyPendingMiniBounds();
    e.returnValue = { ok: true };
  });

  ipcMain.handle('app:autostart', (e, on) => setAutoStart(on));
  ipcMain.handle('notify:set', (e, data) => {
    const d = data && typeof data === 'object' ? data : {};
    if (typeof d.tasks === 'boolean') ctx.notifyTasks = d.tasks;
    if (typeof d.due === 'boolean') ctx.notifyDue = d.due;
    savePrefs();
    return { ok: true, notifyTasks: ctx.notifyTasks, notifyDue: ctx.notifyDue };
  });
  ipcMain.on('win:min', () => {
    userMinimizingUntil = Date.now() + 900;
    if (win && !win.isDestroyed()) win.minimize();
  });
  ipcMain.on('win:close', () => {
    if (!win || win.isDestroyed()) return;
    userHidingUntil = Date.now() + 900;
    win.hide();
    if (tray && !ctx.trayHinted) {
      ctx.trayHinted = true;
      try {
        tray.displayBalloon({
          title: 'TDLVV 已收进托盘',
          content: '点托盘图标可以打开便签，右键图标可以退出。'
        });
      } catch (e) {
        /* ignore */
      }
    }
  });
  ipcMain.on('app:quit', () => {
    quitting = true;
    app.quit();
  });
}

function importTasks(t) {
  if (!t.state) return;
  const local = ensureLocal();
  const members = t.state.members || [];
  const label = t.state.boardName || t.name || '团队';
  (t.state.tasks || []).forEach((task) => {
    const doneBy = members.find((m) => m.id === task.doneById);
    local.state.tasks.unshift({
      ...task,
      id: store.rid(8),
      creatorId: 'me',
      importedFrom: label,
      doneByName: doneBy ? store.displayName(doneBy) : task.doneByName || ''
    });
  });
  local.state.rev++;
}

/* ---------------- 启动 ---------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(() => {
    registerIpc();
    initTaskFiles();
    createWindow();
    createTray();
    loadAll();
    const aiInstall = process.argv.includes('--ai-installed') || process.env.TDLVV_AI_INSTALL === '1';
    if (aiInstall && !ctx.aiInstall) {
      ctx.aiInstall = true;
      savePrefs();
    }
    startAiBridge();
    startAutoBackup();
    startNearby();
    refreshInviteCodes();
    refreshTrayMenu();
    applyAutoStart();
    reminderTimer = setInterval(checkReminders, 20000);
    inviteTimer = setInterval(refreshInviteCodes, 20000);
    setTimeout(checkReminders, 3000);
    setTimeout(push, 300);
  });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    if (aiServer) {
      try { aiServer.close(); } catch (e) { /* ignore */ }
    }
    if (win && !win.isDestroyed() && !miniOn) {
      try {
        const b = win.getBounds();
        ctx.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
      } catch (e) {
        /* ignore */
      }
    }
    for (const t of ctx.teams) {
      stopPoll(t);
      if (t.server) t.server.close();
      if (t.tunnel) t.tunnel.stop();
      if (t.publishTimer) clearInterval(t.publishTimer);
    }
    if (statusTimer) clearInterval(statusTimer);
    if (beaconTimer) clearInterval(beaconTimer);
    if (nearbyPruneTimer) clearInterval(nearbyPruneTimer);
    if (reminderTimer) clearInterval(reminderTimer);
    if (backupTimer) clearInterval(backupTimer);
    try {
      if (beaconSock) beaconSock.close();
    } catch (e) {
      /* ignore */
    }
    try {
      if (listenSock) listenSock.close();
    } catch (e) {
      /* ignore */
    }
    saveTeams();
    savePrefs();
    if (dataDirty) {
      try { backupNow(); } catch (e) { /* ignore */ }
    }
  });
}

if (IS_DEV) {
  app.on('web-contents-created', (e, contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') contents.openDevTools({ mode: 'detach' });
    });
  });
}
