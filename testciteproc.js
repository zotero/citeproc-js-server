var fs = require('fs');
var assert = require('assert');
var repl = require('repl');

var CSL = require("./citeprocmodule").CSL;
var nt = require('./stdNodeTest');
var zotero = require("./zoteronode").zotero;
zotero.DebugEnabled = 0;

var tests = fs.readdirSync("./citeproc-js/tests/fixtures/run/machines");
tests.sort();
var print = '';
var testsRun = 0;
var testsPassed = 0;
var nodeTests = [];

var bundleStrings = [
    'abbrevs',
    'affix',
    'api',
    'bibheader',
    'bibsection',
    'bugreports',
    'citeprocjs',
    'collapse',
    'condition',
    'date',
    'decorations',
    'disambiguate',
    'discretionary',
    'display',
    'eclac',
    'flipflop',
    'form',
    'fullstyles',
    'group',
    'institutions',
    'integration',
    'label',
    'locale',
    'locators',
    'magic',
    'multilingual',
    'name_',
    'nameattr',
    'nameorder',
    'namespaces',
    'number',
    'page',
    'parallel',
    'plural',
    'position',
    'quotes',
    'simplespace',
    'sort',
    'textcase',
    'unicode',
    'variables'];

var runTest = function(nodeTest){
    try{
        assert.equal(nodeTest.run(), nodeTest.result, "unexpected test result in test " + nodeTest.myname);
        testsPassed += 1;
        console.log(nodeTest.myname + " run successfully");
        nodeTest = null;
    }
    catch(err){
        console.log("Exception thrown from test " + nodeTest.myname);
        if(typeof err == "string"){
            console.log("Caught exception: " + err);
        }
        else if(err.name == "AssertionError"){
            print  = "Assertion Failed\n";
            print += "Message: " + err.message + "\n";
            print += "expected:\n" + err.expected + "\n";
            print += "returned:\n" + err.actual + "\n";
            console.log(print);
//            console.log(nodeTest.test.csl);
        }
        else{
            print  = 'Caught exception: ' + err.name + " : " + err.message + "\n";
            print += err.stack;
            console.log(print);
        }
        
        //var context = {'t': nodeTest, "zotero": zotero};
        //repl.start().context.a = context;
    }
};


var runBundle = function(prefixre, tests){
    var nodeTests = [];
    for(var i = 0; i < tests.length; i++){
        var testname = tests[i].replace(".json", '');
        if(prefixre.test(tests[i])){
            nodeTests.push(new nt.StdNodeTest(CSL, testname));
        }
    }
    
    for(var i = 0; i < nodeTests.length; i++){
        runTest(nodeTests[i]);
    }
};

var mode = 0;

for(var i = 2; i < process.argv.length; i++){
    switch(process.argv[i]){
        case "--bundle":
            mode = 1;
            var prefix = process.argv[i+1];
            var prefixre = new RegExp('^' + prefix);
            i++;
            runBundle(prefixre, tests);
            break;
        case "--test":
            mode = 2;
            var argTestName = process.argv[i+1];
            i++;
            nodeTest = new nt.StdNodeTest(CSL, argTestName);
            runTest(nodeTest);
            break;
        case "--debug":
            zotero.DebugEnabled = 1;
            break;
    }
}

if(mode == 0){
    for(var i = 0; i < bundleStrings.length; i++){
        var re = new RegExp('^' + bundleStrings[i]);
        runBundle(re, tests);
    }
}
/*
for(var i = 0; i < tests.length; i++){
    var testname = tests[i].replace(".json", '');
    if(prefixre){
        if(prefixre.test(tests[i])){
            nodeTests.push(new nt.StdNodeTest(CSL, testname));
        }
    }
    else if(argTestName && argTestName == testname){
        nodeTests.push(new nt.StdNodeTest(CSL, testname));
        break;
    }
}

for(var i = 0; i < nodeTests.length; i++){
    
}
*/
/*
for(var i = 0; i < tests.length; i++){
    var testname = tests[i].replace(".json", '');
    var test = new nt.StdNodeTest(CSL, testname);
    try{
        assert.equal(test.result, test.run(), "unexpected test result in test " + testname);
        passed += 1;
        console.log(testname + " run successfully");
    }
    catch(err){
        if(typeof err == "string"){
            console.log("Caught exception: " + err);
        }
        else if(err.name == "AssertionError"){
            print  = "Assertion Failed\n";
            print += "Message: " + err.message + "\n";
            print += "expected:\n" + err.expected + "\n";
            print += "returned:\n" + err.actual + "\n";
            console.log(print);
        }
        else{
            print  = 'Caught exception: ' + err.name + " : " + err.message + "\n";
            print += err.stack;
            console.log(print);
        }
    }
}
*/
//console.log("Total tests: " + test.length);
//console.log("Tests Passed: " + passed);

