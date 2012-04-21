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

//process command line args for config
var config = {
    'maxconnections':1,
    'duration':3,
    'maxtotalrequests':1,
    'showoutput':false,
    'style':'chicago-author-date',
    'responseformat':'json',
    'bibliography':'1',
    'citations':'0',
    'outputformat':'html',
    'memoryUsage':false,
    'cslPath': __dirname + '/../csl',
    'testAllStyles': false,
    'customStylePath': ''
};

var argv = require('optimist')
    .usage('')
    .default(config)
    .argv;

if(argv.h){
    console.log(config);
    process.exit();
}

config = argv;

var util = require('util');
var fs = require('fs');

if(argv.customStylePath !== '') {
    config.customStyleXml = fs.readFileSync(config.customStylePath, 'utf8');
}

var stylesList = fs.readdirSync(config.cslPath);
stylesList = stylesList.sort();
var stylesListCounter = 0;
var errorStyles = [];
var passedStyles = [];
var loadcites = require('./loadcitesnode.js');
var citeData = loadcites.data;
var bib1 = loadcites.bib1;
var bib2 = loadcites.bib2;
var biball = loadcites.biball;
var bib1post = {};
var bib2post = {};
bib1post.items = [];
bib2post.items = [];
for(var i=0; i < bib1.length; i++){
    bib1post.items.push(citeData[ bib1[i] ]);
    //bib1post.items[bib1[i]] = citeData[ bib1[i] ];
}
for(var i=0; i < bib2.length; i++){
    bib2post.items.push(citeData[ bib2[i] ]);
    //bib1post.items[bib1[i]] = citeData[ bib1[i] ];
}
//bib1post.citationClusters = loadcites.citations1;
//bib2post.citationClusters = loadcites.citations1;
var styleStrings = ['apsa',
                    'apa',
                    'asa',
                    'chicago-author-date',
                    'chicago-fullnote-bibliography',
                    'chicago-note-bibliography',
                    'chicago-note',
                    'harvard1',
                    'ieee',
                    'mhra',
                    'mhra_note_without_bibliography',
                    'mla',
                    'nlm',
                    'nature',
                    'vancouver'
                    ];

if(config.hasOwnProperty('customStylePath')){
    bib2post.styleXml = config.customStyleXml;
}
reqBody = JSON.stringify(bib2post);
//console.log('postObj:');
//console.log(bib2post);
//console.log(bib1post);
//fs.writeFileSync('./prettyRequestBodyJson', util.inspect(bib1post, false, null), 'utf8');
//console.log("\n\n");

var randReqCombo = function(){
    var post = {'items':{}};
    for(var i=0; i < biball.length; i++){
        if(Math.random() < 0.3){
            post.items[biball[i]] = citeData[ biball[i] ];
        }
    }
    return post;
};

var randStyle = function(){
    var randomnumber=Math.floor(Math.random()*(styleStrings.length));
    return styleStrings[randomnumber];
};

var continueRequests = true;
var timeout = config.duration * 1000;
var totalRequests = 0;
var benchStart = Date.now();
var targetHost = '127.0.0.1';
//var targetHost = '209.51.184.202';

var outputStats = function(){
    console.log("Benchmark Complete");
    var totalRequests = connectionResults.length;
    var totalTime = 0;
    var maxTime = 0;
    var minTime = 5000;
    var i;
    for(i = 0; i < connectionResults.length; i++){
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
    console.log('==========================');
    console.log('Passed Styles:');
    for(i=0; i<passedStyles.length; i++){
        console.log(passedStyles[i]);
    }
    console.log('==========================');
    console.log('Failed Styles:');
    for(i=0; i<errorStyles.length; i++){
        console.log(errorStyles[i]);
    }
    setTimeout(function(){
        process.exit();
    }, 2000);
};

//set global timeout for finishing benchmarks
setTimeout(function(){
    continueRequests = false; //stop making new requests
    //set timeout to allow time for in progress requests to return
    outputStats();
    setTimeout(function(){
        
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
    var request;
    
    if(config.memoryUsage){
        request = localCiteConn.request('POST', '/?memoryUsage=1', {'host':targetHost});
        request.on('response', function (response) {
            console.log("STATUS: " + response.statusCode);
            response.setEncoding('utf8');
            response.on('data', function (chunk) {
                console.log(chunk);
            });
        });
        request.write(reqBody, 'utf8');
        request.end();
        return;
    }
//    console.log(config);
    var useStyleString = config.style;
    if(config.style == 'rand'){
        useStyleString = randStyle();
    }
    else if(config.testAllStyles){
        while(true){
            if(stylesListCounter >= stylesList.length){
                outputStats();
                return;
            }
            useStyleString = stylesList[stylesListCounter];
            stylesListCounter++;
            if(useStyleString && useStyleString.slice(-4) == '.csl'){
                useStyleString = useStyleString.replace('.csl', '');
                console.log("counter: " + stylesListCounter + ' - ' + useStyleString);
                break;
            }
        }
    }
    
    var qstring = 'style=' + useStyleString + '&responseformat=' + config.responseformat;
    if(config.bibliography == '0'){qstring += '&bibliography=0';}
    if(config.citations == '1'){qstring += '&citations=1';}
    if(config.outputformat != 'html'){qstring += '&outputformat=' + config.outputformat;}
    
    request = localCiteConn.request('POST', '/?' + qstring,
        {'host': targetHost});
    request.startDate = Date.now();
    request.styleUsed = useStyleString;
    request.on('response', function (response) {
        console.log('STATUS: ' + response.statusCode);
        response.setEncoding('utf8');
        response.body = '';
        response.on('data', function (chunk) {
            this.body += chunk;
        });
        response.on('end', function(){
            curConnections--;
            this.endDate = Date.now();
            var timeElapsed = this.endDate - request.startDate;
            var styleUsed = request.styleUsed;
            if(this.statusCode != 200){
                errorStyles.push(styleUsed);
            }
            else{
                passedStyles.push(styleUsed);
            }
            console.log("timeElapsed: " + timeElapsed);
            connectionResults.push({
                'status':this.statusCode,
                'body':this.body,
                'requestTime': timeElapsed
            });
            if(config.showOutput){
                console.log(this.body);
            }
        });
    });
    request.write(reqBody, 'utf8');
    request.end();
};

makeRequests();
