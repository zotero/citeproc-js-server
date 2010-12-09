var repl = require('repl');
var fs = require('fs');
var http = require('http');
var url = require('url');
var Step = require('./step');

var zcite = {
};
global.zcite = zcite;

zcite.config = JSON.parse(fs.readFileSync('./citeServerConf.json', 'utf8'));
zcite.listenport = 8085;

var args = process.argv;
for(var i = 1; i < args.length; i++){
    if(args[i].substr(0, 4) == 'port'){
        zcite.listenport = parseInt(args[i].substr(5));
    }

}

var parser = require('./node-o3-xml/lib/o3-xml');
//var parser = require('/usr/local/node/o3-xml');
zcite.CSL = require('./citeprocmodule').CSL;
zcite.cslFetcher = require('./cslFetcher').cslFetcher;

if(zcite.config.debugLog == false){
    console.log("no debugLog");
    zcite.log = function(m){};
}
else{
    if(zcite.config.debugType == "file"){
        console.log("debug log file :" + zcite.config.logFile);
        zcite.logFile = process.stdout;
        /*
        zcite.logFile = fs.createWriteStream(zcite.config.logFile, {
            'flags' : 'w',
            'encoding' : 'utf8',
            'mode' : 0666
        });
        */
        zcite.log = function(m){
            zcite.logFile.write(m + '\n', 'utf8');
        };
    }
}

zcite.debug = function(m, level){
    if(typeof level == 'undefined'){level = 1;}
    if(level <= zcite.config.debugPrintLevel){
        console.log(m);
    }
};

//zcite exception response function
zcite.respondException = function(err, response, statusCode){
    if(typeof statusCode == 'undefined'){
        var statusCode = 500;
    }
    if(typeof response != "undefined"){
        if(typeof err == "string"){
            response.writeHead(statusCode, {'Content-Type': 'text/plain'});
            response.end(err);
            return;
        }
        else{
            response.writeHead(statusCode, {'Content-Type': 'text/plain'});
            response.end("An error occurred");
            return;
        }
    }
    if(typeof err == "string"){
        zcite.log("unCaught exception: " + err);
        zcite.debug("unCaught exception: " + err, 1);
    }
    else{
        zcite.debug('unCaught exception: ' + err.name + " : " + err.message, 1);
        zcite.log('unCaught exception: ' + err.name + " : " + err.message);
    }
};

//preload locales into memory
zcite.localesDirName = "./csl-locales/trunk";
zcite.localesDir = fs.readdirSync(zcite.localesDirName);

zcite.locales = {};
for(var i = 0; i < zcite.localesDir.length; i++){
    var localeCode = zcite.localesDir[i].slice(8, 13);
    zcite.locales[localeCode] = fs.readFileSync(zcite.localesDirName + '/' + zcite.localesDir[i], 'utf8');
}
zcite.retrieveLocale = function(lang){
    var locales = zcite.locales;
    if(locales.hasOwnProperty(lang)){
        return locales[lang];
    }
    else{
        return locales['en-US'];
    }
};

//set up style fetcher
zcite.cslXml = {};

//object for storing initialized CSL Engines by config options
//key is style, lang
zcite.cachedEngines = {};

zcite.createEngine = function(zcreq){
    //console.log(zcreq);
    zcite.debug('zcite.createEngine', 5);
    var cpSys = {
        items: zcreq.reqItemsObj,
        retrieveLocale: global.zcite.retrieveLocale,
        retrieveItem: function(itemID){return this.items[itemID];}
    };
    zcite.debug("cpSys created", 5);
    var citeproc = new zcite.CSL.Engine(cpSys, zcreq.cslXml, zcreq.config.locale);
    zcite.debug('engine created', 5);
    zcreq.citeproc = citeproc;
    //run the actual request now that citeproc is initialized (need to run this from cacheLoadEngine instead?)
    if(!zcite.precache){
        zcite.runRequest(zcreq);
    }
    else{
        citeproc.sys.items = {};
        zcite.cacheSaveEngine(citeproc, zcreq.styleUrlObj.href, zcreq.config.locale);
    }
};

//try to load a csl engine specified by styleuri:locale from the cache
zcite.cacheLoadEngine = function(styleUri, locale){
    zcite.debug('zcite.cacheLoadEngine', 5);
    var cacheEngineString = styleUri + ':' + locale;
    zcite.debug(cacheEngineString, 5);
    if(typeof this.cachedEngines[cacheEngineString] == 'undefined'){
        zcite.debug("no cached engine found", 5);
        return false;
    }
    else if(this.cachedEngines[cacheEngineString] instanceof Array){
        if(this.cachedEngines[cacheEngineString].length == 0){
            return false;
        }
        else{
            var citeproc = zcite.cachedEngines[cacheEngineString].pop();
            return citeproc;
        }
    }
    else{
        var citeproc = zcite.cachedEngines[cacheEngineString];
        delete zcite.cachedEngines[cacheEngineString];
        return citeproc;
    }
};

zcite.cacheSaveEngine = function(citeproc, styleUri, locale){
    zcite.debug('zcite.cacheSaveEngine', 5);
    var cacheEngineString = styleUri + ':' + locale;
    zcite.debug(cacheEngineString, 5);
    citeproc.sys.items = {};
    citeproc.updateItems([]);
    citeproc.restoreProcessorState();
    if(typeof this.cachedEngines[cacheEngineString] == 'undefined'){
        zcite.debug("saving engine", 5);
        this.cachedEngines[cacheEngineString] = [citeproc];
    }
    else{
        if(this.cachedEngines[cacheEngineString] instanceof Array){
            zcite.debug('pushing instance of engine', 5)
            this.cachedEngines[cacheEngineString].push(citeproc);
            zcite.debug('cachedEngines[cacheEngineString].length:' + this.cachedEngines[cacheEngineString].length, 5);
        }
    }
};

//precache CSL Engines on startup with style:locale 
zcite.debug('precaching CSL engines', 5);
zcite.precache = true;
Step(
/*    function fetchStyle(){
        var zcreq = {
            'reqItemsObj':{},
            'styleUrlObj':zcite.cslFetcher.processStyleIdentifier('apsa'),
            'config':{'locale':'en-US'}
            };
        zcite.cslFetcher.fetchStyle(zcreq, this);
    },
    function initEngine(zcreq){
        console.log('initEngine');
        zcite.createEngine(zcreq);
        return true;
    },
    function fetchStyle(){
        var zcreq = {
            'reqItemsObj':{},
            'styleUrlObj':zcite.cslFetcher.processStyleIdentifier('apa'),
            'config':{'locale':'en-US'}
            };
        zcite.cslFetcher.fetchStyle(zcreq, this);
    },
    function initEngine(zcreq){
        console.log('initEngine');
        zcite.createEngine(zcreq);
        return true;
    },
    function fetchStyle(){
        var zcreq = {
            'reqItemsObj':{},
            'styleUrlObj':zcite.cslFetcher.processStyleIdentifier('asa'),
            'config':{'locale':'en-US'}
            };
        zcite.cslFetcher.fetchStyle(zcreq, this);
    },
    function initEngine(zcreq){
        console.log('initEngine');
        zcite.createEngine(zcreq);
        return true;
    },
*/    function fetchStyle(){
        var zcreq = {
            'reqItemsObj':{},
            'styleUrlObj':zcite.cslFetcher.processStyleIdentifier('chicago-author-date'),
            'config':{'locale':'en-US'}
            };
        zcite.cslFetcher.fetchStyle(zcreq, this);
    },
    function initEngine(zcreq){
        zcite.createEngine(zcreq);
        return true;
    },
/*    function fetchStyle(){
        var zcreq = {
            'reqItemsObj':{},
            'styleUrlObj':zcite.cslFetcher.processStyleIdentifier('chicago-fullnote-bibliography'),
            'config':{'locale':'en-US'}
            };
        zcite.cslFetcher.fetchStyle(zcreq, this);
    },
    function initEngine(zcreq){
        console.log('initEngine');
        zcite.createEngine(zcreq);
        return true;
    },
    function fetchStyle(){
        var zcreq = {
            'reqItemsObj':{},
            'styleUrlObj':zcite.cslFetcher.processStyleIdentifier('chicago-note-bibliography'),
            'config':{'locale':'en-US'}
            };
        zcite.cslFetcher.fetchStyle(zcreq, this);
    },
    function initEngine(zcreq){
        console.log('initEngine');
        zcite.createEngine(zcreq);
        return true;
    },
/*    function fetchStyle(){
        var zcreq = {
            'reqItemsObj':{},
            'styleUrlObj':zcite.cslFetcher.processStyleIdentifier('chicago-note'),
            'config':{'locale':'en-US'}
            };
        zcite.cslFetcher.fetchStyle(zcreq, this);
    },
    function initEngine(zcreq){
        console.log('initEngine');
        zcite.createEngine(zcreq);
        return true;
    },
*/    function disablePrecache(err, success){
        zcite.debug("disablePrecache", 5);
        if(err) throw err;
        zcite.precache = false;
        return true;
    },
    function reportDone(err, success){
        if(err) throw err;
        zcite.debug("last Step", 5);
        return true;
    }
);
    

//callback for when engine is fully initialized and ready to process the request
zcite.runRequest = function(zcreq){
    zcite.debug('zcite.runRequest', 5);
    var response = zcreq.response;
    var citeproc = zcreq.citeproc;
    var config = zcreq.config;
    var responseJson = {};
    
    //delete zcreq.citeproc;
    //zcite.debug(zcreq, 5);
    //set output format
    if(config.outputformat != "html"){
        citeproc.setOutputFormat(config.outputformat);
    }
    zcite.debug("outputFormat set", 5);
    //add items posted with request
    citeproc.updateItems(zcreq.reqItemIDs);
    if(citeproc.opt.sort_citations){
        zcite.debug("currently using a sorting style", 1);
    }
    zcite.debug("items Updated", 5);
    
    //switch process depending on bib or citation
    if(config.bibliography == "1"){
        zcite.debug('generating bib', 5);
        var bib = citeproc.makeBibliography();
        zcite.debug("bib generated", 5);
        responseJson.bibliography = bib;
    }
    if(config.citations == "1"){
        zcite.debug('generating citations', 5);
        var citations = [];
        for(var i = 0; i < zcreq.citationClusters.length; i++){
            citations.push(citeproc.appendCitationCluster(zcreq.citationClusters[i], true)[0]);
        }
        zcite.debug(citations, 5);
        responseJson.citations = citations;
    }
    
    var write = '';
    //write the CSL output to the http response
    if(config.responseformat == "json"){
        response.writeHead(200, {'Content-Type': 'application/json'});
        write = JSON.stringify(responseJson);
    }
    else{
        if(config.outputformat == 'html'){
            response.writeHead(200, {'Content-Type': 'text/html'});
        }
        else if(config.outputformat == 'rtf'){
            response.writeHead(200, {'Content-Type': 'text/rtf'});
        }
        //not sure yet what should actually be written here, but will just do assembled bib for now
        if(bib){
            write += bib[0].bibstart + bib[1].join('') + bib[0].bibend;
        }
    }
    
    response.write(write, 'utf8');
    response.end();
    zcite.debug("response sent", 5);
    
    citeproc.sys.items = {};
    zcite.cacheSaveEngine(zcreq.citeproc, zcreq.styleUrlObj.href, zcreq.config.locale);
};

zcite.configureRequest = function(uriConf){
    var config = {};
    //generate bibliography, citations, or both?
    config.bibliography = (typeof uriConf.bibliography == 'undefined' ) ? '1' : uriConf.bibliography;
    config.citations = (typeof uriConf.citations == 'undefined' ) ? '0' : uriConf.citations;
    //for csl processor's setOutputFormat (html, rtf, or text are predefined)
    config.outputformat = (typeof uriConf.outputformat == 'undefined' ) ? 'html' : uriConf.outputformat;
    config.responseformat = (typeof uriConf.responseformat == 'undefined' ) ? 'json' : uriConf.responseformat;
    //locale to use
    config.locale = (typeof uriConf.locale == 'undefined' ) ? 'en-US' : uriConf.locale;
    //CSL path or name
    config.style = (typeof uriConf.style == 'undefined' ) ? 'chicago-author-date' : uriConf.style;
    //config.cslOutput = (typeof uriConf.csloutput == 'undefined' ) ? 'bibliography' : uriConf.csloutput;
    //config.cslOutput = (typeof uriConf.csloutput == 'undefined' ) ? 'bibliography' : uriConf.csloutput;
    return config;
}

http.createServer(function (request, response) {
    var zcreq = {};
    console.log("request received");
    if(request.method == "OPTIONS"){
        console.log("options request received");
        var nowdate = new Date();
        response.writeHead(200, {
            'Date': nowdate.toUTCString(),
            'Allow': 'POST,OPTIONS',
            'Content-Length': 0,
            'Content-Type': 'text/plain',
        });
        response.end('');
        return;
    }
    else if(request.method != "POST"){
        response.writeHead(400, {'Content-Type': 'text/plain'});
        response.end("Item data must be POSTed with request");
        return;
    }
    request.setEncoding('utf8');
    request.on('data', function(data){
        if(typeof this.POSTDATA === "undefined"){
            this.POSTDATA = data;
        }
        else{
            this.POSTDATA += data;
        }
    });
    request.on('end', function(){
        try{
            zcite.debug('full request received', 5);
            var uriObj = url.parse(this.url);
            uriObj.parsedQuery = require('querystring').parse(uriObj.query);
            zcite.debug(uriObj, 5);
            var config = zcite.configureRequest(uriObj.parsedQuery);
            //zcite.log('request : ' + config.responseformat + ' : ' + config.bibliography + ' : ' + config.citations + ' : ' + config.outputformat + ' : ' + config.style + ' : ' + config.locale);
            zcite.debug(JSON.stringify(config), 4);
            zcreq.config = config;
            zcreq.response = response;
            try{
                var postObj = JSON.parse(this.POSTDATA);
                zcreq.postObj = postObj;
            }
            catch(err){
                response.writeHead(400, {'Content-Type': 'text/plain'});
                response.end("Could not parse POSTed data");
                return;
            }
            
            //get items object for this request from post body
            var reqItemIDs;
            var reqItems = postObj.items;
            var reqItemsObj = {};
            if(typeof postObj.itemIDs != 'undefined'){
                reqItemIDs = postObj.itemIDs;
            }
            else{
                reqItemIDs = [];
            }
            
            //push itemIDs onto array and id referenced object for updateItems and retrieveItem function
            if(reqItems instanceof Array){
                //console.log(reqItems);
                for(var i = 0; i < reqItems.length; i++){
                    reqItemsObj[reqItems[i]['id']] = reqItems[i];
                    if(typeof postObj.itemIDs == 'undefined'){
                        reqItemIDs.push(reqItems[i]['id']);
                    }
                }
            }
            else if(typeof zcreq.postObj.items == 'object'){
                reqItemsObj = postObj.items;
                for(var i in reqItemsObj){
                    if(reqItemsObj.hasOwnProperty(i)){
                        if(reqItemsObj[i].id != i){
                            throw "Item ID did not match Object index";
                        }
                        reqItemIDs.push(i);
                    }
                }
            }
            
            zcreq.retrieveLocale = global.zcite.retrieveLocale;
            zcreq.retrieveItem = function(itemID){return this.items[itemID];};
            zcreq.reqItemIDs = reqItemIDs;
            zcreq.reqItemsObj = reqItemsObj;
            zcreq.styleUrlObj = zcite.cslFetcher.processStyleIdentifier(zcreq.config.style);
            if(config.citations == '1'){
                zcreq.citationClusters = zcreq.postObj.citationClusters;
            }
            
            //check for cached version or create new CSL Engine
            var citeproc;
            if(citeproc = zcite.cacheLoadEngine(zcreq.styleUrlObj.href, zcreq.config.locale)){
                citeproc.sys.items = zcreq.reqItemsObj;
                zcite.debug("citeproc.sys.items reset for zcreq", 5);
                zcreq.citeproc = citeproc;
                zcite.runRequest(zcreq);
            }
            else{
                var cslXml;
                if(cslXml = zcite.cslFetcher.getCachedStyle(zcreq.styleUrlObj.href)){
                    //successfully fetched cached style - load engine and run request
                    zcrec.cslXml = cslXml;
                    zcite.createEngine(zcreq);
                }
                else{
                    zcite.cslFetcher.fetchStyle(zcreq, zcite.createEngine);
                }
            }
        }
        catch(err){
            if(typeof err == "string"){
                response.writeHead(500, {'Content-Type': 'text/plain'});
                response.end(err);
                return;
            }
            else{
                response.writeHead(500, {'Content-Type': 'text/plain'});
                response.end("An error occurred");
                return;
            }
        }
    });
    
    if(request.headers.expect == '100-continue'){
        zcite.debug("100-continue expected. writing header to response");
        response.writeHead(100);
    }
}).listen(zcite.listenport);

zcite.debug('Server running at http://127.0.0.1:' + zcite.listenport + '/', 1);

process.on('uncaughtException', function (err) {
    zcite.respondException(err, response);
});

