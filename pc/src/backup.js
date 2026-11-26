'use strict';
const fs = require('fs');
const path = require('path');
const persist = require('./persist');

const AUTO_KEEP = 7;
const AUTO_RE = /^TDLVV-backup-(\d{4})-(\d{2})-(\d{2})\.json$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateStamp(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function timeStamp(d) {
  const x = d || new Date();
  return `${dateStamp(x)}-${pad(x.getHours())}${pad(x.getMinutes())}`;
}

function dailyName(d) {
  return `TDLVV-backup-${dateStamp(d)}.json`;
}

function listDaily(dir) {
  try {
    return fs.readdirSync(dir).filter((n) => AUTO_RE.test(n)).sort();
  } catch (e) {
    return [];
  }
}

function prune(dir, keep) {
  const files = listDaily(dir);
  const max = keep === undefined ? AUTO_KEEP : keep;
  while (files.length > max) {
    const old = files.shift();
    try { fs.unlinkSync(path.join(dir, old)); } catch (e) { /* ignore */ }
  }
}

function writeDaily(dir, payload, now) {
  const d = now || new Date();
  const name = dailyName(d);
  persist.writeJson(path.join(dir, name), payload, { mode: 0o600 });
  persist.writeJson(path.join(dir, 'latest.json'), payload, { mode: 0o600 });
  prune(dir, AUTO_KEEP);
  return name;
}

function writeManual(dir, payload, label, now) {
  const tag = label ? `-${String(label).replace(/[^0-9A-Za-z_-]/g, '')}` : '';
  const name = `TDLVV-before-import-${timeStamp(now)}${tag}.json`;
  persist.writeJson(path.join(dir, name), payload, { mode: 0o600 });
  return name;
}

function readLatest(dir) {
  const candidates = ['latest.json'].concat(listDaily(dir).reverse());
  for (const name of candidates) {
    try {
      return persist.readJson(path.join(dir, name));
    } catch (e) {
      /* 继续找下一份 */
    }
  }
  return null;
}

function validate(data) {
  if (!data || typeof data !== 'object') return { ok: false, error: '备份文件内容为空' };
  if (data.type !== 'tdlvv-backup') return { ok: false, error: '不是有效的 TDLVV 备份文件' };
  if (!Array.isArray(data.teams) || !data.teams.length) return { ok: false, error: '备份里没有团队数据' };
  let tasks = 0;
  for (const t of data.teams) {
    if (!t || typeof t.id !== 'string' || !t.id) return { ok: false, error: '团队数据缺少 id' };
    if (!['local', 'host', 'client'].includes(t.kind)) return { ok: false, error: '团队类型无效' };
    if (!t.state || !Array.isArray(t.state.tasks) || !Array.isArray(t.state.members)) {
      return { ok: false, error: '团队状态不完整' };
    }
    tasks += t.state.tasks.length;
  }
  return { ok: true, teams: data.teams.length, tasks };
}

module.exports = {
  AUTO_KEEP,
  dateStamp,
  timeStamp,
  dailyName,
  listDaily,
  prune,
  writeDaily,
  writeManual,
  readLatest,
  validate
};
