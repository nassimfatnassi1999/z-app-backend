const tsconfigPaths = require('tsconfig-paths');

tsconfigPaths.register({
  baseUrl: process.env.TS_NODE_BASEURL || 'dist',
  paths: {
    '@/*': ['*'],
  },
});
