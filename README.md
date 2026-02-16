# citeproc-js-server

citeproc-js-server is a Node-based server that generates citations and bibliographies using [citeproc.js](https://github.com/Juris-M/citeproc-js).

For optimal performance, you should maintain separate directories with JSON styles/locales.
This can be done by running the included xmltojson.py:

```
./xmltojson.py ./csl ./csljson
./xmltojson.py ./csl-locales ./csljson-locales
```

Or only those updated within the last 5 minutes:

```
xmltojson.py --changed 300 ./csl ./csljson
xmltojson.py --changed 300 ./csl-locales ./csljson-locales
```

And point `cslPath` and `localesPath` in config/local.json to point to the json directories.

Also note that the citation server automatically watches the style and locale directories
to automatically use the new versions when they're pulled. This is subject to [platform
caveats](https://nodejs.org/api/fs.html#fs_caveats)

## Setting up citeproc-js-server using docker

With docker running the citeproc-js-server is easy. Just execute the command

```
docker run -d -p 8085:8085 <INSERT-OFFICIAL-NAME>
```

## Setting up citeproc-js-server

### Step 1

Get citeproc-js-server

```
git clone --recurse-submodules https://github.com/zotero/citeproc-js-server.git
cd citeproc-js-server
npm install
```

### Step 2

Start the server:

```
npm start
```

If all is well, you will see:

```
info Server running at http://127.0.0.1:8085
```

## Test your citeproc-js-server

Now to test the server using the sampledata.json file provided in the
citeproc-js-server sources. Try posting it to your server, from a separate
console:

```
curl --header "Content-type: application/json" \
  --data @sampledata.json -X POST \
  'http://127.0.0.1:8085?responseformat=html&style=modern-language-association'
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

citeproc-js-server uses [node-config](https://github.com/lorenwest/node-config) for configuration. Configuration parameters can be specified in config/local.json or other files and formats supported by node-config.

citeproc-js-server now supports CSL styles that has been converted to JSON.
This improves performance significantly on style initialization, and somewhat on style execution
over the JSDOM XML parsing mode. Local styles can be converted ahead of time, which improves performance even futher. Otherwise both local and remote styles will be converted at run time.

There is a Python script, xmltojson.py, to convert a single file or a directory, including
the option to only convert files that have been modified within a specified time limit, to better handle periodic pulling of style/locale changes.
To use pre-converted json styles, just point the `cslPath` preference at the directory of converted styles.

## Running the tests

Start citation server

```
npm start
```

Run a test with all independent styles in the csl directory:

```
node ./test/testallstyles.js
```

## Using the web service

The service responds to HTTP `OPTIONS` or `POST` requests only.

When sending a request, various options should be set in the query string of the URL, and
the CSL-JSON data should be sent in the content body.

The following query string parameters are recognized:

* responseformat - One of `html`, `json`, or `rtf`
  (value is passed through to citeproc.js). Default is `json`.
* bibliography - Default is `1`.
* style - This is a URL or a name of a CSL style.  Default is `chicago-author-date`.
* locale - Default is `en-US`
* citations - Default is `0`.
* outputformat - Default is `html`.
* memoryUsage - If this is `1`, and the server has debug enabled, the server will respond
with a report of memory usage (and nothing else).  Default is `0`.
* linkwrap - Default is `0`
* clearCache - If this `1`, then the server will clear any cached style engines, and
  reread the CSL styles.  This can only be sent from the localhost.  Default is `0`.

The POST data JSON object can have these members:

* items - either an array or a hash of items
* itemIDs - an array of identifiers of those items to convert.  If this is not
  given, the default is to convert all of the items.
* citationClusters
* styleXML - a CSL style to use


## Included libraries

### csl

CSL citation styles, included as a Git submodule

### csl-locales

CSL locales, included as a Git submodule

### citeproc-js

The [citeproc-js citation processor](https://github.com/Juris-M/citeproc-js)

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
