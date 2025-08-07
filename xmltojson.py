#!/usr/bin/python3
''' Make me a module
'''

from xml.dom import minidom
import json,re

# jsonwalker class copied from src/xmljson.js from citeproc-js project
# https://bitbucket.org/fbennett/citeproc-js
class jsonwalker:
    
    def __init__(self):
        pass

    def makedoc(self,xmlstring):
        #xmlstring = re.sub("(?ms)^<\?[^>]*\?>","",xmlstring);
        dom = minidom.parseString(xmlstring)
        return dom.documentElement

    def walktojson(self, elem):
        obj = {}
        obj["name"] = elem.nodeName
        obj["attrs"] = {}
        if elem.attributes:
            for key in elem.attributes.keys():
                obj["attrs"][key] = elem.attributes[key].value
        obj["children"] = []
        if len(elem.childNodes) == 0 and elem.nodeName == "term":
            obj["children"] = [""]
        for child in elem.childNodes:
            if child.nodeName == "#comment":
                pass
            elif child.nodeName == "#text":
                if len(elem.childNodes) == 1 and elem.nodeName in ["term","single","multiple"]:
                    obj["children"].append(child.wholeText)
            else:
                obj["children"].append(self.walktojson(child))
        return obj

if __name__ == "__main__":
    #convert file or directory from csl xml to json
    #usage:
    #  convert all styles in ./csl that have been modified in the last 5 minutes and place them into ./csljson
    #  xmltojson.py --changed 300 ./csl ./csljson
    import sys,os,argparse,datetime
    from stat import *

    parser = argparse.ArgumentParser(description='Convert xml to json for use with citeproc-js')
    parser.add_argument('source', type=str, help='source file or directory')
    parser.add_argument('dest', type=str, help='destination filename or directory')
    parser.add_argument('--changed', nargs='?', metavar="N", type=int, default=0, help='convert files that have been modified within the last <N> seconds')

    args = parser.parse_args()
    
    w = jsonwalker()
    mode = os.stat(args.source).st_mode
    if S_ISDIR(mode):
        # It's a directory, convert all csl files inside
        sourceDir = args.source
        destDir = args.dest
        if not os.path.exists(destDir):
            os.mkdir(destDir)
        directory = True
    elif S_ISREG(mode):
        # It's a file, only convert this csl file
        sourceFile = args.source
        destFile = args.dest
        singleFile = True
    else:
        print("unknown file mode")
        sys.exit(1)

    if directory:
        changedCutoff = datetime.datetime.now() - datetime.timedelta(seconds=args.changed)
        names = os.listdir(args.source)
        for name in names:
            if name[-4:] == '.csl':
                fullname = os.path.join(sourceDir, name)
                newname = os.path.join(destDir, name)
            elif name[-4:] == '.xml':
                fullname = os.path.join(sourceDir, name)
                newname = os.path.join(destDir, name)[0:-3] + 'json'
            else:
                continue
            if args.changed != 0:
                modified = datetime.datetime.fromtimestamp(os.stat(fullname).st_mtime)
                if modified < changedCutoff:
                    #not modified recently enough; continue without converting
                    continue
            
            print("converting " + fullname + " to " + newname)
            doc = w.makedoc(open(fullname, encoding='utf-8').read())
            obj = w.walktojson(doc)
            open(newname, 'w').write(json.dumps(obj,indent=2))
    elif singleFile:
        if sourceFile[-4:] != '.csl':
            print("Unexpected file extension")
            sys.exit(2)
        print("converting " + sourceFile + " to " + destFile)
        doc = w.makedoc(open(sourceFile).read())
        obj = w.walktojson(doc)
        open(destFile, 'w').write(json.dumps(obj,indent=2))
