//taken from https://github.com/fbennett/csl-json-walker

'use strict';

const jsdom = require("jsdom");
const { JSDOM } = jsdom;

exports.MakeDoc = function(xmlString) {
    let { document } = (new JSDOM(xmlString, { contentType: 'text/xml' })).window;
    return document;
}


let JSONWalker = function() {
    this.locales = {
        'en-US': true
    };
}

JSONWalker.prototype.walkStyleToObj = function(doc) {
    var elem = doc.getElementsByTagName('style')[0];
    var defaultLocale = elem.getAttribute('default-locale');
    if (defaultLocale) {
        this.locales[defaultLocale] = true;
    }
    var obj = this.walkToObject(elem, true);
    return {
        obj: obj,
        locales: this.locales
    }
}

JSONWalker.prototype.walkLocaleToObj = function(doc) {
    var elem = doc.getElementsByTagName('locale')[0];
    var obj = this.walkToObject(elem);
    return obj;
}

JSONWalker.prototype.walkToObject = function(elem, isStyle) {
    var obj = {};
    obj.name = elem.nodeName;
    obj.attrs = {};
    if (elem.attributes) {
        for (var i=0,ilen=elem.attributes.length;i<ilen;i++) {
            var attr = elem.attributes[i];
            obj.attrs[attr.name] = attr.value;
            if (isStyle && attr.name === 'locale') {
                var locale = attr.value.split(/\s+/)[0];
                this.locales[locale] = true;
            }
        }
    }
    obj.children = [];
    if (elem.childNodes.length === 0 && elem.tagName === 'term') {
        obj.children = [''];
    }
    for (var i=0,ilen=elem.childNodes.length;i<ilen;i++) {
        var child = elem.childNodes[i];
        if (child.nodeName === '#comment') {
            continue;
        } else if (child.nodeName === '#text') {
            if (elem.childNodes.length === 1 && ['term', 'single', 'multiple'].indexOf(elem.nodeName) > -1) {
                obj.children.push(child.textContent)
            }
        } else {
            obj.children.push(this.walkToObject(child));
        }
    }
    return obj;
}
exports.JsonWalker = new JSONWalker();

