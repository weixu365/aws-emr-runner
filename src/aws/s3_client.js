const Bluebird = require("bluebird");
const { S3Client: S3, PutObjectTaggingCommand, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const fs = require("fs");
const logger = require("../logger");

class S3Client {
  constructor(region) {
    this.s3 = new S3({region})
    this.logger = logger
  }

  applyTag(bucket, key, tags) {
    const params = {
      Bucket: bucket, 
      Key: key,
      Tagging: tags
     };
     return Bluebird.resolve(this.s3.send(new PutObjectTaggingCommand(params)))
      .then(() => this.logger.info(`Applied tags to s3 object ${bucket}/${key}`))
      .catch(e => Promise.reject(new Error(`Failed to apply tags to s3 object ${bucket}${key}, caused by ${e}`)));
  }  
  
  getS3Object(bucket, key) {
    const getObjectParams = {
      Bucket: bucket,
      Key: key
    };
    return Bluebird.resolve(this.s3.send(new GetObjectCommand(getObjectParams)))
      .then(response => response.Body.toString('utf-8'))
      .catch(e => Promise.reject(new Error(`Failed to get s3 object from ${bucket}/${key}, caused by ${e}`)));
  }

  putS3Object(destinationBucket, destKey, dataBody) {
    const putObjectParams = {
      Bucket: destinationBucket,
      Key: destKey,
      Body: dataBody
    };
    return Bluebird.resolve(this.s3.send(new PutObjectCommand(putObjectParams)))
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
    return Bluebird.resolve(this.s3.send(new PutObjectCommand(putObjectParams)))
      // .then(() => this.logger.info(`Uploaded ${filePath} to ${destinationBucket}/${destKey}`))
      .catch(e => Promise.reject(new Error(`Failed to upload s3 object to ${destinationBucket}/${destKey}, caused by ${e}`)));
  }

  listObjects(bucket, prefix, continuationToken= null, pageSize= 1000) {
    const params = {
      Bucket: bucket,
      ContinuationToken: continuationToken,
      Prefix: prefix
    };
    return Bluebird.resolve(this.s3.send(new ListObjectsV2Command(params)))
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

