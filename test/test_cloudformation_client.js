const { expect } = require('chai');
const CloudformationClient = require('../src/cloudformation_client');

describe('Test Cloudformation client', () => {
  it('Should able to get cluster by name', () => {
    var cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.getStackResources('requirements-enrichment-pipeline-resources-prod')
      .then(resources => console.log(resources))
  });
});
