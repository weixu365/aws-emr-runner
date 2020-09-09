
const child_process = require('child_process')
const Bluebird = require('bluebird');
const EmrClient = require('./emr_client')
const S3Client = require('./s3_client')
const EmrSparkStep = require('./emr_spark_step')
const {emrClusterConfig} = require('./emr_config')

// class Config {
//   constructor() {
//     this.version     = "manual"
//     this.packagePath = `scala-2.12/requirements-enrichment-pipeline-assembly-1.0.jar`
//     this.bucketName  = 'aips-cq-requirements-enrichment-pipeline-deployments-prod'
//     this.deployPackageName = `requirements-enrichment-pipeline-assembly-${this.version}.jar`

//   }
// }


class EmrRunner {
  constructor(config){
    this.config = config
    this.emrClient = new EmrClient()
    this.s3Client = new S3Client()
  }

  package() {
    this.config.deploy.package.forEach(cmd => {
      console.log(`Running command: "${cmd}"`)
      child_process.execSync(cmd, { stdio: [process.stdin, process.stdout, process.stderr] })
    })
    return Bluebird.resolve()
  }

  uploadPackage() {
    console.log(`Uploading ${this.config.deploy.packagePath} to s3://${this.config.deploy.bucketName}/${this.config.deploy.deployPackageName}`)
    return this.s3Client.uploadFile(this.config.deploy.packagePath, this.config.deploy.bucketName, this.config.deploy.deployPackageName)
  }

  loadSteps(){
    const s3PackagePath = `s3://${this.config.deploy.bucketName}/${this.config.deploy.deployPackageName}`
    return this.config.steps.map(stepConfig => {
      if(stepConfig.Type.toLowerCase() === 'spark') {
        return new EmrSparkStep({S3PackagePath: s3PackagePath, ...stepConfig}).get()
      }

      throw new Error(`Not support EMR Step type: ${stepConfig.Type}`)
    })
  }

  submitSteps(clusterId, steps){
    return this.emrClient.addSteps(clusterId, steps)
      .tap(() => console.log(`Added steps to cluster ${clusterId}, steps: \n${JSON.stringify(steps, null, '  ')}`))
  }

  waitStep(clusterId, stepId) {
    return this.emrClient.waitStep(clusterId, stepId)
  }

  startCluster(steps=[]) {
    return this.emrClient.startCluster(this.config.cluster)
      .then(cluster_id => this.emrClient.waitForCluster(cluster_id))
  }
  
  terminateCluster(cluster_id) {
    return this.emrClient.terminateCluster(cluster_id)
  }

  run() {
    const steps = this.loadSteps()
    this.config.cluster.Steps = [...(this.config.cluster.Steps), ...steps]
    this.config.cluster.Instances.KeepJobFlowAliveWhenNoSteps = false

    return Bluebird.props({
      clusterId: this.emrClient.startCluster(this.config.cluster),
      s3Package: this.package()
        .then(() => this.uploadPackage())
    })
      // .tap(({ clusterId, s3Package}) => console.log(`Submitting EMR Steps to cluster: ${clusterId}`))
      // .then(({clusterId, s3Package}) => this.submitSteps(clusterId, this.loadSteps()))
      // .tap(({clusterId, stepIds}) => console.log(`Start to wait for steps to be finished in cluster ${clusterId}: ${JSON.stringify(stepIds)}`))
      // .then(({clusterId, stepIds}) => Bluebird.all(stepIds.map(stepId => this.waitStep(clusterId, stepId))))
      .tap(({clusterId, s3Package}) => console.log(`Waiting for EMR cluster to be completed ${clusterId}: \n${JSON.stringify(steps, null, '  ')}`))
      .then(({clusterId, s3Package}) => this.emrClient.waitForCluster(clusterId))
  }

  addStep() {
    return Bluebird.props({
      clusterId: this.emrClient.getClusterByName(this.config.cluster.Name).then(c => c.id),
      s3Package: this.package()
        .then(() => this.uploadPackage())
    })
      .tap(({clusterId, s3Package}) => console.log(`Submitting EMR Steps to cluster: ${clusterId}`))
      .then(({clusterId, s3Package}) => this.submitSteps(clusterId, this.loadSteps()))
      .tap(({clusterId, stepIds}) => console.log(`Start to wait for steps to be finished in cluster ${clusterId}: ${JSON.stringify(stepIds)}`))
      .then(({clusterId, stepIds}) => Bluebird.all(stepIds.map(stepId => this.waitStep(clusterId, stepId))))
  }
}

module.exports = EmrRunner;
