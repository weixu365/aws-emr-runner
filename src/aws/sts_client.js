const Bluebird = require("bluebird");
const { STSClient: Sts, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const logger = require("../logger");

class StsClient {
  constructor(region) {
    this.sts = new Sts({region})
    this.logger = logger
  }

  getAccount() {
    return Bluebird.resolve(this.sts.send(new GetCallerIdentityCommand()))
      .then(response => response.Account)
      .tap(accountId => this.logger.info(`Get current AWS account: ${accountId}`))
      .catch(e => Promise.reject(new Error(`Failed to get current AWS account, caused by ${e}`)));
  }  
  
}

module.exports = StsClient;

