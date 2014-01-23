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
node ./lib/citeServer.js
```

If all is well, you will see:

```
no debugLog
Server running at http://127.0.0.1:8085/
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
  <div class="csl-entry">Bennett, Frank G., Jr. “Getting Property Right: ‘Informal’ Mortgages in
    the Japanese Courts.” <i>Pacific Rim Law &#38; Policy Journal</i> 18 (2009): 463–509.
    Print.</div>
  <div class="csl-entry"><i>British Columbia Elec. Ry. V. Loach</i>. Vol. 1916. 1915. Print.</div>
  <div class="csl-entry"><i>Clayton Act</i>. 1914. Print.</div>
  <div class="csl-entry">---. Vol. 38. 1914. Print.</div>
  <div class="csl-entry"><i>Donoghue V. Stevenson</i>. Vol. 1932. 1932. Print.</div>
  <div class="csl-entry">D’Arcus, Bruce. <i>Boundaries of Dissent: Protest and State Power in the
    Media Age</i>. New York: Routledge, 2006. Print.</div>
  <div class="csl-entry"><i>FTC Credit Practices Rule</i>. Vol. 16. 1999. Print.</div>
  <div class="csl-entry">Malone, Kemp. <i>Chapters on Chaucer</i>. Baltimore: Johns Hopkins
    Press, 1951. Print.</div>
  <div class="csl-entry">Malone, Nolan J., U.S. Bureau of the Census. <i>Evaluating Components of
    International Migration: Consistency of 2000 Nativity Data</i>. New York: Routledge, 2001.
    Print.</div>
  <div class="csl-entry"><i>People V. Taylor</i>. Vol. 73. 1989. Print.</div>
  <div class="csl-entry">---. Vol. 541. 1989. Print.</div>
  <div class="csl-entry">---. Vol. 543. 1989. Print.</div>
  <div class="csl-entry">Razlogova, Elena. “Radio and Astonishment: The Emergence of Radio Sound,
    1920-1926.” Society for Cinema Studies Annual Meeting. 2002.</div>
  <div class="csl-entry">---. “True Crime Radio and Listener Disenchantment with Network
    Broadcasting, 1935-1946.” <i>American Quarterly</i> 58 (2006): 137–158. Print.</div>
  <div class="csl-entry">Razlogova, Elena, and Lisa Lynch. “The Guantanamobile Project.”
    <i>Vectors</i> 1 (2005): n. pag. Print.</div>
  <div class="csl-entry">Zelle, Rintze M. et al. “Key Process Conditions for Production of
    C<sub>4</sub> Dicarboxylic Acids in Bioreactor Batch Cultures of an Engineered
    <i>Saccharomyces Cerevisiae</i> Strain.” <i>Applied and Environmental Microbiology</i> 76.3
    (2010): 744–750.</div>
  <div class="csl-entry">梶田将司 et al. “高等教育機関における次世代教育学習支援プラットフォームの構築に向けて.”
    <i>日本教育工学会論文誌</i> 31.3 (2007): 297–305. Print.</div>
  <div class="csl-entry"><i>民法</i>. Print.</div>
</div>
```



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

To create a log message at a particular level, just use, for example,

```javascript
log.warn("Uh-oh!");
```

## Invoking the service

The service responds to HTTP `OPTIONS` or `POST` requests only.

When sending a request, various options should be set in the query string of the URL, and
the CSL-JSON data should be sent in the content body.

The following query string parameters are recognized:

* responseformat - One of html, json, ?more.  Default is json.
* bibliography - Default is 1.
* style - Default is 'chicago-author-date'
* locale - Default is "en-US"
* citations - Default is 0.
* outputformat - Default is html.
* memoryUsage - If this is 1, the server will respond with a report of memory
  usage (and nothing else).  Default is 0.
* linkwrap - Default is 0
* clearCache - If this 1, then the server will clear any cached style engines, and
  reread the CSL styles.  This can only be sent from the localhost.  Default is 0

The POST data JSON object can have these members:

* items - either an array or a hash of items

