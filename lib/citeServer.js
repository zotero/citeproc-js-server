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

//var repl = require('repl');
var fs = require('fs');
var http = require('http');
var url = require('url');
citeproc = require('./citeprocnode');
var async = require('async');
var _ = require('underscore')._;

// Global namespace citation server variable
var zcite = {};
global.zcite = zcite;

// Process command line args
var args = process.argv;
for(var i = 1; i < args.length; i++){
    if(args[i].substr(0, 4) == 'port'){
        zcite.config.listenport = parseInt(args[i].substr(5), 10);
    }
}

//  Read the config file, merge in the defaults
var configDefaults = {
    'logLevel': 'verbose'
}
var config = zcite.config = 
    JSON.parse(fs.readFileSync(__dirname + '/../citeServerConf.json', 'utf8'));
for (k in configDefaults) {
    if (!config[k]) config[k] = configDefaults[k];
}

// Set up debug/logging output
global.log = require('npmlog');
log.level = config.logLevel;
log.verbose("npmlog initialized");
log.verbose("Configuration: %j", zcite.config);

// Instantiate the citation processor
zcite.citeproc = citeproc;

// Instantiate the CSL style fetcher
zcite.cslFetcher = require(zcite.config.cslFetcherPath).cslFetcher;
zcite.cslFetcher.init(zcite.config);

// zcite exception response function
zcite.respondException = function(err, response, statusCode){
    if(response === undefined){
        log.error("No reponse passed to respondException");
        return;
    }
    if(err.hasOwnProperty('stack')){
        log.error(err.stack);
    }
    else{
        log.error(console.trace());
    }
    if(typeof statusCode == 'undefined'){
        statusCode = 500;
    }
    if(typeof response != "undefined"){
        if(typeof err == "string"){
            response.writeHead(statusCode, {'Content-Type': 'text/plain'});
            response.end("An error occurred");
            //log.verbose("caught exception : " + err, 1);
            return;
        }
        else{
            if(err.statusCode && err.message){
                response.writeHead(err.statusCode, {'Content-Type': 'text/plain'});
                response.end(err.msg);
                return;
            }
            else{
                response.writeHead(statusCode, {'Content-Type': 'text/plain'});
                response.end("An error occurred");
                //log.verbose(err, 1);
                return;
            }
        }
    }
    if(typeof err == "string"){
        log.error("unCaught exception: " + err, 1);
    }
    else{
        log.error('unCaught exception: ' + err.name + " : " + err.message, 1);
    }
};

// Preload locales into memory
zcite.localesDir = fs.readdirSync(zcite.config.localesPath);

zcite.locales = {};
for(var i = 0; i < zcite.localesDir.length; i++){
    if(zcite.localesDir[i].slice(0, 8) != 'locales-'){ continue; }
    var localeCode = zcite.localesDir[i].slice(8, 13);
    //log.verbose(zcite.config.localesPath + '/' + zcite.localesDir[i], 2);
    zcite.locales[localeCode] = fs.readFileSync(zcite.config.localesPath + '/' + zcite.localesDir[i], 'utf8');
}

// retrieveLocale function for use by citeproc Engine
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

zcite.createEngine = function(zcreq, callback){
    //console.log(zcreq);
    log.verbose('zcite.createEngine');
    var cpSys = {
        items: zcreq.reqItemsObj,
        retrieveLocale: global.zcite.retrieveLocale,
        retrieveItem: function(itemID){return this.items[itemID];}
    };
    var citeprocEngine;
    
    log.verbose("cpSys created");
    log.verbose(zcreq.config.locale);
    
    try{
        citeprocEngine = zcite.citeproc.createEngine(cpSys, zcreq.cslXml, zcreq.config.locale);
    }
    catch(err){
        log.error("Error creating citeproc engine:" + err.message);
        zcite.respondException(err, zcreq.response);
        callback(err);
    }
    log.verbose('engine created');
    zcreq.citeproc = citeprocEngine;
    //run the actual request now that citeproc is initialized (need to run this from cacheLoadEngine instead?)
    if(!zcite.precache){
        log.info("Not precache - running callback");
        callback(null, zcreq);
    }
    else{
        log.info("precache - setting sys.items to empty hash and calling saveEngine");
        citeprocEngine.sys.items = {};
        zcite.cacheSaveEngine(citeprocEngine, zcreq.styleUrlObj.href, zcreq.config.locale);
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
    if(zcite.cachedEngineCount > zcite.config.engineCacheSize){
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
    if(totalCount > zcite.config.engineCacheSize){
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
    zcite.cslFetcher.init(zcite.config);
};

//precache CSL Engines on startup with style:locale
/*
log.error('precaching CSL engines');
zcite.precache = false;
*/

//callback for when engine is fully initialized and ready to process the request
zcite.runRequest = function(zcreq){
    try{
        log.verbose('zcite.runRequest');
        var response = zcreq.response;
        var citeproc = zcreq.citeproc;
        var config = zcreq.config;
        var responseJson = {};
        var bib;
        
        //delete zcreq.citeproc;
        //log.error(zcreq);
        //set output format
        if(config.outputformat != "html"){
            citeproc.setOutputFormat(config.outputformat);
        }
        log.verbose("outputFormat set");
        //add items posted with request
        citeproc.updateItems(zcreq.reqItemIDs);
        log.verbose('updated Items');
        if(citeproc.opt.sort_citations){
            log.verbose("currently using a sorting style", 1);
        }
        log.verbose("items Updated");
        
        if(config.linkwrap == "1"){
            citeproc.opt.development_extensions.wrap_url_and_doi = true;
        }
        else{
            citeproc.opt.development_extensions.wrap_url_and_doi = false;
        }
        log.verbose('citeproc wrap_url_and_doi:');
        log.verbose(citeproc.opt.development_extensions.wrap_url_and_doi);
        
        //switch process depending on bib or citation
        if(config.bibliography == "1"){
            log.verbose('generating bib');
            bib = citeproc.makeBibliography();
            log.verbose("bib generated");
            responseJson.bibliography = bib;
        }
        if(config.citations == "1"){
            log.verbose('generating citations');
            var citations = [];
            if(zcreq.citationClusters){
                for(var i = 0; i < zcreq.citationClusters.length; i++){
                    citations.push(citeproc.appendCitationCluster(zcreq.citationClusters[i], true)[0]);
                }
            }
            else{
                
            }
            log.verbose(citations);
            responseJson.citations = citations;
        }
        
        citeproc.opt.development_extensions.wrap_url_and_doi = false;
        
        var write = '';
        //write the CSL output to the http response
        if(config.responseformat == "json"){
            response.writeHead(200, {'Content-Type': 'application/json'});
            write = JSON.stringify(responseJson);
        }
        else{
            if(config.outputformat == 'html'){
                response.writeHead(200, {'Content-Type': 'text/html'});
            }
            else if(config.outputformat == 'rtf'){
                response.writeHead(200, {'Content-Type': 'text/rtf'});
            }
            //not sure yet what should actually be written here, but will just do assembled bib for now
            if(bib){
                write += bib[0].bibstart + bib[1].join('') + bib[0].bibend;
            }
        }
        
        response.write(write, 'utf8');
        response.end();
        log.verbose("response sent");
        
        citeproc.sys.items = {};
        if(zcreq.postedStyle){
            return;
        }
        else{
            zcite.cacheSaveEngine(zcreq.citeproc, zcreq.styleUrlObj.href, zcreq.config.locale);
        }
    }
    catch(err){
        zcite.respondException(err, zcreq.response);
    }
};

zcite.configureRequest = function(uriConf){
    var config = {
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
    
    config = _.extend(config, uriConf);
    /*
    //generate bibliography, citations, or both?
    config.bibliography = (typeof uriConf.bibliography == 'undefined' ) ? '1' : uriConf.bibliography;
    config.citations = (typeof uriConf.citations == 'undefined' ) ? '0' : uriConf.citations;
    //for csl processor's setOutputFormat (html, rtf, or text are predefined)
    config.outputformat = (typeof uriConf.outputformat == 'undefined' ) ? 'html' : uriConf.outputformat;
    config.responseformat = (typeof uriConf.responseformat == 'undefined' ) ? 'json' : uriConf.responseformat;
    //locale to use
    config.locale = (typeof uriConf.locale == 'undefined' ) ? 'en-US' : uriConf.locale;
    //CSL path or name
    config.style = (typeof uriConf.style == 'undefined' ) ? 'chicago-author-date' : uriConf.style;
    //config.cslOutput = (typeof uriConf.csloutput == 'undefined' ) ? 'bibliography' : uriConf.csloutput;
    //config.cslOutput = (typeof uriConf.csloutput == 'undefined' ) ? 'bibliography' : uriConf.csloutput;
    config.memoryUsage = (typeof uriConf.memoryUsage == 'undefined' ) ? '0' : '1';
    */
    return config;
};

http.createServer(function (request, response) {
    //zcreq keeps track of information about this request and is passed around
    var zcreq = {};
    log.verbose("request received");
    if(request.method == "OPTIONS"){
        log.verbose("options request received");
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
    else if(request.method != "POST"){
        response.writeHead(400, {'Content-Type': 'text/plain'});
        response.end("Item data must be POSTed with request");
        return;
    }
    request.setEncoding('utf8');
    request.on('data', function(data){
        if(typeof this.POSTDATA === "undefined"){
            this.POSTDATA = data;
        }
        else{
            this.POSTDATA += data;
        }
    });
    request.on('end', function(){
        try{
            log.verbose('full request received');
            //parse url from request object
            var uriObj = url.parse(this.url);
            uriObj.parsedQuery = require('querystring').parse(uriObj.query);
            log.verbose(uriObj);
            //make config obj based on query
            var config = zcite.configureRequest(uriObj.parsedQuery);
            log.verbose(JSON.stringify(config));
            //make just memoryUsage response if requested
            if(config.memoryUsage == '1'){
                var memoryUsage = process.memoryUsage();
                memoryUsage['cachedEngines'] = zcite.cachedEngineCount;
                console.log("MEMORY USAGE:");
                console.log(JSON.stringify(memoryUsage));
                response.writeHead(200);
                response.end(JSON.stringify(memoryUsage));
                return;
            }
            if(config.clearCache == '1'){
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
            zcreq.config = config;
            //need to keep response in zcreq so async calls stay tied to a request
            zcreq.response = response;
            var postObj;
            try{
                postObj = JSON.parse(this.POSTDATA);
                zcreq.postObj = postObj;
            }
            catch(err){
                response.writeHead(400, {'Content-Type': 'text/plain'});
                response.end("Could not parse POSTed data");
                return;
            }
            
            //get items object for this request from post body
            var reqItemIDs;
            var reqItems = postObj.items;
            var reqItemsObj = {};
            if(typeof postObj.itemIDs != 'undefined'){
                reqItemIDs = postObj.itemIDs;
            }
            else{
                reqItemIDs = [];
            }
            //add citationItems if not defined in request
            var addCitationClusters = true;
            var autoCitationClusters = [];
            var noteIndexCount = 0;
            if(typeof zcreq.citationClusters != 'undefined'){
                addCitationClusters = false;
            }
            
            //push itemIDs onto array and id referenced object for updateItems and retrieveItem function
            //items can be passed in as an object with keys becoming IDs, but ordering will not be guarenteed
            var i;
            if(reqItems instanceof Array){
                //console.log(reqItems);
                for(i = 0; i < reqItems.length; i++){
                    reqItemsObj[reqItems[i]['id']] = reqItems[i];
                    if(typeof postObj.itemIDs == 'undefined'){
                        reqItemIDs.push(reqItems[i]['id']);
                    }
                }
            }
            else if(typeof zcreq.postObj.items == 'object'){
                reqItemsObj = postObj.items;
                for(i in reqItemsObj){
                    if(reqItemsObj.hasOwnProperty(i)){
                        if(reqItemsObj[i].id != i){
                            throw "Item ID did not match Object index";
                        }
                        reqItemIDs.push(i);
                    }
                }
            }
            
            //actually add the citationItems
            if(addCitationClusters){
                for(i = 0; i < reqItemIDs.length; i++){
                    var itemid = reqItemIDs[i];
                    autoCitationClusters.push(
                    {
                        "citationItems": [
                            {
                                id: itemid
                            }
                        ],
                        "properties": {
                            "noteIndex": i
                        }
                    });
                }
            }
            
            //add citeproc required functions to zcreq object so it can be passed into CSL.Engine constructor
            zcreq.retrieveLocale = global.zcite.retrieveLocale;
            zcreq.retrieveItem = function(itemID){return this.items[itemID];};
            
            zcreq.reqItemIDs = reqItemIDs;
            zcreq.reqItemsObj = reqItemsObj;
            
            if(config.citations == '1'){
                if(zcreq.postObj.citationClusters){
                    zcreq.citationClusters = zcreq.postObj.citationClusters;
                }
                else{
                    zcreq.citationClusters = autoCitationClusters;
                }
            }
            
            var postedStyle = false;
            if(postObj.hasOwnProperty('styleXml')){
                postedStyle = true;
            }
            zcreq.postedStyle = postedStyle;
            //make style identifier so we can check caches for real
            //check for citeproc engine cached
            //otherwise check for cached style
            //-initialize
            async.waterfall([
                function(callback){ //fetchStyleIdentifier
                    //put the passed styleUrl into a standard form (adding www.zotero.org to short names)
                    log.verbose("request step: fetchStyleIdentifier");
                    //short circuit on posted style
                    if(!zcreq.postedStyle){
                        zcreq.styleUrlObj = zcite.cslFetcher.processStyleIdentifier(zcreq.config.style);
                        zcite.cslFetcher.resolveStyle(zcreq, callback);
                        return;
                    }
                    else{
                        callback(null, zcreq);
                        return;
                    }
                },
                function(zcreq, callback){// tryCachedEngine
                    log.verbose("request step: tryCachedEngine");
                    //short circuit on posted style
                    if(zcreq.postedStyle) {
                        callback(null, zcreq);
                        return;
                    }
                    //check for cached version or create new CSL Engine
                    var citeproc = zcite.cacheLoadEngine(zcreq.styleUrlObj.href, zcreq.config.locale);
                    if(citeproc){
                        citeproc.sys.items = zcreq.reqItemsObj;
                        log.verbose("citeproc.sys.items reset for zcreq");
                        zcreq.citeproc = citeproc;
                    }
                    
                    callback(null, zcreq);
                    return;
                },
                function(zcreq, callback){// fetchStyle
                    log.error("request step: fetchStyle");
                    if(typeof zcreq.citeproc != 'undefined'){
                        //have cached engine, don't need csl xml
                        log.verbose("already have citeproc : continuing");
                        callback(null, zcreq);
                        return;
                    }
                    else{
                        log.verbose("don't have citeproc engine yet - fetching style");
                        var cslXml;
                        
                        //TODO: cache styles passed as URI if we want to support those
                        
                        zcite.cslFetcher.fetchStyle(zcreq, callback);
                        return;
                    }
                },
                function(zcreq, callback){// createEngine
                    log.verbose("request step: createEngine");
                    //log.error("cslXml: " + zcreq.cslXml);
                    if(typeof zcreq.citeproc != 'undefined'){
                        //have cached engine, don't need csl xml
                        log.verbose("have cached engine");
                        callback(null, zcreq);
                        return;
                    }
                    else{
                        zcite.createEngine(zcreq, callback);
                        return;
                    }
                },
                function(zcreq, callback){// runRequest
                    log.verbose("request step: runRequest");
                    //console.log(zcreq);
                    zcite.runRequest(zcreq, callback);
                }
            ],
            function(err, results){
                //overall waterfall callback
                if(err){
                    log.verbose("Error thrown in async waterfall running request");
                    zcite.respondException(err, zcreq.response);
                }
                else{
                    log.verbose("request step finished without apparent error");
                }
            });
        }
        catch(err){
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
        }
    });
}).listen(zcite.config.listenport);

log.info('Server running at http://127.0.0.1:' + zcite.config.listenport + '/', 1);

process.on('uncaughtException', function (err) {
    zcite.respondException(err);
});


