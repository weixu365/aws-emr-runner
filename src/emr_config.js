
const emrClusterConfig = () => {
  var core_instance_count = 3
  var master_instance_count = 1
  var version = 'manual'
  var aws_account_id = '971356129762'
  var is_production = 'true'
  var name = `AIPS CQ Requirements Enrichment Pipeline@${version}`
  var auto_terminate = false
  
  var clusterConfig = {
    EbsRootVolumeSize: '10',
    ScaleDownBehavior: 'TERMINATE_AT_TASK_COMPLETION',
    Applications: [
      {Name: 'Hadoop'},
      {Name: 'Hive'},
      {Name: 'Hue'},
      {Name: 'Ganglia'},
      {Name: 'Spark'},
      {Name: 'Zeppelin'},
    ],
    AutoScalingRole: 'EMR_AutoScaling_DefaultRole',
    Configurations: [
      {
        Classification: "spark-hive-site",
        Properties: {
          "hive.metastore.client.factory.class": "com.amazonaws.glue.catalog.metastore.AWSGlueDataCatalogHiveClientFactory"
        },
      },
      {
        Classification: "spark-log4j",
        Properties: {
          "log4j.org.apache.spark": "TRACE"
        }
      },
      {
        Classification: "spark",
        Properties: {
          "maximizeResourceAllocation": "true"
        }
      },
    ],
    Instances: {
      Ec2KeyName: 'cda-2019',
      Ec2SubnetId: 'subnet-01d75376015f01864',
      KeepJobFlowAliveWhenNoSteps: true,
      InstanceGroups: [
        {
          InstanceCount: core_instance_count,
          InstanceRole: 'CORE',
          InstanceType: "m5.xlarge",
          EbsConfiguration: {
            EbsBlockDeviceConfigs: [
              {
                VolumeSpecification: {
                  SizeInGB: 96,
                  VolumeType: "gp2"
                },
                VolumesPerInstance: 1
              }
            ]
          },
          Name: "Core - 2"
        },
        {
          InstanceCount: master_instance_count,
          InstanceRole: "MASTER",
          InstanceType: "m5.xlarge",
          EbsConfiguration: {
            EbsBlockDeviceConfigs: [
              {
                VolumeSpecification: {
                  SizeInGB: 32,
                  VolumeType: "gp2"
                },
                VolumesPerInstance: 1
              }
            ]
          },
          Name: "Master - 1"
        }
      ]
    },
    JobFlowRole: 'CQRequirementsEnrichmentPipelineEmrEc2Role',
    LogUri: `s3n://aws-logs-${aws_account_id}-ap-southeast-2/elasticmapreduce/`,
    Name: name,
    ReleaseLabel: 'emr-6.0.0',
    SecurityConfiguration: 'requirements-enrichment-pipeline-emr-securityconfiguration',
    ServiceRole: 'EMR_DefaultRole',
    Steps: [
      new EmrHadoopDebuggingStep().get(),
    ],
    Tags: [
      {Key: 'seek:source:url', Value: "https://github.com/SEEK-Jobs/aips-cq-requirements-enrichment-pipeline"}, 
      {Key: 'seek:env:production', Value: is_production}, 
      {Key: 'seek:user:service:type', Value: "integration automation"}, 
      {Key: 'seek:data:consumers', Value: "internal"}, 
      {Key: 'seek:data:types:internal', Value: "anonymous derived"}, 
      {Key: 'seek:data:types:restricted', Value: "job-ads ontology"}, 
      {Key: 'Name', Value: name}, 
    ]
  };
  
  return clusterConfig;
}

module.exports = {
  emrClusterConfig,
}