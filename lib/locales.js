/**
 * module to handle checking for presence of, and returning locales
 */

'use strict';

//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
let fs = require('fs');
let log = require('npmlog');
let path = require('path');
let jsonWalker = require("./json_walker.js");

exports.LocaleManager = function(localesPath){
    let localeManager = this;
    localeManager.locales = {};
    localeManager.localesPath = localesPath;
    
    localeManager.initLocales();
    fs.watch(localesPath, {'persistent':false}, function(event, filename){
        log.info("locales changed; re-initializing");
        localeManager.initLocales();
    });
};

exports.LocaleManager.prototype.initLocales = function(){
    let localeManager = this;
    localeManager.locales = {};
    let dir = fs.readdirSync(localeManager.localesPath);
    let len = dir.length;
    for (let i = 0; i < len; i++) {
        let f = dir[i];
        if(f.slice(0, 8) != 'locales-') {
            continue;
        } else {
            let extname = path.extname(f);
            let localeCode = f.slice(8, -(extname.length));
            let localeString = fs.readFileSync(path.join(localeManager.localesPath, f), 'utf8');
            let localeObject;
            try {
                localeObject = JSON.parse(localeString);
            } catch(e) {
                let localeDoc = jsonWalker.MakeDoc(localeString);
                localeObject = jsonWalker.JsonWalker.walkLocaleToObj(localeDoc);
                localeDoc.defaultView.close();
            }
            localeManager.locales[localeCode] = localeObject;
        }
    }
};

// retrieveLocale function for use by citeproc engine
exports.LocaleManager.prototype.retrieveLocale = function(lang){
    let localeManager = this;
    if(localeManager.locales.hasOwnProperty(lang)){
        //log.info("found requested locale; returning ", lang);
        return localeManager.locales[lang];
    }
    else{
        //log.info("locale not found, returning en-US");
        return localeManager.locales['en-US'];
    }
};

exports.LocaleManager.prototype.chooseLocale = function(lang){
    let localeManager = this;
    if(localeManager.locales.hasOwnProperty(lang)){
        return lang;
    }
    else {
        return 'en-US';
    }
};
