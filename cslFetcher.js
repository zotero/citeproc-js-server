var fs = require('fs');
var http = require('http');
var url = require('url');

var cslFetcher = {
    '_cache':{}
};

cslFetcher.init = function(config){
    if(typeof config == 'undefined'){
        config = {
            "localesPath" : "./csl-locales/trunk",
            "cslPath" : "./csl1.0",
            "parserPath" : "../nodejs/node-o3-xml/lib/o3-xml",
            "stepPath" : "./step"
        }
    }
    
    Step = require(config.stepPath);
    cslFetcher.parser = require(config.parserPath);
    
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
    //console.log('cslFetcher.getCachedStyle');
    if(typeof this._cache[url] != 'undefined'){
        return this._cache[url];
    }
    else{
        return false;
    }
}

cslFetcher.processStyleIdentifier = function(style, callback){
    var urlObj = url.parse(style);
    if(typeof urlObj.host == "undefined"){
        //short name, treat as a zotero.org/styles url
        var newStyleUrl = 'http://www.zotero.org/styles/' + style;
        urlObj = url.parse(newStyleUrl);
        urlObj.shortName = style;
    }
    else{
        if(typeof urlObj.pathname == 'string'){
            var shortName = urlObj.pathname.substr(8);
        }
    }
    return urlObj;
};

cslFetcher.resolveZoteroShortName = function(zcreq, shortName){
    //check if independent style from zotero repo
    if((typeof this.cslShortNames[shortName] != 'undefined') && (this.cslShortNames[shortName] === true)){
        var filename = this.cslDirPath + '/' + shortName + '.csl';
        return filename;
    }
    //check if dependent file from zotero repo
    else if(typeof this.cslDependentShortNames[shortName] != 'undefined'){
        //cached dependent style reference
        if(typeof this.cslDependentShortNames[shortName] == "string"){
            return this.resolveZoteroShortName(zcreq, this.cslDependentShortNames[shortName]);
        }
        //dependent style we haven't resolved before
        else{
            var filename = this.cslDirPath + '/dependent/' + shortName + '.csl';
            
        }
    }
};

cslFetcher.fetchStyle = function(zcreq, callback){
    try{
        //console.log('cslFetcher.fetchStyle');
        if(zcreq.styleUrlObj.host == 'www.zotero.org'){
            //check if independent style from zotero repo
            if((typeof this.cslShortNames[zcreq.styleUrlObj.shortName] != 'undefined') && (this.cslShortNames[zcreq.styleUrlObj.shortName] === true)){
                var filename = cslFetcher.cslPath + '/' + zcreq.styleUrlObj.shortName + '.csl';
                fs.readFile(filename, 'utf8', function(err, data){
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
        }
    }
    catch(err){
        zcite.respondException(err, zcreq.response);
    }
}

cslFetcher.loadStyle = function(style, callback, cargs){
    
}

cslFetcher.readDependent = function(xml){
    var parser = this.parser;
    var dStyle = parser.parseFromString(xml);
    var linkEls = dStyle.getElementsByTagName("link");
    for(var i = 0; i < linkEls.length; i++){
        if(linkEls[i].getAttribute("rel") == "independent-parent"){
            console.log("independent-parent found: " + linkEls[i].getAttribute("href"));
            return linkEls[i].getAttribute("href");
        }
    }
    return false;
}

if (typeof module !== 'undefined' && "exports" in module) {
    exports.cslFetcher = cslFetcher;
}

console.log("init cslFetcher");
cslFetcher.init();


