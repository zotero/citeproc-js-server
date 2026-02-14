/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of citeproc-js-server.
    
    Copyright © 2018 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://www.zotero.org
    
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
'use strict';

//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
let fs = require('fs');
let http = require('http');
let url = require('url');
let jsdom = require('jsdom');
let log = require('npmlog');
let citeproc = require('./citeprocnode');
let path = require('path');
let jsonWalker = require("./json_walker.js");

function delay(ms) {
	return new Promise(function(resolve) {
		setTimeout(resolve, ms);
	});
}

exports.NoncacheEngineCache = function(config){
    if(config){
        this.config = config;
    }
};

exports.NoncacheEngineCache.prototype.getEngine = function(styleUrlObj, locale) {
    log.info("noncacheEngineCache:", locale);
    let engineCache = this;

    return engineCache.cslLoader.fetchIndependentStyle(styleUrlObj)
    .then(function(fetchedCslXml){
        let cslObject;
        try{
            //try parsing for pre-converted styles
            cslObject = JSON.parse(fetchedCslXml);
        } catch(e) {
            //json parse failed, so converte an xml style to object
            let cslDoc = jsonWalker.MakeDoc(fetchedCslXml);
            cslObject = jsonWalker.JsonWalker.walkStyleToObj(cslDoc).obj;
            cslDoc.defaultView.close();
        }
        
        let citeprocEngine = new citeproc.CiteprocEngine({}, cslObject, locale, engineCache.localeManager, null);
        return citeprocEngine;
    });
};

exports.NoncacheEngineCache.prototype.returnEngine = function() {
    //noop
};


/**
 * EngineCache stores initialized CiteprocEngines so styles and locales do not
 * need to be read from disk, parsed, and initialized on every request.
 * @param {object} config Optional config to specify eg cache size
 */
exports.QueueCache = function(config){
    let engineCache = this;
    // Object for storing initialized CSL Engines by config options
    // key is style, lang
    this.cachedEngines = {};
    this.cachedEngineCount = 0;
    if(config){
        this.config = config;
    }
    this.workingEngines = {};
    this.dyingEngines = {};
    this.lastUsed = {};
    //set up watch on csl directory, and clear the engine cache when it changes
    if(config.cslPath){
        fs.watch(config.cslPath, {'persistent':false}, function(event, filename){
            engineCache.clear();
        });
    }
};

/**
 * Default config for EngineCache instance
 * @type {Object}
 */
exports.QueueCache.prototype.config = {
    "engineCacheSize" : 100,
};

/**
 * Get a cached engine, or create a new engine
 * @param  {[type]} styleUri [description]
 * @param  {[type]} locale   [description]
 * @return {[type]}          [description]
 */
exports.QueueCache.prototype.getEngine = function(styleUrlObj, locale, _retryStart) {
    let engineCache = this;
    log.verbose("QueueCache", "getEngine %s %s", styleUrlObj.href, locale);
    //try to get a cached engine
    let styleUri = styleUrlObj.href
    if ((!styleUri) || (!locale)){
        //can't fully qualify style
        return Promise.reject();
    }
    let cacheEngineString = styleUri + ':' + locale;
    if (typeof engineCache.cachedEngines[cacheEngineString] == 'undefined') {
        log.info("QueueCache", "building %s", cacheEngineString);
        let newEngine = engineCache.buildNewEngine(styleUrlObj, locale);
        engineCache.cachedEngines[cacheEngineString] = newEngine;
        return newEngine;
    } else {
        return engineCache.cachedEngines[cacheEngineString].then(function(citeprocEngine){
            if(citeprocEngine instanceof citeproc.CiteprocEngine){
                if(citeprocEngine.working){
                    let retryStart = _retryStart || Date.now();
                    if(Date.now() - retryStart > 5000){
                        log.warn("Timed out waiting for engine -- replacing stuck cache entry:", cacheEngineString);
                        let newEngine = engineCache.buildNewEngine(styleUrlObj, locale);
                        engineCache.cachedEngines[cacheEngineString] = newEngine;
                        return newEngine;
                    }
                    return delay(10).then(function(){
                        return engineCache.getEngine(styleUrlObj, locale, retryStart);
                    });
                }
                log.verbose("QueueCache", "cache hit %s", cacheEngineString);
                citeprocEngine.working = true;
                citeprocEngine.cslEngine.sys.items = {};
                citeprocEngine.cslEngine.updateItems([]);
                citeprocEngine.cslEngine.restoreProcessorState();
                return citeprocEngine;
            } else {
                log.warn("citeprocEngine IS NOT instanceof citeproc.CiteprocEngine");
                let newEngine = engineCache.buildNewEngine(styleUrlObj, locale);
                engineCache.cachedEngines[cacheEngineString] = newEngine;
                return newEngine;
            }
        });
    }
};

exports.QueueCache.prototype.returnEngine = function(styleUrlObj, locale, citeprocEngine) {
    let engineCache = this;
    let styleUri = styleUrlObj.href
    let cacheEngineString = styleUri + ':' + locale;
    //if engine has been flagged dead, don't return it
    if(engineCache.dyingEngines[cacheEngineString]){
        log.verbose("QueueCache", "removing dead engine: %s", cacheEngineString);
        delete engineCache.cachedEngines[cacheEngineString];
        delete engineCache.dyingEngines[cacheEngineString];
        return;
    }
    
    //make sure engine is cleaned up, update last used time, and set to not working
    citeprocEngine.cslEngine.sys.items = {};
    citeprocEngine.cslEngine.opt.development_extensions.wrap_url_and_doi = false;
    citeprocEngine.lastUsed = Date.now();
    citeprocEngine.working = false;
    engineCache.lastUsed[cacheEngineString] = Date.now();
    engineCache.cachedEngines[cacheEngineString] = Promise.resolve(citeprocEngine);
    if(Object.keys(engineCache.cachedEngines).length > engineCache.config.engineCacheSize){
        engineCache.clean();
    }
};

exports.QueueCache.prototype.buildNewEngine = function(styleUrlObj, locale){
    let engineCache = this;
    log.verbose("QueueCache", "buildNewEngine %s", url.format(styleUrlObj));
    return engineCache.cslLoader.fetchIndependentStyle(styleUrlObj)
    .then(function(fetchedCslXml){
        let cslObject;
        try{
            //try parsing for pre-converted styles
            cslObject = JSON.parse(fetchedCslXml);
        } catch(e) {
            //json parse failed, so convert an xml style to object
            let cslDoc = jsonWalker.MakeDoc(fetchedCslXml);
            cslObject = jsonWalker.JsonWalker.walkStyleToObj(cslDoc).obj;
            cslDoc.defaultView.close();
        }

        let citeprocEngine = new citeproc.CiteprocEngine({}, cslObject, locale, engineCache.localeManager, null);
        citeprocEngine.working = true;
        return citeprocEngine;
    });
};

exports.QueueCache.prototype.clear = function(){
    let engineCache = this;
    log.info("QueueCache", "clearing engine cache");
    engineCache.dyingEngines = {};
    for(let p in engineCache.cachedEngines){
        engineCache.dyingEngines[p] = true;
    }
    engineCache.cachedEngines = {}
};

/**
 * Clean engine cache by removing LRU engines until we're under the desired amount
 * @return {int} Total count of cached engines remaining
 */
exports.QueueCache.prototype.clean = function(){
    log.verbose("QueueCache", "clean");
    let engineCache = this;
    let gcCacheArray = [];
    let cachedEngines = engineCache.cachedEngines;
    let i;
    let totalCount = Object.keys(cachedEngines).length;
    //only clean if we have more engines than we're configured to cache
    if(totalCount > engineCache.config.engineCacheSize ){
        //add cached engine stores to array for sorting
        for(i in cachedEngines){
            gcCacheArray.push(i);
        }
        
        //sort by last used (oldest first so we evict the coldest)
        gcCacheArray.sort(function(a, b){
            return (engineCache.lastUsed[a] || 0) - (engineCache.lastUsed[b] || 0);
        });

        //evict a third of the cache
        for(i = 0; i < gcCacheArray.length/3; i++){
            let engineStr = gcCacheArray[i];
            delete cachedEngines[engineStr];
        }
    }
    totalCount = Object.keys(cachedEngines).length;
    //log.info(Object.keys(cachedEngines));
    log.info("QueueCache", "evicted to %d engines", totalCount);
    return totalCount;
};

