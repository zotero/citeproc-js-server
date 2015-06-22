var fs = require('fs');
var citeprocnode = require("./lib/citeprocnode.js");

var sys = new citeprocnode.simpleSys();
var enUS = fs.readFileSync('./csl-locales/locales-en-US.xml', 'utf8');
sys.addLocale('en-US', enUS);
var styleString = fs.readFileSync('./csl/ieee.csl', 'utf8');
var engine = sys.newEngine(styleString, 'en-US', null);

var items = {"14058/RN9M5BF3":{"accessed":{"month":"9","year":"2010","day":"10"},"id":"14058/RN9M5BF3","author":[{"given":"Adel","family":"Hendaoui"},{"given":"Moez","family":"Limayem"},{"given":"Craig W.","family":"Thompson"}],"title":"3D Social Virtual Worlds: <i>Research Issues and Challenges</i>","type":"article-journal","versionNumber":6816},"14058/NSBERGDK":{"accessed":{"month":"9","year":"2010","day":"10"},"issued":{"month":"6","year":"2009"},"event-place":"Istanbul","type":"paper-conference","DOI":"10.1109/DEST.2009.5276761","page-first":"151","id":"14058/NSBERGDK","title-short":"3D virtual worlds as collaborative communities enriching human endeavours","publisher-place":"Istanbul","author":[{"given":"C.","family":"Dreher"},{"given":"T.","family":"Reiners"},{"given":"N.","family":"Dreher"},{"given":"H.","family":"Dreher"}],"title":"3D virtual worlds as collaborative communities enriching human endeavours: Innovative applications in e-Learning","shortTitle":"3D virtual worlds as collaborative communities enriching human endeavours","page":"151-156","event":"2009 3rd IEEE International Conference on Digital Ecosystems and Technologies (DEST)","URL":"http://ieeexplore.ieee.org/lpdocs/epic03/wrapper.htm?arnumber=5276761","versionNumber":1}};

sys.items = items;

var clusters = [
    {
        citationItems: ["14058/RN9M5BF3"],
        properties: {
            note:0
        }
    },
    {
        citationItems: ["14058/NSBERGDK"],
        properties: {
            note:0
        }
    },
];

engine.updateItems(Object.keys(items));
var bib = engine.makeBibliography();
