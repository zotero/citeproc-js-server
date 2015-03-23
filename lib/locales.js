/**
 * module to handle checking for presence of, and returning locales
 */

//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
var fs = require('fs');
var log = require('npmlog');

exports.LocaleManager = function(localesPath, parserType){
    this.locales = {};
    if(!parserType){
        parserType = "xml";
    }

    var dir = fs.readdirSync(localesPath);
    var len = dir.length;
    for (var i = 0; i < len; i++) {
        var f = dir[i];
        if(parserType == "xml"){
            if (f.slice(0, 8) != 'locales-' || f.slice(-4) != '.xml') {
                continue;
            } else {
                var localeCode = f.slice(8, -4);
                this.locales[localeCode] = fs.readFileSync(localesPath + '/' + f, 'utf8');
            }
        } else if(parserType == "json") {
            if (f.slice(0, 8) != 'locales-' || f.slice(-5) != '.json') {
                continue;
            } else {
                var localeCode = f.slice(8, -5);
                this.locales[localeCode] = JSON.parse(fs.readFileSync(localesPath + '/' + f, 'utf8'));
            }
        }
        
        //log.silly("localeCode = '" + localeCode + "'");
        
    }
};

// retrieveLocale function for use by citeproc engine
exports.LocaleManager.prototype.retrieveLocale = function(lang){
    var localeManager = this;
    if(localeManager.locales.hasOwnProperty(lang)){
        //console.log(JSON.stringify(localeManager.locales[lang]));
        return localeManager.locales[lang];
    }
    else{
        //console.log(JSON.stringify(localeManager.locales['en-US']));
        return localeManager.locales['en-US'];
    }
};

exports.LocaleManager.prototype.chooseLocale = function(lang){
    var localeManager = this;
    if(localeManager.locales.hasOwnProperty(lang)){
        return lang;
    }
    else {
        return 'en-US';
    }
};
