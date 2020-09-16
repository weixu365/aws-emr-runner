const { expect } = require('chai');
const yaml = require('js-yaml');
const CloudformationClient = require('../src/cloudformation_client');
const Config = require('../src/config');

describe('Test Cloudformation client', () => {
  it('Should able to get stack resources', () => {
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.getStackResources('requirements-enrichment-pipeline-resources-prod')
      .then(resources => console.log(resources))
  });

  it('Should able to get stack by name', () => {
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.getStack('requirements-enrichment-pipeline-resources-prod-23')
      .then(resources => console.log(resources))
  });

  it('Should generate stack template', () => {
    const config = new Config('./enrichment-pipeline.yml', ['enrichment-pipeline.settings.yml'])
    const stackName = config.getResourceStackName()
    const resources = config.load().get().resources
    
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    const template = cloudformationClient.generateStackTemplate(config.getSetting('name'), resources)
    console.log(template)
  });

  it('Should able to deploy stack', () => {
    const config = new Config('./enrichment-pipeline.yml', ['enrichment-pipeline.settings.yml'])
    const resources = config.load().get().resources
    const stackName = config.getResourceStackName()
    
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.deploy(stackName, resources, {}, config.get().cluster.Tags)
    
  });

  it('Should able to list change sets', () => {
    const config = new Config('./enrichment-pipeline.yml', ['enrichment-pipeline.settings.yml'])
    const stackName = config.getResourceStackName()
    
    const cloudformationClient = new CloudformationClient('ap-southeast-2');
    return cloudformationClient.listChangeSets(stackName)
      .then(data => console.log(JSON.stringify(data, null, '  ')))
    
  });
});
