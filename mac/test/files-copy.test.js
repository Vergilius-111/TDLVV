'use strict';
// 验证主机文件接口：创建者原稿不动，成员打开/上传都落到自己的副本
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../src/store');
const { startHost } = require('../src/server');
const { Remote } = require('../src/client');
const fileStore = require('../src/files');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tdlvv-file-copy-'));
}

async function main() {
  const root = tmpRoot();
  const files = fileStore.createStore(root);
  const state = store.createBoard({ kind: 'host', name: '文件团队', ownerName: '创建者' });
  state.filesRoot = root;
  const member = store.addMember(state, '小李', '🐶');
  const other = store.addMember(state, '小王', '🐰');
  const tid = (() => {
    const action = { type: 'addTask', text: '共享文件任务' };
    store.apply(state, action, store.HOST_ID);
    return action.createdId;
  })();
  const original = files.saveVersion({
    boardId: state.boardId,
    taskId: tid,
    originalName: '方案.docx',
    memberName: '创建者',
    version: 1,
    buffer: Buffer.from('original')
  });
  store.attachFile(state, tid, store.HOST_ID, original);

  let port = 0;
  const host = await new Promise((resolve) => {
    const h = startHost({
      state,
      port: 0,
      tokens: { memberToken: member.id, otherToken: other.id },
      files,
      onListen: (p) => { port = p; resolve(h); }
    });
  });

  const remote = new Remote({ baseUrl: `http://127.0.0.1:${port}`, token: 'memberToken' });
  const got = await remote.downloadTaskFile(tid, true);
  assert.strictEqual(got.name, '方案-小李.docx');
  assert.strictEqual(got.buffer.toString(), 'original');
  assert.strictEqual(state.tasks[0].file.displayName, '方案-创建者.docx');
  assert.strictEqual(state.tasks[0].memberFiles[member.id].displayName, '方案-小李.docx');
  const copied = files.resolve(state.tasks[0].memberFiles[member.id].storedRel);
  assert.ok(copied && fs.existsSync(copied));

  await remote.uploadTaskFile(tid, '修改后的方案.docx', Buffer.from('edited copy'));
  assert.strictEqual(state.tasks[0].file.displayName, '方案-创建者.docx');
  assert.strictEqual(state.tasks[0].memberFiles[member.id].displayName, '修改后的方案-小李.docx');
  const latest = files.resolve(state.tasks[0].memberFiles[member.id].storedRel);
  assert.ok(latest && fs.existsSync(latest));
  assert.strictEqual(fs.readFileSync(latest, 'utf8'), 'edited copy');
  assert.strictEqual(state.tasks[0].pendingFile, null);

  // 只确认"已提交"（不带内容）：沿用现有副本，只刷新提交时间
  const beforeSubmitted = Number(state.tasks[0].memberFiles[member.id].uploadedAt) || 0;
  const sub = await remote.submitTaskFile(tid);
  assert.ok(sub && sub.ok, '空请求体应当被当作"已提交"处理');
  assert.strictEqual(fs.readFileSync(latest, 'utf8'), 'edited copy', '只提交不改内容');
  assert.ok(Number(state.tasks[0].memberFiles[member.id].uploadedAt) >= beforeSubmitted);
  assert.strictEqual(state.tasks[0].pendingFile, null);

  // 还没有副本的成员：只提交也要生成自己的副本，内容取自创建者原稿
  const remote2 = new Remote({ baseUrl: `http://127.0.0.1:${port}`, token: 'otherToken' });
  const sub2 = await remote2.submitTaskFile(tid);
  assert.ok(sub2 && sub2.ok);
  assert.strictEqual(state.tasks[0].memberFiles[other.id].displayName, '方案-小王.docx');
  assert.strictEqual(state.tasks[0].file.displayName, '方案-创建者.docx', '原稿仍然不动');
  const otherCopy = files.resolve(state.tasks[0].memberFiles[other.id].storedRel);
  assert.strictEqual(fs.readFileSync(otherCopy, 'utf8'), 'original');

  host.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log('✓ 文件接口：成员打开生成个人副本，上传只更新副本，创建者原稿不变');
}

main().catch((e) => {
  console.error('测试失败：', e && e.message ? e.message : e);
  process.exit(1);
});
