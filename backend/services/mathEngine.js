// Bridge to the Python math engine (backend/math/engine.py).
// Protocol: one JSON request on stdin -> one JSON response on stdout.
// Full contract in docs/api-schema.md.
const { spawn } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const MATH_DIR = path.join(__dirname, "..", "math");

// Domain error: the engine rejected the inputs (bad strike, arbitrage
// violation, ...). Infrastructure failures reject with a plain Error.
class EngineDomainError extends Error {}

function pythonBin() {
  const venvWin = path.join(MATH_DIR, ".venv", "Scripts", "python.exe");
  const venvPosix = path.join(MATH_DIR, ".venv", "bin", "python");
  if (existsSync(venvWin)) return venvWin;
  if (existsSync(venvPosix)) return venvPosix;
  return process.env.PYTHON_BIN || "python";
}

function callEngine(fn, args, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin(), [path.join(MATH_DIR, "engine.py")], {
      cwd: MATH_DIR,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`math engine timed out after ${timeoutMs}ms (fn=${fn})`));
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => { stdout += chunk; });
    proc.stderr.on("data", (chunk) => { stderr += chunk; });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`failed to start math engine: ${err.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`math engine exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(new Error(`math engine returned invalid JSON: ${stdout.slice(0, 200)}`));
        return;
      }
      if (!parsed.ok) {
        reject(new EngineDomainError(parsed.error));
        return;
      }
      resolve(parsed.result);
    });

    proc.stdin.write(JSON.stringify({ fn, args }));
    proc.stdin.end();
  });
}

module.exports = { callEngine, EngineDomainError };
