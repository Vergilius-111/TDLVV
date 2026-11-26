'use strict';
// 验证团队文件根目录校验、复制全部与仅新文件迁移
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fileStore = require('../src/files');
const filePaths = require('../src/filepaths');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tdlvv-paths-'));
}

function writeFile(root, rel, text) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
  return abs;
}

async function main() {
  const oldRoot = tmpRoot();
  const newRoot = tmpRoot();
  const store = fileStore.createStore;
  const state = {
    tasks: [{
      id: 't1',
      file: { displayName: '方案-老王.docx', storedRel: 'b/t1/v1/方案-老王.docx', size: 3, root: '' },
      pendingFile: null,
      memberFiles: {
        m2: { displayName: '方案-小李.docx', storedRel: 'b/t1/members/m2/方案-小李.docx', size: 5, root: '' }
      }
    }]
  };
  writeFile(oldRoot, 'b/t1/v1/方案-老王.docx', 'old');
  writeFile(oldRoot, 'b/t1/members/m2/方案-小李.docx', 'copy!');

  assert.strictEqual(filePaths.normalizeStorageRoot(newRoot, oldRoot), path.resolve(newRoot));
  assert.throws(() => filePaths.normalizeStorageRoot('relative/path', oldRoot), /完整路径/);
  assert.ok(filePaths.pathContains(oldRoot, path.join(oldRoot, 'nested')));
  assert.ok(!filePaths.pathContains(oldRoot, newRoot));

  const copied = await filePaths.copyAllFilesToRoot(state, oldRoot, newRoot, store);
  assert.strictEqual(copied, 2);
  assert.strictEqual(fs.readFileSync(path.join(newRoot, 'b/t1/v1/方案-老王.docx'), 'utf8'), 'old');
  assert.strictEqual(fs.readFileSync(path.join(newRoot, 'b/t1/members/m2/方案-小李.docx'), 'utf8'), 'copy!');
  assert.strictEqual(state.tasks[0].file.root, newRoot);
  assert.strictEqual(state.tasks[0].memberFiles.m2.root, newRoot);

  const legacy = {
    tasks: [{
      id: 't2',
      file: { displayName: '旧.pdf', storedRel: 'b/t2/v1/旧.pdf', size: 1, root: '' },
      memberFiles: {
        m3: { displayName: '旧-小周.pdf', storedRel: 'b/t2/members/m3/旧-小周.pdf', size: 1, root: newRoot }
      }
    }]
  };
  assert.strictEqual(filePaths.markLegacyFilesRoot(legacy, oldRoot), 2);
  assert.strictEqual(legacy.tasks[0].file.root, oldRoot);
  assert.strictEqual(legacy.tasks[0].memberFiles.m3.root, newRoot);

  // 目标有同名但大小不同时中止，不能把团队切过去
  const conflictRoot = tmpRoot();
  writeFile(conflictRoot, 'b/t1/v1/方案-老王.docx', 'different-size');
  await assert.rejects(
    () => filePaths.copyAllFilesToRoot(state, newRoot, conflictRoot, store),
    /目标位置已有同名文件/
  );
  assert.strictEqual(state.tasks[0].file.root, newRoot);

  fs.rmSync(oldRoot, { recursive: true, force: true });
  fs.rmSync(newRoot, { recursive: true, force: true });
  fs.rmSync(conflictRoot, { recursive: true, force: true });
  console.log('✓ 路径迁移：复制全部、仅新文件保留旧根目录、同名冲突中止');
}

main().catch((e) => {
  console.error('测试失败：', e && e.message ? e.message : e);
  process.exit(1);
});
