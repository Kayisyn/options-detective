// Bridge to the Python math engine (backend/math/engine.py).
//
// Keeps ONE warm `engine.py --serve` child alive and pipelines requests over
// line-delimited JSON with ids. scipy import costs ~0.5s; paying it once per
// process instead of once per call is what makes Detector screens sub-second.
// A hung or crashed child is recycled automatically on the next call.
//
// Full protocol contract in docs/api-schema.md.
const { spawn } = require("child_process");
const path = require("path");

const { MATH_DIR, pythonBin } = require("./python");

// Domain error: the engine rejected the inputs (bad strike, arbitrage
// violation, ...). Infrastructure failures reject with a plain Error.
class EngineDomainError extends Error {}

class EngineClient {
  constructor() {
    this.proc = null;
    this.pending = new Map(); // id -> { resolve, reject, timer }
    this.nextId = 1;
    this.buffer = "";
  }

  ensureProcess() {
    if (this.proc) return;
    const proc = spawn(pythonBin(), [path.join(MATH_DIR, "engine.py"), "--serve"], {
      cwd: MATH_DIR,
      windowsHide: true,
    });
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => this.onData(chunk));
    proc.stderr.on("data", (chunk) => {
      if (process.env.OD_DEBUG) console.error("[math engine]", chunk.trimEnd());
    });
    proc.on("error", (err) => {
      this.proc = null;
      this.failAll(new Error(`failed to start math engine: ${err.message}`));
    });
    proc.on("close", (code) => {
      this.proc = null;
      this.buffer = "";
      this.failAll(new Error(`math engine exited unexpectedly (code ${code})`));
    });
    this.proc = proc;
  }

  onData(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // stray non-JSON noise; the per-request timeout backstops us
      }
      const entry = this.pending.get(msg.id);
      if (!entry) continue;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new EngineDomainError(msg.error));
    }
  }

  failAll(err) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }

  call(fn, args, { timeoutMs = 30_000 } = {}) {
    return new Promise((resolve, reject) => {
      try {
        this.ensureProcess();
      } catch (err) {
        reject(err);
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // a hung interpreter cannot be trusted; recycle it (close handler
        // fails any other in-flight requests)
        if (this.proc) {
          this.proc.kill();
          this.proc = null;
        }
        reject(new Error(`math engine timed out after ${timeoutMs}ms (fn=${fn})`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.proc.stdin.write(`${JSON.stringify({ id, fn, args })}\n`);
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new Error(`math engine write failed: ${err.message}`));
      }
    });
  }

  shutdown() {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill();
      this.proc = null;
    }
  }
}

const sharedClient = new EngineClient();

function callEngine(fn, args, opts) {
  return sharedClient.call(fn, args, opts);
}

// One warm-engine round trip for many computations; returns the per-item
// [{ok, result|error}, ...] envelopes so callers decide what is fatal.
function callEngineBatch(requests, opts = {}) {
  return sharedClient.call("batch", { requests }, { timeoutMs: 60_000, ...opts });
}

module.exports = { callEngine, callEngineBatch, EngineDomainError, engineClient: sharedClient };
