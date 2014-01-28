# citeproc-node

## Dependencies

To run this software, you will need Node.js installed.  It is known to work
with version 0.10.9.  Earlier versions might work.

In addition, these Node modules might or might not need to be installed:

- npmlog


## Setting up a standalone citeproc-node server

### Step 1

Get citeproc-node

```
git clone https://github.com/zotero/citeproc-node.git
cd citeproc-node
```

### Step 2

Fetch CSL 1.0 citation styles to where citeproc-node will find them.  Note
how we specify *csl* as the destination directory.

```
git clone https://github.com/citation-style-language/styles.git csl
```

### Step 3

Get CSL locale files.  These are put into the *csl-locales* subdirectory.

```
git clone https://github.com/citation-style-language/locales.git csl-locales
```

### Step 4

Start the server:

```
node lib/citeServer.js
```

If all is well, you will see:

```
info Server running at http://127.0.0.1:8085
```

However, you might see, instead, the following error:

```
...
Error: Unable to load shared library /blah/blah/contextify.node
...
```

If so, follow the instructions at the top of the error message, which on a
Linux system might read something like this:

```
 To rebuild, go to the Contextify root folder and run
'node-waf distclean && node-waf configure build'.
```

So, do this:

```
cd node_modules/jsdom/node_modules/contextify/
node-waf distclean &&  node-waf configure build
```

If the command gives an error the first time, try it again. If that does
not help, try this while you are still in the contextify directory:

```
cd .. && rm -r contextify
git clone https://github.com/brianmcd/contextify.git
cd contextify && npm rebuild
```

### Step 5

Now to test the server using the sampledata.json file provided in the
citeproc-node sources. Try posting it to your server, from a separate
console:

```
curl --header "Content-type: application/json" \
  --data @sampledata.json -X POST \
  http://127.0.0.1:8085?responseformat=html\&style=modern-language-association
```

You should see a response similar to this:

```html
<div class="csl-bib-body">
  <div class="csl-entry">Abbott, Derek A. et al. “Metabolic Engineering of <i>Saccharomyces
    Cerevisiae</i> for Production of Carboxylic Acids: Current Status and Challenges.” <i>FEMS
    Yeast Research</i> 9.8 (2009): 1123–1136. Print.</div>
  <div class="csl-entry"><i>Beck V. Beck</i>. Vol. 1999. 1999. Print.</div>
  <div class="csl-entry">---. Vol. 733. 1999. Print.</div>
  ...
</div>
```

## Configuration

Configuration parameters are specified in the *citeServerConf.json* file.

## Running the tests

Start citation server

```
node ./lib/citeServer.js
```

Run a test with all independent styles in the csl directory:

```
node ./test/benchServer.js --duration=3000 --maxtotalrequests=1000 --testAllStyles=true
```


## Included libraries

### csl

Included as a Git submodule.

### csl-locales

Included as a Git submodule.

### citeproc-js

This software includes the bundled JavaScript library from
[citeproc-js](https://bitbucket.org/fbennett/citeproc-js), as the module
*lib/citeprocmodule.js*.  To see the version number of that library, check
in that module for "PROCESSOR_VERSION".  As of the time of this writing,
the version used is 1.0.517.

### csl_nodejs_jsdom.js

This module, in the *lib* directory, seems to originally be from
[here](https://github.com/citation-style-editor/csl-editor/blob/master/exampleCitationsGenerator/csl_nodejs_jsdom.js).


## Logging

We're using npmlog, which has these levels defined:

- silly   -Infinity
- verbose 1000
- info    2000
- http    3000
- warn    4000
- error   5000
- silent  Infinity

The level at which the server runs is specified in the config file, as the
`logLevel` parameter.

In the code, to create a log message at a particular level, for example,

```javascript
log.warn("Uh-oh!");
```

## Using the web service

The service responds to HTTP `OPTIONS` or `POST` requests only.

When sending a request, various options should be set in the query string of the URL, and
the CSL-JSON data should be sent in the content body.

The following query string parameters are recognized:

* responseformat - One of `html`, `json` (others?).  Default is `json`.
* bibliography - Default is `1`.
* style - This is a URL or a name of a CSL style.  Default is `chicago-author-date`.
* locale - Default is `en-US`
* citations - Default is `0`.
* outputformat - Default is `html`.
* memoryUsage - If this is `1`, the server will respond with a report of memory
  usage (and nothing else).  Default is `0`.
* linkwrap - Default is `0`
* clearCache - If this `1`, then the server will clear any cached style engines, and
  reread the CSL styles.  This can only be sent from the localhost.  Default is `0`.

The POST data JSON object can have these members:

* items - either an array or a hash of items
* itemIDs - an array of identifiers of those items to convert.  If this is not
  given, the default is to convert all of the items.
* citationClusters
* styleXml - a CSL style to use

