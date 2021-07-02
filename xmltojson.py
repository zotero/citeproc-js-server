#!/usr/bin/python

import argparse
import datetime
import json
import os
import stat
from xml.dom import minidom


class JsonWalker:

    @staticmethod
    def make_doc(xml_string):
        dom = minidom.parseString(xml_string)
        return dom.documentElement

    def walk_to_json(self, elem):
        obj = {
            "name": elem.nodeName,
            "attrs": {},
            "children": [],
        }

        if elem.attributes:
            for key in elem.attributes.keys():
                obj["attrs"][key] = elem.attributes[key].value

        if len(elem.childNodes) == 0 and elem.nodeName == "term":
            obj["children"] = [""]

        for child in elem.childNodes:
            if child.nodeName == "#comment":
                pass
            elif child.nodeName == "#text":
                if len(elem.childNodes) == 1 and elem.nodeName in ["term", "single", "multiple"]:
                    obj["children"].append(child.wholeText)
            else:
                obj["children"].append(self.walk_to_json(child))

        return obj


def main():
    parser = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description='Convert xml to json for use with citeproc-js.',
        epilog='''Examples:
        
  Convert all styles in ./csl that have been modified in the last 5 minutes and place them into ./csljson

    ./xmltojson.py --changed 300 ./csl ./csljson
'''
    )
    parser.add_argument(
        'source',
        type=str,
        help='Source file or directory.'
    )
    parser.add_argument(
        'dest',
        type=str,
        help='Destination file or directory.'
    )
    parser.add_argument(
        '--changed',
        nargs='?',
        metavar="N",
        type=int,
        default=0,
        help='Convert files that have been modified within the last <N> seconds.'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Show verbose progress output.'
    )

    args = parser.parse_args()

    verbose = args.verbose
    mode = os.stat(args.source).st_mode
    if stat.S_ISDIR(mode):
        # It's a directory, convert all csl files inside
        if not os.path.exists(args.dest):
            os.mkdir(args.dest)
        convert_directory(
            source_dir=args.source,
            dest_dir=args.dest,
            changed=args.changed,
            verbose=verbose,
        )
    elif stat.S_ISREG(mode):
        # It's a file, only convert this csl file
        convert_file(
            source_file=args.source,
            dest_file=args.dest,
            verbose=verbose,
        )
    else:
        raise RuntimeError("Unknown file mode.")


def convert_file(source_file, dest_file, verbose):
    if source_file[-4:] != '.csl':
        raise RuntimeError("Unexpected file extension")

    if verbose:
        print("Converting " + source_file + " to " + dest_file)

    w = JsonWalker()
    doc = w.make_doc(open(source_file).read())
    obj = w.walk_to_json(doc)
    with open(dest_file, 'w') as f:
        f.write(json.dumps(obj, indent=2))


def convert_directory(source_dir, dest_dir, changed, verbose):
    changed_cutoff = datetime.datetime.now() - datetime.timedelta(seconds=changed)
    for name in os.listdir(source_dir):
        if name[-4:] == '.csl':
            source_file = os.path.join(source_dir, name)
            dest_file = os.path.join(dest_dir, name)
        elif name[-4:] == '.xml':
            source_file = os.path.join(source_dir, name)
            dest_file = os.path.join(dest_dir, name)[0:-3] + 'json'
        else:
            continue
        if changed != 0:
            modified = datetime.datetime.fromtimestamp(os.stat(source_file).st_mtime)
            if modified < changed_cutoff:
                # not modified recently enough; continue without converting
                continue

        convert_file(source_file, dest_file, verbose)


if __name__ == "__main__":
    main()
