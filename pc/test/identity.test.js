'use strict';
const assert = require('assert');
const store = require('../src/store');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok -', name); }

function makeState() {
  return store.createBoard({ name: '团队A', ownerName: '创建者', kind: 'host' });
}

t('同 clientId 重新申请会按身份复用同一个成员 id', () => {
  const s = makeState();
  store.addPending(s, '笔记本', '🐱', 'install-abc');
  const req = s.pending[0];
  const m1 = store.addMember(s, req.name, req.avatar, req.clientId);
  assert.ok(m1.clientId === 'install-abc');
  // 断连后重新进：另一个申请，同一个 clientId
  store.addPending(s, '笔记本', '🐱', 'install-abc');
  const req2 = s.pending[s.pending.length - 1];
  let reused = store.findMemberByClientId(s, req2.clientId);
  assert.ok(reused, '应能按 clientId 找到原成员');
  assert.strictEqual(reused.id, m1.id, '复用原 id，不新建');
  assert.strictEqual(s.members.filter((x) => x.role === 'member').length, 1, '成员数不增加（不含创建者）');
});

t('findMemberByClientId 能从已退出列表找回成员', () => {
  const s = makeState();
  const m = store.addMember(s, '笔记本', '🐱', 'install-x');
  s.leftMembers.push(Object.assign({}, m));
  s.members = s.members.filter((x) => x.id !== m.id);
  const found = store.findMemberByClientId(s, 'install-x');
  assert.ok(found);
  assert.strictEqual(found.id, m.id);
});

t('reviveMember 把退出成员移回并恢复在线', () => {
  const s = makeState();
  const m = { id: 'old1', name: '笔记本', clientId: 'install-y', online: false, lastSeen: 0, role: 'member' };
  s.leftMembers.push(m);
  store.reviveMember(s, m);
  assert.strictEqual(s.members.some((x) => x.id === 'old1'), true);
  assert.strictEqual(s.leftMembers.some((x) => x.id === 'old1'), false);
  assert.strictEqual(m.online, true);
  assert.ok(m.lastSeen > 0);
});

t('合并同名幽灵成员：迁移指派、完成人与个人文件，只留一个', () => {
  const s = makeState();
  const old = store.addMember(s, '笔记本', '🐱', ''); // 历史遗留：无 clientId
  const fresh = store.addMember(s, '笔记本', '🐱', 'install-new');
  old.lastSeen = 1000;
  fresh.lastSeen = 2000;
  const task = s.tasks.length ? s.tasks[0] : null;
  // 直接构造一条任务来覆盖引用迁移
  s.tasks.push({
    id: 'task1', text: '测试', done: true, doneById: old.id, assigneeIds: [old.id, fresh.id],
    assigneeId: old.id, memberFiles: { [old.id]: { name: 'a.txt' } }
  });
  s.memberFiles = { [old.id]: { name: 'b.txt' } };
  const map = store.mergeDuplicateMembers(s);
  assert.strictEqual(map[old.id], fresh.id, '旧 id 映射到新 id');
  assert.strictEqual(s.members.length, 2, '成员从 2 个（含创建者）变成 1 个成员 + 创建者'); // owner + fresh
  const t1 = s.tasks.find((x) => x.id === 'task1');
  assert.deepStrictEqual(t1.assigneeIds, [fresh.id]);
  assert.strictEqual(t1.assigneeId, fresh.id);
  assert.strictEqual(t1.doneById, fresh.id);
  assert.ok(t1.memberFiles[fresh.id], '个人文件迁到保留 id');
  assert.ok(!t1.memberFiles[old.id], '旧 id 文件已移除');
  assert.ok(s.memberFiles[fresh.id]);
});

t('mergeDuplicateMembers 不动创建者，也不合并不同名字', () => {
  const s = makeState();
  const a = store.addMember(s, '张三', '🐱', 'c1');
  const b = store.addMember(s, '李四', '🐶', 'c2');
  const map = store.mergeDuplicateMembers(s);
  assert.strictEqual(Object.keys(map).length, 0);
  assert.ok(s.members.some((m) => m.id === a.id));
  assert.ok(s.members.some((m) => m.id === b.id));
  assert.ok(s.members.some((m) => m.id === store.HOST_ID));
});

t('两个不同 clientId 的同名成员不合并（真的是两台设备）', () => {
  const s = makeState();
  const a = store.addMember(s, '阿威的笔记本', '🐱', 'laptop-1');
  const b = store.addMember(s, '阿威的笔记本', '🐨', 'laptop-2');
  const map = store.mergeDuplicateMembers(s);
  assert.strictEqual(Object.keys(map).length, 0, '不同安装标识不应合并');
  assert.strictEqual(s.members.filter((m) => m.role === 'member').length, 2);
});

console.log(`\nidentity.test.js: ${passed} passed`);
