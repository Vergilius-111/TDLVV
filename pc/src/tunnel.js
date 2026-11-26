'use strict';
// 用 cloudflared 快速隧道把本机的共享服务暴露到公网，供不同网络的同事访问
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function binaryPath() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'cloudflared.exe'));
  candidates.push(path.join(__dirname, '..', 'bin', 'cloudflared.exe'));
  candidates.push(path.join(__dirname, '..', 'bin', 'cloudflared'));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {
      /* ignore */
    }
  }
  return null;
}

class Tunnel {
  constructor({ onUrl, onStatus } = {}) {
    this.bin = binaryPath();
    this.proc = null;
    this.url = '';
    this.port = 0;
    this.stopped = false;
    this.pending = [];
    this.retryTimer = null;
    this.onUrl = onUrl || (() => {});
    this.onStatus = onStatus || (() => {});
  }

  status(s) {
    this.onStatus(s);
  }

  start(port) {
    this.port = port;
    this.stopped = false;
    if (!this.bin) {
      this.status({ state: 'unavailable', reason: '缺少 cloudflared 组件' });
      return Promise.resolve('');
    }
    if (this.proc) return Promise.resolve(this.url);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.status({ state: this.url ? 'ready' : 'starting' });
        resolve(this.url || '');
      }, 22000);
      this.pending.push((u) => {
        clearTimeout(timer);
        resolve(u || '');
      });
      this.spawnProc();
    });
  }

  spawnProc() {
    if (this.stopped || this.proc) return;
    const args = [
      'tunnel',
      '--url',
      `http://127.0.0.1:${this.port}`,
      '--no-autoupdate',
      '--protocol',
      'http2',
      '--loglevel',
      'info'
    ];
    this.status({ state: 'starting' });
    let proc;
    try {
      proc = spawn(this.bin, args, { windowsHide: true });
    } catch (e) {
      this.status({ state: 'failed', reason: e.message });
      return;
    }
    this.proc = proc;
    const onData = (buf) => {
      const text = buf.toString();
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && m[0] !== this.url) {
        this.url = m[0];
        this.status({ state: 'ready', url: this.url });
        this.onUrl(this.url);
        const list = this.pending.splice(0);
        list.forEach((fn) => fn(this.url));
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', () => {
      this.proc = null;
      this.url = '';
      if (this.stopped) return;
      this.status({ state: 'restarting' });
      this.retryTimer = setTimeout(() => {
        if (!this.stopped) this.spawnProc();
      }, 6000);
    });
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.proc) {
      try {
        this.proc.kill();
      } catch (e) {
        /* ignore */
      }
      this.proc = null;
    }
    this.url = '';
  }
}

module.exports = { Tunnel, binaryPath };
