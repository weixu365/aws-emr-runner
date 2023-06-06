const Bluebird = require('bluebird');
const { 
  CloudFormationClient: CloudFormation,
  DescribeStackResourcesCommand,
  CreateChangeSetCommand,
  ExecuteChangeSetCommand,
  ListChangeSetsCommand,
  DeleteChangeSetCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
  DescribeChangeSetCommand,
  waitUntilChangeSetCreateComplete,
  waitUntilStackCreateComplete,
  waitUntilStackUpdateComplete,
} = require("@aws-sdk/client-cloudformation");

const yaml = require('js-yaml');
const lodash = require('lodash');
const promiseRetry = require('promise-retry');
const logger = require("../logger");

class CloudformationClient {
  constructor(region) {
    this.cloudformation = new CloudFormation({ region })
    this.logger = logger
    this.retryPolicy = {minDelay: 1, maxDelay: 5}
  }

  normaliseStackName(name) {
    return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  }

  getStackResources(stackName) {
    stackName = this.normaliseStackName(stackName)
    const params = {
      StackName: stackName
    };
    return Bluebird.resolve(this.cloudformation.send(new DescribeStackResourcesCommand(params)))
      .tap(() => this.logger.info(`Get cloudformation stack resources from '${stackName}'`))
      .then(r => r.StackResources)
      .catch(e => Promise.reject(new Error(`Failed to get cloudformation stack resources from '${stackName}', caused by ${e}`)));
  }

  async deploy(stackName, resources, stackParameters, tags) {
    stackName = this.normaliseStackName(stackName)
    const changeSetName = `aws-emr-runner/${new Date().toISOString()}`.replace(/[^a-z0-9]/gi, '-')
    
    const stack = await this.getStack(stackName)
    const operation = stack == null ? 'CREATE': 'UPDATE'
    if (operation == 'UPDATE') {
      this.logger.info(`Cleaning up previous changesets on stack ${stackName}`)
      await this.clearPreviousChangeSets(stackName)
    } 
    
    this.logger.info(`Create changeset to ${operation} resources stack ${stackName}: ${changeSetName}`)
    await this.createChangeSet(stackName, resources, stackParameters, tags, changeSetName, operation)

    this.logger.info(`Waiting for changeset to be created`)
    const changeSet = await this.waitForChangeSet(stackName, changeSetName)
    if(changeSet == null) {
      this.logger.info(`No changes on resources stack ${stackName}, clean up change set: ${changeSetName}`)
      await this.deleteChangeSet(stackName, changeSetName)
    } else {
      this.logger.info(`Executing changeset on stack ${stackName}`)
      await this.executeChangeSet(stackName, changeSetName)
      this.logger.info(`Waiting for changeset to be applied to stack ${stackName}`)
      if(operation == 'CREATE') {
        await this.waitFor(stackName, 'stackCreateComplete', waitUntilStackCreateComplete)
      } else {
        await this.waitFor(stackName, 'stackUpdateComplete', waitUntilStackUpdateComplete)
      }
    }
  }

  createChangeSet(stackName, resources, stackParameters, tags, changeSetName, changeSetType) {
    const parameters = lodash.toPairs(stackParameters).map(p => ({
      ParameterKey: p[0], 
      ParameterValue: p[1]
    }))

    lodash.forEach(this.stackParameters, (value, key) => {
      lodash.set(configDoc, key, value); 
      this.logger.info(`override settings: ${key}=${value}`)
    })

    const stackTemplateBody = this.generateStackTemplate(stackName, resources)
    this.logger.debug(`Generated stack template: ${stackTemplateBody}`)
    const params = {
      ChangeSetName: changeSetName,
      StackName: stackName,
      Capabilities: [ 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND' ],
      ChangeSetType: changeSetType,
      Parameters: parameters,
      Tags: tags,
      TemplateBody: stackTemplateBody
    };
    return Bluebird.resolve(this.cloudformation.send(new CreateChangeSetCommand(params)))
      .catch(e => Promise.reject(new Error(`Failed to create cloudformation changeset for '${stackName}', caused by ${e}`)));
  }

  executeChangeSet(stackName, changeSetName) {
    const params = {
      ChangeSetName: changeSetName,
      StackName: stackName
    };
    return Bluebird.resolve(this.cloudformation.send(new ExecuteChangeSetCommand(params)))
      .catch(e => Promise.reject(new Error(`Failed to execute changeset on cloudformation stack '${stackName}', caused by ${e}`)));
  }

  clearPreviousChangeSets(stackName) {
    return this.listChangeSets(stackName)
      .then(result => result.Summaries)
      .each(changeSet => this.deleteChangeSet(stackName, changeSet.ChangeSetName))
  }

  listChangeSets(stackName) {
    stackName = this.normaliseStackName(stackName)
    var params = {
      StackName: stackName
    };
    return Bluebird.resolve(this.cloudformation.send(new ListChangeSetsCommand(params)))
      .tap(changeSets => this.logger.info(`Found changesets: ${JSON.stringify(changeSets.Summaries.map(c => c.ChangeSetName))}`))
      .catch(e => Promise.reject(new Error(`Failed to list changesets from cloudformation stack '${stackName}', caused by ${e}`)));
  }

  deleteChangeSet(stackName, changeSetName) {
    stackName = this.normaliseStackName(stackName)
    var params = {
      ChangeSetName: changeSetName,
      StackName: stackName
    };
    return Bluebird.resolve(this.cloudformation.send(new DeleteChangeSetCommand(params)))
      .tap(() => this.logger.info(`Deleted changeset: ${changeSetName}`))
      .catch(e => Promise.reject(new Error(`Failed to delete changeset from cloudformation stack '${stackName}', caused by ${e}`)));
  }

  deleteStack(stackName) {
    stackName = this.normaliseStackName(stackName)
    var params = {
      StackName: stackName
    };
    return Bluebird.resolve(this.cloudformation.send(new DeleteStackCommand(params)))
      .then(() => {
        return promiseRetry((retry, number) => {
          return this.getStack(stackName)
            .then(r => {
              if(r == null) {
                return null
              }
              return retry()
            })
            .catch(e => {
              if(!this.isRetryError(e)) {
                this.logger.info(`Failed to check stack status(${number}): ${e}`)
              }
              return retry()
            })
        }, {forever: true, minTimeout: 2000, factor: 1})
      })
      .catch(e => Promise.reject(new Error(`Failed to delete cloudformation stacks '${stackName}', caused by ${e}`)))
  }

  getStack(stackName) {
    stackName = this.normaliseStackName(stackName)
    const params = {
      StackName: stackName
    };
    return Bluebird.resolve(this.cloudformation.send(new DescribeStacksCommand(params)))
      .then(response => response.Stacks[0])
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

  getEvents(stackName) {
    stackName = this.normaliseStackName(stackName)
    var params = {
      StackName: stackName
    };
    return Bluebird.resolve(this.cloudformation.send(new DescribeStackEventsCommand(params)))
      .then(response => response.StackEvents)
      .map(e => lodash.pick(e, ['LogicalResourceId', 'ResourceStatus', 'ResourceStatusReason']))
      .catch(e => Promise.reject(new Error(`Failed to get events from stack: '${stackName}', caused by ${e}`)));
  }

  waitFor(stackName, event, func) {
    const params = {
      StackName: stackName
    };
    
    return Bluebird.resolve(func({client: this.cloudformation, ...this.retryPolicy}, params))
      .catch(e => {
        return this.getEvents(stackName)
          .then((events) => Promise.reject(new Error(`Stack is not in the state '${event}', detailed events:\n${JSON.stringify(events, null, '  ')}`)))
      });
  }

  waitForChangeSet(stackName, changeSetName) {
    const params = {
      StackName: stackName,
      ChangeSetName: changeSetName
    };

    return Bluebird.resolve(waitUntilChangeSetCreateComplete({client: this.cloudformation, ...this.retryPolicy}, params))
      .catch(e => {
        return this.getChangeset(stackName, changeSetName)
          .tap(changeSet => this.logger.debug(`Changeset : ${JSON.stringify(changeSet, null, '  ')}`))
          .then(changeSet => {
            if (lodash.size(changeSet.Changes) == 0) {
              return null
            }else{
              return changeSet
            }
          })
      })
  }

  getChangeset(stackName, changeSetName) {
    const params = {
      ChangeSetName: changeSetName,
      StackName: stackName
    };
    return Bluebird.resolve(this.cloudformation.send(new DescribeChangeSetCommand(params)))
      .catch(e => Promise.reject(new Error(`Failed to get changeset from stack: '${stackName}', caused by ${e}`)));
  }

  isRetryError(err) {
    return err && err.code === 'EPROMISERETRY' && Object.prototype.hasOwnProperty.call(err, 'retried');
  }
}

module.exports = CloudformationClient;

