const winston = require("winston");
const { S3StreamLogger } = require("s3-streamlogger");

let logger;
let s3_stream;

function clearLogger() {
  logger = undefined;
}

const pollingInterval = 1000; // 1 second
let pollingIntervalId;

function checkWritableFinished() {
  if (s3_stream.writableFinished) {
    clearInterval(pollingIntervalId); // Stop polling
    return true;
  }
  return false;
}

async function endLogStream() {
  return new Promise((resolve) => {
    s3_stream.end();
    let hasFinishedWriting = false;
    const pollingIntervalId = setInterval(() => {
      hasFinishedWriting = checkWritableFinished();
      if (hasFinishedWriting) {
        clearInterval(pollingIntervalId);
        resolve(true);
      }
    }, pollingInterval);
  });
}

function silentLog(logger, payload) {
  try {
    logger.transports[0].silent = true;
    logger.log("info", payload);
    logger.transports[0].silent = false;
  } catch (err) {}
}

function getLogger() {
  if (!logger) {
    throw Error("No logger");
  }
  return logger;
}

function initializeLogger(bucketName, customPath, runId, tlTestId) {
  if (logger) {
    return logger;
  }
  tlTestId === undefined ? (tlTestId = "testId") : tlTestId;
  s3_stream = new S3StreamLogger({
    bucket: bucketName, //make env variable or clip parameter
    folder: `${customPath}/${runId}/logs/`, // env variable or cli parameter
    name_format: `reporter-plugin-logs-%Y-%m-%d-%H-%M-%S-%L-${tlTestId}`,
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
  silentLog,
  getLogger,
  initializeLogger,
  clearLogger,
  endLogStream,
};
