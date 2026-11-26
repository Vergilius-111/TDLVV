'use strict';
const backup = require('./backup');
const persist = require('./persist');

function dialogStrings(lang) {
  const en = lang === 'en';
  return {
    exportTitle: en ? 'Export TDLVV backup' : '导出 TDLVV 备份',
    importTitle: en ? 'Import TDLVV backup' : '导入 TDLVV 备份',
    filter: en ? 'TDLVV backup' : 'TDLVV 备份',
    documents: en ? 'Save a copy of teams, tasks, settings and access tokens.' : '保存团队、任务、设置和登录令牌，请妥善保管。'
  };
}

function importedPrefs(p) {
  const x = p && typeof p === 'object' ? p : {};
  return {
    name: x.named ? String(x.name || '').slice(0, 12) : '',
    named: !!x.named,
    avatar: String(x.avatar || ''),
    theme: ['dark', 'light', 'system'].includes(x.theme) ? x.theme : 'system',
    fontSize: ['s', 'm', 'l'].includes(x.fontSize) ? x.fontSize : 'm',
    lang: ['zh', 'en'].includes(x.lang) ? x.lang : 'zh',
    pin: !!x.pin,
    fired: x.fired && typeof x.fired === 'object' ? x.fired : {},
    bounds: x.bounds && typeof x.bounds === 'object' ? x.bounds : null,
    autoStart: x.autoStart === undefined ? true : !!x.autoStart,
    notifyTasks: x.notifyTasks === undefined ? true : !!x.notifyTasks,
    notifyDue: x.notifyDue === undefined ? true : !!x.notifyDue,
    aiInstall: !!x.aiInstall,
    aiGreeted: !!x.aiGreeted
  };
}

function importedTeams(list) {
  return list.map((t) => ({
    id: String(t.id).slice(0, 64),
    kind: t.kind,
    name: String(t.name || (t.state && t.state.boardName) || '团队').slice(0, 80),
    meId: String(t.meId || ''),
    code: String(t.code || ''),
    baseUrl: String(t.baseUrl || ''),
    token: String(t.token || ''),
    tokens: t.tokens && typeof t.tokens === 'object' ? t.tokens : {},
    seenTaskIds: Array.isArray(t.seenTaskIds) ? t.seenTaskIds.slice(-5000) : null,
    filesRoot: String(t.filesRoot || '').slice(0, 1000),
    state: t.state
  }));
}

function prepareImport(data) {
  const valid = backup.validate(data);
  if (!valid.ok) return valid;
  const teams = importedTeams(data.teams);
  const local = teams.find((t) => t.kind === 'local');
  if (!local) return { ok: false, error: '备份里没有个人清单' };
  const activeId = teams.some((t) => t.id === data.activeId) ? data.activeId : local.id;
  return {
    ok: true,
    teams,
    activeId,
    prefs: importedPrefs(data.prefs),
    count: teams.length,
    tasks: valid.tasks
  };
}

function applyImport(data, opts) {
  const prep = prepareImport(data);
  if (!prep.ok) return prep;
  try {
    opts.backupBeforeImport();
  } catch (e) {
    return { ok: false, error: '当前数据备份失败，已取消导入' };
  }
  try {
    persist.writeJson(opts.teamsPath, { v: 3, activeId: prep.activeId, teams: prep.teams });
    persist.writeJson(opts.prefsPath, prep.prefs);
  } catch (e) {
    return { ok: false, error: '写入备份数据失败，当前数据未被替换' };
  }
  return { ok: true, teams: prep.count, tasks: prep.tasks };
}

module.exports = { dialogStrings, importedPrefs, importedTeams, prepareImport, applyImport };
