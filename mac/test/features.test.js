'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const store = require('../src/store');
const notify = require('../src/notify');
const fileStore = require('../src/files');
const aiApi = require('../src/aiapi');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tdlvv-features-'));
}

function makeTeam() {
  const state = store.createBoard({ kind: 'host', name: '测试团队', ownerName: '创建者' });
  const member = store.addMember(state, '小李', '🐶');
  return { state, member };
}

function add(state, text, extra, actor) {
  const action = { type: 'addTask', text, ...(extra || {}) };
  store.apply(state, action, actor || store.HOST_ID);
  return action.createdId;
}

function testAssignMulti() {
  const local = store.createBoard({ kind: 'local', name: '个人', ownerName: '我' });
  const id = add(local, '写周报', {}, 'me');
  storageApply(local, { type: 'toggleTask', id }, 'me');
  assert.strictEqual(local.tasks[0].done, true);
  assert.ok(local.tasks[0].doneAt > 0);

  const { state, member } = makeTeam();
  const member2 = store.addMember(state, '小王', '🐱');
  const tid = add(state, '团队设计稿', { assigneeIds: [member.id, member2.id] }, store.HOST_ID);
  assert.deepStrictEqual(state.tasks[0].assigneeIds, [member.id, member2.id]);
  assert.strictEqual(state.tasks[0].assigneeId, member.id);
  // 任一被指派成员都能标记完成
  storageApply(state, { type: 'toggleTask', id: tid }, member2.id);
  assert.strictEqual(state.tasks[0].done, true);
  // 未被指派的成员不能标记完成
  const outsider = store.addMember(state, '外人', '🐰');
  const tid2 = add(state, '另一个任务', { assigneeIds: [member.id] }, store.HOST_ID);
  assert.throws(
    () => storageApply(state, { type: 'toggleTask', id: tid2 }, outsider.id),
    /只有创建者、管理员，或被指派的成员能标记完成/
  );
  console.log('✓ 多选指派：可指派多人；任一被指派成员可完成；无关成员被拒');
}

function storageApply(state, action, actor) {
  return store.apply(state, action, actor);
}

function testTemplateCapAndNoticeClear() {
  const { state } = makeTeam();
  for (let i = 1; i <= 5; i++) {
    storageApply(state, {
      type: 'saveTemplate',
      name: `模板 ${i}`,
      fields: [{ label: '字段', value: String(i) }]
    }, store.HOST_ID);
  }
  assert.strictEqual(state.templates.length, 5);
  assert.throws(
    () => storageApply(state, {
      type: 'saveTemplate',
      name: '模板 6',
      fields: [{ label: '字段', value: '6' }]
    }, store.HOST_ID),
    /最多保存 5 个/
  );
  const first = state.templates[0];
  storageApply(state, {
    type: 'saveTemplate',
    id: first.id,
    name: '模板 1 改',
    fields: [{ label: '字段', value: '改' }]
  }, store.HOST_ID);
  assert.strictEqual(state.templates.length, 5);
  assert.strictEqual(state.templates.find((t) => t.id === first.id).name, '模板 1 改');

  storageApply(state, { type: 'addNotice', text: '周五停电' }, store.HOST_ID);
  const nid = state.notices[0].id;
  storageApply(state, { type: 'updateNotice', id: nid, text: '   ' }, store.HOST_ID);
  assert.strictEqual(state.notices.length, 0);
  console.log('✓ 模板最多 5 个且可改满额模板；团队通知清空后可保存并删除');
}

function testPermissionsTemplatesFields() {
  const { state, member } = makeTeam();
  const tid = add(state, '客户需求', { fields: [{ label: '客户', value: 'A 公司' }] }, store.HOST_ID);
  assert.strictEqual(state.tasks[0].fields.length, 1);

  assert.throws(
    () => storageApply(state, { type: 'saveTemplate', name: '需求模板', fields: [{ label: '客户', value: '' }] }, member.id),
    /创建者或管理员/
  );
  storageApply(state, { type: 'saveTemplate', name: '需求模板', fields: [{ label: '客户', value: '默认' }] }, store.HOST_ID);
  assert.strictEqual(state.templates.length, 1);
  assert.strictEqual(state.templates[0].name, '需求模板');

  assert.throws(
    () => storageApply(state, { type: 'toggleTask', id: tid }, member.id),
    /创建者、管理员/
  );
  storageApply(state, { type: 'editTask', id: tid, assigneeId: member.id }, store.HOST_ID);
  storageApply(state, { type: 'toggleTask', id: tid }, member.id);
  assert.strictEqual(state.tasks[0].done, true);

  storageApply(state, { type: 'editTask', id: tid, fields: [{ label: '客户', value: 'B 公司' }, { label: '金额', value: '10 万' }] }, store.HOST_ID);
  assert.strictEqual(state.tasks[0].fields.length, 2);
  console.log('✓ 模板仅管理员可保存；任务字段可编辑；被指派成员可完成自己的任务');
}

function testFiles() {
  const root = tmpRoot();
  const files = fileStore.createStore(root);
  const saved = files.saveVersion({
    boardId: 'b1',
    taskId: 't1',
    originalName: '方案 v2.docx',
    memberName: '小李',
    version: 1,
    buffer: Buffer.from('hello')
  });
  assert.ok(saved.storedRel.endsWith('方案 v2-小李.docx'));
  assert.strictEqual(saved.displayName, '方案 v2-小李.docx');
  const abs = files.resolve(saved.storedRel);
  assert.ok(abs && fs.existsSync(abs));
  assert.strictEqual(fs.readFileSync(abs, 'utf8'), 'hello');
  assert.strictEqual(files.resolve('../outside.txt'), '');

  const { state, member } = makeTeam();
  const tid = add(state, '交付文件', {}, store.HOST_ID);
  const first = files.saveVersion({ boardId: state.boardId, taskId: tid, originalName: '交付.pdf', memberName: '小李', version: 1, buffer: Buffer.from('v1') });
  assert.strictEqual(store.attachFile(state, tid, member.id, first), true);
  assert.strictEqual(state.tasks[0].file.displayName, '交付-小李.pdf');
  assert.strictEqual(state.tasks[0].pendingFile, null);

  const second = files.saveVersion({ boardId: state.boardId, taskId: tid, originalName: '交付.pdf', memberName: '小李', version: 2, buffer: Buffer.from('v2') });
  store.attachFile(state, tid, member.id, second);
  assert.strictEqual(state.tasks[0].file.version, 1);
  assert.ok(state.tasks[0].pendingFile && state.tasks[0].pendingFile.version === 2);
  assert.throws(() => storageApply(state, { type: 'acceptFileUpdate', id: tid }, member.id), /创建者或管理员/);
  storageApply(state, { type: 'acceptFileUpdate', id: tid }, store.HOST_ID);
  assert.strictEqual(state.tasks[0].file.version, 2);
  assert.strictEqual(state.tasks[0].pendingFile, null);

  fs.rmSync(root, { recursive: true, force: true });
  console.log('✓ 文件保存到子目录、成员名后缀；旧版 pendingFile 兼容流程仍可用');
}

function testMemberFileCopies() {
  const root = tmpRoot();
  const files = fileStore.createStore(root);
  const { state, member } = makeTeam();
  const tid = add(state, '共享方案', {}, store.HOST_ID);
  const original = files.saveVersion({
    boardId: state.boardId,
    taskId: tid,
    originalName: '方案.docx',
    memberName: '创建者',
    version: 1,
    buffer: Buffer.from('original')
  });
  store.attachFile(state, tid, store.HOST_ID, original);
  assert.strictEqual(state.tasks[0].file.displayName, '方案-创建者.docx');
  const own = files.saveMemberCopy({
    boardId: state.boardId,
    taskId: tid,
    originalName: '方案.docx',
    memberId: member.id,
    memberName: '小李',
    version: 1,
    buffer: Buffer.from('member copy')
  });
  assert.ok(own.storedRel.includes(`members/${member.id}`));
  assert.strictEqual(own.displayName, '方案-小李.docx');
  store.attachMemberFile(state, tid, member.id, own);
  assert.strictEqual(state.tasks[0].file.displayName, '方案-创建者.docx');
  assert.strictEqual(state.tasks[0].memberFiles[member.id].displayName, '方案-小李.docx');
  const abs = files.resolve(own.storedRel);
  assert.ok(abs && fs.existsSync(abs));
  assert.strictEqual(fs.readFileSync(abs, 'utf8'), 'member copy');
  fs.rmSync(root, { recursive: true, force: true });
  console.log('✓ 成员副本：原文件保持不变，副本按成员目录和成员名保存');
}

function testRenameBoard() {
  const { state, member } = makeTeam();
  store.apply(state, { type: 'setRole', id: member.id, role: 'admin' }, store.HOST_ID);
  store.apply(state, { type: 'renameBoard', name: '设计组改名' }, member.id);
  assert.strictEqual(state.boardName, '设计组改名');

  const other = store.addMember(state, '小周', '🐱');
  assert.throws(
    () => store.apply(state, { type: 'renameBoard', name: '普通成员改名' }, other.id),
    /创建者或管理员/
  );
  store.apply(state, { type: 'renameBoard', name: '一'.repeat(25) }, store.HOST_ID);
  assert.strictEqual(state.boardName.length, 20);
  console.log('✓ 团队改名：管理员可改、普通成员被拒、名称最多 20 字');
}

function testTaskNotifications() {
  const { state, member } = makeTeam();
  add(state, '已有任务', { assigneeId: member.id }, store.HOST_ID);
  const seen = notify.visibleTaskIds(state, member.id);
  assert.deepStrictEqual(notify.newPendingTasks(state, member.id, seen), []);

  const freshId = add(state, '新来的任务', { assigneeId: member.id }, store.HOST_ID);
  const fresh = notify.newPendingTasks(state, member.id, seen);
  assert.strictEqual(fresh.length, 1);
  assert.strictEqual(fresh[0].id, freshId);
  assert.ok(fresh[0].text.includes('新来的任务'));

  add(state, '已经完成的新任务', {}, store.HOST_ID);
  storageApply(state, { type: 'toggleTask', id: state.tasks[0].id }, store.HOST_ID);
  assert.strictEqual(notify.newPendingTasks(state, member.id, seen).length, 1);

  const hiddenId = add(state, '只发给创建者', { audience: { type: 'members', memberIds: [store.HOST_ID] } }, store.HOST_ID);
  assert.ok(!notify.visibleTaskIds(state, member.id).includes(hiddenId));

  const seenHost = notify.visibleTaskIds(state, store.HOST_ID);
  add(state, '创建者自己发的任务', { assigneeId: member.id }, store.HOST_ID);
  assert.strictEqual(notify.newPendingTasks(state, store.HOST_ID, seenHost).length, 0);

  const one = notify.newTaskMessage('设计组', [fresh[0]], member.id, 'zh');
  assert.ok(one.title.includes('设计组'));
  assert.ok(one.body.startsWith('指派给你：'));

  const two = notify.newTaskMessage('设计组', fresh.concat([{ id: 'x', text: '另一个任务' }]), member.id, 'en');
  assert.strictEqual(two.firstTaskId, fresh[0].id);
  assert.ok(two.body.includes('2 new tasks'));

  const summary = notify.summaryMessage('设计组', 6, 'zh');
  assert.ok(summary.body.includes('6 个待办任务'));
  console.log('✓ 新任务通知：按成员可见性识别、完成的不报、自己发的不提醒、首次只给汇总、单条与多条文案');
}

function httpGet(url, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { headers: { 'X-TDLVV-Token': token || '' } }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** 指派权限：个人清单没有指派；团队只有任务发起人/管理员能改，且对象必须可见 */
function testAssignPermissions() {
  const local = store.createBoard({ kind: 'local', name: '个人', ownerName: '我' });
  const lid = add(local, '自己的事', { assigneeId: 'me' }, 'me');
  assert.strictEqual(local.tasks[0].id, lid);
  assert.strictEqual(local.tasks[0].assigneeId, '', '个人清单不应该记住指派对象');

  const { state, member } = makeTeam();
  const tid = add(state, '团队任务', {}, store.HOST_ID);
  // 管理员/发起人可以指派
  storageApply(state, { type: 'editTask', id: tid, assigneeId: member.id }, store.HOST_ID);
  assert.strictEqual(state.tasks[0].assigneeId, member.id);

  // 普通成员不能给自己指派，也不能改派别人
  assert.throws(
    () => storageApply(state, { type: 'editTask', id: tid, assigneeId: store.HOST_ID }, member.id),
    /只有任务发起人或管理员能指派任务/
  );
  assert.strictEqual(state.tasks[0].assigneeId, member.id, '成员越权改指派必须失败且不改数据');

  // 可一次勾选多名成员；旧的单值写法仍然兼容
  storageApply(state, { type: 'editTask', id: tid, assigneeIds: [member.id, store.HOST_ID] }, store.HOST_ID);
  assert.deepStrictEqual(state.tasks[0].assigneeIds, [member.id, store.HOST_ID]);
  storageApply(state, { type: 'editTask', id: tid, assigneeId: member.id }, store.HOST_ID);
  assert.deepStrictEqual(state.tasks[0].assigneeIds, [member.id]);

  // 指派对象必须真实存在
  assert.throws(
    () => storageApply(state, { type: 'editTask', id: tid, assigneeId: 'nobody' }, store.HOST_ID),
    /指派对象不存在/
  );
  console.log('✓ 指派权限：个人清单不记指派；团队仅发起人/管理员可改；成员越权被拒');
}

async function testAiApi() {
  const { state, member } = makeTeam();
  const tid = add(state, 'AI 可读任务', { fields: [{ label: '负责人', value: '小李' }] }, store.HOST_ID);
  state.filesRoot = 'C:/shared/team';
  state.tasks[0].file = {
    displayName: '原稿.pdf', storedRel: `b/${tid}/v1/原稿.pdf`, root: 'C:/shared/team', size: 10, version: 1
  };
  state.tasks[0].memberFiles = {
    [member.id]: {
      displayName: '原稿-小李.pdf',
      storedRel: `b/${tid}/members/${member.id}/原稿-小李.pdf`,
      root: 'C:/shared/team',
      size: 11,
      version: 1
    }
  };
  let info = null;
  const api = aiApi.startAiApi({
    token: 'test-token',
    version: '0.6.2-test',
    getTeams: () => [{ id: 'team1', name: '测试团队', kind: 'host', meId: store.HOST_ID, state }],
    resolveFile: (rel, root) => `${root}/${rel}`,
    onReady: (v) => { info = v; }
  });
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(info && info.baseUrl);
  const unauthorized = await httpGet(`${info.baseUrl}/ai/v1/status`, 'bad');
  assert.strictEqual(unauthorized.status, 401);
  const status = await httpGet(`${info.baseUrl}/ai/v1/status`, 'test-token');
  assert.strictEqual(status.status, 200);
  assert.ok(JSON.parse(status.body).ok);
  const tasks = await httpGet(`${info.baseUrl}/ai/v1/tasks`, 'test-token');
  const data = JSON.parse(tasks.body);
  assert.strictEqual(data.teams[0].tasks[0].fields[0].label, '负责人');
  assert.strictEqual(data.teams[0].filesRoot, 'C:/shared/team');
  assert.ok(data.teams[0].tasks[0].file.path.includes('原稿.pdf'));
  assert.ok(data.teams[0].tasks[0].memberFiles[member.id].path.includes('原稿-小李.pdf'));
  api.close();
  console.log('✓ AI 接口：令牌鉴权、任务字段、团队文件根目录和成员副本可读');
}

(async () => {
  testAssignMulti();
  testAssignPermissions();
  testRenameBoard();
  testTemplateCapAndNoticeClear();
  testPermissionsTemplatesFields();
  testFiles();
  testMemberFileCopies();
  testTaskNotifications();
  await testAiApi();
  console.log('全部通过');
})().catch((e) => {
  console.error('测试失败：', e && e.message ? e.message : e);
  process.exit(1);
});
