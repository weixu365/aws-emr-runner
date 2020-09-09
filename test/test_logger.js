const { expect } = require('chai');
const Logger = require('../src/logger');
 
describe('Test logger', () => {
  it("Log messages", () => {
    Logger.getLogger().info("Test log message")
    Logger.getLogger().info("some other tests")
  });
});
