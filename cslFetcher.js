var fs = require('fs');
var http = require('http');
var url = require('url');


var cslFetcher = {
    '_cache':{}
};


cslFetcher.cslDirName = "./csl1.0";
cslFetcher.cslDir = fs.readdirSync(cslFetcher.cslDirName);
cslFetcher.cslShortNames = {};
for(var i = 0; i < cslFetcher.cslDir.length; i++){
    var shortName = cslFetcher.cslDir[i].slice(0, -4);
    cslFetcher.cslShortNames[shortName] = true;
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

cslFetcher.processStyleIdentifier = function(style){
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

cslFetcher.fetchStyle = function(zcreq, callback){
    //console.log('cslFetcher.fetchStyle');
    if(zcreq.styleUrlObj.host == 'www.zotero.org'){
        var filename = cslFetcher.cslDirName + '/' + zcreq.styleUrlObj.shortName + '.csl';
        fs.readFile(filename, 'utf8', function(err, data){
            if(err){
                global.zcite.respondException(err, zcreq.response, 404);
                return;
            };
            zcreq.cslXml = data;
            callback(zcreq);
        });
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

cslFetcher.loadStyle = function(style, callback, cargs){
    
}


exports.cslFetcher = cslFetcher;


