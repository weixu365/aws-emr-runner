const AWS = require("aws-sdk");
const Bluebird = require('bluebird');

AWS.config.setPromisesDependency(Bluebird);
AWS.config.update({ region: "ap-southeast-2" });

module.exports = AWS;
