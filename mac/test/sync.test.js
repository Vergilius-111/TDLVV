'use strict';
// 不开界面，验证 v3：申请 -> 审批 -> 同步 -> 备注 -> 管理员审批 -> 移交 -> 移除 -> 截止/提醒
const assert = require('assert');
const http = require('http');
const store = require('../src/store');
const { startHost } = require('../src/server');
const { Remote, parseManual, request } = require('../src/client');

async function main() {
  const state = store.createBoard({ name: '测试团队', ownerName: '主机甲', ownerAvatar: '🐼' });
  let tokens = {};
  let port = 0;
  const host = await new Promise((resolve) => {
    const h = startHost({
      state,
      port: 0,
      tokens,
      onTokens: (t) => { tokens = t; },
      onListen: (p) => { port = p; resolve(h); }
    });
  });
  console.log('host listening on', port, 'code', state.inviteCode);
  const base = `http://127.0.0.1:${port}`;

  // 1. 错误邀请码
  await assert.rejects(() => new Remote({ baseUrl: base }).join('XXXXXX', '同事乙', '🐶'), /邀请码/);
  console.log('✓ 错误邀请码被拒绝');

  // 2. 正确邀请码 -> 只是申请
  const req = await new Remote({ baseUrl: base }).join(state.inviteCode, '同事乙', '🐶');
  assert.strictEqual(req.pending, true);
  assert.strictEqual(state.members.length, 1, '审批前不能进成员列表');
  assert.strictEqual(state.pending[0].avatar, '🐶', '申请里要带头像');
  console.log('✓ 申请带名字+头像，审批前成员数仍为 1');

  // 2b. 邀请码 10 分钟失效
  const oldExpiry = state.inviteCodeExpiresAt;
  state.inviteCodeExpiresAt = Date.now() - 1000;
  await assert.rejects(() => new Remote({ baseUrl: base }).join(state.inviteCode, '过期测试', '🐰'), /过期/);
  state.inviteCodeExpiresAt = oldExpiry;
  console.log('✓ 邀请码过期后被拒绝');

  // 3. 审批
  const ap = host.approve(req.requestId, store.HOST_ID);
  assert.strictEqual(ap.ok, true);
  assert.strictEqual(state.members.length, 2);
  assert.strictEqual(state.members[1].avatar, '🐶');
  assert.strictEqual(state.members[1].role, 'member', '新加入的人默认是普通成员');
  let st = await new Remote({ baseUrl: base }).status(req.requestId);
  assert.strictEqual(st.status, 'approved');
  const memberRemote = new Remote({ baseUrl: base, token: st.token });
  console.log('✓ 同意加入，拿到 token');

  // 4. token 鉴权
  let s = await memberRemote.getState();
  assert.strictEqual(s.members.length, 2);
  await assert.rejects(() => new Remote({ baseUrl: base }).getState(), /未加入/);
  const cached = await memberRemote.getStateSince(s.rev);
  assert.strictEqual(cached.unchanged, true);
  assert.strictEqual(cached.state, undefined);
  const full = await memberRemote.getStateSince(s.rev - 1);
  assert.ok(full.state && full.state.rev === s.rev);
  console.log('✓ token 鉴权正常；条件轮询未变化时只返回轻量结果');

  // 4b. 固定设备码：同一成员可以有多个设备 token；手机状态去掉文件字段
  const dev = host.issueDeviceCode(store.HOST_ID);
  assert.strictEqual(dev.ok, true);
  const membersBeforeDevice = state.members.length;
  const devLogin = await request({
    baseUrl: base,
    path: '/api/device/login',
    method: 'POST',
    body: { code: dev.code }
  });
  assert.ok(devLogin.token, '设备码应换到 token');
  assert.strictEqual(state.members.length, membersBeforeDevice, '设备登录不能新增成员');
  assert.strictEqual(devLogin.me.id, store.HOST_ID);
  assert.ok(host.tokensMap.size >= 2, '同一成员应能同时有多个设备 token');
  const secondLogin = await request({
    baseUrl: base,
    path: '/api/device/login',
    method: 'POST',
    body: { code: dev.code }
  });
  assert.ok(secondLogin.token, '固定设备码应能重复登录');
  const setCode = host.setDeviceCode(store.HOST_ID, 'ABC123');
  assert.strictEqual(setCode.ok, true);
  assert.strictEqual(host.getDeviceCodes()[store.HOST_ID], 'ABC123');
  const resetCode = host.resetDeviceCode(store.HOST_ID);
  assert.strictEqual(resetCode.ok, true);
  await assert.rejects(
    () => request({ baseUrl: base, path: '/api/device/login', method: 'POST', body: { code: 'ABC123' } }),
    /无效/
  );
  const newLogin = await request({
    baseUrl: base,
    path: '/api/device/login',
    method: 'POST',
    body: { code: resetCode.code }
  });
  assert.ok(newLogin.token, '重置后新设备码可用');
  assert.strictEqual(host.issueDeviceCode(store.HOST_ID).code, resetCode.code, '固定设备码应长期保持');

  const html = await new Promise((resolve, reject) => {
    http.get(`${base}/m`, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    }).on('error', reject);
  });
  assert.strictEqual(html.status, 200);
  assert.ok(html.body.includes('TDLVV 手机端'), '手机页面应能直接打开');
  store.apply(state, { type: 'addTask', text: '手机过滤测试' }, store.HOST_ID);
  const tmpTask = state.tasks[0];
  tmpTask.file = { displayName: '不应出现在手机端.pdf', storedRel: 'x', root: '' };
  const mobile = await request({
    baseUrl: base,
    path: '/api/mobile/state',
    token: devLogin.token
  });
  assert.strictEqual(mobile.ok, true);
  assert.strictEqual(mobile.canPublish, true, '创建者在手机端也能发布');
  assert.ok(Array.isArray(mobile.tasks));
  assert.ok(mobile.tasks.length >= 1);
  assert.strictEqual(mobile.tasks[0].file, undefined, '手机状态不应带文件字段');
  assert.strictEqual(mobile.tasks[0].memberFiles, undefined, '手机状态不应带成员文件');
  state.tasks = state.tasks.filter((t) => t.id !== tmpTask.id);
  assert.strictEqual(host.issueDeviceCode(st.me.id).ok, false, '普通成员不能生成设备码');
  const memberMobile = await request({
    baseUrl: base,
    path: '/api/mobile/state',
    token: st.token
  });
  assert.strictEqual(memberMobile.canPublish, false, '普通成员手机端只能看');
  console.log('✓ 设备码登录、同成员多 token、手机状态过滤');


  // 成员上报自己的跨团队任务数量（只传数字）
  await memberRemote.action('setMemberStats', { total: 7, open: 4 });
  const statMember = state.members.find((m) => m.id === st.me.id);
  assert.strictEqual(statMember.stats.total, 7);
  assert.strictEqual(statMember.stats.open, 4);
  console.log('✓ 成员任务统计上报');

  // 5. 普通成员不能新增任务；创建者新增，并模拟一条历史遗留的成员发起任务
  const dueAt = Date.now() + 24 * 3600 * 1000;
  await assert.rejects(
    () => memberRemote.action('addTask', { text: '成员擅自新增', dueAt, remindHours: 3 }),
    /创建者或管理员/
  );
  store.apply(state, { type: 'addTask', text: '整理周报', dueAt, remindHours: 3 }, store.HOST_ID);
  state.tasks[0].creatorId = st.me.id;
  store.apply(state, { type: 'addTask', text: '超范围提醒', dueAt, remindHours: 99 }, store.HOST_ID);
  state.tasks[0].creatorId = st.me.id;
  s = await memberRemote.getState();
  const t0 = s.tasks[0];
  assert.strictEqual(t0.creatorId, st.me.id);
  assert.strictEqual(t0.dueAt, dueAt);
  assert.strictEqual(t0.remindAt, dueAt - 48 * 3600 * 1000, '超范围提醒按 48h 计算');
  // 上一条“整理周报”仍在同一份状态里，超范围提醒由创建者建
  assert.strictEqual(s.tasks[1].remindHours, 3);
  assert.strictEqual(s.tasks[1].remindAt, dueAt - 3 * 3600 * 1000);
  assert.strictEqual(t0.remindHours, 48, '提醒小时上限 48');
  console.log('✓ 普通成员不能新增任务；截止时间与提醒（1–48h，超范围夹到 48）');

  // 6. 团队任务只有创建者/管理员能标完成
  const tid = s.tasks[1].id;
  await assert.rejects(
    () => memberRemote.action('toggleTask', { id: tid }),
    /创建者、管理员/
  );
  // 被指派的成员可以完成自己的任务；完成后创建者仍可收回
  store.apply(state, { type: 'editTask', id: tid, assigneeId: st.me.id }, store.HOST_ID);
  await memberRemote.action('toggleTask', { id: tid });
  s = await memberRemote.getState();
  assert.strictEqual(s.tasks.find((x) => x.id === tid).done, true, '被指派成员能完成自己的任务');
  store.apply(state, { type: 'toggleTask', id: tid }, store.HOST_ID);
  store.apply(state, { type: 'editTask', id: tid, assigneeId: '' }, store.HOST_ID);
  store.apply(state, { type: 'toggleTask', id: tid }, store.HOST_ID);
  s = await memberRemote.getState();
  const done = s.tasks.find((x) => x.id === tid);
  assert.strictEqual(done.done, true);
  assert.strictEqual(done.doneById, store.HOST_ID);
  assert.strictEqual(done.doneByName, '主机甲');
  assert.ok(done.doneAt > 0);
  console.log('✓ 未指派成员不能标完成；被指派成员可以完成自己的任务；创建者/管理员可以收回');

  // 7. 只有发起人能改提醒
  store.apply(state, { type: 'addTask', text: '主机建的任务', dueAt, remindHours: 2 }, store.HOST_ID);
  const hostTaskId = state.tasks[0].id;
  await assert.rejects(
    () => memberRemote.action('editTask', { id: hostTaskId, remindHours: 5 }),
    /发起人/
  );
  s = await memberRemote.action('editTask', { id: tid, remindHours: 6 });
  assert.strictEqual(s.tasks.find((x) => x.id === tid).remindHours, 6);
  console.log('✓ 发起人可改提醒；别人改会被拒');

  // 8. 备注
  store.apply(state, { type: 'setRemark', id: st.me.id, remark: '市场部-小王' }, store.HOST_ID);
  s = await memberRemote.getState();
  assert.strictEqual(store.displayName(s.members[1]), '市场部-小王');
  console.log('✓ 备注生效（显示名 = 备注）');

  // 9. 任命管理员 -> 管理员能审批别人的申请
  store.apply(state, { type: 'setRole', id: st.me.id, role: 'admin' }, store.HOST_ID);
  await memberRemote.action('toggleTask', { id: tid });
  assert.strictEqual(state.tasks.find((x) => x.id === tid).done, false, '管理员可以标完成/取消完成');
  const req3 = await new Remote({ baseUrl: base }).join(state.inviteCode, '同事丙', '🐯');
  let r = await memberRemote.action('approveRequest', { requestId: req3.requestId });
  assert.strictEqual(state.members.length, 3);
  assert.ok(r, '管理员审批后返回状态');
  const st3 = await new Remote({ baseUrl: base }).status(req3.requestId);
  assert.strictEqual(st3.status, 'approved');
  console.log('✓ 管理员可以审批加入申请');

  // 10. 普通成员不能审批
  const p4 = await new Remote({ baseUrl: base }).join(state.inviteCode, '同事丁', '🐸');
  const plain = new Remote({ baseUrl: base, token: st3.token });
  await assert.rejects(() => plain.action('approveRequest', { requestId: p4.requestId }), /创建者或管理员/);
  console.log('✓ 普通成员审批被拒');

  // 11. 移交创建者
  store.apply(state, { type: 'transferOwner', id: st.me.id }, store.HOST_ID);
  const newOwner = state.members.find((m) => m.id === st.me.id);
  const oldOwner = state.members.find((m) => m.id === store.HOST_ID);
  assert.strictEqual(newOwner.role, 'owner');
  assert.strictEqual(oldOwner.role, 'admin');
  console.log('✓ 移交创建者：新创建者 owner，原创建者 admin');

  // 12. 新创建者移除成员 + token 失效
  const id3 = state.members.find((m) => m.name === '同事丙').id;
  const rm = await memberRemote.action('removeMember', { id: id3 });
  assert.ok(rm);
  const remote3 = new Remote({ baseUrl: base, token: st3.token });
  await assert.rejects(() => remote3.getState(), /未加入|移除/);
  console.log('✓ 新创建者移除成员，对方 token 立刻失效');

  // 13. 主动退出团队
  const ap4 = await memberRemote.action('approveRequest', { requestId: p4.requestId });
  assert.ok(ap4);
  const st4 = await new Remote({ baseUrl: base }).status(p4.requestId);
  const dingRemote = new Remote({ baseUrl: base, token: st4.token });
  await dingRemote.leave();
  await assert.rejects(() => dingRemote.getState(), /未加入/);
  console.log('✓ 主动退出后 token 失效');

  // 14. 手动地址解析
  assert.deepStrictEqual(parseManual('192.168.1.20:51234').baseUrl, 'http://192.168.1.20:51234');
  assert.deepStrictEqual(parseManual('https://abc-def.trycloudflare.com').baseUrl, 'https://abc-def.trycloudflare.com');
  console.log('✓ 手动地址解析正常');

  // 15. 任务文字：只有发起人/管理员能改
  const b = store.createBoard({ name: '关单测试', ownerName: '甲', ownerAvatar: '🐱', kind: 'host' });
  const ownerId = b.members[0].id;
  const mB = store.addMember(b, '乙', '🐶');
  const mC = store.addMember(b, '丙', '🦊');
  store.apply(b, { type: 'addTask', text: '甲发的任务' }, ownerId);
  const bt = b.tasks[0].id;
  assert.throws(() => store.apply(b, { type: 'editTask', id: bt, text: '丙偷偷改的' }, mC.id), /发起人/);
  store.apply(b, { type: 'editTask', id: bt, text: '甲改过的新文字' }, ownerId);
  assert.strictEqual(b.tasks[0].text, '甲改过的新文字');
  store.apply(b, { type: 'setRole', id: mB.id, role: 'admin' }, ownerId);
  store.apply(b, { type: 'editTask', id: bt, text: '管理员乙改的' }, mB.id);
  assert.strictEqual(b.tasks[0].text, '管理员乙改的');
  console.log('✓ 只有发起人/管理员能改任务文字，其他成员被拒');

  // 15.1 任务文字不限制 300 字，新增长文本要完整保留
  const bLong = store.createBoard({ name: '长文本测试', ownerName: '甲', ownerAvatar: '🐱', kind: 'host' });
  const longOwner = bLong.members[0].id;
  const longText = '长'.repeat(1200);
  store.apply(bLong, { type: 'addTask', text: longText }, longOwner);
  assert.strictEqual(bLong.tasks[0].text.length, 1200, '新增任务不应截到 300 字');
  store.apply(bLong, { type: 'editTask', id: bLong.tasks[0].id, text: longText + '改' }, longOwner);
  assert.strictEqual(bLong.tasks[0].text.length, 1201, '编辑任务也不应截到 300 字');
  console.log('✓ 任务文字不再限制 300 字，长文本完整保留');

  // 16. 关闭任务：成员侧留「已关闭」记录
  assert.throws(() => store.apply(b, { type: 'deleteTask', id: bt }, mC.id), /发起人/);
  store.apply(b, { type: 'deleteTask', id: bt }, ownerId);
  const closed = b.tasks.find((x) => x.id === bt);
  assert.ok(closed, '关闭后任务仍在列表里');
  assert.strictEqual(closed.closed, true);
  assert.ok(closed.closedAt > 0);
  assert.strictEqual(closed.closedByName, '甲');
  assert.strictEqual(closed.remindAt, 0);
  console.log('✓ 发起人关闭任务：任务保留并标 closed / 关闭人 / 时间，成员能看到');
  store.apply(b, { type: 'deleteTask', id: bt }, ownerId);
  assert.strictEqual(b.tasks.length, 0, '再次删除关闭记录时彻底移除');
  console.log('✓ 已关闭记录可以彻底删掉');

  // 17. 已完成记录删除 = 彻底移除
  const b2 = store.createBoard({ name: '删记录测试', ownerName: '甲', ownerAvatar: '🐱', kind: 'host' });
  const o2 = b2.members[0].id;
  store.apply(b2, { type: 'addTask', text: '已经做完的' }, o2);
  const t2 = b2.tasks[0].id;
  store.apply(b2, { type: 'toggleTask', id: t2 }, o2);
  store.apply(b2, { type: 'deleteTask', id: t2 }, o2);
  assert.strictEqual(b2.tasks.length, 0);
  console.log('✓ 已完成记录由发起人删除：彻底移除');

  // 18. 自己清单里删除 = 直接移除
  const b3 = store.createBoard({ name: '我的任务', ownerName: '甲', ownerAvatar: '🐱', kind: 'local' });
  const o3 = b3.members[0].id;
  store.apply(b3, { type: 'addTask', text: '自己的任务' }, o3);
  store.apply(b3, { type: 'deleteTask', id: b3.tasks[0].id }, o3);
  assert.strictEqual(b3.tasks.length, 0);
  console.log('✓ 自己清单删除：直接移除，不生成关闭记录');

  // 19. 团队通知：只有创建者/管理员能发、能删；个人清单不能发
  const b4 = store.createBoard({ name: '通知测试', ownerName: '甲', ownerAvatar: '🐱', kind: 'host' });
  const o4 = b4.members[0].id;
  const m4 = store.addMember(b4, '乙', '🐶');
  store.apply(b4, { type: 'addNotice', text: '口径调整，详见 https://example.com/doc' }, o4);
  assert.strictEqual(b4.notices.length, 1);
  assert.ok(b4.notices[0].authorName);
  assert.throws(() => store.apply(b4, { type: 'addNotice', text: '成员偷偷发的' }, m4.id), /创建者或管理员/);
  store.apply(b4, { type: 'setRole', id: m4.id, role: 'admin' }, o4);
  store.apply(b4, { type: 'addNotice', text: '管理员也能发' }, m4.id);
  assert.strictEqual(b4.notices.length, 2);
  store.apply(b4, { type: 'deleteNotice', id: b4.notices[0].id }, m4.id);
  assert.strictEqual(b4.notices.length, 1);
  const nid = b4.notices[0].id;
  store.apply(b4, { type: 'updateNotice', id: nid, text: '管理员改过的通知' }, m4.id);
  assert.strictEqual(b4.notices[0].text, '管理员改过的通知');
  assert.ok(b4.notices[0].editedAt > 0);
  store.apply(b4, { type: 'setRole', id: m4.id, role: 'member' }, o4);
  assert.throws(() => store.apply(b4, { type: 'updateNotice', id: nid, text: '成员乱改' }, m4.id), /创建者或管理员/);
  store.apply(b4, { type: 'setRole', id: m4.id, role: 'admin' }, o4);
  assert.throws(() => store.apply(b4, { type: 'updateNotice', id: 'missing', text: '找不到' }, o4), /不存在/);
  const bl = store.createBoard({ name: '我的任务', ownerName: '甲', ownerAvatar: '🐱', kind: 'local' });
  assert.throws(() => store.apply(bl, { type: 'addNotice', text: '个人清单通知' }, bl.members[0].id), /个人清单/);
  console.log('✓ 团队通知：创建者/管理员可发、可改、可删，成员被拒，个人清单不发');

  // 20. 置顶权限：个人清单能置顶自己的；团队任务只有创建者/管理员能置顶
  store.apply(bl, { type: 'addTask', text: '自己的事' }, bl.members[0].id);
  const lid = bl.tasks.find((x) => x.text === '自己的事').id;
  store.apply(bl, { type: 'pinTask', id: lid, on: true }, bl.members[0].id);
  assert.strictEqual(bl.tasks.find((x) => x.id === lid).pinned, true);

  store.apply(b4, { type: 'addTask', text: '乙发的任务' }, m4.id);
  const mid = b4.tasks.find((x) => x.text === '乙发的任务').id;
  store.apply(b4, { type: 'addTask', text: '甲发的任务' }, o4);
  const oid = b4.tasks.find((x) => x.text === '甲发的任务').id;
  // 管理员能置顶别人的
  store.apply(b4, { type: 'pinTask', id: oid, on: true }, m4.id);
  assert.strictEqual(b4.tasks.find((x) => x.id === oid).pinned, true);
  assert.ok(b4.tasks.find((x) => x.id === oid).pinnedAt > 0);
  // 普通成员：连自己发的团队任务都不能置顶，也不能取消别人的置顶
  store.apply(b4, { type: 'setRole', id: m4.id, role: 'member' }, o4);
  assert.throws(() => store.apply(b4, { type: 'pinTask', id: mid, on: true }, m4.id), /创建者|管理员/);
  assert.strictEqual(b4.tasks.find((x) => x.id === mid).pinned, false);
  assert.throws(() => store.apply(b4, { type: 'pinTask', id: oid, on: false }, m4.id), /创建者|管理员/);
  // 创建者仍然能置顶
  store.apply(b4, { type: 'pinTask', id: mid, on: true }, o4);
  assert.strictEqual(b4.tasks.find((x) => x.id === mid).pinned, true);
  console.log('✓ 置顶权限：个人清单可置顶；团队任务仅创建者/管理员可置顶');

  // 21. 角色标签：创建者/管理员能给自己和成员设；普通成员不能
  store.apply(b4, { type: 'setMemberTag', id: m4.id, tag: '#设计' }, o4);
  assert.strictEqual(b4.members.find((x) => x.id === m4.id).roleTag, '设计', '去掉 # 并保存');
  store.apply(b4, { type: 'setMemberTag', id: o4, tag: '管理' }, o4);
  assert.strictEqual(b4.members.find((x) => x.id === o4).roleTag, '管理', '创建者能给自己设');
  assert.throws(() => store.apply(b4, { type: 'setMemberTag', id: m4.id, tag: '偷改' }, m4.id), /创建者或管理员/);
  console.log('✓ 角色标签：创建者/管理员可给自己和成员设置，成员被拒');

  // 22. 发布范围：全员 / 按角色 / 部分成员；非全员范围只有管理员能选
  store.apply(b4, { type: 'addTask', text: '全员任务', audience: { type: 'all' } }, o4);
  const allT = b4.tasks.find((x) => x.text === '全员任务');
  assert.strictEqual(allT.audience.type, 'all');

  store.apply(
    b4,
    { type: 'addTask', text: '设计角色任务', audience: { type: 'roles', roles: ['设计', '不存在'] } },
    o4
  );
  const roleT = b4.tasks.find((x) => x.text === '设计角色任务');
  assert.strictEqual(roleT.audience.type, 'roles');
  assert.deepStrictEqual(roleT.audience.roles, ['设计'], '只保留真实存在的角色标签');

  store.apply(
    b4,
    { type: 'addTask', text: '部分成员任务', audience: { type: 'members', memberIds: [m4.id, 'nobody'] } },
    o4
  );
  const partT = b4.tasks.find((x) => x.text === '部分成员任务');
  assert.strictEqual(partT.audience.type, 'members');
  assert.deepStrictEqual(partT.audience.memberIds, [m4.id], '只保留真实成员');

  assert.throws(
    () => store.apply(b4, { type: 'addTask', text: '成员擅自定向', audience: { type: 'members', memberIds: [m4.id] } }, m4.id),
    /创建者或管理员/
  );
  assert.throws(
    () => store.apply(b4, { type: 'addTask', text: '空角色', audience: { type: 'roles', roles: [] } }, o4),
    /角色/
  );
  const m5 = store.addMember(b4, '丙', '🐸');
  assert.strictEqual(store.visibleTo(b4, allT, m5.id), true, '全员谁都能看');
  assert.strictEqual(store.visibleTo(b4, roleT, m4.id), true, '设计角色能看到');
  assert.strictEqual(store.visibleTo(b4, roleT, m5.id), false, '没角色的人看不到');
  assert.strictEqual(store.visibleTo(b4, partT, m4.id), true, '被选中的成员能看到');
  assert.strictEqual(store.visibleTo(b4, partT, m5.id), false, '没被选中的成员看不到');
  assert.strictEqual(store.visibleTo(b4, partT, o4), true, '创建者始终能看到');
  console.log('✓ 发布范围：全员/按角色/部分成员，范围会被清洗，成员不能定向发布');

  // 23. 任务链接：网页自动补 https、路径必须是完整路径，未选类型则保持为空
  store.apply(b4, { type: 'addTask', text: '带网页链接', linkType: 'url', linkTarget: 'example.com/a' }, o4);
  const urlT = b4.tasks.find((x) => x.text === '带网页链接');
  assert.strictEqual(urlT.linkType, 'url');
  assert.strictEqual(urlT.linkTarget, 'https://example.com/a', '没写协议时自动补 https');

  store.apply(b4, { type: 'addTask', text: '带本地路径', linkType: 'path', linkTarget: 'C:\\Temp\\资料' }, o4);
  const pathT = b4.tasks.find((x) => x.text === '带本地路径');
  assert.strictEqual(pathT.linkType, 'path');
  assert.strictEqual(pathT.linkTarget, 'C:\\Temp\\资料');

  assert.throws(
    () => store.apply(b4, { type: 'addTask', text: '相对路径', linkType: 'path', linkTarget: '资料\\文件' }, o4),
    /完整路径/
  );
  assert.throws(
    () => store.apply(b4, { type: 'addTask', text: '非法协议', linkType: 'url', linkTarget: 'ftp://example.com' }, o4),
    /http/
  );
  store.apply(b4, { type: 'addTask', text: '没有链接' }, o4);
  const nullT = b4.tasks.find((x) => x.text === '没有链接');
  assert.strictEqual(nullT.linkType, '');
  assert.strictEqual(nullT.linkTarget, '');
  console.log('✓ 任务链接：网址补 https、拒绝相对路径、未选时为空');

  host.close();
  console.log('\n全部通过');
}

main().catch((e) => {
  console.error('测试失败：', e.message);
  process.exit(1);
});
