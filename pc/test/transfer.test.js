'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const transfer = require('../src/transfer');

function state(name) {
  return { boardName: name, members: [{ id: 'me', name: '我' }], tasks: [{ id: 'a', text: '任务' }] };
}

function payload(extra) {
  return Object.assign({
    app: 'TDLVV',
    type: 'tdlvv-backup',
    v: 1,
    activeId: 'h1',
    teams: [
      { id: 'local', kind: 'local', name: '我的清单', meId: 'me', state: state('我的清单') },
      { id: 'h1', kind: 'host', name: '设计组', meId: 'h1', seenTaskIds: ['a'], state: state('设计组') }
    ],
    prefs: { named: true, name: '老王', theme: 'light', fontSize: 'l', lang: 'en', pin: true, notifyTasks: false, notifyDue: true }
  }, extra || {});
}

function run() {
  const zh = transfer.dialogStrings('zh');
  assert.equal(zh.exportTitle, '导出 TDLVV 备份');
  assert.equal(transfer.dialogStrings('en').importTitle, 'Import TDLVV backup');

  const prep = transfer.prepareImport(payload());
  assert.equal(prep.ok, true);
  assert.equal(prep.count, 2);
  assert.equal(prep.tasks, 2);
  assert.equal(prep.activeId, 'h1');
  assert.equal(prep.prefs.name, '老王');
  assert.equal(prep.prefs.theme, 'light');
  assert.equal(prep.prefs.fontSize, 'l');
  assert.equal(prep.prefs.lang, 'en');
  assert.equal(prep.prefs.pin, true);
  assert.equal(prep.prefs.notifyTasks, false);
  assert.equal(prep.prefs.notifyDue, true);
  assert.equal(prep.teams[0].tokens && typeof prep.teams[0].tokens, 'object');
  assert.deepEqual(prep.teams[1].seenTaskIds, ['a']);
  console.log('✓ 导入准备：团队、任务数、当前团队和设置在导入时被规范化');

  const fallback = transfer.prepareImport(payload({ activeId: '不存在' }));
  assert.equal(fallback.ok, true);
  assert.equal(fallback.activeId, 'local');
  console.log('✓ 导入准备：当前团队不存在时回退到个人清单');

  const noLocal = transfer.prepareImport(payload({
    teams: [{ id: 'h1', kind: 'host', name: '设计组', meId: 'h1', state: state('设计组') }]
  }));
  assert.equal(noLocal.ok, false);
  assert.equal(noLocal.error, '备份里没有个人清单');
  console.log('✓ 导入准备：没有个人清单时拒绝导入');

  const bad = transfer.prepareImport({ type: 'other' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, '不是有效的 TDLVV 备份文件');
  console.log('✓ 导入准备：格式不符时拒绝导入');

  const prefs = transfer.importedPrefs({ theme: 'blue', fontSize: 'xl', lang: 'fr', named: false, name: '不应保留' });
  assert.equal(prefs.theme, 'system');
  assert.equal(prefs.fontSize, 'm');
  assert.equal(prefs.lang, 'zh');
  assert.equal(prefs.name, '');
  assert.equal(prefs.named, false);
  assert.equal(prefs.notifyTasks, true);
  assert.equal(prefs.notifyDue, true);
  console.log('✓ 导入准备：非法设置回退默认值，未命名时不保留旧名字');

  const long = transfer.importedTeams([{ id: 'x', kind: 'client', name: 'x'.repeat(100), state: state('') }]);
  assert.equal(long[0].name.length, 80);
  console.log('✓ 导入准备：超长团队名被截断');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdlvv-transfer-'));
  try {
    const teamsPath = path.join(dir, 'teams.json');
    const prefsPath = path.join(dir, 'prefs.json');
    let backed = false;
    const result = transfer.applyImport(payload(), {
      teamsPath,
      prefsPath,
      backupBeforeImport: () => { backed = true; }
    });
    assert.equal(result.ok, true);
    assert.equal(result.teams, 2);
    assert.equal(result.tasks, 2);
    assert.equal(backed, true);
    const saved = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
    assert.equal(saved.v, 3);
    assert.equal(saved.activeId, 'h1');
    assert.equal(saved.teams.length, 2);
    assert.deepEqual(saved.teams[1].seenTaskIds, ['a']);
    const savedPrefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    assert.equal(savedPrefs.name, '老王');
    assert.equal(savedPrefs.lang, 'en');
    console.log('✓ 导入落盘：先备份当前数据，再写 teams.json / prefs.json');

    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdlvv-transfer-bad-'));
    try {
      const bad = transfer.applyImport(payload(), {
        teamsPath: path.join(badDir, 'teams.json'),
        prefsPath: path.join(badDir, 'prefs.json'),
        backupBeforeImport: () => { throw new Error('disk full'); }
      });
      assert.equal(bad.ok, false);
      assert.equal(bad.error, '当前数据备份失败，已取消导入');
      assert.equal(fs.existsSync(path.join(badDir, 'teams.json')), false);
      console.log('✓ 导入落盘：备份失败时不覆盖当前数据');
    } finally {
      fs.rmSync(badDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('全部通过');
}

run();
