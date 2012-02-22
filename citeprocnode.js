//var util = require("util");
var fs = require('fs');
var CSL = require("./citeprocmodule").CSL;
//var zotero = require("./zoteronode").zotero;
var jsdom = require('jsdom');

var citeprocnode = {};

citeprocnode.createEngine = function(sys, style, lang, forceLang){
    var CSL_NODEJS = require("./csl_nodejs_jsdom").CSL_NODEJS_JSDOM;
    var xmlParsing = new CSL_NODEJS();
    var CSL = require("./citeprocmodule").CSL;
    var citeproc = new CSL.Engine(sys, style, lang, forceLang);
    return citeproc;
};

citeprocnode.retrieveLocale = function(language){
    var fs = require('fs');
    var localeFileName = 'csl-locales/locales-' + language + '.xml';
    return fs.readFileSync(localeFileName, 'utf8');
};

citeprocnode.sampleCites = require('./test/loadcitesnode.js');

if (typeof module !== 'undefined' && "exports" in module) {
    exports.createEngine = citeprocnode.createEngine;
    exports.retrieveLocale = citeprocnode.retrieveLocale;
    exports.sampleCites = citeprocnode.sampleCites;
    exports.citeprocnode = citeprocnode;
}
