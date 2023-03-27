// Holds all the internal custom otf commands

function connectToCDP() {
  return cy.task("connect").then((result) => {
    return result;
  });
}

Cypress.Commands.add("connectToCDP", connectToCDP);
