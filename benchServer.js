//process command line args for config
var config = {
    'maxconnections':3,
    'duration':3,
    'maxtotalrequests':1,
    'showoutput':false,
    'style':'chicago-author-date',
    'responseformat':'json',
    'bibliography':'1',
    'citations':'0',
    'outputformat':'html'
};
var args = process.argv;
var sys = require('sys');
var fs = require('fs');
for(var i = 1; i < args.length; i++){
    if(args[i].substr(0, 14) == 'maxconnections'){
        config.parallel = parseInt(args[i].substr(15));
    }
    else if(args[i].substr(0, 8) == 'duration'){
        config.duration = parseInt(args[i].substr(9));
    }
    else if(args[i].substr(0, 10) == 'showoutput'){
        config.showOutput = true;
    }
    else if(args[i].substr(0, 5) == 'style'){
        config.style = args[i].substr(6);
    }
    else if(args[i].substr(0, 14) == 'responseformat'){
        config.responseformat = args[i].substr(15);
    }
    else if(args[i].substr(0, 12) == 'bibliography'){
        config.bibliography = args[i].substr(13);
    }
    else if(args[i].substr(0, 9) == 'citations'){
        config.citations = args[i].substr(10);
    }
    else if(args[i].substr(0, 4) == 'help'){
        console.log(config);
        process.exit();
    }
}

var fs = require('fs');
var loadcites = require('./loadcitesnode.js');
var citeData = loadcites.data;
var bib1 = loadcites.bib1;
var biball = loadcites.biball;
var bib1post = {};
bib1post.items = [];
for(var i=0; i < bib1.length; i++){
    bib1post.items.push(citeData[ bib1[i] ]);
    //bib1post.items[bib1[i]] = citeData[ bib1[i] ];
}
bib1post.citationClusters = loadcites.citations1;

reqBody = JSON.stringify(bib1post);
//console.log(bib1post);
//fs.writeFileSync('./prettyRequestBodyJson', sys.inspect(bib1post, false, null), 'utf8');
//console.log("\n\n");

var randReqCombo = function(){
    var post = {'items':{}};
    for(var i=0; i < biball.length; i++){
        if(Math.random() < 0.3){
            post.items[biball[i]] = citeData[ biball[i] ];
        }
    }
    return post;
}

var continueRequests = true;
var timeout = config.duration * 1000;
var totalRequests = 0;
var benchStart = Date.now();
var targetHost = '127.0.0.1';
//var targetHost = '209.51.184.202';

//set global timeout for finishing benchmarks
setTimeout(function(){
    continueRequests = false; //stop making new requests
    //set timeout to allow time for in progress requests to return
    setTimeout(function(){
        console.log("Benchmark Complete");
        var totalRequests = connectionResults.length;
        var totalTime = 0;
        var maxTime = 0;
        var minTime = 5000;
        for(var i = 0; i < connectionResults.length; i++){
            var reqTime = connectionResults[i].requestTime;
            totalTime += reqTime;
            maxTime = Math.max(maxTime, reqTime);
            minTime = Math.min(minTime, reqTime);
        }
        console.log('totalRequests: ' + totalRequests);
        console.log('totalTime: ' + (totalTime / 1000));
        console.log('maxTime: ' + maxTime);
        console.log('minTime: ' + minTime);
        console.log('total Benchmark Time: ' + (Date.now() - benchStart));
        process.exit();
    }, 100);
}, timeout);

var curConnections = 0;
var connectionResults = [];
var http = require('http');
var localCiteConn = http.createClient(8085, targetHost);

//make multiple parallel requests up to configured maxconnections
var makeRequests = function(){
    while(true && continueRequests){
        if(curConnections < config.maxconnections && totalRequests < config.maxtotalrequests){
            curConnections++;
            totalRequests++;
            singleRequest();
        }
        else{
            setTimeout(makeRequests, 100);
            break;
        }
    }
};

//make a single request
var singleRequest = function(){
    console.log("making new request");
//    console.log(config);
    var qstring = 'style=' + config.style + '&responseformat=' + config.responseformat;
    if(config.bibliography == '0'){qstring += '&bibliography=0';}
    if(config.citations == '1'){qstring += '&citations=1';}
    if(config.outputformat != 'html'){qstring += '&outputformat=' + config.outputformat;}
    
    var request = localCiteConn.request('POST', '/?' + qstring,
        {'host': targetHost});
    request.startDate = Date.now();
    request.on('response', function (response) {
        console.log('STATUS: ' + response.statusCode);
        response.setEncoding('utf8');
        response.body = '';
        response.on('data', function (chunk) {
            this.body += chunk;
        });
        response.on('end', function(){
            this.endDate = Date.now();
            var timeElapsed = this.endDate - request.startDate;
            console.log("timeElapsed: " + timeElapsed);
            connectionResults.push({
                'status':this.statusCode,
                'body':this.body,
                'requestTime': timeElapsed
            });
            if(config.showOutput){
                console.log(this.body);
            }
            curConnections--;
        });
    });
    request.write(reqBody, 'utf8');
    request.end();
}
makeRequests();
