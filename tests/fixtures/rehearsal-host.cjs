// Acceptance harness only: production Main owns credentials/IPC; only the
// Business Worker's database argument is redirected to a fresh demo directory.
const { app, utilityProcess } = require("electron");
const { isAbsolute, join, relative, resolve, sep } = require("node:path");

const root = process.env.TRADEQUOTE_REHEARSAL_DATA;
const runtime = resolve(__dirname, "../../.runtime");
const within = root && relative(runtime, root);
if (
  app.isPackaged ||
  !root ||
  !isAbsolute(root) ||
  !within ||
  within === ".." ||
  within.startsWith(`..${sep}`) ||
  isAbsolute(within) ||
  process.env.TRADEQUOTE_TEST_DATA ||
  process.env.TRADEQUOTE_TEST_MODEL_URL
) {
  throw Error("rehearsal requires an isolated .runtime directory and production model endpoint");
}
const fork = utilityProcess.fork.bind(utilityProcess);
utilityProcess.fork = (entry, args, options) => {
  if (options?.serviceName === "TradeQuote Business") {
    if (resolve(entry) !== resolve(__dirname, "../../apps/desktop/out/main/worker.js"))
      throw Error("unexpected business entry");
    return fork(entry, [join(root, "workspaces/default/workspace.sqlite")], options);
  }
  return fork(entry, args, options);
};
require("../../apps/desktop/out/main/index.js");
