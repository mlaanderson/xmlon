var sax = require('sax');
var XMLWriter = require('xml-writer');

/**
 * The XMLON.parse() method parses a XML string, constructing the JavaScript 
 * value or object described by the string. An optional reviver function can be
 * provided to perform a transformation on the resulting object before it is returned.
 * 
 * @param {string} xml - The string to parse as XML.
 * @param {(key,value) => any} [reviver=undefined] - If a function, this prescribes how 
 * the value originally produced by parsing is transformed, before being returned.
 * level object key.
 * @returns {any} - The Object corresponding to the given XML text
 */
function Parse(xml, reviver = undefined) {
    var parser = sax.parser(true);
    var path = [];
    var obj = {};
    var current = obj;
    var rootNode = null;
    
    parser.onerror = function(e) {
        console.log('error', e);
    }
    
    parser.onopentag = function(node) {
        if (rootNode === null) rootNode = node.attributes.name;
        path.push(node);
        if (node.isSelfClosing === false) {
            switch(node.name) {
                case 'date':
                case 'number':
                case 'string':
                case 'boolean':
                    node.dataType = 'basic';
                    break;
                case 'array':
                    node.dataType = 'array';
                    node.parentObject = current;
                    current[node.attributes.name] = [];
                    current = current[node.attributes.name];
                    break;
                default:
                    node.dataType = 'object';
                    node.parentObject = current;
                    current[node.attributes.name] = {};
                    current = current[node.attributes.name];
                    break;
            }
        } else {
            node.dataType = 'null';
            current[node.attributes.name] = null;
        }
    }
    
    parser.ontext = function(t) {
        if (path.length > 0) {
            var value = undefined;
            switch(path[path.length - 1].name) {
                case 'date':
                    value = new Date(t);
                    break;
                case 'number':
                    value = parseFloat(t);
                    break;
                case 'string':
                    value = t;
                    break;
                case 'boolean':
                    value = (t === 'true');
                    break;
            }
            if (value !== undefined) {
                current[path[path.length - 1].attributes.name] = value;
            }
        }
    }
    
    parser.onclosetag = function(tagname) {
        var node = path.pop();
        if (node.dataType !== 'basic') {
            current = node.parentObject;
        }
    }
    
    parser.write(xml).close();


    if (reviver && typeof reviver === 'function') {
        function revive(value) {
            if (value instanceof Date) {
                return value;
            }
            if (value instanceof Array) {
                let result = [];
                for (let n = 0; n < value.length; n++) {
                    let element = reviver(n, value[n]);
                    if (element !== undefined) {
                        result.push(revive(element));
                    }
                }
                return result;
            }
            if (typeof value === 'object') {
                let result = {};
                for (let key in value) {
                    let element = reviver(key, value[key]);
                    if (element !== undefined) {
                        result[key] = revive(element);
                    }
                }
                return result;
            }
            return value;
        }

        obj[rootNode] = revive(obj[rootNode]);
    }

    return obj[rootNode];
}

/**
 * The XMLON.stringify() method converts a JavaScript value to an XML string, 
 * optionally replacing values if a replacer function is specified, or 
 * optionally including only the specified properties if a replacer array is 
 * specified.
 * 
 * @param {any} value - The value to convert to an XML string.
 * @param {(key, value) => any} [replacer=undefined] - A function that 
 * alters the behavior of the stringification process, or an array of String
 * and Number objects that serve as a whitelist for selecting/filtering the 
 * properties of the value object to be included in the XML string. If this
 * value is null or not provided, all properties of the object are included in
 * the resulting XML string.
 * @param {any} [space=undefined] - A String or Number object that's used to 
 * insert white space into the output XML string for readability purposes. If 
 * this is a Number, it indicates the number of space characters to use as 
 * white space; this number is capped at 10 (if it is greater, the value is 
 * just 10). Values less than 1 indicate that no space should be used. If this 
 * is a String, the string (or the first 10 characters of the string, if it's 
 * longer than that) is used as white space. If this parameter is not provided 
 * (or is null), no white space is used.
 * @returns {string} - An XML string representing the given value.
 */
function Stringify(value, replacer = undefined, space = undefined) {
    if (typeof space === 'number') {
        space = ' '.repeat(space);
    }

    if (replacer) {
        if (replacer instanceof Array) {
            var keys = replacer;
            replacer = function(key, value) {
                if (keys.indexOf(key) < 0) return undefined;
                return value;
            }
        }
    } else {
        replacer = function(key, value) {
            return value;
        }
    }

    function clone(source) {
        let result;
        if (source instanceof Date) {
            return source;
        } else if (source instanceof Array) {
            result = [];
            for (let n = 0; n < source.length; n++) {
                let element = replacer(n, source[n]);
                if (element !== undefined) {
                    result.push(clone(element));
                }
            }
        } else if (typeof source === 'object') {
            result = {};
            for (let key in source) {
                let element = replacer(key, source[key]);
                if (element !== undefined) {
                    result[key] = clone(element);
                }
            }
        } else {
            result = source;
        }
        return result;
    }

    value = clone(value);

    var writer = new XMLWriter(space);

    function getTagname(value) {
        if (value instanceof Date) return "date";
        if (value instanceof Array) return "array";
        return typeof value;
    }

    function stringifyValue(value) {
        if (value instanceof Date === true) {
            writer.text(value.toISOString());
        } else if (value instanceof Array === true) {
            for (let n = 0; n < value.length; n++) {
                if (typeof value[n] === 'function') continue;
                writer.startElement(getTagname(value[n]));
                writer.writeAttribute('name', n);
                stringifyValue(value[n]);
                writer.endElement();
            }
        } else if (typeof value === 'object') {
            for (let key in value) {
                if (typeof value[key] === 'function') continue;
                writer.startElement(getTagname(value[key]));
                writer.writeAttribute('name', key);
                stringifyValue(value[key]);
                writer.endElement();
            }
        } else if (typeof value === 'function') {
            return;
        } else {
            writer.text(value.toString());
        }
    }

    writer.startDocument('1.0', 'UTF-8', true).startElement(getTagname(value));
    stringifyValue(value);
    writer.endElement();
    writer.endDocument();

    return writer.toString();
}

module.exports = {
    parse: Parse,
    stringify: Stringify
};

if (require.main === module) {
    var XMLON = require('.');
    var obj = { a: 1,
        b: false,
        c: 'hello &\" \' <> World',
        d: new Date(),
        e: [ 1, 2, 3, 4, 5, 'test' ],
        f: () => {},
        g: true 
    };

    var xml = XMLON.stringify(obj, (key, value) => { return key === 'd' ? undefined : value; }, 4);

    console.log(xml);

    console.log(XMLON.parse(xml, (key, value) => {
        if (typeof value === 'number') return undefined;
        return value;
    }));
}