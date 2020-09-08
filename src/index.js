const Config = require('./config')
const EmrRunner = require('./emr_runner')
const EmrClient = require('./emr_client')

const config = new Config('enrichment-pipeline.settings.yml', 'enrichment-pipeline.yml')

// new EmrRunner(config.load()).startCluster()
// .then(cluster_id => console.log(`Cluster ${cluster_id} started`))

new EmrRunner(config.load()).runStep()

// var emrClient = new EmrClient()

// emrClient.getClusterByName(`AIPS CQ Requirements Enrichment Pipeline`)
//   .then(cluster => emrClient.terminateCluster(cluster.id))
//   .then(cluster_id => console.log(`Cluster ${cluster_id} terminated`))

  