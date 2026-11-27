'use strict';
const assert = require('assert');
const updater = require('../src/updater');

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('ok - ' + name); }
  catch (e) { console.error('FAIL - ' + name + ': ' + e.message); process.exitCode = 1; }
}

ok('parseVer 去掉 v 前缀并拆数字', () => {
  assert.deepStrictEqual(updater.parseVer('v0.6.9'), [0, 6, 9]);
  assert.deepStrictEqual(updater.parseVer('0.6.9-beta'), [0, 6, 9]);
});

ok('cmpVer 正确比较大小', () => {
  assert.strictEqual(updater.cmpVer('0.6.9', '0.6.8'), 1);
  assert.strictEqual(updater.cmpVer('0.6.8', '0.6.9'), -1);
  assert.strictEqual(updater.cmpVer('0.6.8', '0.6.8'), 0);
  assert.strictEqual(updater.cmpVer('v1.0.0', '0.9.9'), 1);
  assert.strictEqual(updater.cmpVer('0.7', '0.6.9'), 1);
});

console.log('\n' + pass + ' passed');
