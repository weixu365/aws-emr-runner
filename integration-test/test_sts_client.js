const { expect } = require('chai');
const StsClient = require('../src/aws/sts_client');

describe('Test Sts client', () => {
  it('Should able to get account', () => {
    const stsClient = new StsClient('ap-southeast-2');
    return stsClient.getAccount()
  }).timeout(5000);
});
