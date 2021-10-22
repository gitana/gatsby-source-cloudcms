# gatsby-source-cloudcms

Source plugin for adding your cloudcms content and attachments into your Gatsby.js site

## Install

```
npm install gatsby-source-cloudcms
or
yarn add gatsby-source-cloudcms
```

## Usage

```js
// In your gatsby-config.js
const gitanaJson = require('gitana.json');

module.exports = {
  plugins: [
    {
      resolve: require.resolve(`/Users/mwhitman/projects/cloudcms-gatsby`),
      options: {
        keys: gitanaJson,
        repositoryId: `myRepositoryId`,
        branchId: `myBranchId`
      }
    }
  ]
}
```

Note that you will need to provide [API Keys](https://www.cloudcms.com/documentation/apikeys.html) to cloudcms, as well as a
`repositoryId` and `branchId` ([Help](https://support.cloudcms.com/hc/en-us/articles/360005276393-How-to-find-the-Repository-ID-for-a-Project-)). 

You can additionally provide a `contentQuery` to options with MongoDB syntax to specify what subset of your content to source. 
For example, if my site only contained content of type `store:book` and `store:author`, I could use the following `contentQuery`:

```
{
    "_type": {
        "$in": ["store:book", "store:author"]
    }
}
```

[More on queries](https://www.cloudcms.com/documentation/query.html)

[Example CloudCMS Gatsby Site](https://github.com/gitana/sdk/tree/master/gatsbyjs/sample)