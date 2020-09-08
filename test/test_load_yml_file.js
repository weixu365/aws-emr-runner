const { expect } = require('chai');
const Config = require('../src/config');
const Bluebird = require('bluebird');
 
describe('Test load yaml file', () => {
  it("Load config", () => {
    new Config('enrichment-pipeline.settings.yml', 'enrichment-pipeline.yml')
  });

  it("test", () => {
    const promiseRetry = require('promise-retry');
    var count = 0
    return promiseRetry((retry, number) => {
      console.log(`trying ${number} ...`);
      
      return Bluebird.resolve(1)
        .then(r => {
          count +=1
          if (count < 3) {
            console.log("   return retry....")
            return retry()
          }

          console.log("   return success")

          return count
        })
        .catch(e => {
          console.log(`  Failed to runn`)
          return retry()
        })
    }, {retries: 1000, minTimeout: 5000, factor: 1})
  });
});
