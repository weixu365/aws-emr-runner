const vm = require('vm');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { execSync } = require('child_process');
const Bluebird = require('bluebird');
const lodash = require('lodash');
const logger = require("./logger");

class ScriptRunner {
  constructor() {
    this.stdin = process.stdin;
    this.stdout = process.stdout;
    this.stderr = process.stderr;
    this.logger = logger
  }

  runScripts(hookScript, emrRunner) {
    const scripts = Array.isArray(hookScript) ? hookScript : [hookScript];

    return Bluebird.each(scripts, script => {
      if (lodash.isNil(script)) {
        return;
      }

      if (fs.existsSync(script) && path.extname(script) === '.js') {
        return this.runJavascriptFile(script, emrRunner);
      }

      return this.runCommand(script);
    });
  }

  runCommand(hookScript) {
    this.logger.info(`Running command: ${hookScript}`);
    return execSync(hookScript, { stdio: [this.stdin, this.stdout, this.stderr] });
  }

  runJavascriptFile(scriptFile, emrRunner) {
    this.logger.info(`Running javascript file: ${scriptFile}`);
    const buildModule = () => {
      const m = new Module(scriptFile, module.parent);
      m.exports = exports;
      m.filename = scriptFile;
      m.paths = Module._nodeModulePaths(path.dirname(scriptFile)).concat(module.paths);

      return m;
    };

    const sandbox = {
      module: buildModule(),
      require: id => sandbox.module.require(id),
      console,
      process,
      emrRunner: emrRunner,
      __filename: scriptFile,
      __dirname: path.dirname(fs.realpathSync(scriptFile)),
    };

    // See: https://github.com/nodejs/node/blob/7c452845b8d44287f5db96a7f19e7d395e1899ab/lib/internal/modules/cjs/helpers.js#L14
    sandbox.require.resolve = req => Module._resolveFilename(req, sandbox.module);

    const scriptCode = fs.readFileSync(scriptFile);
    const script = vm.createScript(scriptCode, scriptFile);
    const context = vm.createContext(sandbox);

    return script.runInContext(context);
  }
}

module.exports = ScriptRunner;
