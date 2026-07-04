// Shared Python interpreter resolution for the math engine and data adapter.
const { existsSync } = require("fs");
const path = require("path");

const MATH_DIR = path.join(__dirname, "..", "math");

function pythonBin() {
  const venvWin = path.join(MATH_DIR, ".venv", "Scripts", "python.exe");
  const venvPosix = path.join(MATH_DIR, ".venv", "bin", "python");
  if (existsSync(venvWin)) return venvWin;
  if (existsSync(venvPosix)) return venvPosix;
  return process.env.PYTHON_BIN || "python";
}

module.exports = { MATH_DIR, pythonBin };
