# Testerloop Reporter Plugin for Cypress

Testerloop Reporter Plugin for Cypress is a custom plugin that provides detailed test reports for Cypress test runs.

## How to release

1. Open a new Pull Request and ask for reviews.
2. Once you merge to master:

   - Auto bump will update the version in the package.json file
   - A new release will be created with this new version
   - You must `manually` run the `Build & Publish Testerloop Reporter Package` from the `master` branch
   - A slack notification will be generated in the `testerloop-releases` slack channel

3. Install the latest version of the plugin in your project
