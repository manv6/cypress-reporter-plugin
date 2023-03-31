let outPutExpectedLengths = {
  outFileCommands: 22,
  snapshotMetadata: 14,
  cypressResults: 1,
  consoleLogs: 42641,
  harLogs: 957900,
};

before(() => {
  Cypress.Screenshot.defaults({
    screenshotOnRunFailure: false,
  });
});

it('Test otf test output files - "out.json"', () => {
  cy.readFile("logs/cypress/out.json").then((contents) => {
    console.log(contents);
    assert.equal(contents.length, outPutExpectedLengths.outFileCommands);
    assert.exists(contents[0].options.name);
    assert.exists(contents[0].options.message);
    assert.exists(contents[0].options.groupStart);
    assert.exists(contents[0].options.type);
    assert.exists(contents[0].options.timeout);
    assert.exists(contents[0].options.event);
    assert.exists(contents[0].options.id);
    assert.exists(contents[0].options.state);
    assert.exists(contents[0].options.instrument);
    assert.exists(contents[0].options.url);
    assert.exists(contents[0].options.wallClockStartedAt);
    assert.exists(contents[0].options.ended);
    assert.exists(contents[0].options.snapshotID);
  });
});

it('Test otf test output files - "snapshot-metadata.json"', () => {
  cy.readFile("logs/snapshots/snapshot-metadata.json").then((contents) => {
    console.log(contents);
    assert.equal(contents.length, outPutExpectedLengths.snapshotMetadata);

    assert.exists(contents[0].snapshotID);
    assert.exists(contents[0].name);
    assert.exists(contents[0].beforeBody);
    assert.exists(contents[0].afterBody);
    assert.exists(contents[0].elements);
    assert.exists(contents[1].elements);
    assert.exists(contents[1].elements.inputArgs);
    assert.exists(contents[1].elements.selector);
    assert.exists(contents[1].elements.foundElements);
  });
});

it('Test otf test output files - "results.json"', () => {
  cy.readFile("logs/cypress/results.json").then((contents) => {
    console.log("length", contents);
    assert.exists(contents.status);
    assert.exists(contents.startedTestsAt);
    assert.exists(contents.endedTestsAt);
    assert.exists(contents.totalSuites);
    assert.exists(contents.totalTests);
    assert.exists(contents.totalPassed);
    assert.exists(contents.totalPending);
    assert.exists(contents.totalFailed);
    assert.exists(contents.totalSkipped);
    assert.exists(contents.runs);
    assert.exists(contents.runs[0].tests[0].title);
    assert.exists(contents.browserPath);
    assert.exists(contents.browserName);
    assert.exists(contents.browserVersion);
    assert.exists(contents.osName);
    assert.exists(contents.osVersion);
    assert.exists(contents.cypressVersion);
  });
});

it('Test otf test output files - "console-logs.txt"', () => {
  cy.readFile("logs/console/console-logs.txt").then((contents) => {
    assert.equal(contents.length, outPutExpectedLengths.consoleLogs);
  });
});

// it('Test otf test output files - "network-events.har"', () => {
//   // cy.readFile("logs/har/network-events.har", { timeout: 30000 }).then(
//   //   (contents) => {
//   //     console.log(contents.length);
//   //     assert.isTrue(contents.length > outPutExpectedLengths.harLogs);
//   //   }
//   // );
// });
