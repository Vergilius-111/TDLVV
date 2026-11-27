'use strict';
// 任务文件落盘：安装目录下的 task-files 子目录（不可写时回退到用户数据目录）
const fs = require('fs');
const path = require('path');

function safePart(v, max = 80) {
  return String(v || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || '_';
}

function safeName(v, max = 100) {
  const raw = String(v || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  if (!raw) return '任务文件';
  return raw.slice(0, max);
}

function fileParts(name) {
  const clean = safeName(name);
  const ext = path.extname(clean).slice(0, 20);
  const base = ext ? clean.slice(0, -ext.length) : clean;
  return { base: safeName(base, 80), ext };
}

/** 任务文件夹的相对路径：<团队>/<任务标题>；只做纯字符串计算，方便放进同步 state */
function taskFolderRel(boardId, taskName, taskId) {
  const board = safePart(boardId, 40);
  const title = safeName(taskName || '未命名任务', 50);
  return `${board}/${title}`;
}

/** 真正建目录。同名文件夹已属于别的任务时追加短 id，避免互相覆盖 */
function ensureTaskFolder(root, rel, taskId) {
  const baseRoot = path.resolve(root);
  const wanted = String(rel || taskFolderRel('', '未命名任务', taskId)).replace(/\\/g, '/');
  let finalRel = wanted;
  for (let i = 0; i < 20; i++) {
    const abs = path.resolve(baseRoot, finalRel);
    if (abs !== baseRoot && !abs.startsWith(baseRoot + path.sep)) break;
    const marker = path.join(abs, '.tdlvv-task.json');
    let owner = '';
    try {
      if (fs.existsSync(marker)) owner = String(JSON.parse(fs.readFileSync(marker, 'utf8')).taskId || '');
    } catch (e) { owner = ''; }
    if (!owner || owner === String(taskId)) break;
    finalRel = `${wanted}-${safePart(taskId, 4)}${i ? `-${i + 1}` : ''}`;
  }
  const abs = path.resolve(baseRoot, finalRel);
  if (abs === baseRoot || !abs.startsWith(baseRoot + path.sep)) return '';
  try {
    fs.mkdirSync(abs, { recursive: true });
    const marker = path.join(abs, '.tdlvv-task.json');
    if (!fs.existsSync(marker)) {
      fs.writeFileSync(marker, JSON.stringify({ taskId: String(taskId || ''), createdAt: Date.now() }));
    }
  } catch (e) {
    return '';
  }
  return finalRel.replace(/\\/g, '/');
}

function createStore(root) {
  const baseRoot = path.resolve(root);
  fs.mkdirSync(baseRoot, { recursive: true });

  function resolve(rel) {
    const clean = String(rel || '').replace(/\\/g, '/');
    if (!clean || clean.includes('..')) return '';
    const abs = path.resolve(baseRoot, clean);
    if (abs !== baseRoot && !abs.startsWith(baseRoot + path.sep)) return '';
    return abs;
  }

  function writeAtomic(abs, buffer) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    fs.writeFileSync(tmp, buffer);
    try {
      fs.renameSync(tmp, abs);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch (err) { /* ignore */ }
      throw e;
    }
  }

  function makeName(opts, memberName) {
    const { base, ext } = fileParts(opts.originalName || opts.displayName || '任务文件');
    const sourceSuffix = opts.sourceMemberName ? `-${safeName(opts.sourceMemberName, 20)}` : '';
    const cleanBase = sourceSuffix && base.endsWith(sourceSuffix)
      ? base.slice(0, -sourceSuffix.length)
      : base;
    const suffix = memberName ? `-${memberName}` : '';
    return {
      displayName: safeName(`${cleanBase}${cleanBase.endsWith(suffix) ? '' : suffix}${ext}`, 120),
      ext
    };
  }

  /**
   * 保存一个版本：<根目录>/<boardId>/<taskId>/v<version>/<原文件名>-<成员名><后缀>
   * 返回的 storedRel 是相对路径，可安全放进同步 state
   */
  function saveVersion(opts) {
    const boardId = safePart(opts.boardId, 40);
    const taskId = safePart(opts.taskId, 40);
    const version = Math.max(1, Math.floor(Number(opts.version) || 1));
    const memberName = safeName(opts.memberName || '', 20);
    const { displayName, ext } = makeName(opts, memberName);
    const relDir = `${boardId}/${taskId}/v${version}`;
    const storedRel = `${relDir}/${displayName}`.replace(/\\/g, '/');
    const abs = path.join(baseRoot, boardId, taskId, `v${version}`, displayName);
    writeAtomic(abs, opts.buffer);
    return {
      displayName,
      storedRel,
      size: Buffer.isBuffer(opts.buffer) ? opts.buffer.length : Number(opts.buffer && opts.buffer.length) || 0,
      ext,
      version
    };
  }

  /**
   * 成员个人副本：每个成员一个固定目录，文件名固定为“原文件名-成员名.后缀”。
   * 成员再次保存时覆盖自己的副本，不碰创建者原稿，也不影响其他成员。
   */
  function saveMemberCopy(opts) {
    const boardId = safePart(opts.boardId, 40);
    const taskId = safePart(opts.taskId, 40);
    const memberId = safePart(opts.memberId, 40);
    const memberName = safeName(opts.memberName || '', 20);
    const version = Math.max(1, Math.floor(Number(opts.version) || 1));
    const { displayName, ext } = makeName(opts, memberName);
    const relDir = `${boardId}/${taskId}/members/${memberId}`;
    const storedRel = `${relDir}/${displayName}`.replace(/\\/g, '/');
    const abs = path.join(baseRoot, boardId, taskId, 'members', memberId, displayName);
    writeAtomic(abs, opts.buffer);
    return {
      displayName,
      storedRel,
      size: Buffer.isBuffer(opts.buffer) ? opts.buffer.length : Number(opts.buffer && opts.buffer.length) || 0,
      ext,
      version
    };
  }

  function remove(rel) {
    const abs = resolve(rel);
    if (!abs) return false;
    try {
      fs.unlinkSync(abs);
      return true;
    } catch (e) {
      return false;
    }
  }

  return { root: baseRoot, resolve, saveVersion, saveMemberCopy, remove };
}

/** 优先安装目录 task-files；不可写则回退 userData/task-files */
function pickRoot(opts) {
  const o = opts || {};
  const fallback = path.join(o.userData || baseRoot(o), 'task-files');
  const preferred = o.installDir ? path.join(o.installDir, 'task-files') : fallback;
  for (const dir of [preferred, fallback]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (e) {
      /* try next */
    }
  }
  return fallback;
}

function baseRoot(o) {
  return path.resolve(o.userData || process.cwd());
}

module.exports = { createStore, pickRoot, safeName, fileParts, taskFolderRel, ensureTaskFolder };
