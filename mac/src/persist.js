'use strict';
const fs = require('fs');
const path = require('path');

/**
 * 原子写文件：先写同目录临时文件并 fsync，再 rename 覆盖目标文件。
 * 断电或进程被杀时，要么还是旧文件，要么已经是完整的新文件，不会留下半截 JSON。
 */
function atomicWrite(file, text, opts) {
  const o = opts || {};
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w', o.mode === undefined ? 0o600 : o.mode);
    fs.writeFileSync(fd, text);
    try {
      fs.fsyncSync(fd);
    } catch (e) {
      /* 某些文件系统不支持 fsync，不影响 rename 的完整性 */
    }
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, file);
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (e) { /* ignore */ }
    }
    try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    throw err;
  }
}

function writeJson(file, obj, opts) {
  atomicWrite(file, JSON.stringify(obj), opts);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { atomicWrite, writeJson, readJson };
