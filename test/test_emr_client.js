const { expect } = require('chai');
const EmrClient = require('../src/aws/emr_client');
const EmrSparkStep = require('../src/steps/emr_spark_step')

describe('Test Emr client', () => {
  it('Should able to get cluster by name', () => {
    var emrClient = new EmrClient();
    return emrClient.getClusterByName("AIPS CQ Requirements Enrichment Pipeline")
      .then(clusters => console.log(clusters))
  });
  
  it('Should throw exception if not found', () => {
    var emrClient = new EmrClient();
    return emrClient.getClusterByName("not exists cluster")
      .catch(e => {
        console.log(e)
      })
  });

  it('Should add spark step', () => {
    var emrClient = new EmrClient();
    var steps = [new EmrSparkStep("Enrich profiles", "seek.aips.enrichment.Main", "bucketName", "deployPackageName")]
    return emrClient.getClusterByName("AIPS CQ Requirements Enrichment Pipeline")
      .then(cluster => emrClient.addSteps(cluster.id, steps))
  });
});
