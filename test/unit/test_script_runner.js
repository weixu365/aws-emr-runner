const { expect, assert } = require('chai');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const Bluebird = require('bluebird');
const ScriptRunner = require('../../src/script_runner');

describe('ScriptRunnerTest', () => {
  it('should run command', () => {
    const randomString = `current time ${new Date().getTime()}`;
    const scriptRunner = new ScriptRunner();

    scriptRunner.stdout = tmp.fileSync({ prefix: 'stdout-' });
    scriptRunner.stderr = tmp.fileSync({ prefix: 'stderr-' });

    return scriptRunner.runScripts(`echo ${randomString}`, emrRunner())
      .then(() => {
        console.log('checking file', scriptRunner.stdout.name);
        expect(fs.readFileSync(scriptRunner.stdout.name, { encoding: 'utf-8' })).string(randomString);
        expect(fs.readFileSync(scriptRunner.stderr.name, { encoding: 'utf-8' })).equal('');
      });
  });

  it('should able to run multiple commands', () => {
    const randomString = `current time ${new Date().getTime()}`;
    const randomString2 = `current time 2 ${new Date().getTime()}`;
    const scriptRunner = new ScriptRunner();
    const cmds = [
      `echo ${randomString}`,
      `echo ${randomString2}`,
    ]

    scriptRunner.stdout = tmp.fileSync({ prefix: 'stdout-' });
    scriptRunner.stderr = tmp.fileSync({ prefix: 'stderr-' });

    return scriptRunner.runScripts(cmds, emrRunner())
      .then(() => {
        const consoleOutput = fs.readFileSync(scriptRunner.stdout.name, { encoding: 'utf-8' });
        expect(consoleOutput).string(`${randomString}\n${randomString2}`);
        expect(fs.readFileSync(scriptRunner.stderr.name, { encoding: 'utf-8' })).equal('');
      });
  });

  it('should print error message when failed to run command', () => {
    const scriptRunner = new ScriptRunner();
    scriptRunner.stdout = tmp.fileSync({ prefix: 'stdout-' });
    scriptRunner.stderr = tmp.fileSync({ prefix: 'stderr-' });

    return scriptRunner.runScripts('not-exists', emrRunner())
      .then(() => expect(false).equal(true, 'Should throw exception when command not exists'))
      .catch(() => {
        expect(fs.readFileSync(scriptRunner.stderr.name, { encoding: 'utf-8' })).string('/bin/sh');
        expect(fs.readFileSync(scriptRunner.stderr.name, { encoding: 'utf-8' })).string('not-exists:');
        expect(fs.readFileSync(scriptRunner.stderr.name, { encoding: 'utf-8' })).string('not found');
        expect(fs.readFileSync(scriptRunner.stdout.name, { encoding: 'utf-8' })).equal('');
      });
  });

  it('should run javascript', () => {
    const scriptFile = tmp.fileSync({ postfix: '.js' });
    fs.writeFileSync(scriptFile.name, 'emrRunner.config.deploy.artifact = "new-package.zip";');

    const context = emrRunner({ deploy: {artifact: 'test'} });
    const scriptRunner = new ScriptRunner();
    
    return scriptRunner.runScripts(scriptFile.name, context)
      .then(() => expect(context.config.deploy.artifact).equal('new-package.zip'));
  });

  it('should able to import modules in javascript', () => {
    const scriptModuleFile = tmp.fileSync({ postfix: '.js' });
    const moduleName = path.basename(scriptModuleFile.name);
    fs.writeFileSync(scriptModuleFile.name, 'module.exports = { test: () => "hello" }');

    const scriptFile = tmp.fileSync({ postfix: '.js' });
    fs.writeFileSync(scriptFile.name, `
      const m = require('./${moduleName}');
      const path = require('path');
      const modulePath = require.resolve('./${moduleName}');
      emrRunner.config.test = m.test() + path.basename(modulePath);
    `);

    const context = emrRunner({});
    const scriptRunner = new ScriptRunner();

    return scriptRunner.runScripts(scriptFile.name, context)
      .then(() => expect(context.config.test).equal(`hello${moduleName}`));
  });

  it('should wait for async method to be finished', () => {
    const scriptFile = tmp.fileSync({ postfix: '.js' });
    const script = 'require("bluebird").delay(100).then(() => emrRunner.config.test = "test.zip")';
    fs.writeFileSync(scriptFile.name, script);

    const context = emrRunner({});
    const scriptRunner = new ScriptRunner();

    return Bluebird.resolve(scriptRunner.runScripts(scriptFile.name, context))
      .then(() => expect(context.config.test).equal('test.zip'));
  });

  it('should run multiple javascript files', () => {
    const scriptFile = tmp.fileSync({ postfix: '.js' });
    fs.writeFileSync(scriptFile.name, 'emrRunner.config.service = "test.zip";');

    const scriptFile2 = tmp.fileSync({ postfix: '.js' });
    fs.writeFileSync(scriptFile2.name, 'emrRunner.config.service2 = "AWS";');

    const context = emrRunner({});
    const scriptRunner = new ScriptRunner();

    return scriptRunner.runScripts([scriptFile.name, scriptFile2.name], context)
      .then(() => {
        expect(context.config.service).equal('test.zip');
        expect(context.config.service2).equal('AWS');
      });
  });

  it('should run any executable file', () => {
    const randomString = `current time ${new Date().getTime()}`;

    const scriptFile = tmp.fileSync({ postfix: '.sh' });
    fs.chmodSync(scriptFile.name, '755');
    fs.writeFileSync(scriptFile.name, `echo ${randomString}`);
    fs.closeSync(scriptFile.fd);

    const context = emrRunner({ test: scriptFile.name });
    const scriptRunner = new ScriptRunner();

    scriptRunner.stdout = tmp.fileSync({ prefix: 'stdout-' });
    scriptRunner.stderr = tmp.fileSync({ prefix: 'stderr-' });

    return scriptRunner.runScripts(scriptFile.name, context)
      .then(() => {
        expect(fs.readFileSync(scriptRunner.stdout.name, { encoding: 'utf-8' })).string(randomString);
        expect(fs.readFileSync(scriptRunner.stderr.name, { encoding: 'utf-8' })).equal('');
      })
      .catch(() => {
        const stdout = fs.readFileSync(scriptRunner.stdout.name, { encoding: 'utf-8' });
        const stderr = fs.readFileSync(scriptRunner.stderr.name, { encoding: 'utf-8' });

        expect(true).equals(false, `stdout: ${stdout}\n stderr: ${stderr}`);
      });
  });

  function emrRunner(config) {
    return { config };
  }
});