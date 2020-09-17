Run Spark application in aws emr

### Download
wget 
bunzip2
chmod +x

### Validate config files
aws-emr-runner validate -f samples/enrichment-pipeline.yml -s samples/enrichment-pipeline.settings.yml

### Run EMR Clustr and spark application
aws-emr-runner run -f samples/enrichment-pipeline.yml -s samples/enrichment-pipeline.settings.yml

### Use the docker image
docker run 