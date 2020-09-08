const fs = require('fs');
const yaml = require('js-yaml');

const lodash = require('lodash');
const Mustache = require('mustache');

const EmrHadoopDebuggingStep = require('./emr_hadoop_debugging_step');


class Config {
  constructor(settingsPath, configPath) {
    this.settingsPath = settingsPath
    this.configPath = configPath
  }

  load() {
    const defaultSettings = {
      env: {...process.env, BUILD_NUMBER: 'manual', AUTO_TERMINATE: 'false'},
      EmrHadoopDebuggingStep: JSON.stringify(new EmrHadoopDebuggingStep().get(), null, '  '),
    }
    
    const settingsTemplate = fs.readFileSync(this.settingsPath, 'utf8')
    const settingsBody = this.renderTemplate(settingsTemplate, defaultSettings)
    this.log(settingsBody)
    const settingsDoc = this.loadYaml(settingsBody)
    
    const configTemplate = fs.readFileSync(this.configPath, 'utf8')
    const allSettings = {...defaultSettings, Values: settingsDoc}
    this.log(allSettings);

    const configBody = this.renderTemplate(configTemplate, allSettings)
    const configDoc = this.loadYaml(configBody)

    // merge tags
    configDoc.cluster.Tags = [...(configDoc.cluster.Tags || []), ...this.loadStackTags(configDoc.stackTags)]
    this.log(configDoc);

    return configDoc
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
