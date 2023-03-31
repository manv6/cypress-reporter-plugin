// Holds the implementation about the information gathered from teh CDP protocol
// Stores the run results, console logs and har network information on the after event
// Holds the logic for the cdp connection

reporterOptions = {
  runId: "",
  requestId: "",
  s3BucketName: "",
  executeFrom: "local",
  uploadResultsToS3: false,
};

const install = (on, { ...reporterOptions }) => {
  console.log("Reporter options: ", { ...reporterOptions });
  const fs = require("fs");
  const fse = require("fs-extra");
  const { promisify } = require("util");
  const stream = require("stream");
  const { harFromMessages } = require("chrome-har");
  const connect = require("chrome-remote-interface");
  const PNGCrop = require("png-crop");
  const { S3Client } = require("@aws-sdk/client-s3");
  const S3SyncClient = require("s3-sync-client");

  let portForCDP;
  let cdp;
  let eventFilter;
  let messageLog = [];
  let harLogs = [];
  let images = [];
  let takeScreenshots;
  let stopScreenshots = false;
  let startScreenshots = false;

  function log(msg) {
    console.log(msg);
  }

  function debugLog(msg) {
    // suppress with DEBUG=-otf-reporter
    if (process.env.DEBUG && process.env.DEBUG.includes("-otf-reporter")) {
      return;
    }

    log(`[otf-reporter] ${msg}`);
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
    console.log("----------> BEFORE Browser START");

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
        "--single-process",
        "--window-size=1280,1024"
      );
    }

    // We store the port for further use in the connect function later
    portForCDP = parseInt(existingDebuggingPort.split("=")[1]);
    console.log("Debug Port to connect is: ", portForCDP);
    console.log("----------> BEFORE Browser END");
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

  async function writeHarToFile(har) {
    const jsonString = JSON.stringify(har);

    // Write the JSON to a file
    const harPath = "./logs/har";
    const fileName = "network-events.har";

    fse.outputFileSync(`${harPath}/${fileName}`, jsonString);
  }

  async function writeConsoleLogsToFile() {
    const jsonString = JSON.stringify(messageLog);

    // Write the JSON to a file
    const consoleLogsPath = "./logs/console";
    const fileName = "console-logs.txt";

    fse.outputFileSync(`${consoleLogsPath}/${fileName}`, jsonString);
  }

  on("task", {
    // @TODO
    saveResource: async ({
      outputFolder,
      fullUrl,
      srcAttribute,
      saveOptions,
    }) => {
      console.log('saving "%s" -> "%s"', fullUrl, srcAttribute);
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
          cdp.on("disconnect", () => {
            debugLog("Chrome Debugging Protocol disconnected");
            writeConsoleLogsToFile();
            const har = harFromMessages(harLogs, {
              includeTextFromResponseBody: true,
            });
            writeHarToFile(har);
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
        fse.outputFileSync(`./logs/test.txt`, obj);
      } catch (err) {
        console.log(`Error saving output file '${obj.fileName}'`, err.message);
      }

      return null;
    },

    saveCommandsOut: (obj) => {
      const blob = JSON.stringify(obj.contents);

      try {
        fse.outputFileSync(`./logs/${obj.fileName}`, blob);
      } catch (err) {
        console.log(`Error saving output file '${obj.fileName}'`, err.message);
      }

      return null;
    },
    saveCypressOutput: (obj) => {
      const blob = JSON.stringify(obj.contents);

      try {
        fse.outputFileSync(`./logs/${obj.fileName}`, blob);
      } catch (err) {
        console.log(`Error saving output file '${obj.fileName}'`, err.message);
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
    saveScreenshots: () => {
      // Write the JSON to a file
      const screenshotsPath = "./logs/screenshots";

      for (const image of images) {
        fse.outputFileSync(
          `${screenshotsPath}/${image.timestamp}.png`,
          image.content,
          "base64"
        );
      }
      return null;
    },
    cropScreenshots: () => {
      const cropConfig = { width: 820, height: 630, top: 0, left: 450 };

      const dir = "./logs/screenshots/";
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        PNGCrop.crop(
          "./logs/screenshots/" + file,
          "./logs/screenshots/" + file,
          cropConfig,
          function (err) {
            if (err) throw new Error("Failed to crop screenshots");
          }
        );
      });
      return null;
    },
  });

  // Load the chrome options inside the event
  on("before:browser:launch", browserLaunchHandler);

  async function uploadFilesToS3() {
    const logsFolder =
      reporterOptions.executeFrom === "lambda"
        ? `/tmp/cypress/logs/`
        : `./logs`;
    const videosFolder =
      reporterOptions.executeFrom === "lambda"
        ? `/tmp/cypress/cypress/videos/`
        : `./cypress/videos/`;

    if (reporterOptions.uploadResultsToS3 === true) {
      await sendFilesToS3(
        videosFolder,
        `s3://${reporterOptions.s3BucketName}/${reporterOptions.customResultsPath}${reporterOptions.runId}/${reporterOptions.requestId}/video`
      );
      await sendFilesToS3(
        logsFolder,
        `s3://${reporterOptions.s3BucketName}/${reporterOptions.customResultsPath}${reporterOptions.runId}/${reporterOptions.requestId}`
      );

      async function sendFilesToS3(localPath, s3Path) {
        const s3Client = new S3Client({ region: process.env.REGION });
        const { sync } = new S3SyncClient({ client: s3Client });
        try {
          console.log(`Begin syncing local files from ${localPath}`);
          await sync(localPath, s3Path);
          console.log(`Finish syncing ${localPath} folder`);
        } catch (error) {
          console.log("Failed to sync files", error);
        }
      }
    }
  }
  on("after:run", async (attributes) => {
    const blob = JSON.stringify(attributes);
    try {
      fse.outputFileSync("./logs/cypress/results.json", blob);
    } catch (err) {
      console.log("Error saving cypress durartion", err.message);
    }
    try {
      await uploadFilesToS3();
    } catch (err) {
      console.log("Error uploading files to s3", err.message);
    }
  });
};

module.exports = {
  install,
};
