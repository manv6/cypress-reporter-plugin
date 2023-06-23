// Holds all the implementation for the reporter data events gathering

function getHTML() {
  const $html = Cypress.$("html");
  return $html;
}

function serializeData(data) {
  let s = new XMLSerializer();
  let str = s.serializeToString(data);
  return str;
}

function sortArrayByTimestamp(arrayToSort) {
  return arrayToSort.sort((x, y) => {
    return (
      new Date(x.options.wallClockStartedAt) -
      new Date(y.options.wallClockStartedAt)
    );
  });
}

function updateSnapshotState() {
  // Push the inputs snapshot state for inputs
  for (const elem of Cypress.$("input")) {
    elem.setAttribute("data-otf-value", elem.value);
  }
  // Push the inputs snapshot state for textareas
  for (const elem of Cypress.$("textarea")) {
    elem.setAttribute("data-otf-value", elem.value);
  }
}

function grabInteractedElements(options, commandsForSnapshots) {
  // Grab and convert the targeted elements
  if (commandsForSnapshots.includes(options.name) && options.name !== "visit") {
    const convert = require("xml-js");
    let subjectsArray = [];
    for (const element of options.subject) {
      subjectsArray.push(
        convert.xml2json(serializeData(element), { compact: true })
      );
    }
    // The arguments passed from the user to the command
    let inputArgs = options.hasOwnProperty("args") ? options.args : [];
    // The selector used to search the elements
    let selector = options.subject.hasOwnProperty("selector")
      ? options.subject.selector
      : null;
    return { inputArgs, selector, foundElements: subjectsArray };
  }
}

function mapSnapshotID(cypressLogOutput, snapshotIdsArray) {
  let pointer = 1;
  for (const logOut of cypressLogOutput) {
    let snapshotID;

    switch (true) {
      case snapshotIdsArray[pointer] !== undefined &&
        logOut.options.name === snapshotIdsArray[pointer].name:
        snapshotID = snapshotIdsArray[pointer].snapshotID;
        pointer++;
        break;
      default:
        snapshotID = snapshotIdsArray[pointer - 1].snapshotID;
        break;
    }

    logOut.options["snapshotID"] = snapshotID;
  }
}

function updateLastSnapshotProperties(arrayOfChanges, snapshotMetaDataArray) {
  arrayOfChanges.forEach((change) => {
    snapshotMetaDataArray[snapshotMetaDataArray.length - 1][
      change.propertyName
    ] = change.value;
  });
}

function generateSnapMetaData(
  options,
  beforeBody = null,
  afterBody = null,
  commandsForSnapshots,
  snapshotMetaDataArray,
  snapshotsMapArray,
  snapshotID,
  firstVisit = true
) {
  let data = {};
  let metaData = {};

  // Grab the first ever visited url in case baseUrl is not specified
  if (options.name === "visit" && firstVisit) {
    metaData.firstVisit = false;
    metaData.firstVisitUrl = options.args[0];
  }

  if (commandsForSnapshots.includes(options.name)) {
    snapshotID++;
    data = {
      snapshotID,
      name: options.name,
      beforeBody: beforeBody,
      afterBody: afterBody,
    };
    snapshotMetaDataArray.push(data);
    snapshotsMapArray.push({
      name: options.name,
      snapshotID,
    });
  }
  return { data, metaData };
}

const isRelative = (src) =>
  src && (src.startsWith("/") || src.startsWith("./"));

function formatAllResources(html, firstVisitUrl) {
  const alreadySaved = {};
  // Base url might not be available. Fall back to the first ever visited url
  let baseUrl = Cypress.config("baseUrl") || firstVisitUrl;
  // If the link matches a URL, then assume that URL is a third party and add https
  let testFinal = html
    .replace(/src="\/\//g, 'src="https://')
    .replace(/href="\/\//g, 'href="https://');

  testFinal = testFinal
    .replace(/src="\//g, `src="${baseUrl}`)
    .replace(/href="\//g, `href="${baseUrl}`);

  testFinal = testFinal.replace(/<noscript>[\s\S]*?<\/noscript>/gm, "");

  // Leave the current urls's as they are (absolute on the base url).
  const { urls, replaced } = replaceUrls(baseUrl, testFinal);
  // cy.wrap(urls, { log: false });
  urls.forEach((fullUrl) => {
    const relativeUrl = fullUrl.replace(baseUrl, ".");
    // console.log("RElativeURL: ", relativeUrl);
    // cy.task(
    //   "saveResource",
    //   {
    //     outputFolder,
    //     fullUrl,
    //     srcAttribute: relativeUrl,
    //     saveOptions: saveOptions,
    //   },
    //   { log: false }
    // );
  });

  Cypress.$(testFinal)
    .find("img")
    .each(function (k, img) {
      const imageSource =
        img.getAttribute("src") || img.getAttribute("data-src");
      if (isRelative(imageSource)) {
        if (imageSource.startsWith("//")) {
          // not a relative resource, but assume external HTTPs resource
          img.setAttribute("src", `https:${imageSource}`);
          return;
        }

        if (alreadySaved[imageSource]) {
          return;
        }

        alreadySaved[imageSource] = true;
        const fullUrl = img.currentSrc || img.src;
        // cy.task(
        //   "saveResource",
        //   {
        //     outputFolder,
        //     fullUrl,
        //     srcAttribute: imageSource,
        //     saveOptions: saveOptions,
        //   },
        //   { log: false }
        // );
      }
    });
  return testFinal;
}

function replaceUrls(baseUrl, style) {
  // all found matched urls
  const urls = [];
  const replaced = style.replace(
    /url\('(?:ftp|http|https):\/\/[^ "]+'\)/g,
    (...match) => {
      if (match[0]) {
        if (match[0].includes(baseUrl)) {
          // remove the "url('" prefix and "')" suffix
          const url = match[0].substr(5, match[0].length - 7);
          urls.push(url);
          return match[0].replace(baseUrl, ".");
        } else {
          // keep the original 3rd party domain URL
          return match[0];
        }
      }
    }
  );
  return {
    urls,
    replaced,
  };
}

const circularReplacer = () => {
  
  // Creating new WeakSet to keep 
  // track of previously seen objects
  const seen = new WeakSet();
    
  return (key, value) => {

      // If type of value is an 
      // object or value is null
      if (typeof(value) === "object" 
                && value !== null) {
        
      // If it has been seen before
      if (seen.has(value)) {
               return 'Object';
           }
             
           // Add current value to the set
           seen.add(value);
     }
       
     // return the value
     return value;
 };
};

module.exports = {
  getHTML,
  replaceUrls,
  serializeData,
  mapSnapshotID,
  formatAllResources,
  updateSnapshotState,
  sortArrayByTimestamp,
  generateSnapMetaData,
  grabInteractedElements,
  updateLastSnapshotProperties,
  circularReplacer
};
