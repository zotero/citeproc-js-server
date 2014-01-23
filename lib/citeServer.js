/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the citeproc-node Server.
    
    Copyright © 2010 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/
/*
  zcite members:
    - config - configuration data, merged from defaults, config file, and command-line
      arguments.
    - log - an instance of npmlog.
    - citeproc - the citeproc-js citation processor
    - cslFetcher
    - respondException - function that responds to exceptions
    - locales - hash of locales read from the ./csl-locales directory (by default)
    - retrieveLocale - function to retrieve a locale, used by the citeproc-js engine
    
    - cslXml
    - cachedEngines
    - cachedEngineCount
    - createEngine - function
    - cacheLoadEngine - function
    - cacheSaveEngine - function
    - cleanCache - function
    - clearCache - function that empties the cache completely
    - runRequest - function
    - configureRequest - function
    
  zcreq is the per-request object, and is also passed into citeproc-js as the 
  configuratin object for that module.  It has the following members:
    - config - the request configuration
    - response - the HTTP response object
    - postObj - the parsed POST data
    - citationClusters - an array of data that can either be POSTed as citationClusters,
      or else is auto-generated from the items.  Only used if the URL query string
      has "citations=1".
    
    - retrieveLocale - required by citeproc-js; set to zcite.retrieveLocale
    - retrieveItem - required by citeproc-js; retrieves one item for processing
    - reqItemIDs - An array of item IDs that we should convert.  Can either be
      defined in the POST data (as "itemIDs"), or else it will contain all the IDs.
    - reqItemsObj - A hash with the items that were posted.
    - postedStyle - boolean that is true if the POST data included a style
    - styleUrlObj
    - citeproc - citation processing engine (? different from zcite.citeproc, right?)
    - postedStyle - true if the POST content included styleXml.
*/

//var repl = require('repl');
var fs = require('fs');
var http = require('http');
var url = require('url');
var async = require('async');
var _ = require('underscore')._;

// Global namespace citation server variable
var zcite = global.zcite = {};

//  Read the config file, merge in the defaults
var configDefaults = {
    "logLevel" : "verbose",
    "localesPath" : "./csl-locales",
    "cslPath" : "./csl",
    "cslFetcherPath" : "./cslFetcher",
    "engineCacheSize" : 20,
    "port" : 8085
}
var config = zcite.config = 
    JSON.parse(fs.readFileSync(__dirname + '/../citeServerConf.json', 'utf8'));
_.extend({}, configDefaults, config);


// Process command line args
// FIXME:  use optimist (https://github.com/substack/node-optimist) to fix
// these such that any config variable can be overridden from the command line.
/*
var args = process.argv;
for(var i = 1; i < args.length; i++){
    if(args[i].substr(0, 4) == 'port'){
        config.port = parseInt(args[i].substr(5), 10);
    }
}
*/

// Set up debug/logging output
var log = zcite.log = require('npmlog');
log.level = config.logLevel;
log.verbose("npmlog initialized");
log.verbose("Configuration: %j", config);

// Instantiate the citation processor
zcite.citeproc = require('./citeprocnode');

// Instantiate the CSL style fetcher
zcite.cslFetcher = require(config.cslFetcherPath).cslFetcher;
zcite.cslFetcher.init(config);

// This function handles errors that happen while handling a request.
// err must either be a string or an object.
zcite.respondException = function(err, zcreq) {
    var response = zcreq.response;
    
    var pre = "Error while handling request: ";
    if (typeof err === "string") {
        log.error(pre + err);
    }
    else if (err.hasOwnProperty('stack')) {
        log.error(pre + err.stack);
    }
    else {
        log.error(pre + console.trace());
    }

    var status = typeof err == "object" && err.statusCode ?
        err.statusCode : 500;
    var msg = typeof err === "string" ?
        err : typeof err == "object" && err.message ?
        err.message : 
        "Unknown error occurred";
    
    response.writeHead(status, {'Content-Type': 'text/plain'});
    response.end(msg);
};

// Preload locales into memory
zcite.locales = {};

var dir = fs.readdirSync(config.localesPath);
var len = dir.length;
for (var i = 0; i < len; i++) {
    var f = dir[i];
    if (f.slice(0, 8) != 'locales-' || f.slice(-4) != '.xml') { continue; }
    var localeCode = f.slice(8, -4);
    //log.silly("localeCode = '" + localeCode + "'");
    zcite.locales[localeCode] = fs.readFileSync(config.localesPath + '/' + f, 'utf8');
}


// retrieveLocale function for use by citeproc engine
zcite.retrieveLocale = function(lang){
    var locales = zcite.locales;
    if(locales.hasOwnProperty(lang)){
        return locales[lang];
    }
    else{
        return locales['en-US'];
    }
};

// Set up style fetcher
zcite.cslXml = {};

// Object for storing initialized CSL Engines by config options
// key is style, lang
zcite.cachedEngines = {};
zcite.cachedEngineCount = 0;

// This function runs under the async waterfall.  See below for the rules.
zcite.createEngine = function(zcreq, callback) {
    log.verbose('zcite.createEngine');
    var cpSys = {
        items: zcreq.reqItemsObj,
        retrieveLocale: zcite.retrieveLocale,
        retrieveItem: function(itemID){ return this.items[itemID]; }
    };
    var citeprocEngine;
    
    log.verbose("cpSys created");
    log.verbose(zcreq.config.locale);
    
    try {
        citeprocEngine = zcite.citeproc.createEngine(cpSys, zcreq.cslXml, zcreq.config.locale);
    }
    catch (err) {
        callback("Error creating citeproc engine: " + err);
        return;
    }
    
    log.verbose('Engine created');
    zcreq.citeproc = citeprocEngine;
    
    // Run the actual request now that citeproc is initialized (need to run this from 
    // cacheLoadEngine instead?)
    if (!zcite.precache) {
        log.info("Not precache - running callback");
        callback(null);
        return;
    }
    else {
        log.info("precache - setting sys.items to empty hash and calling saveEngine");
        citeprocEngine.sys.items = {};
        zcite.cacheSaveEngine(citeprocEngine, zcreq.styleUrlObj.href, zcreq.config.locale);
        callback(null);
        return;
    }
};

//try to load a csl engine specified by styleuri:locale from the cache
zcite.cacheLoadEngine = function(styleUri, locale){
    log.verbose('zcite.cacheLoadEngine');
    if((!styleUri) || (!locale)){
        //can't fully qualify style
        return false;
    }
    var cacheEngineString = styleUri + ':' + locale;
    log.verbose(cacheEngineString);
    if((typeof zcite.cachedEngines[cacheEngineString] == 'undefined') ||
       (typeof zcite.cachedEngines[cacheEngineString].store == 'undefined')){
        log.error("no cached engine found");
        return false;
    }
    else if(zcite.cachedEngines[cacheEngineString].store instanceof Array){
        //have the processor on record
        if(zcite.cachedEngines[cacheEngineString].store.length === 0){
            //don't have any of this processor ready for work
            return false;
        }
        else{
            //processor ready waiting for work
            var citeproc = zcite.cachedEngines[cacheEngineString].store.pop();
            zcite.cachedEngineCount--;
            citeproc.sys.items = {};
            citeproc.updateItems([]);
            citeproc.restoreProcessorState();
            return citeproc;
        }
    }
    //this shouldn't happen
    return false;
};

//save a csl engine specified by styleuri:locale
zcite.cacheSaveEngine = function(citeproc, styleUri, locale){
    log.verbose('zcite.cacheSaveEngine');
    var cacheEngineString = styleUri + ':' + locale;
    log.verbose(cacheEngineString);
    citeproc.sys.items = {};
    citeproc.updateItems([]);
    citeproc.restoreProcessorState();
    
    if(typeof zcite.cachedEngines[cacheEngineString] == 'undefined'){
        log.info("saving engine");
        zcite.cachedEngines[cacheEngineString] = {store: [citeproc], used: Date.now()};
    }
    else{
        if(this.cachedEngines[cacheEngineString].store instanceof Array){
            log.info('pushing instance of engine');
            zcite.cachedEngines[cacheEngineString].store.push(citeproc);
            zcite.cachedEngines[cacheEngineString].used = Date.now();
            log.info('cachedEngines[cacheEngineString].store.length:' + zcite.cachedEngines[cacheEngineString].store.length);
        }
    }
    
    //increment saved count and possibly clean the cache
    zcite.cachedEngineCount++;
    if(zcite.cachedEngineCount > config.engineCacheSize){
        zcite.cachedEngineCount = zcite.cleanCache();
    }
};

//clean up cache of engines
zcite.cleanCache = function(){
    var gcCacheArray = [];
    var totalCount = 0;
    var cachedEngines = zcite.cachedEngines;
    var i;
    //add cached engine stores to array for sorting
    for(i in cachedEngines){
        gcCacheArray.push(i);
        log.verbose(i);
        totalCount += cachedEngines[i].store.length;
    }
    log.verbose("TOTAL COUNT: " + totalCount);
    //only clean if we have more engines than we're configured to cache
    if(totalCount > config.engineCacheSize){
        //sort by last used
        gcCacheArray.sort(function(a, b){
            return zcite.cachedEngines[b].used - zcite.cachedEngines[a].used;
        });
        //make cleaning runs until we get under the desired count
        for(i = 0; i < gcCacheArray.length; i++){
            var engineStr = gcCacheArray[i];
            var engine = cachedEngines[engineStr];
            if(engine.store.length === 0){
                continue;
            }
            if(engine.store.length == 1){
                engine.store.pop();
                totalCount--;
            }
            else{
                //remove half of these engines on this pass
                var numToRemove = Math.floor(engine.store.length / 2);
                for(var j = 0; j < numToRemove; j++){
                    engine.store.pop();
                    totalCount--;
                }
            }
        }
    }
    log.verbose("DONE CLEANING CACHE");
    return totalCount;
};

zcite.clearCache = function(){
    //get rid of all the cached engines
    zcite.cachedEngines = {};
    //re-initialize csl fetcher so new styles are known
    zcite.cslFetcher.init(config);
};

//precache CSL Engines on startup with style:locale
/*
log.error('precaching CSL engines');
zcite.precache = false;
*/

// Callback for when engine is fully initialized and ready to process the request.
// This function runs under the async waterfall.  See below for the rules.
zcite.runRequest = function(zcreq, callback) {
    log.verbose('zcite.runRequest');
    
    try {
        var response = zcreq.response;
        var citeproc = zcreq.citeproc;
        var config = zcreq.config;
        var responseJson = {};
        var bib;
        
        //delete zcreq.citeproc;
        //log.error(zcreq);
        
        // Set output format
        if (config.outputformat != "html"){
            citeproc.setOutputFormat(config.outputformat);
        }

        // Add items posted with request
        citeproc.updateItems(zcreq.reqItemIDs);
        log.verbose('Items updated');
        if (citeproc.opt.sort_citations) {
            log.verbose("Currently using a sorting style", 1);
        }
        
        citeproc.opt.development_extensions.wrap_url_and_doi = (config.linkwrap == "1");
        log.verbose('citeproc wrap_url_and_doi: ' +
                    citeproc.opt.development_extensions.wrap_url_and_doi);
        
        // Switch process depending on bib or citation
        if (config.bibliography == "1") {
            log.verbose('Generating bib');
            bib = citeproc.makeBibliography();
            log.silly("bib: " + bib);
            responseJson.bibliography = bib;
        }
        if (config.citations == "1") {
            log.verbose('Generating citations');
            var citations = [];
            if (zcreq.citationClusters) {
                for (var i = 0; i < zcreq.citationClusters.length; i++) {
                    citations.push(citeproc.appendCitationCluster(zcreq.citationClusters[i], true)[0]);
                }
            }
            else {
                // FIXME:  what's supposed to go here?
            }
            log.silly("citations: " + citations);
            responseJson.citations = citations;
        }
        
        citeproc.opt.development_extensions.wrap_url_and_doi = false;
        
        var write = '';
        // Write the CSL output to the http response
        if (config.responseformat == "json") {
            response.writeHead(200, {'Content-Type': 'application/json'});
            write = JSON.stringify(responseJson);
        }
        else {
            if (config.outputformat == 'html'){
                response.writeHead(200, {'Content-Type': 'text/html'});
            }
            else if (config.outputformat == 'rtf'){
                response.writeHead(200, {'Content-Type': 'text/rtf'});
            }
            // not sure yet what should actually be written here, but will just do assembled bib for now
            if (bib) {
                write += bib[0].bibstart + bib[1].join('') + bib[0].bibend;
            }
        }
        
        response.write(write, 'utf8');
        response.end();
        log.verbose("Response sent");
        
        citeproc.sys.items = {};
        if (!zcreq.postedStyle) {
            zcite.cacheSaveEngine(zcreq.citeproc, zcreq.styleUrlObj.href, zcreq.config.locale);
        }
        callback(null);
        return;
    }
    catch(err) {
        callback(err);
        return;
    }
};


var defaultRequestConfig = {
    bibliography: '1',
    citations: '0',
    outputformat: 'html',
    responseformat: 'json',
    locale: 'en-US',
    style: 'chicago-author-date',
    memoryUsage: '0',
    linkwrap: '0',
    clearCache: '0'
};


http.createServer(function (request, response) {
    // zcreq keeps track of information about this request and is passed around
    var zcreq = {
        response: response
    };
    log.verbose("Request received");

    if (request.method == "OPTIONS") {
        log.verbose("HTTP method is OPTIONS");
        var nowdate = new Date();
        response.writeHead(200, {
            'Date': nowdate.toUTCString(),
            'Allow': 'POST,OPTIONS',
            'Content-Length': 0,
            'Content-Type': 'text/plain'
        });
        response.end('');
        return;
    }
    
    else if (request.method != "POST") {
        response.writeHead(400, {'Content-Type': 'text/plain'});
        response.end("Item data must be POSTed with request");
        return;
    }
    
    request.setEncoding('utf8');
    request.on('data', function(data){
        if (typeof this.POSTDATA === "undefined") {
            this.POSTDATA = data;
        }
        else {
            this.POSTDATA += data;
        }
    });
    request.on('end', function() {
        try {
            log.verbose('POST data completely received');

            // Parse url from request object, and merge it with default config
            var parsedQuery = require('querystring').parse(url.parse(this.url).query);
            var config = zcreq.config =
                _.extend({}, defaultRequestConfig, parsedQuery);
            log.verbose("Request configuration: %j", config);
            
            //make just memoryUsage response if requested
            // FIXME:  this should use GET
            if (config.memoryUsage == '1'){
                var memoryUsage = process.memoryUsage();
                memoryUsage['cachedEngines'] = zcite.cachedEngineCount;
                var r = JSON.stringify(memoryUsage)
                log.info("MEMORY USAGE: " + r);
                response.writeHead(200);
                response.end(r);
                return;
            }
            
            // clearCache command
            if (config.clearCache == '1'){
                if(this.socket.remoteAddress == '127.0.0.1'){
                    zcite.clearCache();
                    response.writeHead(200);
                    response.end();
                    return;
                }
                else {
                    response.writeHead(403);
                    response.end();
                    return;
                }
            }

            // Add citeproc required functions to zcreq object so it can be passed into 
            // CSL.Engine constructor
            zcreq.retrieveLocale = zcite.retrieveLocale;
            zcreq.retrieveItem = function(itemID){return this.items[itemID];};

            var postObj;
            try {
                postObj = JSON.parse(this.POSTDATA);
                zcreq.postObj = postObj;
            }
            catch(err){
                response.writeHead(400, {'Content-Type': 'text/plain'});
                response.end("Could not parse POSTed data");
                return;
            }
            
            // Get items object for this request from post body
            var reqItemIDs = zcreq.reqItemIDs = 
                (typeof postObj.itemIDs == 'undefined') ? [] : postObj.itemIDs;
            var items = postObj.items;
            
            // Initialize the hash of all items.  It will either have been given directly
            // in the POST data, or else make a hash out of the posted array.
            // Function items can be passed in as an object with keys becoming IDs, but ordering 
            // will not be guaranteed
            var reqItemsObj;
            if (items instanceof Array) {
                reqItemsObj = {};
                for (var i = 0; i < items.length; i++){
                    var item = items[i];
                    var id = item['id'];
                    reqItemsObj[id] = item;
                    if (typeof postObj.itemIDs == 'undefined'){
                        reqItemIDs.push(id);
                    }
                }
            }
            else if (typeof items == 'object'){
                reqItemsObj = postObj.items;
                for (var id in reqItemsObj){
                    if (reqItemsObj.hasOwnProperty(id)) {
                        if (reqItemsObj[id].id != id) {
                            throw "Item ID did not match items object key";
                        }
                        reqItemIDs.push(id);
                    }
                }
            }
            else {
                throw "Can't decipher items in POST data";
            }
            zcreq.reqItemsObj = reqItemsObj;


            // Add citationItems if not defined in request
            if (config.citations == '1') {
                if (zcreq.postObj.citationClusters) {
                    zcreq.citationClusters = zcreq.postObj.citationClusters;
                }
                else{
                    var citationClusters = [];
                    var len = reqItemIDs.length;
                    for (i = 0; i < len; i++){
                        var itemid = reqItemIDs[i];
                        citationClusters.push(
                            { 
                                "citationItems": [
                                    { id: itemid }
                                ],
                                "properties": {
                                    "noteIndex": i
                                }
                            }
                        );
                    }
                    zcreq.citationClusters = citationClusters;
                }
            }
            
            var postedStyle = zcreq.postedStyle =
                postObj.hasOwnProperty('styleXml');

            // This async waterfall handles the rest of the steps.  For a 
            // description of this pattern, see
            // http://www.hacksparrow.com/node-js-async-programming.html.
            
            // Here are the rules that apply within any step function:
            // - Always call callback
            // - Always return immediately after calling callback
            // - Use callback(err) to handle errors, not throw.
            // - Catch any errors in library functions you call, and then call callback(err)
            // - If you call a function that is "callback aware" (i.e. gets passed callback 
            //   as an argument) then, after that function call:
            //     - Don't call callback again.  The called function will have already
            //       called it.
            //     - Do immediately return
            
            async.waterfall([
                function(callback) {
                    log.verbose("Request step: fetchStyleIdentifier");

                    // Put the passed styleUrl into a standard form (adding www.zotero.org to short names)
                    // Short circuit on posted style
                    if (!zcreq.postedStyle) {
                        zcreq.styleUrlObj = zcite.cslFetcher.processStyleIdentifier(zcreq.config.style);
                        zcite.cslFetcher.resolveStyle(zcreq, callback);
                        return;
                    }
                    else {
                        log.verbose("=====================> skipping fetchStyleIdentifier");
                        callback(null);
                        return;
                    }
                },
                    
                function(callback) { // tryCachedEngine
                    log.verbose("Request step: tryCachedEngine");
                    
                    // Short circuit on posted style
                    if (zcreq.postedStyle) {
                        callback(null);
                        return;
                    }
                    // Check for cached version or create new CSL Engine
                    var citeproc = zcite.cacheLoadEngine(zcreq.styleUrlObj.href, zcreq.config.locale);
                    if (citeproc) {
                        citeproc.sys.items = zcreq.reqItemsObj;
                        log.verbose("citeproc.sys.items reset for zcreq");
                        zcreq.citeproc = citeproc;
                    }
                    callback(null);
                    return;
                },
                    
                function(callback) { // fetchStyle
                    log.error("Request step: fetchStyle");
                    
                    if (typeof zcreq.citeproc != 'undefined') {
                        log.verbose("Already have citeproc : continuing");
                        callback(null);
                        return;
                    }
                    else{
                        log.verbose("Don't have citeproc engine yet - fetching style");
                        var cslXml;
                        
                        //TODO: cache styles passed as URI if we want to support those
                        
                        zcite.cslFetcher.fetchStyle(zcreq, callback);
                        return;
                    }
                },
                    
                function(callback) { // createEngine
                    log.verbose("Request step: createEngine");
                    
                    if (typeof zcreq.citeproc != 'undefined'){
                        log.verbose("Using cached engine");
                        callback(null);
                        return;
                    }
                    else{
                        zcite.createEngine(zcreq, callback);
                        return;
                    }
                },
                    
                function(callback) { // runRequest
                    log.verbose("Request step: runRequest");
                    zcite.runRequest(zcreq, callback);
                    return;
                }
            ],

            // Overall waterfall callback
            function(err, results){
                if (err) {
                    log.verbose("Error thrown in async waterfall running request");
                    zcite.respondException(err, zcreq);
                }
                else {
                    log.verbose("Request step finished without apparent error");
                }
            });
        }
        catch(err) {
            zcite.respondException(err, zcreq);
          /*
            log.error("Error caught: " + err.message);
            if(typeof err == "string"){
                response.writeHead(500, {'Content-Type': 'text/plain'});
                response.end(err);
                return;
            }
            else{
                if(err.statusCode && err.msg){
                    response.writeHead(err.code, {'Content-Type': 'text/plain'});
                    response.end(err.msg);
                    return;
                }
                response.writeHead(500, {'Content-Type': 'text/plain'});
                response.end("An error occurred");
                return;
            }
          */
        }
    });
}).listen(config.port);

log.info('Server running at http://127.0.0.1:' + config.port + '/', 1);

process.on('uncaughtException', function(err) {
    log.error("Uncaught exception!  " + err);
});


