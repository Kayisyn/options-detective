// Resolution of the math runtime, shared by the engine bridge and the data
// adapter. Two modes:
//   dev:      venv interpreter running the .py sources in backend/math
//   packaged: the PyInstaller-built od-math.exe (Electron main sets
//             OD_MATH_BIN); end users never install Python
const { existsSync } = require("fs");
const path = require("path");

const MATH_DIR = path.join(__dirname, "..", "math");

const ENTRIES = new Set(["engine", "market_data"]);

function pythonBin() {
  const venvWin = path.join(MATH_DIR, ".venv", "Scripts", "python.exe");
  const venvPosix = path.join(MATH_DIR, ".venv", "bin", "python");
  if (existsSync(venvWin)) return venvWin;
  if (existsSync(venvPosix)) return venvPosix;
  return process.env.PYTHON_BIN || "python";
}

// How to spawn a math entry point: { bin, args, cwd }.
function mathCommand(entry, extraArgs = []) {
  if (!ENTRIES.has(entry)) {
    throw new Error(`unknown math entry ${JSON.stringify(entry)}`);
  }
  const packagedBin = process.env.OD_MATH_BIN;
  if (packagedBin) {
    return {
      bin: packagedBin,
      args: [entry, ...extraArgs],
      cwd: path.dirname(packagedBin),
    };
  }
  return {
    bin: pythonBin(),
    args: [path.join(MATH_DIR, `${entry}.py`), ...extraArgs],
    cwd: MATH_DIR,
  };
}

module.exports = { MATH_DIR, pythonBin, mathCommand };
