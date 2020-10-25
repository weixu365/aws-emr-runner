const fs = require("fs");
const AWS = require("./aws");
const logger = require("../logger");

class StsClient {
  constructor(region) {
    this.sts = new AWS.STS({region})
    this.logger = logger
  }

  getAccount() {
    return this.sts.getCallerIdentity({}).promise()
      .then(response => response.Account)
      .tap(accountId => this.logger.info(`Get current AWS account: ${accountId}`))
      .catch(e => Promise.reject(new Error(`Failed to get current AWS account, caused by ${e}`)));
  }  
  
}

module.exports = StsClient;

