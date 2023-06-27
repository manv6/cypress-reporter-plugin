@settings @outlines
Feature: Overloop Scnerio Outlines
    Scenario Outline: An admin can enter different inputs content of an existing can enter different inputs content of an existing can enter different inputs content of an existing can enter different inputs content of an existing can enter different inputs content of an existing can enter different inputs content of an existing test/non-test data of a different site

        Given I visit overloop's website
        When I navigate to "<page_type>" page
        And I can see the content
        When I fill email "<email>" in contact form details
        Then Validation for wrong email occurs
        When I fill email "<user_brand>" in contact form details
        But Submit button is disabledI fill email admin in contact form details
        When I fill email "<content_brand>" in contact form details
        And Validation error for missing fields occurs
        Examples:
            | email             | page_type | user_brand | content_brand |
            | testoverloop.io   | home      | KNR        | KNR           |
            | awal_admin        | blog      | KNR        | KNR           |
            | knr_admin         | non-admin | AWAL       | AWAL          |
            | test2@overloop.io | admin     | AWAL       | AWAL          |
            #      These admins are orchard brand
            | admin             | non-admin | AWAL       | AWAL          |
            | admin             | admin     | AWAL       | AWAL          |









