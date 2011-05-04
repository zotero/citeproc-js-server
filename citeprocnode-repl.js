var sys = require("sys");
var repl = require('repl');
var fs = require('fs');
var assert = require('assert');
var citeproc = require("./citeprocnode");
var zotero = require("./zoteronode").zotero;
var sampleCites = citeproc.sampleCites;

//zotero.DebugEnabled = 1;
//***BEGIN NODEJS CODE
process.on('uncaughtException', function (err) {
    if(typeof err == "string"){
        console.log("Caught exception: " + err);
    }
    else{
        console.log('Caught exception: ' + err.name + " : " + err.message);
        console.log(err.stack);
    }
});

//var nt = require('./stdNodeTest');

//var t1 = new nt.StdNodeTest(CSL, "abbrevs_JournalMissingFromListButHasJournalAbbreviationField");
//var t1 = new nt.StdNodeTest(CSL, "sort_StripMarkup");


//console.log("result: " + t1.result);
//console.log("run(): " + t1.run());
//assert.equal(t1.run(), t1.result, "assert.equal message");
//assert.equal(t1.run(), " " + t1.result, "assert.equal message");


var locales = {'en-US': fs.readFileSync('csl-locales/locales-en-US.xml', 'utf8')};
var chicagoQuickCopyStyle = fs.readFileSync('csl/chicago-quick-copy.csl', 'utf8');
var chicagoAuthorDate = fs.readFileSync('csl/chicago-author-date.csl', 'utf8');

//var style = parser.parseFromString(chicagoQuickCopyStyle, "text/xml");
var testStyleXML = chicagoAuthorDate;

var cpSys = {
    data: sampleCites.data,
    
    retrieveLocale: function(lang){
        var ret = locales[lang];
        return ret;
    },
    
    retrieveItem: function(id){
        return this.data[id];
    }
};
console.log("cpSys created");

var engine = citeproc.createEngine(cpSys, chicagoAuthorDate, 'en-US', 'en-US');
console.log("engine created");
engine.updateItems(["ITEM-1", "ITEM-3", "ITEM-4", "ITEM-5", "ITEM-6", "ITEM-7", "ITEM-8","ITEM-9"]);
console.log("items updated");
var mybib = engine.makeBibliography();
console.log(mybib);
//zotero.Debug(mybib);

