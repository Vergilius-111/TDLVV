'use strict';
// 任务完成后生成「AI 汇总请求」：把源文件路径、输出路径、说明写进任务文件夹，
// 供 WorkBuddy / 其他 AI 软件立即接手，不依赖后台定时轮询。
const fs = require('fs');
const path = require('path');

function safeName(v, max = 120) {
  const raw = String(v || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
  return (raw || '任务').slice(0, max);
}

/**
 * 收集任务的所有源文件绝对路径（创建者原稿 + 各成员提交副本），去重。
 * @param {object} io { resolveFile(rel, root), exists(abs), members, displayName(m) }
 */
function collectSourceFiles(task, io) {
  const out = [];
  const push = (meta, role) => {
    if (!meta || !meta.storedRel) return;
    const abs = io.resolveFile(meta.storedRel, meta.root);
    if (!abs || !io.exists(abs)) return;
    if (out.some((x) => x.path === abs)) return;
    out.push({
      path: abs,
      name: meta.displayName || path.basename(abs),
      role,
      uploader: meta.uploadedByName || '',
      size: Number(meta.size) || 0,
      version: Number(meta.version) || 1
    });
  };
  push(task.file, 'creator');
  Object.keys(task.memberFiles || {}).forEach((memberId) => {
    const m = (io.members || []).find((x) => x.id === memberId);
    push(task.memberFiles[memberId], (m ? io.displayName(m) : memberId) || 'member');
  });
  return out;
}

/**
 * 构造请求对象。
 * @param {object} opts { teamName, task, note, taskFolder, aiBridge, io }
 */
function buildRequest(opts) {
  const o = opts || {};
  const task = o.task || {};
  const folder = o.taskFolder || '';
  const sourceFiles = collectSourceFiles(task, o.io || {});
  const outputName = safeName(`${task.text || '任务'}-成员汇总.xlsx`);
  return {
    schemaVersion: 1,
    type: 'tdlvv.ai.summary.request',
    createdAt: Date.now(),
    status: 'pending',
    task: {
      id: task.id || '',
      title: task.text || '',
      done: true,
      doneByName: task.doneByName || '',
      fields: task.fields || [],
      team: o.teamName || '',
      teamId: o.teamId || ''
    },
    instruction: String(o.note || ''),
    taskFolder: folder,
    outputPath: folder ? path.join(folder, outputName) : '',
    outputName,
    sourceFiles,
    aiBridge: o.aiBridge ? {
      baseUrl: o.aiBridge.baseUrl,
      token: o.aiBridge.token,
      endpoints: o.aiBridge.endpoints
    } : null,
    hint: '请读取 sourceFiles 里的每个文件，按任务要求整合成一份总表，保存到 outputPath。不要修改源文件。生成后把本请求的 status 改为 done。'
  };
}

function toMarkdown(req) {
  const lines = [];
  lines.push('# TDLVV AI 汇总请求');
  lines.push('');
  lines.push(`- 任务：**${req.task.title}**`);
  lines.push(`- 团队：${req.task.team || '个人'}`);
  lines.push(`- 完成人：${req.task.doneByName || '—'}`);
  lines.push(`- 生成时间：${new Date(req.createdAt).toLocaleString()}`);
  lines.push(`- 状态：${req.status}`);
  if (req.instruction) lines.push(`- 汇总要求：${req.instruction}`);
  lines.push('');
  lines.push('## 源文件');
  if (!req.sourceFiles.length) lines.push('（无附件文件）');
  req.sourceFiles.forEach((f, i) => {
    lines.push(`${i + 1}. ${f.role} · ${f.name}`);
    lines.push(`   \`${f.path}\``);
  });
  lines.push('');
  lines.push('## 输出');
  lines.push(`请把整合汇总结果保存到：\`${req.outputPath}\``);
  lines.push('不要修改任何源文件。完成后把 AI汇总请求.json 里的 status 改为 done。');
  lines.push('');
  lines.push('## 给 AI 的提示词');
  lines.push('```');
  lines.push(`请读取上面列出的所有源文件，按任务「${req.task.title}」`);
  lines.push('把各成员的信息整合汇总成一份总表。');
  if (req.instruction) lines.push(`汇总要求：${req.instruction}`);
  lines.push(`把结果保存为 ${req.outputPath}。`);
  lines.push('如果文件是表格且结构一致，做横向对比总表；结构不一致则纵向合并并标注来源。');
  lines.push('```');
  if (req.aiBridge && req.aiBridge.baseUrl) {
    lines.push('');
    lines.push('## TDLVV 本地接口（可选）');
    lines.push(`- 地址：${req.aiBridge.baseUrl}`);
    lines.push(`- 令牌：${req.aiBridge.token}`);
  }
  return lines.join('\n');
}

/** 写请求文件到任务文件夹，返回路径 */
function writeRequest(folder, req) {
  fs.mkdirSync(folder, { recursive: true });
  const jsonPath = path.join(folder, 'AI汇总请求.json');
  const mdPath = path.join(folder, 'AI汇总请求.md');
  fs.writeFileSync(jsonPath, JSON.stringify(req, null, 2), 'utf8');
  fs.writeFileSync(mdPath, toMarkdown(req), 'utf8');
  return { jsonPath, mdPath };
}

/**
 * 可直接发给 AI（WorkBuddy）的提示词：把源文件路径、输出路径、要求拼成一段完整指令。
 * 用于生成请求后自动在 WorkBuddy 里发起对话，让 AI 立刻接手处理文件。
 */
function promptText(req) {
  const r = req || {};
  const lines = [];
  lines.push(`请帮我处理任务「${r.task && r.task.title ? r.task.title : '任务'}」的文件汇总。`);
  if (r.instruction) lines.push(`汇总要求：${r.instruction}`);
  lines.push('');
  lines.push('源文件（请逐个读取）：');
  (r.sourceFiles || []).forEach((f, i) => {
    lines.push(`${i + 1}. ${f.name}（${f.role || '成员'}）`);
    lines.push(`   ${f.path}`);
  });
  lines.push('');
  if (r.outputPath) {
    lines.push(`请把整合后的总表保存到：${r.outputPath}`);
  }
  lines.push('不要修改任何源文件。结构一致就做横向对比总表，结构不一致就纵向合并并标注来源。');
  lines.push('请求详情文件：' + path.join(r.taskFolder || '', 'AI汇总请求.json'));
  return lines.join('\n');
}

module.exports = { safeName, collectSourceFiles, buildRequest, toMarkdown, writeRequest, promptText };
