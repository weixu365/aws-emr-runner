const fs = require("fs");
const AWS = require("./aws");
const logger = require("./logger");

class CloudformationClient {
  constructor(region) {
    this.cloudformation = new AWS.CloudFormation({ region })
    this.logger = logger
  }

  getStackResources(stack_name) {
    var params = {
      StackName: stack_name
    };
    return this.cloudformation.describeStackResources(params).promise()
      .tap(() => this.logger.info(`Get cloudformation stack resources from '${stack_name}'`))
      .then(r => r.StackResources)
      .catch(e => Promise.reject(new Error(`Failed to get cloudformation stack resources from '${stack_name}', caused by ${e}`)));
  }
}

module.exports = CloudformationClient;

