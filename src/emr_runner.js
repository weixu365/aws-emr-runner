
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
    console.log("Packaging")
    this.config.deploy.package.forEach(cmd => {
      console.log(`Running ${cmd}`)
      child_process.execSync(cmd, { stdio: [process.stdin, process.stdout, process.stderr] })
    })
  }

  uploadPackage() {
    return this.s3Client.uploadFile(this.config.deploy.packagePath, this.config.deploy.bucketName, this.config.deploy.deployPackageName)
  }

  loadSteps(){
    return [new EmrSparkStep("Enrich profiles", "seek.aips.enrichment.Main", this.config.deploy.bucketName, this.config.deploy.deployPackageName, '-Dreporting.type=incremental')]
  }

  submitSteps(steps, wait=true){
    return this.emrClient.getClusterByName(this.config.cluster.Name)
      .then(cluster => this.emrClient.addSteps(cluster.id, steps))
  }

  waitStep(clusterId, stepId) {
    return this.emrClient.waitStep(clusterId, stepId)
  }

  startCluster() {
    return this.emrClient.startCluster(this.config.cluster)
      .then(cluster_id => this.emrClient.waitForClusterRunning(cluster_id))
  }
  
  terminateCluster(cluster_id) {
    return this.emrClient.terminateCluster(cluster_id)
  }

  runStep() {
    return Bluebird.resolve()
      // .then(() => this.package())
      // .tap(() => console.log("Packaged successfully"))
      // .then(() => this.uploadPackage())
      // .tap(() => console.log("Uploaded package to S3 bucket"))
      .then(() => this.submitSteps(this.loadSteps()))
      .tap(({clusterId, stepIds}) => console.log(`Submitted step to EMR cluster ${clusterId}, start to wait for steps to be finished: ${JSON.stringify(stepIds)}`))
      .then(({clusterId, stepIds}) => Bluebird.all(stepIds.map(stepId => this.waitStep(clusterId, stepId))))
  }
}

module.exports = EmrRunner;
