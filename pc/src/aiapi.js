'use strict';
// 给外部 AI 软件读取 TDLVV 任务、字段和附件路径的本地只读接口
const http = require('http');
const fs = require('fs');
const path = require('path');

function send(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,x-tdlvv-token',
    'Access-Control-Allow-Methods': 'GET,OPTIONS'
  });
  res.end(JSON.stringify(obj));
}

function startAiApi(opts) {
  const o = opts || {};
  const token = String(o.token || '');
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type,x-tdlvv-token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      });
      return res.end();
    }
    if (!token || req.headers['x-tdlvv-token'] !== token) {
      return send(res, 401, { error: '缺少或错误的 X-TDLVV-Token' });
    }
    if (u.pathname === '/ai/v1/status') {
      return send(res, 200, {
        ok: true,
        app: 'TDLVV',
        version: o.version || '',
        fileRoot: o.fileRoot || '',
        taskFileRoot: o.taskFileRoot || '',
        endpoints: ['/ai/v1/status', '/ai/v1/schema', '/ai/v1/tasks', '/ai/v1/templates']
      });
    }
    if (u.pathname === '/ai/v1/schema') {
      return send(res, 200, {
        ok: true,
        schema: {
          team: ['id', 'name', 'kind', 'members[]', 'templates[]', 'filesRoot'],
          task: ['id', 'text', 'fields[]', 'audience', 'assigneeId', 'dueAt', 'done', 'progressBy{}', 'file', 'pendingFile', 'memberFiles{}'],
          file: ['displayName', 'storedRel', 'root', 'size', 'version', 'uploadedById', 'uploadedByName', 'path']
        }
      });
    }
    if (u.pathname === '/ai/v1/tasks') {
      const teams = (o.getTeams ? o.getTeams() : []) || [];
      return send(res, 200, {
        ok: true,
        generatedAt: Date.now(),
        teams: teams.map((team) => ({
          id: team.id,
          name: team.name,
          kind: team.kind,
          meId: team.meId,
          members: ((team.state && team.state.members) || []).map((m) => ({
            id: m.id,
            name: (m.remark && m.remark.trim()) || m.name,
            role: m.role,
            roleTag: m.roleTag || ''
          })),
          filesRoot: (team.state && team.state.filesRoot) || team.filesRoot || '',
          tasks: ((team.state && team.state.tasks) || []).map((t) => ({
            id: t.id,
            text: t.text,
            fields: t.fields || [],
            assigneeId: t.assigneeId || '',
            creatorId: t.creatorId || '',
            dueAt: t.dueAt || 0,
            done: !!t.done,
            closed: !!t.closed,
            progressBy: t.progressBy || {},
            file: publicFile(t.file, o.resolveFile, (team.state && team.state.filesRoot) || team.filesRoot),
            pendingFile: publicFile(t.pendingFile, o.resolveFile, (team.state && team.state.filesRoot) || team.filesRoot),
            memberFiles: Object.fromEntries(Object.entries(t.memberFiles || {}).map(([id, meta]) => [
              id,
              publicFile(meta, o.resolveFile, (team.state && team.state.filesRoot) || team.filesRoot)
            ]))
          }))
        }))
      });
    }
    if (u.pathname === '/ai/v1/templates') {
      const teams = (o.getTeams ? o.getTeams() : []) || [];
      return send(res, 200, {
        ok: true,
        teams: teams.map((team) => ({
          id: team.id,
          name: team.name,
          templates: (team.state && team.state.templates) || []
        }))
      });
    }
    return send(res, 404, { error: 'not found' });
  });
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const info = {
      app: 'TDLVV',
      version: o.version || '',
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      token,
      fileRoot: o.fileRoot || '',
      taskFileRoot: o.taskFileRoot || ''
    };
    try {
      if (o.userData) fs.writeFileSync(path.join(o.userData, 'ai-bridge.json'), JSON.stringify(info, null, 2));
    } catch (e) {
      /* ignore */
    }
    if (o.onReady) o.onReady(info);
  });
  return {
    server,
    close: () => {
      try { server.close(); } catch (e) { /* ignore */ }
    }
  };
}

function publicFile(meta, resolveFile, teamRoot) {
  if (!meta) return null;
  return {
    displayName: meta.displayName,
    storedRel: meta.storedRel,
    root: meta.root || teamRoot || '',
    size: meta.size,
    version: meta.version,
    uploadedById: meta.uploadedById,
    uploadedByName: meta.uploadedByName,
    path: resolveFile ? resolveFile(meta.storedRel, meta.root || teamRoot || '') || '' : ''
  };
}

module.exports = { startAiApi };
