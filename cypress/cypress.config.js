const { defineConfig } = require("cypress");
const preprocessor = require("@badeball/cypress-cucumber-preprocessor");
const browserify = require("@badeball/cypress-cucumber-preprocessor/browserify");
const { install } = require("../index");

async function setupNodeEvents(on, config) {
  await preprocessor.addCucumberPreprocessorPlugin(on, config);
  on("file:preprocessor", browserify.default(config));
  install(on, {
    executeFrom: "local",
    uploadResultsToS3: true,
    s3BucketName: "otf-lambda-results",
    customResultsPath: "custom/results/",
  });

  return on, config;
}
module.exports = defineConfig({
  projectId: "eh6mxr",
  videoCompression: 20,
  e2e: {
    supportFile: "./support/e2e.{js,jsx,ts,tsx}",
    specPattern: [
      "e2e/**/*.feature",
      "e2e/**/*.spec.js",
      "regression/**/*.spec.js",
    ],
    setupNodeEvents,
  },
});
