Feature: Check overloop's website
    Rule: Verify

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

