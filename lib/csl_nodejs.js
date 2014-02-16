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

var zotero = require("./zoteronode").zotero;

var CSL_NODEJS = function () {
    var parser = require(zcite.config.parserPath);
	//var parser = require('/usr/local/node/o3-xml');
    //var fastparser = require('./node-o3-fastxml/lib/o3-fastxml');
	this.parser = parser;
	//this.parser = fastparser;
	
	this.hasAttributes = function (node) {
	    //zotero.Debug('CSL_NODEJS.hasAttributes', 3);
		if(node.attributes && node.attributes.length){
		    return true;
	    }
	    else{
	        return false;
        }
	};
	this.importNode = function (doc, srcElement) {
	    //zotero.Debug('CSL_NODEJS.importNode', 3);
		var ret = doc.importNode(srcElement, true);
	    return ret;
	};
	this._importNode = function(doc, node, allChildren) {
	    //zotero.Debug('CSL_NODEJS._importNode', 3);
		switch (node.nodeType) {
			case 1:
				var newNode = doc.createElement(node.nodeName);
				if (node.attributes && node.attributes.length > 0)
					for (var i = 0, il = node.attributes.length; i < il;)
						newNode.setAttribute(node.attributes[i].nodeName, node.getAttribute(node.attributes[i++].nodeName));
					if (allChildren && node.childNodes && node.childNodes.length > 0)
						for (var i = 0, il = node.childNodes.length; i < il;)
							newNode.appendChild(this._importNode(doc, node.childNodes[i++], allChildren));
				return newNode;
				break;
			case 3:
			case 4:
			case 8:
		}
	};
	var inst_txt = "<docco><institution institution-parts=\"long\" delimiter=\", \" substitute-use-first=\"1\" use-last=\"1\"/></docco>";
	var inst_doc = this.parser.parseFromString(inst_txt);
	var inst_node = inst_doc.getElementsByTagName("institution");
	this.institution = inst_node[0];
	//zotero.Debug("institution node: " + this.institution.xml);
	this.ns = "http://purl.org/net/xbiblio/csl";
//	process.exit();
};
CSL_NODEJS.prototype.clean = function (xml) {
    //zotero.Debug('CSL_NODEJS.clean', 3);
	xml = xml.replace(/<\?[^?]+\?>/g, "");
	xml = xml.replace(/<![^>]+>/g, "");
	xml = xml.replace(/^\s+/, "");
	xml = xml.replace(/\s+$/, "");
	xml = xml.replace(/^\n*/, "");
	return xml;
};
CSL_NODEJS.prototype.children = function (myxml) {
    //zotero.Debug("children called on: " + myxml.nodeName, 3);
    //if(myxml.nodeName == "option"){ zotero.Debug(myxml.xml);}
	var children, pos, len, ret;
	if (myxml) {
	    ret = [];
		children = myxml.childNodes;
		for (pos = 0, len = children.length; pos < len; pos += 1) {
			if (children[pos].nodeType != children[pos].TEXT) {
				ret.push(children[pos]);
				//zotero.Debug("pushed " + children[pos].nodeName);
			}else{
			    //zotero.Debug("skipped text node");
		    }
		}
		//zotero.Debug('returning children #' + ret.length);
		return ret;
	} else {
		//zotero.Debug('returning empty children');
		return [];
	}
};
CSL_NODEJS.prototype.nodename = function (myxml) {
	//zotero.Debug('CSL_NODEJS.nodename', 3);
	var ret = myxml.nodeName;
	//zotero.Debug("nodename: " + ret);
	return ret;
};
CSL_NODEJS.prototype.attributes = function (myxml) {
	//zotero.Debug('CSL_NODEJS.attributes');
	var ret, attrs, attr, key, xml, pos, len;
	ret = new Object();
	if (myxml && this.hasAttributes(myxml)) {
		attrs = myxml.attributes;
		len = attrs.length;
		for (pos = 0; pos < len; pos++) {
			attr = attrs[pos];
			ret["@" + attr.name] = attr.value;
			//if(attr.name == "and"){console.log("attr :@" + attr.name + " : " + attr.value);}
			//zotero.Debug("attr :@" + attr.name + " : " + attr.value);
		}
	}
	return ret;
};
CSL_NODEJS.prototype.content = function (myxml) {
    //zotero.Debug('CSL_NODEJS.content', 3);
    if('undefined' != typeof myxml.nodeValue){
        return myxml.nodeValue;
    }
    else{
        return '';
    }
};
CSL_NODEJS.prototype.namespace = {
	"xml":"http://www.w3.org/XML/1998/namespace"
}
CSL_NODEJS.prototype.numberofnodes = function (myxml) {
    //zotero.Debug('CSL_NODEJS.numberofnodes', 3);
	if (myxml) {
		return myxml.length;
	} else {
		return 0;
	}
};
CSL_NODEJS.prototype.getAttributeName = function (attr) {
    //zotero.Debug('CSL_NODEJS.getAttributeName', 3);
	var ret = attr.name;
	return ret;
}
CSL_NODEJS.prototype.getAttributeValue = function (myxml,name,namespace) {
    //zotero.Debug('CSL_NODEJS.getAttributeValue', 3);
	if (myxml.attributes && myxml.attributes.length) {
	//if (myxml && this.hasAttributes(myxml) && myxml.getAttribute(name)) {
	    //var at = myxml.attributes[name];
	    //var at = myxml.attributes.getNamedItem(name).value;
	    var at = myxml.getAttribute(name);
	    if(at){
	        //zotero.Debug(at.value);
	        return at;
        }
	}
	return "";
}
CSL_NODEJS.prototype.getNodeValue = function (myxml,name) {
    //zotero.Debug('CSL_NODEJS.getNodeValue : ' + name, 3);
	var ret = "";
	if (name){
		var vals = myxml.getElementsByTagName(name);
		if (vals.length > 0) {
		    if ("undefined" != typeof vals[0].nodeValue){
		        ret = vals[0].nodeValue;
			} else if ("undefined" != typeof vals[0].textContent) {
				ret = vals[0].textContent;
			} else if ("undefined" != typeof vals[0].innerText) {
				ret = vals[0].innerText;
			} else {
				ret = vals[0].text;
			}
		}
	} else {
		ret = myxml;
	}
	//if ret has children and (
	if (ret && ret.childNodes && (ret.childNodes.length == 0 || (ret.childNodes.length == 1 && ret.firstChild.nodeType == ret.firstChild.TEXT))) {
		if ("undefined" != typeof ret.nodeValue){
		    ret = ret.nodeValue;
	    } else if ("undefined" != typeof ret.textContent) {
			ret = ret.textContent;
		} else if ("undefined" != typeof ret.innerText) {
			ret = ret.innerText;
		} else {
			ret = ret.text;
		}
	}
	return ret;
}
CSL_NODEJS.prototype.setAttributeOnNodeIdentifiedByNameAttribute = function (myxml,nodename,partname,attrname,val) {
    //zotero.Debug('CSL_NODEJS.setAttributeOnNodeIdentifiedByNameAttribute', 3);
	var pos, len, xml, nodes, node;
	if (attrname.slice(0,1) === '@'){
		attrname = attrname.slice(1);
	}
	nodes = myxml.getElementsByTagName(nodename);
	for (pos = 0, len = nodes.length; pos < len; pos += 1) {
		node = nodes[pos];
		if (node.getAttribute("name") != partname) {
			continue;
		}
		node.setAttribute(attrname, val);
	}
}
CSL_NODEJS.prototype.deleteNodeByNameAttribute = function (myxml,val) {
    //zotero.Debug('CSL_NODEJS.deleteNodeByNameAttribute', 3);
	var pos, len, node, nodes;
	nodes = myxml.childNodes;
	for (pos = 0, len = nodes.length; pos < len; pos += 1) {
		node = nodes[pos];
		if (!node || node.nodeType == node.TEXT) {
			continue;
		}
		if (this.hasAttributes(node) && node.getAttribute("name") == val) {
			myxml.removeChild(nodes[pos]);
		}
	}
}
CSL_NODEJS.prototype.deleteAttribute = function (myxml,attr) {
    //zotero.Debug('CSL_NODEJS.deleteAttribute', 3);
	myxml.removeAttribute(attr);
}
CSL_NODEJS.prototype.setAttribute = function (myxml,attr,val) {
    //zotero.Debug('CSL_NODEJS.setAttribute', 3);
	myxml.setAttribute(attr, val);
    return false;
}
CSL_NODEJS.prototype.nodeCopy = function (myxml) {
    //zotero.Debug('CSL_NODEJS.nodeCopy', 3);
	var cloned_node = myxml.cloneNode(true);
	return cloned_node;
}
CSL_NODEJS.prototype.getNodesByName = function (myxml,name,nameattrval) {
    //zotero.Debug('CSL_NODEJS.getNodesByName : ' + name + " = " + nameattrval, 3);
	var ret, nodes, node, pos, len;
	ret = [];
	nodes = myxml.getElementsByTagName(name);
	for (pos = 0, len = nodes.length; pos < len; pos += 1) {
		node = nodes[pos];
		if (nameattrval && !(this.hasAttributes(node) && node.getAttribute("name") == nameattrval)) {
			continue;
		}
		ret.push(node);
		//zotero.Debug("getNodesByName push " + node.nodeName);
	}
	return ret;
}
CSL_NODEJS.prototype.nodeNameIs = function (myxml,name) {
    //zotero.Debug('CSL_NODEJS.nodeNameIs', 3);
	if (name == myxml.nodeName) {
		return true;
	}
	return false;
}
//TODO: IS THIS SUPPOSED TO BE TAKING A STRING OF XML OR A NODE LIKE OTHER MYXML ARGS EXPECTED TO BE?
CSL_NODEJS.prototype.makeXml = function (myxml) {
    zotero.Debug('CSL_NODEJS.makeXml', 3);
    //var o3parser = require('./node-o3-xml/lib/o3-xml');
	var ret, topnode;
	if (!myxml) {
		myxml = "<docco><bogus/></docco>";
	}
	myxml = myxml.replace(/\s*<\?[^>]*\?>\s*\n*/g, "");
	var nodetree = this.parser.parseFromString(myxml);
	if(nodetree === null){
	    //zotero.Debug("nodetree is null");
    }
	if(nodetree) {
	    return nodetree.documentElement;
	}
	else{
	    //zotero.Debug("failed to parse nodetree");
	    process.exit(1);
	}
};
CSL_NODEJS.prototype.insertChildNodeAfter = function (parent,node,pos,datexml) {
    zotero.Debug('CSL_NODEJS.insertChildNodeAfter', 3);
    var myxml, xml;
	myxml = this.importNode(node.ownerDocument, datexml);
	parent.replaceChild(myxml, node);
 	return parent;
 	/*
	var myxml, xml;
	myxml = this.importNode(parent, datexml);
	//myxml = this.importNode(node.ownerDocument, datexml);
	parent.replaceChild(myxml, node);
	*/
 	zotero.Debug('exiting CSL_NODEJS.insertChildNodeAfter', 3);
	return parent;
};
CSL_NODEJS.prototype.addInstitutionNodes = function(myxml) {
    zotero.Debug('CSL_NODEJS.addInstitutionNodes', 3);
	var names, thenames, institution, theinstitution, name, thename, xml, pos, len;
	names = myxml.getElementsByTagName("names");
	for (pos = 0, len = names.length; pos < len; pos += 1) {
	    thenames = names[pos];
		name = thenames.getElementsByTagName("name");
		if (name.length == 0) {
			continue;
		}
		institution = thenames.getElementsByTagName("institution");
		if (institution.length == 0) {
		    theinstitution = this.importNode(myxml.ownerDocument, this.institution);
			thename = name[0];
			thenames.insertBefore(theinstitution, thename.nextSibling);
		}
	}
};

exports.CSL_NODEJS = CSL_NODEJS;

