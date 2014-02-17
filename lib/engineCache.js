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

//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
var fs = require('fs');
var http = require('http');
var url = require('url');
var jsdom = require('jsdom');
var log = require('npmlog');
var Promise = require('bluebird');
var citeproc = require('./citeprocnode');


var CiteprocEngine = function(citeprocSys, cslXml, locale){
    this.citeprocSys = citeprocSys;
    this.locale = locale;
    this.cslXml = cslXml;
    this.engine = citeproc.createEngine(citeprocSys, cslXml, locale);
};

//needs retrieveLocale and retrieveItem for citeprocEngine to use
exports.EngineCache = function(config){
    var engineCache = this;
    // Object for storing initialized CSL Engines by config options
    // key is style, lang
    this.cachedEngines = {};
    this.cachedEngineCount = 0;
    this.config = config;
};

exports.EngineCache.prototype.createEngine = function(cslXml, locale){
    var engineCache = this;
    log.verbose('EngineCache.createEngine');
    var cpSys = {
        items: zcreq.reqItemsObj,
        retrieveLocale: zcite.retrieveLocale,
        retrieveItem: function(itemID){ return this.items[itemID]; }
    };
    
    log.verbose("cpSys created");
    log.verbose(locale);
    
    var citeprocEngine = new CiteprocEngine(cpSys, );
    try {
        citeprocEngine = zcite.citeproc.createEngine(cpSys, cslXml, locale);
    }
    catch (err) {
        callback("Error creating citeproc engine: " + err);
        return;
    }
    
    log.verbose('Engine created');
    return citeprocEngine;
};
/*
exports.EngineCache.prototype.precacheEngine = function(cslXml, locale){
    var engineCache = this;
    log.verbose('EngineCache.precacheEngine');
    var engine = engineCache.createEngine(cslXml, locale);
    engine.sys.items = {};
    engineCache.cacheSaveEngine(engine, )
};
*/
// Try to load a csl engine specified by styleuri:locale from the cache
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

//save a csl engine specified by styleuri:locale
exports.EngineCache.prototype.saveEngine = function(citeproc, styleUri, locale){
    var engineCache = this;
    log.verbose('EngineCache.saveEngine');
    var cacheEngineString = styleUri + ':' + locale;
    log.verbose(cacheEngineString);
    citeproc.sys.items = {};
    citeproc.updateItems([]);
    citeproc.restoreProcessorState();
    
    if(typeof engineCache.cachedEngines[cacheEngineString] == 'undefined'){
        log.info("saving engine");
        engineCache.cachedEngines[cacheEngineString] = {store: [citeproc], used: Date.now()};
    }
    else{
        if(engineCache.cachedEngines[cacheEngineString].store instanceof Array){
            log.info('pushing instance of engine');
            engineCache.cachedEngines[cacheEngineString].store.push(citeproc);
            engineCache.cachedEngines[cacheEngineString].used = Date.now();
            log.info('cachedEngines[cacheEngineString].store.length:' + engineCache.cachedEngines[cacheEngineString].store.length);
        }
    }
    
    //increment saved count and possibly clean the cache
    engineCache.cachedEngineCount++;
    if(engineCache.cachedEngineCount > engineCache.config.engineCacheSize){
        engineCache.cachedEngineCount = engineCache.cleanCache();
    }
};

//clean up cache of engines
exports.EngineCache.prototype.clean = function(){
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
    log.verbose("TOTAL COUNT: " + totalCount);
    //only clean if we have more engines than we're configured to cache
    if(totalCount > config.engineCacheSize){
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
    log.verbose("DONE CLEANING CACHE");
    return totalCount;
};

exports.EngineCache.prototype.clear = function(){
    //get rid of all the cached engines
    engineCache.cachedEngines = {};
    //TODO:
    //re-initialize csl fetcher so new styles are known
};

