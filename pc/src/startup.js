'use strict';

// 启动后是否主动显示主界面。
// 全新安装、版本升级后的首次运行、首次起名、调试/截图模式都显示；
// 日常启动（版本未变且已起名）保持后台托盘常驻。
function shouldShowOnStart(opts) {
  const o = opts || {};
  return !!(o.shot || o.showWindow || !o.named || o.freshRun);
}

// 上次记录的版本与当前版本不一致即为「新装或升级后的首次运行」。
function isFreshRun(lastVersion, currentVersion) {
  return String(lastVersion || '') !== String(currentVersion || '');
}

module.exports = { shouldShowOnStart, isFreshRun };
