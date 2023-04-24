// Holds the implementation about the information gathered from teh CDP protocol
// Stores the run results, console logs and har network information on the after event
// Holds the logic for the cdp connection

let reporterOptions = {
  runId: "",
  tlTestId: "",
  s3BucketName: "",
  executeFrom: "",
  customResultsPath: "",
  uploadResultsToS3: false,
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
  colors.enable();

  const s3Client = new S3Client({ region: process.env.REGION });

  let portForCDP;
  let cdp;
  let eventFilter;
  let messageLog = [];
  let harLogs = [];
  let images = [];
  let failedTests = [];
  let takeScreenshots;
  let counter = Math.floor(Math.random() * 1000000 + 1);
  let stopScreenshots = false;
  let startScreenshots = false;
  let testMap = [];
  let addedResults = {};
  let testTlIds = [];

  const reporterLog = colors.yellow("[testerloop-reporter]");
  let s3RunPath;
  function log(msg) {
    console.log(msg);
  }

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

  function errorWritingFileLog(obj) {
    console.log(
      `${reporterLog} Error saving output file '${obj.fileName}'`,
      err.message
    );
  }

  function debugLog(msg) {
    // suppress with DEBUG=-otf-reporter
    if (process.env.DEBUG && process.env.DEBUG.includes("-otf-reporter")) {
      return;
    }

    log(`${reporterLog} ${msg}`);
  }

  function isChrome(browser) {
    return (
      browser.family === "chrome" ||
      ["chrome", "chromium", "canary"].includes(browser.name) ||
      (browser.family === "chromium" && browser.name !== "electron")
    );
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
      return debugLog(
        `Warning: An unsupported browser family was used, output will not be logged to console: ${browser.family}`
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
        "--single-process"
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
  }

  on("task", {
    getReporterOptions: async (envVars) => {
      reporterOptions.runId = envVars[0] || process.env.TL_RUN_ID;
      reporterOptions.tlTestId = envVars[1] || process.env.TL_TEST_ID;
      reporterOptions.executeFrom = envVars[2];
      reporterOptions.s3BucketName = envVars[3];
      reporterOptions.customResultsPath = envVars[4];
      reporterOptions.uploadResultsToS3 = envVars[5];

      console.log(`${reporterLog} Reporter configuration:`);
      for (let key in reporterOptions) {
        if (key !== "tlTestId") {
          console.log(
            `   ${colors.cyan(key)}: ${colors.white(reporterOptions[key])}`
          );
        }
      }
      setRunPath();
      return reporterOptions;
    },
    generateTlTestId: () => {
      if (reporterOptions.tlTestId !== undefined) {
        return reporterOptions.tlTestId;
      } else return v4();
    },
    async writeTestsMapToFile(testsMap) {
      const jsonString = JSON.stringify(testsMap);
      let x = counter;
      // Write the JSON to a file
      const testsMapPath = `./logs/${reporterOptions.runId}/results/`;
      const fileName = `testsMap${x}.json`;
      fse.outputFileSync(`${testsMapPath}/${fileName}`, jsonString);
      testMap = testsMap;
      return null;
    },

    async writeConsoleLogsToFile(path) {
      const jsonString = JSON.stringify(messageLog);

      // Write the JSON to a file
      const consoleLogsPath = `./logs/${reporterOptions.runId}/${path}/console`;
      const fileName = "console-logs.txt";
      fse.outputFileSync(`${consoleLogsPath}/${fileName}`, jsonString);
      return null;
    },

    async writeHarToFile(path) {
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
          debugLog(
            `Attempting to connect to Chrome Debugging Protocol on port ${portForCDP}`
          );

          cdp = await connect({
            port: portForCDP,
            host: "127.0.0.1",
          });

          debugLog("Connected to Chrome Debugging Protocol");
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
            const tlTestId = params.tlTestId;
            if (
              response.status !== 204 &&
              response.headers.location == null &&
              !response.mimeType.includes("image") &&
              !response.mimeType.includes("audio") &&
              !response.mimeType.includes("video")
            ) {
              cdp.Network.loadingFinished(async (loadingFinishedParams) => {
                if (loadingFinishedParams.tlTestId === tlTestId) {
                  try {
                    const responseBody = await cdp.send(
                      "Network.getResponseBody",
                      {
                        tlTestId,
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
          cdp.on("disconnect", () => {
            debugLog("Chrome Debugging Protocol disconnected");
          });
        } catch (err) {
          console.error("Failed to connect to Chrome - ", err);
          setTimeout(tryConnect, 1000);
        }
        return cdp;
      }
      tryConnect();
      return null;
    },

    log: (message) => {
      console.log(message);
      return null;
    },
    save: (obj) => {
      try {
        fse.outputFileSync(`./logs/${reporterOptions.runId}/test.txt`, obj);
      } catch (err) {
        errorWritingFileLog(obj);
      }

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
        errorWritingFileLog(obj);
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
        errorWritingFileLog(obj);
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

  function createFailedTestsFile() {
    if (failedTests.length > 0) {
      try {
        fse.outputFileSync(
          `./logs/${reporterOptions.runId}/results/failed-${Date.now()}.json`,
          JSON.stringify(failedTests)
        );
      } catch (e) {
        console.log(`${reporterLog} Error saving the failed tests file: `, e);
      }
    }
  }

  function updateResultsFiles() {
    try {
      for (const id of testTlIds) {
        const filePath = `./logs/${reporterOptions.runId}/${id}/cypress/results.json`;
        let results = JSON.parse(fse.readFileSync(filePath, "utf8"));
        results = { ...results, ...addedResults };
        fse.writeFileSync(filePath, JSON.stringify(results));
      }
    } catch (err) {
      console.log("Error updating results file", err.message);
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
      const putObjectCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
        Body: "",
      });

      try {
        await s3Client.send(putObjectCommand);
      } catch (err) {
        console.log(`${reporterLog} Error creating file: ` + fileKey, err);
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

    if (reporterOptions.uploadResultsToS3 === true) {
      await sendFilesToS3(videosFolder, `s3://${s3RunPath}/video`);
      await sendFilesToS3(logsFolder, `s3://${s3RunPath}`);

      async function sendFilesToS3(localPath, s3Path) {
        const s3Client = new S3Client({ region: process.env.REGION });
        const { sync } = new S3SyncClient({ client: s3Client });
        try {
          console.log(
            `${reporterLog} Begin syncing local files from path ${localPath} to s3`
          );
          await sync(localPath, s3Path);
          console.log(`${reporterLog} Finish syncing local folder`);
        } catch (error) {
          console.log(`${reporterLog} Failed to sync files`, error);
        }
      }
    }
  }

  on("after:run", async (results) => {
    try {
      addedResults = {
        status: results.status,
        startedTestsAt: results.startedTestsAt,
        endedTestsAt: results.endedTestsAt,
        browserVersion: results.browserVersion,
      };
      createFailedTestsFile();
      updateResultsFiles();
      await uploadFilesToS3();
      await createAndPutCompleteFile();
    } catch (err) {
      console.log(`${reporterLog} Error uploading files to s3`, err.message);
    }
  });

  on("after:spec", async (spec, results) => {
    let x = counter;

    try {
      const testMap = JSON.parse(
        fse.readFileSync(
          `./logs/${reporterOptions.runId}/results/testsMap${x}.json`,
          "utf8"
        )
      );

      for (const { testSequence, tlTestId } of testMap) {
        const test = results.tests[testSequence - 1];
        testTlIds.push(tlTestId);
        const runs = [{ tests: [test], testId: tlTestId }];
        const resultFile = { runs };
        if (test.state === "failed") {
          failedTests.push({
            testId: tlTestId,
            title: test.title.slice(-1)[0],
            status: "failed",
          });
        }
        const filePath = `./logs/${reporterOptions.runId}/${tlTestId}/cypress/results.json`;
        fse.writeFileSync(filePath, JSON.stringify(resultFile));
      }
    } catch (err) {
      console.log(`${reporterLog} Error saving cypress duration`, err.message);
    }
    counter++;
  });
};

module.exports = {
  install,
};
