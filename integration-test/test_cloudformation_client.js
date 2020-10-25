const { expect, assert } = require('chai');
const yaml = require('js-yaml');
const CloudformationClient = require('../src/aws/cloudformation_client');
const Config = require('../src/config');

describe('Test Cloudformation client', () => {
  it('Should able to get stack resources', () => {
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.getStackResources('requirements-enrichment-pipeline-resources-prod')
      .then(resources => console.log(resources))
  });

  it('Should able to get stack by name', () => {
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.getStack('requirements-enrichment-pipeline-resources-prod')
      .then(resources => console.log(resources))
  });

  it('Should get null if stack not exists', () => {
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.getStack('non-exists-stack-name')
      .then(resources => assert(resources == null))
  });

  it('Should generate stack template', () => {
    const config = new Config('samples/enrichment-pipeline.yml', ['samples/enrichment-pipeline.settings.yml'])
    const stackName = config.getResourceStackName()
    const resources = config.load().get().resources
    
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    const template = cloudformationClient.generateStackTemplate(config.getName(), resources)
    console.log(template)
  });

  it.skip('Should able to deploy stack', () => {
    const config = new Config('samples/enrichment-pipeline.yml', ['samples/enrichment-pipeline.settings.yml'])
    const resources = config.load().get().resources
    const stackName = config.getResourceStackName()
    
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.deploy(stackName, resources, {}, config.get().cluster.Tags)
  });

  it('Should able to list change sets', () => {
    const config = new Config('samples/enrichment-pipeline.yml', ['samples/enrichment-pipeline.settings.yml'])
    const stackName = config.getResourceStackName()
    
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.listChangeSets(stackName)
      .then(data => console.log(JSON.stringify(data, null, '  ')))
  });
});
