let outPutExpectedLengths = {
  outFileCommands: 20,
  snapshotMetadata: 12,
  cypressResults: 1,
  consoleLogs: 20,
  harLogs: 957900,
};

before(() => {
  Cypress.Screenshot.defaults({
    screenshotOnRunFailure: false,
  });
});

it('Test otf test output files - "out.json"', () => {
  cy.readFile("logs/123/123/cypress/out.json").then((contents) => {
    console.log(contents);
    assert.equal(contents.length, outPutExpectedLengths.outFileCommands);
    assert.exists(contents[0].options.name);
    assert.exists(contents[0].options.message);
    assert.exists(contents[0].options.groupStart);
    assert.exists(contents[1].options.group);
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
  cy.readFile("logs/123/123/snapshots/snapshot-metadata.json").then(
    (contents) => {
      console.log(contents);
      assert.equal(contents.length, outPutExpectedLengths.snapshotMetadata);

      assert.exists(contents[0].snapshotID);
      assert.exists(contents[0].name);
      assert.exists(contents[0].beforeBody);
      assert.exists(contents[0].afterBody);
      assert.exists(contents[0].elements);
      assert.exists(contents[1].elements);
      // assert.exists(contents[1].elements.inputArgs);
      // assert.exists(contents[1].elements.selector);
      // assert.exists(contents[1].elements.foundElements);
    }
  );
});

it('Test otf test output files - "results.json"', () => {
  cy.readFile("logs/123/123/cypress/results.json").then((contents) => {
    console.log("length", contents);
    assert.exists(contents.status);
    assert.exists(contents.startedTestsAt);
    assert.exists(contents.endedTestsAt);
    assert.exists(contents.runs);
    assert.exists(contents.runs[0].tests[0].title);
    assert.exists(contents.browserVersion);
  });
});

it('Test otf test output files - "console-logs.json"', () => {
  cy.readFile("logs/123/123/console/console-logs.json").then((contents) => {
    assert.equal(contents.length, outPutExpectedLengths.consoleLogs);
    assert.exists(contents[0].id);
    assert.exists(contents[0].type);
    assert.exists(contents[0].args);
    assert.exists(contents[0].args[0].type);
    assert.exists(contents[0].args[0].value);
    assert.exists(contents[0].timestamp);
    assert.exists(contents[0].stackTrace);
    assert.exists(contents[0].stackTrace.callFrames);
    assert.exists(contents[0].stackTrace.callFrames[0].functionName);
    assert.exists(contents[0].stackTrace.callFrames[0].url);
  });
});

it('Test otf test output files - "cypressResults.json"', () => {
  cy.task("downloads", "logs/123/results/").then((files) => {
    console.log("FILES: ", files);
    cy.readFile("logs/123/results/" + files[0]).then((contents) => {
      assert.exists(contents.stats);
      assert.exists(contents.reporter);
      assert.exists(contents.reporterStats);
      assert.exists(contents.hooks);
      assert.exists(contents.tests[0]);
      assert.exists(contents.tests[0].testId);
      assert(contents.error === null, "Error should be null");
      assert(contents.video === null, "Video should be null");
      assert.exists(contents.screenshots[0]);
      assert.exists(contents.spec);
    });
  });
});

it('Test otf test output files - "testResults.json"', () => {
  cy.task("downloads", "logs/123/results/").then((files) => {
    console.log("FILES: ", files);
    cy.readFile("logs/123/results/" + files[1]).then((contents) => {
      assert.exists(contents[0].testId);
      assert.exists(contents[0].title);
      assert.exists(contents[0].titlePath);
      assert.exists(contents[0].status);
      assert.exists(contents[0].pathToTest);
      assert.exists(contents[0].startedTestsAt);
      assert.exists(contents[0].endedTestsAt);
    });
  });
});

it('Test otf test output files - "network-events.har"', () => {
  cy.readFile("logs/123/123/har/network-events.har", { timeout: 30000 }).then(
    (contents) => {
      console.log(contents.length);
      assert.isTrue(contents.length > outPutExpectedLengths.harLogs);
    }
  );
});
