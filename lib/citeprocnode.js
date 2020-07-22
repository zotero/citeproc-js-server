/**
 * Provide functions to help manage citeproc.js within the context of a
 * continuously running node.js service. Including wrapping citeproc.js
 * engines into objects that keep track in a stable way the values an
 * engine was instantiated with, and a cache of these engines that can be
 * reused for different requests and prevent the overhead of constructing
 * and engine and parsing a style for every request.
 */

"use strict"

//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
var fs = require('fs');
var log = require('npmlog');
var _ = require('underscore')._;
let jsonWalker = require("./json_walker.js");

//var sampleCites = require('../test/loadcitesnode.js');

exports.simpleSys = function(){
    this.items = {};
    this.locales = {};
};

exports.simpleSys.prototype.retrieveLocale = function(locale){
    return this.locales[locale];
};

exports.simpleSys.prototype.retrieveItem = function(itemID){
    return this.items[itemID];
};

exports.simpleSys.prototype.addLocale = function(localeCode, localeString){
    let localeObject;
    try {
        localeObject = JSON.parse(localeString);
    } catch(e) {
        let localeDoc = jsonWalker.MakeDoc(localeString);
        localeObject = jsonWalker.JsonWalker.walkLocaleToObj(localeDoc);
        localeDoc.defaultView.close();
    }
    this.locales[localeCode] = localeObject;
};

exports.simpleSys.prototype.newEngine = function(styleString, locale, forceLang){
    let sys = this;
    let styleObject;
    try {
        styleObject = JSON.parse(styleString);
    } catch(e) {
        let styleDoc = jsonWalker.MakeDoc(styleString);
        styleObject = jsonWalker.JsonWalker.walkStyleToObj(styleDoc).obj;
        styleDoc.defaultView.close();
    }
    
    let CSL = require("./citeproc.js");
    let cslEngine = new CSL.Engine(sys, styleObject, locale);
    return cslEngine;
};

exports.prepareData = function(postObj, citations){
    log.verbose("citeprocnode.prepareData");
    // Get items object for this request from post body
    let reqItemIDs = (typeof postObj.itemIDs == 'undefined') ? [] : postObj.itemIDs;
    let items = postObj.items;
    
    // Initialize the hash of all items.  It will either have been given directly
    // in the POST data, or else make a hash out of the posted array.
    // Function items can be passed in as an object with keys becoming IDs, but ordering 
    // will not be guaranteed
    let reqItemsObj;
    if (items instanceof Array) {
        reqItemsObj = {};
        for (let i = 0; i < items.length; i++){
            let item = items[i];
            let id = item['id'];
            reqItemsObj[id] = item;
            if (typeof postObj.itemIDs == 'undefined'){
                reqItemIDs.push(id);
            }
        }
    }
    else if (typeof items == 'object'){
        reqItemsObj = postObj.items;
        for (let id in reqItemsObj){
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
    let citationClusters;
    if (citations == '1') {
        if (postObj.citationClusters) {
            citationClusters = postObj.citationClusters;
        }
        else{
            citationClusters = [];
            for (let i = 0; i < reqItemIDs.length; i++){
                let itemid = reqItemIDs[i];
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
var CiteprocEngine = function(reqItemsObj, cslXml, locale, localeManager, forceLang){
    log.verbose("CiteprocEngine constructor");
    let citeprocSys = {
        items: reqItemsObj,
        retrieveLocale: _.bind(localeManager.retrieveLocale, localeManager),
        retrieveItem: function(itemID){ return this.items[itemID]}
    };
    this.working = false;
    this.lastUsed = 0;
    this.citeprocSys = citeprocSys;
    this.cslXml = cslXml;
    this.locale = locale;
    this.localeManager = localeManager;
    
    
    let CSL = require("./citeproc.js");
    let cslEngine = new CSL.Engine(citeprocSys, cslXml, locale, forceLang);
    
    this.cslEngine = cslEngine;
};

exports.CiteprocEngine = CiteprocEngine;
