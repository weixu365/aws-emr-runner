const fs = require("fs");
const AWS = require("./aws");
const logger = require("../logger");

class S3Client {
  constructor(region) {
    this.s3 = new AWS.S3({region})
    this.logger = logger
  }

  applyTag(bucket, key, tags) {
    const params = {
      Bucket: bucket, 
      Key: key,
      Tagging: tags
     };
     return this.s3.putObjectTagging(params).promise()
      .then(() => this.logger.info(`Applied tags to s3 object ${bucket}/${key}`))
      .catch(e => Promise.reject(new Error(`Failed to apply tags to s3 object ${bucket}${key}, caused by ${e}`)));
  }  
  
  getS3Object(bucket, key) {
    const getObjectParams = {
      Bucket: bucket,
      Key: key
    };
    return this.s3.getObject(getObjectParams).promise()
      .then(response => response.Body.toString('utf-8'))
      .catch(e => Promise.reject(new Error(`Failed to get s3 object from ${bucket}/${key}, caused by ${e}`)));
  }

  putS3Object(destinationBucket, destKey, dataBody) {
    const putObjectParams = {
      Bucket: destinationBucket,
      Key: destKey,
      Body: dataBody
    };
    return this.s3.putObject(putObjectParams).promise()
      // .then(() => this.logger.info(`Put s3 object to ${destinationBucket}/${destKey}`))
      .catch(e => Promise.reject(new Error(`Failed to put s3 object to ${destinationBucket}/${destKey}, caused by ${e}`)));
  }

  uploadFile(filePath, destinationBucket, destKey) {
    const sourceStream = fs.createReadStream(filePath, {emitClose: true})

    const putObjectParams = {
      Bucket: destinationBucket,
      Key: destKey,
      Body: sourceStream
    };
    return this.s3.upload(putObjectParams).promise()
      // .then(() => this.logger.info(`Uploaded ${filePath} to ${destinationBucket}/${destKey}`))
      .catch(e => Promise.reject(new Error(`Failed to upload s3 object to ${destinationBucket}/${destKey}, caused by ${e}`)));
  }

  listObjects(bucket, prefix, continuationToken= null, pageSize= 1000) {
    const params = {
      Bucket: bucket,
      ContinuationToken: continuationToken,
      Prefix: prefix
    };
    return this.s3.listObjectsV2(params).promise()
      // .tap(() => this.logger.info(`List s3 objects ${bucket}/${prefix}`))
      .catch(e => Promise.reject(new Error(`Failed to list s3 objects with prefix ${prefix} in bucket ${bucket}, caused by ${e}`)));
  }

  async listAllObjects(bucket, prefix) {
    const results = [];

    var continuationToken = null;
    do {
      const response = await this.listObjects(bucket, prefix, continuationToken)
      continuationToken = response.NextContinuationToken;
      results.push(...response.Contents.map(o => o.Key));
      if(results.length > 2000) {
        break;
      }
    } while (continuationToken)

    return results;
  }
}

module.exports = S3Client;

