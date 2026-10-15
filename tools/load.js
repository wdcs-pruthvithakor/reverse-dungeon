// Loads the game's simulation (no DOM) into a sandbox so tools can play it headlessly.
const fs = require('fs'), vm = require('vm'), path = require('path');
module.exports = function load() {
  const dir = path.join(__dirname, '..');
  const ctx = { console, Math, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['data', 'world', 'sim']) vm.runInContext(fs.readFileSync(path.join(dir, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  ctx.RD.onRaidEnd = () => {};
  return ctx.RD;
};
