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
/*
  cslFetcher object members:
    - cslPath - path to the CSL directory; from the config; defaults to './csl'
    - cslDir  - object representing the directory
    - cslShortNames - hash whose keys are the base part of the filenames of the
      .csl files in the CSL directory.  Values are the boolean `true`.
    - cslDependentDir - object representing the dependent subdirectory of the CSL 
      directory.
    - cslDependentShortNames - hash of the base names of the dependent style files.
      Unlike cslShortNames, the values here are either:
        - `true` - dependency not yet resolved
        - a string - the name of the style that this one depends on
*/

//TODO: we could promisify the fs callbacks, but they're not ridiculous right now
var fs = require('fs');
var http = require('http');
var url = require('url');
var jsdom = require('jsdom');
var log = require('npmlog');
var Promise = require('bluebird');

/**
 * CslLoader constructor. Runs scanStyles synchronously on instantiation.
 * @param {Object} config config object. Should have at least 'cslPath' if not
 */
exports.CslLoader = function(config){
    var cslLoader = this;
    log.verbose("CslLoader", "initializing");
    
    //use passed config or fall back on prototype default
    if(config){
        cslLoader.config = config;
    }
    
    cslLoader._cache = {};
    cslLoader.cslDir = null;
    cslLoader.cslDependentDir = null;
    cslLoader.cslShortNames = {};
    cslLoader.cslDependentShortNames = {};
    
    cslLoader.scanStyles();
};

exports.CslLoader.prototype.config = {
    "cslPath" : "./csl"
};

/**
 * Scan the configured cslPath for independent, dependent, and renamed styles and populare our maps for lookups. This process is done synchronously.
 * @return {null} No return value
 */
exports.CslLoader.prototype.scanStyles = function(){
    var cslLoader = this;
    log.verbose("CslLoader", "scanStyles");
    
    cslLoader.cslDir = fs.readdirSync(cslLoader.config.cslPath);
    cslLoader.cslDependentDir = fs.readdirSync(cslLoader.config.cslPath + '/dependent');
    cslLoader.cslShortNames = {};
    cslLoader.cslDependentShortNames = {};
    
    var i;
    var shortName;
    //map short names that we have independent styles for
    for(i = 0; i < cslLoader.cslDir.length; i++){
        shortName = cslLoader.cslDir[i].slice(0, -4);
        cslLoader.cslShortNames[shortName] = true;
    }
    
    //map short names that we have dependent styles for
    for(i = 0; i < cslLoader.cslDependentDir.length; i++){
        shortName = cslLoader.cslDependentDir[i].slice(0, -4);
        cslLoader.cslDependentShortNames[shortName] = true;
    }
    
    var renamedFilename = cslLoader.config.cslPath + '/renamed-styles.json';
    cslLoader.renamedMap = JSON.parse(fs.readFileSync(renamedFilename, 'utf8'));
};

exports.CslLoader.prototype.getCslXml = function(styleName){
    log.verbose("CslLoader.getCslXml");
    var cslLoader = this;
    
    return cslLoader.resolveStyle(styleName)
    .then(cslLoader.fetchIndependentStyle)
};

exports.CslLoader.prototype.getCachedStyle = function(url){
    var cslLoader = this;
    log.verbose("CslLoader", "getCachedStyle");
    
    if(cslLoader._cache.hasOwnProperty(url)){
        log.verbose("CslLoader", "cached style found");
        return cslLoader._cache[url];
    }
    log.verbose("CslLoader", "style cache miss");
    return false;
};

/**
 * Parse/Normalize a style with the important result being that the 'shortName'
 * (style without url prefix components) is in the returned object.
 * @param  {string} style string to parse/normalize
 * @return {Object} parsed url object identifying host, domain, etc + shortName
 * property identifying the style
 */
exports.CslLoader.prototype.normalizeStyleIdentifier = function(style){
    var cslLoader = this;
    log.verbose("CslLoader", "processStyleIdentifier");
    
    var urlObj = url.parse(style);
    log.verbose("urlObj ", urlObj);
    if(!urlObj.host){
        log.verbose("CslLoader", "short name only");
        //short name, treat as a zotero.org/styles url
        var newStyleUrl = 'http://www.zotero.org/styles/' + style;
        urlObj = url.parse(newStyleUrl);
        urlObj.shortName = style;
    }
    else if(urlObj.host == 'www.zotero.org'){
        log.verbose("CslLoader", "www.zotero.org host", 5);
        if(typeof urlObj.pathname == 'string'){
            urlObj.shortName = urlObj.pathname.substr(8);
        }
    }
    else{
        log.verbose("CslLoader", "default");
        if(typeof urlObj.pathname == 'string'){
            urlObj.shortName = urlObj.pathname.substr(8);
        }
    }
    return urlObj;
};

/**
 * Resolve a style url or shortName into a normalized style urlObj for an
 * independent style we have, or reject if we can't find it.
 * @param  {string} styleName url or short name for requested style
 * @return {Promise} Promise resolved with a normalized style identifier
 */
exports.CslLoader.prototype.resolveStyle = function(styleName){
    var cslLoader = this;
    log.verbose("CslLoader", "resolveStyle");
    
    return new Promise(function(resolve, reject){
        if(!styleName){
            log.error("CslLoader.resolveStyle", "styleName not specified");
            reject(new Error("shortName not specified"));
        }
        
        var normalized = cslLoader.normalizeStyleIdentifier(styleName);
        var shortName = normalized.shortName;
        
        //check if independent style we have
        if(cslLoader.cslShortNames[shortName] === true){
            log.verbose("CslLoader.resolveStyle", 'known independent style');
            resolve(normalized);
        }
        //dependent style we have and have resolved previously
        else if(typeof cslLoader.cslDependentShortNames[shortName] == "string"){
            log.info("CslLoader.resolveStyle", 'known, previously resolved dependent style');
            var parentStyle = cslFetcher.cslDependentShortNames[shortName];
            resolve(cslLoader.normalizeStyleIdentifier(parentStyle));
        }
        //check if dependent style we have, but unresolved
        else if(cslLoader.cslDependentShortNames[shortName] === true){
            log.verbose("CslLoader.resolveStyle", 'known, but unresolved dependent style');
            var filename = cslLoader.config.cslPath + '/dependent/' + shortName + '.csl';
            log.verbose("CslLoader.resolveStyle", "dependent filename: " + filename);
            fs.readFile(filename, 'utf8', function(err, data){
                if(err){
                    reject(err);
                }
                log.verbose("CslLoader.resolveStyle", "read dependent file");
                var dependentcsl = data;
                var parentStyle = cslLoader.readDependent(dependentcsl);
                log.verbose("CslLoader.resolveStyle", parentStyle);
                if(parentStyle === false){
                    log.error("CslLoader.resolveStyle", "Error resolving dependent style");
                    reject(new Error("Error resolving dependent style"));
                }
                cslLoader.cslDependentShortNames[shortName] = parentStyle;
                resolve(cslLoader.normalizeStyleIdentifier(parentStyle));
            });
        }
        //check if renamed style
        else if(cslLoader.renamedMap.hasOwnProperty(shortName)){
            log.verbose("CslLoader.resolveStyle", "found renamed style");
            var newStyleName = cslLoader.renamedMap[shortName];
            resolve(cslLoader.normalizeStyleIdentifier(newStyleName));
        }
        else{
            log.info("CslLoader.resolveStyle", "No matching style found");
            reject({statusCode:404, message:"style not found"});
        }
    });
};

/**
 * Take a url object, likely returned from resolveStyle, and fetch the xml for an
 * independent CSL style we have locally.
 * @param  {[type]} styleUrlObj [description]
 * @return {[type]}             [description]
 */
exports.CslLoader.prototype.fetchIndependentStyle = function(styleUrlObj){
    var cslLoader = this;
    log.verbose("CslLoader", "fetchIndependentStyle");
    return new Promise(function(resolve, reject){
        if(styleUrlObj.host == 'www.zotero.org'){
            log.verbose("using zotero.org style", 5);
            //check if independent style from zotero repo
            if(cslLoader.cslShortNames[styleUrlObj.shortName] === true){
                log.verbose("CslLoader.fetchIndependentStyle", 'loading independent style from file');
                var filename = cslLoader.config.cslPath + '/' + styleUrlObj.shortName + '.csl';
                log.verbose("CslLoader.fetchIndependentStyle", filename);
                fs.readFile(filename, 'utf8', function(err, data){
                    if(err){
                        log.error("CslLoader.fetchIndependentStyle", 'error loading style from file');
                        reject(err);
                    }
                    log.verbose("CslLoader.fetchIndependentStyle", 'loaded style from file');
                    resolve(data);
                });
            }
            //check if dependent file from zotero repo
            else if(typeof this.cslDependentShortNames[styleUrlObj.shortName] != 'undefined'){
                if(typeof this.cslShortNames[styleUrlObj.shortName] == "string"){
                    log.error("CslLoader.fetchIndependentStyle", "dependent style passed to fetchIndependentStyle, should have already been resolved");
                    reject(new Error("dependent style passed to fetchIndependentStyle, should have already been resolved"));
                }
            }
        }
        else{
            //disallow requesting non-local styles
            log.error("CslLoader.fetchIndependentStyle", "non zotero style requested");
            throw new Error("non-Zotero styles are not supported at this time");
            /*
            var cslXml = '';
            var fetchConn = http.createClient(80, urlObj.host);
            var request = fetchConn.request('GET', urlObj.pathname,
                {'host': urlObj.host});
            request.on('response', function(response){
                if(response.statusCode != 200){
                    throw {'message': 'Error fetching CSL'};
                }
                response.setEncoding('utf8');
                response.on('data', function(chunk){
                    cslXml += chunk;
                });
                response.on('end', function(){
                    resolve(cslXml);
                });
            });
            request.end();
            */
        }
    });
};

/**
 * Take the xml of a dependent CSL style and return the independent parent href
 * @param  {string} xml xml of dependent CSL style as a string
 * @return {string}     value of link element with rel=independent-parent
 */
exports.CslLoader.prototype.readDependent = function(xml){
    log.verbose("CslLoader", "readDependent");
    //clean up xml so it parses properly
    //style nodes are not parsed into DOM trees as real nodes, so replace it with 'cslstyle' node instead
    xml = xml.replace(/\s*<\?[^>]*\?>\s*\n*/g, "");
    xml = xml.replace(/<style\s/, "<cslstyle ").replace("</style", "</cslstyle");
    xml = xml.trim();
    
    var jsdom = require('jsdom').jsdom;
    var dStyle = jsdom(xml);
    var linkEls = dStyle.getElementsByTagName('link');
    for(var i = 0; i < linkEls.length; i++){
        log.verbose("CslLoader.readDependent", linkEls[i].getAttribute("rel"));
        if(linkEls[i].getAttribute("rel") == "independent-parent"){
            log.verbose("CslLoader.readDependent", "independent-parent found: " + linkEls[i].getAttribute("href"));
            return linkEls[i].getAttribute("href");
        }
    }
    return false;
};
