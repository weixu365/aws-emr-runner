const dedent = require('dedent')

const emrCleanerCode = dedent(`
  const { 
    EMRClient: Emr,
    TerminateJobFlowsCommand,
    DescribeClusterCommand,
    ListStepsCommand,
    ListClustersCommand,
  } = require("@aws-sdk/client-emr");

  const region = process.env.AWS_REGION
  const clusterName = process.env.CLUSTER_NAME

  class EMRAutoCleaner{
    constructor(){
      this.emr = new Emr({region})
    }

    listFinishedSteps(cluster_id) {
      const params = {
        ClusterId: cluster_id,
        StepStates: ['COMPLETED', 'CANCELLED', 'FAILED', 'INTERRUPTED']
      };
      
      return this.emr.send(new ListStepsCommand(params))
        .then(r => r.Steps)
        .catch(e => Promise.reject(new Error(\`Failed to list steps in EMR cluster \${cluster_id}, caused by \${e}\`)));
    }
    
    async getIdleStartedTime(clusterInfo) {
      console.log(\`Trying to find the idle start time for cluster: \${clusterInfo.Cluster.Id}\`)
      const clusterReadyTime = clusterInfo.Cluster.Status.Timeline.ReadyDateTime
      const steps = await this.listFinishedSteps(clusterInfo.Cluster.Id)
      if(steps.length == 0) {
        console.log(\`Could not find any finished step, using cluster ready time as idle start time: \${clusterReadyTime}\`)
        return clusterReadyTime
      } else {
        const lastStepEndTime = steps[0].Status.Timeline.EndDateTime
        console.log(\`Using end time of the last finished step as idle start time: \${lastStepEndTime}\`)
        return lastStepEndTime
      }
    }
    
    terminateCluster(cluster_id) {
      var params = {
        JobFlowIds: [ cluster_id]
      };
      return this.emr.send(new TerminateJobFlowsCommand(params))
        .then(() => cluster_id)
        .catch(e => Promise.reject(new Error(\`Failed to terminate EMR cluster \${cluster_id}, caused by \${e}\`)));
    }

    async terminateIdleCluster(name) {
      var params = {
        ClusterStates: ['WAITING']
      };
      console.log(\`Looking up idle EMR clusters with name "\${name}"\`)
      const response = await this.emr.send(new ListClustersCommand(params))
      const clusters = response.Clusters
      for(const cluster of clusters) {
        if(!cluster.Name.startsWith(name)) {
          continue
        }
    
        const clusterInfo = await this.emr.send(new DescribeClusterCommand({ ClusterId: cluster.Id }))
        const maxIdleTag = (clusterInfo.Cluster.Tags || []).find(t => t.Key === 'maxIdleMinutes')
        if(!maxIdleTag) {
          console.log(\`Skipped EMR Cluster \${cluster.Id} due to no maxIdleMinutes tag\`)
          continue
        }
        
        console.log(clusterInfo.Cluster.Status.Timeline.CreationDateTime)
        console.log(clusterInfo.Cluster.Status.Timeline.ReadyDateTime)
        const idleStarted = await this.getIdleStartedTime(clusterInfo)
        const maxIdleMinutes = parseInt(maxIdleTag.Value)
        const now = new Date()
    
        const idledMinutes = (now - idleStarted)/(1000 * 60)
    
        if(idledMinutes > maxIdleMinutes) {
          console.log(\`Cluster \${cluster.Id} has idled for \${idledMinutes} minutes, greater than \${maxIdleMinutes} minutes, terminating\`)
          await this.terminateCluster(cluster.Id)
        } else {
          console.log(\`Cluster \${cluster.Id} has idled for \${idledMinutes} minutes, less than \${maxIdleMinutes} minutes, skipped\`)
        }
      }
    }
  }

  exports.handler = (event, context) =>{
    return new EMRAutoCleaner().terminateIdleCluster(clusterName)
      .then(() => console.log("Done"))
      .catch(e => console.error(e))
  }
`)

class LambdaTemplate{
  getTemplate(clusterName, code) {
    const clusterSafeName=clusterName.replace(' ', '-')

    return {
      EMRClusterMonitoringLambda: {
        Type: "AWS::Lambda::Function",
        Properties: {
          Code: {
            ZipFile: emrCleanerCode,
          },
          Description: 'Monitoring idle EMR clusters and terminate after exceeded max idle time',
          Environment: {
            Variables: {
              CLUSTER_NAME: clusterName,
            }
          },
          Handler: 'index.handler',
          MemorySize: 512,
          ReservedConcurrentExecutions: 1,
          Role: {
            "Fn::GetAtt": [
              "ClusterMonitoringLambdaIAMRole",
              "Arn"
            ]
          },
          Runtime: 'nodejs18.x',
          Timeout: 300,
        }
      },
      ClusterMonitoringLambdaIAMRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Principal: {
                        Service: [
                            "lambda.amazonaws.com"
                        ]
                    },
                    Action: [
                        "sts:AssumeRole"
                    ]
                }
            ]
          },
          ManagedPolicyArns:[
            'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
          ],
          Policies: [
              {
                  PolicyName: "emr-actions",
                  PolicyDocument: {
                      Version: "2012-10-17",
                      Statement: [
                          {
                              Effect: "Allow",
                              Action: [
                                  "elasticmapreduce:*"
                              ],
                              Resource: [
                                  "*"
                              ]
                          },
                          {
                            Effect: "Allow",
                            Action: [
                                "logs:CreateLogStream",
                                "logs:CreateLogGroup"
                            ],
                            Resource: [
                              'arn:aws:logs:::log-group:/aws/lambda/*:*'
                            ]
                          },
                      ]
                  }
              }
          ],
          Path: "/"
        }
      },
      ClusterMonitoringLambdaLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
            LogGroupName: {"Fn::Join": ['/', ['/aws/lambda', {'Ref': 'EMRClusterMonitoringLambda'} ]]},
            RetentionInDays: 30
        }
      },
      EMRClusterMonitoringScheduledRule: {
        Type: "AWS::Events::Rule",
        Properties: {
          Description: "Invoke EMR Monitoring Lambda every 10 minutes to terminate idle clusters",
          ScheduleExpression: "rate(10 minutes)",
          State: "ENABLED",
          Targets: [{
            Arn: { "Fn::GetAtt": ["EMRClusterMonitoringLambda", "Arn"] },
            Id: "EMRClusterMonitoringLambdaFunction"
          }]
        }
      },
      PermissionForEventsToInvokeLambda: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: { Ref: "EMRClusterMonitoringLambda" },
          Action: "lambda:InvokeFunction",
          Principal: "events.amazonaws.com",
          SourceArn: { "Fn::GetAtt": ["EMRClusterMonitoringScheduledRule", "Arn"] }
        }
      }
    }
  }
}

module.exports = LambdaTemplate;
