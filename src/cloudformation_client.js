const fs = require("fs");
const yaml = require('js-yaml');
const lodash = require('lodash');
const AWS = require("./aws");
const logger = require("./logger");

class CloudformationClient {
  constructor(region) {
    this.cloudformation = new AWS.CloudFormation({ region })
    this.logger = logger
  }

  normaliseStackName(name) {
    return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  }

  getStackResources(stackName) {
    stackName = this.normaliseStackName(stackName)
    const params = {
      StackName: stackName
    };
    return this.cloudformation.describeStackResources(params).promise()
      .tap(() => this.logger.info(`Get cloudformation stack resources from '${stackName}'`))
      .then(r => r.StackResources)
      .catch(e => Promise.reject(new Error(`Failed to get cloudformation stack resources from '${stackName}', caused by ${e}`)));
  }

  deploy(stackName, resources, stackParameters, tags) {
    const changeSetName = `aws-emr-runner/${new Date().toISOString()}`.replace(/[^a-z0-9]/gi, '-')
    stackName = this.normaliseStackName(stackName)
    let operation = 'CREATE'
    this.getStack(stackName)
      .then(stack => {operation = stack == null ? 'CREATE': 'UPDATE'})
      .then(() => operation == 'UPDATE' && this.clearPreviousChangeSets(stackName))
      .then(() => console.log(`Create changeset to ${operation} stack ${stackName}`))
      .then(stack => this.createChangeSet(stackName, resources, stackParameters, tags, changeSetName, operation))
      .then(() => console.log(`Waiting for changeset to be created`))
      .then(() => this.waitForChangeSet(stackName, changeSetName))
      .then(() => console.log(`Execute changeset on stack ${stackName}`))
      .then(() => this.executeChangeSet(stackName, changeSetName))
      .then(() => console.log(`Waiting for changeset to be applied to stack ${stackName}`))
      .then(() => this.waitFor(stackName, operation == 'CREATE' ? 'stackCreateComplete': 'stackUpdateComplete'))
  }

  createChangeSet(stackName, resources, stackParameters, tags, changeSetName, changeSetType) {
    const parameters = lodash.toPairs(stackParameters).map(p => ({
      ParameterKey: p[0], 
      ParameterValue: p[1]
    }))

    lodash.forEach(this.stackParameters, (value, key) => {
      lodash.set(configDoc, key, value); 
      console.log(`override settings: ${key}=${value}`)
    })

    console.log(this.generateStackTemplate(stackName, resources))
    const params = {
      ChangeSetName: changeSetName,
      StackName: stackName,
      Capabilities: [ 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND' ],
      ChangeSetType: changeSetType,
      Parameters: parameters,
      Tags: tags,
      TemplateBody: this.generateStackTemplate(stackName, resources)
    };
    return this.cloudformation.createChangeSet(params).promise()
      .catch(e => Promise.reject(new Error(`Failed to create cloudformation changeset for '${stackName}', caused by ${e}`)));
  }

  executeChangeSet(stackName, changeSetName) {
    const params = {
      ChangeSetName: changeSetName,
      StackName: stackName
    };
    return this.cloudformation.executeChangeSet(params).promise()
      .catch(e => Promise.reject(new Error(`Failed to execute changeset on cloudformation stack '${stackName}', caused by ${e}`)));
  }

  clearPreviousChangeSets(stackName) {
    console.log(`Cleaning up previous changesets on stack ${stackName}`)
    return this.listChangeSets(stackName)
      .then(result => result.Summaries)
      .each(changeSet => this.deleteChangeSet(stackName, changeSet.ChangeSetName))
  }

  listChangeSets(stackName) {
    var params = {
      StackName: stackName
    };
    return this.cloudformation.listChangeSets(params).promise()
      .tap(changeSets => this.logger.info(`Found changesets: ${changeSets.Summaries.map(c => c.ChangeSetName)}`))
      .catch(e => Promise.reject(new Error(`Failed to list changesets from cloudformation stack '${stackName}', caused by ${e}`)));
  }

  deleteChangeSet(stackName, changeSetName) {
    var params = {
      ChangeSetName: changeSetName,
      StackName: stackName
    };
    return this.cloudformation.deleteChangeSet(params).promise()
      .tap(() => this.logger.info(`Deleted changeset: ${changeSetName}`))
      .catch(e => Promise.reject(new Error(`Failed to delete changeset from cloudformation stack '${stackName}', caused by ${e}`)));
  }

  getStack(stackName) {
    const params = {
      StackName: stackName
    };
    return this.cloudformation.describeStacks(params).promise()
      .catch(e => {
        if (e.message.indexOf("not exist") >=0) {
          return null
        }

        return Promise.reject(new Error(`Failed to describe cloudformation stacks '${stackName}', caused by ${e}`))
      });
  }

  generateStackTemplate(name, resources) {
    const defaultTemplate = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: `${name} Resources Stack`
    }

    return yaml.dump({...defaultTemplate, Resources: resources})
  }

  waitFor(stackName, event) {
    const params = {
      StackName: stackName
    };

    return this.cloudformation.waitFor(event, params).promise()
  }

  waitForChangeSet(stackName, changeSetName) {
    const params = {
      StackName: stackName,
      ChangeSetName: changeSetName
    };

    return this.cloudformation.waitFor('changeSetCreateComplete', params).promise()
  }
}

module.exports = CloudformationClient;

