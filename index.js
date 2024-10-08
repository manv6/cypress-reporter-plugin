// Holds the implementation about the information gathered from the CDP protocol
// Stores the run results, console logs and har network information on the after event
// Holds the logic for the cdp connection

let reporterOptions = {
  runId: "",
  tlTestId: "",
  s3BucketName: "",
  executeFrom: "",
  customResultsPath: "",
  uploadResultsToS3: false,
  s3Region: "",
  recordVideo: false,
};

const install = (on, options) => {
  const fs = require("fs");
  const fse = require("fs-extra");
  const { promisify } = require("util");
  const stream = require("stream");
  const { harFromMessages } = require("chrome-har");
  const connect = require("chrome-remote-interface");
  const PNGCrop = require("png-crop");
  const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
  const S3SyncClient = require("s3-sync-client");
  const { v4 } = require("uuid");
  const colors = require("colors");
  const path = require("path");
  const debug = require("debug");
  const { version } = require("./package.json");
  const {
    initializeLogger,
    silentLog,
    endLogStream,
  } = require("./reporter-plugin/logger/logger");

  let portForCDP;
  let cdp;
  let eventFilter;
  let messageLog = [];
  let newMessageLog = [];
  let harLogs = [];
  let images = [];
  let testResults = [];
  let takeScreenshots;
  let stopScreenshots = false;
  let startScreenshots = false;
  let testMap = [];
  let testTlIds = [];
  let logger;

  let reporterLog = colors.yellow("cypress-reporter-plugin: ");
  let s3RunPath;

  function setRunPath() {
    s3RunPath = (
      reporterOptions.s3BucketName +
      "/" +
      reporterOptions.customResultsPath +
      "/" +
      reporterOptions.runId
    )
      .replaceAll("//", "/")
      .replaceAll("//", "/");
  }

  function logReporterOptions() {
    // Disable or enable the coloring of logs
    reporterOptions.executeFrom !== "local"
      ? colors.disable()
      : colors.enable();
    // Resetting the reporterLog so the disabling takes effect
    reporterLog = colors.yellow("cypress-reporter-plugin: ");

    logger.info(`‣ Cypress Reporter plugin configuration:`);
    logger.info(
      `  ${colors.cyan("Reporter version")} ${colors.white(version)}`
    );
    for (let key in reporterOptions) {
      if (key !== "tlTestId") {
        logger.info(
          `  ${colors.cyan(key)}: ${colors.white(reporterOptions[key])}`
        );
      }
    }
  }

  function errorWritingFileLog(obj, err) {
    logger.error(`${reporterLog} Error saving output file '${obj.fileName}'`, {
      err,
    });
    logger.debug(
      `${reporterLog} Error saving output file '${obj.fileName}'`,
      err
    );
  }

  function isChrome(browser) {
    return (
      browser.family === "chrome" ||
      ["chrome", "chromium", "canary"].includes(browser.name) ||
      (browser.family === "chromium" && browser.name !== "electron")
    );
  }

  function recordNewLogMessage(logMessage) {
    newMessageLog.push(logMessage);
  }

  function recordLogMessage(logMessage) {
    messageLog.push(logMessage);
  }

  async function writeHarLogs(params, method) {
    if (!params?.timestamp) {
      params.timestamp = new Date().getTime();
    }

    harLogs.push({ method, params });
  }

  async function browserLaunchHandler(browser = {}, launchOptions) {
    if (!isChrome(browser)) {
      return logger.warning(
        `An unsupported browser family was used, output will not be logged to console: ${browser.family}`
      );
    }
    // Cypress has already provided a debugging port so we just grab it from there
    const existingDebuggingPort = launchOptions.args.find((config) =>
      config.startsWith("--remote-debugging-port")
    );

    if (browser.name === "chromium" || browser.name === "chrome") {
      launchOptions.args.push(
        "--hide-scrollbars",
        "--ignore-certificate-errors",
        "--disable-gpu",
        "--no-sandbox",
        "--no-zygote",
        "--js-flags=--expose-gc",
        "--js-flags=--max-old-space-size=3500",
        "--disable-gl-drawing-for-tests"
      );
    }

    // We store the port for further use in the connect function later
    portForCDP = parseInt(existingDebuggingPort.split("=")[1]);
    // We return the launch argument options so that
    // the browser can successfully initialize once the event has finished
    return launchOptions;
  }

  async function logConsole(params) {
    if (eventFilter && !eventFilter("console", params)) {
      return;
    }

    const { type, args, timestamp, stackTrace } = params;
    const prefix = `[${new Date(timestamp).getTime()}]`;
    const prefixSpacer = " ".repeat(prefix.length);

    let logMessage = `${prefix} console.${type} called`;

    recordLogMessage(logMessage);

    const logAdditional = (msg) => {
      let logMessage = `${prefixSpacer}${msg}`;
      recordLogMessage(logMessage);
    };
    if (args) {
      logAdditional(`Arguments: ${args.map((arg) => arg.value).join(" ")}`);
    }
    if (stackTrace.callFrames.length > 0) {
      logAdditional(`Stacktrace: ${JSON.stringify(stackTrace.callFrames)}`);
    }

    const consoleLogEvent = {
      id: v4(),
      type,
      args,
      timestamp: new Date(timestamp).getTime(),
      stackTrace,
    };
    recordNewLogMessage(consoleLogEvent);
  }

  on("task", {
    downloads: (downloadspath) => {
      return fs.readdirSync(downloadspath);
    },
    getReporterOptions: async (envVars) => {
      reporterOptions.runId = envVars[0] || process.env.TL_RUN_ID;
      reporterOptions.tlTestId = envVars[1] || process.env.TL_TEST_ID;
      reporterOptions.executeFrom = envVars[2];
      reporterOptions.s3BucketName = envVars[3];
      reporterOptions.customResultsPath = envVars[4];
      reporterOptions.uploadResultsToS3 = envVars[5];
      reporterOptions.s3Region = envVars[6] || process.env.AWS_REGION;
      reporterOptions.recordVideo = envVars[7];
      logger = initializeLogger(
        reporterOptions.s3BucketName,
        reporterOptions.customResultsPath,
        reporterOptions.runId
      );
      // Handle special cases for reporter options
      const valuesToIgnoreForResultsPath = [
        "null",
        null,
        "undefined",
        undefined,
      ];
      if (valuesToIgnoreForResultsPath.includes(envVars[4])) {
        reporterOptions.customResultsPath = "";
      }
      if (valuesToIgnoreForResultsPath.includes(envVars[2])) {
        reporterOptions.executeFrom = "local";
      }
      logReporterOptions();

      setRunPath();
      return reporterOptions;
    },
    generateTlTestId: () => {
      if (reporterOptions.tlTestId !== undefined) {
        return reporterOptions.tlTestId;
      } else return v4();
    },

    addTestMapping: (testMapping) => {
      const testsLogMessage = debug("TESTS");
      testMap.push(testMapping);
      testsLogMessage("Test added to testMap: ", testMapping);
      return null;
    },

    writeConsoleLogsToFile: (path) => {
      const jsonString = JSON.stringify(messageLog);
      // Write the txt console logs
      const consoleLogsPath = `./logs/${reporterOptions.runId}/${path}/console`;
      const fileName = "console-logs.txt";
      fse.outputFileSync(`${consoleLogsPath}/${fileName}`, jsonString);

      const newJsonString = JSON.stringify(newMessageLog);
      // Write the new JSON format to file
      const newFileName = "console-logs.json";
      fse.outputFileSync(`${consoleLogsPath}/${newFileName}`, newJsonString);
      return null;
    },

    writeHarToFile: (path) => {
      const har = harFromMessages(harLogs, {
        includeTextFromResponseBody: true,
      });
      const jsonString = JSON.stringify(har);

      // Write the JSON to a file
      const harPath = `./logs/${reporterOptions.runId}/${path}/har`;
      const fileName = "network-events.har";

      fse.outputFileSync(`${harPath}/${fileName}`, jsonString);
      return null;
    },
    // @TODO
    saveResource: async ({
      outputFolder,
      fullUrl,
      srcAttribute,
      saveOptions,
    }) => {
      if (!fullUrl) {
        throw new Error("Missing fullUrl");
      }

      const savePath = path.join(outputFolder, srcAttribute);
      const folder = path.dirname(savePath);
      await mkdirp(folder, { recursive: true });
      const pipeline = promisify(stream.pipeline);

      try {
        await pipeline(got.stream(fullUrl), fs.createWriteStream(savePath));
      } catch (err) {
        if (saveOptions && saveOptions.ignoreFailedAssets) {
          console.error(
            'ignoring failed asset "%s" -> "%s"',
            fullUrl,
            srcAttribute
          );
        } else {
          console.error('saving failed "%s" -> "%s"', fullUrl, srcAttribute);
          console.error(err.message);
          throw new Error(`Failed to load ${srcAttribute}\n${err.message}`);
        }
      }

      return null;
    },

    connect: async () => {
      async function tryConnect() {
        try {
          logger.info(
            `${reporterLog} Attempting to connect to Chrome Debugging Protocol on port ${portForCDP}`
          );
          const HOST = "127.0.0.1";

          cdp = await connect({
            port: portForCDP,
            host: HOST,
          });

          logger.info(`${reporterLog} Connected to Chrome Debugging Protocol`);
          //----------------------------------------------------------------
          /** captures logs from console.X calls */
          await cdp.Runtime.enable();
          await cdp.Page.enable();
          await cdp.Network.enable();

          cdp.Runtime.consoleAPICalled(logConsole);
          /** captures logs from network calls */
          cdp.Page.frameStartedLoading((params) =>
            writeHarLogs(params, "Page.frameStartedLoading")
          );
          cdp.Page.frameRequestedNavigation((params) =>
            writeHarLogs(params, "Page.frameRequestedNavigation")
          );
          cdp.Page.navigatedWithinDocument((params) =>
            writeHarLogs(params, "Page.navigatedWithinDocument")
          );
          cdp.Network.requestWillBeSent((params) =>
            writeHarLogs(params, "Network.requestWillBeSent")
          );
          cdp.Network.requestServedFromCache((params) =>
            writeHarLogs(params, "Network.requestServedFromCache")
          );
          cdp.Network.requestWillBeSentExtraInfo((params) =>
            writeHarLogs(params, "Network.requestWillBeSentExtraInfo")
          );
          cdp.Network.responseReceivedExtraInfo((params) =>
            writeHarLogs(params, "Network.responseReceivedExtraInfo")
          );
          cdp.Network.responseReceived(async (params) => {
            writeHarLogs(params, "Network.responseReceived");
            const response = params.response;
            const requestId = params.requestId;
            if (
              response.status !== 204 &&
              response.headers.location == null &&
              !response.mimeType.includes("image") &&
              !response.mimeType.includes("audio") &&
              !response.mimeType.includes("video")
            ) {
              cdp.Network.loadingFinished(async (loadingFinishedParams) => {
                if (loadingFinishedParams.requestId === requestId) {
                  try {
                    const responseBody = await cdp.send(
                      "Network.getResponseBody",
                      {
                        requestId,
                      }
                    );
                    params.response = {
                      ...params.response,
                      body: Buffer.from(
                        responseBody.body,
                        responseBody.base64Encoded ? "base64" : undefined
                      ).toString(),
                    };
                  } catch (err) {
                    // Fail silently, so we don't stop the execution
                  }
                }
              });
            }
          });
          cdp.Network.dataReceived((params) =>
            writeHarLogs(params, "Network.dataReceived")
          );
          cdp.Network.loadingFinished((params) =>
            writeHarLogs(params, "Network.loadingFinished")
          );
          cdp.Page.loadEventFired((params) =>
            writeHarLogs(params, "Page.loadEventFired")
          );
          cdp.Page.domContentEventFired((params) =>
            writeHarLogs(params, "Page.domContentEventFired")
          );
          cdp.Page.frameAttached((params) =>
            writeHarLogs(params, "Page.frameAttached")
          );
          cdp.Network.loadingFailed((params) =>
            writeHarLogs(params, "Network.loadingFailed")
          );
          cdp.Network.resourceChangedPriority((params) =>
            writeHarLogs(params, "Network.resourceChangedPriority")
          );
          // cdp.Page.lifecycleEvent(writeHarToFile);
          //----------------------------------------------------------------
          cdp.on("disconnect", async () => {
            logger.info(
              `${reporterLog} Chrome Debugging Protocol disconnected`
            );
          });
        } catch (err) {
          logger.error(`${reporterLog} Failed to connect to Chrome - `, {
            err,
          });
          logger.debug(`${reporterLog} Failed to connect to Chrome - `, err);
          setTimeout(tryConnect, 1000);
        }
        return cdp;
      }

      tryConnect();

      return null;
    },

    saveCommandsOut: (obj) => {
      const blob = JSON.stringify(obj.contents);

      try {
        fse.outputFileSync(
          `./logs/${reporterOptions.runId}/${obj.fileName}`,
          blob
        );
      } catch (err) {
        errorWritingFileLog(obj, err);
      }

      return null;
    },
    saveCypressOutput: (obj) => {
      const blob = JSON.stringify(obj.contents);

      try {
        fse.outputFileSync(
          `./logs/${reporterOptions.runId}/${obj.folderName}/${obj.fileName}`,
          blob
        );
      } catch (err) {
        errorWritingFileLog(obj, err);
      }

      return null;
    },
    //TODO add width,height and interval to be parameterized
    screenshot: async () => {
      takeScreenshots = setInterval(async () => {
        if (!stopScreenshots && startScreenshots) {
          let capturedImage = await cdp.Page.captureScreenshot();
          images.push({
            content: capturedImage.data,
            timestamp: Date.now(),
          });
        }
      }, 800);

      return null;
    },
    stopScreenshots: () => {
      stopScreenshots = true;
      clearInterval(takeScreenshots);
      return null;
    },
    startScreenshots: () => {
      startScreenshots = true;
      return null;
    },
    pauseScreenshots: () => {
      startScreenshots = false;
      return null;
    },
    clearReporterData: () => {
      messageLog = [];
      harLogs = [];
      images = [];
      return null;
    },
    saveScreenshots: (path) => {
      const screenshotsPath = `./logs/${reporterOptions.runId}/${path}/screenshots`;

      for (const image of images) {
        fse.outputFileSync(
          `${screenshotsPath}/${image.timestamp}.png`,
          image.content,
          "base64"
        );
      }
      return null;
    },
    cropScreenshots: (path) => {
      // cypress screenshot is always 800 * 600 whatever is the viewport
      const cropConfig = { width: 820, height: 630, top: 0, left: 450 };
      const dir = `./logs/${reporterOptions.runId}/${path}/screenshots/`;
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        if (files.length > 0) {
          files.forEach((file) => {
            PNGCrop.crop(
              `./logs/${reporterOptions.runId}/${path}/screenshots/` + file,
              `./logs/${reporterOptions.runId}/${path}/screenshots/` + file,
              cropConfig,
              function (err) {
                if (err) throw new Error("Failed to crop screenshots");
              }
            );
          });
        }
      }
      return null;
    },
  });

  // Load the chrome options inside the event
  on("before:browser:launch", browserLaunchHandler);

  function createTestsResultsFile() {
    try {
      fse.outputFileSync(
        `./logs/${
          reporterOptions.runId
        }/results/testResults-${Date.now()}.json`,
        JSON.stringify(testResults)
      );
    } catch (e) {
      logger.error(`${reporterLog} Error saving the failed tests file:`, { e });
      logger.debug(`${reporterLog} Error saving the failed tests file:`, e);
    }
  }

  function createResultsFile(tlTestId, resultFile) {
    try {
      const filePath = `./logs/${reporterOptions.runId}/${tlTestId}/cypress/results.json`;
      fse.writeFileSync(filePath, JSON.stringify(resultFile));
    } catch (e) {
      logger.error(
        `${reporterLog} Error creating the results.json file for test ${tlTestId} `,
        { e }
      );
      logger.debug(
        `${reporterLog} Error creating the results.json file for test ${tlTestId} `,
        e
      );
    }
  }

  function createCypressTestsResultsFile(cypressResults) {
    try {
      fse.outputFileSync(
        `./logs/${
          reporterOptions.runId
        }/results/cypressResults-${Date.now()}.json`,
        JSON.stringify(cypressResults)
      );
    } catch (e) {
      logger.error(`${reporterLog} Error saving the failed tests file:`, { e });
      logger.debug(`${reporterLog} Error saving the failed tests file`, e);
    }
  }

  async function createAndPutCompleteFile() {
    for (const test of testMap) {
      // Set the bucket name and file key
      const bucketName = `${reporterOptions.s3BucketName}`;
      const fileKey = `${s3RunPath.replace(bucketName + "/", "")}/${
        test.tlTestId
      }/test.complete`;
      await createEmptyFile(bucketName, fileKey);
    }

    async function createEmptyFile(bucketName, fileKey) {
      const s3Client = new S3Client({ region: reporterOptions.s3Region });
      const putObjectCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        Body: "",
      });

      try {
        await s3Client.send(putObjectCommand);
      } catch (err) {
        logger.error(`${reporterLog} Error creating file:` + fileKey, { err });
        logger.debug(`${reporterLog} Error creating file:` + fileKey, err);
      }
    }
  }

  async function uploadFilesToS3() {
    // Determine the folder path depending on the execution type environment (lambda | local | ecs)
    const logsFolder =
      reporterOptions.executeFrom === "lambda"
        ? `/tmp/cypress/logs/${reporterOptions.runId}/`
        : `./logs/${reporterOptions.runId}/`;
    const videosFolder =
      reporterOptions.executeFrom === "lambda"
        ? `/tmp/cypress/cypress/videos/`
        : `./cypress/videos/`;

    if (
      reporterOptions.uploadResultsToS3 === true ||
      reporterOptions.uploadResultsToS3 == "true"
    ) {
      await countFilesToUpload(logsFolder);
      await sendFilesToS3(logsFolder, `s3://${s3RunPath}`);

      if (reporterOptions.recordVideo) {
        await countFilesToUpload(videosFolder);
        await sendFilesToS3(videosFolder, `s3://${s3RunPath}/video`);
      }

      async function countFilesToUpload(dir) {
        const log = debug("s3");
        const filesToUpload = [];
        const foldersToUpload = [];
        const processFolder = (folderPath) => {
          const files = fse.readdirSync(folderPath);

          for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stats = fse.lstatSync(filePath);

            if (stats.isFile()) {
              filesToUpload.push(filePath);
            } else if (stats.isDirectory()) {
              foldersToUpload.push(filePath);
              processFolder(filePath); // Recursively process subfolders
            }
          }
        };

        processFolder(dir); // Start with the initial directory
        filesToUpload.sort();
        logger.info(
          `${reporterLog} Found a total of ${filesToUpload.length} files to upload (DEBUG=s3 to display them)`
        );
        for (const file of filesToUpload) {
          log(`Found file: `, file);
        }
      }

      async function sendFilesToS3(localPath, s3Path, retryCount = 0) {
        const s3Client = new S3Client({ region: reporterOptions.s3Region });
        const { sync } = new S3SyncClient({ client: s3Client });

        const retryDelay = 1000; // Retry delay in milliseconds
        const maxRetries = 3; // Maximum number of retries

        return new Promise(async (resolve, reject) => {
          const syncFiles = async () => {
            try {
              logger.info(
                `${reporterLog} Begin syncing local log files from path ${localPath} to s3`
              );

              await sync(localPath, s3Path);
              logger.info(`${reporterLog} Finish syncing local folder`);
              resolve();
            } catch (error) {
              logger.error(`${reporterLog} Failed to sync files`, { error });
              logger.debug(`${reporterLog} Failed to sync files`, error);

              if (retryCount < maxRetries) {
                logger.info(
                  `${reporterLog} Retrying (${retryCount + 1}/${maxRetries})...`
                );

                setTimeout(syncFiles, retryDelay);
                retryCount++;
              } else {
                logger.warning(
                  `${reporterLog} Maximum retries reached. Aborting sync. \nCheck your reporter options and internet connection`
                );
                reject(new Error("Maximum retries reached")); // Reject the promise when maximum retries are reached
              }
            }
          };
          await syncFiles();
        });
      }
    }
  }

  on("after:spec", async (spec, results) => {
    if (reporterOptions.runId !== "") {
      try {
        logger.debug(
          `Tests in testMap to create results: ${JSON.stringify(testMap)}`
        );

        silentLog(logger, { message: "Silent log Test Map: ", testMap });
        silentLog(logger, {
          message: "Silent log After Spec Results:  ",
          results,
        });
        let testCounter = 0;
        for (const {
          tlTestId,
          startedTestsAt,
          endedTestsAt,
          spec,
          browserVersion,
        } of testMap) {
          const test = results.tests[testCounter];
          testTlIds.push(tlTestId);
          const runs = [{ tests: [test], testId: tlTestId }];
          const resultFile = {
            runs,
            startedTestsAt,
            endedTestsAt,
            browserVersion,
            status: "finished",
          };
          logger.debug(`Results: found test with title: ${test.title}`, {
            test: test.title,
          });
          testResults.push({
            testId: tlTestId,
            title: spec.test.titlePath.slice(-1)[0] || test.title,
            titlePath: spec.test.titlePath,
            status: test.state,
            pathToTest: spec.file.relative,
            startedTestsAt,
            endedTestsAt,
          });
          createResultsFile(tlTestId, resultFile);
          testCounter++;
        }
        logger.debug(`Test results: `, {
          testResults: JSON.stringify(testResults),
        });
        silentLog(logger, {
          message: "Silent log Test Results: ",
          testResults,
        });
      } catch (err) {
        logger.error(`${reporterLog} Error saving cypress test files`, { err });
        logger.debug(`${reporterLog} Error saving cypress test files`, err);
      } finally {
        createTestsResultsFile();
        createCypressTestsResultsFile(results);
        await uploadFilesToS3();
        await createAndPutCompleteFile();
        await endLogStream();
        // Reset the test results for the following spec iteration
        testResults = [];
        testTlIds = [];
        testMap = [];
        testCounter = 0;
      }
    }
  });
};

module.exports = {
  install,
};
