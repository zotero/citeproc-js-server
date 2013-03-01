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

//include required builtin modules
//var repl = require('repl');
var fs = require('fs');
var http = require('http');
var url = require('url');
var citeproc = require('./citeprocnode');
var async = require('async');
var _ = require('underscore')._;

//global namespace citation server variable
var zcite = {};
global.zcite = zcite;

zcite.config = JSON.parse(fs.readFileSync(__dirname + '/../citeServerConf.json', 'utf8'));
zcite.citeproc = citeproc;

//process command line args
var args = process.argv;
for(var i = 1; i < args.length; i++){
    if(args[i].substr(0, 4) == 'port'){
        zcite.config.listenport = parseInt(args[i].substr(5), 10);
    }
}

//zcite.CSL = require(zcite.config.citeprocmodulePath).CSL;
zcite.cslFetcher = require(zcite.config.cslFetcherPath).cslFetcher;
zcite.cslFetcher.init(zcite.config);

//set up debug/logging output
//logging, especially of errors, should be changed to be more consistent with other server log formats
if(zcite.config.debugLog === true){
    console.log("no debugLog");
    zcite.log = function(m){};
}
else{
    if(zcite.config.debugType == "file"){
        console.log("debug log file :" + zcite.config.logFile);
        zcite.logFile = process.stdout;
        /*
        zcite.logFile = fs.createWriteStream(zcite.config.logFile, {
            'flags' : 'w',
            'encoding' : 'utf8',
            'mode' : 0666
        });
        */
        zcite.log = function(m){
            zcite.logFile.write(m + '\n', 'utf8');
        };
    }
}

zcite.debug = function(m, level){
    if(typeof level == 'undefined'){level = 1;}
    if(level <= zcite.config.debugPrintLevel){
        console.log(m);
    }
};

//zcite exception response function
zcite.respondException = function (err, response, statusCode) {
    var errorMessage = 'An error occurred.';

    zcite.debug("respondException", 5);
    zcite.debug(err, 3);
    zcite.debug(err.message);
    if (err.hasOwnProperty('stack')) {
        zcite.debug(err.stack);
    }
    else {
        zcite.debug(console.trace());
    }
    if (typeof statusCode == 'undefined') {
        statusCode = 500;
    }
    if (typeof response != "undefined") {
        if (typeof err == "string") {
            if (err === 'no style found') {
                errorMessage = 'Requested style could not be found';
                statusCode = 400;
            }
            response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end(errorMessage);
            //zcite.debug("caught exception : " + err, 1);
            return;
        }
        else {
            response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end(errorMessage);
            //zcite.debug(err, 1);
            return;
        }
    }
    if (typeof err == "string") {
        zcite.debug("unCaught exception: " + err, 1);
    }
    else {
        zcite.debug('unCaught exception: ' + err.name + " : " + err.message, 1);
    }
};

//preload locales into memory
zcite.localesDir = fs.readdirSync(zcite.config.localesPath);

zcite.locales = {};
for(var i = 0; i < zcite.localesDir.length; i++){
    if(zcite.localesDir[i].slice(0, 8) != 'locales-'){ continue; }
    var localeCode = zcite.localesDir[i].slice(8, 13);
    //zcite.debug(zcite.config.localesPath + '/' + zcite.localesDir[i], 2);
    zcite.locales[localeCode] = fs.readFileSync(zcite.config.localesPath + '/' + zcite.localesDir[i], 'utf8');
}

//retrieveLocale function for use by citeproc Engine
zcite.retrieveLocale = function(lang){
    var locales = zcite.locales;
    if(locales.hasOwnProperty(lang)){
        return locales[lang];
    }
    else{
        return locales['en-US'];
    }
};

//set up style fetcher
zcite.cslXml = {};

//object for storing initialized CSL Engines by config options
//key is style, lang
zcite.cachedEngines = {};
zcite.cachedEngineCount = 0;

zcite.createEngine = function(zcreq, callback){
    //console.log(zcreq);
    zcite.debug('zcite.createEngine', 5);
    var cpSys = {
        items: zcreq.reqItemsObj,
        retrieveLocale: global.zcite.retrieveLocale,
        retrieveItem: function(itemID){return this.items[itemID];}
    };
    var citeprocEngine;
    
    zcite.debug("cpSys created", 5);
    zcite.debug(zcreq.config.locale, 5);
    
    try{
        citeprocEngine = zcite.citeproc.createEngine(cpSys, zcreq.cslXml, zcreq.config.locale, zcreq.config.forceLang);
    }
    catch(err){
        zcite.debug("Error creating citeproc engine:" + err.message);
        zcite.respondException(err, zcreq.response);
        callback(err);
    }
    zcite.debug('engine created', 5);
    zcreq.citeproc = citeprocEngine;
    //run the actual request now that citeproc is initialized (need to run this from cacheLoadEngine instead?)
    if(!zcite.precache){
        zcite.debug("Not precache - running callback");
        callback(null, zcreq);
    }
    else{
        zcite.debug("precache - setting sys.items to empty hash and calling saveEngine");
        citeprocEngine.sys.items = {};
        zcite.cacheSaveEngine(citeprocEngine, zcreq.styleUrlObj.href, zcreq.config.locale);
    }
};

//try to load a csl engine specified by styleuri:locale from the cache
zcite.cacheLoadEngine = function(styleUri, locale){
    zcite.debug('zcite.cacheLoadEngine', 5);
    if((!styleUri) || (!locale)){
        //can't fully qualify style
        return false;
    }
    var cacheEngineString = styleUri + ':' + locale;
    zcite.debug(cacheEngineString, 5);
    if((typeof zcite.cachedEngines[cacheEngineString] == 'undefined') ||
       (typeof zcite.cachedEngines[cacheEngineString].store == 'undefined')){
        zcite.debug("no cached engine found", 5);
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
    zcite.debug('zcite.cacheSaveEngine', 5);
    var cacheEngineString = styleUri + ':' + locale;
    zcite.debug(cacheEngineString, 5);
    citeproc.sys.items = {};
    citeproc.updateItems([]);
    citeproc.restoreProcessorState();
    
    if(typeof zcite.cachedEngines[cacheEngineString] == 'undefined'){
        zcite.debug("saving engine", 5);
        zcite.cachedEngines[cacheEngineString] = {store: [citeproc], used: Date.now()};
    }
    else{
        if(this.cachedEngines[cacheEngineString].store instanceof Array){
            zcite.debug('pushing instance of engine', 5);
            zcite.cachedEngines[cacheEngineString].store.push(citeproc);
            zcite.cachedEngines[cacheEngineString].used = Date.now();
            zcite.debug('cachedEngines[cacheEngineString].store.length:' + zcite.cachedEngines[cacheEngineString].store.length, 5);
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
        zcite.debug(i);
        totalCount += cachedEngines[i].store.length;
    }
    zcite.debug("TOTAL COUNT: " + totalCount);
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
    zcite.debug("DONE CLEANING CACHE");
    return totalCount;
};

//precache CSL Engines on startup with style:locale
/*
zcite.debug('precaching CSL engines', 5);
zcite.precache = false;
*/

//callback for when engine is fully initialized and ready to process the request
zcite.runRequest = function(zcreq){
    try{
        zcite.debug('zcite.runRequest', 5);
        var response = zcreq.response;
        var citeproc = zcreq.citeproc;
        var config = zcreq.config;
        var responseJson = {};
        var bib;
        
        //delete zcreq.citeproc;
        //zcite.debug(zcreq, 5);
        //set output format
        if(config.outputformat != "html"){
            citeproc.setOutputFormat(config.outputformat);
        }
        zcite.debug("outputFormat set", 5);
        //add items posted with request
        citeproc.updateItems(zcreq.reqItemIDs);
        zcite.debug('updated Items', 5);
        if(citeproc.opt.sort_citations){
            zcite.debug("currently using a sorting style", 1);
        }
        zcite.debug("items Updated", 5);
        
        if(config.linkwrap == "1"){
            citeproc.opt.development_extensions.wrap_url_and_doi = true;
        }
        else{
            citeproc.opt.development_extensions.wrap_url_and_doi = false;
        }
        zcite.debug('citeproc wrap_url_and_doi:');
        zcite.debug(citeproc.opt.development_extensions.wrap_url_and_doi);
        
        //switch process depending on bib or citation
        if(config.bibliography == "1"){
            zcite.debug('generating bib', 5);
            bib = citeproc.makeBibliography();
            zcite.debug("bib generated", 5);
            responseJson.bibliography = bib;
        }
        if(config.citations == "1"){
            zcite.debug('generating citations', 5);
            var citations = [];
            if(zcreq.citationClusters){
                for(var i = 0; i < zcreq.citationClusters.length; i++){
                    citations.push(citeproc.appendCitationCluster(zcreq.citationClusters[i], true)[0]);
                }
            }
            else{
                
            }
            zcite.debug(citations, 5);
            responseJson.citations = citations;
        }
        
        citeproc.opt.development_extensions.wrap_url_and_doi = false;
        
        var write = '';
        //write the CSL output to the http response
        if(config.responseformat == "json"){
            response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
            write = JSON.stringify(responseJson);
        }
        else{
            if(config.outputformat == 'html'){
                response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            }
            else if(config.outputformat == 'rtf'){
                response.writeHead(200, {'Content-Type': 'text/rtf; charset=utf-8'});
            }
            //not sure yet what should actually be written here, but will just do assembled bib for now
            if(bib){
                write += bib[0].bibstart + bib[1].join('') + bib[0].bibend;
            }
        }
        
        response.write(write, 'utf8');
        response.end();
        zcite.debug("response sent", 5);
        
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
        forceLang: null,
        style: 'chicago-author-date',
        memoryUsage: '0',
        linkwrap: '0'
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
    zcite.debug("request received", 5);
    if(request.method == "OPTIONS"){
        zcite.debug("options request received", 5);
        var nowdate = new Date();
        response.writeHead(200, {
            'Date': nowdate.toUTCString(),
            'Allow': 'POST,OPTIONS',
            'Content-Length': 0,
            'Content-Type': 'text/plain; charset=utf-8'
        });
        response.end('');
        return;
    }
    else if(request.method != "POST"){
        response.writeHead(400, {'Content-Type': 'text/plain; charset=utf-8'});
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
            zcite.debug('full request received', 5);
            //parse url from request object
            var uriObj = url.parse(this.url);
            uriObj.parsedQuery = require('querystring').parse(uriObj.query);
            zcite.debug(uriObj, 5);
            //make config obj based on query
            var config = zcite.configureRequest(uriObj.parsedQuery);
            zcite.debug(JSON.stringify(config), 4);
            if(config.memoryUsage == '1'){
                var memoryUsage = process.memoryUsage();
                memoryUsage['cachedEngines'] = zcite.cachedEngineCount;
                console.log("MEMORY USAGE:");
                console.log(JSON.stringify(memoryUsage));
                response.writeHead(200);
                response.end(JSON.stringify(memoryUsage));
                return;
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
                response.writeHead(400, {'Content-Type': 'text/plain; charset=utf-8'});
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
                    zcite.debug("request step: fetchStyleIdentifier", 5);
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
                    zcite.debug("request step: tryCachedEngine", 5);
                    //short circuit on posted style
                    if(zcreq.postedStyle) {
                        callback(null, zcreq);
                        return;
                    }
                    //check for cached version or create new CSL Engine
                    var citeproc = zcite.cacheLoadEngine(zcreq.styleUrlObj.href, zcreq.config.locale);
                    if(citeproc){
                        citeproc.sys.items = zcreq.reqItemsObj;
                        zcite.debug("citeproc.sys.items reset for zcreq", 5);
                        zcreq.citeproc = citeproc;
                    }
                    
                    callback(null, zcreq);
                    return;
                },
                function(zcreq, callback){// fetchStyle
                    zcite.debug("request step: fetchStyle", 5);
                    if(typeof zcreq.citeproc != 'undefined'){
                        //have cached engine, don't need csl xml
                        zcite.debug("already have citeproc : continuing", 5);
                        callback(null, zcreq);
                        return;
                    }
                    else{
                        zcite.debug("don't have citeproc engine yet - fetching style", 5);
                        var cslXml;
                        
                        //TODO: cache styles passed as URI if we want to support those
                        
                        zcite.cslFetcher.fetchStyle(zcreq, callback);
                        return;
                    }
                },
                function(zcreq, callback){// createEngine
                    zcite.debug("request step: createEngine", 5);
                    //zcite.debug("cslXml: " + zcreq.cslXml, 5);
                    if(typeof zcreq.citeproc != 'undefined'){
                        //have cached engine, don't need csl xml
                        zcite.debug("have cached engine", 5);
                        callback(null, zcreq);
                        return;
                    }
                    else{
                        zcite.createEngine(zcreq, callback);
                        return;
                    }
                },
                function(zcreq, callback){// runRequest
                    zcite.debug("request step: runRequest", 5);
                    //console.log(zcreq);
                    zcite.runRequest(zcreq, callback);
                }
            ],
            function(err, results){
                //overall waterfall callback
                if(err){
                    zcite.debug("Error thrown in async waterfall running request");
                    zcite.respondException(err, zcreq.response);
                }
                else{
                    zcite.debug("request step finished without apparent error", 5);
                }
            });
        }
        catch(err){
            zcite.debug(err.message);
            if(typeof err == "string"){
                response.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
                response.end(err);
                return;
            }
            else{
                response.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
                response.end("An error occurred");
                return;
            }
        }
    });
}).listen(zcite.config.listenport);

zcite.debug('Server running at http://127.0.0.1:' + zcite.config.listenport + '/', 1);

process.on('uncaughtException', function (err) {
    zcite.respondException(err, response);
});


