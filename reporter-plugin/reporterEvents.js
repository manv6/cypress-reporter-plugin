// Used to gather all the reporter information from cypress emitted events
// Connects to CDP on before hook
// Writes the commands and snapshot information on the after hook

const {
  getHTML,
  serializeData,
  mapSnapshotID,
  formatAllResources,
  updateSnapshotState,
  sortArrayByTimestamp,
  generateSnapMetaData,
  grabInteractedElements,
  updateLastSnapshotProperties,
} = require("./reporterFunctions");
if (Cypress.env("TL_RUN_ID") != null) {
  before(() => {
    cy.task("getReporterOptions", [
      Cypress.env("TL_RUN_ID"),
      Cypress.env("TL_TEST_ID"),
      'ECS',
      'qa-orcd-cypress-tests',
      'testerloop-results',
      true,
      'us-east-1',
      false,
    ]);
    cy.connectToCDP().wait(100);
    cy.task("screenshot");
  });

  beforeEach(() => {
    resetData();
    testStartTime = new Date().toISOString();
    cy.task("clearReporterData");
    cy.task("startScreenshots");
    cy.task("generateTlTestId").then((id) => {
      tlTestId = id;
      testsMap.push({
        tlTestId: tlTestId,
        startedTestsAt: testStartTime,
        endedTestsAt: testEndTime,
        spec: { file: Cypress.spec, test: Cypress.currentTest },
        browserVersion: Cypress.browser.version,
      });
    });
  });

  Cypress.on("uncaught:exception", (err, runnable) => {
    // returning false here prevents Cypress from
    // failing the test
    return false;
  });

  // Some logs appear to be pushed to the output twice. Clear them
  let logsAlreadyExecuted = [];
  let commandsForSnapshots = [
    "type",
    "click",
    "get",
    "contains",
    "assert",
    "visit",
    "eq",
  ];

  let firstVisit = true;
  let firstVisitUrl;
  let cypressCommands = [];
  let snapshotsMapArray = [];
  let snapshotMetaDataArray = [];
  let testsMap = [];
  let snapshotID = 0;
  let subjectObj = {};
  let tlTestId;
  let testStartTime, testEndTime;

  function resetData() {
    firstVisit = true;
    firstVisitUrl;
    cypressCommands = [];
    snapshotsMapArray = [];
    snapshotMetaDataArray = [];
    snapshotID = 0;
    subjectObj = {};
    testStartTime = 0;
    testEndTime = 0;
  }

  Cypress.on("command:start", ({ attributes }) => {
    // Grab the latest snapshot
    let currentState = getHTML();

    // Update the previous snapshot with the new html code for the afterBody
    // and the elements interacted in the previous action/command
    if (snapshotMetaDataArray.length > 0) {
      updateLastSnapshotProperties(
        [
          {
            propertyName: "afterBody",
            value: formatAllResources(
              serializeData(currentState[0]),
              firstVisitUrl
            ),
          },
          { propertyName: "elements", value: subjectObj },
        ],
        snapshotMetaDataArray
      );
    }
    // Create the snapshot metadata entry
    const { data, metaData } = generateSnapMetaData(
      attributes,
      formatAllResources(serializeData(currentState[0]), firstVisitUrl),
      null,
      commandsForSnapshots,
      snapshotMetaDataArray,
      snapshotsMapArray,
      snapshotID,
      firstVisit
    );
    snapshotID = data.snapshotID || snapshotID;
    firstVisit = metaData.firstVisit || firstVisit;
    firstVisitUrl = metaData.firstVisitUrl || firstVisitUrl;
  });

  Cypress.on("command:end", ({ attributes }) => {
    if (!firstVisit) {
      subjectObj =
        grabInteractedElements(attributes, commandsForSnapshots) || {};
      if (commandsForSnapshots.includes(attributes.name)) {
        updateSnapshotState();
      }
    }
  });

  const filteredTasks = [
    "addTestMapping",
    "cropScreenshots",
    "writeHarToFile",
    "writeConsoleLogsToFile",
    "saveScreenshots",
    "pauseScreenshots",
    "saveCypressOutput",
    "generateTlTestId",
    "startScreenshots",
    "clearReporterData",
    "screenshot",
    "connect",
    "getReporterOptions",
  ];

  Cypress.on("log:changed", async (options) => {
    if (
      options.state !== "pending" &&
      !filteredTasks.includes(options.message) &&
      !filteredTasks.includes(options.message?.split(", ")[0]) &&
      options.name !== "wait" &&
      !logsAlreadyExecuted.includes(options.id)
    ) {
      logsAlreadyExecuted.push(options.id);

      const propsToKeep = [
        "name",
        "message",
        "groupStart",
        "type",
        "timeout",
        "event",
        "id",
        "state",
        "instrument",
        "url",
        "wallClockStartedAt",
        "ended",
        "group",
        "err",
      ];

      const errPropsToDelete = ["parsedStack", "docsUrl", "isRecovered"];

      for (const prop in options) {
        if (!propsToKeep.includes(prop)) {
          delete options[prop];
        }
        // Remove the parsedStack property from err because it is creating issues with circular reference in Sony
        if (prop === "err") {
          for (const properties in options[prop]) {
            if (errPropsToDelete.includes(properties)) {
              delete options[prop][properties];
            }
          }
        }
      }

      if (!options.hasOwnProperty("displayName")) {
        cypressCommands.push({
          options,
        });
      }
    }
  });

  afterEach(() => {
    cy.task("pauseScreenshots");
    testEndTime = new Date().toISOString();
    cypressCommands = sortArrayByTimestamp(cypressCommands);
    if (snapshotsMapArray.length > 0) {
      mapSnapshotID(cypressCommands, snapshotsMapArray);
    }

    cy.task("saveCypressOutput", {
      contents: cypressCommands,
      fileName: "cypress/out.json",
      folderName: tlTestId,
    });
    cy.task("saveCypressOutput", {
      contents: snapshotMetaDataArray,
      fileName: "snapshots/snapshot-metadata.json",
      folderName: tlTestId,
    });
    cy.task("saveScreenshots", tlTestId);
    cy.task("writeConsoleLogsToFile", tlTestId);
    cy.task("writeHarToFile", tlTestId);
    cy.task("cropScreenshots", tlTestId);
    //update the test map with the results
    testsMap[testsMap.length - 1].endedTestsAt = testEndTime;
    cy.task("addTestMapping", testsMap[testsMap.length - 1]);
  });
}
