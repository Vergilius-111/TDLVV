'use strict';
const store = require('./store');

/** 把任务文本压成适合系统通知的一行 */
function oneLine(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!max || s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function visibleTasks(state, memberId) {
  return (state.tasks || []).filter((t) => store.visibleTo(state, t, memberId));
}

/** 记录“已经见过”的任务范围，包含已完成任务，避免任务被勾完又取消时误报新任务 */
function visibleTaskIds(state, memberId) {
  return visibleTasks(state, memberId).map((t) => t.id);
}

/** 当前成员能看到、还没完成、也没关闭的任务 */
function pendingVisible(state, memberId) {
  return visibleTasks(state, memberId).filter((t) => !t.done && !t.closed);
}

/** 和上次记录相比，新出现或刚刚变成对当前成员可见的待办任务；自己创建的任务不提醒自己 */
function newPendingTasks(state, memberId, seenIds) {
  if (!Array.isArray(seenIds)) return [];
  const seen = new Set(seenIds);
  return pendingVisible(state, memberId).filter((t) => !seen.has(t.id) && t.creatorId !== memberId);
}

function newTaskMessage(teamName, tasks, meId, lang) {
  if (!tasks || !tasks.length) return null;
  const en = lang === 'en';
  const title = `TDLVV · ${teamName || (en ? 'Team' : '团队')}`;
  if (tasks.length === 1) {
    const t = tasks[0];
    const mine = t.assigneeId && t.assigneeId === meId;
    const prefix = en ? (mine ? 'Assigned to you: ' : 'New task: ') : (mine ? '指派给你：' : '新任务：');
    return { title, body: prefix + oneLine(t.text, 160), firstTaskId: t.id };
  }
  const lines = tasks.slice(0, 4).map((t) => `• ${oneLine(t.text, 70)}`);
  if (tasks.length > 4) lines.push(en ? `• ${tasks.length - 4} more…` : `• 还有 ${tasks.length - 4} 个…`);
  return {
    title,
    body: en ? `${tasks.length} new tasks\n${lines.join('\n')}` : `新增 ${tasks.length} 个任务\n${lines.join('\n')}`,
    firstTaskId: tasks[0].id
  };
}

function summaryMessage(teamName, count, lang) {
  if (!count) return null;
  return {
    title: `TDLVV · ${teamName || (lang === 'en' ? 'Team' : '团队')}`,
    body: lang === 'en'
      ? `Team synced. ${count} open tasks right now.`
      : `团队已同步，当前有 ${count} 个待办任务`
  };
}

module.exports = {
  oneLine,
  visibleTasks,
  visibleTaskIds,
  pendingVisible,
  newPendingTasks,
  newTaskMessage,
  summaryMessage
};
