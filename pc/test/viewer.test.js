'use strict';
// 团队设备码两种身份：成员码（可操作） / 查看者码（只读，看得到全部任务和文件）
const assert = require('assert');
const http = require('http');
const store = require('../src/store');
const { startHost } = require('../src/server');

function call(port, path, { method = 'GET', token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['x-token'] = token;
    let payload;
    if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(text); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const state = store.createBoard({ name: '测试团队', ownerName: '主机甲' });
  const ownerId = state.members[0].id;
  const m = store.addMember(state, '同事乙', '🐶');
  // 一条仅成员可见的任务，用来验证查看者能看全部
  store.apply(state, { type: 'addTask', text: '仅乙可见', createdId: 't1', audience: { type: 'members', memberIds: [m.id] } }, ownerId);

  let viewerCode = '';
  const host = startHost({
    state, port: 0, tokens: {}, deviceCodes: {}, viewerCode: '',
    onViewerCode: (c) => { viewerCode = c; },
    onChange: () => {}
  });
  await new Promise((r) => setTimeout(r, 120));
  const port = host.port;
  assert.ok(port > 0, '主机服务应监听成功');
  console.log('✓ host 服务启动');

  // 1. 生成查看者码并登录
  const vcode = host.ensureViewerCode();
  assert.strictEqual(vcode.length, 6);
  assert.strictEqual(viewerCode, vcode, '查看者码应回调落盘');
  const vlogin = await call(port, '/api/device/login', { method: 'POST', body: { code: vcode } });
  assert.strictEqual(vlogin.status, 200);
  assert.strictEqual(vlogin.data.viewer, true, '查看者登录应带 viewer 标记');
  assert.strictEqual(vlogin.data.me.role, 'viewer');
  const vtoken = vlogin.data.token;
  console.log('✓ 查看者码登录：得到只读身份');

  // 2. 查看者能看到全部任务（不受 audience 限制）、不能发布
  const vstate = await call(port, '/api/mobile/state', { token: vtoken });
  assert.strictEqual(vstate.status, 200);
  assert.strictEqual(vstate.data.viewer, true);
  assert.strictEqual(vstate.data.canPublish, false, '查看者不能发布');
  assert.ok(vstate.data.tasks.some((t) => t.text === '仅乙可见'), '查看者应看到全部任务');
  console.log('✓ 查看者看得到全部任务且不能发布');

  // 3. 查看者不能改数据（action / 上传）
  const vact = await call(port, '/api/action', { method: 'POST', token: vtoken, body: { type: 'togglePersonalDone', id: 't1' } });
  assert.strictEqual(vact.status, 403, '查看者的写操作应被拒绝');
  const vup = await call(port, '/api/file', { method: 'POST', token: vtoken });
  assert.strictEqual(vup.status, 403, '查看者不能上传文件');
  console.log('✓ 查看者的写操作与上传被拒绝');

  // 4. 成员码登录：原功能，能看到自己可见任务并能操作
  const mcode = host.ensureDeviceCode(m.id);
  const mlogin = await call(port, '/api/device/login', { method: 'POST', body: { code: mcode } });
  assert.strictEqual(mlogin.status, 200);
  assert.ok(!mlogin.data.viewer, '成员码不是查看者');
  const mstate = await call(port, '/api/mobile/state', { token: mlogin.data.token });
  assert.ok(mstate.data.tasks.some((t) => t.text === '仅乙可见'), '成员能看到指派给自己的任务');
  const mact = await call(port, '/api/action', { method: 'POST', token: mlogin.data.token, body: { type: 'togglePersonalDone', id: 't1' } });
  assert.strictEqual(mact.status, 200, '成员的勾选操作应成功');
  console.log('✓ 成员码保持原功能：可查看、可操作');

  // 5. 码冲突检测：成员码不能与查看者码相同
  const dup = host.setDeviceCode(m.id, vcode);
  assert.strictEqual(dup.ok, false, '成员码不能占用查看者码');
  console.log('✓ 成员码与查看者码互不冲突');

  // 6. 重置查看者码后旧码立即失效
  const before = viewerCode;
  const reset = host.resetViewerCode();
  assert.notStrictEqual(reset.code, before);
  const oldLogin = await call(port, '/api/device/login', { method: 'POST', body: { code: before } });
  assert.strictEqual(oldLogin.status, 403, '旧查看者码应失效');
  console.log('✓ 重置后旧查看者码立即失效');

  host.close();
}

main().then(() => console.log('ALL PASS viewer.test.js')).catch((e) => { console.error(e); process.exit(1); });
