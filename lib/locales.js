//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
var fs = require('fs');
var log = require('npmlog');


exports.LocaleManager = function(localesPath){
    this.locales = {};
    var dir = fs.readdirSync(localesPath);
    var len = dir.length;
    for (var i = 0; i < len; i++) {
        var f = dir[i];
        if (f.slice(0, 8) != 'locales-' || f.slice(-4) != '.xml') { continue; }
        var localeCode = f.slice(8, -4);
        //log.silly("localeCode = '" + localeCode + "'");
        this.locales[localeCode] = fs.readFileSync(localesPath + '/' + f, 'utf8');
    }

};

// retrieveLocale function for use by citeproc engine
exports.LocaleManager.prototype.retrieveLocale = function(lang){
    var localeManager = this;
    
    if(localeManager.locales.hasOwnProperty(lang)){
        return localeManager.locales[lang];
    }
    else{
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
