'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const store = require('../src/store');

const src = path.join(__dirname, '..', 'src');

function testAssigneeRequiresTeamAdmin() {
  const state = store.createBoard({ kind: 'host', name: '权限测试', ownerName: '创建者' });
  const member = store.addMember(state, '普通成员', '🐶');
  const action = { type: 'addTask', text: '团队任务', assigneeIds: [member.id] };
  store.apply(state, action, store.HOST_ID);
  const id = action.createdId;
  assert.deepStrictEqual(state.tasks[0].assigneeIds, [member.id]);

  assert.throws(
    () => store.apply(state, { type: 'editTask', id, assigneeIds: [] }, member.id),
    /只有创建者或管理员能指派任务/
  );
  assert.deepStrictEqual(state.tasks[0].assigneeIds, [member.id]);
  console.log('✓ 团队指派：只有创建者/管理员能改');
}

function testPersonalIgnoresAssignee() {
  const local = store.createBoard({ kind: 'local', name: '个人', ownerName: '我' });
  const action = { type: 'addTask', text: '个人任务', assigneeIds: ['anyone'] };
  store.apply(local, action, 'me');
  assert.deepStrictEqual(local.tasks[0].assigneeIds, []);
  console.log('✓ 个人页：提交指派也不产生指派数据');
}

function testWebLayoutAndRoleFlags() {
  const portal = fs.readFileSync(path.join(src, 'portal.html'), 'utf8');
  assert.ok(/\.formGrid\.dateGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(portal), '截止/提醒应单列');
  assert.ok(/id="fAudRow"/.test(portal), '发布范围应有独立可隐藏容器');
  assert.ok(/id="fAssigneesRow"/.test(portal), '指派应有独立可隐藏容器');
  assert.ok(/function isTeamAdmin\(/.test(portal), '网页端应判断团队管理员');

  const mobile = fs.readFileSync(path.join(src, 'mobile.html'), 'utf8');
  assert.ok(/\.formGrid\.dateGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(mobile), '手机端截止/提醒应单列');
  assert.ok(/id="fAudRow"/.test(mobile), '手机端发布范围应有独立可隐藏容器');
  assert.ok(/id="fAssigneesRow"/.test(mobile), '手机端指派应有独立可隐藏容器');

  const portalJs = fs.readFileSync(path.join(src, 'portal.js'), 'utf8');
  assert.ok(/canManage:\s*t\.kind\s*!==\s*'local'/.test(portalJs), '聚合接口应下发 canManage');
  const serverJs = fs.readFileSync(path.join(src, 'server.js'), 'utf8');
  assert.ok(/canManage:\s*!viewer\s*&&\s*store\.isManager/.test(serverJs), '团队接口应下发 canManage');
  console.log('✓ 网页端：截止/提醒单列，发布范围/指派可按角色隐藏');
}

testAssigneeRequiresTeamAdmin();
testPersonalIgnoresAssignee();
testWebLayoutAndRoleFlags();
console.log('team-admin tests passed');
