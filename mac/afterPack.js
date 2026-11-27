'use strict';
// macOS 安装包里的 cloudflared 必须可执行；在 Windows 上制作源码包时 chmod 不会生效，
// 所以打包阶段在目标产物上显式补一次执行位。
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  const name = context.arch === 'arm64' ? 'cloudflared-mac-arm64' : 'cloudflared-mac-x64';
  const target = path.join(context.appOutDir, 'resources', name);
  try {
    fs.chmodSync(target, 0o755);
  } catch (e) {
    /* 文件不存在时由 electron-builder 自己报错 */
  }
};
