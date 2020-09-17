const { expect } = require('chai');
const Config = require('../src/config');
 
describe('Test load yaml file', () => {
  it("Load config", () => {
    const config = new Config('samples/enrichment-pipeline.yml', ['samples/enrichment-pipeline.settings.yml'])
    config.load()
  });
});
