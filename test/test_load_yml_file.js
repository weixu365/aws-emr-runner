const { expect } = require('chai');
const Config = require('../src/config');
 
describe('Test load yaml file', () => {
  it("Load config", () => {
    const config = new Config('enrichment-pipeline.settings.yml', 'enrichment-pipeline.yml')
    config.load()
  });
});
