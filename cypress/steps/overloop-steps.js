import { Given, When, Then } from "@badeball/cypress-cucumber-preprocessor";

Given(/I visit overloop's website/, () => {
  cy.visit("https://overloop.io/");
});

When(/I navigate to (.*) page/, (page) => {
  switch (page) {
    case "home":
      cy.get(".Header-nav-item").contains("Home").click();
      break;
    case "blog":
      cy.get(".Header-nav-item").contains("Blog").click();
      break;
    case "careers":
      cy.get(".Header-nav-item").contains("Careers").click();
      break;
    case "contact":
      cy.get(".Header-nav-item").contains("Contact").click();
      break;
    default:
      break;
  }
});

When(/I fill in contact form details/, () => {
  cy.get('input[name="fname"]').type("testName");
  cy.get('input[name="lname"]').type("testLastName");
  cy.get('input[name="email"]').type("this_is_a_test@overloop.io");
  cy.contains("Submit").click();
});

When("I fill email {string} in contact form details", (email) => {
  cy.get('input[name="fname"]').type("testName");
  cy.get('input[name="lname"]').type("testLastName");
  cy.get('input[name="email"]').type(email);
  cy.contains("Submit").click();
});

Then(/Validation error for missing fields occurs/, () => {
  cy.get(".field-error").should("be.visible");
  cy.contains("Submit").should("be.disabled");
});

Then(/I can see the content/, () => {
  cy.get(".Site-inner").should("be.visible");
  cy.get(".Header").should("be.visible");
  cy.get(".Footer").should("be.visible");
});

Then(/Validation for wrong email occurs/, () => {
  cy.contains(
    "Email is not valid. Email addresses should follow the format user@domain.com."
  ).should("be.visible");
});

Then(/Submit button is disabled/, () => {
  cy.contains("Submit").should("be.disabled");
});
