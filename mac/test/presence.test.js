'use strict';
// 静默检测成员在群状态：在线/离线/已退出 三态判定 + 退出记录写入
const assert = require('assert');
const store = require('../src/store');

async function main() {
  const state = store.createBoard({ name: '测试团队', ownerName: '主机甲' });
  const owner = state.members[0];

  // 1. 创建者恒在线，且不会被离线扫描误伤
  owner.lastSeen = 0; // 模拟从未心跳
  let changed = store.expirePresence(state);
  assert.strictEqual(changed, false, '创建者不应被判定离线');
  assert.strictEqual(owner.online, true);
  assert.strictEqual(store.memberPresence(state, owner, owner.id), 'me', '创建者看自己是「我」');
  assert.strictEqual(store.memberPresence(state, owner, 'someone-else'), 'online', '别人看创建者恒在线');
  console.log('✓ 创建者恒在线');

  // 2. 新增成员，touch 后在线
  const m = store.addMember(state, '同事乙', '🐶');
  assert.strictEqual(store.touch(state, m.id), false, '首次 touch 前成员本就在线');
  assert.strictEqual(store.memberPresence(state, m, owner.id), 'online');
  console.log('✓ 新成员默认在线');

  // 3. 超过阈值没心跳 -> 静默判定离线，扫描返回有变化
  m.lastSeen = Date.now() - (store.PRESENCE_OFFLINE_MS + 5000);
  m.online = true;
  changed = store.expirePresence(state);
  assert.strictEqual(changed, true, '应有成员从在线变离线');
  assert.strictEqual(m.online, false);
  assert.strictEqual(store.memberPresence(state, m, owner.id), 'offline');
  assert.strictEqual(store.expirePresence(state), false, '再次扫描不应重复变化');
  console.log('✓ 超时未心跳静默判定离线，且不重复推送');

  // 4. 重新 touch -> 从离线恢复，返回 true 以便上层推送
  const recovered = store.touch(state, m.id);
  assert.strictEqual(recovered, true, '应识别为从离线恢复');
  assert.strictEqual(m.online, true);
  assert.strictEqual(store.memberPresence(state, m, owner.id), 'online');
  console.log('✓ 重新心跳恢复上线可被感知');

  // 5. 移除成员 -> 写入退出记录（leftMembers），成员从 members 消失
  const name = m.name;
  const applied = store.apply(state, { type: 'removeMember', id: m.id }, owner.id);
  assert.strictEqual(applied, true);
  assert.strictEqual(state.members.some((x) => x.id === m.id), false, '成员应从列表移除');
  assert.strictEqual(state.leftMembers.length, 1, '应留一条退出记录');
  assert.strictEqual(state.leftMembers[0].name, name);
  assert.ok(state.leftMembers[0].leftAt > 0, '退出记录应带时间戳');
  console.log('✓ 退出/被移除写入 leftMembers 记录');

  // 6. 已退出成员判定为 left（前端用 _left 标记，这里验证数据可查）
  assert.strictEqual(state.leftMembers[0].id, m.id);
  assert.strictEqual(store.memberPresence(state, null, owner.id), 'left');
  console.log('✓ 无成员对象判定为已退出');

  console.log('\n✓ presence 测试全部通过');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
