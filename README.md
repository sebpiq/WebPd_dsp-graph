See http://puredata.info/docs/developer/PdFileFormat for the Pd file format reference.


Differences with pd specification
------------------------------------

[+~] must support a variable number of inputs

Each input can have only a single source connected to it. 


Scripts
---------



### test

Tests are running with `mocha` and `node-ts`. Simply run with :

```bash
npm test
# or
npm run test-bail
```

`node-ts` has a few quirks, for an explanation of how the command is ran look [there](https://github.com/TypeStrong/ts-node#mocha) and [there](https://github.com/TypeStrong/ts-node#help-my-types-are-missing).