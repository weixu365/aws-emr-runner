Run Spark application in aws emr

### Download
You can download by script:
```
Macos:
curl -sSL https://github.com/weixu365/aws-emr-runner/releases/latest/download/aws-emr-runner-macos.bz2 | bunzip2 > aws-emr-runner | chmod +x aws-emr-runner

Linux:
curl -sSL https://github.com/weixu365/aws-emr-runner/releases/latest/download/aws-emr-runner-linux.bz2 | bunzip2 > aws-emr-runner | chmod +x aws-emr-runner
```

### Validate config files
./aws-emr-runner validate -f samples/enrichment-pipeline.yml -s samples/enrichment-pipeline.settings.yml

### Run EMR Clustr and spark application
./aws-emr-runner run -f samples/enrichment-pipeline.yml -s samples/enrichment-pipeline.settings.yml


### What does create
- Resource stack
  - S3 Bucket for package to run in emr
  - IAM Role and instance profile for emr instance
  - Any other resource you want to put in the resource stack

### What would happen if you run a spark application
- Load configs
- Create or update resources stack
- Get resources from resources stack for referenced variables in config file
- Generate EMR steps from config file
- Create EMR cluster with steps and wait until all completed

### What variables does it support
- Environment variable, e.g. {{env.BUILD_NUMBER}}
- Values in a settings file, reference throw `Values` prefix, e.g. {{Values.environment}}
- Resources in resource stack, e.g. {{Resources.EMRInstanceProfile.PhysicalResourceId}}
- Predefined variables
  - {{EmrHadoopDebuggingStep}} enable debugging in EMR
  - {{AWSAccountID}} The current aws account id
