
const child_process = require('child_process')
const fs = require('fs')
const lodash = require('lodash')
const Bluebird = require('bluebird');
const EmrClient = require('./emr_client')
const S3Client = require('./s3_client')
const CloudformationClient = require('./cloudformation_client')
const EmrSparkStep = require('./emr_spark_step')
const logger = require("./logger");
const {emrClusterConfig} = require('./emr_config')

class EmrRunner {
  constructor(config){
    this.config = config

    const region = this.config.get().deploy.region
    this.emrClient = new EmrClient(region)
    this.s3Client = new S3Client(region)
    this.cloudformationClient = new CloudformationClient(region)
    this.logger = logger
  }

  package() {
    this.config.get().deploy.package.forEach(cmd => {
      this.logger.info(`Running command: "${cmd}"`)
      child_process.execSync(cmd, { stdio: [process.stdin, process.stdout, process.stderr] })
    })
    return Bluebird.resolve()
  }

  uploadPackage() {
    const deploySettings = this.config.get().deploy
    const fileStats = fs.statSync(deploySettings.packagePath)
    const fileSizeInBytes = fileStats["size"]
    const fileSizeInMB = fileSizeInBytes / 1024 / 1024
    
    this.logger.info(`Uploading ${deploySettings.packagePath} (${fileSizeInMB.toFixed(2)}MB) to s3://${deploySettings.bucketName}/${deploySettings.deployPackageName}`)
    return this.s3Client.uploadFile(deploySettings.packagePath, deploySettings.bucketName, deploySettings.deployPackageName)
  }

  loadSteps(){
    const deploySettings = this.config.get().deploy
    const s3PackagePath = `s3://${deploySettings.bucketName}/${deploySettings.deployPackageName}`
    return this.config.get().steps.map(stepConfig => {
      if(stepConfig.Type.toLowerCase() === 'spark') {
        return new EmrSparkStep({S3PackagePath: s3PackagePath, ...stepConfig}).get()
      }

      throw new Error(`Not support EMR Step type: ${stepConfig.Type}`)
    })
  }

  submitSteps(clusterId, steps){
    return this.emrClient.addSteps(clusterId, steps)
      .tap(() => this.logger.info(`Added steps to cluster ${clusterId}, steps: \n${JSON.stringify(steps, null, '  ')}`))
  }

  waitStep(clusterId, stepId) {
    return this.emrClient.waitStep(clusterId, stepId)
  }

  startCluster(steps=[]) {
    return loadResources()
    .then(resources => this.config.reloadWithResources(resources))
    .then(() => this.emrClient.startCluster(this.config.get().cluster))
    .then(cluster_id => this.emrClient.waitForClusterStarted(cluster_id))
  }
  
  terminateCluster(cluster_id) {
    return this.emrClient.terminateCluster(cluster_id)
      .then(cluster_id => this.emrClient.waitForCluster(cluster_id))
  }

  getClusterByName() {
    return this.emrClient.getClusterByName(this.config.get().cluster.Name).then(c => c.id)
  }

  deployResources() {
    const fileConfig = this.config.load().get()
    const resources = fileConfig.resources
    const stackName = this.config.getResourceStackName()
    const tags = this.config.loadStackTags(fileConfig.stackTags)
    const params = lodash.get(fileConfig, 'deploy.resourceStack.params')
    return this.cloudformationClient.deploy(stackName, resources, params, tags)
  }

  loadResources() {
    return this.cloudformationClient.getStackResources(this.config.getResourceStackName())
      .reduce((obj, resource) => {
        obj[resource['LogicalResourceId']] = resource
        return obj
      }, {})
  }

  run() {
    return this.loadResources()
      .then(resources => this.config.reloadWithResources(resources))
      .then(() => this.config.addSteps(this.loadSteps()))
      .then(() => Bluebird.props({
        clusterId: this.emrClient.startCluster(this.config.get().cluster),
        s3Package: this.package()
          .then(() => this.uploadPackage())
      }))
      .tap(({clusterId, s3Package}) => this.logger.info(`Waiting for EMR cluster to be completed ${clusterId}: \n${JSON.stringify(this.config.get().cluster.Steps, null, '  ')}`))
      .then(({clusterId, s3Package}) => this.emrClient.waitForCluster(clusterId))
  }

  addStep(clusterId) {
    return loadResources()
      .then(resources => this.config.reloadWithResources(resources))
      .then(() => Bluebird.props({
        clusterId: clusterId || this.getClusterByName(),
        s3Package: this.package()
          .then(() => this.uploadPackage())
      }))
      .tap(({clusterId, s3Package}) => this.logger.info(`Submitting EMR Steps to cluster ${clusterId}: \n${JSON.stringify(this.config.get().cluster.Steps, null, '  ')}`))
      .then(({clusterId, s3Package}) => this.submitSteps(clusterId, this.loadSteps()))
      .tap(({clusterId, stepIds}) => this.logger.info(`Waiting for steps to be finished in cluster ${clusterId}: ${JSON.stringify(stepIds)}`))
      .then(({clusterId, stepIds}) => Bluebird.all(stepIds.map(stepId => this.waitStep(clusterId, stepId))))
  }
}

module.exports = EmrRunner;
