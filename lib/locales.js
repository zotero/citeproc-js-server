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
    this.locales = {};
    let dir = fs.readdirSync(this.localesPath);
    let len = dir.length;
    for (let i = 0; i < len; i++) {
        let f = dir[i];
        if(f.slice(0, 8) != 'locales-') {
            continue;
        } else {
            let extname = path.extname(f);
            let localeCode = f.slice(8, -(extname.length));
            let localeString = fs.readFileSync(path.join(this.localesPath, f), 'utf8');
            let localeObject;
            try {
                localeObject = JSON.parse(localeString);
            } catch(e) {
                let localeDoc = jsonWalker.MakeDoc(localeString);
                localeObject = jsonWalker.JsonWalker.walkLocaleToObj(localeDoc);
                localeDoc.defaultView.close();
            }
            this.locales[localeCode] = localeObject;
            
            // Make locale available with just language code in some cases
            let matches = localeCode.match(/^([a-z]{2})-([A-Z]{2})/);
            if (matches) {
                let [, lang, region] = matches;
                // If language matches country/region (e.g., 'fr-FR')
                if (lang == region.toLowerCase()
                        // For the more popular variants that don't match the language
                        || (localeCode == 'en-US' || localeCode == 'zh-CN')) {
                    this.locales[lang] = localeObject;
                }
                // If there's not a language-only version (e.g., so that 'ja' finds 'ja-JP')
                else if (!this.locales[lang]) {
                    this.locales[lang] = localeObject;
                }
            }
        }
    }
};

// retrieveLocale function for use by citeproc engine
exports.LocaleManager.prototype.retrieveLocale = function (locale) {
    return this.locales[this.chooseLocale(locale)];
};

exports.LocaleManager.prototype.chooseLocale = function (locale) {
    if (this.locales[locale]) {
        //log.info("found requested locale; returning ", locale);
        return locale;
    }
    
    // Check language (e.g., 'fr')
    let matches = locale.match(/^([a-z]{2})(-|$)/);
    if (matches) {
        let lang = matches[1];
        if (this.locales[lang]) {
            //log.info("found requested language; returning ", lang);
            return lang;
        }
    }
    
    // Fall back to English
    //log.info("locale not found, returning en-US");
    return 'en-US';
};
