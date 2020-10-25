
const child_process = require('child_process')
const fs = require('fs')
const lodash = require('lodash')
const Bluebird = require('bluebird');
const EmrClient = require('./aws/emr_client')
const S3Client = require('./aws/s3_client')
const StsClient = require('./aws/sts_client')
const CloudformationClient = require('./aws/cloudformation_client')
const EmrSparkStep = require('./steps/emr_spark_step')
const logger = require("./logger");
const ScriptRunner = require("./script_runner");

/**
 * All supported life cycle events in order:
 * Command `run` and `run-step`:
 * - beforeDeployResources
 * - afterDeployResources
 * - beforeLoadResources
 * - afterLoadResources
 * - beforePackage
 * - package
 * - afterPackage
 * - beforeUploadPackage
 * - afterUploadPackage
 * 
 * - beforeRun (only available in `run` command)
 * - afterRun (only available in `run` command)
 * - afterComplete (only available in `run` command)
 * 
 * - beforeSubmit (only available in `run-step` command)
 * - afterSubmit (only available in `run-step` command)
 * - afterStepComplete (only available in `run-step` command)
 * 
 * Command `start-cluster`:
 * - beforeDeployResources
 * - afterDeployResources
 * - beforeLoadResources
 * - afterLoadResources
 * - beforeStartCluster
 * - beforeWaitForCluster
 * - afterClusterStarted
 */
class EmrRunner {
  constructor(config){
    this.config = config

    const region = this.config.get().deploy.region
    this.emrClient = new EmrClient(region)
    this.s3Client = new S3Client(region)
    this.stsClient = new StsClient(region)
    this.cloudformationClient = new CloudformationClient(region)
    this.logger = logger
    this.scriptRunner = new ScriptRunner()
  }

  trigger(eventName) {
    const eventScripts = this.config.get().scripts
    const scripts = lodash.get(eventScripts, eventName)
    if(scripts) {
      this.logger.info(`Found scripts for event '${eventName}': ${JSON.stringify(scripts)}`)
    }
    return this.scriptRunner.runScripts(scripts, this)
  }

  package() {
    return this.trigger('beforePackage')
      .then(() => this.trigger('package'))
      .then(() => this.trigger('afterPackage'))
  }

  uploadPackage() {
    const deploySettings = this.config.get().deploy
    const fileStats = fs.statSync(deploySettings.packagePath)
    const fileSizeInBytes = fileStats["size"]
    const fileSizeInMB = fileSizeInBytes / 1024 / 1024
    
    this.logger.info(`Uploading ${deploySettings.packagePath} (${fileSizeInMB.toFixed(2)}MB) to s3://${deploySettings.bucketName}/${deploySettings.deployPackageName}`)
    return this.trigger('beforeUploadPackage')
      .then(() => this.s3Client.uploadFile(deploySettings.packagePath, deploySettings.bucketName, deploySettings.deployPackageName))
      .tap(() => this.trigger('afterUploadPackage'))
  }

  loadSteps(){
    const deploySettings = this.config.get().deploy
    const s3PackagePath = `s3://${deploySettings.bucketName}/${deploySettings.deployPackageName}`
    return this.config.get().steps.map(stepConfig => {
      if(stepConfig.Type.toLowerCase() === 'spark') {
        return new EmrSparkStep({S3PackagePath: s3PackagePath, ...stepConfig}).get()
      }

      throw new Error(`Not supported EMR Step type: ${stepConfig.Type}`)
    })
  }

  submitSteps(clusterId, steps){
    return this.trigger('beforeRunStep')
      .then(() => this.emrClient.addSteps(clusterId, steps))
      .tap(() => this.logger.info(`Added steps to cluster ${clusterId}, steps: \n${JSON.stringify(steps, null, '  ')}`))
      .tap(() => this.trigger('afterRunStep'))
  }

  waitStep(clusterId, stepId) {
    return this.emrClient.waitStep(clusterId, stepId)
  }

  startCluster(steps=[]) {
    return this.loadAwsSettings()
      .tap(() => this.trigger('beforeStartCluster'))
      .then(() => this.emrClient.startCluster(this.config.get().cluster))
      .tap(() => this.trigger('beforeWaitForClusterStarted'))
      .then(cluster_id => this.emrClient.waitForClusterStarted(cluster_id))
      .tap(() => this.trigger('afterClusterStarted'))
  }
  
  terminateCluster(cluster_id) {
    return this.trigger('beforeTerminateCluster')
      .then(() => this.emrClient.terminateCluster(cluster_id))
      .tap(() => this.trigger('beforeWaitForClusterTerminated'))
      .then(cluster_id => this.emrClient.waitForCluster(cluster_id))
      .tap(() => this.trigger('afterClusterTerminated'))
      .then(() => cluster_id)
  }

  getClusterByName() {
    return this.emrClient.getClusterByName(this.config.get().cluster.Name).then(c => c.id)
  }

  deleteResources() {
    const stackName = this.config.getResourceStackName()
    return this.cloudformationClient.deleteStack(stackName)
      .then(()=> this.logger.info("Resources stack deleted"))
  }

  deployResources() {
    const fileConfig = this.config.get()
    const resources = fileConfig.resources
    const stackName = this.config.getResourceStackName()
    const tags = this.config.loadStackTags(fileConfig.stackTags)
    const params = lodash.get(fileConfig, 'deploy.resourceStack.params')
    return this.trigger('beforeDeployResources')
      .then(() => this.cloudformationClient.deploy(stackName, resources, params, tags))
      .tap(() => this.trigger('afterDeployResources'))
  }

  loadResources() {
    return this.trigger('beforeLoadResources')
      .then(() => this.cloudformationClient.getStackResources(this.config.getResourceStackName()))
      .reduce((obj, resource) => {
        obj[resource['LogicalResourceId']] = resource
        return obj
      }, {})
      .tap(() => this.trigger('afterLoadResources'))
  }

  loadAwsSettings() {
    return Bluebird.props({
      resources: this.deployResources().then(() => this.loadResources()),
      accountId: this.stsClient.getAccount(),
    })
      .then(({accountId, resources}) => this.config.reloadWithResources(accountId, resources))
  }

  run() {
    return this.loadAwsSettings()
      .then(() => this.config.addSteps(this.loadSteps()))
      .tap(() => this.trigger('beforeRun'))
      .then(() => Bluebird.props({
        clusterId: this.emrClient.startCluster(this.config.get().cluster),
        s3Package: this.package()
          .then(() => this.uploadPackage())
      }))
      .tap(({clusterId, s3Package}) => this.logger.info(`Waiting for EMR cluster to be completed ${clusterId}: \n${JSON.stringify(this.config.get().cluster.Steps, null, '  ')}`))
      .tap(() => this.trigger('afterRun'))
      .then(({clusterId, s3Package}) => this.emrClient.waitForCluster(clusterId))
      .then(succeeded => succeeded ? Bluebird.resolve("Done") : Bluebird.reject(new Error("Failed to run EMR cluster")) )
      .tap(() => this.trigger('afterComplete'))
  }

  addStep(clusterId) {
    return this.loadAwsSettings()
      .then(() => Bluebird.props({
        clusterId: clusterId || this.getClusterByName(),
        s3Package: this.package()
          .then(() => this.uploadPackage())
      }))
      .tap(({clusterId, s3Package}) => this.logger.info(`Submitting EMR Steps to cluster ${clusterId}`))
      .then(({clusterId, s3Package}) => this.submitSteps(clusterId, this.loadSteps()))
      .tap(({clusterId, stepIds}) => this.logger.info(`Waiting for steps to be finished in cluster ${clusterId}: ${JSON.stringify(stepIds)}`))
      .then(({clusterId, stepIds}) => Bluebird.all(stepIds.map(stepId => this.waitStep(clusterId, stepId))))
      .then(results => results.filter(r => !r).length == 0 ? Bluebird.resolve("Done") : Bluebird.reject(new Error("Failed to run steps on EMR cluster")) )
      .tap(() => this.trigger('afterStepComplete'))
  }
}

module.exports = EmrRunner;
