const Bluebird = require('bluebird');
const { Command } = require('commander');
const Config = require('./config')
const EmrRunner = require('./emr_runner')
const EmrClient = require('./emr_client')
const logger = require('./logger')

const getConfig = () => new Config(program.configFile, program.settingFiles)

const program = new Command()
  .version('1.0.0')
  .option('-v, --verbose', 'Show verbose output')
  .option('-s, --setting-files <setting_files...>', 'setting files')
  .requiredOption('-f, --config-file <config file>', 'config file')
  .on('option:verbose', () => {
    logger.level = 'debug'
  })

program
  .command('validate')
  .description('Validate config files')
  .action((cmd) => {
    logger.info('Validate configs');
    logger.info(`- setting files ${program.settingFiles}`);
    logger.info(`- config file ${program.configFile}`);

    getConfig().load()

    logger.info("Config file looks good")
  });

program
  .command('resources')
  .description('Setup resources stack for running EMR steps')
  .action((cmd) => {
    logger.info('WIP: Setting up resources stack');
    // new EmrRunner(config.load()).startCluster()
    //   .then(cluster_id => logger.info(`Cluster ${cluster_id} started`))
  });

program
  .command('start-cluster')
  .description('Start a new EMR cluster. You need to manually terminate the cluster.')
  .action((cmd) => {
    return new EmrRunner(getConfig().load()).startCluster()
      .then(cluster_id => logger.info(`Cluster ${cluster_id} started`))
  });

program
  .command('terminate-cluster')
  .option('-c --cluster-id <cluster id>',  'cluster id to terminate. Will get the active cluster by name if not specified')
  .description('Terminate an existing EMR cluster')
  .action((cmd) => {
    const emrRunner = new EmrRunner(getConfig().load())

    return Bluebird.resolve(cmd.clusterId || emrRunner.getClusterByName())
      .then(cluster_id => emrRunner.terminateCluster(cluster_id))
      .then(cluster_id => logger.info(`Cluster ${cluster_id} terminated`))
  });

program
  .command('run-step')
  .option('-c --cluster-id <cluster id>',  'Specify cluster id. Will get the active cluster by name if not specified')
  .description('Run EMR step in an existing cluster')
  .action((cmd) => {
    logger.info('Run emr step');
    logger.info(`clusterId=${cmd.clusterId}`);

    return new EmrRunner(getConfig().load()).addStep(cmd.clusterId)
  });

program
  .command('run')
  .option('-t --auto-terminate <auto terminate>',  'Auto terminate cluster after steps completed')
  .description('Start a new EMR cluster and run steps')
  .action((cmd) => {
    logger.info('Run emr cluster and step');
    logger.info(`autoTerminate=${cmd.autoTerminate}`);
    
    return new EmrRunner(getConfig().load()).run()
  });

program.parse()
