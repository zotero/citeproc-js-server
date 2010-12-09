var sys = require("sys");
var CSL = require("./citeprocmodule").CSL;
var zotero = require("./zoteronode").zotero;

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

var CSL = require("./citeprocmodule").CSL;

var repl = require('repl');
var fs = require('fs');
var assert = require('assert');
var parser = require('./node-o3-xml/lib/o3-xml');
//var parser = require('/usr/local/node/o3-xml');
//var fastparser = require('./node-o3-fastxml/lib/o3-fastxml');
var loadcites = require('./loadcites');
var nt = require('./stdNodeTest');

//var t1 = new nt.StdNodeTest(CSL, "abbrevs_JournalMissingFromListButHasJournalAbbreviationField");
//var t1 = new nt.StdNodeTest(CSL, "sort_StripMarkup");


//console.log("result: " + t1.result);
//console.log("run(): " + t1.run());
//assert.equal(t1.run(), t1.result, "assert.equal message");
//assert.equal(t1.run(), " " + t1.result, "assert.equal message");


var data = loadcites.data;

var locales = {'en-US': fs.readFileSync('csl-locales/trunk/locales-en-US.xml', 'utf8')};
var chicagoQuickCopyStyle = fs.readFileSync('csl1.0/chicago-quick-copy.csl', 'utf8');
var chicagoAuthorDate = fs.readFileSync('csl1.0/chicago-author-date.csl', 'utf8');

var style = parser.parseFromString(chicagoQuickCopyStyle, "text/xml");

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

var context = {
    'fs': fs,
    'parser': parser,
    'data': data,
    'locales': locales,
    'chicagoQuickCopyStyle': chicagoQuickCopyStyle,
    'style': style,
    'cpSys': cpSys,
    'CSL': CSL,
};

console.log("loading citeproc:");
var citeproc = new CSL.Engine(cpSys, chicagoQuickCopyStyle);
console.log('citeproc loaded');
context.citeproc = citeproc;


/*
repl.start().context.g = context;*/
/*
var domdoc = g.style;
var names = domdoc.getElementsByTagName("names");
var thenames = names[0];
var name = thenames.getElementsByTagName("name");
var theinstitution = g.canoninstnode.cloneNode(true);
var thename = name[0];
var parent = thename.parentNode;
*/

//citeproc.updateItems(["ITEM-1", "ITEM-3", "ITEM-4", "ITEM-5", "ITEM-6", "ITEM-7", "ITEM-8","ITEM-9"]);
/*
zotero.Debug('3');
var mybib = citeproc.makeBibliography();
*/
/*
zotero.Debug('4');
//zotero.Debug(mybib);
zotero.Debug("\n");

return;*/

/*
citeproc-server:
load locales
load styles
load citeproc instance for each style?
accept request
set up function to 






*/
