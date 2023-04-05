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

before(() => {
  cy.connectToCDP().wait(100);
  cy.task("screenshot");
});

beforeEach(() => {
  resetData();
  cy.task("clearReporterData");
  cy.task("startScreenshots");
  cy.task("generateRequestId").then((id) => {
    requestId = id;
    testsCount++;
    testsMap.push({
      requestId: requestId,
      testSequence: testsCount,
      spec: { file: Cypress.spec, test: Cypress.currentTest },
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
let requestId;
let testsCount = 0;

function resetData() {
  firstVisit = true;
  firstVisitUrl;
  cypressCommands = [];
  snapshotsMapArray = [];
  snapshotMetaDataArray = [];
  snapshotID = 0;
  subjectObj = {};
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
  subjectObj = grabInteractedElements(attributes, commandsForSnapshots) || {};
  if (commandsForSnapshots.includes(attributes.name)) {
    updateSnapshotState();
  }
});

Cypress.on("log:changed", async (options) => {
  if (
    options.state !== "pending" &&
    options.name !== "task" &&
    options.name !== "wait" &&
    !logsAlreadyExecuted.includes(options.id)
  ) {
    logsAlreadyExecuted.push(options.id);

    const propsToDelete = [
      "viewportHeight",
      "viewportWidth",
      "subject",
      "snapshots",
      "snapshot",
      "chainerId",
      "renderProps",
      "highlightAttr",
      "numElements",
      "visible",
      "consoleProps",
      "$el",
      "testCurrentRetry",
      "hookId",
      "testId",
      "groupLevel",
      "coords",
    ];

    propsToDelete.forEach((element) => {
      if (options.hasOwnProperty(element)) {
        delete options[element];
      }
    });

    if (!options.hasOwnProperty("displayName")) {
      cypressCommands.push({
        options,
      });
    }
  }
});

afterEach(() => {
  cy.task("pauseScreenshots");

  cypressCommands = sortArrayByTimestamp(cypressCommands);
  if (snapshotsMapArray.length > 0) {
    mapSnapshotID(cypressCommands, snapshotsMapArray);
  }
  cy.task("saveCypressOutput", {
    contents: cypressCommands,
    fileName: "cypress/out.json",
    folderName: requestId,
  });
  cy.task("saveCypressOutput", {
    contents: snapshotMetaDataArray,
    fileName: "snapshots/snapshot-metadata.json",
    folderName: requestId,
  });
  cy.task("saveScreenshots", requestId);
  cy.task("writeConsoleLogsToFile", requestId);
  cy.task("writeHarToFile", requestId);
  cy.task("cropScreenshots", requestId);
});

after(() => {
  cy.task("writeTestsMapToFile", testsMap);
});
