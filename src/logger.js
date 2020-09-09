const winston = require('winston');

const format = winston.format

const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: format.combine(
        format.timestamp(),
        format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
      )
    })
  ],
});
 
class Logger{
  static getLogger() {
    return logger
  }

  info(msg) {
    logger.info(msg)
  }
}

module.exports = logger
