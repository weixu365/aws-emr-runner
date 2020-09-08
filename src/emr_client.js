const Bluebird = require('bluebird');
const promiseRetry = require('promise-retry');
 
const AWS = require("./aws");
const Logger = require("./logger");
const EmrHadoopDebuggingStep = require('./emr_hadoop_debugging_step');

class EmrClient {
  constructor() {
    this.emr = new AWS.EMR()
    this.logger = new Logger()
  }

  startCluster(clusterConfig) {
    this.logger.info(`Starting cluster using config: ${JSON.stringify(clusterConfig, null, '  ')}`)
    return this.emr.runJobFlow(clusterConfig).promise()
      .then(r => r.JobFlowId)
  }

  terminateCluster(cluster_id) {
    var params = {
      JobFlowIds: [ cluster_id]
    };
    return this.emr.terminateJobFlows(params).promise()
      .then(() => cluster_id)
      .catch(e => Promise.reject(new Error(`Failed to terminate EMR cluster ${cluster_id}, caused by ${e}`)));
  }

  waitForClusterRunning(cluster_id) {
    var params = {
      ClusterId: cluster_id
    };

    return promiseRetry(function (retry, number) {
        this.logger.info(`Checking cluster ${cluster_id} status(${number}) ...`);
        
        return this.emr.describeCluster(params).promise()
          .then(r => {
            if (["TERMINATING", "TERMINATED", "TERMINATED_WITH_ERRORS"].indexOf(r.Cluster.Status.State) >=0 ) {
              this.logger.info(`  Cluster ${cluster_id} terminated (${number}): \n  ${JSON.stringify(r.Cluster.Status, null, '  ')}`)
              return cluster_id
            }

            if (["WAITING"].indexOf(r.Cluster.Status.State) >=0 ){
              this.logger.info(`  Cluster ${cluster_id} started`)
              return cluster_id
            }

            return retry()
          })
          .catch(e => {
            if(!this.isRetryError(e)) {
              this.logger.info(`  Failed to check cluster ${cluster_id} status(${number}): ${e}`)
            }
            return retry()
          });
      }, {retries: 1000, minTimeout: 5000, factor: 1})
      .then(() => cluster_id)
  }

  getClusterByName(name) {
    var params = {
      ClusterStates: ['RUNNING', 'WAITING', 'TERMINATED']
    };
    this.logger.info(`Looking up EMR cluster with name ${name}`)
    return this.emr.listClusters(params).promise()
      .then(r => r.Clusters)
      .map(c => ({id: c.Id, name: c.Name, status: c.Status.State, normalizedInstanceHours: c.NormalizedInstanceHours}))
      .filter(c => c.name.startsWith(name))
      .catch(e => Promise.reject(new Error(`Failed to get EMR cluster by name: ${name}, caused by ${e}`)))
      .then(clusters => {
        if (clusters.length > 0) {
          return clusters[0];
        }
        throw Error(`Cluster not found started with name: '${name}'`)
      })
  }

  addSteps(cluster_id, steps) {
    var params = {
      JobFlowId: cluster_id,
      Steps: steps.map(s => s.get())
    };
    return this.emr.addJobFlowSteps(params).promise()
      // .tap(params => this.logger.info(JSON.stringify(params)))
      .then(r => ({clusterId: cluster_id, stepIds: r.StepIds}))
      .catch(e => Promise.reject(new Error(`Failed to add steps to EMR cluster ${cluster_id}, caused by ${e}`)));
  }

  waitStep(cluster_id, step_id) {
    var params = {
      ClusterId: cluster_id,
      StepId: step_id
    };

    return promiseRetry((retry, number) => {
      return this.emr.describeStep(params).promise()
        .then(r => {
          if (["CANCELLED", "FAILED", "INTERRUPTED"].indexOf(r.Step.Status.State) >=0 ) {
            this.logger.info(`  step  ${step_id} failed (${number}): \n${JSON.stringify(r.Step.Status, null, '  ')}`)
            return r
          }

          if (["COMPLETED"].indexOf(r.Step.Status.State) >=0 ){
            this.logger.info(`  Step ${step_id} completed(${number})`)
            return r
          }

          if(number % 10 == 0) {
            this.logger.info(`Step ${step_id} status(${number}) is ${r.Step.Status.State}, retrying`)
          }

          return retry()
        })
        .catch(e => {
          if(!this.isRetryError(e)) {
            this.logger.info(`  Failed to check step ${step_id} status(${number}): ${e}`)
          }
          return retry()
        })
    }, {retries: 1000, minTimeout: 5000, factor: 1})
  }

  isRetryError(err) {
    return err && err.code === 'EPROMISERETRY' && Object.prototype.hasOwnProperty.call(err, 'retried');
  }
}

module.exports = EmrClient;


// function show_step_errors() {
//   emr_cluster_id=$1

//   step_status=$(aws emr list-steps --cluster-id $emr_cluster_id | jq -r 'first( .Steps[] | select( .Status.State | contains("FAILED" ))) | .Status')

//   log_file=$(echo $step_status | jq -r '.FailureDetails.LogFile')
//   echo Showing log file from ${log_file}stderr.gz
//   aws s3 cp ${log_file}stderr.gz - | gunzip
// }

// function show_step_stdout() {
//   emr_cluster_id=$1

//   step_id=$(aws emr list-steps --cluster-id ${emr_cluster_id} | jq -r 'first( .Steps[]) | .Id')

//   log_file="s3://aws-logs-${aws_account_id}-ap-southeast-2/elasticmapreduce/${emr_cluster_id}/steps/${step_id}/stdout.gz"
//   echo Showing log file from ${log_file}
//   aws s3 cp ${log_file} - | gunzip
// }
