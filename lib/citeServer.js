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
    - locales
    - citeprocnode
    - defaultCiteserverConfig
    - defaultRequestConfig
    - defaultResponseHeaders
    - config
    - requestTimes
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
        - postObj
        - preparedData
*/

/**
 * TODO: allow requests to pass forceLang http://gsl-nagoya-u.net/http/pub/citeproc-doc.html#instantiation-csl-engine
 * Figure out if we can set it on a per request basis or not.
 * Cursory examination suggests it gets set in csl engine constructor
 * and likely effects the building of the engine state which would
 * preclude us from efficiently taking advantage without using forceLang
 * as an additional engine cache filter.
 */

//var repl = require('repl');
var fs = require('fs');
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var _ = require('underscore')._;
var log = require('npmlog');
var Promise = require('bluebird');
var styles = require('./styles');
var locales = require('./locales');
var citeprocnode = require('./citeprocnode');

//  Read the config file, merge in the defaults
var defaultCiteserverConfig = {
    "logLevel" : "verbose",
    "localesPath" : "./csl-locales",
    "cslPath" : "./csl",
    "engineCacheSize" : 40,
    "port" : 8085,
    "allowCors": true,
    "timings": false,
    "debug": true,
}

var defaultRequestConfig = {
    bibliography: '1',
    citations: '0',
    outputformat: 'html',
    responseformat: 'json',
    locale: 'en-US',
    style: 'chicago-author-date',
//    forceLang: '0',
    memoryUsage: '0',
    linkwrap: '0',
    clearCache: '0'
};

var defaultResponseHeaders = {};

var config = JSON.parse(fs.readFileSync(__dirname + '/../citeServerConf.json', 'utf8'));
config = _.extend({}, defaultCiteserverConfig, config);

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

// Instantiate resource managers
var cslLoader = new styles.CslLoader(config);
var localeManager = new locales.LocaleManager(config.localesPath);
var engineCache = new citeprocnode.EngineCache(config);

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
        if (typeof request.POSTDATA === "undefined") {
            request.POSTDATA = data;
        }
        else {
            request.POSTDATA += data;
        }
    });
    request.on('end', function() {
        log.verbose('POST data completely received');
        var parsedQuery, requestConfig, preparedData, postedStyle,
            styleUrlObj, citeprocEngine, cslXml;
        
        Promise.resolve().then(function(){
            // Parse url from request object, and merge it with default config
            parsedQuery = querystring.parse(url.parse(request.url).query);
            log.verbose("parsedQuery", parsedQuery);
            requestConfig = _.extend({}, defaultRequestConfig, parsedQuery);
            requestConfig.locale = localeManager.chooseLocale(requestConfig.locale);
            log.verbose("Request configuration: %j", requestConfig);
            
            //make just memoryUsage response if requested
            // FIXME:  this should use GET
            if ((config.debug) && (requestConfig.memoryUsage == '1')){
                var memoryUsage = process.memoryUsage();
                memoryUsage['cachedEngines'] = engineCache.cachedEngineCount;
                log.info("MEMORY USAGE: " + memoryUsage);
                response.writeHead(200);
                response.end(JSON.stringify(memoryUsage));
                return;
            }
            
            // clearCache command
            if (requestConfig.clearCache == '1'){
                if(request.socket.remoteAddress == '127.0.0.1'){
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
                postObj = JSON.parse(request.POSTDATA);
            }
            catch(err){
                throw {'statusCode': 400, 'message': "Could not parse POSTed data"};
            }
            
            preparedData = citeprocnode.prepareData(postObj, requestConfig.citations);
            postedStyle = postObj.hasOwnProperty('styleXml');
            citeprocEngine = false;
        }).then(function(){
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
            return citePromise;
        }).then(function(citeprocEngine){
            //finish with synchronous processing and responding
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
            switch(requestConfig.responseformat){
                case 'json':
                    response.writeHead(200, {
                        'Content-Type': 'application/json; charset=utf-8'
                    });
                    write = JSON.stringify(responseJson);
                    break;
                case 'html':
                case 'rtf':
                    response.writeHead(200, {
                        'Content-Type': 'text/' +
                        requestConfig.responseformat +
                        '; charset=utf-8',
                    });
                    
                    if (bib) {
                        write += bib[0].bibstart + bib[1].join('') + bib[0].bibend;
                    }
                    break;
                default:
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
            var msg = "Error processing request";
            var status = 500;
            if(err.hasOwnProperty('statusCode') && err.hasOwnProperty('message')){
                msg = err.message;
                status = err.statusCode;
            }
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


