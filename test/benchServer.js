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

'use strict';

let util = require('util');
let fs = require('fs');
let Promise = require('bluebird');
let log = require('npmlog');
let _ = require('underscore')._;
let querystring = require('querystring');

log.level = 'verbose';

//process command line args for config
let config = {
    'maxconnections':1,
    'duration':20,
    'maxtotalrequests':1,
    'showoutput':true,
    'style':'chicago-author-date',
    'responseformat':'json',
    'bibliography':'1',
    'citations':'0',
    'outputformat':'html',
    'memoryUsage':false,
    'cslPath': __dirname + '/../csl',
    'customStylePath': '',
    'linkwrap': 0,
    'locale': 'en-US'
};

let defaultQueryObject = {
    'style':'chicago-author-date',
    'responseformat':'json',
    'bibliography':'1',
    'citations':'0',
    'outputformat':'html',
    'linkwrap': 0,
    'locale': 'en-US'
};


let argv = require('optimist')
    .usage('')
    .default(config)
    .argv;

if(argv.h){
    log.info(config);
    process.exit();
}

config = argv;
log.info("", config);

if(argv.customStylePath != '') {
    config.customStyleXml = fs.readFileSync(config.customStylePath, 'utf8');
}

let stylesList = fs.readdirSync(config.cslPath);
stylesList = stylesList.sort();
let stylesListCounter = 0;
let errorStyles = [];
let passedStyles = [];
let loadcites = require('./loadcitesnode.js');
let citeData = loadcites.data;
let bib1 = loadcites.bib1;
let bib2 = loadcites.bib2;
let biball = loadcites.biball;
let bib1post = {};
let bib2post = {};
bib1post.items = [];
bib2post.items = [];
for(let i=0; i < bib1.length; i++){
    bib1post.items.push(citeData[ bib1[i] ]);
    //bib1post.items[bib1[i]] = citeData[ bib1[i] ];
}
for(let i=0; i < bib2.length; i++){
    bib2post.items.push(citeData[ bib2[i] ]);
    //bib1post.items[bib1[i]] = citeData[ bib1[i] ];
}
//bib1post.citationClusters = loadcites.citations1;
//bib2post.citationClusters = loadcites.citations1;
let styleStrings = ['apsa',
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
let reqBody = JSON.stringify(bib2post);
//log.info('postObj:');
//log.info(bib2post);
//log.info(bib1post);
//fs.writeFileSync('./prettyRequestBodyJson', util.inspect(bib1post, false, null), 'utf8');
//log.info("\n\n");

let randReqCombo = function(){
    let post = {'items':{}};
    for(let i=0; i < biball.length; i++){
        if(Math.random() < 0.3){
            post.items[biball[i]] = citeData[ biball[i] ];
        }
    }
    return post;
};

let randStyle = function(){
    let randomnumber=Math.floor(Math.random()*(styleStrings.length));
    return styleStrings[randomnumber];
};

let continueRequests = true;
let timeout = config.duration * 1000;
let totalRequests = 0;
let requestTimes = [];
let benchStart = Date.now();
let targetHost = '127.0.0.1';
//let targetHost = '209.51.184.202';

let outputStats = function(){
    log.info("Benchmark Complete");
    let totalRequests = connectionResults.length;
    let totalTime = 0;
    let maxTime = 0;
    let minTime = 5000;
    let i;
    for(i = 0; i < connectionResults.length; i++){
        let reqTime = connectionResults[i].requestTime;
        totalTime += reqTime;
        maxTime = Math.max(maxTime, reqTime);
        minTime = Math.min(minTime, reqTime);
    }
    log.info('totalRequests: ' + totalRequests);
    log.info('totalTime: ' + (totalTime / 1000));
    log.info('maxTime: ' + maxTime);
    log.info('minTime: ' + minTime);
    log.info('avgTime: ' + (totalTime / totalRequests));
    log.info('total Benchmark Time: ' + (Date.now() - benchStart));
    log.info('curConnections still remaining: ' + curConnections);
    log.info('requestTimes: %j', requestTimes);
    log.info('==========================');
    log.info('Passed Styles:');
    log.info('passed ', passedStyles);
    
    log.info('==========================');
    log.info('Failed Styles:');
    log.info('failed ', errorStyles);
    
    setTimeout(function(){
        process.exit();
    }, 1000);
};

//set global timeout for finishing benchmarks
setTimeout(function(){
    continueRequests = false; //stop making new requests
    //set timeout to allow time for in progress requests to return
    outputStats();
    setTimeout(function(){
        
    }, 100);
}, timeout);

let curConnections = 0;
let connectionResults = [];
let http = require('http');

//make multiple parallel requests up to configured maxconnections
let makeRequests = function(){
    while(true && continueRequests){
        if(curConnections < config.maxconnections && totalRequests < config.maxtotalrequests){
            curConnections++;
            totalRequests++;
            if(totalRequests >= config.maxtotalrequests) continueRequests = false;
            singleRequest();
        }
        else{
            setTimeout(makeRequests, 100);
            break;
        }
    }
};

//make a single request
let singleRequest = function(){
    log.info("making new request");
    let request;
    
    if(config.memoryUsage){
        request = http.request({
            'hostname': targetHost,
            'port': 8085,
            'method': 'POST',
            'path': '/?memoryUsage=1'
        });
        request.on('response', function (response) {
            log.info("STATUS: " + response.statusCode);
            response.setEncoding('utf8');
            response.on('data', function (chunk) {
                log.info(chunk);
            });
        });
        request.write(reqBody, 'utf8');
        request.end();
        return;
    }
//    log.info(config);
    let useStyleString = config.style;
    if(config.style == 'rand'){
        useStyleString = randStyle();
    }
    
    //config.style = useStyleString;
    let qstringObject = _.extend({},
            defaultQueryObject,
            _.pick(config, 'responseformat', 'bibliography', 'citations', 'outputformat', 'linkwrap', 'locale'),
            {'style': useStyleString});
    let qstring = querystring.stringify(qstringObject);
    log.info(qstring);
    request = http.request({
        'hostname': targetHost,
        'port': 8085,
        'method': 'POST',
        'path': '/?' + qstring
    });
    request.startDate = Date.now();
    request.styleUsed = useStyleString;
    request.on('response', function (response) {
        log.info('STATUS: ' + response.statusCode);
        response.setEncoding('utf8');
        response.body = '';
        response.on('data', function (chunk) {
            this.body += chunk;
        });
        response.on('end', function(){
            let resp = this;
            curConnections--;
            resp.endDate = Date.now();
            let timeElapsed = resp.endDate - request.startDate;
            requestTimes.push(timeElapsed);
            let styleUsed = request.styleUsed;
            if(resp.statusCode != 200){
                errorStyles.push(styleUsed);
            }
            else{
                passedStyles.push(styleUsed);
            }
            log.info("timeElapsed: " + timeElapsed);
            connectionResults.push({
                'status':resp.statusCode,
                'body':resp.body,
                'requestTime': timeElapsed
            });
            if(config.showoutput){
                let obj = JSON.parse(resp.body);
                log.info("response body");
                console.log(obj);
            }
            log.info("curConnections: " + curConnections);
            log.info("continueRequests: " + continueRequests);
            if((!continueRequests) && (curConnections == 0)){
                outputStats();
            }
        });
    });
    request.write(reqBody, 'utf8');
    request.end();
};

makeRequests();
