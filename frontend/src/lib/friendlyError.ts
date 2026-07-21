// v1.10.2: turn a caught error into a message safe to show the user. Strips
// the Electron IPC wrapper, forces a no-enumeration message on the login
// screen, maps known backend conditions (funds, symbol, risk) to plain
// language, and falls back to a generic line for anything technical so no
// stack trace, file path or internal detail ever reaches the UI. The raw
// error should still be console.error'd at the call site for debugging.

export type ErrorContext = "login" | "register" | "trade" | "data" | "general";

const GENERIC = "Something went wrong. Please try again.";
const CREDENTIALS = "Invalid login credentials. Please try again.";
const ENGINE = "Can't reach the app's engine. Please restart the app and try again.";

// pull the human message out of "Error invoking remote method 'api:x': Error: <msg>"
function unwrap(raw: string): string {
  const ipc = raw.match(/Error invoking remote method [^:]*:\s*(?:Error:\s*)?(.*)/is);
  let msg = (ipc ? ipc[1] : raw).trim();
  // collapse a leading "Error: " that some rejections carry
  msg = msg.replace(/^Error:\s*/i, "").trim();
  return msg;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "";
}

// markers that mean the text is a technical/internal leak, never user copy
const LEAK = /error invoking|typeerror|referenceerror|rangeerror|is not a function|cannot read|is not defined|unexpected token|internal error|see server logs|\bundefined\b|\bnull\b|\.js:|\n\s*at\s|econn|err_|stack/i;
const NETWORK = /failed to fetch|network ?error|networkrequestfailed|load failed|fetch failed|econnrefused|err_connection|err_network/i;

export function friendlyError(err: unknown, context: ErrorContext = "general"): string {
  const raw = messageOf(err);
  if (!raw) return GENERIC;
  const msg = unwrap(raw);
  const low = msg.toLowerCase();

  // engine/backend unreachable
  if (NETWORK.test(low)) return ENGINE;

  // sign-in: same message whatever was wrong, so the form reveals nothing
  if (context === "login") return CREDENTIALS;
  if (/incorrect username or password|invalid login|not signed in|unauthorized|401/.test(low)) {
    return CREDENTIALS;
  }

  // trade execution
  if (/not enough cash|insufficient|exceeds .*budget|over budget|no budget|budget .*(set|exceed)/.test(low)) {
    return "Cannot place this order. Please check your account balance.";
  }
  if (/invalid ticker|unknown symbol|symbol not found|no (data|quotes?) for|ticker .*(not|invalid)|no chain/.test(low)) {
    return "Symbol not found. Please verify the ticker and try again.";
  }
  if (/risk limit|exceeds .*(risk|portfolio|limit)|position size|too large/.test(low)) {
    return "This order exceeds your portfolio limits. Adjust the size or check your settings.";
  }

  // anything that looks technical: never show it
  if (LEAK.test(msg) || msg.length > 160) return GENERIC;

  // otherwise this is an intentional, short backend/validation message
  // (e.g. password rules, "That username is taken", backup validation) that is
  // already appropriate to show
  return msg;
}
