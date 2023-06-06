const Bluebird = require('bluebird');
const { 
  EMRClient: Emr,
  RunJobFlowCommand,
  TerminateJobFlowsCommand,
  DescribeClusterCommand,
  ListStepsCommand,
  ListClustersCommand,
  AddJobFlowStepsCommand,
  DescribeStepCommand
} = require("@aws-sdk/client-emr");
const promiseRetry = require('promise-retry');

const logger = require("../logger");
const EmrHadoopDebuggingStep = require('../steps/emr_hadoop_debugging_step');

class EmrClient {
  constructor(region) {
    this.emr = new Emr({region})
    this.logger = logger
  }

  startCluster(clusterConfig) {
    this.logger.debug(`Starting cluster in region ${this.emr.region} using config: ${JSON.stringify(clusterConfig, null, '  ')}`)
    return Bluebird.resolve(this.emr.send(new RunJobFlowCommand(clusterConfig)))
      .then(r => r.JobFlowId)
  }

  terminateCluster(cluster_id) {
    var params = {
      JobFlowIds: [ cluster_id]
    };
    return Bluebird.resolve(this.emr.send(new TerminateJobFlowsCommand(params)))
      .then(() => cluster_id)
      .catch(e => Promise.reject(new Error(`Failed to terminate EMR cluster ${cluster_id}, caused by ${e}`)));
  }

  waitForClusterStarted(cluster_id) {
    return this.waitForCluster(cluster_id, ['WAITING'])
      .then(() => this.getClusterStatus(cluster_id))
      .then(status => {
        if(status.State == 'WAITING') {
          this.logger.info(`Cluster ${cluster_id} started`)
        }else {
          return Bluebird.reject(new Error("Failed to start cluster"))
        }
      })
      .then(() => cluster_id)
  }

  getClusterStatus(cluster_id) {
    var params = {
      ClusterId: cluster_id
    };

    return Bluebird.resolve(this.emr.send(new DescribeClusterCommand(params)))
      .then(r => r.Cluster.Status)
  }

  waitForCluster(cluster_id, waitingState=[]) {
    return promiseRetry((retry, number) => {
        return this.getClusterStatus(cluster_id)
          .then(status => {
            const state = status.State
            this.logger.info(`Checking cluster ${cluster_id} status(${number}): ${state}`);

            if (["TERMINATED"].indexOf(state) >=0 ) {
              this.logger.info(`Cluster ${cluster_id} terminated (${number}): \n  ${JSON.stringify(status, null, '  ')}`)
              return this.isStepsCompleted(cluster_id)
            }

            if (["TERMINATED_WITH_ERRORS"].indexOf(state) >=0 ) {
              this.logger.info(`Cluster ${cluster_id} terminated with errors(${number}): \n  ${JSON.stringify(status, null, '  ')}`)
              return false
            }

            if (waitingState.indexOf(state) >=0 ){
              return true
            }

            return retry()
          })
          .catch(e => {
            if(!this.isRetryError(e)) {
              this.logger.info(`Failed to check cluster ${cluster_id} status(${number}): ${e}`)
            }
            return retry()
          });
      }, {forever: true, minTimeout: 10 * 1000, factor: 1})
  }

  isStepsCompleted(cluster_id) {
    return this.getClusterSteps(cluster_id)
      .then(result => {
        const failedSteps = (result.Steps || []).filter(step => {
          const state = step.Status.State
          this.logger.info(`Checking step status in cluster ${cluster_id}, step: ${step.Name}: ${state}`);
    
          if (["CANCELLED", "FAILED", "INTERRUPTED"].indexOf(state) >=0 ) {
            this.logger.info(`Step failed in cluster ${cluster_id}:\n ${JSON.stringify(step.Status, null, '  ')}`)
            return true
          }
  
          return false
        })

        return failedSteps.length === 0
      })
  }

  getClusterSteps(cluster_id) {
    this.logger.info(`Getting steps of EMR cluster: ${cluster_id}`)

    var params = {
      ClusterId: cluster_id,
    }

    return Bluebird.resolve(this.emr.send(new ListStepsCommand(params)))
  }

  getClusterByName(name) {
    var params = {
      ClusterStates: ['STARTING', 'RUNNING', 'WAITING']
    };
    this.logger.info(`Looking up EMR cluster with name "${name}"`)
    return Bluebird.resolve(this.emr.send(new ListClustersCommand(params)))
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
      Steps: steps
    };
    return Bluebird.resolve(this.emr.send(new AddJobFlowStepsCommand(params)))
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
      return Bluebird.resolve(this.emr.send(new DescribeStepCommand(params)))
        .then(r => {
          if (["CANCELLED", "FAILED", "INTERRUPTED"].indexOf(r.Step.Status.State) >=0 ) {
            this.logger.info(`step  ${step_id} failed (${number}): \n${JSON.stringify(r.Step.Status, null, '  ')}`)
            return false
          }

          if (["COMPLETED"].indexOf(r.Step.Status.State) >=0 ){
            this.logger.info(`Step ${step_id} completed(${number})`)
            return true
          }

          if(number % 10 == 0) {
            this.logger.info(`Step ${step_id} status(${number}) is ${r.Step.Status.State}`)
          }

          return retry()
        })
        .catch(e => {
          if(!this.isRetryError(e)) {
            this.logger.info(`Failed to check step ${step_id} status(${number}): ${e}`)
          }
          return retry()
        })
    }, {forever: true, minTimeout: 5000, factor: 1})
  }

  isRetryError(err) {
    return err && err.code === 'EPROMISERETRY' && Object.prototype.hasOwnProperty.call(err, 'retried');
  }
}

module.exports = EmrClient;
