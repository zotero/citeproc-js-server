var fs = require('fs');
var StdNodeTest = function(CSL,myname,custom,dir){
    this.CSL = CSL;
    this.fs = fs;
	this.myname = myname;
	if(dir){
	    this.dir = dir;
    }
	else{
	    this.dir = "./citeproc-js/tests/fixtures/run/machines/";
	}
	this.localepre = "./citeproc-js/locale/locales-";
	this._cache = {};
	this._acache = { "default": {
						 "container-title":{},
						 "collection-title":{},
						 "authority":{},
						 "institution":{},
						 "title":{},
						 "publisher":{},
						 "publisher-place":{},
						 "hereinafter":{}
					 }
				   };
	this._ids = [];
	if (myname){
		var test;
		//if ("undefined" != typeof custom && custom == "custom"){
		//	test = readFile("./tests/custom/" + myname + ".json", "UTF-8");
		//} else if ("undefined" != typeof custom && custom == "local"){
		//	test = readFile("./tests/local/machines/" + myname + ".json", "UTF-8");
		//} else {
		//	test = readFile("./tests/std/machines/" + myname + ".json", "UTF-8");
		//}
		test = this.fs.readFileSync(this.dir + myname + ".json", "UTF-8");
		this.test = JSON.parse(test);
		this.result = this.test.result;
		this._setCache();
		//console.log(this.test);
	}
};

//
// Retrieve properly composed item from phoney database.
// (Deployments must provide an instance object with
// this method.)
//
StdNodeTest.prototype.retrieveItem = function(id){
	return this._cache[id];
};

StdNodeTest.prototype.getAbbreviations = function(name,vartype){
	return this._acache[name][vartype];
};

StdNodeTest.prototype.addAbbreviation = function(name,vartype,key,val){
	this._acache[name][vartype][key] = val;
};

//
// Build phoney database.
//
StdNodeTest.prototype._setCache = function(){
    var item, len;
    len = this.test.input.length;
	for(var i = 0; i < len; i++){
	    item = this.test.input[i];
		this._cache[item.id] = item;
		this._ids.push(item.id);
	}
};


StdNodeTest.prototype._readTest = function(){
	var test;
	var filename = this.dir + this.myname + ".json";
	//
	// Half of the fix for encoding problem encountered by Sean
	// under OSX.  External strings are _read_ correctly, but an
	// explicit encoding declaration on readFile is needed if
	// they are to be fed to eval.  This may set the implicit
	// UTF-8 binary identifier on the stream, as defined in the
	// ECMAscript specification.  See http://www.ietf.org/rfc/rfc4329.txt
	//
	// Python it's not.  :)
	//
	var teststring = this.fs.readFileSync(filename, "UTF-8");
	//
	// Grab test data in an object.
	//
//	try {
		var test = JSON.parse(teststring);
//	} catch(e){
//		throw e + teststring;
//	}
	this.test = test;
};


StdNodeTest.prototype.run = function(){
	var result, data, nosort;
	// print(this.myname);
	var len, pos, ret, id_set, nick;
	ret = new Array();
	this.style = new this.CSL.Engine(this,this.test.csl);
	this.style.setAbbreviations("default");
	if (this.test.abbreviations) {
		for (nick in this.test.abbreviations) {
			for (field in this.test.abbreviations[nick]) {
				for (key in this.test.abbreviations[nick][field]) {
					this.addAbbreviation(nick,field,key,this.test.abbreviations[nick][field][key]);
				}
			}
		}
	}

	if (this.test.mode === "bibliography-nosort") {
		nosort = true;
	}
	if (this.test.bibentries){
		for(var i = 0; i < this.test.bibentries.length; i++){
			this.style.updateItems(this.test.bibentries[i], nosort);
		}
	} else if (!this.test.citations) {
		this.style.updateItems(this._ids, nosort);
	}
	if (!this.test.citation_items && !this.test.citations){
		var citation = [];
		for(var i = 0; i < this.style.registry.reflist.length; i++){
			citation.push({"id":this.style.registry.reflist[i].id});
		}
		this.test.citation_items = [citation];
	}
	var citations = [];
	if (this.test.citation_items){
	    for(var i = 0; i < this.test.citation_items.length; i++){
			// sortCitationCluster(), we hardly knew ya
			// this.style.sortCitationCluster(citation);
			citations.push(this.style.makeCitationCluster(this.test.citation_items[i]));
		}
	} else if (this.test.citations){
	    var citaslice = this.test.citations.slice(0, -1);
	    //console.log("citaslice:");
	    //console.log(citaslice);
	    for(var i = 0; i < citaslice.length; i++){
	        //console.log("citaslice i: " + i);
			this.style.processCitationCluster(citaslice[i][0],citaslice[i][1],citaslice[i][2]);
		};
		var citation = this.test.citations.slice(-1)[0];
		//console.log("citation:"); console.log(citation);
		var r = this.style.processCitationCluster(citation[0],citation[1],citation[2]);
		data = r[0];
		result = r[1];
	};
	var indexMap = new Object();
	for (var pos in result){
		indexMap[""+result[pos][0]] = pos;
	};
	for (var cpos = 0; cpos < this.style.registry.citationreg.citationByIndex.length; cpos++){
		var citation = this.style.registry.citationreg.citationByIndex[cpos];
		if (indexMap[""+cpos]){
			citations.push(">>["+cpos+"] "+result[indexMap[cpos]][1]);
		} else {
		    //console.log("process_CitationCluster162");
			citations.push("..["+cpos+"] "+this.style.process_CitationCluster.call(this.style,this.style.registry.citationreg.citationByIndex[cpos].sortedItems));
		}
	};
	ret = citations.join("\n");
	if (this.test.mode == "bibliography" || this.test.mode == "bibliography-nosort"){
		if (this.test.bibsection){
			var ret = this.style.makeBibliography(this.test.bibsection);
		} else {
			var ret = this.style.makeBibliography();
		}
        ret = ret[0]["bibstart"] + ret[1].join("") + ret[0]["bibend"];
	} else if (this.test.mode == "bibliography-header"){
		var obj = this.style.makeBibliography()[0];
		var lst = [];
		for (var key in obj) {
			var keyval = [];
			keyval.push(key);
			keyval.push(obj[key]);
			lst.push(keyval);
		}
		lst.sort(
			function (a, b) {
				if (a > b) {
					return 1;
				} else if (a < b) {
					return -1;
				} else {
					return 0;
				}
			}
		);
		ret = "";
		for (pos = 0, len = lst.length; pos < len; pos += 1) {
			ret += lst[pos][0] + ": " + lst[pos][1] + "\n";
		}
		ret = ret.replace(/^\s+/,"").replace(/\s+$/,"");
	}
	if (this.test.mode !== "bibliography" && this.test.mode !== "citation" && this.test.mode !== "bibliography-header" && this.test.mode != "bibliography-nosort") {
		throw "Invalid mode in test file "+this.myname+": "+this.test.mode;
	}
	return ret;
};

//
// Retrieve locale object from filesystem
// (Deployments must provide an instance object with
// this method.)
//
StdNodeTest.prototype.retrieveLocale = function(lang){
	var ret = this.fs.readFileSync( this.localepre + lang + ".xml", "UTF-8");
	// ret = ret.replace(/\s*<\?[^>]*\?>\s*\n/g, "");
	return ret;
};

exports.StdNodeTest = StdNodeTest;
