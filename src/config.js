const fs = require('fs');
const yaml = require('js-yaml');
const lodash = require('lodash');
const Mustache = require('mustache');
const logger = require('./logger');
const LambdaTemplate = require('./aws/lambda_template');
const EmrHadoopDebuggingStep = require('./steps/emr_hadoop_debugging_step');


class Config {
  constructor(configPath, settingsPath) {
    this.configPath = configPath
    this.settingsPath = settingsPath ?? []
    this.logger = logger
    this.overrideSettings = {}

    this.resources = null
    this.builtInVariables = {
      EmrHadoopDebuggingStep: JSON.stringify(new EmrHadoopDebuggingStep().get(), null, '  '),
    }
    this.config = null
  }

  load() {
    const defaultSettings = {
      env: {...process.env},
      ...(this.resources && { Resources: this.resources }),
      ...this.builtInVariables,
    }

    const fileSettings = this.loadSettingsFiles(this.settingsPath, defaultSettings)
    this.logger.debug(`Loaded settings: \n${JSON.stringify(fileSettings, null, '  ')}`)

    const configTemplate = fs.readFileSync(this.configPath, 'utf8')
    const configBody = this.renderTemplate(configTemplate, {...defaultSettings, Values: fileSettings})
    const configDoc = this.loadYaml(configBody)

    // merge tags
    configDoc.cluster.Tags = [
      ...(this.getMaxIdleMinutesTag(configDoc)),
      ...this.loadStackTags(configDoc.stackTags)
    ]

    // merge override configs
    lodash.forEach(this.overrideSettings, (value, key) => {
      lodash.set(configDoc, key, value)

      if(this.resources != null) {
        this.logger.info(`Override settings: ${key}=${value}`)
      }
    })

    this.addClusterMonitorLambda(configDoc)
    this.config = configDoc
    this.settings = fileSettings
    this.logger.debug(`Loaded config file: \n${JSON.stringify(this.config, null, '  ')}`)

    return this
  }

  getMaxIdleMinutesTag(configDoc) {
    if (configDoc.deploy.maxIdleMinutes) {
      return this.loadStackTags({maxIdleMinutes: configDoc.deploy.maxIdleMinutes})
    } else {
      return []
    }
  }

  addClusterMonitorLambda(configDoc) {
    if (configDoc.deploy.maxIdleMinutes) {
      const lambdaResources = new LambdaTemplate().getTemplate(configDoc.name, 'functionCode')
      configDoc.resources = {...lambdaResources, ...configDoc.resources}
    }
  }

  get() {
    if(!this.config) {
      this.load()
    }

    return this.config
  }

  getSetting(name) {
    return lodash.get(this.settings, name)
  }

  getName() {
    return this.get().name
  }

  getResourceStackName() {
    return `${this.getName()}-resources-${this.get().deploy.environment}`
  }

  reloadWithResources(accountId, resources) {
    this.builtInVariables.AWSAccountId = accountId
    this.resources = resources
    this.load()
    this.logger.debug(`Loaded config file with resources: \n${JSON.stringify(this.config, null, '  ')}`);
    
    return this
  }

  loadSettingsFiles(settingsPath, defaultSettings) {
    var settings = {}
    settingsPath.forEach(path => {
      this.logger.debug(`Loaded settings file: ${path}`);
      const settingsTemplate = fs.readFileSync(path, 'utf8')
      const settingsBody = this.renderTemplate(settingsTemplate, {...defaultSettings, Values: settings})
      const settingsDoc = this.loadYaml(settingsBody)
      
      settings = {...settings, ...settingsDoc}
    })

    return settings
  }

  addOverrideConfigs(name, value) {
    this.overrideSettings[name] = value
    return this
  }

  addSteps(steps) {
    this.config.cluster.Steps = [...(this.config.cluster.Steps), ...steps]
    return this
  }

  loadStackTags(tags) {
    return lodash.toPairs(tags || []).map(p => ({
      Key: p[0], 
      Value: p[1].toString()
    }))
  }

  log(obj) {
    this.logger.info(JSON.stringify(obj, null, '  '))
  }

  loadYaml(body) {
    try{
      return yaml.load(body)
    } catch(e) {
      this.logger.info(`Failed to load yaml due to ${e}`)
      throw e
    }
  }

  isAwsVariable(name) {
    return name.startsWith('Resources.') || ['AWSAccountId'].includes(name)
  }

  renderTemplate(template, values) {
    const spans = Mustache.parse(template)
    const variables = spans
      .filter(span => span[0] == 'name')
      .filter(span => lodash.isNil(lodash.get(values, span[1])))
      .filter(span => !lodash.isNil(this.resources) || (lodash.isNil(this.resources) && !this.isAwsVariable(span[1])))
      .map(span => span[1])

    if(variables.length > 0) {
      this.logger.error("Variables not found:")
      variables.forEach(v => this.logger.error(`- ${v}`))

      throw new Error(`Variable not found: ${variables}`)
    }
    
    Mustache.escape = function(text) {return text;}
    return Mustache.render(template, values)
  }
}

module.exports = Config;
