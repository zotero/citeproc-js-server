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

var fs = require('fs');
var http = require('http');
var url = require('url');
var jsdom = require('jsdom');
var cslFetcher = {
    '_cache':{}
};
var log = zcite.log;

/**
 * Initialize cslFetcher by synchronously reading the styles we have
 * @param  {object} config Hash with localesPath and cslPath
 * @return {bool}        returns true when finished
 */
cslFetcher.init = function(config){
    if(typeof config == 'undefined'){
        config = {
            "localesPath" : "./csl-locales",
            "cslPath" : "./csl"
        };
    }
    
    cslFetcher.cslPath = config.cslPath;
    cslFetcher.cslDir = fs.readdirSync(cslFetcher.cslPath);
    cslFetcher.cslDependentDir = fs.readdirSync(cslFetcher.cslPath + '/dependent');
    cslFetcher.cslShortNames = {};
    cslFetcher.cslDependentShortNames = {};
    var i;
    var shortName;
    //map short names that we have independent styles for
    for(i = 0; i < cslFetcher.cslDir.length; i++){
        shortName = cslFetcher.cslDir[i].slice(0, -4);
        cslFetcher.cslShortNames[shortName] = true;
    }
    
    //map short names that we have dependent styles for
    for(i = 0; i < cslFetcher.cslDependentDir.length; i++){
        shortName = cslFetcher.cslDependentDir[i].slice(0, -4);
        cslFetcher.cslDependentShortNames[shortName] = true;
    }
    return true;
};

cslFetcher.getCachedStyle = function(url){
    //log.error('cslFetcher.getCachedStyle');
    if(typeof this._cache[url] != 'undefined'){
        return this._cache[url];
    }
    else{
        return false;
    }
};

cslFetcher.processStyleIdentifier = function(style){
    log.verbose("processStyleIdentifier");
    var urlObj = url.parse(style);
    if(typeof urlObj.host == "undefined"){
        log.verbose("short name only");
        //short name, treat as a zotero.org/styles url
        var newStyleUrl = 'http://www.zotero.org/styles/' + style;
        urlObj = url.parse(newStyleUrl);
        urlObj.shortName = style;
    }
    else if(urlObj.host == 'www.zotero.org'){
        log.verbose("www.zotero.org host");
        if(typeof urlObj.pathname == 'string'){
            urlObj.shortName = urlObj.pathname.substr(8);
        }
    }
    else{
        log.verbose("default");
        if(typeof urlObj.pathname == 'string'){
            urlObj.shortName = urlObj.pathname.substr(8);
        }
    }
    return urlObj;
};

cslFetcher.resolveStyle = function(zcreq, callback){
    log.verbose("resolveStyle");
    var urlObj = zcreq.styleUrlObj;
    var shortName = urlObj.shortName;

    // FIXME:  for debugging, force the style name:
    shortName = 'modern-language-association';
    
    //check if independent style from zotero repo
    if((typeof this.cslShortNames[shortName] != 'undefined') && (this.cslShortNames[shortName] === true)){
        log.verbose("independent style");
        callback(null, zcreq);
        //var filename = this.cslDirPath + '/' + shortName + '.csl';
        //return filename;
    }
    //check if dependent file from zotero repo
    else if(typeof this.cslDependentShortNames[shortName] != 'undefined'){
        log.verbose("dependent style");
        //cached dependent style reference
        if(typeof cslFetcher.cslDependentShortNames[shortName] == "string"){
            var parentStyle = cslFetcher.cslDependentShortNames[shortName];
            zcreq.styleUrlObj = cslFetcher.processStyleIdentifier(parentStyle);
            callback(null, zcreq);
        }
        //dependent style we haven't resolved before
        else{
            var filename = this.cslPath + '/dependent/' + shortName + '.csl';
            log.verbose("dependent filename: " + filename);
            fs.readFile(filename, 'utf8', function(err, data){
                if(err){
                    callback(err, zcreq);
                }
                log.verbose("read dependent file");
                var dependentcsl = data;
                var parentStyle = cslFetcher.readDependent(dependentcsl);
                log.verbose(parentStyle);
                if(parentStyle === false){
                    callback("Error resolving dependent style", zcreq);
                }
                cslFetcher.cslDependentShortNames[shortName] = parentStyle;
                //log.verbose("about to process " + parentStyle);
                //log.verbose(zcreq);
                zcreq.styleUrlObj = cslFetcher.processStyleIdentifier(parentStyle);
                callback(err, zcreq);
            });
        }
    }
    else{
        log.error("no style found");
        callback({statusCode:404, message:"style not found"}, zcreq);
    }
};

cslFetcher.fetchStyle = function(zcreq, callback){
    log.verbose("cslFetcher.fetchStyle");
    try{
      //// FIXME:  for debugging, force reading the style from a file
      ////  if(zcreq.postedStyle){
      ////      log.verbose("using the posted style");
      ////      zcreq.cslXml = zcreq.postObj.styleXml;
      ////      callback(null, zcreq);
      ////  }
      ////  else if(zcreq.styleUrlObj.host == 'www.zotero.org'){
            log.verbose("using zotero.org style");
            //check if independent style from zotero repo
      ////      if((typeof this.cslShortNames[zcreq.styleUrlObj.shortName] != 'undefined') && (this.cslShortNames[zcreq.styleUrlObj.shortName] === true)){
                log.verbose('loading independent style from file');
                var filename = cslFetcher.cslPath + '/' + zcreq.styleUrlObj.shortName + '.csl';
                // FIXME:  also, for debugging, for now, force the style filename
                filename = './csl/modern-language-association.csl';
                
                log.verbose(filename);
                fs.readFile(filename, 'utf8', function(err, data){
                    if(err){
                        log.verbose('error loading style from file');
                    }
                    log.verbose('loaded style from file');
                    //log.verbose(data);
                    zcreq.cslXml = data;
                    callback(err, zcreq);
                });
      ////      }
      ////      //check if dependent file from zotero repo
      ////      else if(typeof this.cslDependentShortNames[zcreq.styleUrlObj.shortName] != 'undefined'){
      ////          if(typeof this.cslShortNames[zcreq.styleUrlObj.shortName] == "string"){
      ////              
      ////          }
      ////      }
      ////  }
      ////  else{
      ////      log.verbose("non zotero style requested");
      ////      throw "non-Zotero styles are not supported at this time";
      ////      /*
      ////      var cslXml = '';
      ////      var fetchConn = http.createClient(80, urlObj.host);
      ////      var request = fetchConn.request('GET', urlObj.pathname,
      ////          {'host': urlObj.host});
      ////      request.on('response', function(response){
      ////          if(response.statusCode != 200){
      ////              throw {'message': 'Error fetching CSL'};
      ////          }
      ////          response.setEncoding('utf8');
      ////          response.on('data', function(chunk){
      ////              cslXml += chunk;
      ////          });
      ////          response.on('end', function(){
      ////              zcreq.cslXml = cslXml;
      ////              callback(zcreq);
      ////          });
      ////      });
      ////      request.end();
      ////      */
      ////  }
    }
    catch(err){
        zcite.respondException(err, zcreq.response);
    }
};

cslFetcher.loadStyle = function(style, callback, cargs){
    
};

cslFetcher.readDependent = function(xml){
    log.verbose("cslFetcher.readDependent");
    xml = xml.replace(/\s*<\?[^>]*\?>\s*\n*/g, "");
    xml = xml.replace(/<style\s/, "<cslstyle ").replace("</style", "</cslstyle");
    xml = xml.trim();
    
    var jsdom = require('jsdom').jsdom;
    var dStyle = jsdom(xml);//parser.parseFromString(xml);
    var linkEls = dStyle.getElementsByTagName('link');
    for(var i = 0; i < linkEls.length; i++){
        log.verbose(linkEls[i].getAttribute("rel"));
        if(linkEls[i].getAttribute("rel") == "independent-parent"){
            log.verbose("independent-parent found: " + linkEls[i].getAttribute("href"));
            return linkEls[i].getAttribute("href");
        }
    }
    return false;
};

if (typeof module !== 'undefined' && "exports" in module) {
    exports.cslFetcher = cslFetcher;
}
/*
log.verbose("init cslFetcher");
cslFetcher.init();
var xml = fs.readFileSync("./csl/dependent/radiology.csl", 'utf8');
var independent = cslFetcher.readDependent(xml);
log.verbose(cslFetcher.processStyleIdentifier(independent));
*/
