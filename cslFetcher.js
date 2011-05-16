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

cslFetcher.init = function(config){
    if(typeof config == 'undefined'){
        config = {
            "localesPath" : "./csl-locales",
            "cslPath" : "./csl",
        }
    }
    
    Step = require('step');
    
    cslFetcher.cslPath = config.cslPath;
    cslFetcher.cslDir = fs.readdirSync(cslFetcher.cslPath);
    cslFetcher.cslDependentDir = fs.readdirSync(cslFetcher.cslPath + '/dependent');
    cslFetcher.cslShortNames = {};
    cslFetcher.cslDependentShortNames = {};
    //map short names that we have independent styles for
    for(var i = 0; i < cslFetcher.cslDir.length; i++){
        var shortName = cslFetcher.cslDir[i].slice(0, -4);
        cslFetcher.cslShortNames[shortName] = true;
    }
    
    //map short names that we have dependent styles for
    for(var i = 0; i < cslFetcher.cslDependentDir.length; i++){
        var shortName = cslFetcher.cslDependentDir[i].slice(0, -4);
        cslFetcher.cslDependentShortNames[shortName] = true;
    }
    return true;
}

cslFetcher.getCachedStyle = function(url){
    //zcite.debug('cslFetcher.getCachedStyle', 5);
    if(typeof this._cache[url] != 'undefined'){
        return this._cache[url];
    }
    else{
        return false;
    }
}

cslFetcher.processStyleIdentifier = function(style){
    zcite.debug("processStyleIdentifier", 5);
    var urlObj = url.parse(style);
    if(typeof urlObj.host == "undefined"){
        zcite.debug("short name only", 5);
        //short name, treat as a zotero.org/styles url
        var newStyleUrl = 'http://www.zotero.org/styles/' + style;
        urlObj = url.parse(newStyleUrl);
        urlObj.shortName = style;
    }
    else if(urlObj.host == 'www.zotero.org'){
        zcite.debug("www.zotero.org host", 5);
        if(typeof urlObj.pathname == 'string'){
            urlObj.shortName = urlObj.pathname.substr(8);
        }
    }
    else{
        zcite.debug("default", 5);
        if(typeof urlObj.pathname == 'string'){
            urlObj.shortName = urlObj.pathname.substr(8);
        }
    }
    return urlObj;
};

cslFetcher.resolveStyle = function(zcreq, callback){
    zcite.debug("resolveStyle", 5);
    var urlObj = zcreq.styleUrlObj;
    var shortName = urlObj.shortName;
    //check if independent style from zotero repo
    if((typeof this.cslShortNames[shortName] != 'undefined') && (this.cslShortNames[shortName] === true)){
        zcite.debug("independent style", 5);
        callback(null, zcreq);
        //var filename = this.cslDirPath + '/' + shortName + '.csl';
        //return filename;
    }
    //check if dependent file from zotero repo
    else if(typeof this.cslDependentShortNames[shortName] != 'undefined'){
        zcite.debug("dependent style", 5);
        //cached dependent style reference
        if(typeof cslFetcher.cslDependentShortNames[shortName] == "string"){
            var parentStyle = cslFetcher.cslDependentShortNames[shortName];
            zcreq.styleUrlObj = cslFetcher.processStyleIdentifier(parentStyle);
            callback(null, zcreq);
        }
        //dependent style we haven't resolved before
        else{
            var filename = this.cslPath + '/dependent/' + shortName + '.csl';
            zcite.debug("dependent filename: " + filename, 5);
            fs.readFile(filename, 'utf8', function(err, data){
                zcite.debug("read dependent file", 5);
                var dependentcsl = data;
                var parentStyle = cslFetcher.readDependent(dependentcsl);
                zcite.debug(parentStyle, 5);
                cslFetcher.cslDependentShortNames[shortName] = parentStyle;
                //zcite.debug("about to process " + parentStyle, 5);
                //zcite.debug(zcreq, 5);
                zcreq.styleUrlObj = cslFetcher.processStyleIdentifier(parentStyle);
                callback(err, zcreq);
            });
        }
    }
    else{
        zcite.debug("no style found", 5);
        callback("no style found", zcreq);
    }
};

cslFetcher.fetchStyle = function(zcreq, callback){
    console.log("cslFetcher.fetchStyle");
    try{
        if(zcreq.postedStyle){
            zcite.debug("using the posted style", 5);
            zcreq.cslXml = zcreq.postObj.stylexml;
            callback(null, zcreq);
        }
        else if(zcreq.styleUrlObj.host == 'www.zotero.org'){
            zcite.debug("using zotero.org style", 5);
            //check if independent style from zotero repo
            if((typeof this.cslShortNames[zcreq.styleUrlObj.shortName] != 'undefined') && (this.cslShortNames[zcreq.styleUrlObj.shortName] === true)){
                zcite.debug('loading independent style from file', 5);
                var filename = cslFetcher.cslPath + '/' + zcreq.styleUrlObj.shortName + '.csl';
                zcite.debug(filename, 5);
                fs.readFile(filename, 'utf8', function(err, data){
                    if(err){
                        zcite.debug('error loading style from file', 5);
                    }
                    zcite.debug('loaded style from file', 5);
                    //zcite.debug(data);
                    zcreq.cslXml = data;
                    callback(err, zcreq);
                });
            }
            //check if dependent file from zotero repo
            else if(typeof this.cslDependentShortNames[zcreq.styleUrlObj.shortName] != 'undefined'){
                if(typeof this.cslShortNames[zcreq.styleUrlObj.shortName] == "string"){
                    
                }
            }
        }
        else{
            zcite.debug("non zotero style requested", 5);
            throw "non-Zotero styles are not supported at this time";
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
                    zcreq.cslXml = cslXml;
                    callback(zcreq);
                });
            });
            request.end();
            */
        }
    }
    catch(err){
        zcite.respondException(err, zcreq.response);
    }
}

cslFetcher.loadStyle = function(style, callback, cargs){
    
}

cslFetcher.readDependent = function(xml){
    var jsdom = require('jsdom');
    var dStyle = jsdom.jsdom(xml);//parser.parseFromString(xml);
    var linkEls = dStyle.getElementsByTagName("link");
    for(var i = 0; i < linkEls.length; i++){
        if(linkEls[i].getAttribute("rel") == "independent-parent"){
            zcite.debug("independent-parent found: " + linkEls[i].getAttribute("href"), 5);
            return linkEls[i].getAttribute("href");
        }
    }
    return false;
}

if (typeof module !== 'undefined' && "exports" in module) {
    exports.cslFetcher = cslFetcher;
}
/*
zcite.debug("init cslFetcher");
cslFetcher.init();
var xml = fs.readFileSync("./csl/dependent/radiology.csl", 'utf8');
var independent = cslFetcher.readDependent(xml);
zcite.debug(cslFetcher.processStyleIdentifier(independent));
*/
