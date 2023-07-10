const winston = require("winston");
const { S3StreamLogger } = require("s3-streamlogger");

let logger;

function clearLogger() {
  logger = undefined;
}

function getLogger() {
  if (!logger) {
    throw Error("No logger");
  }
  return logger;
}

function initializeLogger(bucketName, customPath, runId) {
  if (logger) {
    return logger;
  }

  const s3_stream = new S3StreamLogger({
    bucket: bucketName, //make env variable or clip parameter
    folder: `${customPath}/${runId}/logs/`, // env variable or cli parameter
    name_format: "reporter-plugin-logs-%Y-%m-%d-%H-%M-%S-%L",
  });

  const stream_transport = new winston.transports.Stream({
    stream: s3_stream,
  });

  logger = winston.createLogger({
    levels: winston.config.syslog.levels,

    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console({
        name: "console",
        level: process.env.DEBUG === "true" ? "debug" : "info",
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
          winston.format.printf(
            ({ timestamp, level, message }) =>
              `${level} ${timestamp} : ${message}`
          )
        ),
      }),
      stream_transport,
    ],
  });
  return logger;
}

module.exports = {
  getLogger,
  initializeLogger,
  clearLogger,
};
