const { expect, assert } = require('chai');
const logger = require('../../src/logger');
 
describe('Test logger', () => {
  it("Log messages", () => {
    logger.info("Test log message")
    logger.info("some other tests")
    const e = new Error('Error for testing')
    logger.error(e.stack)
  });
});
