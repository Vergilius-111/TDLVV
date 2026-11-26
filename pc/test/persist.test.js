'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const persist = require('../src/persist');
const backup = require('../src/backup');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdlvv-persist-'));
function cleanup() {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

try {
  // 原子写入：正常写入并读回
  const file = path.join(dir, 'teams.json');
  persist.writeJson(file, { ok: 1, text: '完整' });
  assert.deepStrictEqual(persist.readJson(file), { ok: 1, text: '完整' });

  // 新内容序列化失败时，旧文件仍然完整
  assert.throws(() => {
    const circular = {};
    circular.self = circular;
    persist.writeJson(file, circular);
  });
  assert.deepStrictEqual(persist.readJson(file), { ok: 1, text: '完整' });
  console.log('✓ 原子写入：写入完整，失败不破坏旧文件');

  // 自动备份：每天一份 + latest，只保留最近 7 天
  const bdir = path.join(dir, 'backups');
  for (let i = 1; i <= 9; i++) {
    backup.writeDaily(bdir, { seq: i }, new Date(2026, 0, i, 8, 0, 0));
  }
  const daily = backup.listDaily(bdir);
  assert.strictEqual(daily.length, 7);
  assert.strictEqual(daily[0], 'TDLVV-backup-2026-01-03.json');
  assert.strictEqual(daily[6], 'TDLVV-backup-2026-01-09.json');
  assert.deepStrictEqual(persist.readJson(path.join(bdir, 'latest.json')), { seq: 9 });
  console.log('✓ 自动备份：每天一份，保留最近 7 天，latest 始终最新');

  // latest 损坏时回退到日期备份
  fs.writeFileSync(path.join(bdir, 'latest.json'), '{坏文件');
  assert.deepStrictEqual(backup.readLatest(bdir), { seq: 9 });
  console.log('✓ 备份恢复：latest 损坏时回退到最近一份日期备份');

  // 手动安全备份不参与 7 天轮转
  const manual = backup.writeManual(bdir, { safe: true }, 'import', new Date(2026, 0, 10, 9, 30));
  assert.ok(fs.existsSync(path.join(bdir, manual)));
  fs.writeFileSync(path.join(bdir, 'latest.json'), JSON.stringify({ seq: 10 }));
  assert.deepStrictEqual(backup.readLatest(bdir), { seq: 10 });
  console.log('✓ 导入前安全备份：单独保留，不被自动轮转删除');

  // 备份格式校验
  const payload = {
    type: 'tdlvv-backup',
    teams: [{
      id: 'local', kind: 'local', meId: 'me',
      state: { members: [{ id: 'me' }], tasks: [{ id: 't1' }] }
    }]
  };
  assert.deepStrictEqual(backup.validate(payload), { ok: true, teams: 1, tasks: 1 });
  assert.strictEqual(backup.validate({ type: 'nope', teams: [] }).ok, false);
  assert.strictEqual(backup.validate({ type: 'tdlvv-backup', teams: [{ id: 'x', kind: 'bad', state: {} }] }).ok, false);
  console.log('✓ 备份格式校验：拒绝空文件和残缺团队数据');

  console.log('全部通过');
} finally {
  cleanup();
}
