'use strict';
// 团队文件根目录：路径校验、文件收集与跨目录迁移
const fs = require('fs');
const path = require('path');
const os = require('os');

function expandHome(p) {
  const s = String(p || '').trim();
  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) return path.join(os.homedir(), s.slice(1));
  return s;
}

function normalizeStorageRoot(raw, fallbackRoot) {
  let p = expandHome(raw);
  if (!p) p = fallbackRoot;
  if (!path.isAbsolute(p)) throw new Error('请填写完整路径（服务器共享盘或已同步的云盘文件夹）');
  p = path.resolve(p);
  try {
    const st = fs.existsSync(p) ? fs.statSync(p) : null;
    if (st && !st.isDirectory()) throw new Error('这个路径是文件，不是文件夹');
    fs.mkdirSync(p, { recursive: true });
    fs.accessSync(p, fs.constants.W_OK);
  } catch (e) {
    throw new Error(`目录不可写：${e.message}`);
  }
  return p;
}

function pathContains(parent, child) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function fileMetaRoot(meta, fallback) {
  return path.resolve(String((meta && meta.root) || fallback || ''));
}

function collectFileMetas(state, fallbackRoot) {
  const out = [];
  const add = (meta) => {
    if (!meta || !meta.storedRel) return;
    const root = fileMetaRoot(meta, fallbackRoot);
    if (!out.some((x) => x.storedRel === meta.storedRel && fileMetaRoot(x, fallbackRoot) === root)) out.push(meta);
  };
  ((state && state.tasks) || []).forEach((t) => {
    add(t.file);
    add(t.pendingFile);
    Object.values(t.memberFiles || {}).forEach(add);
  });
  return out;
}

async function copyOneFile(srcRoot, destRoot, meta, storeForRoot) {
  const src = storeForRoot(srcRoot).resolve(meta.storedRel);
  const dest = storeForRoot(destRoot).resolve(meta.storedRel);
  if (!src || !fs.existsSync(src)) throw new Error(`原文件不存在：${meta.displayName || meta.storedRel}`);
  if (src === dest) return false;
  if (fs.existsSync(dest)) {
    const a = fs.statSync(src);
    const b = fs.statSync(dest);
    if (a.size === b.size) return false;
    throw new Error(`目标位置已有同名文件：${meta.displayName || meta.storedRel}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await fs.promises.copyFile(src, dest);
  return true;
}

async function copyAllFilesToRoot(state, oldRoot, newRoot, storeForRoot) {
  const metas = collectFileMetas(state, oldRoot);
  for (const meta of metas) {
    const sourceRoot = fileMetaRoot(meta, oldRoot);
    await copyOneFile(sourceRoot, newRoot, meta, storeForRoot);
  }
  metas.forEach((meta) => { meta.root = newRoot; });
  return metas.length;
}

function markLegacyFilesRoot(state, oldRoot) {
  const metas = collectFileMetas(state, oldRoot);
  metas.forEach((meta) => {
    if (!meta.root) meta.root = oldRoot;
  });
  return metas.length;
}

module.exports = {
  expandHome,
  normalizeStorageRoot,
  pathContains,
  fileMetaRoot,
  collectFileMetas,
  copyOneFile,
  copyAllFilesToRoot,
  markLegacyFilesRoot
};
