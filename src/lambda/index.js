const AWS = require("aws-sdk");

const region = process.env.AWS_REGION
const clusterName = process.env.CLUSTER_NAME

class EMRAutoCleaner{
  constructor(){
    this.emr = new AWS.EMR({region})
  }

  listFinishedSteps(clusterId) {
    const params = {
      ClusterId: clusterId,
      StepStates: ['COMPLETED', 'CANCELLED', 'FAILED', 'INTERRUPTED']
    };
    
    return this.emr.listSteps(params).promise()
      .then(r => r.Steps)
      .catch(e => Promise.reject(new Error(`Failed to list steps in EMR cluster ${cluster_id}, caused by ${e}`)));
  }
  
  async getIdleStartedTime(clusterInfo) {
    console.log(`Trying to find the idle start time for cluster: ${clusterInfo.Cluster.Id}`)
    const clusterReadyTime = clusterInfo.Cluster.Status.Timeline.ReadyDateTime
    const steps = await this.listFinishedSteps(clusterInfo.Cluster.Id)
    if(steps.length == 0) {
      console.log(`Could not find any finished step, using cluster ready time as idle start time: ${clusterReadyTime}`)
      return clusterReadyTime
    } else {
      const lastStepEndTime = steps[0].Status.Timeline.EndDateTime
      console.log(`Using end time of the last finished step as idle start time: ${lastStepEndTime}`)
      return lastStepEndTime
    }
  }
  
  terminateCluster(cluster_id) {
    var params = {
      JobFlowIds: [ cluster_id]
    };
    return this.emr.terminateJobFlows(params).promise()
      .then(() => cluster_id)
      .catch(e => Promise.reject(new Error(`Failed to terminate EMR cluster ${cluster_id}, caused by ${e}`)));
  }

  async getClusterByName(name) {
    var params = {
      ClusterStates: ['WAITING']
    };
    console.log(`Looking up idle EMR clusters with name "${name}"`)
    const response = await this.emr.listClusters(params).promise()
    const clusters = response.Clusters
    for(const cluster of clusters) {
      if(!cluster.Name.startsWith(name)) {
        continue
      }
  
      const clusterInfo = await this.emr.describeCluster({ ClusterId: cluster.Id }).promise()
      const maxIdleTag = (clusterInfo.Cluster.Tags || []).find(t => t.Key === 'maxIdleMinutes')
      if(!maxIdleTag) {
        console.log(`Skipped EMR Cluster ${cluster.Id} due to no maxIdleMinutes tag`)
        continue
      }
      
      console.log(clusterInfo.Cluster.Status.Timeline.CreationDateTime)
      console.log(clusterInfo.Cluster.Status.Timeline.ReadyDateTime)
      const idleStarted = await this.getIdleStartedTime(clusterInfo)
      const maxIdleMinutes = parseInt(maxIdleTag.Value)
      const now = new Date()
  
      const idledMinutes = (now - idleStarted)/(1000 * 60)
  
      if(idledMinutes > maxIdleMinutes) {
        console.log(`Cluster ${cluster.Id} has idled for ${idledMinutes} minutes, greater than ${maxIdleMinutes} minutes, terminating`)
        await this.terminateCluster(cluster.Id)
      } else {
        console.log(`Cluster ${cluster.Id} has idled for ${idledMinutes} minutes, less than ${maxIdleMinutes} minutes, skipped`)
      }
    }
  }
}

// new EMRAutoCleaner().getClusterByName('')
//   .then(() => console.log("Done"))
//   .catch(e => console.error(e))

exports.handler = (event, context) =>{
  return new EMRAutoCleaner().getClusterByName(clusterName)
    .then(() => console.log("Done"))
    .catch(e => console.error(e))
}
