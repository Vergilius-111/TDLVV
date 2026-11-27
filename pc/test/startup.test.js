'use strict';
const assert = require('assert');
const startup = require('../src/startup');

// 版本判断：空=全新安装，不同=升级，相同=日常启动
assert.strictEqual(startup.isFreshRun('', '0.6.13'), true, '全新安装应视为首次运行');
assert.strictEqual(startup.isFreshRun('0.6.12', '0.6.13'), true, '版本升级应视为首次运行');
assert.strictEqual(startup.isFreshRun('0.6.13', '0.6.13'), false, '同版本日常启动不应弹窗');

// 全新安装：即使没起名字也弹主界面
assert.strictEqual(startup.shouldShowOnStart({ named: false, freshRun: true }), true, '全新安装应弹主界面');
// 升级：已起名字也要弹
assert.strictEqual(startup.shouldShowOnStart({ named: true, freshRun: true }), true, '升级后应弹主界面');
// 日常启动：已起名字且同版本，保持后台托盘
assert.strictEqual(startup.shouldShowOnStart({ named: true, freshRun: false }), false, '日常启动应保持后台');
// 首次起名：即使同版本也弹
assert.strictEqual(startup.shouldShowOnStart({ named: false, freshRun: false }), true, '首次起名应弹主界面');
// 调试/截图模式
assert.strictEqual(startup.shouldShowOnStart({ named: true, freshRun: false, showWindow: true }), true, '调试模式应弹主界面');
assert.strictEqual(startup.shouldShowOnStart({ named: true, freshRun: false, shot: true }), true, '截图模式应弹主界面');

console.log('startup.test.js OK');
