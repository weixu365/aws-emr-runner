const AWS = require("aws-sdk");
const Bluebird = require('bluebird');

AWS.config.setPromisesDependency(Bluebird);

module.exports = AWS;
