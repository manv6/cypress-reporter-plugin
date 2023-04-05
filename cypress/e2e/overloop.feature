Feature: Check overloop's website
    Rule: Verify

        @homepage @all
        Scenario: Home Page
            Given I visit overloop's website
             When I navigate to home page
             Then I can see the content

        @contactpage @all
        Scenario: Contact page
            Given I visit overloop's website
             When I navigate to contact page
              And I fill in contact form details
             Then Validation error for missing fields occurs


        @contactpage @all
        Scenario: Contact page 2
            Given I visit overloop's website
             When I navigate to contact page
              And I fill in contact form details
             Then Validation error for missing fields occurs

        @contactpage @all
        Scenario: Contact page again
            Given I visit overloop's website
             When I navigate to contact page
              And I fill in contact form details
             Then Validation error for missing fields occurs

        @homepage @all
        Scenario Outline: Home Page - Enter different emails
            Given I visit overloop's website
             When I navigate to home page
              And I can see the content
             When I fill email "<email>" in contact form details
             Then Validation for wrong email occurs
              But Submit button is disabled
              And Validation error for missing fields occurs

        Examples:
                  | email           |
                  | testoverloop.io |
                  | test@com        |

