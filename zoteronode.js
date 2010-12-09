var zotero = {};
zotero.DebugPriority = 0;
zotero.DebugEnabled = 0;
zotero.Debug = function(str, priority){
    if(typeof priority == "undefined"){
        priority = 1;
    }
    if(!this.DebugEnabled) return;
    if(priority >= this.DebugPriority){
        console.log(str);
    }
}

zotero.objectOwnKeys = function(obj){
    var k;
    for(k in obj){
        if(obj.hasOwnProperty(k)){
            console.log(k);
        }
    }
}

exports.zotero = zotero;
