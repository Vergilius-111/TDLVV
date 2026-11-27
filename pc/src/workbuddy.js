'use strict';
// WorkBuddy 唤起助手：复用「之前对话过的会话窗口」，找不到才新建对话。
//
// WorkBuddy 官方深链：
//   workbuddy://chat/<sessionId>  —— 在已有窗口里打开/聚焦指定会话（复用窗口）
//   workbuddy://home              —— 打开首页新建对话
// 会话 ID 就是 ~/.workbuddy/projects/<项目slug>/<sessionId>.jsonl 的文件名。
const fs = require('fs');
const path = require('path');
const os = require('os');

function configRoot() {
  return process.env.WORKBUDDY_CONFIG_DIR || process.env.CODEBUDDY_CONFIG_DIR || path.join(os.homedir(), '.workbuddy');
}

function projectsRoot() {
  return path.join(configRoot(), 'projects');
}

function chatUrl(id) {
  return 'workbuddy://chat/' + encodeURIComponent(String(id || ''));
}

function homeUrl() {
  return 'workbuddy://home';
}

/** 读取 TDLVV 记住的汇总会话 ID */
function readRemembered(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof data.sessionId === 'string' && data.sessionId ? data.sessionId : '';
  } catch (e) {
    return '';
  }
}

/** 记住汇总会话 ID */
function writeRemembered(file, sessionId) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ sessionId: String(sessionId || ''), updatedAt: Date.now() }), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 列出 WorkBuddy 全部会话文件，按修改时间降序。
 * 每项 { id, file, mtimeMs, slug }。
 */
function listSessions(root) {
  const dir = root || projectsRoot();
  const out = [];
  let slugs = [];
  try {
    slugs = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const ent of slugs) {
    if (!ent.isDirectory()) continue;
    const sub = path.join(dir, ent.name);
    let files = [];
    try {
      files = fs.readdirSync(sub);
    } catch (e) {
      continue;
    }
    for (const f of files) {
      if (!/\.jsonl$/i.test(f)) continue;
      const full = path.join(sub, f);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        out.push({ id: f.replace(/\.jsonl$/i, ''), file: full, mtimeMs: st.mtimeMs, slug: ent.name });
      } catch (e) {
        /* ignore */
      }
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

/** 某个会话 ID 的 jsonl 是否仍存在 */
function findSession(sessionId, root) {
  if (!sessionId || !/^[A-Za-z0-9._-]+$/.test(sessionId)) return null;
  return listSessions(root).find((s) => s.id === sessionId) || null;
}

/** 最近对话过的会话 */
function latestSession(root) {
  const list = listSessions(root);
  return list.length ? list[0] : null;
}

/**
 * 决定本次唤起方式。
 * 优先级：已记住且仍有效的会话 > 最近对话过的会话 > 新建对话。
 * 返回 { id, mode: 'reuse' | 'reuse-recent' | 'new', url }。
 */
function planLaunch(memoryFile, root) {
  const remembered = readRemembered(memoryFile);
  if (remembered && findSession(remembered, root)) {
    return { id: remembered, mode: 'reuse', url: chatUrl(remembered) };
  }
  const latest = latestSession(root);
  if (latest) {
    writeRemembered(memoryFile, latest.id);
    return { id: latest.id, mode: 'reuse-recent', url: chatUrl(latest.id) };
  }
  return { id: '', mode: 'new', url: homeUrl() };
}

module.exports = {
  configRoot,
  projectsRoot,
  chatUrl,
  homeUrl,
  readRemembered,
  writeRemembered,
  listSessions,
  findSession,
  latestSession,
  planLaunch
};
