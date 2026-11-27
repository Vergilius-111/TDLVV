'use strict';
// 同名团队去重：被移出/退出后重新加入同名团队，只保留最新加入的那个
const assert = require('assert');
const store = require('../src/store');

function main() {
  const mk = (id, name, kind) => ({ id, name, kind: kind || 'client' });

  // 1. 同名旧 client 团队被移除，保留 keepId（最新加入的）
  {
    const teams = [mk('local', '我的任务', 'local'), mk('old', '团队1'), mk('new', '团队1'), mk('host', '团队1', 'host')];
    const r = store.dedupeTeamsByName(teams, '团队1', 'new');
    assert.strictEqual(r.removed.length, 1, '只移除一个同名旧团队');
    assert.strictEqual(r.removed[0].id, 'old');
    assert.deepStrictEqual(r.teams.map((t) => t.id), ['local', 'new', 'host'], 'local 与 host 团队不受影响');
    assert.strictEqual(teams.length, 4, '入参未被修改');
    console.log('✓ 同名旧 client 团队被移除');
  }

  // 2. 多个同名旧团队全部移除
  {
    const teams = [mk('a', '团队1'), mk('b', '团队1'), mk('c', '团队1'), mk('new', '团队1')];
    const r = store.dedupeTeamsByName(teams, '团队1', 'new');
    assert.strictEqual(r.removed.length, 3);
    assert.deepStrictEqual(r.teams.map((t) => t.id), ['new']);
    console.log('✓ 多个同名旧团队全部移除');
  }

  // 3. 没有同名团队时原样返回
  {
    const teams = [mk('a', '团队A'), mk('b', '团队B')];
    const r = store.dedupeTeamsByName(teams, '团队C', 'new');
    assert.strictEqual(r.removed.length, 0);
    assert.strictEqual(r.teams, teams, '无重复时返回同一引用');
    console.log('✓ 无同名时不变');
  }

  // 4. 名字首尾空格按同一团队处理
  {
    const teams = [mk('old', '  团队1  '), mk('new', '团队1')];
    const r = store.dedupeTeamsByName(teams, ' 团队1 ', 'new');
    assert.strictEqual(r.removed.length, 1);
    assert.strictEqual(r.removed[0].id, 'old');
    console.log('✓ 名字 trim 后比较');
  }

  // 5. 空名字不做处理（避免误删）
  {
    const teams = [mk('a', ''), mk('b', '')];
    const r = store.dedupeTeamsByName(teams, '', 'new');
    assert.strictEqual(r.removed.length, 0);
    console.log('✓ 空名字不处理');
  }

  console.log('dedupe.test.js 全部通过');
}

main();
