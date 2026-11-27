'use strict';
// 当前用户没有创建符号链接的权限，electron-builder 解压 winCodeSign 会失败，
// 因此打包配置里关掉了 signAndEditExecutable。这里在打包后用 rcedit 直接给
// exe 写回图标和版本信息，避免安装包显示成 Electron 默认图标。
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function afterPack(context) {
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const ico = path.join(__dirname, 'build', 'icon.ico');
  const rcedit = path.join(__dirname, 'bin', 'rcedit-x64.exe');
  if (!fs.existsSync(exe) || !fs.existsSync(ico) || !fs.existsSync(rcedit)) return;
  const args = [
    exe,
    '--set-icon', ico,
    '--set-version-string', 'ProductName', 'TDLVV',
    '--set-version-string', 'FileDescription', 'TDLVV 任务便签',
    '--set-version-string', 'ProductVersion', context.packager.appInfo.version,
    '--set-version-string', 'FileVersion', context.packager.appInfo.version,
    '--set-version-string', 'CompanyName', 'TDLVV'
  ];
  execFileSync(rcedit, args, { stdio: 'ignore' });
};
