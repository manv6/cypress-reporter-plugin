it("Check overloop contact details page", () => {
  cy.visit("https://overloop.io/");
  cy.get(".Header-nav-item").contains("Contact").click();
  cy.get('input[name="fname"]').type("testName");
  cy.get('input[name="lname"]').type("testLastName");
  cy.get('input[name="email"]').type("this_is_a_test@overloop.io");
  cy.contains("Submit").click();
  cy.get(".field-error").should("be.visible");
  cy.contains("Submit").should("be.disabled");
});

it("Check overloop contact details page A", () => {
  cy.visit("https://overloop.io/");
  cy.get(".Header-nav-item").contains("Contact").click();
  cy.get('input[name="fname"]').type("testName");
  cy.get('input[name="lname"]').type("testLastName");
  cy.get('input[name="email"]').type("this_is_a_test@overloop.io");
  cy.contains("Submit").click();
  cy.get(".field-error").should("be.visible");
  cy.contains("Submit").should("be.disabled");
});

it("Check overloop contact details page", () => {
  cy.visit("https://overloop.io/");
  cy.get(".Header-nav-item").contains("Contact").click();
  cy.get('input[name="fname"]').type("testName");
  cy.get('input[name="lname"]').type("testLastName");
  cy.get('input[name="email"]').type("this_is_a_test@overloop.io");
  cy.contains("Submit").click();
  cy.get(".field-error").should("be.visible");
  cy.contains("Submit").should("be.disabled");
});

it("My awesome test", () => {
  cy.visit("https://overloop.io/");
  cy.get(".Header-nav-item").contains("Contact").click();
  cy.get('input[name="fname"]').type("testName");
  cy.get('input[name="lname"]').type("testLastName");
  cy.get('input[name="email"]').type("this_is_a_test@overloop.io");
  cy.contains("Submit").click();
  cy.get(".field-error").should("be.visible");
  cy.contains("Submit").should("be.disabled");
});
