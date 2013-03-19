# citeproc-node

## install

> git clone --recursive git://github.com/zotero/citeproc-node.git

> npm rebuild

(rebuild step probably isn't necessary, but won't hurt)

## usage

(from top level directory)

start citation server

> node ./lib/citeServer.js

Run a test with all independent styles in the csl directory:

> node ./test/benchServer.js --duration=3000 --maxtotalrequests=1000 --testAllStyles=true

