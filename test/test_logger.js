const { expect } = require('chai');
const logger = require('../src/logger');
 
describe('Test logger', () => {
  it("Log messages", () => {
    logger.info("Test log message")
    logger.info("some other tests")
  });
});
