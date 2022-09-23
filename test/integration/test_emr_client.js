const { expect } = require('chai');
const EmrClient = require('../../src/aws/emr_client');
const EmrSparkStep = require('../../src/steps/emr_spark_step')

describe('Test Emr client', () => {
  it('Should able to get cluster by name', () => {
    var emrClient = new EmrClient('ap-southeast-2');
    return emrClient.getClusterByName("Requirements Enrichment Pipeline")
      .then(clusters => console.log(clusters))
      .catch(e => {
        console.log(e)
      })
  });
  
  it('Should throw exception if not found', () => {
    var emrClient = new EmrClient('ap-southeast-2');
    return emrClient.getClusterByName("not exists cluster")
      .catch(e => {
        console.log(e)
      })
  });
});
