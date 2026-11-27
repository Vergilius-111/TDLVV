'use strict';
(() => {
const api = window.api;

const el = {};
[
  'app','brandBtn','brandName','brandGear','myAvatarMini','subTitle','btnAddTeam','btnPin','reqBadge','btnMin','btnClose',
  'teamTabs','banner','tasks','doneBar','doneCount','addBar','targetChip','audienceChip','dueBtn','newTask','btnAddTask','btnMiniNow',
  'linkEditor','linkEditorTitle','linkEditorHint','linkEditorClose','linkInput','linkClear','linkSave','linkUrlBtn','linkPathBtn','fileChip','templateBtn',
  'noticeBar','noticeTeamName','btnNotice','btnInvite','noticeList','noticePanel','noticeClose','noticeText','noticeSave','noticeTitle',
  'taskEditPanel','taskEditClose','taskEditText','taskEditCancel','taskEditSave','taskEditTitle',
  'taskEditLinkUrl','taskEditLinkPath','taskEditLinkClear','taskEditLinkStatus','taskEditLinkRow','taskEditLinkInput','taskEditLinkOk','taskEditLinkLabel','taskEditLinkBlock',
  'taskSubmitRow','taskSubmitBtn','taskFieldsBox','taskFieldsList','taskFileBox','taskFileName','taskFileHint','taskFileOpen','taskFileUpload','taskFileFolder','taskMemberFiles',
  'attachPanel','attachClose','attachTitle','attachSub','attachDrop','attachInput','attachInfo','attachSave','attachCancel','attachPick',
  'templatePanel','templateClose','templateName','templateRows','templateAddRow','templateSaved','templateCount','templateNew','templateSave','templateCancel',
  'noticeView','noticeViewClose','noticeViewBody','noticeViewMeta',
  'invitePanel','inviteClose','inviteTitle','inviteSub','inviteCodeLine','inviteCodeTimer','inviteCopy','inviteRegen','inviteNetBox',
  'namePanel','nameAvatar','avatarGrid','nameInput','btnNameOk',
  'teamsPanel','teamsClose','profileAvatar','profileAvatarPick','myNameInput','saveName','themeSeg','fontSeg','langSeg','autoStartChk','notifyTaskChk','notifyDueChk',
  'exportDataBtn','importDataBtn','aiBox','aiCopyBtn','versionText','checkUpdateBtn','relayUrlInput','relaySaveBtn',
  'teamCount','teamList','boardNameInput','btnCreate','codeInput','btnJoin','manualHost','teamsErr','nearbyArea','nearbyList',
  'teamFilesPath','teamFilesPick','teamFilesTip',
  'teamPanel','teamClose','teamTitle','teamNameEdit','teamNameInput','teamNameSave','teamMeta','teamFilesBox','teamFilesPathLabel','teamFilesOpen','teamFilesChange','teamFilesNote','inviteBox','codeLine','codeTimer','btnCopy','btnRegen','netBox',
  'deviceBox','btnDeviceLink','deviceLinkText','btnDeviceCopy','deviceLinkNote','deviceKindSeg','deviceMemberPart','deviceViewerPart',
  'deviceMember','deviceCodeInput','btnDeviceSave','btnDeviceReset','deviceCodeHint',
  'viewerCodeInput','btnViewerSave','btnViewerReset','viewerCodeHint',
  'portalCodeInput','btnPortalGen','btnPortalReset','portalLinkText','btnPortalCopy','portalHint',
  'reqArea','reqCount','reqList','memberCount','memberRows','memberProgress','membersTip','btnLeave',
  'memberStatsPanel','memberStatsClose','memberStatsAvatar','memberStatsName','memberStatsSub','memberStatsTotal','memberStatsTotalSub','memberStatsTeam','memberStatsTeamSub','memberStatsHint',
  'donePanel','doneClose','doneTotal','doneSearch','clearSearch','doneAll',
  'duePanel','dueClose','dueTime','clearDue','remindList','dueCancel','dueSave',
  'dueMain','duePickerView','dueCalBtn','calPrev','calNext','calMonth','calWeekdays','calGrid','datePreview','hourWheel','minuteWheel','dateCancel','dateOk',
  'confirmPanel','confirmTitle','confirmBody','confirmNote','confirmCancel','confirmOk',
  'waitPanel','waitSub','btnCancelWait','menu','toast'
].forEach((id) => { el[id] = document.getElementById(id); });

const AVATARS = [
  '🐱', '🐶', '🦊', '🐼', '🐯', '🐸', '🐙', '🐳', '🦉', '🐧',
  '🐰', '🐻', '🐨', '🐵', '🦄', '🐢', '🦋', '🌻', '🍀', '⭐',
];
const ROLE_LABEL = { owner: '创建者', admin: '管理员', member: '成员' };

let S = null;
let editingId = null;
let taskEditCtx = null;
let doneQuery = '';
let openTeamId = null;
const deviceCodes = new Map(); // teamId -> {members, meId}
const deviceSelected = new Map(); // teamId -> memberId
const deviceLinks = new Map(); // `${teamId}:${key}` -> {url,code,network,base}
const viewerCodes = new Map(); // teamId -> code
let deviceKind = 'member'; // 'member' | 'viewer'
let deviceCodeTeamId = '';
let openMemberTeamId = '';
let openMemberId = '';
let pendingTaskFile = null; // 新任务发布前暂存的文件 {name,data,size}
let attachCtx = null; // 文件弹窗上下文 {mode,teamId,taskId,afterComplete}
let attachDraft = null; // 弹窗里已选择的文件
let attachUseCurrent = false; // 提交模式：默认提交当前这份，不重新选文件
let pendingTemplate = null; // 当前发布任务使用的模板 {id,name,fields}
let templateDraft = null;
const promptedFileUpdates = new Set();
let toastTimer = null;
let noticeEditId = '';
let joinBusy = false;
let draftAvatar = '';
let pendingDueAt = 0;
let pendingRemindHours = 0;
let pendingAudience = { type: 'all', roles: [], memberIds: [] };
let pendingLinkType = '';
let pendingLinkTarget = '';
let linkEditType = '';
let linkTeamId = '';
let taskEditLinkType = '';
let taskEditLinkTarget = '';
let taskEditLinkEditing = '';
let audienceMenu = null;
let audienceOutside = null;
let audienceTeamId = '';
let sheet = null; // {mode:'new'|'task', teamId, taskId}
let sheetDue = 0;
let sheetHours = 0;
let pickerDate = null;
let pickerViewMonth = null;
let pickerHour = 0;
let pickerMinute = 0;
const WHEEL_H = 30;
const HOUR_VALUES = Array.from({ length: 25 }, (_, i) => i);
const MINUTE_VALUES = Array.from({ length: 61 }, (_, i) => i);
const WEEK_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const WEEK_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let miniMode = false;
let miniCollapsing = false;
let miniTopOffset = 0;
let miniAppHeight = 0;
let expandedAppHeight = 0;
let expandAnimTimer = null;
let collapseRaf = 0;
let morphDir = null;
let miniTasksOffset = 1;   // 小条布局里任务区离窗口顶部的距离（CSS px），收起结束对齐用
let miniTopDev = 0;         // 收/展开时窗口上边要收进来多少（设备像素）
let miniTargetDev = 0;      // 收起之后小条窗口的高度（设备像素），展开时从这个高度长回去
let collapseTimer = null;
let expandTimer = null;   // 小条移入后的延迟展开，给按住拖动留时间
let dragExpanding = false; // 正在从小条拖动时，不自动展开
let restOnce = false;
let hoverInside = false;
let windowFocused = true;   // 窗口是否处于焦点；失焦时即使鼠标还在窗口内也要自动收成小条
let restSuppressUntil = 0;
let expandSuppressUntil = 0;  // 手动收成迷你条后短暂禁止 hover 自动展开，避免鼠标还压在原位置就立刻弹回
let awaySince = 0;            // 鼠标离开主界面的起始时间，用于「离开满 3 秒自动收起」的兜底心跳
let windowResizing = false;
let edgeHover = false;
let edgeLeaveTimer = null;
let resizeSettleTimer = null;
let inviteClock = null;
let confirmResolver = null;
let confirmDefaultOk = false;
const lastStatsSig = new Map();

/* ---------------- 工具 ---------------- */
function p2(n) { return String(n).padStart(2, '0'); }
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function dateLabel(ts) {
  const k = dateKey(ts);
  const now = new Date();
  if (k === dateKey(now.getTime())) return '今天';
  if (k === dateKey(now.getTime() - 86400000)) return '昨天';
  return `${new Date(ts).getMonth() + 1} 月 ${new Date(ts).getDate()} 日`;
}
function fmtDue(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const k = dateKey(ts);
  const now = new Date();
  const t = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  if (k === dateKey(now.getTime())) return `今天 ${t}`;
  if (k === dateKey(now.getTime() + 86400000)) return `明天 ${t}`;
  if (k === dateKey(now.getTime() - 86400000)) return `昨天 ${t}`;
  return `${d.getMonth() + 1}-${p2(d.getDate())} ${t}`;
}
function dueState(ts) {
  if (!ts) return '';
  const now = Date.now();
  if (ts < now) return 'over';
  if (ts - now < 12 * 3600 * 1000) return 'near';
  return '';
}
function nameOf(m) { return m ? ((m.remark && m.remark.trim()) || m.name) : ''; }
function avatarOf(m) { return (m && m.avatar) || '👤'; }
const PRESENCE_OFFLINE_MS = 45000;
/**
 * 静默检测成员在群状态：me / online / offline / left（已退出或被移除）。
 * 用 m.online（服务端定时扫描写入）+ lastSeen 双重判定，创建者恒在线。
 */
function memberPresence(team, m) {
  if (!m || m._left) return 'left';
  if (m.id === team.meId) return 'me';
  if (m.role === 'owner') return 'online';
  if (m.online === false || Date.now() - (Number(m.lastSeen) || 0) > PRESENCE_OFFLINE_MS) return 'offline';
  return 'online';
}
/** 已退出成员的身份标签文字（走 i18n） */
function presenceLabel(p) {
  if (p === 'me') return trText('我');
  if (p === 'online') return trText('在线');
  if (p === 'offline') return trText('离线');
  return trText('已退出');
}
function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
/** 把文字填进节点，遇到 http(s) 链接就变成可点跳转浏览器的链接 */
function fillText(node, text) {
  const raw = String(text == null ? '' : text);
  const re = /https?:\/\/[^\s<>"'）)】]+/g;
  let last = 0;
  let m;
  while ((m = re.exec(raw))) {
    if (m.index > last) node.appendChild(document.createTextNode(raw.slice(last, m.index)));
    let url = m[0];
    let tail = '';
    const trimmed = url.replace(/[.,;:!?]+$/, '');
    if (trimmed !== url) {
      tail = url.slice(trimmed.length);
      url = trimmed;
    }
    const a = document.createElement('a');
    a.className = 'lnk';
    a.textContent = url;
    a.href = '#';
    a.title = '在浏览器打开';
    a.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      api.open(url);
    };
    node.appendChild(a);
    if (tail) node.appendChild(document.createTextNode(tail));
    last = re.lastIndex;
  }
  if (last < raw.length) node.appendChild(document.createTextNode(raw.slice(last)));
  if (!node.childNodes.length) node.appendChild(document.createTextNode(''));
}

function toast(msg) {
  const text = window.TDLVV_I18N ? TDLVV_I18N.tr(msg) : msg;
  el.toast.textContent = text;
  el.toast.classList.remove('hidden');
  el.toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.style.opacity = '0';
    setTimeout(() => el.toast.classList.add('hidden'), 220);
  }, 2300);
}

function settleConfirm(ok) {
  if (!confirmResolver) return;
  const resolve = confirmResolver;
  confirmResolver = null;
  confirmDefaultOk = false;
  el.confirmPanel.classList.add('hidden');
  resolve(!!ok);
}

/**
 * 主界面风格的确认弹层。所有删除、退出、解散、移除成员都走这里，
 * 不再弹系统 confirm，也不会因为系统窗口失焦把便签收成小条。
 */
function askConfirm(msg, opts) {
  if (confirmResolver) settleConfirm(false);
  clearTimeout(collapseTimer);
  const o = opts || {};
  confirmDefaultOk = !!o.defaultOk;
  el.confirmTitle.textContent = trText(o.title || '确认');
  el.confirmBody.textContent = String(msg == null ? '' : msg);
  el.confirmOk.textContent = trText(o.okText || '确定');
  el.confirmCancel.textContent = trText(o.cancelText || '取消');
  el.confirmOk.classList.toggle('dangerSolid', !!o.danger);
  // 可选说明输入框：只在 opts.note 为真时显示，返回 { ok, note }
  const withNote = !!o.note;
  el.confirmNote.classList.toggle('hidden', !withNote);
  if (withNote) {
    el.confirmNote.value = String(o.noteValue || '');
    el.confirmNote.placeholder = trText(o.notePlaceholder || '可补充说明…');
  }
  el.confirmPanel.classList.remove('hidden');
  // defaultOk：默认焦点落在「确认」按钮（Enter 即确认）；否则落在「取消」（危险操作防误触）
  const focusTarget = withNote ? el.confirmNote : (o.defaultOk ? el.confirmOk : el.confirmCancel);
  setTimeout(() => {
    try { focusTarget.focus({ preventScroll: true }); } catch (e) { focusTarget.focus(); }
  }, 40);
  return new Promise((resolve) => {
    confirmResolver = (ok) => resolve(withNote ? { ok, note: el.confirmNote.value.trim() } : ok);
  });
}
/** 发现新版本时的统一弹窗：确认后打开下载页；无论选什么都记住该版本，避免反复打扰 */
async function offerUpdate(info, manual) {
  if (!info || !info.ok) {
    if (manual) toast(trText('检查失败，请稍后重试'));
    return;
  }
  if (!info.available) {
    if (manual) toast(`${trText('已是最新版本')} ${info.current || ''}`);
    return;
  }
  const notes = info.notes ? `\n\n${info.notes}` : '';
  const body = `${trText('发现新版本')} ${info.latest}${info.current ? `（${trText('当前版本')} ${info.current}）` : ''}。${trText('是否前往下载页面手动安装？')}${notes}`;
  if (miniMode) setMini(false);
  const ok = await askConfirm(body, {
    title: trText('发现新版本'),
    okText: trText('前往下载'),
    cancelText: trText('稍后'),
    defaultOk: true
  });
  try { await api.markUpdateSeen(info.latest); } catch (e) { /* ignore */ }
  if (ok && info.url) api.open(info.url);
}
function focusComposer() {
  if (!el.newTask || miniMode) return;
  try { el.newTask.focus({ preventScroll: true }); } catch (e) { el.newTask.focus(); }
}
function teams() { return (S && S.teams) || []; }
function teamById(id) { return teams().find((t) => t.id === id) || null; }
function localTeam() { return teams().find((t) => t.kind === 'local') || null; }
function activeTeam() {
  return teamById(S && S.activeId) || localTeam() || teams()[0] || null;
}
/** 「我的任务」汇总视图；团队视图仍按团队整体完成状态显示 */
function isPersonalView() {
  const at = activeTeam();
  return !at || at.kind === 'local';
}
function myPersonalDone(t, team) {
  if (!t || !team || !t.personalDoneBy) return 0;
  return Number(t.personalDoneBy[team.meId]) || 0;
}
function roleTagsOf(team) {
  const st = team && team.state;
  if (!st) return [];
  const set = new Set();
  (st.members || []).forEach((m) => {
    const t = String((m && m.roleTag) || '').replace(/^#+/, '').trim();
    if (t) set.add(t);
  });
  return Array.from(set);
}
function audienceOf(t) {
  const a = t && t.audience;
  if (!a || !a.type || a.type === 'all') return { type: 'all', roles: [], memberIds: [] };
  return {
    type: a.type === 'roles' ? 'roles' : 'members',
    roles: Array.isArray(a.roles) ? a.roles : [],
    memberIds: Array.isArray(a.memberIds) ? a.memberIds : []
  };
}
/** 当前这个人能不能看到这条团队任务 */
function canSeeTask(team, t) {
  if (!team || team.kind === 'local') return true;
  const a = audienceOf(t);
  if (a.type === 'all') return true;
  if (team.role === 'owner' || team.role === 'admin') return true;
  if (t.creatorId && t.creatorId === team.meId) return true;
  const st = team.state;
  if (!st) return true;
  const me = (st.members || []).find((m) => m.id === team.meId);
  if (!me) return false;
  if (a.type === 'members') return a.memberIds.includes(me.id);
  const tag = String(me.roleTag || '').replace(/^#+/, '').trim();
  return !!tag && a.roles.includes(tag);
}
function audienceLabel(a) {
  if (!a || a.type === 'all') return '';
  if (a.type === 'roles') return `按角色：${(a.roles || []).join(' / ')}`;
  return `部分 ${ (a.memberIds || []).length } 人`;
}
/**
 * 团队任务的「个人打勾」统计：应完成人数 = 指派成员（没指派则全员），
 * 已完成人数 = 其中已在个人页打勾的人。用于创建者/管理员在任务面板看到 3/5 进度。
 */
function personalDoneStat(team, t, members) {
  if (!team || team.kind === 'local' || !t) return null;
  const all = (members || team.state && team.state.members || []).filter((m) => m && m.id);
  const assigned = assigneeIdsOf(t);
  const a = audienceOf(t);
  const eligible = all.filter((m) => {
    if (assigned.length) return assigned.includes(m.id);
    // 没指派时按发布范围算应完成的人
    if (a.type === 'members') return a.memberIds.includes(m.id);
    if (a.type === 'roles') {
      const tag = String(m.roleTag || '').replace(/^#+/, '').trim();
      return !!tag && a.roles.includes(tag);
    }
    return true;
  });
  const total = eligible.length;
  if (!total) return null;
  const by = (t.personalDoneBy && typeof t.personalDoneBy === 'object') ? t.personalDoneBy : {};
  let done = 0;
  eligible.forEach((m) => { if (by[m.id]) done++; });
  return { done, total };
}
function canManage(team) {
  return !!team && (team.role === 'owner' || team.role === 'admin');
}
function meOf(team) {
  if (!team || !team.state) return null;
  return (team.state.members || []).find((m) => m.id === team.meId) || null;
}
function taskCreator(team, task) {
  return task.creatorId && task.creatorId === team.meId;
}
function canEdit(team, task) {
  return canManage(team) || taskCreator(team, task);
}
/** 任务的指派成员：新数据用 assigneeIds，兼容旧的单值 assigneeId */
function assigneeIdsOf(t) {
  if (!t) return [];
  const out = [];
  const push = (id) => { if (id && !out.includes(id)) out.push(id); };
  if (Array.isArray(t.assigneeIds)) t.assigneeIds.forEach(push);
  else if (t.assigneeId) push(t.assigneeId);
  return out;
}

/** 团队任务只有创建者/管理员、或被指派的本人能标记完成 */
function canCompleteTask(team, task, personal) {
  if (!team) return false;
  if (team.kind === 'local') return true;
  // 个人汇总页允许把自己看到的团队任务单独打勾，不影响团队里其他人
  if (personal || isPersonalView()) return true;
  if (canManage(team)) return true;
  return assigneeIdsOf(task).includes(team.meId);
}
function taskById(team, id) {
  return team && team.state ? (team.state.tasks || []).find((t) => t.id === id) || null : null;
}

/* ---------------- 任务链接 / 本地路径 ---------------- */
function trText(v) {
  return window.TDLVV_I18N ? TDLVV_I18N.tr(v) : v;
}
function taskLinkIcon(type) {
  return type === 'path' ? '💻' : '🌐';
}
function linkPlaceholder(type) {
  if (type === 'url') return 'https://example.com';
  return navigator.userAgent.indexOf('Mac OS X') >= 0 ? '/Users/.../文件或文件夹' : 'C:\\Users\\...\\文件或文件夹';
}
function renderLinkTools() {
  if (!el.linkUrlBtn || !el.linkPathBtn) return;
  const urlOn = pendingLinkType === 'url' && !!pendingLinkTarget;
  const pathOn = pendingLinkType === 'path' && !!pendingLinkTarget;
  el.linkUrlBtn.classList.toggle('on', urlOn);
  el.linkPathBtn.classList.toggle('on', pathOn);
  el.linkUrlBtn.title = trText(urlOn ? '编辑网页链接' : '添加网页链接');
  el.linkPathBtn.title = trText(pathOn ? '编辑本地路径' : '添加本地路径');
  el.linkUrlBtn.setAttribute('aria-label', el.linkUrlBtn.title);
  el.linkPathBtn.setAttribute('aria-label', el.linkPathBtn.title);
}
function closeLinkEditor() {
  linkEditType = '';
  if (el.linkEditor) el.linkEditor.classList.add('hidden');
}
function resetPendingLink() {
  pendingLinkType = '';
  pendingLinkTarget = '';
  closeLinkEditor();
  renderLinkTools();
}
function openLinkEditor(type) {
  if (!el.linkEditor || !el.linkInput) return;
  linkEditType = type === 'path' ? 'path' : 'url';
  const isUrl = linkEditType === 'url';
  el.linkEditorTitle.textContent = trText(isUrl ? '网页链接' : '本地路径');
  el.linkEditorHint.textContent = trText(isUrl
    ? '填写完整网址，发布后点任务上的地球图标打开'
    : '填写本机完整路径，发布后点任务上的电脑图标打开');
  el.linkInput.placeholder = linkPlaceholder(linkEditType);
  el.linkInput.value = pendingLinkType === linkEditType ? pendingLinkTarget : '';
  el.linkEditor.classList.remove('hidden');
  setTimeout(() => {
    el.linkInput.focus();
    el.linkInput.select();
  }, 0);
}
function saveLinkEditor() {
  if (!el.linkInput) return;
  const type = linkEditType === 'path' ? 'path' : 'url';
  const r = normalizeTaskLink(type, el.linkInput.value);
  if (!r.ok) {
    toast(r.error);
    el.linkInput.focus();
    return;
  }
  if (r.empty) {
    resetPendingLink();
    toast('已清除链接');
    return;
  }
  pendingLinkType = r.type;
  pendingLinkTarget = r.target;
  closeLinkEditor();
  renderLinkTools();
  toast(type === 'url' ? '已添加网页链接' : '已添加本地路径');
}
function openTaskLink(t) {
  if (!t || !t.linkType || !t.linkTarget) return;
  if (t.linkType === 'url') {
    api.open(t.linkTarget);
    return;
  }
  if (!api.openPath) {
    toast('当前版本不支持打开本地路径');
    return;
  }
  api.openPath(t.linkTarget).then((r) => {
    if (!r || !r.ok) toast((r && r.error) || '打开路径失败');
  }).catch(() => toast('打开路径失败'));
}

/* ---------------- 任务文件 ---------------- */
function fmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(1)} MB`;
}

function renderFileChip() {
  if (!el.fileChip) return;
  if (!pendingTaskFile) {
    el.fileChip.classList.add('hidden');
    el.fileChip.textContent = '';
    return;
  }
  el.fileChip.classList.remove('hidden');
  el.fileChip.textContent = `💻 ${pendingTaskFile.name} · ${fmtBytes(pendingTaskFile.size)}`;
  el.fileChip.title = pendingTaskFile.name;
}

function openAttachPanel(ctx) {
  if (!el.attachPanel) return;
  attachCtx = ctx || { mode: 'composer' };
  attachDraft = null;
  attachUseCurrent = false;
  let task = null;
  let isCreator = true;
  let existing = pendingTaskFile;
  if (attachCtx.mode !== 'composer') {
    const team = teamById(attachCtx.teamId);
    task = taskById(team, attachCtx.taskId);
    isCreator = !team || team.kind === 'local' || !task || task.creatorId === team.meId;
    existing = task ? ((!isCreator && task.memberFiles && task.memberFiles[team.meId]) || task.file) : null;
  }
  const isSubmit = attachCtx.mode === 'submit';
  const isComplete = attachCtx.mode === 'complete';
  const needsFile = isSubmit || isComplete; // 这两类都是"提交我这版文件"
  const canUseCurrent = needsFile && !!existing;
  el.attachTitle.textContent = attachCtx.mode === 'composer'
    ? '给新任务附加文件'
    : isSubmit
    ? '提交我的文件'
    : isComplete
    ? '完成任务并保存文件'
    : isCreator
    ? '任务文件'
    : '我的文件副本';
  el.attachSub.textContent = isSubmit
    ? '可以直接提交你刚编辑的这一版；也可以换一个文件。提交只更新你的副本，不会覆盖创建者原文件。'
    : isComplete
    ? existing
      ? '默认提交你现在这一版；也可以换一个文件。提交只更新你的副本，不会覆盖创建者原文件。'
      : '这条任务只有链接。要保存一份文件到本地吗？把文件拖进来，或点击选择。'
    : isCreator
    ? '把文件从桌面或微信直接拖进来，也可以点击选择；保存后会放到任务文件目录。'
    : '保存后会更新你的个人副本，不会覆盖创建者原文件，也不影响其他成员。';
  el.attachInfo.innerHTML = existing
    ? `当前文件：<a class="fileLink" tabindex="0" role="link">${esc(existing.displayName || existing.name || '任务文件')}</a>${existing.size ? ` · ${fmtBytes(existing.size)}` : ''}${existing.version ? ` · v${existing.version}` : ''}<br><span class="muted">${
      needsFile
        ? '点文件名可以先打开看内容；提交时默认就是这一版。'
        : isCreator
        ? '重新选择会保存为新版本。'
        : '选择文件后会保存到你的副本。'
    }</span>`
    : '<span class="muted">还没有选择文件</span>';
  const link = el.attachInfo.querySelector('.fileLink');
  if (link && existing) {
    const openIt = async (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const r = await api.previewTaskFile({ teamId: attachCtx.teamId, taskId: attachCtx.taskId });
      if (!r || !r.ok) toast((r && r.error) || '打开文件失败');
    };
    link.onclick = openIt;
    link.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') openIt(e); };
  }
  attachUseCurrent = canUseCurrent;
  el.attachSave.textContent = attachCtx.mode === 'composer'
    ? '附加到新任务'
    : needsFile
    ? canUseCurrent ? '提交当前文件' : '保存文件'
    : isCreator ? '保存文件' : '保存我的副本';
  el.attachSave.disabled = !canUseCurrent;
  if (el.attachPick) el.attachPick.classList.toggle('hidden', !needsFile);
  el.attachPanel.classList.remove('hidden');
}

function closeAttachPanel() {
  if (el.attachPanel) el.attachPanel.classList.add('hidden');
  attachCtx = null;
  attachDraft = null;
  attachUseCurrent = false;
  if (el.attachInput) el.attachInput.value = '';
}

async function pickAttachFile(file) {
  if (!file) return;
  if (file.size > 200 * 1024 * 1024) {
    toast('文件不能超过 200MB');
    return;
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    attachDraft = { name: file.name || '任务文件', data, size: data.length };
    attachUseCurrent = false;
    el.attachInfo.innerHTML = `已选择：<b>${esc(attachDraft.name)}</b> · ${fmtBytes(attachDraft.size)}`;
    el.attachSave.disabled = false;
    if (attachCtx && (attachCtx.mode === 'submit' || attachCtx.mode === 'complete')) el.attachSave.textContent = '提交选择的文件';
  } catch (e) {
    toast('读取文件失败，请重试');
  }
}

async function saveAttachFile() {
  if (!attachCtx) return;
  if (attachCtx.mode === 'composer') {
    if (!attachDraft) return;
    pendingTaskFile = attachDraft;
    renderFileChip();
    closeAttachPanel();
    toast('文件已附加，发布任务时会一起保存');
    return;
  }
  const team = teamById(attachCtx.teamId);
  const task = taskById(team, attachCtx.taskId);
  if (!team || !task) {
    closeAttachPanel();
    return;
  }
  const isCreator = team.kind === 'local' || task.creatorId === team.meId;
  const submitMode = attachCtx.mode === 'submit';
  const completeMode = attachCtx.mode === 'complete';
  const useCurrent = (submitMode || completeMode) && !attachDraft && attachUseCurrent;
  if (!attachDraft && !useCurrent) {
    toast('先选择一个文件');
    return;
  }
  el.attachSave.disabled = true;
  el.attachSave.textContent = '提交中…';
  const r = useCurrent
    ? await api.submitTaskFile({ teamId: team.id, taskId: task.id })
    : await api.attachFile({
        teamId: team.id,
        taskId: task.id,
        name: attachDraft.name,
        data: attachDraft.data
      });
  el.attachSave.disabled = false;
  el.attachSave.textContent = submitMode || completeMode ? '提交当前文件' : isCreator ? '保存文件' : '保存我的副本';
  if (!r || !r.ok) {
    toast((r && r.error) || '提交失败');
    return;
  }
  const after = attachCtx.mode === 'complete' ? attachCtx.afterComplete : null;
  closeAttachPanel();
  await refresh();
  if (submitMode) {
    toast('已提交你的文件');
    return;
  }
  toast(isCreator ? '文件已保存' : '已保存到你的个人副本');
  if (after) await toggleTask(after.teamId, after.taskId, { skipFilePrompt: true });
}

async function handleFileUpdate(team, t) {
  if (!team || !t || !t.pendingFile || !canManage(team)) return;
  const key = `${team.id}:${t.id}:${t.pendingFile.version}:${t.pendingFile.uploadedAt}`;
  const yes = await askConfirm(
    `${t.pendingFile.uploadedByName || '成员'} 更新了「${t.title || t.text.slice(0, 18)}」的文件。\n是否下载并替换当前版本？`,
    { title: '文件有更新', okText: '下载新版本' }
  );
  promptedFileUpdates.add(key);
  if (!yes) return;
  const r = await act(team.id, 'acceptFileUpdate', { id: t.id });
  if (r && r.ok) {
    await refresh();
    const o = await api.openTaskFile({ teamId: team.id, taskId: t.id });
    if (!o || !o.ok) toast((o && o.error) || '打开文件失败');
  }
}

function checkFileUpdates() {
  if (!S) return;
  for (const team of teams()) {
    if (team.kind === 'local' || !canManage(team)) continue;
    const tasks = (team.state && team.state.tasks) || [];
    for (const t of tasks) {
      if (!t.pendingFile) continue;
      const key = `${team.id}:${t.id}:${t.pendingFile.version}:${t.pendingFile.uploadedAt}`;
      if (promptedFileUpdates.has(key)) continue;
      promptedFileUpdates.add(key);
      setTimeout(() => { handleFileUpdate(team, t); }, 30);
      return;
    }
  }
}

/* ---------------- 团队任务模板 ---------------- */
function templateTeam() {
  const team = activeTeam();
  if (!team || team.kind === 'local' || !canManage(team)) return null;
  return team;
}

function updateTemplateBtn() {
  if (!el.templateBtn) return;
  const team = templateTeam();
  el.templateBtn.classList.toggle('hidden', !team);
  if (!team) { pendingTemplate = null; return; }
  if (pendingTemplate && pendingTemplate.teamId && pendingTemplate.teamId !== team.id) pendingTemplate = null;
  if (pendingTemplate) {
    el.templateBtn.textContent = `📋 ${pendingTemplate.name}`;
    el.templateBtn.classList.add('on');
    el.templateBtn.title = '当前使用模板，点击更换或编辑';
  } else {
    el.templateBtn.textContent = trText('＋ 模板');
    el.templateBtn.classList.remove('on');
    el.templateBtn.title = '调用或新建任务模板';
  }
}

function templateRowEditor(field, idx) {
  const row = document.createElement('div');
  row.className = 'templateRow';
  const label = document.createElement('input');
  label.maxLength = 20;
  label.placeholder = '字段名称';
  label.value = field.label || '';
  const value = document.createElement('input');
  value.maxLength = 300;
  value.placeholder = '输入框内容 / 默认值';
  value.value = field.value || '';
  const del = document.createElement('button');
  del.className = 'iconBtn';
  del.textContent = '✕';
  del.title = '删除这一行';
  del.onclick = () => {
    templateDraft.fields.splice(idx, 1);
    if (!templateDraft.fields.length) templateDraft.fields.push({ label: '', value: '' });
    renderTemplateRows();
  };
  [label, value].forEach((inp) => inp.addEventListener('input', () => {
    if (!templateDraft) return;
    templateDraft.fields[idx] = { label: label.value, value: value.value };
  }));
  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(del);
  return row;
}

function renderTemplateRows() {
  if (!el.templateRows || !templateDraft) return;
  el.templateRows.innerHTML = '';
  (templateDraft.fields || []).forEach((f, i) => el.templateRows.appendChild(templateRowEditor(f, i)));
}

function renderTemplateSaved(team) {
  if (!el.templateSaved) return;
  el.templateSaved.innerHTML = '';
  const list = (team.state && team.state.templates) || [];
  if (el.templateCount) el.templateCount.textContent = `${list.length} / 5`;
  if (el.templateNew) {
    el.templateNew.disabled = list.length >= 5;
    el.templateNew.title = list.length >= 5 ? '最多保存 5 个模板，先删除一个' : '新建一个任务模板';
  }
  if (!list.length) {
    const none = document.createElement('span');
    none.className = 'muted';
    none.style.fontSize = '9px';
    none.style.padding = '3px 2px';
    none.textContent = '还没有保存过模板';
    el.templateSaved.appendChild(none);
    return;
  }
  list.forEach((tpl) => {
    const row = document.createElement('div');
    row.className = 'templateItem';
    const name = document.createElement('span');
    name.className = 'templateItemName';
    name.textContent = tpl.name;
    name.title = tpl.name;
    const use = document.createElement('button');
    use.className = 'miniBtn';
    use.textContent = '调用';
    use.title = `调用「${tpl.name}」`;
    use.onclick = () => {
      pendingTemplate = { id: tpl.id, name: tpl.name, fields: (tpl.fields || []).map((f) => ({ ...f })), teamId: team.id };
      closeTemplatePanel();
      updateTemplateBtn();
      toast(`已使用模板「${tpl.name}」，发布任务时会带上这些字段`);
    };
    const edit = document.createElement('button');
    edit.className = 'miniBtn';
    edit.textContent = '编辑';
    edit.onclick = () => {
      templateDraft = { id: tpl.id, name: tpl.name, fields: (tpl.fields || []).map((f) => ({ ...f })) };
      el.templateName.value = tpl.name;
      renderTemplateRows();
      setTimeout(() => { try { el.templateName.focus(); } catch (e) { /* ignore */ } }, 30);
    };
    const del = document.createElement('button');
    del.className = 'miniBtn dangerText';
    del.textContent = '删除';
    del.onclick = async () => {
      const ok = await askConfirm(`删除模板「${tpl.name}」？`, { title: '删除模板', okText: '删除', danger: true });
      if (!ok) return;
      const r = await act(team.id, 'deleteTemplate', { id: tpl.id });
      if (r && r.ok) {
        if (pendingTemplate && pendingTemplate.id === tpl.id) {
          pendingTemplate = null;
          updateTemplateBtn();
        }
        await refresh();
        const t2 = templateTeam();
        if (t2) renderTemplateSaved(t2);
      }
    };
    row.appendChild(name);
    row.appendChild(use);
    row.appendChild(edit);
    row.appendChild(del);
    el.templateSaved.appendChild(row);
  });
}

function newTemplateDraft() {
  const team = templateTeam();
  if (!team) return;
  const list = (team.state && team.state.templates) || [];
  if (list.length >= 5) {
    toast('最多保存 5 个模板，先删除一个再新建');
    return;
  }
  templateDraft = { id: '', name: '', fields: [{ label: '', value: '' }] };
  el.templateName.value = '';
  renderTemplateRows();
  setTimeout(() => { try { el.templateName.focus(); } catch (e) { /* ignore */ } }, 30);
}

function openTemplatePanel() {
  const team = templateTeam();
  if (!team) {
    toast('只有团队创建者或管理员能管理模板');
    return;
  }
  templateDraft = pendingTemplate
    ? { id: pendingTemplate.id || '', name: pendingTemplate.name, fields: pendingTemplate.fields.map((f) => ({ ...f })) }
    : { id: '', name: '', fields: [{ label: '', value: '' }] };
  el.templateName.value = templateDraft.name;
  renderTemplateRows();
  renderTemplateSaved(team);
  el.templatePanel.classList.remove('hidden');
  setTimeout(() => { try { el.templateName.focus(); } catch (e) { /* ignore */ } }, 40);
}

function closeTemplatePanel() {
  if (el.templatePanel) el.templatePanel.classList.add('hidden');
  templateDraft = null;
}

async function saveTemplate() {
  const team = templateTeam();
  if (!team || !templateDraft) return;
  const name = el.templateName.value.trim();
  if (!name) { toast('先给模板起个名字'); return; }
  const existing = (team.state && team.state.templates) || [];
  if (!templateDraft.id && existing.length >= 5) {
    toast('最多保存 5 个模板，先删除一个再新建');
    return;
  }
  if (existing.some((x) => x.id !== templateDraft.id && x.name === name)) {
    toast('已经有同名模板，换个名字');
    return;
  }
  const fields = (templateDraft.fields || [])
    .map((f) => ({ label: String(f.label || '').trim(), value: String(f.value || '').trim() }))
    .filter((f) => f.label || f.value);
  if (!fields.length) { toast('至少填一行字段名称和内容'); return; }
  const r = await act(team.id, 'saveTemplate', { id: templateDraft.id, name, fields });
  if (!r || !r.ok) return;
  await refresh();
  const t2 = templateTeam();
  if (t2) {
    const saved = (t2.state.templates || []).find((x) => x.name === name);
    if (saved) {
      pendingTemplate = { id: saved.id, name: saved.name, fields: (saved.fields || []).map((f) => ({ ...f })), teamId: team.id };
      updateTemplateBtn();
    }
    renderTemplateSaved(t2);
  }
  closeTemplatePanel();
  toast(`模板「${name}」已保存，发布任务时会自动带上`);
}

/* ---------------- 编辑任务弹窗里的链接/路径 ---------------- */
function normalizeTaskLink(type, raw) {
  const kind = type === 'path' ? 'path' : 'url';
  let val = String(raw || '').trim();
  if (!val) return { ok: true, empty: true, type: '', target: '' };
  if (kind === 'url') {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(val) && !/^https?:\/\//i.test(val)) {
      return { ok: false, error: '只能填 http / https 网址' };
    }
    if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
    try {
      const u = new URL(val);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad');
      val = u.toString();
    } catch (e) {
      return { ok: false, error: '只能填 http / https 网址' };
    }
  } else if (!/^(?:[a-zA-Z]:[\\/]|\\\\|\/|~[\\/])/.test(val)) {
    return { ok: false, error: '请填写完整路径' };
  }
  return { ok: true, empty: false, type: kind, target: val };
}
function taskEditLinkText() {
  if (!taskEditLinkType || !taskEditLinkTarget) return trText('未添加链接');
  return `${taskLinkIcon(taskEditLinkType)} ${taskEditLinkTarget}`;
}
function renderTaskEditLink() {
  if (!el.taskEditLinkUrl) return;
  el.taskEditLinkLabel.textContent = trText('任务链接');
  el.taskEditLinkClear.textContent = trText('清除');
  el.taskEditLinkUrl.classList.toggle('on', taskEditLinkType === 'url' && !!taskEditLinkTarget);
  el.taskEditLinkPath.classList.toggle('on', taskEditLinkType === 'path' && !!taskEditLinkTarget);
  el.taskEditLinkStatus.textContent = taskEditLinkText();
  el.taskEditLinkStatus.title = taskEditLinkTarget || '';
  el.taskEditLinkClear.classList.toggle('hidden', !taskEditLinkTarget);
  el.taskEditLinkUrl.title = trText(taskEditLinkType === 'url' && taskEditLinkTarget ? '编辑网页链接' : '添加网页链接');
  el.taskEditLinkPath.title = trText(taskEditLinkType === 'path' && taskEditLinkTarget ? '编辑本地路径' : '添加本地路径');
}
function closeTaskEditLinkInput() {
  taskEditLinkEditing = '';
  el.taskEditLinkRow.classList.add('hidden');
}
function openTaskEditLinkInput(type) {
  const kind = type === 'path' ? 'path' : 'url';
  taskEditLinkEditing = kind;
  el.taskEditLinkInput.placeholder = linkPlaceholder(kind);
  el.taskEditLinkInput.value = taskEditLinkType === kind ? taskEditLinkTarget : '';
  el.taskEditLinkRow.classList.remove('hidden');
  renderTaskEditLink();
  setTimeout(() => {
    el.taskEditLinkInput.focus();
    el.taskEditLinkInput.select();
  }, 0);
}
function applyTaskEditLinkInput() {
  if (!taskEditLinkEditing) return true;
  const type = taskEditLinkEditing;
  const r = normalizeTaskLink(type, el.taskEditLinkInput.value);
  if (!r.ok) {
    toast(r.error);
    el.taskEditLinkInput.focus();
    return false;
  }
  taskEditLinkType = r.type;
  taskEditLinkTarget = r.target;
  closeTaskEditLinkInput();
  renderTaskEditLink();
  return true;
}
function pendingCount(team) {
  return canManage(team) && team.kind !== 'local' && team.state ? (team.state.pending || []).length : 0;
}
function pendingTotal() {
  return teams().reduce((n, t) => n + pendingCount(t), 0);
}

/* ---------------- 主题 ---------------- */
function resolvedTheme() {
  const t = (S && S.theme) || 'system';
  if (t !== 'system') return t;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
}
function applyTheme() {
  const t = resolvedTheme();
  el.app.dataset.theme = t;
  el.app.className = 'app';
  // 主题变量放到 body 上，遮罩卡片（在 .app 外面）才能一起换色
  document.body.className = `theme-${t}${miniMode ? ' mini' : ''}`;
  document.documentElement.style.colorScheme = t;
}
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (S && S.theme === 'system') applyTheme();
  });
} catch (e) {
  /* ignore */
}

/* ---------------- 收起成小条 / 悬停展开 ---------------- */
function anyPanelOpen() {
  if (audienceMenu) return true;
  if (el.linkEditor && !el.linkEditor.classList.contains('hidden')) return true;
  return ['namePanel', 'teamsPanel', 'teamPanel', 'invitePanel', 'donePanel', 'duePanel', 'noticePanel', 'noticeView', 'taskEditPanel', 'attachPanel', 'templatePanel', 'waitPanel', 'confirmPanel', 'menu'].some(
    (id) => el[id] && !el[id].classList.contains('hidden')
  );
}
function canRest() {
  if (!S || S.named === false || S.shot) return false;
  if (Date.now() < restSuppressUntil) return false;
  if (document.visibilityState === 'hidden') return false;
  if (miniMode) return false;
  if (windowResizing || edgeHover) return false;
  // 失焦（切到别的窗口）时忽略 hoverInside：鼠标可能还停在本窗口内，但用户已经在用别的窗口
  if (hoverInside && windowFocused) return false;
  if (editingId) return false;
  if (anyPanelOpen()) return false;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return false;
  return true;
}
function miniHeightForCss(h) {
  const z = (S && S.fontScale) || 1;
  return Math.min(720, Math.max(96, Math.ceil(h * z) + 2));
}
function miniHeight() {
  return miniHeightForCss(el.app.getBoundingClientRect().height);
}
/* 拖动面板时先把“收起后的小条”用虚线框画出来，松手前就能看到它会占多大 */
let miniGhostEl = null;
function ensureMiniGhost() {
  if (!miniGhostEl) {
    miniGhostEl = document.createElement('div');
    miniGhostEl.className = 'miniGhost';
    miniGhostEl.innerHTML = '<span>迷你界面</span>';
    el.app.appendChild(miniGhostEl);
  }
  return miniGhostEl;
}
function showMiniGhost() {
  if (!S || miniMode || miniCollapsing) return;
  const appTop = el.app.getBoundingClientRect().top;
  const top = Math.max(0, Math.round(el.tasks.getBoundingClientRect().top - appTop));
  const z = (S && S.fontScale) || 1;
  const cssH = Math.max(24, measureMiniAppHeight());
  const g = ensureMiniGhost();
  g.style.top = `${top}px`;
  g.style.height = `${Math.round(miniHeightForCss(cssH) / z)}px`;
  g.classList.add('on');
}
function hideMiniGhost() {
  if (miniGhostEl) miniGhostEl.classList.remove('on');
}
function fitMini() {
  if (!miniMode) return;
  // 小条里 .app 的高度是 auto（内容比窗口高），不能直接当窗口高度用；
  // 用 measureMiniAppHeight 按“小条只显示前 5 行”的口径量
  miniAppHeight = measureMiniAppHeight();
  miniTargetDev = miniHeightForCss(miniAppHeight);
  api.mini(true, miniTargetDev, miniTopOffset, 500);
}
function clearExpandAnim() {
  if (expandAnimTimer) clearTimeout(expandAnimTimer);
  expandAnimTimer = null;
  el.app.style.transition = '';
  el.app.style.transform = '';
  el.app.style.height = '';
  el.app.style.clipPath = '';
  el.app.style.willChange = '';
  el.app.style.position = '';
  el.app.style.left = '';
  el.app.style.right = '';
  el.app.style.top = '';
  el.tasks.style.transform = '';
  el.tasks.style.willChange = '';
  document.body.style.clipPath = '';
  document.body.classList.remove('expanding', 'collapsing', 'morphing');
  document.body.style.removeProperty('--morph-op');
}
function measureMiniAppHeight() {
  const bodyClass = document.body.className;
  const rows = Array.from(el.tasks.querySelectorAll('.row'));
  const extra = rows.slice(5);
  const frag = document.createDocumentFragment();
  extra.forEach((r) => frag.appendChild(r));
  // 只让前 5 行参与小条布局，避免收起瞬间对 20 行做一次完整样式/布局
  document.body.className = `theme-${resolvedTheme()} mini measure-mini`;
  const app = el.app.getBoundingClientRect();
  const h = Math.max(96, Math.round(app.height));
  miniTasksOffset = Math.max(0, el.tasks.getBoundingClientRect().top - app.top);
  document.body.className = bodyClass;
  el.tasks.appendChild(frag);
  return h;
}
function finishCollapse() {
  if (!miniCollapsing) return;
  miniCollapsing = false;
  morphDir = null;
  if (collapseRaf) {
    cancelAnimationFrame(collapseRaf);
    collapseRaf = 0;
  }
  // 这时窗口已经收成小条的大小，卡片的屏幕位置和切完小条布局之后完全重合，
  // 所以先同步套窗口、再切小条布局，中间任何一帧看起来都一样，不会眨。
  const z = (S && S.fontScale) || 1;
  const topOffset = 1 + miniTopDev / z;
  if (api.miniNow) api.miniNow(true, miniHeightForCss(miniAppHeight), topOffset);
  else if (api.miniCommitNow) api.miniCommitNow();
  miniMode = true;
  applyTheme();
  renderTasks();
  el.tasks.scrollTop = 0;
  clearExpandAnim();
}
function setMini(on) {
  if (!S) return;
  hideMiniGhost();
  if (on === miniMode && !miniCollapsing) {
    if (on) fitMini();
    return;
  }
  // 主界面里任务区相对窗口顶部的距离：小条展开/收起时任务区都固定在屏幕上
  const appTop = el.app.getBoundingClientRect().top;
  const taskTop = Math.max(0, Math.round(el.tasks.getBoundingClientRect().top - appTop));
  if (on) {
    if (miniCollapsing) return;
    if (morphDir === 'out') finishExpand();
    expandedAppHeight = Math.round(el.app.getBoundingClientRect().height);
    miniTopOffset = taskTop;
    miniAppHeight = measureMiniAppHeight();
    miniCollapsing = true;
    clearExpandAnim();
    // measureMiniAppHeight 已经把列表恢复成完整主界面 DOM，这里不再重复 render
    el.tasks.scrollTop = 0;
    const z = (S && S.fontScale) || 1;
    const tDevAll = Math.max(0, Math.round((miniTopOffset - miniTasksOffset) * z));
    const targetH = miniHeightForCss(miniAppHeight);
    miniTargetDev = targetH;
    const hDevAll = Math.round(expandedAppHeight * z);
    const bDevAll = Math.max(0, hDevAll - tDevAll - targetH);
    miniTopDev = tDevAll;
    morphBegin(tDevAll, bDevAll, 'in');
  } else {
    // 收起动画还没走完就要展开：直接退回主界面，避免两段动画互相打架
    if (miniCollapsing) {
      miniCollapsing = false;
      if (collapseRaf) {
        cancelAnimationFrame(collapseRaf);
        collapseRaf = 0;
      }
      miniMode = false;
      clearExpandAnim();
      if (api.miniNow) api.miniNow(false, 0, 0);
      else api.mini(false, 0, 0, 0);
      applyTheme();
      renderTasks();
      return;
    }
    // 展开同样走“卡片钉在屏幕上、窗口边往外让”：先把卡片按展开态铺在整个展开矩形上
    // （这时窗口还只有小条那么大，外露的部分正好被窗口边裁掉，看起来还是小条），
    // 再让窗口上下边一起往外长。全程内容一个像素都不动。
    const mh = Math.max(96, Math.round(el.app.getBoundingClientRect().height));
    const z = (S && S.fontScale) || 1;
    const tDevAll = miniTopDev;
    // 小条窗口的高度必须用“收起来之后的那个高度”，不能用小条里 .app 的自然高度
    // （小条里 .app 高度 auto，内容比窗口高，量出来会把窗口一下子撑大 200px）
    const targetH = miniTargetDev || miniHeightForCss(Math.round(window.innerHeight));
    const hDevAll = Math.round(expandedAppHeight * z);
    const bDevAll = Math.max(0, hDevAll - tDevAll - targetH);
    miniAppHeight = mh;
    clearExpandAnim();
    // 小条可被拖到屏幕任意位置：展开前把窗口基准锚到小条当前处，
    // 主进程再 clamp 到工作区，贴顶/贴底时就会朝屏幕中间展开。
    if (api.miniAnchor) api.miniAnchor(tDevAll);
    miniMode = false;
    applyTheme();
    renderTasks();
    morphBegin(tDevAll, bDevAll, 'out');
  }
}
/* 卡片固定在屏幕上、只让窗口边内外移动的过渡：
   .app 用负的 top/bottom 把自己顶出窗口，窗口边往里收多少，卡片就往外顶多少，
   卡片在屏幕上的矩形始终是展开态的那块，所以任务行不会跟着窗口动一个像素。 */
function morphBegin(tDevAll, bDevAll, dir) {
  if (!api.miniStep || !expandedAppHeight) {
    // 老版本 preload 没有这个接口（或还没量到展开态高度）时退回一次性切换
    miniCollapsing = false;
    miniMode = dir === 'in';
    applyTheme();
    renderTasks();
    clearExpandAnim();
    if (api.miniNow) api.miniNow(dir === 'in', miniHeightForCss(miniAppHeight), miniTopOffset);
    return;
  }
  const z = (S && S.fontScale) || 1;
  // 时长缩短到 240ms：越短每帧窗口要挪的量越集中，但总帧数少，整体更利落；
  // 配合下面改用的异步 miniFrame，渲染线程不再被同步 IPC 卡住。
  const dur = 240;
  const t0 = performance.now();
  morphDir = dir;
  document.body.classList.add('morphing');
  // 一次性把动画的基准交给主进程（base/topDev/targetH），之后每帧只发一个进度，
  // 主进程自己算 bounds。相比旧的逐帧 sendSync + 精确像素，异步 IPC 不会阻塞渲染，
  // 窗口 resize 与渲染帧解耦后掉帧明显减少。
  if (api.miniBegin) api.miniBegin(miniHeightForCss(miniAppHeight), tDevAll);
  // 卡片高度定死成展开态高度：窗口是异步变的，读 window.innerHeight 总会差一帧，
  // 卡片比窗口矮就会从底边漏出桌面（看起来像闪一下）。
  el.app.style.top = dir === 'in' ? '0px' : `${-tDevAll / z}px`;
  el.app.style.bottom = 'auto';
  el.app.style.height = `${expandedAppHeight}px`;
  document.body.style.setProperty('--morph-op', dir === 'in' ? '1' : '0');
  const tick = (now) => {
    if (morphDir !== dir) return;
    const p = Math.min(1, Math.max(0, (now - t0) / dur));
    // 缓入缓出：起步和收尾都慢，每帧挪的量最小，视觉上没有“顿一下”
    const e = 0.5 - 0.5 * Math.cos(Math.PI * p);
    // 收起：进度从 0→1（顶边往下收、底边往上收）；展开：从 1→0
    const k = dir === 'in' ? e : 1 - e;
    if (api.miniFrame) api.miniFrame(k, k);
    else if (api.miniStep) {
      const t = Math.min(tDevAll, Math.round(tDevAll * k));
      const b = Math.min(bDevAll, Math.round(bDevAll * k));
      api.miniStep(t, b);
    }
    // 卡片用同一进度反向位移，抵消窗口顶边移动，字不会跟着窗口上下跳
    el.app.style.top = `${-(tDevAll * k) / z}px`;
    // 行内小按钮跟着进度淡出淡入，免得切换那一帧突然冒出来/消失
    document.body.style.setProperty('--morph-op', String(dir === 'in' ? 1 - e : e));
    if (p < 1) collapseRaf = requestAnimationFrame(tick);
    else if (dir === 'in') finishCollapse();
    else finishExpand();
  };
  collapseRaf = requestAnimationFrame(tick);
}
function finishExpand() {
  morphDir = null;
  miniMode = false;
  el.app.style.top = '';
  el.app.style.bottom = '';
  if (api.miniNow) api.miniNow(false, 0, 0);
  else if (api.miniCommitNow) api.miniCommitNow();
  clearExpandAnim();
}
function scheduleRest(delay) {
  clearTimeout(collapseTimer);
  if (Date.now() < restSuppressUntil) return;
  collapseTimer = setTimeout(() => {
    if (canRest()) setMini(true);
  }, delay == null ? 600 : delay);
}
/**
 * 兜底心跳：每 500ms 检查一次「鼠标是否不在主界面」，累计离开满 3 秒就收成迷你条。
 * 原 mouseleave/blur 是一次性事件 + canRest 守卫，某一刻守卫没通过（面板、输入框、
 * 边缘悬停等）就再也不会重试，导致偶尔「卡住不收」。这里用浏览器维护的 :hover 伪类
 * 判断鼠标真实位置（JS 的 mouseleave 事件偶尔会丢），绕开一次性定时器做持续兜底。
 */
function autoRestTick() {
  if (!S || miniMode || miniCollapsing || morphDir) { awaySince = 0; return; }
  // 用户正在明确操作的硬状态：不计时（与 canRest 一致）
  if (editingId || anyPanelOpen() || windowResizing || dragExpanding) { awaySince = 0; return; }
  const a = document.activeElement;
  // 只有窗口有焦点、且焦点在输入框时才算「正在输入」；窗口失焦后 activeElement 可能残留 textarea
  if (windowFocused && a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { awaySince = 0; return; }
  let pointerInside = hoverInside;
  try { pointerInside = document.body.matches(':hover'); } catch (e) { /* 用 hoverInside 兜底 */ }
  const away = !windowFocused || !pointerInside;
  if (!away) { awaySince = 0; return; }
  if (!awaySince) { awaySince = Date.now(); return; }
  if (Date.now() - awaySince >= 3000) {
    awaySince = 0;
    clearTimeout(collapseTimer);
    clearTimeout(expandTimer);
    expandSuppressUntil = Date.now() + 400;
    setMini(true);
  }
}

/* ---------------- 渲染：主界面 ---------------- */
function renderAiBox() {
  if (!el.aiBox) return;
  const ai = S && S.ai;
  if (!ai || !ai.baseUrl) {
    el.aiBox.innerHTML = '<span class="muted">AI 接口正在启动；稍后重新打开设置即可看到地址和令牌。</span>';
    if (el.aiCopyBtn) el.aiCopyBtn.disabled = true;
    return;
  }
  if (el.aiCopyBtn) el.aiCopyBtn.disabled = false;
  el.aiBox.innerHTML = [
    `<div class="aiLine"><span>接口地址</span><b>${esc(ai.baseUrl)}</b></div>`,
    `<div class="aiLine"><span>访问令牌</span><b class="aiToken">${esc(ai.token)}</b></div>`,
    `<div class="aiLine"><span>任务文件</span><b>${esc(ai.taskFileRoot || ai.fileRoot || '')}</b></div>`,
    '<div class="aiLine"><span>接口</span><b>/ai/v1/tasks · /templates · /schema</b></div>'
  ].join('');
}

/* ---------------- AI 安装完成提示 ---------------- */
let aiInstallPrompted = false;
async function maybeAiInstallPrompt() {
  if (!S || S.named === false || !S.ai || !S.ai.installPrompt || aiInstallPrompted) return;
  aiInstallPrompted = true;
  const ok = await askConfirm(
    'TDLVV 已由 AI 软件安装完成。现在可以让 workbuddy 或豆包通过本机接口，整合所有任务文件和字段，并做数据分析。\n要现在了解接口信息吗？',
    { title: 'AI 文件整合', okText: '查看接口' }
  );
  await api.aiGreeted();
  if (ok) {
    openTeamsPanel();
    setTimeout(() => {
      try { el.aiBox.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignore */ }
    }, 120);
  }
}

let portalBusy = false;

function renderPortalBox() {
  if (!el.portalCodeInput) return;
  const p = S.portal || {};
  if (document.activeElement !== el.portalCodeInput) {
    el.portalCodeInput.value = p.code || '';
    el.portalCodeInput.placeholder = p.code ? '6 位设备码' : '未生成';
  }
  if (el.btnPortalGen) el.btnPortalGen.textContent = p.code ? '换一个' : '生成';
  if (el.portalLinkText) {
    el.portalLinkText.classList.toggle('ready', !!p.link);
    el.portalLinkText.textContent = p.link || (p.tunnelState === 'ready' ? '正在生成链接…' : '公网通道未就绪，暂时不能用外网链接');
  }
  if (el.btnPortalCopy) el.btnPortalCopy.disabled = !p.link;
  if (el.portalHint) {
    el.portalHint.textContent = p.code
      ? '用手机或浏览器打开这个链接，输入设备码即可看到你的全部任务。换网络或重启后链接可能变化，点「复制链接」取最新的。'
      : '点「生成」创建你的专属设备码；生成后这台电脑会常驻一个小服务并自动连公网通道。';
  }
}

async function genPortalCode() {
  if (portalBusy) return;
  if (S.portal && S.portal.code && !(await askConfirm('换一个新的设备码？旧设备码和旧链接会立即失效，已经打开的设备下次刷新就要用新码。', {
    title: '更换主页设备码？', okText: '换一个', danger: true
  }))) return;
  portalBusy = true;
  try {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const r = await api.portalSetCode(code);
    if (r && r.ok) toast('主页设备码已生成，公网通道就绪后即可复制链接');
  } catch (e) { toast('生成设备码失败'); }
  finally { portalBusy = false; }
}

async function resetPortalCode() {
  if (portalBusy) return;
  if (!(await askConfirm('重置主页设备码？旧设备码和旧链接立即失效，已经打开的设备下次刷新就要用新码。', {
    title: '重置主页设备码？', okText: '重置', danger: true
  }))) return;
  portalBusy = true;
  try {
    await api.portalSetCode('');
    toast('主页设备码已清除');
  } catch (e) { toast('重置失败'); }
  finally { portalBusy = false; }
}

function render() {
  if (!S) return;
  applyTheme();
  if (window.TDLVV_I18N) TDLVV_I18N.setLang(S.lang || 'zh');
  el.namePanel.classList.toggle('hidden', S.named !== false);
  el.waitPanel.classList.toggle('hidden', !S.pendingJoin);
  if (S.pendingJoin) {
    const owner = esc(S.pendingJoin.owner || (S.lang === 'en' ? 'the owner' : '创建者'));
    const board = esc(S.pendingJoin.board || (S.lang === 'en' ? 'the team' : '团队'));
    el.waitSub.innerHTML = S.lang === 'en'
      ? `Waiting for <b>${owner}</b> to approve your request to join “${board}”…`
      : `等待 <b>${owner}</b> 同意你加入「${board}」…`;
  }

  const at = activeTeam();
  el.myAvatarMini.textContent = S.avatar || '🐱';
  el.brandName.textContent = S.named && S.myName ? S.myName : 'TDLVV';
  el.subTitle.textContent = at ? at.name : '我的任务';
  el.brandBtn.classList.toggle('teamMode', !!at && at.kind !== 'local');
  el.brandGear.classList.toggle('hidden', !at || at.kind === 'local');
  el.btnPin.classList.toggle('active', !!S.pin);

  const badge = pendingTotal();
  el.reqBadge.classList.toggle('hidden', !badge);
  el.reqBadge.textContent = String(badge);

  renderTabs();
  renderNotices();
  renderBanner();
  renderTasks();
  renderFileChip();
  updateTemplateBtn();

  const doneCount = countDone();
  el.doneBar.classList.toggle('hidden', !teams().length);
  el.doneCount.textContent = String(doneCount);
  const canAddHere = !at || at.kind === 'local' || canManage(at);
  el.addBar.classList.toggle('hidden', S.named === false || !canAddHere);
  el.targetChip.textContent = at
    ? (at.kind === 'local' ? '发布到：个人' : `发布到：团队 · ${at.name}`)
    : '发布到：个人';
  if (at && audienceTeamId !== at.id) {
    audienceTeamId = at.id;
    pendingAudience = { type: 'all', roles: [], memberIds: [] };
    closeAudienceMenu();
  }
  if (at && linkTeamId !== at.id) {
    linkTeamId = at.id;
    resetPendingLink();
  }
  renderLinkTools();
  renderAudienceChip();
  el.dueBtn.classList.toggle('on', !!pendingDueAt || !!pendingRemindHours);
  autoGrowTask();

  if (!el.teamPanel.classList.contains('hidden') && openTeamId) renderTeamPanel(openTeamId);
  if (!el.memberStatsPanel.classList.contains('hidden')) renderMemberStats();
  if (!el.invitePanel.classList.contains('hidden')) renderInvitePanel();
  if (!el.teamsPanel.classList.contains('hidden')) renderTeamsPanel();
  if (!el.donePanel.classList.contains('hidden')) renderDoneList();
  if (el.autoStartChk) el.autoStartChk.checked = !!S.autoStart;
  if (el.notifyTaskChk) el.notifyTaskChk.checked = S.notifyTasks !== false;
  if (el.notifyDueChk) el.notifyDueChk.checked = S.notifyDue !== false;
  if (el.versionText) el.versionText.textContent = `${trText('当前版本')} ${S.version || ''}`;
  if (el.relayUrlInput && document.activeElement !== el.relayUrlInput) el.relayUrlInput.value = S.relayUrl || '';
  renderPortalBox();
  renderAiBox();
  reportMemberStats();

  if (S.shot) window.__tdlvv = { mini: setMini, fit: fitMini, ghost: showMiniGhost, unghost: hideMiniGhost };
  if (window.TDLVV_I18N) TDLVV_I18N.apply();
  setTimeout(maybeAiInstallPrompt, 80);
  if (miniMode) setTimeout(fitMini, 50);
  else if (!restOnce && S.named !== false) {
    restOnce = true;
    scheduleRest(2200);
  }
}

function renderAudienceChip() {
  const at = activeTeam();
  const show = at && at.kind !== 'local' && canManage(at);
  el.audienceChip.classList.toggle('hidden', !show);
  if (!show) return;
  let label = '全员';
  if (pendingAudience.type === 'roles') {
    label = pendingAudience.roles.length ? `角色 ${pendingAudience.roles.join('/')}` : '按角色';
  } else if (pendingAudience.type === 'members') {
    label = pendingAudience.memberIds.length ? `部分 ${pendingAudience.memberIds.length} 人` : '部分成员';
  }
  el.audienceChip.textContent = '👥 ' + label;
  el.audienceChip.classList.toggle('on', pendingAudience.type !== 'all');
}

function closeAudienceMenu() {
  if (audienceOutside) {
    document.removeEventListener('mousedown', audienceOutside, true);
    audienceOutside = null;
  }
  if (audienceMenu) {
    const closing = audienceMenu;
    audienceMenu = null;
    closing.classList.add('hidden');
    setTimeout(() => closing.remove(), 500);
  }
}

function openAudienceMenu() {
  const at = activeTeam();
  if (!at || at.kind === 'local' || !canManage(at)) return;
  if (audienceMenu) {
    closeAudienceMenu();
    return;
  }
  audienceMenu = document.createElement('div');
  audienceMenu.className = 'menu audMenu';
  document.body.appendChild(audienceMenu);

  const paint = () => {
    if (!audienceMenu) return;
    audienceMenu.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'audTabs';
    [
      ['all', '全员'],
      ['roles', '按角色'],
      ['members', '部分成员']
    ].forEach(([type, text]) => {
      const b = document.createElement('button');
      b.className = 'audTab' + (pendingAudience.type === type ? ' on' : '');
      b.textContent = text;
      b.onclick = () => {
        pendingAudience = { type, roles: [], memberIds: [] };
        renderAudienceChip();
        paint();
      };
      head.appendChild(b);
    });
    audienceMenu.appendChild(head);

    const list = document.createElement('div');
    list.className = 'audList';
    if (pendingAudience.type === 'all') {
      const tip = document.createElement('div');
      tip.className = 'audTip';
      tip.textContent = '全员：团队里每个人都能看到这条任务。';
      list.appendChild(tip);
    } else if (pendingAudience.type === 'roles') {
      const tags = roleTagsOf(at);
      if (!tags.length) {
        const tip = document.createElement('div');
        tip.className = 'audTip';
        tip.textContent = '还没有角色标签。先在团队面板给成员设置「角色标签」，再来按角色发布。';
        list.appendChild(tip);
      }
      tags.forEach((tag) => {
        const row = document.createElement('button');
        row.className = 'audRow' + (pendingAudience.roles.includes(tag) ? ' on' : '');
        const who = (at.state.members || []).filter((m) => String(m.roleTag || '').trim() === tag).map(nameOf);
        row.innerHTML = `<span class="audCheck">${pendingAudience.roles.includes(tag) ? '✓' : ''}</span><b>#${esc(tag)}</b><em>${esc(who.join('、'))}</em>`;
        row.onclick = () => {
          if (pendingAudience.roles.includes(tag)) {
            pendingAudience.roles = pendingAudience.roles.filter((x) => x !== tag);
          } else {
            pendingAudience.roles.push(tag);
          }
          renderAudienceChip();
          paint();
        };
        list.appendChild(row);
      });
    } else {
      (at.state.members || []).forEach((m) => {
        const row = document.createElement('button');
        row.className = 'audRow' + (pendingAudience.memberIds.includes(m.id) ? ' on' : '');
        const tag = String(m.roleTag || '').trim();
        row.innerHTML = `<span class="audCheck">${pendingAudience.memberIds.includes(m.id) ? '✓' : ''}</span><b>${esc(nameOf(m))}</b><em>${tag ? esc('#' + tag) : ''}</em>`;
        row.onclick = () => {
          if (pendingAudience.memberIds.includes(m.id)) {
            pendingAudience.memberIds = pendingAudience.memberIds.filter((x) => x !== m.id);
          } else {
            pendingAudience.memberIds.push(m.id);
          }
          renderAudienceChip();
          paint();
        };
        list.appendChild(row);
      });
    }
    audienceMenu.appendChild(list);

    const foot = document.createElement('div');
    foot.className = 'audFoot';
    const done = document.createElement('button');
    done.className = 'audDone';
    done.textContent = '完成';
    done.onclick = () => closeAudienceMenu();
    foot.appendChild(done);
    audienceMenu.appendChild(foot);
  };
  paint();

  const r = el.audienceChip.getBoundingClientRect();
  const w = 246;
  audienceMenu.style.width = w + 'px';
  audienceMenu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  audienceMenu.style.bottom = window.innerHeight - r.top + 6 + 'px';

  setTimeout(() => {
    audienceOutside = (e) => {
      if (!audienceMenu) return;
      if (audienceMenu.contains(e.target) || el.audienceChip.contains(e.target)) return;
      closeAudienceMenu();
    };
    document.addEventListener('mousedown', audienceOutside, true);
  }, 0);
}

function renderTabs() {
  el.teamTabs.innerHTML = '';
  teams().forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tab' + (t.id === (S.activeId || 'local') ? ' on' : '');
    b.title = t.kind === 'local' ? '自己的任务' : `${t.name} · ${ROLE_LABEL[t.role] || ''}`;
    const pend = pendingCount(t);
    b.innerHTML = `<span>${esc(t.name)}</span>${pend ? `<i class="pend">${pend}</i>` : ''}`;
    b.onclick = async () => {
      pendingTaskFile = null;
      pendingTemplate = null;
      await api.switchTeam(t.id);
    };
    el.teamTabs.appendChild(b);
  });
  if (!teams().length) {
    const b = document.createElement('button');
    b.className = 'tab on';
    b.textContent = '我的任务';
    el.teamTabs.appendChild(b);
  }
}

function renderNotices() {
  const team = activeTeam();
  const ok = team && team.kind !== 'local' && team.state;
  if (!ok) {
    el.noticeBar.classList.add('hidden');
    return;
  }
  const notices = team.state.notices || [];
  const manage = canManage(team);
  el.noticeBar.classList.remove('hidden');
  el.noticeTeamName.textContent = `${team.name} · 通知`;
  el.btnNotice.classList.toggle('hidden', !manage);
  el.btnNotice.textContent = notices.length ? '✎ 修改通知' : '＋ 发通知';
  el.noticeList.innerHTML = '';
  if (!notices.length) {
    const d = document.createElement('div');
    d.className = 'noticeEmpty';
    d.textContent = '还没有团队通知。';
    el.noticeList.appendChild(d);
    return;
  }
  notices.forEach((n) => {
    const row = document.createElement('div');
    row.className = 'noticeRow';
    const body = document.createElement('div');
    body.className = 'noticeBody';
    fillText(body, n.text);
    row.appendChild(body);
    const meta = document.createElement('div');
    meta.className = 'noticeMeta';
    const who = document.createElement('span');
    who.textContent = `${n.authorName || trText('管理员')} · ${fmtTime(n.createdAt)}${n.editedAt ? ' · 已修改' : ''}`;
    meta.appendChild(who);
    if (manage) {
      const del = document.createElement('button');
      del.className = 'noticeDel';
      del.textContent = '✕';
      del.title = '删除这条通知';
      del.onclick = async (e) => {
        e.stopPropagation();
        await act(team.id, 'deleteNotice', { id: n.id });
      };
      meta.appendChild(del);
    }
    row.appendChild(meta);
    row.onclick = (e) => {
      if (e.target.closest('.noticeDel')) return;
      openNoticeView(team, n);
    };
    el.noticeList.appendChild(row);
  });
}

function openNoticeView(team, n) {
  el.noticeViewBody.innerHTML = '';
  fillText(el.noticeViewBody, n.text);
  el.noticeViewMeta.textContent = `${team.name} · ${n.authorName || trText('管理员')} · ${fmtTime(n.createdAt)}${n.editedAt ? ' · 已修改' : ''}`;
  el.noticeView.classList.remove('hidden');
}

function openNoticeEditor() {
  const team = activeTeam();
  if (!team || team.kind === 'local') return;
  const latest = (team.state.notices || [])[0] || null;
  noticeEditId = latest ? latest.id : '';
  el.noticeTitle.textContent = latest ? '修改团队通知' : '发团队通知';
  el.noticeText.value = latest ? latest.text : '';
  el.noticeSave.textContent = latest ? '保存修改' : '发出';
  el.noticePanel.classList.remove('hidden');
  setTimeout(() => el.noticeText.focus(), 100);
}

/* ---------------- 邀请小面板 ---------------- */
function paintCode(target, code) {
  target.innerHTML = '';
  (code || '').split('').forEach((ch, i) => {
    if (i === 3) {
      const gap = document.createElement('span');
      gap.className = 'codeLetter gap';
      target.appendChild(gap);
    }
    const b = document.createElement('span');
    b.className = 'codeLetter';
    b.textContent = ch;
    target.appendChild(b);
  });
}

function inviteRemainText(team) {
  const exp = Number(team && team.state && team.state.inviteCodeExpiresAt) || 0;
  if (!exp) return { expired: false, text: '有效时间 10:00' };
  const left = Math.ceil((exp - Date.now()) / 1000);
  if (left <= 0) {
    return {
      expired: true,
      text: team && team.kind === 'host' ? '邀请码已失效 · 点「重新生成」' : '邀请码已失效 · 请让创建者重新生成'
    };
  }
  return { expired: false, text: `有效时间 ${p2(Math.floor(left / 60))}:${p2(left % 60)}` };
}

function paintInviteTimer(node, team) {
  if (!node) return;
  const st = inviteRemainText(team);
  node.textContent = st.text;
  node.classList.toggle('expired', st.expired);
}

function paintInviteTimers() {
  const team = teamById(openTeamId);
  if (team && !el.teamPanel.classList.contains('hidden')) {
    const st = inviteRemainText(team);
    paintInviteTimer(el.codeTimer, team);
    el.btnCopy.disabled = st.expired;
  }
  const at = activeTeam();
  if (at && !el.invitePanel.classList.contains('hidden')) {
    const st = inviteRemainText(at);
    paintInviteTimer(el.inviteCodeTimer, at);
    el.inviteCopy.disabled = st.expired;
  }
}

function startInviteClock() {
  if (inviteClock) clearInterval(inviteClock);
  inviteClock = setInterval(paintInviteTimers, 1000);
  paintInviteTimers();
}

function openInvitePanel() {
  const team = activeTeam();
  if (!team || team.kind === 'local') return;
  el.invitePanel.classList.remove('hidden');
  renderInvitePanel();
}

function renderInvitePanel() {
  const team = activeTeam();
  if (!team || team.kind === 'local' || !team.state) {
    el.invitePanel.classList.add('hidden');
    return;
  }
  el.inviteTitle.textContent = `邀请加入「${team.name}」`;
  el.inviteSub.textContent = '把邀请码发给同事，对方填码申请，创建者或管理员同意后就进来。';
  paintCode(el.inviteCodeLine, team.state.inviteCode || '');
  const timer = inviteRemainText(team);
  paintInviteTimer(el.inviteCodeTimer, team);
  const canRegen = team.kind === 'host' && canManage(team);
  el.inviteRegen.classList.toggle('hidden', !canRegen);
  el.inviteCopy.disabled = timer.expired;
  el.inviteCopy.classList.toggle('disabledSoft', timer.expired);
  el.inviteNetBox.textContent =
    team.kind === 'host'
      ? team.tunnelUrl
        ? '公网通道已开：不同网络也能申请加入。'
        : '公网通道未就绪：目前只有同一网络能发现并申请。'
      : team.online === false
      ? '暂时连不上创建者，邀请码仍然有效，等连上后审批。'
      : '已连上创建者，邀请码有效。';
}
async function regenerateInvite(team) {
  if (!team) return;
  if (!(await askConfirm('重新生成后旧邀请码立即失效，已加入的成员不受影响。继续？', {
    title: '重新生成邀请码？', okText: '重新生成'
  }))) return;
  const r = await act(team.id, 'regenerateCode', {});
  if (r && r.ok) toast('已生成新的邀请码');
  await refresh();
}

function renderBanner() {
  const errs = [];
  teams().forEach((t) => {
    if (t.error) errs.push(`${t.name}：${t.error}`);
  });
  if (S.error) errs.push(S.error);
  if (!errs.length) {
    el.banner.classList.add('hidden');
    return;
  }
  el.banner.textContent = errs.join(' · ');
  el.banner.classList.remove('hidden');
}

function allTaskEntries(onlyDone) {
  const out = [];
  teams().forEach((team) => {
    const st = team.state;
    if (!st) return;
    (st.tasks || []).forEach((t) => {
      if (!canSeeTask(team, t)) return;
      const settled = !!(t.done || t.closed || (isPersonalView() && myPersonalDone(t, team)));
      if (settled !== !!onlyDone) return;
      out.push({ team, t, members: st.members || [] });
    });
  });
  return out;
}

function settledAt(t) {
  if (t.closed) return t.closedAt || 0;
  if (t.done) return t.doneAt || 0;
  const mine = t.personalDoneBy ? Math.max(0, ...Object.values(t.personalDoneBy).map((v) => Number(v) || 0)) : 0;
  return mine;
}

function settledByName(t, members) {
  const by = members.find((m) => m.id === (t.done ? t.doneById : ''));
  if (t.done) return by ? nameOf(by) : t.doneByName || '';
  if (t.closed) return t.closedByName || '';
  if (t.personalDoneBy && Object.keys(t.personalDoneBy).length) return '我';
  return '';
}

function countDone() {
  return allTaskEntries(true).length;
}

function ownsTask(t, memberId) {
  if (!t || !memberId) return false;
  return t.assigneeId ? t.assigneeId === memberId : t.creatorId === memberId;
}

function myTaskStats() {
  let total = 0;
  let open = 0;
  teams().forEach((team) => {
    const st = team.state;
    if (!st || !team.meId) return;
    (st.tasks || []).forEach((t) => {
      if (!ownsTask(t, team.meId)) return;
      total++;
      if (!t.done && !t.closed) open++;
    });
  });
  return { total, open };
}

function memberTeamStats(team, memberId) {
  let total = 0;
  let open = 0;
  (team.state && team.state.tasks || []).forEach((t) => {
    if (!ownsTask(t, memberId)) return;
    total++;
    if (!t.done && !t.closed) open++;
  });
  return { total, open, done: total - open };
}

/** 把自己的跨团队任务数量同步给所在团队；只传数字，不传任务内容 */
function reportMemberStats() {
  if (!S) return;
  const mine = myTaskStats();
  const sig = `${mine.total}:${mine.open}`;
  teams().forEach((team) => {
    if (team.kind === 'local' || !team.state || !team.meId) return;
    if (lastStatsSig.get(team.id) === sig) return;
    lastStatsSig.set(team.id, sig);
    api.action(team.id, 'setMemberStats', { total: mine.total, open: mine.open }).then((r) => {
      if (!r || !r.ok) lastStatsSig.delete(team.id);
    }).catch(() => lastStatsSig.delete(team.id));
  });
}

function openMemberStats(team, member) {
  if (!el.memberStatsPanel || !team || !member) return;
  openMemberTeamId = team.id;
  openMemberId = member.id;
  el.memberStatsPanel.classList.remove('hidden');
  renderMemberStats();
  // 打开时顺手拉一次最新状态，避免看到上一次轮询的旧数字
  if (api.refreshTeam && team.kind === 'client') {
    api.refreshTeam(team.id).then(() => refresh()).catch(() => {});
  }
}

function renderMemberStats() {
  if (!el.memberStatsPanel || el.memberStatsPanel.classList.contains('hidden')) return;
  const team = teams().find((t) => t.id === openMemberTeamId);
  const member = team && team.state
    ? (team.state.members || []).find((m) => m.id === openMemberId)
    : null;
  if (!team || !member) {
    el.memberStatsPanel.classList.add('hidden');
    return;
  }
  const mine = member.id === team.meId;
  const total = mine ? myTaskStats() : (member.stats || null);
  const teamStats = memberTeamStats(team, member.id);
  el.memberStatsAvatar.textContent = avatarOf(member);
  el.memberStatsName.textContent = nameOf(member);
  const role = ROLE_LABEL[member.role] || '成员';
  el.memberStatsSub.textContent = `${trText(role)} · ${presenceLabel(memberPresence(team, member))}`;
  // 这里只展示两个数量：该成员所有团队的待办总数、本团队的待完成数
  el.memberStatsTotal.textContent = total ? String(total.open) : '—';
  el.memberStatsTotalSub.textContent = total
    ? trText('所有团队合计')
    : trText('等待成员客户端上报');
  el.memberStatsTeam.textContent = String(teamStats.open);
  el.memberStatsTeamSub.textContent = trText('只统计未完成和未关闭');
  el.memberStatsHint.textContent = trText('只同步待办数量，不同步任务内容；打开面板会拉取最新数据。');
}

function memberProgressSummary(team) {
  const out = { done: 0, open: 0, idle: 0, unknown: 0 };
  const members = (team.state && team.state.members) || [];
  members.forEach((m) => {
    const s = m.id === team.meId ? myTaskStats() : (m.stats || null);
    if (!s) { out.unknown++; return; }
    if (Number(s.open) > 0) out.open++;
    else if (Number(s.total) > 0) out.done++;
    else out.idle++;
  });
  return out;
}

function renderMemberProgress(team, manage) {
  if (!el.memberProgress) return;
  const show = manage && team.kind !== 'local';
  el.memberProgress.classList.toggle('hidden', !show);
  if (!show) return;
  const p = memberProgressSummary(team);
  const parts = [
    `<span class="mpLabel">${trText('成员进度')}</span>`,
    `<span class="ok">${trText('已完成')} ${p.done} ${trText('人')}</span>`,
    `<span class="warn">${trText('未完成')} ${p.open} ${trText('人')}</span>`
  ];
  if (p.idle) parts.push(`<span class="muted">${trText('暂无任务')} ${p.idle} ${trText('人')}</span>`);
  if (p.unknown) parts.push(`<span class="muted">${trText('未上报')} ${p.unknown} ${trText('人')}</span>`);
  if (!p.done && !p.open && p.unknown && !p.idle) {
    el.memberProgress.innerHTML = `<span class="mpLabel">${trText('成员进度')}</span><span class="muted">${trText('等待成员客户端上报')}</span>`;
  } else {
    el.memberProgress.innerHTML = parts.join('<span class="mpDot">·</span>');
  }
  el.memberProgress.title = '按每位成员自己上报的全部待办判断：待办为 0 算已完成。';
}


function renderTasks() {
  const scrollTop = el.tasks.scrollTop;
  el.tasks.innerHTML = '';
  const active = activeTeam();
  let list = allTaskEntries(false);
  // 「我的任务」保持汇总所有团队；点进某个团队只看这个团队的任务
  if (active && active.kind !== 'local') list = list.filter((x) => x.team.id === active.id);
  list.sort((a, b) => {
    const pa = a.t.pinned ? 1 : 0;
    const pb = b.t.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    if (pa && pb && (a.t.pinnedAt || 0) !== (b.t.pinnedAt || 0)) {
      return (b.t.pinnedAt || 0) - (a.t.pinnedAt || 0);
    }
    const da = a.t.dueAt || Infinity;
    const db = b.t.dueAt || Infinity;
    if (da !== db) return da - db;
    return b.t.createdAt - a.t.createdAt;
  });

  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty';
    d.innerHTML = active && active.kind !== 'local'
      ? '<span class="k">✦</span>这个团队还没有待办<br>在下面写一条，Enter 发布'
      : teams().length > 1
      ? '<span class="k">✦</span>所有团队都没有待办了<br>在下面写一条，Enter 发布'
      : '<span class="k">✦</span>还没有任务<br>在下面写一条，Enter 发布';
    el.tasks.appendChild(d);
    el.tasks.scrollTop = scrollTop;
    return;
  }

  visibleTaskList(list).forEach(({ team, t, members }) => {
    el.tasks.appendChild(taskRow(team, t, members));
  });
  el.tasks.scrollTop = scrollTop;
}

function visibleTaskList(list) {
  // 简洁小条最多只显示 5 条；收起动画过程中仍保留完整列表，只裁剪上下区域
  return (miniMode && !miniCollapsing) ? list.slice(0, 5) : list;
}

function sourceLabel(team, t) {
  const active = activeTeam();
  // 已经点进这个团队时，来源小字是废话，不显示；个人汇总视图仍然显示「来自…」
  if (active && active.kind !== 'local' && active.id === team.id) return '';
  if (team.kind === 'local') return t.importedFrom ? `来自「${t.importedFrom}」·已退出` : '来自自己';
  return `来自「${team.name}」`;
}

function taskRow(team, t, members) {
  const row = document.createElement('div');
  row.className = 'row' + (t.pinned ? ' pinned' : '');
  row.dataset.id = t.id;
  row.dataset.team = team.id;

  const cb = document.createElement('button');
  cb.className = 'cb';
  cb.title = isPersonalView() && team.kind !== 'local' ? '在个人页面标记完成' : '标记完成';
  if (!canCompleteTask(team, t, isPersonalView())) {
    cb.classList.add('readonly');
    cb.title = '只有创建者、管理员或任务指派对象能标记完成';
    cb.setAttribute('aria-disabled', 'true');
  }
  row.appendChild(cb);

  const wrap = document.createElement('div');
  wrap.className = 'txtWrap';

  const txt = document.createElement('div');
  txt.className = 'txt';
  fillText(txt, t.text);
  txt.title = canEdit(team, t) ? '双击改内容' : '只有任务发起人或管理员能改内容';
  wrap.appendChild(txt);

  const meta = document.createElement('div');
  meta.className = 'meta';
  if (t.pinned) {
    const pin = document.createElement('span');
    pin.className = 'pinTag';
    pin.textContent = '📌 置顶';
    pin.title = t.pinnedByName ? `${t.pinnedByName} 置顶` : '置顶任务';
    meta.appendChild(pin);
  }
  const srcText = sourceLabel(team, t);
  if (srcText) {
    const src = document.createElement('span');
    src.className = 'src';
    src.textContent = srcText;
    meta.appendChild(src);
  }
  if (team.kind !== 'local') {
    const audText = audienceLabel(audienceOf(t));
    if (audText) {
      const aud = document.createElement('span');
      aud.className = 'audTag';
      aud.textContent = '👥 ' + audText;
      aud.title = '这条任务的发布范围';
      meta.appendChild(aud);
    }
  }

  const assigned = assigneeIdsOf(t).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  if (assigned.length) {
    const a = document.createElement('span');
    a.className = 'src';
    a.textContent = `→ ${assigned.map(nameOf).join('、')}`;
    meta.appendChild(a);
  }

  // 个人打勾进度：让创建者/管理员在任务面板直接看到「3/5 人已完成」
  if (team.kind !== 'local' && !t.done && !t.closed) {
    const pds = personalDoneStat(team, t, members);
    if (pds) {
      const pd = document.createElement('span');
      pd.className = 'doneStat' + (pds.done >= pds.total ? ' allDone' : '');
      pd.textContent = `✅ ${pds.done}/${pds.total} ${trText('人已完成')}`;
      pd.title = trText('成员在个人页勾选完成的人数 / 应完成人数');
      meta.appendChild(pd);
    }
  }

  if (t.dueAt) {
    const due = document.createElement('span');
    due.className = 'due ' + dueState(t.dueAt);
    due.textContent = fmtDue(t.dueAt);
    due.title = '截止时间，点一下可以改';
    due.onclick = (e) => {
      e.stopPropagation();
      if (canManage(team) || taskCreator(team, t)) openDueSheet('task', team.id, t.id);
      else toast('只有任务发起人或管理员能改截止与提醒');
    };
    meta.appendChild(due);
  }
  if (t.remindHours) {
    const bell = document.createElement('span');
    bell.className = 'bell';
    bell.textContent = `🔔提前${t.remindHours}h`;
    bell.title = '提醒设置，点一下可以改';
    bell.style.cursor = 'pointer';
    bell.onclick = (e) => {
      e.stopPropagation();
      if (canManage(team) || taskCreator(team, t)) openDueSheet('task', team.id, t.id);
      else toast('只有任务发起人或管理员能改截止与提醒');
    };
    meta.appendChild(bell);
  }

  if (t.fields && t.fields.length) {
    const fields = document.createElement('div');
    fields.className = 'taskFieldsBox';
    t.fields.forEach((f) => {
      if (!f || (!f.label && !f.value)) return;
      const line = document.createElement('div');
      line.className = 'taskFieldLine';
      const k = document.createElement('b');
      k.textContent = `${f.label || '字段'}：`;
      line.appendChild(k);
      line.appendChild(document.createTextNode(f.value || ''));
      fields.appendChild(line);
    });
    if (fields.childNodes.length) wrap.appendChild(fields);
  }

  wrap.appendChild(meta);
  row.appendChild(wrap);

  const iconCol = document.createElement('div');
  iconCol.className = 'taskLinks';
  if (t.file) {
    const fileBtn = document.createElement('button');
    fileBtn.className = 'taskLink';
    fileBtn.textContent = t.pendingFile && canManage(team) ? '💻!' : '💻';
    fileBtn.title = trText(t.pendingFile && canManage(team) ? '有成员更新了文件，点击处理' : '打开任务文件');
    fileBtn.setAttribute('aria-label', fileBtn.title);
    fileBtn.onclick = (e) => {
      e.stopPropagation();
      if (t.pendingFile && canManage(team)) return void handleFileUpdate(team, t);
      api.openTaskFile({ teamId: team.id, taskId: t.id }).then((r) => {
        if (!r || !r.ok) toast((r && r.error) || '打开文件失败');
      });
    };
    iconCol.appendChild(fileBtn);
  }
  if (t.linkType && t.linkTarget) {
    const link = document.createElement('button');
    link.className = 'taskLink';
    link.textContent = taskLinkIcon(t.linkType);
    link.title = trText(t.linkType === 'url' ? '在浏览器打开' : '打开本地路径');
    link.setAttribute('aria-label', link.title);
    link.onclick = (e) => {
      e.stopPropagation();
      openTaskLink(t);
    };
    iconCol.appendChild(link);
  }
  // 纯文字任务不显示电脑/地球占位，保持任务栏简洁
  if (iconCol.childNodes.length) row.appendChild(iconCol);

  // 任务右侧操作区：上 2 下 2，指派只显示手指图标
  // 指派只属于团队任务，且只有创建者/管理员/任务发起人能改；个人清单里没有指派按钮
  const actions = document.createElement('div');
  actions.className = 'taskActions';

  if (team.kind !== 'local' && (canManage(team) || taskCreator(team, t))) {
    const ids = assigneeIdsOf(t);
    const names = ids.map((id) => members.find((m) => m.id === id)).filter(Boolean).map(nameOf);
    const chip = document.createElement('button');
    chip.className = 'assignee' + (ids.length ? '' : ' ghost') + (ids.includes(team.meId) ? ' me' : '');
    chip.textContent = '👉';
    chip.title = names.length ? `指派给谁（当前：${names.join('、')}）` : '指派给谁';
    chip.setAttribute('aria-label', chip.title);
    actions.appendChild(chip);
  }

  // 普通成员：提交自己的文件副本（不改创建者原文件），提交后自己的进度记为 100%
  if (team.kind !== 'local' && !canManage(team) && canSeeTask(team, t)) {
    const sub = document.createElement('button');
    sub.className = 'submitFile';
    sub.textContent = '📤';
    sub.title = '提交我的文件';
    sub.setAttribute('aria-label', sub.title);
    actions.appendChild(sub);
  }

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '✕';
  del.title = t.done ? '删除这条已完成记录' : '关闭这条任务（记录会留在已完成）';
  if (canEdit(team, t)) actions.appendChild(del);

  // 个人清单谁都能置顶自己的；团队任务只有创建者/管理员能置顶（成员看不到按钮）
  if (team.kind === 'local' || canManage(team)) {
    const pinBtn = document.createElement('button');
    pinBtn.className = 'del pinBtn' + (t.pinned ? ' on' : '');
    pinBtn.textContent = '📌';
    pinBtn.title = t.pinned ? '取消置顶' : '置顶到最前面';
    pinBtn.onclick = async (e) => {
      e.stopPropagation();
      await act(team.id, 'pinTask', { id: t.id, on: !t.pinned });
    };
    actions.appendChild(pinBtn);
  }

  if (canManage(team) || taskCreator(team, t)) {
    const clock = document.createElement('button');
    clock.className = 'del clock';
    clock.textContent = '⏰';
    clock.title = '设置截止时间与提醒';
    clock.onclick = (e) => {
      e.stopPropagation();
      openDueSheet('task', team.id, t.id);
    };
    actions.appendChild(clock);
  }

  row.appendChild(actions);
  return row;
}

function renderDoneList() {
  const all = allTaskEntries(true).sort((a, b) => settledAt(b.t) - settledAt(a.t));
  el.doneTotal.textContent = String(all.length);
  const q = doneQuery.trim().toLowerCase();
  const list = q
    ? all.filter(({ team, t, members }) => {
        const byName = settledByName(t, members) || '';
        return (
          t.text.toLowerCase().includes(q) ||
          byName.toLowerCase().includes(q) ||
          (team.name || '').toLowerCase().includes(q)
        );
      })
    : all;

  el.doneAll.innerHTML = '';
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'doneEmpty';
    d.textContent = q ? '没搜到相关任务' : '还没有已完成的任务';
    el.doneAll.appendChild(d);
    return;
  }
  let lastKey = '';
  list.forEach(({ team, t, members }) => {
    const k = dateKey(settledAt(t));
    if (k !== lastKey) {
      lastKey = k;
      const gt = document.createElement('div');
      gt.className = 'doneGroupTitle';
      gt.textContent = dateLabel(settledAt(t));
      el.doneAll.appendChild(gt);
    }
    const row = document.createElement('div');
    row.className = 'dRow' + (t.closed ? ' closed' : '');
    row.dataset.id = t.id;
    row.dataset.team = team.id;
    row.dataset.closed = t.closed ? '1' : '0';

    const c = document.createElement('span');
    c.className = 'dCheck';
    c.textContent = t.closed ? '×' : '✓';
    row.appendChild(c);

    const txt = document.createElement('span');
    txt.className = 'dText';
    txt.textContent = t.text;
    txt.title = t.closed ? '任务已关闭，记录保留' : '双击恢复成未完成';
    row.appendChild(txt);

    if (t.closed) {
      const tag = document.createElement('span');
      tag.className = 'dTag';
      tag.textContent = '已关闭';
      tag.title = '发起人或管理员关闭了这条任务，记录不会删除';
      row.appendChild(tag);
    }

    const byName = settledByName(t, members);
    const meta = document.createElement('span');
    meta.className = 'dMeta';
    meta.textContent = `${byName ? (t.closed ? byName + ' 关闭 · ' : byName + ' · ') : ''}${team.name} · ${fmtTime(settledAt(t))}`;
    row.appendChild(meta);

    el.doneAll.appendChild(row);
  });
}

/* ---------------- 团队面板 ---------------- */
function openTeamPanel(teamId) {
  openTeamId = teamId;
  el.teamPanel.classList.remove('hidden');
  renderTeamPanel(teamId);
}

function beginTeamRename() {
  const team = teamById(openTeamId);
  if (!team || !canManage(team) || team.kind === 'local') return;
  el.teamTitle.classList.add('hidden');
  el.teamNameEdit.classList.add('hidden');
  el.teamNameInput.value = team.name;
  el.teamNameInput.classList.remove('hidden');
  el.teamNameSave.classList.remove('hidden');
  el.teamNameInput.focus();
  el.teamNameInput.select();
}

async function saveTeamName() {
  const team = teamById(openTeamId);
  if (!team || !canManage(team) || team.kind === 'local') return;
  const name = el.teamNameInput.value.trim();
  if (!name) return void toast('团队名不能为空');
  if (name === team.name) return renderTeamPanel(team.id);
  if (!el.teamNameSave.disabled) el.teamNameSave.disabled = true;
  try {
    const r = await api.action(team.id, 'renameBoard', { name });
    if (!r || !r.ok) {
      toast((r && r.error) || '修改团队名失败');
      el.teamNameSave.disabled = false;
      return;
    }
    el.teamNameSave.disabled = false;
    renderTeamPanel(team.id);
    toast('团队名已修改');
  } catch (e) {
    el.teamNameSave.disabled = false;
    toast('修改团队名失败');
  }
}

let deviceLoadingTeam = '';

function deviceSelectedMember(teamId) {
  const cache = deviceCodes.get(teamId);
  if (!cache) return null;
  const id = deviceSelected.get(teamId) || cache.meId || (cache.members[0] && cache.members[0].id);
  return (cache.members || []).find((m) => m.id === id) || null;
}

async function loadDeviceCodes(teamId) {
  if (deviceCodes.has(teamId) || deviceLoadingTeam === teamId) return;
  deviceLoadingTeam = teamId;
  try {
    const r = await api.deviceCodes(teamId);
    if (!r || !r.ok) {
      if (r && r.error) toast(r.error);
      return;
    }
    deviceCodes.set(teamId, r);
    const cur = deviceSelected.get(teamId);
    if (!cur || !(r.members || []).some((m) => m.id === cur)) {
      deviceSelected.set(teamId, r.meId || (r.members[0] && r.members[0].id) || '');
    }
    if (openTeamId === teamId && !el.teamPanel.classList.contains('hidden')) {
      const team = teamById(teamId);
      if (team) renderDeviceBox(team);
    }
  } catch (e) {
    toast('读取设备码失败');
  } finally {
    if (deviceLoadingTeam === teamId) deviceLoadingTeam = '';
  }
}

function renderDeviceBox(team) {
  const show = team.kind === 'host' && team.role === 'owner' && !!team.state;
  el.deviceBox.classList.toggle('hidden', !show);
  if (!show) return;

  if (el.deviceKindSeg) {
    el.deviceKindSeg.querySelectorAll('.segBtn').forEach((b) => b.classList.toggle('on', b.dataset.kind === deviceKind));
  }
  if (el.deviceMemberPart) el.deviceMemberPart.classList.toggle('hidden', deviceKind !== 'member');
  if (el.deviceViewerPart) el.deviceViewerPart.classList.toggle('hidden', deviceKind !== 'viewer');
  if (el.btnDeviceLink) el.btnDeviceLink.textContent = deviceKind === 'viewer' ? '生成查看者链接' : '生成登录链接';

  const cache = deviceCodes.get(team.id);
  if (!cache) {
    el.deviceMember.innerHTML = '';
    el.deviceMember.disabled = true;
    el.deviceCodeInput.value = '';
    el.btnDeviceSave.disabled = true;
    el.btnDeviceReset.disabled = true;
    el.deviceCodeHint.textContent = '正在读取设备码…';
    el.deviceLinkText.classList.remove('ready');
    el.deviceLinkText.textContent = '还没有生成登录链接';
    el.btnDeviceCopy.disabled = true;
    el.deviceLinkNote.textContent = '';
    loadDeviceCodes(team.id);
    loadViewerCode(team.id);
    return;
  }

  const liveIds = (team.state.members || []).map((m) => m.id);
  const cachedIds = (cache.members || []).map((m) => m.id);
  if (liveIds.length !== cachedIds.length || liveIds.some((id) => !cachedIds.includes(id))) {
    deviceCodes.delete(team.id);
    renderDeviceBox(team);
    return;
  }

  const members = cache.members || [];
  const selectedId = deviceSelected.get(team.id) || cache.meId || (members[0] && members[0].id) || '';
  deviceSelected.set(team.id, selectedId);
  const member = members.find((m) => m.id === selectedId) || null;

  const optionKey = members.map((m) => m.id + ':' + m.name + ':' + m.role).join('|');
  if (el.deviceMember.dataset.key !== optionKey) {
    el.deviceMember.innerHTML = '';
    members.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.avatar || '👤'} ${m.name}${m.role === 'owner' ? '（创建者）' : m.role === 'admin' ? '（管理员）' : ''}`;
      el.deviceMember.appendChild(opt);
    });
    el.deviceMember.dataset.key = optionKey;
  }
  el.deviceMember.disabled = false;
  if (el.deviceMember.value !== selectedId) el.deviceMember.value = selectedId;
  if (document.activeElement !== el.deviceCodeInput) {
    el.deviceCodeInput.value = member ? member.code || '' : '';
  }
  el.btnDeviceSave.disabled = !member;
  el.btnDeviceReset.disabled = !member;
  el.deviceCodeHint.textContent = member
    ? '设备码长期有效；只有创建者能看和改，重置后旧码立即失效。'
    : '还没有成员。';

  // 查看者码输入框
  const vcode = viewerCodes.get(team.id) || '';
  if (el.viewerCodeInput && document.activeElement !== el.viewerCodeInput) el.viewerCodeInput.value = vcode;
  if (el.viewerCodeHint) el.viewerCodeHint.textContent = vcode ? '查看者码长期有效；重置后旧码和旧链接立即失效。' : '点「生成查看者链接」自动创建一个查看者码。';

  const linkKey = deviceKind === 'viewer' ? `${team.id}:viewer` : `${team.id}:${selectedId}`;
  const link = deviceLinks.get(linkKey);
  if (!link) {
    el.deviceLinkText.classList.remove('ready');
    el.deviceLinkText.textContent = '还没有生成登录链接';
    el.btnDeviceCopy.disabled = true;
    el.deviceLinkNote.textContent = deviceKind === 'viewer'
      ? '点「生成查看者链接」，把链接发给只看不改的人。'
      : '选好成员后点「生成登录链接」，手机直接打开链接即可。';
    return;
  }
  el.deviceLinkText.classList.add('ready');
  el.deviceLinkText.textContent = link.url;
  el.btnDeviceCopy.disabled = false;
  if (link.network === 'tunnel') {
    el.deviceLinkNote.textContent = '这是公网链接，手机不在同一网络也能用；设备码长期有效，重置后旧链接失效。';
  } else {
    el.deviceLinkNote.textContent = '当前是局域网链接，手机需要和这台电脑在同一网络；要给外网手机用，等公网通道就绪后再生成。';
  }
}

async function generateDeviceLink() {
  const team = teamById(openTeamId);
  if (!team || team.kind !== 'host' || team.role !== 'owner') return;
  const viewer = deviceKind === 'viewer';
  const member = deviceSelectedMember(team.id);
  if (!viewer && !member) return toast('先选择成员');
  if (el.btnDeviceLink.disabled) return;
  el.btnDeviceLink.disabled = true;
  el.btnDeviceLink.textContent = '生成中…';
  try {
    const r = await api.deviceLink({ teamId: team.id, memberId: member && member.id, kind: viewer ? 'viewer' : 'member' });
    if (!r || !r.ok) {
      toast((r && r.error) || '生成登录链接失败');
      return;
    }
    deviceLinks.set(viewer ? `${team.id}:viewer` : `${team.id}:${member.id}`, r);
    if (viewer && r.code) viewerCodes.set(team.id, r.code);
    renderDeviceBox(team);
    try {
      await api.copy(r.url);
      toast(r.network === 'tunnel' ? (viewer ? '已生成公网查看者链接并复制' : '已生成公网登录链接并复制') : '已生成链接并复制（当前仅局域网）');
    } catch (e) {
      toast('登录链接已生成');
    }
  } catch (e) {
    toast('生成登录链接失败');
  } finally {
    el.btnDeviceLink.disabled = false;
    el.btnDeviceLink.textContent = viewer ? '生成查看者链接' : '生成登录链接';
  }
}

async function loadViewerCode(teamId) {
  if (viewerCodes.has(teamId)) return;
  try {
    const r = await api.viewerCode(teamId);
    if (r && r.ok && r.code) {
      viewerCodes.set(teamId, r.code);
      const team = teamById(teamId);
      if (team && openTeamId === teamId && !el.teamPanel.classList.contains('hidden')) renderDeviceBox(team);
    }
  } catch (e) { /* 静默 */ }
}

async function saveViewerCode() {
  const team = teamById(openTeamId);
  if (!team || team.kind !== 'host' || team.role !== 'owner') return;
  const code = el.viewerCodeInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
  if (code.length !== 6) return toast('设备码要 6 位数字或字母');
  try {
    const r = await api.viewerSetCode({ teamId: team.id, code });
    if (!r || !r.ok) return toast((r && r.error) || '保存查看者码失败');
    viewerCodes.set(team.id, r.code);
    deviceLinks.delete(`${team.id}:viewer`);
    renderDeviceBox(team);
    toast('查看者码已保存，旧链接已失效');
  } catch (e) { toast('保存查看者码失败'); }
}

async function resetViewerCode() {
  const team = teamById(openTeamId);
  if (!team || team.kind !== 'host' || team.role !== 'owner') return;
  if (!(await askConfirm('重置查看者码？旧的查看者码和链接立即失效，已经打开的查看页面会在下次刷新时失效。', {
    title: '重置查看者码？', okText: '重置', danger: true
  }))) return;
  try {
    const r = await api.viewerResetCode(team.id);
    if (!r || !r.ok) return toast((r && r.error) || '重置查看者码失败');
    viewerCodes.set(team.id, r.code);
    deviceLinks.delete(`${team.id}:viewer`);
    renderDeviceBox(team);
    toast('查看者码已重置，旧码立即失效');
  } catch (e) { toast('重置查看者码失败'); }
}

async function saveDeviceCode() {
  const team = teamById(openTeamId);
  if (!team || team.kind !== 'host' || team.role !== 'owner') return;
  const member = deviceSelectedMember(team.id);
  if (!member) return;
  const code = el.deviceCodeInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
  if (code.length !== 6) return toast('设备码要 6 位数字或字母');
  if (el.btnDeviceSave.disabled) return;
  el.btnDeviceSave.disabled = true;
  try {
    const r = await api.deviceSetCode({ teamId: team.id, memberId: member.id, code });
    if (!r || !r.ok) {
      toast((r && r.error) || '保存设备码失败');
      return;
    }
    member.code = r.code;
    deviceLinks.delete(`${team.id}:${member.id}`);
    renderDeviceBox(team);
    toast('设备码已保存，旧链接已失效');
  } catch (e) {
    toast('保存设备码失败');
  } finally {
    el.btnDeviceSave.disabled = false;
  }
}

async function resetDeviceCode() {
  const team = teamById(openTeamId);
  if (!team || team.kind !== 'host' || team.role !== 'owner') return;
  const member = deviceSelectedMember(team.id);
  if (!member) return;
  if (!(await askConfirm(`重置「${member.name}」的设备码？旧设备码和旧登录链接会立即失效，已经登录的设备不受影响。`, {
    title: '重置设备码？',
    okText: '重置',
    danger: true
  }))) return;
  if (el.btnDeviceReset.disabled) return;
  el.btnDeviceReset.disabled = true;
  try {
    const r = await api.deviceResetCode({ teamId: team.id, memberId: member.id });
    if (!r || !r.ok) {
      toast((r && r.error) || '重置设备码失败');
      return;
    }
    member.code = r.code;
    deviceLinks.delete(`${team.id}:${member.id}`);
    renderDeviceBox(team);
    toast('设备码已重置，旧码立即失效');
  } catch (e) {
    toast('重置设备码失败');
  } finally {
    el.btnDeviceReset.disabled = false;
  }
}


function renderTeamPanel(teamId) {
  const team = teamById(teamId);
  if (!team || !team.state) {
    el.teamPanel.classList.add('hidden');
    return;
  }
  const st = team.state;
  const me = meOf(team);
  const manage = canManage(team);
  const canRename = manage && team.kind !== 'local';
  el.teamTitle.textContent = team.name;
  el.teamTitle.classList.remove('hidden');
  el.teamNameEdit.classList.toggle('hidden', !canRename);
  el.teamNameInput.classList.add('hidden');
  el.teamNameSave.classList.add('hidden');
  el.teamMeta.innerHTML = `${
    team.kind === 'local'
      ? '自己的任务清单，只在本机'
      : team.kind === 'host'
      ? '我创建的团队'
      : '我加入的团队'
  } · ${ROLE_LABEL[team.role] || '成员'} · ${st.members.length} 人${team.online === false ? ' · <span style="color:var(--warn)">离线</span>' : ''}`;

  const filesRoot = team.filesRoot || st.filesRoot || '';
  const showFiles = team.kind !== 'local' && !!filesRoot;
  el.teamFilesBox.classList.toggle('hidden', !showFiles);
  if (showFiles) {
    el.teamFilesPathLabel.textContent = filesRoot;
    el.teamFilesPathLabel.title = filesRoot;
    const canChange = team.kind === 'host' && manage;
    el.teamFilesOpen.classList.toggle('hidden', team.kind !== 'host');
    el.teamFilesChange.classList.toggle('hidden', !canChange);
    el.teamFilesNote.textContent = canChange
      ? '这是创建者电脑上的路径。修改后可以复制全部文件到新位置；NAS、共享盘或云盘请先确保这台电脑能正常读写。'
      : '文件保存在创建者电脑的这个目录里；修改位置需要在创建者电脑的团队管理页操作。';
  }

  const showInvite = team.kind !== 'local';
  el.inviteBox.classList.toggle('hidden', !showInvite);
  if (showInvite) {
    paintCode(el.codeLine, st.inviteCode || '');
    const remain = inviteRemainText(team);
    paintInviteTimer(el.codeTimer, team);
    el.btnCopy.disabled = remain.expired;
    el.btnRegen.classList.toggle('hidden', !(team.kind === 'host' && manage));
    renderNetBox(team);
  }
  renderDeviceBox(team);

  const reqs = st.pending || [];
  el.reqArea.classList.toggle('hidden', !(manage && reqs.length));
  el.reqCount.textContent = String(reqs.length);
  el.reqList.innerHTML = '';
  if (manage) {
    reqs.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'reqRow';
      const a = document.createElement('span');
      a.className = 'avatar';
      a.textContent = r.avatar || '👤';
      row.appendChild(a);
      const n = document.createElement('span');
      n.className = 'reqName';
      n.textContent = r.name;
      row.appendChild(n);
      const tm = document.createElement('span');
      tm.className = 'reqTime';
      tm.textContent = fmtTime(r.createdAt);
      row.appendChild(tm);
      const acts = document.createElement('div');
      acts.className = 'reqActions';
      const ok = document.createElement('button');
      ok.className = 'miniBtn P';
      ok.textContent = '同意';
      ok.onclick = () => decideRequest(team, r, true);
      const no = document.createElement('button');
      no.className = 'miniBtn';
      no.textContent = '拒绝';
      no.onclick = () => decideRequest(team, r, false);
      acts.appendChild(ok);
      acts.appendChild(no);
      row.appendChild(acts);
      el.reqList.appendChild(row);
    });
  }

  el.memberCount.textContent = String(st.members.length);
  el.memberRows.innerHTML = '';
  st.members.forEach((m) => {
    el.memberRows.appendChild(memberRow(team, m, manage));
  });
  // 已退出/被移除的成员单独列出，灰显并标注状态，避免「凭空消失」无从追溯
  const left = Array.isArray(st.leftMembers) ? st.leftMembers : [];
  if (left.length) {
    const hd = document.createElement('div');
    hd.className = 'mgLeftTitle';
    hd.textContent = trText('已退出成员') + `（${left.length}）`;
    el.memberRows.appendChild(hd);
    left.forEach((m) => {
      el.memberRows.appendChild(memberRow(team, Object.assign({}, m, { _left: true, online: false }), false));
    });
  }
  renderMemberProgress(team, manage);
  el.membersTip.textContent =
    team.kind === 'local'
      ? '自己的清单只有你一个人。'
      : manage
      ? '点名字旁的「＋备注」或「改备注」可以编辑备注；点「＋角色」可以设置角色标签；创建者可以任命管理员、移交团队。'
      : '成员信息由创建者维护。';
  el.btnLeave.classList.toggle('hidden', team.kind === 'local');
  el.btnLeave.textContent = team.kind === 'host' ? '退出并解散这个团队' : '退出这个团队';
}

function renderNetBox(team) {
  if (team.kind === 'host') {
    if (team.tunnelUrl) {
      el.netBox.innerHTML = `<span class="ok">公网通道已开</span>，不同网络的同事也能加入。<br>公网地址：<b>${esc(team.tunnelUrl)}</b><br><span class="muted">同网段会自动出现在「同一网络里的团队」里，但加入仍需你同意。</span>`;
    } else if (team.tunnelState === 'starting' || team.tunnelState === 'restarting') {
      el.netBox.innerHTML = '<span class="bad">公网通道启动中…</span> 约半分钟；这期间同网段仍可申请。';
    } else {
      el.netBox.innerHTML = `<span class="bad">公网通道未就绪</span> 现在只有同网段能申请。<br>本机地址：<b>${esc(`${team.hostAddr}:${team.hostPort}`)}</b>`;
    }
  } else {
    el.netBox.innerHTML = team.online === false
      ? '<span class="bad">暂时连不上创建者</span> 会一直自动重连，期间只显示本地缓存。'
      : '<span class="ok">已连上创建者</span> 任务修改实时同步。';
  }
}

function editRoleTag(anchor, team, m) {
  const input = document.createElement('input');
  input.className = 'tagInput';
  input.maxLength = 8;
  input.placeholder = '角色标签，如 设计';
  input.value = m.roleTag || '';
  anchor.replaceWith(input);
  input.focus();
  input.select();
  let closed = false;
  const finish = async (save) => {
    if (closed) return;
    closed = true;
    const v = input.value.trim();
    if (save && v !== (m.roleTag || '')) {
      const r = await api.action(team.id, 'setMemberTag', { id: m.id, tag: v });
      if (!r || !r.ok) toast((r && r.error) || '设置失败');
    }
    await refresh();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function editRemark(anchor, team, m) {
  const input = document.createElement('input');
  input.className = 'mgRemark';
  input.maxLength = 20;
  input.placeholder = '备注，比如 市场部-小李';
  input.value = m.remark || '';
  anchor.replaceWith(input);
  input.focus({ preventScroll: true });
  input.select();
  let closed = false;
  const finish = async (save) => {
    if (closed) return;
    closed = true;
    const v = input.value.trim();
    if (save && v !== (m.remark || '')) {
      const r = await api.action(team.id, 'setRemark', { id: m.id, remark: v });
      if (!r || !r.ok) toast((r && r.error) || '备注保存失败');
    }
    await refresh();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function memberRow(team, m, manage) {
  const row = document.createElement('div');
  row.className = 'mgRow';

  const a = document.createElement('span');
  const presence = memberPresence(team, m);
  a.className = 'avatar' + (presence === 'left' ? '' : ' clickable') + (presence === 'me' || presence === 'online' ? '' : ' offline');
  a.textContent = avatarOf(m);
  a.title = presence === 'left' ? trText('已退出团队') : trText('查看任务数量');
  if (presence !== 'left') {
    a.onclick = (e) => {
      e.stopPropagation();
      openMemberStats(team, m);
    };
  }
  row.appendChild(a);

  const main = document.createElement('div');
  main.className = 'mgMain';
  const nm = document.createElement('div');
  nm.className = 'mgName';
  const nameText = document.createElement('span');
  nameText.className = 'mgNameText';
  nameText.textContent = nameOf(m) + (m.id === team.meId ? '（我）' : '');
  nm.appendChild(nameText);

  const hasRemark = !!String(m.remark || '').trim();
  if (manage && presence !== 'left' && m.id !== team.meId && team.kind !== 'local') {
    const rb = document.createElement('button');
    rb.className = 'mgRemarkBtn';
    rb.textContent = hasRemark ? '改备注' : '＋备注';
    rb.title = hasRemark ? '修改备注（备注会代替原名显示）' : '给 TA 加一个备注';
    rb.onclick = (e) => {
      e.stopPropagation();
      editRemark(rb, team, m);
    };
    nm.appendChild(rb);
  }

  if (m.role !== 'member') {
    const tag = document.createElement('span');
    tag.className = 'tagRole' + (m.role === 'admin' ? ' admin' : '');
    tag.textContent = ROLE_LABEL[m.role];
    nm.appendChild(tag);
  }
  const roleTag = String(m.roleTag || '').trim();
  const canEditTag = manage && presence !== 'left' && team.kind !== 'local';
  if (roleTag || canEditTag) {
    const tb = document.createElement('button');
    tb.className = 'tagUser' + (roleTag ? '' : ' empty');
    tb.textContent = roleTag ? `#${roleTag}` : '＋角色';
    tb.title = canEditTag ? '设置角色标签（发布任务时可按角色发）' : '角色标签';
    if (canEditTag) {
      tb.onclick = (e) => {
        e.stopPropagation();
        editRoleTag(tb, team, m);
      };
    } else {
      tb.disabled = true;
    }
    nm.appendChild(tb);
  }
  main.appendChild(nm);

  if (hasRemark) {
    const orig = document.createElement('div');
    orig.className = 'mgOrigin';
    orig.textContent = `（原名：${m.name}）`;
    main.appendChild(orig);
  }
  row.appendChild(main);

  const st = document.createElement('span');
  st.className = 'mgState' + (presence === 'online' ? ' online' : '');
  st.textContent = presenceLabel(presence);
  row.appendChild(st);

  if (manage && presence !== 'left' && m.role !== 'owner' && m.id !== team.meId) {
    const acts = document.createElement('div');
    acts.className = 'mgActs';
    if (team.role === 'owner') {
      const roleBtn = document.createElement('button');
      roleBtn.textContent = m.role === 'admin' ? '取消管理员' : '设为管理员';
      roleBtn.onclick = async () => {
        const r = await api.action(team.id, 'setRole', { id: m.id, role: m.role === 'admin' ? 'member' : 'admin' });
        if (!r.ok) toast(r.error || '操作失败');
        await refresh();
      };
      acts.appendChild(roleBtn);

      const tr = document.createElement('button');
      tr.textContent = '移交';
      tr.title = '把创建者身份交给 TA';
      tr.onclick = async () => {
        if (!(await askConfirm(`把团队「${team.name}」的创建者身份移交给「${nameOf(m)}」？你会变成管理员。`, {
          title: '移交创建者？', okText: '移交'
        }))) return;
        const r = await api.action(team.id, 'transferOwner', { id: m.id });
        if (!r.ok) toast(r.error || '操作失败');
        await refresh();
      };
      acts.appendChild(tr);
    }
    const kick = document.createElement('button');
    kick.className = 'danger';
    kick.textContent = '移除';
    kick.onclick = async () => {
      if (!(await askConfirm(`把「${nameOf(m)}」移出团队？对方会立刻失去访问权限。`, {
        title: '移出成员？', okText: '移出', danger: true
      }))) return;
      const r = await api.action(team.id, 'removeMember', { id: m.id });
      if (!r.ok) toast(r.error || '操作失败');
      await refresh();
    };
    acts.appendChild(kick);
    row.appendChild(acts);
  }

  return row;
}

async function decideRequest(team, req, ok) {
  const payload = { teamId: team.id, requestId: req.id };
  let r;
  if (team.kind === 'host') {
    r = ok ? await api.approve(payload) : await api.reject(payload);
  } else {
    r = await api.action(team.id, ok ? 'approveRequest' : 'rejectRequest', { requestId: req.id });
  }
  if (!r.ok) toast(r.error || '操作失败');
  else if (ok) toast(`${req.name} 已加入`);
  await refresh();
}

/* ---------------- 团队/设置面板 ---------------- */
function openTeamsPanel() {
  if (!S) return;
  el.teamsErr.textContent = '';
  draftAvatar = S.avatar;
  if (el.teamFilesPath && !el.teamFilesPath.value) el.teamFilesPath.value = S.taskFilesRoot || '';
  el.teamsPanel.classList.remove('hidden');
  renderTeamsPanel();
}
function renderTeamsPanel() {
  el.teamCount.textContent = String(teams().length);
  el.teamList.innerHTML = '';
  teams().forEach((t) => {
    const row = document.createElement('div');
    row.className = 'teamRow';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = t.kind === 'local' && S.lang === 'en' ? 'My Tasks' : t.name;
    row.appendChild(nm);
    const rl = document.createElement('span');
    rl.className = 'rl';
    rl.textContent = `${ROLE_LABEL[t.role] || '成员'} · ${t.state ? t.state.members.length : 0} 人`;
    row.appendChild(rl);
    const pend = pendingCount(t);
    if (pend) {
      const pe = document.createElement('span');
      pe.className = 'pe';
      pe.textContent = `${pend} 个申请`;
      row.appendChild(pe);
    }
    row.onclick = () => {
      el.teamsPanel.classList.add('hidden');
      openTeamPanel(t.id);
    };
    el.teamList.appendChild(row);
  });

  el.themeSeg.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', (S.theme || 'system') === b.dataset.theme);
  });
  el.fontSeg.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', (S.fontSize || 'm') === b.dataset.font);
  });
  el.langSeg.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', (S.lang || 'zh') === b.dataset.lang);
  });
  el.profileAvatar.textContent = draftAvatar || S.avatar || '🐱';
  const paintProfile = (a) => {
    draftAvatar = a;
    el.profileAvatar.textContent = a;
    renderAvatarPicker(el.profileAvatarPick, a, paintProfile);
  };
  renderAvatarPicker(el.profileAvatarPick, draftAvatar || S.avatar, paintProfile);
  el.myNameInput.value = S.myName || '';

  el.nearbyList.innerHTML = '';
  const near = S.nearby || [];
  if (!near.length) {
    const d = document.createElement('div');
    d.className = 'doneEmpty';
    d.textContent = '同网段暂时没扫到别的团队';
    el.nearbyList.appendChild(d);
  }
  near.forEach((n) => {
    const row = document.createElement('div');
    row.className = 'nearRow';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.innerHTML = `${esc(n.board || n.code)}<small>${esc(n.owner || '')} · ${esc(n.addr)}:${n.port}</small>`;
    row.appendChild(nm);
    const b = document.createElement('button');
    b.className = 'secondary';
    b.style.height = '24px';
    b.style.fontSize = '10.5px';
    b.textContent = '申请加入';
    b.onclick = async () => {
      el.codeInput.value = n.code;
      await doJoin(n.code, `${n.addr}:${n.port}`);
    };
    row.appendChild(b);
    el.nearbyList.appendChild(row);
  });
}

function renderAvatarPicker(container, current, onPick) {
  container.innerHTML = '';
  AVATARS.forEach((a) => {
    const b = document.createElement('button');
    b.textContent = a;
    b.className = a === current ? 'on' : '';
    b.onclick = () => onPick(a);
    container.appendChild(b);
  });
}

/* ---------------- 任务操作 ---------------- */
async function refresh() {
  try {
    S = await api.getState();
  } catch (e) {
    /* ignore */
  }
  render();
}

async function act(teamId, type, payload) {
  const r = await api.action(teamId, type, payload);
  if (!r || !r.ok) {
    toast((r && r.error) || '操作失败');
    await refresh();
  }
  return r;
}

async function toggleTask(teamId, id, opts) {
  const team = teamById(teamId);
  const t = taskById(team, id);
  if (!t) return;
  const o = opts || {};
  if (!canCompleteTask(team, t, o.personal)) {
    toast('只有创建者、管理员或任务指派对象能标记完成');
    return;
  }
  // 个人页面只改自己的完成标记，团队任务本身仍保持原状态
  if (isPersonalView() && team.kind !== 'local' && !t.done && !t.closed) {
    if (!t.personalDoneBy || typeof t.personalDoneBy !== 'object') t.personalDoneBy = {};
    if (t.personalDoneBy[team.meId]) delete t.personalDoneBy[team.meId];
    else t.personalDoneBy[team.meId] = Date.now();
    editingId = null;
    render();
    await act(teamId, 'togglePersonalDone', { id });
    return;
  }
  if (!t.done && team.kind !== 'local' && !o.skipFilePrompt) {
    if (!t.file && t.linkType) {
      const save = await askConfirm(
        '这条任务只有链接，没有本地文件。要现在保存一份文件到本地吗？',
        { title: '完成任务', okText: '保存文件' }
      );
      if (save) {
        openAttachPanel({ mode: 'complete', teamId, taskId: id, afterComplete: { teamId, taskId: id } });
        return;
      }
    } else if (!canManage(team)) {
      const submit = await askConfirm(
        '完成前要提交你最终保存的文件吗？保存后会以「你的名字」后缀同步给创建者和管理员。',
        { title: '完成任务', okText: '提交文件' }
      );
      if (submit) {
        openAttachPanel({ mode: 'complete', teamId, taskId: id, afterComplete: { teamId, taskId: id } });
        return;
      }
    }
  }
  const wasDone = !t.done;   // 这次操作是否把任务标记为完成
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : 0;
  const me = meOf(team);
  t.doneById = t.done ? team.meId : '';
  t.doneByName = t.done && me ? nameOf(me) : '';
  editingId = null;
  render();
  await act(teamId, 'toggleTask', { id });

  // 创建者/管理员标记完成后，询问是否发起 AI 文件整合汇总
  if (wasDone && team.kind !== 'local' && canManage(team) && !o.skipSummaryPrompt) {
    const hasFiles = !!(t.file || (t.memberFiles && Object.keys(t.memberFiles).length));
    const answer = await askConfirm(
      hasFiles
        ? trText('任务已标记完成。是否发起 AI 对成员文件做整合汇总？汇总结果会存到本任务的文件夹里。')
        : trText('任务已标记完成。这条任务没有附件文件，无法整合汇总。'),
      {
        title: trText('发起 AI 汇总'),
        okText: trText('发起汇总'),
        cancelText: trText('暂不'),
        note: hasFiles,
        notePlaceholder: trText('可选：填写本次汇总要求，例如按报价对比合并、只汇总某几个字段…')
      }
    );
    const ok = answer && answer.ok !== undefined ? answer.ok : answer;
    const note = answer && answer.note ? answer.note : '';
    if (ok && hasFiles) {
      try {
        const r = await api.requestSummary(teamId, id, note);
        if (r && r.ok) {
          toast(r.autoSent
            ? trText('已生成汇总请求，并在 WorkBuddy 里自动发起对话')
            : trText('已生成汇总请求并唤起 WorkBuddy，提示词已复制，请粘贴发送'));
        } else {
          toast((r && r.error) || trText('生成汇总请求失败'));
        }
      } catch (e) {
        toast(trText('生成汇总请求失败') + '：' + (e && e.message ? e.message : ''));
      }
    }
  }
}

async function deleteTask(teamId, id) {
  const team = teamById(teamId);
  const t = taskById(team, id);
  if (!team || !t) return;
  if (!canEdit(team, t)) {
    toast('只有任务发起人（或管理员）能关闭这条任务');
    return;
  }
  const isClose = !t.done && team.kind !== 'local';
  const msg = t.done
    ? '从已完成记录里彻底删掉这条？删了就不在已完成里了。'
    : team.kind === 'local'
    ? '删除这条任务？'
    : '关闭这条任务？团队里的人会在「已完成」里看到它，并标着「已关闭」。';
  if (!(await askConfirm(msg, {
    title: t.done ? '删除已完成记录？' : isClose ? '关闭任务？' : '删除任务？',
    okText: t.done ? '删除' : isClose ? '关闭' : '删除',
    danger: true
  }))) return;
  const r = await act(teamId, 'deleteTask', { id });
  if (r && r.ok) setTimeout(focusComposer, 80);
}

let taskEditFields = [];

function renderTaskEditFields(team, t, editable) {
  if (!el.taskFieldsBox || !el.taskFieldsList) return;
  const fields = taskEditFields || [];
  el.taskFieldsBox.classList.toggle('hidden', !fields.length);
  el.taskFieldsList.innerHTML = '';
  if (!fields.length) return;
  if (editable) {
    fields.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'taskFieldEdit';
      const label = document.createElement('input');
      label.maxLength = 20;
      label.placeholder = '字段名称';
      label.value = f.label || '';
      const value = document.createElement('input');
      value.maxLength = 300;
      value.placeholder = '内容';
      value.value = f.value || '';
      [label, value].forEach((inp) => inp.addEventListener('input', () => {
        if (!taskEditFields[i]) taskEditFields[i] = { label: '', value: '' };
        taskEditFields[i] = { label: label.value, value: value.value };
      }));
      row.appendChild(label);
      row.appendChild(value);
      el.taskFieldsList.appendChild(row);
    });
  } else {
    fields.forEach((f) => {
      if (!f.label && !f.value) return;
      const line = document.createElement('div');
      line.className = 'taskFieldLine';
      const k = document.createElement('b');
      k.textContent = `${f.label || '字段'}：`;
      line.appendChild(k);
      line.appendChild(document.createTextNode(f.value || ''));
      el.taskFieldsList.appendChild(line);
    });
  }
}

function renderTaskSubmit(team, t) {
  if (!el.taskSubmitRow) return;
  const show = team.kind !== 'local' && !canManage(team) && !t.done && !t.closed
    && canSeeTask(team, t) && canCompleteTask(team, t);
  el.taskSubmitRow.classList.toggle('hidden', !show);
}

function renderTaskFileBox(team, t) {
  if (!el.taskFileBox) return;
  el.taskFileBox.classList.remove('hidden');
  const local = team.kind === 'local';
  const isCreator = local || t.creatorId === team.meId;
  const own = !isCreator && t.memberFiles ? t.memberFiles[team.meId] : null;
  el.taskFileFolder.disabled = false;
  el.taskFileFolder.title = trText('打开该任务的文件夹');
  // 成员提交的版本：每个文件一个图标，创建者/管理员点一下就能打开查看
  if (el.taskMemberFiles) {
    el.taskMemberFiles.innerHTML = '';
    Object.keys(t.memberFiles || {}).forEach((id) => {
      const meta = t.memberFiles[id];
      if (!meta || !meta.storedRel) return;
      const m = (team.state && team.state.members || []).find((x) => x.id === id);
      const who = m ? nameOf(m) : (meta.uploadedByName || '成员');
      const b = document.createElement('button');
      b.className = 'memberFileBtn';
      b.textContent = `📄 ${who} · v${meta.version || 1}`;
      b.title = `${who}：${meta.displayName || '任务文件'}`;
      b.onclick = async () => {
        const r = await api.openTaskFile({ teamId: team.id, taskId: t.id, memberId: id });
        if (!r || !r.ok) toast((r && r.error) || '打开文件失败');
      };
      el.taskMemberFiles.appendChild(b);
    });
  }
  if (!t.file) {
    el.taskFileName.textContent = '还没有任务文件';
    el.taskFileOpen.disabled = true;
    el.taskFileUpload.disabled = !canSeeTask(team, t);
    el.taskFileUpload.textContent = isCreator ? '上传文件' : '保存我的副本';
    el.taskFileHint.textContent = trText('可以把桌面或微信里的文件拖进来，或点按钮选择文件。');
    return;
  }
  el.taskFileOpen.disabled = false;
  el.taskFileUpload.disabled = !canSeeTask(team, t);
  const shown = own || t.file;
  el.taskFileName.textContent = `${shown.displayName || '任务文件'} · v${shown.version || 1}${shown.size ? ` · ${fmtBytes(shown.size)}` : ''}`;
  el.taskFileUpload.textContent = isCreator ? '更换原文件' : (own ? '更新我的副本' : '保存我的副本');
  el.taskFileHint.textContent = t.pendingFile
    ? `已有成员提交新版本：${t.pendingFile.displayName}（${t.pendingFile.uploadedByName || '成员'}），创建者/管理员确认后替换。`
    : isCreator
    ? '这是任务原文件。成员打开时会各自生成「文件名-成员名.后缀」的副本，不会覆盖这里。'
    : own
    ? '这是你的个人副本，原文件不会被覆盖；再次保存会更新这份副本。'
    : '打开会先在共享目录生成「文件名-你的名字.后缀」的个人副本，原文件保持不变。';
}

function startEdit(teamId, id) {
  const team = teamById(teamId);
  const t = taskById(team, id);
  if (!t) return;
  const manager = canManage(team);
  const editable = team.kind === 'local' ? canEdit(team, t) : manager;
  taskEditCtx = { teamId, id, editable, manager };
  editingId = id;
  taskEditFields = (t.fields || []).map((f) => ({ label: f.label || '', value: f.value || '' }));
  el.taskEditTitle.textContent = team.kind === 'local'
    ? '编辑任务'
    : manager
    ? '任务详情 · 创建者/管理员'
    : '任务详情 · 成员';
  el.taskEditText.value = t.text;
  el.taskEditText.readOnly = !editable;
  el.taskEditText.classList.toggle('readonlyText', !editable);
  taskEditLinkType = t.linkType || '';
  taskEditLinkTarget = t.linkTarget || '';
  taskEditLinkEditing = '';
  closeTaskEditLinkInput();
  renderTaskEditLink();
  renderTaskSubmit(team, t);
  renderTaskEditFields(team, t, editable);
  renderTaskFileBox(team, t);
  el.taskEditLinkBlock && el.taskEditLinkBlock.classList.toggle('hidden', !editable);
  el.taskEditCancel.textContent = editable ? '取消' : '关闭';
  el.taskEditSave.textContent = editable ? '保存' : '关闭';
  el.taskEditSave.classList.remove('hidden');
  el.taskEditPanel.classList.remove('hidden');
  setTimeout(() => {
    if (editable) {
      el.taskEditText.focus();
      el.taskEditText.setSelectionRange(el.taskEditText.value.length, el.taskEditText.value.length);
    }
  }, 80);
}

function closeTaskEditor() {
  el.taskEditPanel.classList.add('hidden');
  closeTaskEditLinkInput();
  taskEditCtx = null;
  editingId = null;
}

async function saveTaskEditor() {
  if (!taskEditCtx) return;
  const { teamId, id, editable } = taskEditCtx;
  const team = teamById(teamId);
  const t = taskById(team, id);
  if (!t) return closeTaskEditor();
  if (!applyTaskEditLinkInput()) return;
  if (editable) {
    const val = el.taskEditText.value.replace(/\r\n/g, '\n').trim();
    if (!val) {
      toast('任务内容不能为空');
      el.taskEditText.focus();
      return;
    }
    const nextLinkType = taskEditLinkType || '';
    const nextLinkTarget = taskEditLinkTarget || '';
    const linkChanged = nextLinkType !== (t.linkType || '') || nextLinkTarget !== (t.linkTarget || '');
    const fields = taskEditFields
      .map((f) => ({ label: String(f.label || '').trim(), value: String(f.value || '').trim() }))
      .filter((f) => f.label || f.value);
    const fieldsChanged = JSON.stringify(fields) !== JSON.stringify(t.fields || []);
    if (val !== t.text || linkChanged || fieldsChanged) {
      t.text = val;
      t.linkType = nextLinkType;
      t.linkTarget = nextLinkTarget;
      t.fields = fields;
      await act(teamId, 'editTask', { id, text: val, linkType: nextLinkType, linkTarget: nextLinkTarget, fields });
    }
  }
  closeTaskEditor();
  renderTasks();
  checkFileUpdates();
}

function autoGrowTask() {
  if (!el.newTask) return;
  const ta = el.newTask;
  ta.style.height = 'auto';
  ta.style.overflowY = 'hidden';
  const max = Math.max(42, Math.round(window.innerHeight * 0.4));
  const full = ta.scrollHeight;
  ta.style.height = Math.min(full, max) + 'px';
  // 只有内容真的超过最大高度、确实需要滚动时才显示滚动条
  ta.style.overflowY = full > max + 1 ? 'auto' : 'hidden';
}

async function addTask() {
  const text = el.newTask.value.trim();
  if (!text) return;
  const team = activeTeam();
  if (!team) { toast('先创建或加入一个团队'); return; }
  if (team.kind !== 'local' && !canManage(team)) { toast('只有创建者或管理员能新增任务'); return; }
  if (team.kind === 'client' && team.online === false) { toast('当前离线，连上创建者后再加'); return; }
  const aud = team.kind !== 'local' && canManage(team)
    ? { type: pendingAudience.type, roles: pendingAudience.roles.slice(), memberIds: pendingAudience.memberIds.slice() }
    : { type: 'all', roles: [], memberIds: [] };
  const fields = pendingTemplate
    ? pendingTemplate.fields.map((f) => ({ label: String(f.label || '').slice(0, 20), value: String(f.value || '').slice(0, 300) }))
    : [];
  el.newTask.value = '';
  autoGrowTask();
  const t = {
    id: `tmp${Math.random()}`,
    text,
    done: false,
    assigneeId: '',
    assigneeIds: [],
    creatorId: team.meId,
    createdAt: Date.now(),
    dueAt: pendingDueAt,
    remindHours: pendingRemindHours,
    remindAt: 0,
    audience: aud,
    linkType: pendingLinkType,
    linkTarget: pendingLinkTarget,
    fields,
    file: null,
    pendingFile: null,
    members: []
  };
  team.state.tasks.unshift(t);
  render();
  const r = await act(team.id, 'addTask', { text, dueAt: pendingDueAt, remindHours: pendingRemindHours, audience: aud, linkType: pendingLinkType, linkTarget: pendingLinkTarget, fields });
  if (!r || !r.ok) {
    el.newTask.value = text;
    autoGrowTask();
  } else {
    pendingDueAt = 0;
    pendingRemindHours = 0;
    resetPendingLink();
    el.dueBtn.classList.remove('on');
    el.dueBtn.textContent = '🕒 截止 / 提醒';
    const newId = r.createdId;
    if (pendingTaskFile && newId) {
      const up = await api.attachFile({
        teamId: team.id,
        taskId: newId,
        name: pendingTaskFile.name,
        data: pendingTaskFile.data
      });
      if (!up || !up.ok) toast((up && up.error) || '任务文件保存失败');
    } else if (pendingTaskFile) {
      await refresh();
      const t2 = teamById(team.id);
      const created = t2 && (t2.state.tasks || []).find((x) => x.text === text && x.creatorId === t2.meId);
      if (created) {
        const up = await api.attachFile({
          teamId: team.id,
          taskId: created.id,
          name: pendingTaskFile.name,
          data: pendingTaskFile.data
        });
        if (!up || !up.ok) toast((up && up.error) || '任务文件保存失败');
      }
    }
    pendingTaskFile = null;
    pendingTemplate = null;
    renderFileChip();
    updateTemplateBtn();
    await refresh();
  }
}

/* ---------------- 指派菜单（仅团队任务，可勾选多人） ---------------- */
function openMenu(teamId, id, anchor) {
  const team = teamById(teamId);
  const t = taskById(team, id);
  if (!team || team.kind === 'local' || !t) return;
  if (!canManage(team) && !taskCreator(team, t)) {
    toast('只有任务发起人或管理员能指派任务');
    return;
  }
  closeMenu();
  el.menu.className = 'menu audMenu assignMenu';
  const members = team.state.members || [];
  let selected = assigneeIdsOf(t);

  const paint = () => {
    el.menu.innerHTML = '';
    const tip = document.createElement('div');
    tip.className = 'audTip';
    tip.textContent = trText('可同时勾选多位成员，完成后点确定');
    el.menu.appendChild(tip);
    const list = document.createElement('div');
    list.className = 'audList';
    members.forEach((m) => {
      const on = selected.includes(m.id);
      const row = document.createElement('button');
      row.className = 'audRow' + (on ? ' on' : '');
      const tag = String(m.roleTag || '').trim();
      row.innerHTML = `<b>${esc(nameOf(m))}${m.id === team.meId ? esc('（我）') : ''}</b>`
        + `<em>${tag ? esc('#' + tag) : esc('成员')}</em>`
        + `<span class="audCheck">${on ? '✓' : ''}</span>`;
      row.onclick = (e) => {
        e.preventDefault();
        selected = on ? selected.filter((x) => x !== m.id) : selected.concat(m.id);
        paint();
      };
      list.appendChild(row);
    });
    el.menu.appendChild(list);
    const foot = document.createElement('div');
    foot.className = 'audFoot';
    const clear = document.createElement('button');
    clear.className = 'ghost tinyBtn';
    clear.textContent = trText('清除指派');
    clear.onclick = (e) => { e.stopPropagation(); selected = []; paint(); };
    const done = document.createElement('button');
    done.className = 'audDone';
    done.textContent = trText('确定');
    done.onclick = async (e) => {
      e.stopPropagation();
      closeMenu();
      const ids = members.map((m) => m.id).filter((mid) => selected.includes(mid));
      t.assigneeIds = ids;
      t.assigneeId = ids[0] || '';
      render();
      await act(teamId, 'editTask', { id, assigneeIds: ids });
    };
    foot.appendChild(clear);
    foot.appendChild(done);
    el.menu.appendChild(foot);
  };
  paint();

  el.menu.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const mw = el.menu.offsetWidth;
  let left = r.right - mw;
  let top = r.bottom + 4;
  if (left < 8) left = 8;
  if (top + el.menu.offsetHeight > window.innerHeight - 8) top = r.top - el.menu.offsetHeight - 4;
  el.menu.style.left = `${left}px`;
  el.menu.style.top = `${top}px`;
}
function closeMenu() {
  el.menu.classList.add('hidden');
}
document.addEventListener('click', (e) => {
  if (!el.menu.contains(e.target)) closeMenu();
}, true);

/* ---------------- 截止 / 提醒弹层 ---------------- */
function isEnglishUI() {
  return !!(window.TDLVV_I18N && TDLVV_I18N.lang === 'en');
}
function fmtPickerLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${dateKey(ts)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function showDueMain() {
  el.dueMain.classList.remove('hidden');
  el.duePickerView.classList.add('hidden');
  if (el.duePanel.firstElementChild) el.duePanel.firstElementChild.scrollTop = 0;
}
function openDueSheet(mode, teamId, taskId) {
  sheet = { mode, teamId, taskId };
  const team = teamById(teamId);
  const t = taskId ? taskById(team, taskId) : null;
  sheetDue = mode === 'task' && t ? t.dueAt || 0 : pendingDueAt;
  sheetHours = mode === 'task' && t ? t.remindHours || 0 : pendingRemindHours;
  el.dueTime.value = sheetDue ? fmtPickerLabel(sheetDue) : '';
  showDueMain();
  renderRemindList();
  el.duePanel.classList.remove('hidden');
}
function closeDueSheet() {
  showDueMain();
  el.duePanel.classList.add('hidden');
}

function pickerTimestamp() {
  const base = new Date(pickerDate.getFullYear(), pickerDate.getMonth(), pickerDate.getDate(), 0, 0, 0, 0).getTime();
  return base + pickerHour * 3600000 + pickerMinute * 60000;
}
function updatePickerPreview() {
  if (!el.datePreview || !pickerDate) return;
  el.datePreview.textContent = `${dateKey(pickerDate.getTime())} ${p2(pickerHour)}:${p2(pickerMinute)}`;
}
function renderCalendar() {
  if (!pickerViewMonth) return;
  const year = pickerViewMonth.getFullYear();
  const month = pickerViewMonth.getMonth();
  const en = isEnglishUI();
  el.calMonth.textContent = en ? `${MONTH_EN[month]} ${year}` : `${year} 年 ${month + 1} 月`;
  el.calWeekdays.innerHTML = '';
  (en ? WEEK_EN : WEEK_ZH).forEach((w) => {
    const span = document.createElement('span');
    span.textContent = w;
    el.calWeekdays.appendChild(span);
  });

  el.calGrid.innerHTML = '';
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // 周一为一周起点
  const days = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < 42; i++) {
    const day = i - offset + 1;
    if (day < 1 || day > days) {
      const blank = document.createElement('span');
      blank.className = 'calBlank';
      el.calGrid.appendChild(blank);
      continue;
    }
    const d = new Date(year, month, day);
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(day);
    b.title = `${year}-${p2(month + 1)}-${p2(day)}`;
    if (d.getTime() === new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) {
      b.classList.add('today');
    }
    if (pickerDate && d.getTime() === new Date(pickerDate.getFullYear(), pickerDate.getMonth(), pickerDate.getDate()).getTime()) {
      b.classList.add('on');
    }
    b.onclick = () => {
      pickerDate = new Date(year, month, day, 0, 0, 0, 0);
      renderCalendar();
      updatePickerPreview();
    };
    el.calGrid.appendChild(b);
  }
}

function buildTimeWheel(wrap, values, selected, onChange) {
  if (!wrap) return;
  clearTimeout(wrap._snapTimer);
  wrap.innerHTML = '';
  wrap._wheelIndex = selected;
  const padTop = document.createElement('div');
  padTop.className = 'wheelPad';
  wrap.appendChild(padTop);
  const items = [];
  const paint = (idx) => {
    items.forEach((item, i) => item.classList.toggle('on', i === idx));
  };
  values.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'wheelItem';
    item.textContent = p2(v);
    item.onclick = () => {
      wrap.scrollTo({ top: i * WHEEL_H, behavior: 'smooth' });
    };
    items.push(item);
    wrap.appendChild(item);
  });
  const padBottom = document.createElement('div');
  padBottom.className = 'wheelPad';
  wrap.appendChild(padBottom);
  paint(selected);
  wrap.onscroll = () => {
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(wrap.scrollTop / WHEEL_H)));
    if (idx !== wrap._wheelIndex) {
      wrap._wheelIndex = idx;
      paint(idx);
      onChange(values[idx]);
    }
    clearTimeout(wrap._snapTimer);
    wrap._snapTimer = setTimeout(() => {
      const target = wrap._wheelIndex * WHEEL_H;
      if (Math.abs(wrap.scrollTop - target) > 1) wrap.scrollTo({ top: target, behavior: 'smooth' });
    }, 120);
  };
  requestAnimationFrame(() => { wrap.scrollTop = selected * WHEEL_H; });
}

function openDuePicker() {
  const base = sheetDue ? new Date(sheetDue) : new Date();
  if (!sheetDue) base.setHours(0, 0, 0, 0);
  pickerDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  pickerViewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  pickerHour = sheetDue ? base.getHours() : 0;
  pickerMinute = sheetDue ? base.getMinutes() : 0;
  el.dueMain.classList.add('hidden');
  el.duePickerView.classList.remove('hidden');
  if (el.duePanel.firstElementChild) el.duePanel.firstElementChild.scrollTop = 0;
  renderCalendar();
  buildTimeWheel(el.hourWheel, HOUR_VALUES, pickerHour, (v) => { pickerHour = v; updatePickerPreview(); });
  buildTimeWheel(el.minuteWheel, MINUTE_VALUES, pickerMinute, (v) => { pickerMinute = v; updatePickerPreview(); });
  updatePickerPreview();
}

function confirmDuePicker() {
  sheetDue = pickerTimestamp();
  el.dueTime.value = fmtPickerLabel(sheetDue);
  showDueMain();
}

function renderRemindList() {
  el.remindList.innerHTML = '';
  const none = document.createElement('button');
  none.textContent = '不提醒';
  none.className = sheetHours ? '' : 'on';
  none.onclick = () => {
    sheetHours = 0;
    renderRemindList();
  };
  el.remindList.appendChild(none);
  for (let h = 1; h <= 48; h++) {
    const b = document.createElement('button');
    b.textContent = `${h} 小时`;
    b.className = sheetHours === h ? 'on' : '';
    b.onclick = () => {
      sheetHours = h;
      renderRemindList();
    };
    el.remindList.appendChild(b);
    if (sheetHours === h) setTimeout(() => b.scrollIntoView({ block: 'center' }), 60);
  }
}

async function saveDueSheet() {
  const due = sheetDue || 0;
  if (sheet.mode === 'new') {
    pendingDueAt = due;
    pendingRemindHours = sheetHours;
    el.dueBtn.classList.toggle('on', !!pendingDueAt || !!pendingRemindHours);
    el.dueBtn.textContent = pendingDueAt ? `🕒 ${fmtDue(pendingDueAt)}${sheetHours ? ` · 提前${sheetHours}h` : ''}` : sheetHours ? `🕒 提前${sheetHours}h` : '🕒 截止 / 提醒';
    closeDueSheet();
    return;
  }
  const r = await act(sheet.teamId, 'editTask', { id: sheet.taskId, dueAt: due, remindHours: sheetHours });
  if (r && r.ok) closeDueSheet();
  await refresh();
}

/* ---------------- 加入流程 ---------------- */
async function doJoin(code, manual) {
  if (joinBusy) return;
  joinBusy = true;
  el.teamsErr.textContent = '';
  el.btnJoin.disabled = true;
  el.btnJoin.textContent = '正在找…';
  const r = await api.joinTeam({ code, manual });
  joinBusy = false;
  el.btnJoin.disabled = false;
  el.btnJoin.textContent = '申请加入';
  if (!r.ok) {
    el.teamsErr.textContent = r.error || '加入失败';
    return;
  }
  el.teamsPanel.classList.add('hidden');
  await refresh();
}

/* ---------------- 事件 ---------------- */
function bind() {
  el.btnMin.onclick = () => api.min();
  el.btnClose.onclick = () => api.close();

  // 团队很多时，普通鼠标滚轮也能横向翻团队（不必依赖触控板左右滑）
  el.teamTabs.addEventListener('wheel', (e) => {
    if (el.teamTabs.scrollWidth <= el.teamTabs.clientWidth) return;
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!d) return;
    el.teamTabs.scrollLeft += d;
    e.preventDefault();
  }, { passive: false });

  el.aiCopyBtn.onclick = async () => {
    const ai = S && S.ai;
    if (!ai || !ai.baseUrl) return toast('AI 接口还没准备好');
    const text = [
      `TDLVV AI 接口：${ai.baseUrl}`,
      `访问令牌：${ai.token}`,
      `任务文件目录：${ai.taskFileRoot || ai.fileRoot || ''}`,
      '接口：GET /ai/v1/status /ai/v1/schema /ai/v1/tasks /ai/v1/templates',
      '请求头：X-TDLVV-Token'
    ].join('\n');
    await api.copy(text);
    toast('接口信息已复制');
  };
  el.autoStartChk.onchange = async () => {
    const on = el.autoStartChk.checked;
    const r = await api.setAutoStart(on);
    el.autoStartChk.checked = !!r;
    toast(r ? '已设置开机自动启动' : '已关闭开机自动启动');
  };
  if (el.notifyTaskChk) {
    el.notifyTaskChk.onchange = async () => {
      const on = el.notifyTaskChk.checked;
      const r = await api.setNotify({ tasks: on });
      if (!r || !r.ok) {
        el.notifyTaskChk.checked = !on;
        toast('通知设置保存失败');
      } else {
        S.notifyTasks = r.notifyTasks;
        toast(on ? '已开启新任务系统通知' : '已关闭新任务系统通知');
      }
    };
  }
  if (el.notifyDueChk) {
    el.notifyDueChk.onchange = async () => {
      const on = el.notifyDueChk.checked;
      const r = await api.setNotify({ due: on });
      if (!r || !r.ok) {
        el.notifyDueChk.checked = !on;
        toast('通知设置保存失败');
      } else {
        S.notifyDue = r.notifyDue;
        toast(on ? '已开启截止 / 提醒通知' : '已关闭截止 / 提醒通知');
      }
    };
  }

  if (el.relaySaveBtn) el.relaySaveBtn.onclick = async () => {
    if (el.relaySaveBtn.disabled) return;
    const raw = String((el.relayUrlInput && el.relayUrlInput.value) || '').trim();
    if (raw && !/^https?:\/\//i.test(raw)) {
      toast(trText('中继地址必须以 http:// 或 https:// 开头'));
      return;
    }
    el.relaySaveBtn.disabled = true;
    try {
      const r = await api.setRelayUrl(raw);
      if (r && r.ok) {
        el.relayUrlInput.value = r.relayUrl || '';
        toast(trText('中继地址已保存'));
      } else {
        toast(trText('保存失败'));
      }
    } catch (e) {
      toast(trText('保存失败'));
    } finally {
      el.relaySaveBtn.disabled = false;
    }
  };

  if (el.btnPortalGen) el.btnPortalGen.onclick = genPortalCode;
  if (el.btnPortalReset) el.btnPortalReset.onclick = resetPortalCode;
  if (el.btnPortalCopy) el.btnPortalCopy.onclick = async () => {
    const p = S && S.portal;
    if (!p || !p.link) return;
    try { await api.copy(p.link); toast('链接已复制'); } catch (e) { toast('复制失败'); }
  };
  if (el.checkUpdateBtn) el.checkUpdateBtn.onclick = async () => {
    if (el.checkUpdateBtn.disabled) return;
    const original = el.checkUpdateBtn.textContent;
    el.checkUpdateBtn.disabled = true;
    el.checkUpdateBtn.textContent = trText('检查中…');
    try {
      const info = await api.checkUpdate();
      await offerUpdate(info, true);
    } catch (e) {
      toast(trText('检查失败，请稍后重试'));
    } finally {
      el.checkUpdateBtn.disabled = false;
      el.checkUpdateBtn.textContent = original;
    }
  };
  if (api.onUpdateAvailable) api.onUpdateAvailable((info) => offerUpdate(info, false));

  el.exportDataBtn.onclick = async () => {
    if (el.exportDataBtn.disabled) return;
    el.exportDataBtn.disabled = true;
    try {
      const r = await api.exportData(S.lang || 'zh');
      if (r && r.ok) toast('备份已导出');
      else if (r && !r.canceled) toast(r.error || '导出失败');
    } catch (e) {
      toast('导出失败');
    } finally {
      el.exportDataBtn.disabled = false;
    }
  };

  el.importDataBtn.onclick = async () => {
    if (el.importDataBtn.disabled) return;
    const ok = await askConfirm(
      '导入会覆盖当前所有团队、任务和设置，并自动重启。导入前会先保留一份当前数据备份。继续？',
      { title: '导入备份', okText: '继续导入', danger: true }
    );
    if (!ok) return;
    el.importDataBtn.disabled = true;
    try {
      const r = await api.importData(S.lang || 'zh');
      if (!r || !r.ok) {
        el.importDataBtn.disabled = false;
        if (r && !r.canceled) toast(r.error || '导入失败');
        return;
      }
      toast('导入成功，正在重启…');
    } catch (e) {
      el.importDataBtn.disabled = false;
      toast('导入失败');
    }
  };

  // 鼠标移开就收成只显示任务的小条，移回来稍等一下展开（留出按住拖动小条的时间）
  document.body.addEventListener('mouseenter', () => {
    hoverInside = true;
    edgeHover = false;
    clearTimeout(collapseTimer);
    clearTimeout(edgeLeaveTimer);
    clearTimeout(expandTimer);
    if (miniMode && !dragExpanding && Date.now() >= expandSuppressUntil) {
      expandTimer = setTimeout(() => {
        if (miniMode && !dragExpanding && Date.now() >= expandSuppressUntil) setMini(false);
      }, 260);
    }
  });
  document.body.addEventListener('mousemove', (e) => {
    const r = el.app.getBoundingClientRect();
    const near = e.clientX - r.left <= 8 || r.right - e.clientX <= 8 || e.clientY - r.top <= 8 || r.bottom - e.clientY <= 8;
    edgeHover = near;
  });
  document.body.addEventListener('mouseleave', () => {
    hoverInside = false;
    // 统一为「鼠标离开主界面满 3 秒再收起」；边缘拖拽缩放也至少等 3 秒。
    // 这里只是一次性快路径，真正的可靠性由 autoRestTick 心跳兜底。
    const delay = 3000;
    edgeHover = false;
    if (document.activeElement === el.newTask && !el.newTask.value.trim()) {
      el.newTask.blur();
    }
    restSuppressUntil = Math.max(restSuppressUntil, Date.now() + delay);
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      if (canRest()) setMini(true);
    }, delay);
  });
  if (api.onWindowResizing) {
    api.onWindowResizing((on) => {
      windowResizing = !!on;
      clearTimeout(resizeSettleTimer);
      if (windowResizing) {
        clearTimeout(collapseTimer);
      } else {
        resizeSettleTimer = setTimeout(() => {
          if (!miniMode && !edgeHover && hoverInside === false) scheduleRest(3000);
        }, 700);
      }
    });
  }
  // 切换窗口：失焦自动收起，重新聚焦取消待执行的收起（与鼠标移入等价）
  if (api.onWindowFocus) {
    api.onWindowFocus((focused) => {
      windowFocused = !!focused;
      if (focused) {
        clearTimeout(collapseTimer);
        if (miniMode && !dragExpanding && Date.now() >= expandSuppressUntil) {
          clearTimeout(expandTimer);
          expandTimer = setTimeout(() => {
            if (miniMode && !dragExpanding && Date.now() >= expandSuppressUntil) setMini(false);
          }, 260);
        }
      } else {
        hoverInside = false;
        edgeHover = false;
        scheduleRest(3000);
      }
    });
  }
  // 页面切到后台标签页也自动收起（visibilitychange 不依赖鼠标事件）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hoverInside = false;
      windowFocused = false;
      scheduleRest(3000);
    } else {
      windowFocused = true;
      clearTimeout(collapseTimer);
    }
  });
  el.btnAddTeam.onclick = () => openTeamsPanel();
  el.btnNotice.onclick = () => openNoticeEditor();
  el.btnInvite.onclick = () => openInvitePanel();
  el.inviteClose.onclick = () => el.invitePanel.classList.add('hidden');
  el.inviteCopy.onclick = async () => {
    const team = activeTeam();
    if (!team || !team.state) return;
    await api.copy(team.state.inviteCode || '');
    toast('邀请码已复制');
  };
  el.inviteRegen.onclick = async () => {
    await regenerateInvite(activeTeam());
  };
  el.noticeClose.onclick = () => el.noticePanel.classList.add('hidden');
  el.noticeViewClose.onclick = () => el.noticeView.classList.add('hidden');
  el.noticeSave.onclick = async () => {
    const team = activeTeam();
    if (!team || team.kind === 'local') {
      toast('个人清单不发团队通知');
      return;
    }
    const text = el.noticeText.value.trim();
    if (!text) {
      if (!noticeEditId) {
        toast('先写点通知内容');
        return;
      }
      const r = await act(team.id, 'updateNotice', { id: noticeEditId, text: '' });
      if (r && r.ok) {
        el.noticeText.value = '';
        noticeEditId = '';
        el.noticePanel.classList.add('hidden');
        toast('通知已清空');
      }
      return;
    }
    const r = noticeEditId
      ? await act(team.id, 'updateNotice', { id: noticeEditId, text })
      : await act(team.id, 'addNotice', { text });
    if (r && r.ok) {
      el.noticeText.value = '';
      noticeEditId = '';
      el.noticePanel.classList.add('hidden');
    }
  };

  el.taskEditClose.onclick = () => closeTaskEditor();
  el.taskEditCancel.onclick = () => closeTaskEditor();
  el.taskEditSave.onclick = () => saveTaskEditor();
  el.taskEditText.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeTaskEditor(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveTaskEditor(); }
  });
  el.taskFileOpen.onclick = async () => {
    if (!taskEditCtx) return;
    const r = await api.openTaskFile({ teamId: taskEditCtx.teamId, taskId: taskEditCtx.id });
    if (!r || !r.ok) toast((r && r.error) || '打开文件失败');
  };
  el.taskFileFolder.onclick = async () => {
    if (!taskEditCtx) return;
    const r = await api.openTaskFolder({ teamId: taskEditCtx.teamId, taskId: taskEditCtx.id });
    if (!r || !r.ok) toast((r && r.error) || '打开文件夹失败');
  };
  el.taskFileUpload.onclick = () => {
    if (!taskEditCtx) return;
    const ctx = { mode: 'task', teamId: taskEditCtx.teamId, taskId: taskEditCtx.id };
    closeTaskEditor();
    openAttachPanel(ctx);
  };
  el.taskEditLinkUrl.onclick = () => openTaskEditLinkInput('url');
  el.taskEditLinkPath.onclick = () => openTaskEditLinkInput('path');
  el.taskEditLinkClear.onclick = () => {
    taskEditLinkType = '';
    taskEditLinkTarget = '';
    closeTaskEditLinkInput();
    renderTaskEditLink();
  };
  el.taskEditLinkOk.onclick = () => applyTaskEditLinkInput();
  el.taskEditLinkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyTaskEditLinkInput(); }
    if (e.key === 'Escape') { e.preventDefault(); closeTaskEditLinkInput(); }
  });
  el.taskSubmitBtn.onclick = async () => {
    if (!taskEditCtx) return;
    const { teamId, id } = taskEditCtx;
    closeTaskEditor();
    await toggleTask(teamId, id);
  };

  /* 任务文件弹窗 */
  el.attachClose.onclick = () => closeAttachPanel();
  el.attachCancel.onclick = () => closeAttachPanel();
  el.attachDrop.onclick = () => { try { el.attachInput.click(); } catch (e) { /* ignore */ } };
  if (el.attachPick) el.attachPick.onclick = () => { try { el.attachInput.click(); } catch (e) { /* ignore */ } };
  el.attachInput.addEventListener('change', () => {
    const f = el.attachInput.files && el.attachInput.files[0];
    pickAttachFile(f);
  });
  ['dragenter', 'dragover'].forEach((name) => el.attachDrop.addEventListener(name, (e) => {
    e.preventDefault();
    el.attachDrop.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((name) => el.attachDrop.addEventListener(name, (e) => {
    e.preventDefault();
    el.attachDrop.classList.remove('drag');
  }));
  el.attachDrop.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) pickAttachFile(f);
  });
  el.attachSave.onclick = () => saveAttachFile();

  /* 任务模板 */
  el.templateBtn.onclick = () => openTemplatePanel();
  el.templateClose.onclick = () => closeTemplatePanel();
  el.templateCancel.onclick = () => closeTemplatePanel();
  el.templateNew.onclick = () => newTemplateDraft();
  el.templateAddRow.onclick = () => {
    if (!templateDraft) return;
    if (templateDraft.fields.length >= 20) { toast('一个模板最多 20 行'); return; }
    templateDraft.fields.push({ label: '', value: '' });
    renderTemplateRows();
  };
  el.templateSave.onclick = () => saveTemplate();
  el.templatePanel.addEventListener('click', (e) => {
    if (e.target === el.templatePanel) closeTemplatePanel();
  });
  el.attachPanel.addEventListener('click', (e) => {
    if (e.target === el.attachPanel) closeAttachPanel();
  });
  el.taskEditPanel.addEventListener('click', (e) => {
    if (e.target === el.taskEditPanel) closeTaskEditor();
  });

  el.teamsClose.onclick = () => el.teamsPanel.classList.add('hidden');
  el.memberStatsClose.onclick = () => el.memberStatsPanel.classList.add('hidden');
  el.memberStatsPanel.addEventListener('click', (e) => {
    if (e.target === el.memberStatsPanel) el.memberStatsPanel.classList.add('hidden');
  });
  // 拖动窗口：不走系统 drag 区，改成主进程按“屏幕指针 + 窗口位置”直接算，
  // 这样高 DPI / 200% 缩放下也是 1:1，松开鼠标时窗口就在鼠标位置。
  // 展开态从顶栏拖；迷你态顶栏隐藏，就从小条本身拖，便于把小条放到屏幕任意位置。
  const barEl = document.querySelector('.bar');
  let dragOn = false;
  let dragRaf = 0;
  let dragFrom = null;
  let dragLast = null;
  let dragCaptureEl = null;
  const endDrag = (e) => {
    if (!dragOn) return;
    dragOn = false;
    dragExpanding = false;
    if (dragRaf) {
      cancelAnimationFrame(dragRaf);
      dragRaf = 0;
    }
    api.dragEnd();
    dragFrom = null;
    dragLast = null;
    try {
      if (dragCaptureEl) dragCaptureEl.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    dragCaptureEl = null;
  };
  const beginDrag = (e, captureEl) => {
    if (e.button !== 0) return;
    clearTimeout(expandTimer);
    if (miniMode) dragExpanding = true;
    dragOn = true;
    dragCaptureEl = captureEl;
    try {
      captureEl.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    api.dragStart();
    dragFrom = { x: e.screenX, y: e.screenY };
    dragLast = { x: e.screenX, y: e.screenY };
    e.preventDefault();
  };
  barEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button,input,.brand,.ctrls')) return;
    beginDrag(e, barEl);
  });
  // 迷你态：小条整体可拖动（隐藏的勾选框/按钮不拦，交给下面统一过滤）
  el.tasks.addEventListener('pointerdown', (e) => {
    if (!miniMode) return;
    if (e.target.closest('button,input,a')) return;
    beginDrag(e, el.app);
  });
  const onDragMove = (e) => {
    if (!dragOn) return;
    dragLast = { x: e.screenX, y: e.screenY };
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => {
      dragRaf = 0;
      if (dragFrom && dragLast) {
        api.dragMove(dragLast.x - dragFrom.x, dragLast.y - dragFrom.y);
      }
    });
  };
  barEl.addEventListener('pointermove', onDragMove);
  el.app.addEventListener('pointermove', onDragMove);
  barEl.addEventListener('pointerup', endDrag);
  barEl.addEventListener('pointercancel', endDrag);
  barEl.addEventListener('lostpointercapture', endDrag);
  el.app.addEventListener('pointerup', endDrag);
  el.app.addEventListener('pointercancel', endDrag);
  el.app.addEventListener('lostpointercapture', endDrag);
  // 左上角头像/名字：个人视图打开团队与设置；团队视图只通过右侧齿轮进群管理
  el.brandBtn.onclick = () => {
    const team = activeTeam();
    if (team && team.kind !== 'local') return;
    openTeamsPanel();
  };
  el.brandGear.onclick = (e) => {
    e.stopPropagation();
    const team = activeTeam();
    if (team && team.kind !== 'local') openTeamPanel(team.id);
  };
  el.brandGear.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.teamNameEdit.onclick = beginTeamRename;
  el.teamNameSave.onclick = saveTeamName;
  el.teamNameInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTeamName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      renderTeamPanel(openTeamId);
    }
  };
  el.teamClose.onclick = () => el.teamPanel.classList.add('hidden');
  el.teamFilesOpen.onclick = async () => {
    const team = teamById(openTeamId);
    const p = team && (team.filesRoot || (team.state && team.state.filesRoot));
    if (!p) return;
    const r = await api.openPath(p);
    if (!r || !r.ok) toast((r && r.error) || '打开文件夹失败');
  };
  el.teamFilesChange.onclick = async () => {
    const team = teamById(openTeamId);
    if (!team || team.kind !== 'host' || !canManage(team)) return;
    const current = team.filesRoot || (team.state && team.state.filesRoot) || '';
    const picked = await api.pickFolder(current);
    if (!picked || !picked.ok) {
      if (picked && !picked.canceled) toast(picked.error || '选择文件夹失败');
      return;
    }
    const oldText = el.teamFilesChange.textContent;
    el.teamFilesChange.disabled = true;
    el.teamFilesChange.textContent = '迁移中…';
    const r = await api.changeTeamFilesRoot({ teamId: team.id, root: picked.path });
    el.teamFilesChange.disabled = false;
    el.teamFilesChange.textContent = oldText || '修改位置';
    if (!r || !r.ok) {
      if (r && !r.canceled) toast(r.error || '修改文件位置失败');
      return;
    }
    await refresh();
    renderTeamPanel(team.id);
    toast(r.copied ? `已切换位置，复制了 ${r.copied} 个文件` : '文件存放位置已修改');
  };
  el.confirmCancel.onclick = () => settleConfirm(false);
  el.confirmOk.onclick = () => settleConfirm(true);
  el.confirmPanel.addEventListener('click', (e) => {
    if (e.target === el.confirmPanel) settleConfirm(false);
  });
  el.doneClose.onclick = () => el.donePanel.classList.add('hidden');

  el.btnPin.onclick = async () => {
    S.pin = await api.pin(!S.pin);
    render();
  };

  el.btnNameOk.onclick = async () => {
    const name = el.nameInput.value.trim();
    if (!name) { el.nameInput.focus(); return; }
    await api.setProfile({ name, avatar: draftAvatar || S.avatar });
    await refresh();
  };
  el.nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.btnNameOk.click();
  });

  el.saveName.onclick = async () => {
    const name = el.myNameInput.value.trim();
    if (!name) return;
    await api.setProfile({ name, avatar: draftAvatar || S.avatar });
    draftAvatar = '';
    await refresh();
    toast('已保存');
  };
  el.themeSeg.querySelectorAll('button').forEach((b) => {
    b.onclick = async () => {
      await api.setTheme(b.dataset.theme);
      await refresh();
    };
  });
  el.fontSeg.querySelectorAll('button').forEach((b) => {
    b.onclick = async () => {
      await api.setFont(b.dataset.font);
      await refresh();
    };
  });
  el.langSeg.querySelectorAll('button').forEach((b) => {
    b.onclick = async () => {
      await api.setLang(b.dataset.lang);
      await refresh();
    };
  });

  el.teamFilesPick.onclick = async () => {
    const r = await api.pickFolder(el.teamFilesPath.value || (S && S.taskFilesRoot) || '');
    if (!r || !r.ok) {
      if (r && !r.canceled) toast(r.error || '选择文件夹失败');
      return;
    }
    el.teamFilesPath.value = r.path;
    el.teamFilesTip.textContent = '文件会保存到这个文件夹里；NAS、共享盘或云盘请先确保创建者电脑能正常读写。';
  };

  el.btnCreate.onclick = async () => {
    const bn = el.boardNameInput.value.trim() || '我的团队';
    const filesRoot = el.teamFilesPath.value.trim();
    el.teamsErr.textContent = '';
    el.btnCreate.disabled = true;
    const r = await api.createTeam({ boardName: bn, filesRoot });
    el.btnCreate.disabled = false;
    if (!r.ok) { el.teamsErr.textContent = r.error || '创建失败'; return; }
    el.boardNameInput.value = '';
    el.teamFilesPath.value = (S && S.taskFilesRoot) || '';
    el.teamsPanel.classList.add('hidden');
    await refresh();
    setTimeout(() => el.newTask.focus(), 200);
  };
  el.btnJoin.onclick = () => doJoin(el.codeInput.value.trim(), el.manualHost.value.trim());
  el.codeInput.addEventListener('input', () => {
    el.codeInput.value = el.codeInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  });
  el.codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.btnJoin.click();
  });
  el.btnCancelWait.onclick = async () => {
    await api.cancelJoin();
    await refresh();
    toast('已取消申请');
  };
  el.btnCopy.onclick = async () => {
    const team = teamById(openTeamId);
    if (!team || !team.state) return;
    await api.copy(team.state.inviteCode);
    toast('邀请码已复制');
  };
  el.btnRegen.onclick = async () => {
    await regenerateInvite(teamById(openTeamId));
  };
  el.btnDeviceLink.onclick = generateDeviceLink;
  el.btnDeviceSave.onclick = saveDeviceCode;
  el.btnDeviceReset.onclick = resetDeviceCode;
  if (el.btnViewerSave) el.btnViewerSave.onclick = saveViewerCode;
  if (el.btnViewerReset) el.btnViewerReset.onclick = resetViewerCode;
  if (el.viewerCodeInput) el.viewerCodeInput.addEventListener('input', () => {
    el.viewerCodeInput.value = el.viewerCodeInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  });
  if (el.deviceKindSeg) el.deviceKindSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.segBtn');
    if (!b) return;
    deviceKind = b.dataset.kind === 'viewer' ? 'viewer' : 'member';
    const team = teamById(openTeamId);
    if (team) renderDeviceBox(team);
  });
  el.deviceMember.onchange = () => {
    const team = teamById(openTeamId);
    if (!team) return;
    deviceSelected.set(team.id, el.deviceMember.value);
    renderDeviceBox(team);
  };
  el.deviceCodeInput.addEventListener('input', () => {
    el.deviceCodeInput.value = el.deviceCodeInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  });
  el.deviceCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.btnDeviceSave.click();
  });
  el.btnDeviceCopy.onclick = async () => {
    const team = teamById(openTeamId);
    const member = team && deviceSelectedMember(team.id);
    const link = team && member && deviceLinks.get(`${team.id}:${member.id}`);
    if (!link) {
      toast('先为这个成员生成登录链接');
      return;
    }
    await api.copy(link.url);
    toast('登录链接已复制');
  };
  el.btnLeave.onclick = async () => {
    const team = teamById(openTeamId);
    if (!team) return;
    const isDissolve = team.kind === 'host';
    const msg = isDissolve
      ? `退出会解散「${team.name}」：同事将连不上这个团队。已接收 / 已完成的任务会转存到「我的任务」里，可以手动删。继续？`
      : `退出「${team.name}」？已接收和已完成的任务会转存到「我的任务」里（不会自动删除），可以手动删。`;
    if (!(await askConfirm(msg, {
      title: isDissolve ? '退出并解散团队？' : '退出这个团队？',
      okText: isDissolve ? '退出并解散' : '退出',
      danger: true
    }))) return;
    const r = await api.leaveTeam(team.id);
    if (!r.ok) return toast(r.error || '退出失败');
    el.teamPanel.classList.add('hidden');
    el.teamsPanel.classList.add('hidden');
    openTeamId = null;
    await refresh();
    toast('已退出，任务已转存到「我的任务」');
  };

  /* 任务列表事件 */
  el.newTask.addEventListener('keydown', async (e) => {
    // Enter 发布；Shift+Enter / Ctrl+Enter（含 Cmd+Enter）都换行。
    // 输入法组字过程中的 Enter 是「选字」，不能触发发布。
    if (e.key !== 'Enter') return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    // 个人任务：Enter 直接发布。
    // 团队任务：先弹确认框，默认焦点在「确认发布」按钮（Enter 即发布），
    //          按 Esc 或点「取消」则放弃；Shift/Ctrl+Enter 仍是换行，不受影响。
    if (!isPersonalView()) {
      // 阻止本次 Enter 冒泡到 window 的确认框键盘处理器，避免刚弹出就被立刻确认
      e.stopPropagation();
      const ok = await askConfirm(
        trText('确定发布这条团队任务？团队所有可见成员都能看到。'),
        {
          title: trText('发布团队任务？'),
          okText: trText('确认发布'),
          cancelText: trText('取消'),
          defaultOk: true
        }
      );
      if (!ok) return;
    }
    addTask();
  });
  el.newTask.addEventListener('input', autoGrowTask);
  el.newTask.addEventListener('focus', autoGrowTask);
  el.btnAddTask.onclick = () => addTask();
  if (el.btnMiniNow) {
    el.btnMiniNow.onclick = () => {
      // 马上收成迷你条：跳过 canRest 的鼠标/面板/输入框等守卫，立即执行。
      // 关掉任何面板与菜单，输入框失焦，避免收起后残留浮层或误触。
      closeMenu();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      clearTimeout(collapseTimer);
      clearTimeout(expandTimer);
      clearTimeout(edgeLeaveTimer);
      hoverInside = false;
      edgeHover = false;
      // 收起后鼠标仍压在按钮原位置（现在是迷你条区域），短暂压制 hover 展开，
      // 等用户真正把鼠标移走再移回来才展开。
      expandSuppressUntil = Date.now() + 700;
      setMini(true);
    };
  }
  window.addEventListener('resize', autoGrowTask);
  el.linkUrlBtn.onclick = () => openLinkEditor('url');
  el.linkPathBtn.onclick = () => openAttachPanel({ mode: 'composer' });
  el.linkSave.onclick = saveLinkEditor;
  el.linkClear.onclick = () => {
    resetPendingLink();
    toast('已清除链接');
  };
  el.linkEditorClose.onclick = () => closeLinkEditor();
  el.linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveLinkEditor(); }
    if (e.key === 'Escape') { e.preventDefault(); closeLinkEditor(); }
  });
  el.audienceChip.onclick = () => openAudienceMenu();
  el.dueBtn.onclick = () => openDueSheet('new');
  el.dueClose.onclick = closeDueSheet;
  el.dueCancel.onclick = closeDueSheet;
  el.dueCalBtn.onclick = openDuePicker;
  el.dueTime.onclick = openDuePicker;
  el.calPrev.onclick = () => {
    pickerViewMonth = new Date(pickerViewMonth.getFullYear(), pickerViewMonth.getMonth() - 1, 1);
    renderCalendar();
  };
  el.calNext.onclick = () => {
    pickerViewMonth = new Date(pickerViewMonth.getFullYear(), pickerViewMonth.getMonth() + 1, 1);
    renderCalendar();
  };
  el.dateCancel.onclick = showDueMain;
  el.dateOk.onclick = confirmDuePicker;
  el.clearDue.onclick = () => {
    el.dueTime.value = '';
    sheetDue = 0;
  };
  el.dueSave.onclick = saveDueSheet;

  el.tasks.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.id;
    const teamId = row.dataset.team;
    if (e.target.closest('.cb')) return void toggleTask(teamId, id, { personal: isPersonalView() });
    if (e.target.closest('.submitFile')) return void openAttachPanel({ mode: 'submit', teamId, taskId: id });
    if (e.target.closest('.assignee')) return void openMenu(teamId, id, e.target.closest('.assignee'));
    if (e.target.closest('.del')) return void deleteTask(teamId, id);
  });
  el.tasks.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    if (e.target.closest('a.lnk,.cb,.del,.assignee,.submitFile,.taskLink,.pinTag')) return;
    startEdit(row.dataset.team, row.dataset.id);
  });

  /* 已完成 */
  el.doneBar.onclick = () => {
    el.donePanel.classList.remove('hidden');
    el.doneSearch.value = '';
    doneQuery = '';
    el.clearSearch.classList.add('hidden');
    renderDoneList();
    setTimeout(() => el.doneSearch.focus(), 100);
  };
  el.doneSearch.addEventListener('input', () => {
    doneQuery = el.doneSearch.value;
    el.clearSearch.classList.toggle('hidden', !doneQuery);
    renderDoneList();
  });
  el.clearSearch.onclick = () => {
    el.doneSearch.value = '';
    doneQuery = '';
    el.clearSearch.classList.add('hidden');
    renderDoneList();
    el.doneSearch.focus();
  };
  el.doneAll.addEventListener('dblclick', async (e) => {
    const row = e.target.closest('.dRow');
    if (!row) return;
    const team = teamById(row.dataset.team);
    const t = taskById(team, row.dataset.id);
    if (!team || !t) return;
    if (row.dataset.closed === '1') {
      if (!canEdit(team, t)) {
        toast('这条任务已被关闭，记录保留在这里');
        return;
      }
      if (!(await askConfirm('彻底删除这条「已关闭」记录？删了就不在已完成里了。', {
        title: '删除已完成记录？', okText: '删除', danger: true
      }))) return;
      await act(team.id, 'deleteTask', { id: t.id });
      renderDoneList();
      return;
    }
    await toggleTask(row.dataset.team, row.dataset.id);
    renderDoneList();
  });

  window.addEventListener('keydown', (e) => {
    if (!confirmResolver) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      settleConfirm(false);
    } else if (e.key === 'Enter') {
      // defaultOk（如团队任务发布）：Enter 直接确认；只有焦点落在取消按钮时才放弃。
      // 危险操作弹窗（默认取消）：保持原行为，焦点在取消按钮时 Enter = 取消。
      if (confirmDefaultOk) {
        e.preventDefault();
        settleConfirm(document.activeElement !== el.confirmCancel);
      } else if (document.activeElement === el.confirmCancel) {
        e.preventDefault();
        settleConfirm(false);
      }
    }
  });
  window.addEventListener('resize', closeMenu);
  // 兜底心跳：鼠标离开主界面满 3 秒自动收成迷你条（不依赖一次性 mouseleave 事件）
  setInterval(autoRestTick, 500);
}

/* ---------------- 启动 ---------------- */
async function init() {
  bind();
  api.onState((v) => {
    S = v;
    render();
    checkFileUpdates();
  });
  api.onOpenTask(async ({ teamId, taskId }) => {
    if (!teamId) return;
    try {
      await api.switchTeam(teamId);
      S = await api.getState();
      render();
      if (taskId && taskById(teamById(teamId), taskId)) startEdit(teamId, taskId);
    } catch (e) {
      /* ignore */
    }
  });
  S = await api.getState();
  el.nameInput.value = S.named ? S.myName : '';
  draftAvatar = S.avatar;
  el.nameAvatar.textContent = draftAvatar;
  const paintName = (a) => {
    draftAvatar = a;
    el.nameAvatar.textContent = a;
    renderAvatarPicker(el.avatarGrid, a, paintName);
  };
  renderAvatarPicker(el.avatarGrid, draftAvatar, paintName);
  startInviteClock();
  render();
  checkFileUpdates();
  maybeAiInstallPrompt();
  if (S.named === false) setTimeout(() => el.nameInput.focus(), 200);
}

init();
})();
