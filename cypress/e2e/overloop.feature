Feature: Check overloop's website
    Rule: Verify

        @contactpage @all
        Scenario: Contact page
            Given I visit overloop's website
             When I navigate to contact page
              And I fill in contact form details
             Then Validation error for missing fields occurs
