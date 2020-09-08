
class EmrHadoopDebuggingStep{
  get(){
    return {
        Name: 'Setup Hadoop Debugging',
        ActionOnFailure: 'CANCEL_AND_WAIT', //TERMINATE_JOB_FLOW
        HadoopJarStep: {
          Jar: 'command-runner.jar',
          Args: ['state-pusher-script'],
        }
      }
  }
}

module.exports = EmrHadoopDebuggingStep;
