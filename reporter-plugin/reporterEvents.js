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
      Cypress.env("TL_EXECUTE_FROM"),
      Cypress.env("TL_S3_BUCKET_NAME"),
      Cypress.env("TL_CUSTOM_RESULTS_PATH"),
      Cypress.env("TL_UPLOAD_RESULTS_TO_S3"),
    ]);
    cy.connectToCDP().wait(100);
    cy.task("screenshot");
  });

  beforeEach(() => {
    resetData();
    cy.task("clearReporterData");
    cy.task("startScreenshots");
    cy.task("generateTlTestId").then((id) => {
      tlTestId = id;
      testsCount++;
      testsMap.push({
        tlTestId: tlTestId,
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
  let tlTestId;
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
    if (!firstVisit) {
      subjectObj =
        grabInteractedElements(attributes, commandsForSnapshots) || {};
      if (commandsForSnapshots.includes(attributes.name)) {
        updateSnapshotState();
      }
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
  });

  after(() => {
    cy.task("writeTestsMapToFile", testsMap);
  });
}
