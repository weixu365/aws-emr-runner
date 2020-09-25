Run Spark application in aws emr

### Download
You can download the executables in releases page or by using the following script:

Macos:
```bash
curl -sSL https://github.com/weixu365/aws-emr-runner/releases/latest/download/aws-emr-runner-macos.bz2 | \
  bunzip2 > aws-emr-runner | \
  chmod +x aws-emr-runner
```

Linux:
```bash
curl -sSL https://github.com/weixu365/aws-emr-runner/releases/latest/download/aws-emr-runner-linux.bz2 | \
  bunzip2 > aws-emr-runner | \
  chmod +x aws-emr-runner
```
### Usage
#### Validate config files
```bash
./aws-emr-runner validate -f samples/enrichment-pipeline.yml -s samples/enrichment-pipeline.settings.yml
```

#### Run EMR Clustr and spark application
```bash
./aws-emr-runner run -f samples/enrichment-pipeline.yml -s samples/enrichment-pipeline.settings.yml
```

### Resources stack
- S3 Bucket. Upload package files to this s3 bucket then run EMR steps using this package
- IAM Role and instance profile for emr instance
- Any other resource you want to put in the resource stack

### Underlying steps when running a spark application
- Load setting files
- Load config file and evaluate variables except resources variables
- Create or update resources stack
- Get resources from resources stack
- Evaluate all variables in config file
- Generate EMR steps from config file
- Create EMR cluster with defined steps 
- Wait until all steps completed

### Supported variables
- Environment variable, e.g. `{{env.BUILD_NUMBER}}`
- Values in a settings file, reference through `Values` prefix, e.g. `{{Values.environment}}`
- Resources in resource stack, e.g. `{{Resources.EMRInstanceProfile.PhysicalResourceId}}`
- Predefined variables
  - `{{EmrHadoopDebuggingStep}}` enable debugging in EMR
  - `{{AWSAccountID}}` The current aws account id

### Supported configurations of EMR cluster
Support all the configs for aws nodejs sdk `new EMR().runJobFlow()` method
https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EMR.html#runJobFlow-property
