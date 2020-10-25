
class EmrSparkStep{
  constructor(stepConfig){
    this.stepConfig = stepConfig
  }

  get(){
    const sparkConfigs = (this.stepConfig.SparkConfigs || []).map(conf => ["--conf", conf]).flat()
    const javaConfigs = (this.stepConfig.DriverJavaOptions || []).map(o => ["--driver-java-options", o]).flat()

    return {
        Name: this.stepConfig.Name,
        ActionOnFailure: this.stepConfig.ActionOnFailure,
        HadoopJarStep: {
          Jar: "command-runner.jar",
          Args: [
            "spark-submit",
            ...sparkConfigs,
            ...javaConfigs,
            "--class", this.stepConfig.MainClass,
            "--deploy-mode", this.stepConfig.DeployMode,
            "--master", this.stepConfig.Master,
            this.stepConfig.S3PackagePath,
            ...this.stepConfig.Args
          ],
        }
      }
  }
}

module.exports = EmrSparkStep;
