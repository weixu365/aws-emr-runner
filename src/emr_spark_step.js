

class EmrSparkStep{
  constructor(name, mainClass, bucketName, packageName, driverJavaOption){
    this.config = {
      name : name,
      type:"Spark",
      actionOnFailure : "CANCEL_AND_WAIT",
      packageS3Path : `s3://${bucketName}/${packageName}`,
      spark_args : [
        "prod"
      ],
      master : "yarn",
      spark_configs: "spark.yarn.maxAppAttempts=5",
      driverJavaOptions: driverJavaOption,
      mainClass: mainClass,
      deployMode: 'client',
    }
  }

  get(){
    return {
        Name: this.config.name,
        ActionOnFailure: this.config.actionOnFailure,
        HadoopJarStep: {
          Jar: "command-runner.jar",
          Args: [
            "spark-submit",
            "--conf", this.config.spark_configs,
            "--driver-java-options", this.config.driverJavaOptions,
            "--class", this.config.mainClass,
            "--deploy-mode", this.config.deployMode,
            "--master", this.config.master,
            this.config.packageS3Path,
            ...this.config.spark_args
          ],
        }
      }
  }
}

module.exports = EmrSparkStep;
