const { expect } = require('chai');
const Config = require('../src/config');
 
describe('Test load yaml file', () => {
  it("Load config", () => {
    const previousBuildNumber = process.env['BUILD_NUMBER']
    process.env['BUILD_NUMBER']='test'
    const config = new Config('samples/enrichment-pipeline.yml', ['samples/enrichment-pipeline.settings.yml'])
    expect(config.get().name).eq('Sample Spark Application')
    expect(config.get().stackTags.Version).eq(`test`)
    expect(config.get().cluster.JobFlowRole).eq(``)

    config.reloadWithResources('aws-account-id-test', {
      EMRInstanceProfile: {PhysicalResourceId: 'instance-profile'},
      DeploymentsBucket: {PhysicalResourceId: 'deploy-bucket'},
      EMRSecurityConfiguration: {PhysicalResourceId: 'security-config'},
    })
    expect(config.get().cluster.JobFlowRole).eq('instance-profile')

    process.env['BUILD_NUMBER']=previousBuildNumber
  });
});
