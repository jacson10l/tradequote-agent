// Explicit acceptance host: production settings stay inside Main; business and
// Chromium session data are isolated. No model/provider response is substituted.
const { app } = require("electron");
const { mkdirSync } = require("node:fs");
const { isAbsolute, join, relative, resolve, sep } = require("node:path");
const root = process.env.TRADEQUOTE_REHEARSAL_DATA;
const inside = root && relative(resolve(__dirname, "../../.runtime"), root);
if (
  app.isPackaged ||
  !root ||
  !isAbsolute(root) ||
  !inside ||
  inside === ".." ||
  inside.startsWith(`..${sep}`) ||
  isAbsolute(inside)
)
  throw Error("isolated unpackaged acceptance directory required");
mkdirSync(join(root, "chromium-session"), { recursive: true });
app.setPath("sessionData", join(root, "chromium-session"));
// This read-only settings acceptance instance must not take over an open user's app.
app.requestSingleInstanceLock = () => true;
require("./rehearsal-host.cjs");
