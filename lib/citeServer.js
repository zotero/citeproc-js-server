/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the citeproc-node Server.
    
    Copyright © 2014 Center for History and New Media
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

  module variables:
    - fs
    - http
    - url
    - querystring
    - _
    - log
    - Promise
    - locales
    - citeprocnode
    - defaultCiteserverConfig
    - defaultRequestConfig
    - defaultResponseHeaders
    - config
    - delay (function)
    - activeRequests
    - requestTimes
    - cslFetcher
    - cslLoader
    - engineCache
    - localeManager
    
  request scope variables:
    - startDate
    - hkeys
    - i
    - nowdate
    request processing scope variables (on end):
        - parsedQuery
        - requestConfig
        - memoryUsage
        - r
        - postObj
        - reqItemIDs
        - items
        - reqItemsObj
        - citationClusters
        - 
  
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

//TODO: allow requests to pass forceLang http://gsl-nagoya-u.net/http/pub/citeproc-doc.html#instantiation-csl-engine

//var repl = require('repl');
var fs = require('fs');
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var _ = require('underscore')._;
var log = require('npmlog');
var Promise = require('bluebird');
var locales = require('./locales');
var citeprocnode = require('./citeprocnode');

//  Read the config file, merge in the defaults
var defaultCiteserverConfig = {
    "logLevel" : "verbose",
    "localesPath" : "./csl-locales",
    "cslPath" : "./csl",
    "cslFetcherPath" : "./cslFetcher",
    "engineCacheSize" : 40,
    "port" : 8085,
    "allowCors": true,
    "timings": false
}

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

var defaultResponseHeaders = {};

var config = JSON.parse(fs.readFileSync(__dirname + '/../citeServerConf.json', 'utf8'));
_.extend({}, defaultCiteserverConfig, config);


if(config.allowCors){
    defaultResponseHeaders['Access-Control-Allow-Origin'] = '*';
}

//allow overriding of config variables on command line
var argv = require('optimist')
    .usage('')
    .default(config)
    .argv;

if(argv.h){
    console.log(config);
    process.exit();
}

config = argv;


// Set up debug/logging output
log.level = config.logLevel;
log.verbose("npmlog initialized");
log.verbose("Configuration: %j", config);

//TODO: remove after benchmarking
var activeRequests = 0;
var requestTimes = [];

// Instantiate the CSL style fetcher
var cslFetcher = require('./cslFetcher');
var cslLoader = new cslFetcher.CslLoader(config);

// instantiate engine cache
var engineCache = new citeprocnode.EngineCache(config);

//instantiate locale manager
var localeManager = new locales.LocaleManager(config.localesPath);

http.createServer(function (request, response) {
    log.verbose("Request received");
    activeRequests++;
    request.startDate = Date.now();
    log.verbose('Active requests: ', activeRequests);
    response.on('finish', function(){
        activeRequests--;
        if(config.timings){
            requestTimes.push(Date.now() - request.startDate);
            log.verbose('Active requests: ', activeRequests);
            log.verbose('requestTimes: ', requestTimes);
        }
    });
    
    //set default response headers for all responses
    var hkeys = Object.keys(defaultResponseHeaders);
    for(var i = 0; i < hkeys.length; i++){
        response.setHeader(hkeys[i], defaultResponseHeaders[hkeys[i]]);
    }
    
    //TODO: allow gets for things like style completion?
    if (request.method == "OPTIONS") {
        log.verbose("HTTP method is OPTIONS");
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
    else if (request.method != "POST") {
        response.writeHead(400, {'Content-Type': 'text/plain; charset=utf-8'});
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
        log.verbose('POST data completely received');
        
        // Parse url from request object, and merge it with default config
        var parsedQuery = querystring.parse(url.parse(this.url).query);
        log.verbose("parsedQuery", parsedQuery);
        var requestConfig = _.extend({}, defaultRequestConfig, parsedQuery);
        requestConfig.locale = localeManager.chooseLocale(requestConfig.locale);
        log.verbose("Request configuration: %j", requestConfig);
        
        //make just memoryUsage response if requested
        // FIXME:  this should use GET
        if (requestConfig.memoryUsage == '1'){
            var memoryUsage = process.memoryUsage();
            memoryUsage['cachedEngines'] = engineCache.cachedEngineCount;
            var r = JSON.stringify(memoryUsage)
            log.info("MEMORY USAGE: " + r);
            response.writeHead(200);
            response.end(r);
            return;
        }
        
        // clearCache command
        if (requestConfig.clearCache == '1'){
            if(this.socket.remoteAddress == '127.0.0.1'){
                engineCache.clear();
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
        
        //parse post data
        var postObj;
        try {
            postObj = JSON.parse(this.POSTDATA);
        }
        catch(err){
            response.writeHead(400, {'Content-Type': 'text/plain; charset=utf-8'});
            response.end("Could not parse POSTed data");
            return;
        }
        
        var preparedData = citeprocnode.prepareData(postObj, requestConfig.citations);
        var postedStyle = postObj.hasOwnProperty('styleXml');
        var styleUrlObj;
        var citeprocEngine = false;
        var cslXml;
        //start potentially async process to get or create a CSL Engine:
        //resolve the style ID to the appropriate independent style
        //or skip ahead if style xml was POSTed with request
        var citePromise;
        if(!postedStyle){
            citePromise = cslLoader.resolveStyle(requestConfig.style)
            .then(function(resolvedUrlObj){
                styleUrlObj = resolvedUrlObj;
                //try to get a cached engine
                var cachedEngine = engineCache.loadEngine(styleUrlObj.href, requestConfig.locale);
                if(cachedEngine){
                    citeprocEngine = cachedEngine;
                    citeprocEngine.cslEngine.sys.items = preparedData.reqItemsObj;
                    return citeprocEngine;
                }
                else{
                    return cslLoader.fetchIndependentStyle(styleUrlObj)
                    .then(function(fetchedCslXml){
                        cslXml = fetchedCslXml;
                        citeprocEngine = new citeprocnode.CiteprocEngine(preparedData.reqItemsObj, cslXml, requestConfig.locale, localeManager, null);
                        return citeprocEngine;
                    });
                }
            });
        }
        else{
            cslXml = postObj.styleXml;
            citeprocEngine = new citeprocnode.CiteprocEngine(preparedData.reqItemsObj, cslXml, requestConfig.locale, localeManager, null);
            citePromise = Promise.resolve(citeprocEngine);
        }
        
        //finish with synchronous processing and responding
        citePromise.then(function(citeprocEngine){
            log.verbose("Async portion done: doing actual citation processing and sending response");
            var responseJson = {};
            var bib;
            
            // Set output format
            citeprocEngine.cslEngine.setOutputFormat(requestConfig.outputformat);
            
            // Add items posted with request
            citeprocEngine.cslEngine.updateItems(preparedData.reqItemIDs);
            log.verbose('Items updated');
            if (citeprocEngine.cslEngine.opt.sort_citations) {
                log.verbose("Currently using a sorting style", 1);
            }
            
            citeprocEngine.cslEngine.opt.development_extensions.wrap_url_and_doi = (requestConfig.linkwrap == "1");
            log.verbose('citeproc wrap_url_and_doi: ' +
                        citeprocEngine.cslEngine.opt.development_extensions.wrap_url_and_doi);
            
            // Switch process depending on bib or citation
            if (requestConfig.bibliography == "1") {
                log.verbose('Generating bib');
                bib = citeprocEngine.cslEngine.makeBibliography();
                log.silly("bib: " + bib);
                responseJson.bibliography = bib;
            }
            if (requestConfig.citations == "1") {
                log.verbose('Generating citations');
                var citations = [];
                if (preparedData.citationClusters) {
                    for (var i = 0; i < preparedData.citationClusters.length; i++) {
                        citations.push(citeprocEngine.cslEngine.appendCitationCluster(preparedData.citationClusters[i], true)[0]);
                    }
                }
                else {
                    log.error("citations requested with no citationClusters");
                }
                log.silly("citations: " + citations);
                responseJson.citations = citations;
            }
            
            var write = '';
            // Write the CSL output to the http response
            if (requestConfig.responseformat == "json") {
                response.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8'
                });
                write = JSON.stringify(responseJson);
            }
            else {
                if (requestConfig.outputformat == 'html'){
                    response.writeHead(200, {
                        'Content-Type': 'text/html; charset=utf-8',
                    });
                }
                else if (requestConfig.outputformat == 'rtf'){
                    response.writeHead(200, {
                        'Content-Type': 'text/rtf; charset=utf-8',
                    });
                }
                // not sure yet what should actually be written here, but will just do assembled bib for now
                if (bib) {
                    write += bib[0].bibstart + bib[1].join('') + bib[0].bibend;
                }
            }
            
            response.write(write, 'utf8');
            response.end();
            log.verbose("Response sent");
            
            //reset citeproc engine before saving
            citeprocEngine.cslEngine.sys.items = {};
            citeprocEngine.cslEngine.opt.development_extensions.wrap_url_and_doi = false;
            if (!postedStyle) {
                engineCache.saveEngine(citeprocEngine, styleUrlObj.href, requestConfig.locale);
            }
        }).catch(function(err){
            log.error("Error while handling request: ", err);
            /*
            if (typeof err === "string") {
                log.error(pre + err);
            }
            else if (err.hasOwnProperty('stack')) {
                log.error(pre + err.stack);
            }
            else {
                log.error(pre + console.trace());
            }
            */
            
            var status = typeof err == "object" && err.statusCode ?
                err.statusCode : 500;
            var msg = typeof err === "string" ?
                err : typeof err == "object" && err.message ?
                err.message : 
                "Unknown error occurred";
            
            response.writeHead(status, {
                'Content-Type': 'text/plain; charset=utf-8',
            });
            response.end(msg);
        });
    });
}).listen(config.port);

log.info('Server running at http://127.0.0.1:' + config.port);

process.on('uncaughtException', function(err) {
    log.error("Uncaught exception!  " + err);
});


