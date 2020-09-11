const fs = require('fs');
const yaml = require('js-yaml');
const lodash = {
  get: require('lodash.get'),
  toPairs: require('lodash.topairs'),
  isNil: require('lodash.isnil'),
};
const Mustache = require('mustache');

const logger = require('./logger');
const EmrHadoopDebuggingStep = require('./emr_hadoop_debugging_step');


class Config {
  constructor(configPath, settingsPath) {
    this.configPath = configPath
    this.settingsPath = settingsPath
  }

  load() {
    const defaultSettings = {
      env: {...process.env, BUILD_NUMBER: 'manual', AUTO_TERMINATE: 'false'},
      EmrHadoopDebuggingStep: JSON.stringify(new EmrHadoopDebuggingStep().get(), null, '  '),
    }
    
    const allSettings = this.loadSettingsFiles(this.settingsPath, defaultSettings)
    logger.debug(`Loaded settings: \n${JSON.stringify(allSettings, null, '  ')}`);
    
    const configTemplate = fs.readFileSync(this.configPath, 'utf8')
    const configBody = this.renderTemplate(configTemplate, {...defaultSettings, Values: allSettings})
    const configDoc = this.loadYaml(configBody)

    // merge tags
    configDoc.cluster.Tags = [...(configDoc.cluster.Tags || []), ...this.loadStackTags(configDoc.stackTags)]
    logger.debug(`Loaded config file: \n${JSON.stringify(configDoc, null, '  ')}`);

    return configDoc
  }

  loadSettingsFiles(settingsPath, defaultSettings) {
    var settings = {}
    settingsPath.forEach(path => {
      logger.debug(`Loaded settings file: ${path}`);
      const settingsTemplate = fs.readFileSync(path, 'utf8')
      const settingsBody = this.renderTemplate(settingsTemplate, {...defaultSettings, Values: settings})
      const settingsDoc = this.loadYaml(settingsBody)
      
      settings = {...settings, ...settingsDoc}
    })

    return settings
  }

  loadStackTags(tags) {
    return lodash.toPairs(tags).map(p => ({
      Key: p[0], 
      Value: p[1]
    }))
  }

  log(obj) {
    console.log(JSON.stringify(obj, null, '  '))
  }

  loadYaml(body) {
    try{
      return yaml.safeLoad(body)
    } catch(e) {
      console.log(`Failed to load yaml due to ${e}`)
      throw e
    }
  }

  renderTemplate(template, values) {
    const spans = Mustache.parse(template)
    const variables = spans
      .filter(span => span[0] == 'name')
      .filter(span => lodash.isNil(lodash.get(values, span[1])))
      .map(span => span[1])

    if(variables.length > 0) {
      console.log(variables)

      throw new Error(`Variable not found: ${variables}`)
    }

    Mustache.escape = function(text) {return text;}
    return Mustache.render(template, values)
  }
}

module.exports = Config;
