/*
  This module provides a thin wrapper around the citeproc-js module in
  citeprocmodule.js, which is copied as-is from 
  https://bitbucket.org/fbennett/citeproc-js.
*/

//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
var fs = require('fs');
var http = require('http');
var url = require('url');
var jsdom = require('jsdom');
var log = require('npmlog');
var Promise = require('bluebird');
var _ = require('underscore')._;

//var sampleCites = require('../test/loadcitesnode.js');

exports.prepareData = function(postObj, citations){
    log.verbose("citeprocnode.prepareData");
    // Get items object for this request from post body
    var reqItemIDs = (typeof postObj.itemIDs == 'undefined') ? [] : postObj.itemIDs;
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
    
    // Add citationItems if not defined in request
    var citationClusters;
    if (citations == '1') {
        if (postObj.citationClusters) {
            citationClusters = postObj.citationClusters;
        }
        else{
            citationClusters = [];
            for (i = 0; i < reqItemIDs.length; i++){
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
        }
    }
    
    return {
        'reqItemIDs': reqItemIDs,
        'reqItemsObj': reqItemsObj,
        'citationClusters': citationClusters
    };
};

/**
 * Container that holds a citeproc-js Engine instantiation and metadata about it
 * @param {Object} reqItemsObj   Object holding items for a citation request
 * @param {string} cslXml        xml of the CSL style as a string
 * @param {string} locale        string specifying locale of the engine
 * @param {LocaleManager} localeManager LocaleManager that will be used for the retrieveLocale function required by CSL Engine
 * @param {bool} forceLang     toggle forcing language for CSL Engine (http://gsl-nagoya-u.net/http/pub/citeproc-doc.html#instantiation-csl-engine)
 */
exports.CiteprocEngine = function(reqItemsObj, cslXml, locale, localeManager, forceLang){
    log.verbose("CiteprocEngine constructor");
    this.citeprocSys = citeprocSys;
    this.cslXml = cslXml;
    this.locale = locale;
    this.localeManager = localeManager;
    
    var citeprocSys = {
        items: reqItemsObj,
        retrieveLocale: _.bind(localeManager.retrieveLocale, localeManager),
        retrieveItem: function(itemID){ return this.items[itemID]}
    };
    
    var CSL = require("./citeprocmodule").CSL;
    var cslEngine = new CSL.Engine(citeprocSys, cslXml, locale, forceLang);
    
    this.cslEngine = cslEngine;
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
};

/**
 * Default config for EngineCache instance
 * @type {Object}
 */
exports.EngineCache.prototype.config = {
    "engineCacheSize" : 40
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
        var citeproc = engineCache.cachedEngines[cacheEngineString].store.pop();
        engineCache.cachedEngineCount--;
        citeproc.sys.items = {};
        citeproc.updateItems([]);
        citeproc.restoreProcessorState();
        return citeproc;
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
    log.verbose(cacheEngineString);
    citeprocEngine.cslEngine.sys.items = {};
    citeprocEngine.cslEngine.updateItems([]);
    citeprocEngine.cslEngine.restoreProcessorState();
    
    if(typeof engineCache.cachedEngines[cacheEngineString] == 'undefined'){
        log.info("saving engine");
        engineCache.cachedEngines[cacheEngineString] = {store: [citeprocEngine], used: Date.now()};
    }
    else{
        if(engineCache.cachedEngines[cacheEngineString].store instanceof Array){
            log.info('pushing instance of engine');
            engineCache.cachedEngines[cacheEngineString].store.push(citeprocEngine);
            engineCache.cachedEngines[cacheEngineString].used = Date.now();
            log.info('cachedEngines[cacheEngineString].store.length:' + engineCache.cachedEngines[cacheEngineString].store.length);
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
    //get rid of all the cached engines
    engineCache.cachedEngines = {};
    //TODO:
    //re-initialize csl fetcher so new styles are known
};


