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
'use strict';

//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
var fs = require('fs');
var http = require('http');
var url = require('url');
var jsdom = require('jsdom');
var log = require('npmlog');
var Promise = require('bluebird');
var citeproc = require('./citeprocnode');

exports.NoncacheEngineCache = function(config){
    if(config){
        this.config = config;
    }
};

exports.NoncacheEngineCache.prototype.getEngine = function(styleUrlObj, locale) {
    var engineCache = this;

    return engineCache.cslLoader.fetchIndependentStyle(styleUrlObj)
    .then(function(fetchedCslXml){
        if(engineCache.config.parser == "xml"){
            var citeprocEngine = new citeproc.CiteprocEngine({}, fetchedCslXml, locale, engineCache.localeManager, null);
        } else if(engineCache.config.parser == "json") {
            var cslObject = JSON.parse(fetchedCslXml);
            //console.log(JSON.stringify(cslObject));
            var citeprocEngine = new citeproc.CiteprocEngine({}, cslObject, locale, engineCache.localeManager, null);
        }
        return citeprocEngine;
    });
};


/**
 * EngineCache stores initialized CiteprocEngines so styles and locales do not
 * need to be read from disk, parsed, and initialized on every request.
 * @param {object} config Optional config to specify eg cache size
 */
exports.EngineCache = function(config){
    var engineCache = this;
    // Object for storing initialized CSL Engines by config options
    // key is style, lang
    this.cachedEngines = {};
    this.cachedEngineCount = 0;
    if(config){
        this.config = config;
    }
    this.config.individualCacheSize = 5;
    this.workingEngines = {};
};

/**
 * Default config for EngineCache instance
 * @type {Object}
 */
exports.EngineCache.prototype.config = {
    "engineCacheSize" : 40,
    "individualCacheSize" : 5,
};

/**
 * Get a cached engine, or create a new engine
 * @param  {[type]} styleUri [description]
 * @param  {[type]} locale   [description]
 * @return {[type]}          [description]
 */
exports.EngineCache.prototype.getEngine = function(styleUrlObj, locale) {
    var engineCache = this;
    //try to get a cached engine
    var cachedEngine = engineCache.loadEngine(styleUrlObj.href, locale);
    if(cachedEngine){
        return Promise.resolve(cachedEngine);
    }
    else{
        return engineCache.cslLoader.fetchIndependentStyle(styleUrlObj)
        .then(function(fetchedCslXml){
            if(engineCache.config.parser == "xml"){
                var citeprocEngine = new CiteprocEngine({}, fetchedCslXml, locale, engineCache.localeManager, null);
            } else if(engineCache.config.parser == "json") {
                var cslObject = JSON.parse(fetchedCslXml);
                //console.log(JSON.stringify(cslObject));
                var citeprocEngine = new CiteprocEngine({}, cslObject, locale, engineCache.localeManager, null);
            }
            return citeprocEngine;
        });
    }
};

/**
 * Attempt to load an appropriate CiteprocEngine from the cache.
 * @param  {string} styleUri style href
 * @param  {string} locale   language engine is initialized for
 * @return {CiteprocEngine}  CiteprocEngine initialized with desired style and language
 */
exports.EngineCache.prototype.loadEngine = function(styleUri, locale) {
    var engineCache = this;
    log.verbose('EngineCache.loadEngine');
    
    if ((!styleUri) || (!locale)){
        //can't fully qualify style
        return false;
    }
    var cacheEngineString = styleUri + ':' + locale;
    log.verbose("Fully qualified name of style+locale: " + cacheEngineString);
    if ((typeof engineCache.cachedEngines[cacheEngineString] == 'undefined') ||
        (typeof engineCache.cachedEngines[cacheEngineString].store == 'undefined')) 
    {
        log.info("No cached engine found");
        return false;
    }

    if (engineCache.cachedEngines[cacheEngineString].store instanceof Array) {
        // Have the processor on record
        if (engineCache.cachedEngines[cacheEngineString].store.length === 0) {
            // Don't have any of this processor ready for work
            return false;
        }

        // Processor ready waiting for work
        var citeprocEngine = engineCache.cachedEngines[cacheEngineString].store.pop();
        engineCache.cachedEngineCount--;
        citeprocEngine.cslEngine.sys.items = {};
        citeprocEngine.cslEngine.updateItems([]);
        citeprocEngine.cslEngine.restoreProcessorState();
        return citeprocEngine;
    }

    // This shouldn't happen
    return false;
};

/**
 * Save a CiteprocEngine to the cache. Identified by styleuri:locale
 * @param  {CiteprocEngine} citeprocEngine engine to save
 * @param  {string} styleUri       style href
 * @param  {string} locale         locale engine is initialized for
 * @return {undefined}                
 */
exports.EngineCache.prototype.saveEngine = function(citeprocEngine, styleUri, locale){
    var engineCache = this;
    log.verbose('EngineCache.saveEngine');
    var cacheEngineString = styleUri + ':' + locale;
    log.verbose('EngineCache.saveEngine', cacheEngineString);
    citeprocEngine.cslEngine.sys.items = {};
    citeprocEngine.cslEngine.updateItems([]);
    citeprocEngine.cslEngine.restoreProcessorState();
    
    if(typeof engineCache.cachedEngines[cacheEngineString] == 'undefined'){
        log.info("saving engine");
        engineCache.cachedEngines[cacheEngineString] = {store: [citeprocEngine], used: Date.now()};
    }
    else{
        if(engineCache.cachedEngines[cacheEngineString].store instanceof Array){
            log.verbose('EngineCache.saveEngine', 'pushing instance of engine');
            engineCache.cachedEngines[cacheEngineString].store.push(citeprocEngine);
            engineCache.cachedEngines[cacheEngineString].used = Date.now();
            log.verbose('EngineCache.saveEngine', 'cachedEngines[cacheEngineString].store.length:' + engineCache.cachedEngines[cacheEngineString].store.length);
        }
    }
    
    //increment saved count and possibly clean the cache
    //allow cache to grow to 110% of configured size, then clear down to 90%
    engineCache.cachedEngineCount++;
    if(engineCache.cachedEngineCount > (engineCache.config.engineCacheSize * 1.1)){
        engineCache.cachedEngineCount = engineCache.clean();
    }
};

/**
 * Clean engine cache by removing LRU engines until we're under the desired amount
 * @return {int} Total count of cached engines remaining
 */
exports.EngineCache.prototype.clean = function(){
    log.verbose("EngineCache", "clean");
    var engineCache = this;
    var gcCacheArray = [];
    var totalCount = 0;
    var cachedEngines = engineCache.cachedEngines;
    var i;
    //add cached engine stores to array for sorting
    for(i in cachedEngines){
        gcCacheArray.push(i);
        log.verbose(i);
        totalCount += cachedEngines[i].store.length;
    }
    log.verbose("EngineCache.clean", "TOTAL COUNT: " + totalCount);
    //only clean if we have more engines than we're configured to cache
    if(totalCount > (engineCache.config.engineCacheSize * 0.9) ){
        //sort by last used
        gcCacheArray.sort(function(a, b){
            return engineCache.cachedEngines[b].used - engineCache.cachedEngines[a].used;
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
    log.verbose("EngineCache.clean", "DONE CLEANING CACHE. TOTAL COUNT: " + totalCount);
    return totalCount;
};

/**
 * Clear cachedEngines object so they can be garbarge collected by VM
 * @return {undefined} 
 */
exports.EngineCache.prototype.clear = function(){
    let engineCache = this;
    //get rid of all the cached engines
    engineCache.cachedEngines = {};
    //TODO:
    //re-initialize csl fetcher so new styles are known
};



/**
 * EngineCache stores initialized CiteprocEngines so styles and locales do not
 * need to be read from disk, parsed, and initialized on every request.
 * @param {object} config Optional config to specify eg cache size
 */
exports.QueueCache = function(config){
    var engineCache = this;
    // Object for storing initialized CSL Engines by config options
    // key is style, lang
    this.cachedEngines = {};
    this.cachedEngineCount = 0;
    if(config){
        this.config = config;
    }
    this.workingEngines = {};
};

/**
 * Default config for EngineCache instance
 * @type {Object}
 */
exports.QueueCache.prototype.config = {
    "parser": "xml"
};

/**
 * Get a cached engine, or create a new engine
 * @param  {[type]} styleUri [description]
 * @param  {[type]} locale   [description]
 * @return {[type]}          [description]
 */
exports.QueueCache.prototype.getEngine = function(styleUrlObj, locale) {
    let engineCache = this;
    //try to get a cached engine
    let styleUri = styleUrlObj.href
    if ((!styleUri) || (!locale)){
        //can't fully qualify style
        return Promise.reject();
    }
    let cacheEngineString = styleUri + ':' + locale;
    
    if (typeof engineCache.cachedEngines[cacheEngineString] == 'undefined') {
        log.info("No cached engine found");
        let newEngine = engineCache.buildNewEngine(styleUrlObj, locale);
        engineCache.cachedEngines[cacheEngineString] = newEngine;
        newEngine.working = true;
        return newEngine;
    } else {
        return engineCache.cachedEngines[cacheEngineString].then(function(citeprocEngine){
            if(citeprocEngine instanceof citeproc.CiteprocEngine){
                if(citeprocEngine.working){
                    return Promise.delay(10).then(function(){
                        return engineCache.getEngine(styleUrlObj, locale);
                    });
                }
                log.info("returning existing citeproc instance from QueueCache.getEngine");
                citeprocEngine.working = true;
                citeprocEngine.cslEngine.sys.items = {};
                citeprocEngine.cslEngine.updateItems([]);
                citeprocEngine.cslEngine.restoreProcessorState();
                return citeprocEngine;
            } else {
                let newEngine = engineCache.buildNewEngine(styleUrlObj, locale);
                engineCache.cachedEngines[cacheEngineString] = newEngine;
                return newEngine;
            }
        });
    }
};

exports.QueueCache.prototype.returnEngine = function(styleUrlObj, locale, engine) {
    //noop
};

exports.QueueCache.prototype.buildNewEngine = function(styleUrlObj, locale){
    let engineCache = this;
    return engineCache.cslLoader.fetchIndependentStyle(styleUrlObj)
    .then(function(fetchedCslXml){
        let citeprocEngine;
        if(engineCache.config.parser == "xml"){
            citeprocEngine = new citeproc.CiteprocEngine({}, fetchedCslXml, locale, engineCache.localeManager, null);
        } else if(engineCache.config.parser == "json") {
            let cslObject = JSON.parse(fetchedCslXml);
            citeprocEngine = new citeproc.CiteprocEngine({}, cslObject, locale, engineCache.localeManager, null);
        }
        return citeprocEngine;
    });
};

exports.QueueCache.prototype.clear = function(){
    let engineCache = this;
    engineCache.cachedEngines = {}
};

/**
 * EngineCache stores initialized CiteprocEngines so styles and locales do not
 * need to be read from disk, parsed, and initialized on every request.
 * @param {object} config Optional config to specify eg cache size
 */
exports.GeneratorQueueCache = function(config){
    var engineCache = this;
    // Object for storing initialized CSL Engines by config options
    // key is style, lang
    this.cachedEngines = {};
    this.cachedEngineCount = 0;
    this.cachedGenerators = {};
    if(config){
        this.config = config;
    }
    this.workingEngines = {};
};

/**
 * Default config for EngineCache instance
 * @type {Object}
 */
exports.GeneratorQueueCache.prototype.config = {
    "parser" : "xml",
};

/**
 * Get a cached engine, or create a new engine
 * @param  {[type]} styleUri [description]
 * @param  {[type]} locale   [description]
 * @return {[type]}          [description]
 */
exports.GeneratorQueueCache.prototype.getEngine = function(styleUrlObj, locale) {
    let engineCache = this;
    log.info("GeneratorQueueCache getEngine");
    //try to get a cached engine
    let styleUri = styleUrlObj.href
    if ((!styleUri) || (!locale)){
        //can't fully qualify style
        return Promise.reject();
    }
    let cacheEngineString = styleUri + ':' + locale;
    log.info("cacheEngineString: " + cacheEngineString);
    if (typeof engineCache.cachedGenerators[cacheEngineString] == 'undefined') {
        engineCache.cachedGenerators[cacheEngineString] = engineCache.engineGen(styleUrlObj, locale);
    }
    
    let engine = engineCache.cachedGenerators[cacheEngineString].next().value;
    if(engine === false) {
        return Promise.delay(10).then(function(){
            log.info("" + Date.now() + " delayed N ms; recursing");
            return engineCache.getEngine(styleUrlObj, locale);
        });
    } else {
        log.info("got non-false value from generator; returning from getEngine with that value after N ms");
        return engine;
    }
};

exports.GeneratorQueueCache.prototype.engineGen = function*(styleUrlObj, locale) {
    let engineCache = this;
    let styleUri = styleUrlObj.href;
    if ((!styleUri) || (!locale)){
        //can't fully qualify style
        log.Error("Can't fully qualify style");
        throw "Can't fully qualify style";
    }
    
    let cacheEngineString = styleUri + ':' + locale;
    let newEngine = engineCache.buildNewEngine(styleUrlObj, locale);
    engineCache.cachedEngines[cacheEngineString] = newEngine;
    while(true) {
        let e = engineCache.cachedEngines[cacheEngineString]
        if((e !== true)) {
            engineCache.cachedEngines[cacheEngineString] = true;
            yield e;
            continue;
        } else {
            yield false;
        }
    }
};

exports.GeneratorQueueCache.prototype.returnEngine = function(styleUrlObj, locale, engine) {
    let engineCache = this;
    log.info("returnEngine");
    let styleUri = styleUrlObj.href;
    let cacheEngineString = styleUri + ':' + locale;
    engine.working = false;
    engineCache.cachedEngines[cacheEngineString] = Promise.resolve(engine);
    return;
};

exports.GeneratorQueueCache.prototype.buildNewEngine = function(styleUrlObj, locale){
    let engineCache = this;
    return engineCache.cslLoader.fetchIndependentStyle(styleUrlObj)
    .then(function(fetchedCslXml){
        let citeprocEngine;
        if(engineCache.config.parser == "xml"){
            citeprocEngine = new citeproc.CiteprocEngine({}, fetchedCslXml, locale, engineCache.localeManager, null);
        } else if(engineCache.config.parser == "json") {
            let cslObject = JSON.parse(fetchedCslXml);
            //console.log(JSON.stringify(cslObject));
            citeprocEngine = new citeproc.CiteprocEngine({}, cslObject, locale, engineCache.localeManager, null);
        }
        return citeprocEngine;
    });
};


