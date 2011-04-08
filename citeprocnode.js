var sys = require("sys");
var CSL = require("./citeprocmodule").CSL;
var zotero = require("./zoteronode").zotero;
var jsdom = require('jsdom');

zotero.DebugEnabled = 1;
//***BEGIN NODEJS CODE
zotero.Debug("citeprocjs parsed");

process.on('uncaughtException', function (err) {
    if(typeof err == "string"){
        zotero.Debug("Caught exception: " + err);
    }
    else{
        zotero.Debug('Caught exception: ' + err.name + " : " + err.message);
        zotero.Debug(err.stack);
    }
});

var CSL_NODEJS = require("./csl_nodejs_jsdom").CSL_NODEJS_JSDOM;
var xmlParsing = new CSL_NODEJS();
var CSL = require("./citeprocmodule").CSL;

var repl = require('repl');
var fs = require('fs');
var assert = require('assert');

var parser = jsdom;
var loadcites = require('./loadcitesnode.js');
var nt = require('./stdNodeTest');

//var t1 = new nt.StdNodeTest(CSL, "abbrevs_JournalMissingFromListButHasJournalAbbreviationField");
//var t1 = new nt.StdNodeTest(CSL, "sort_StripMarkup");


//console.log("result: " + t1.result);
//console.log("run(): " + t1.run());
//assert.equal(t1.run(), t1.result, "assert.equal message");
//assert.equal(t1.run(), " " + t1.result, "assert.equal message");


var data = loadcites.data;

var locales = {'en-US': fs.readFileSync('csl-locales/locales/locales-en-US.xml', 'utf8')};
var chicagoQuickCopyStyle = fs.readFileSync('csl1.0/chicago-quick-copy.csl', 'utf8');
var chicagoAuthorDate = fs.readFileSync('csl1.0/chicago-author-date.csl', 'utf8');

//var style = parser.parseFromString(chicagoQuickCopyStyle, "text/xml");
var testStyleXML = chicagoAuthorDate;

var cpSys = {
    retrieveLocale: function(lang){
        var ret = locales[lang];
        return ret;
    },

    retrieveItem: function(id){
        return data[id];
    }
};
console.log("cpSys created");

//test CSL_NODEJS parser functionality:

//parse style document;
/*
var doc = xmlParsing.makeXml(testStyleXML);


var context = {
    'fs': fs,
    'jsdom': jsdom,
    'testStyleXML': testStyleXML,
    'cpSys': cpSys,
    'xmlParsing': xmlParsing,
    'doc': doc
};

repl.start().context.g = context;
*/


console.log("loading citeproc:");
var citeproc = new CSL.Engine(cpSys, chicagoAuthorDate, 'en-US', 'en-US');
console.log('citeproc loaded');





//context.citeproc = citeproc;


/*
repl.start().context.g = context;*/


citeproc.updateItems(["ITEM-1", "ITEM-3", "ITEM-4", "ITEM-5", "ITEM-6", "ITEM-7", "ITEM-8","ITEM-9"]);
var mybib = citeproc.makeBibliography();
zotero.Debug(mybib);

