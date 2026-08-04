var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS((exports2) => {
  var ALIAS = Symbol.for("yaml.alias");
  var DOC = Symbol.for("yaml.document");
  var MAP = Symbol.for("yaml.map");
  var PAIR = Symbol.for("yaml.pair");
  var SCALAR = Symbol.for("yaml.scalar");
  var SEQ = Symbol.for("yaml.seq");
  var NODE_TYPE = Symbol.for("yaml.node.type");
  var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
  var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
  var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
  var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
  var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
  var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
  function isCollection(node) {
    if (node && typeof node === "object")
      switch (node[NODE_TYPE]) {
        case MAP:
        case SEQ:
          return true;
      }
    return false;
  }
  function isNode(node) {
    if (node && typeof node === "object")
      switch (node[NODE_TYPE]) {
        case ALIAS:
        case MAP:
        case SCALAR:
        case SEQ:
          return true;
      }
    return false;
  }
  var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
  exports2.ALIAS = ALIAS;
  exports2.DOC = DOC;
  exports2.MAP = MAP;
  exports2.NODE_TYPE = NODE_TYPE;
  exports2.PAIR = PAIR;
  exports2.SCALAR = SCALAR;
  exports2.SEQ = SEQ;
  exports2.hasAnchor = hasAnchor;
  exports2.isAlias = isAlias;
  exports2.isCollection = isCollection;
  exports2.isDocument = isDocument;
  exports2.isMap = isMap;
  exports2.isNode = isNode;
  exports2.isPair = isPair;
  exports2.isScalar = isScalar;
  exports2.isSeq = isSeq;
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS((exports2) => {
  var identity = require_identity();
  var BREAK = Symbol("break visit");
  var SKIP = Symbol("skip children");
  var REMOVE = Symbol("remove node");
  function visit(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
      const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
      if (cd === REMOVE)
        node.contents = null;
    } else
      visit_(null, node, visitor_, Object.freeze([]));
  }
  visit.BREAK = BREAK;
  visit.SKIP = SKIP;
  visit.REMOVE = REMOVE;
  function visit_(key, node, visitor, path) {
    const ctrl = callVisitor(key, node, visitor, path);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
      replaceNode(key, path, ctrl);
      return visit_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== "symbol") {
      if (identity.isCollection(node)) {
        path = Object.freeze(path.concat(node));
        for (let i = 0;i < node.items.length; ++i) {
          const ci = visit_(i, node.items[i], visitor, path);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            node.items.splice(i, 1);
            i -= 1;
          }
        }
      } else if (identity.isPair(node)) {
        path = Object.freeze(path.concat(node));
        const ck = visit_("key", node.key, visitor, path);
        if (ck === BREAK)
          return BREAK;
        else if (ck === REMOVE)
          node.key = null;
        const cv = visit_("value", node.value, visitor, path);
        if (cv === BREAK)
          return BREAK;
        else if (cv === REMOVE)
          node.value = null;
      }
    }
    return ctrl;
  }
  async function visitAsync(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
      const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
      if (cd === REMOVE)
        node.contents = null;
    } else
      await visitAsync_(null, node, visitor_, Object.freeze([]));
  }
  visitAsync.BREAK = BREAK;
  visitAsync.SKIP = SKIP;
  visitAsync.REMOVE = REMOVE;
  async function visitAsync_(key, node, visitor, path) {
    const ctrl = await callVisitor(key, node, visitor, path);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
      replaceNode(key, path, ctrl);
      return visitAsync_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== "symbol") {
      if (identity.isCollection(node)) {
        path = Object.freeze(path.concat(node));
        for (let i = 0;i < node.items.length; ++i) {
          const ci = await visitAsync_(i, node.items[i], visitor, path);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            node.items.splice(i, 1);
            i -= 1;
          }
        }
      } else if (identity.isPair(node)) {
        path = Object.freeze(path.concat(node));
        const ck = await visitAsync_("key", node.key, visitor, path);
        if (ck === BREAK)
          return BREAK;
        else if (ck === REMOVE)
          node.key = null;
        const cv = await visitAsync_("value", node.value, visitor, path);
        if (cv === BREAK)
          return BREAK;
        else if (cv === REMOVE)
          node.value = null;
      }
    }
    return ctrl;
  }
  function initVisitor(visitor) {
    if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
      return Object.assign({
        Alias: visitor.Node,
        Map: visitor.Node,
        Scalar: visitor.Node,
        Seq: visitor.Node
      }, visitor.Value && {
        Map: visitor.Value,
        Scalar: visitor.Value,
        Seq: visitor.Value
      }, visitor.Collection && {
        Map: visitor.Collection,
        Seq: visitor.Collection
      }, visitor);
    }
    return visitor;
  }
  function callVisitor(key, node, visitor, path) {
    if (typeof visitor === "function")
      return visitor(key, node, path);
    if (identity.isMap(node))
      return visitor.Map?.(key, node, path);
    if (identity.isSeq(node))
      return visitor.Seq?.(key, node, path);
    if (identity.isPair(node))
      return visitor.Pair?.(key, node, path);
    if (identity.isScalar(node))
      return visitor.Scalar?.(key, node, path);
    if (identity.isAlias(node))
      return visitor.Alias?.(key, node, path);
    return;
  }
  function replaceNode(key, path, node) {
    const parent = path[path.length - 1];
    if (identity.isCollection(parent)) {
      parent.items[key] = node;
    } else if (identity.isPair(parent)) {
      if (key === "key")
        parent.key = node;
      else
        parent.value = node;
    } else if (identity.isDocument(parent)) {
      parent.contents = node;
    } else {
      const pt = identity.isAlias(parent) ? "alias" : "scalar";
      throw new Error(`Cannot replace node with ${pt} parent`);
    }
  }
  exports2.visit = visit;
  exports2.visitAsync = visitAsync;
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS((exports2) => {
  var identity = require_identity();
  var visit = require_visit();
  var escapeChars = {
    "!": "%21",
    ",": "%2C",
    "[": "%5B",
    "]": "%5D",
    "{": "%7B",
    "}": "%7D"
  };
  var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);

  class Directives {
    constructor(yaml, tags) {
      this.docStart = null;
      this.docEnd = false;
      this.yaml = Object.assign({}, Directives.defaultYaml, yaml);
      this.tags = Object.assign({}, Directives.defaultTags, tags);
    }
    clone() {
      const copy = new Directives(this.yaml, this.tags);
      copy.docStart = this.docStart;
      return copy;
    }
    atDocument() {
      const res = new Directives(this.yaml, this.tags);
      switch (this.yaml.version) {
        case "1.1":
          this.atNextDocument = true;
          break;
        case "1.2":
          this.atNextDocument = false;
          this.yaml = {
            explicit: Directives.defaultYaml.explicit,
            version: "1.2"
          };
          this.tags = Object.assign({}, Directives.defaultTags);
          break;
      }
      return res;
    }
    add(line, onError) {
      if (this.atNextDocument) {
        this.yaml = { explicit: Directives.defaultYaml.explicit, version: "1.1" };
        this.tags = Object.assign({}, Directives.defaultTags);
        this.atNextDocument = false;
      }
      const parts = line.trim().split(/[ \t]+/);
      const name = parts.shift();
      switch (name) {
        case "%TAG": {
          if (parts.length !== 2) {
            onError(0, "%TAG directive should contain exactly two parts");
            if (parts.length < 2)
              return false;
          }
          const [handle, prefix] = parts;
          this.tags[handle] = prefix;
          return true;
        }
        case "%YAML": {
          this.yaml.explicit = true;
          if (parts.length !== 1) {
            onError(0, "%YAML directive should contain exactly one part");
            return false;
          }
          const [version] = parts;
          if (version === "1.1" || version === "1.2") {
            this.yaml.version = version;
            return true;
          } else {
            const isValid = /^\d+\.\d+$/.test(version);
            onError(6, `Unsupported YAML version ${version}`, isValid);
            return false;
          }
        }
        default:
          onError(0, `Unknown directive ${name}`, true);
          return false;
      }
    }
    tagName(source, onError) {
      if (source === "!")
        return "!";
      if (source[0] !== "!") {
        onError(`Not a valid tag: ${source}`);
        return null;
      }
      if (source[1] === "<") {
        const verbatim = source.slice(2, -1);
        if (verbatim === "!" || verbatim === "!!") {
          onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
          return null;
        }
        if (source[source.length - 1] !== ">")
          onError("Verbatim tags must end with a >");
        return verbatim;
      }
      const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
      if (!suffix)
        onError(`The ${source} tag has no suffix`);
      const prefix = this.tags[handle];
      if (prefix) {
        try {
          return prefix + decodeURIComponent(suffix);
        } catch (error) {
          onError(String(error));
          return null;
        }
      }
      if (handle === "!")
        return source;
      onError(`Could not resolve tag: ${source}`);
      return null;
    }
    tagString(tag) {
      for (const [handle, prefix] of Object.entries(this.tags)) {
        if (tag.startsWith(prefix))
          return handle + escapeTagName(tag.substring(prefix.length));
      }
      return tag[0] === "!" ? tag : `!<${tag}>`;
    }
    toString(doc) {
      const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
      const tagEntries = Object.entries(this.tags);
      let tagNames;
      if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
        const tags = {};
        visit.visit(doc.contents, (_key, node) => {
          if (identity.isNode(node) && node.tag)
            tags[node.tag] = true;
        });
        tagNames = Object.keys(tags);
      } else
        tagNames = [];
      for (const [handle, prefix] of tagEntries) {
        if (handle === "!!" && prefix === "tag:yaml.org,2002:")
          continue;
        if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
          lines.push(`%TAG ${handle} ${prefix}`);
      }
      return lines.join(`
`);
    }
  }
  Directives.defaultYaml = { explicit: false, version: "1.2" };
  Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
  exports2.Directives = Directives;
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS((exports2) => {
  var identity = require_identity();
  var visit = require_visit();
  function anchorIsValid(anchor) {
    if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
      const sa = JSON.stringify(anchor);
      const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
      throw new Error(msg);
    }
    return true;
  }
  function anchorNames(root) {
    const anchors = new Set;
    visit.visit(root, {
      Value(_key, node) {
        if (node.anchor)
          anchors.add(node.anchor);
      }
    });
    return anchors;
  }
  function findNewAnchor(prefix, exclude) {
    for (let i = 1;; ++i) {
      const name = `${prefix}${i}`;
      if (!exclude.has(name))
        return name;
    }
  }
  function createNodeAnchors(doc, prefix) {
    const aliasObjects = [];
    const sourceObjects = new Map;
    let prevAnchors = null;
    return {
      onAnchor: (source) => {
        aliasObjects.push(source);
        prevAnchors ?? (prevAnchors = anchorNames(doc));
        const anchor = findNewAnchor(prefix, prevAnchors);
        prevAnchors.add(anchor);
        return anchor;
      },
      setAnchors: () => {
        for (const source of aliasObjects) {
          const ref = sourceObjects.get(source);
          if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
            ref.node.anchor = ref.anchor;
          } else {
            const error = new Error("Failed to resolve repeated object (this should not happen)");
            error.source = source;
            throw error;
          }
        }
      },
      sourceObjects
    };
  }
  exports2.anchorIsValid = anchorIsValid;
  exports2.anchorNames = anchorNames;
  exports2.createNodeAnchors = createNodeAnchors;
  exports2.findNewAnchor = findNewAnchor;
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS((exports2) => {
  function applyReviver(reviver, obj, key, val) {
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        for (let i = 0, len = val.length;i < len; ++i) {
          const v0 = val[i];
          const v1 = applyReviver(reviver, val, String(i), v0);
          if (v1 === undefined)
            delete val[i];
          else if (v1 !== v0)
            val[i] = v1;
        }
      } else if (val instanceof Map) {
        for (const k of Array.from(val.keys())) {
          const v0 = val.get(k);
          const v1 = applyReviver(reviver, val, k, v0);
          if (v1 === undefined)
            val.delete(k);
          else if (v1 !== v0)
            val.set(k, v1);
        }
      } else if (val instanceof Set) {
        for (const v0 of Array.from(val)) {
          const v1 = applyReviver(reviver, val, v0, v0);
          if (v1 === undefined)
            val.delete(v0);
          else if (v1 !== v0) {
            val.delete(v0);
            val.add(v1);
          }
        }
      } else {
        for (const [k, v0] of Object.entries(val)) {
          const v1 = applyReviver(reviver, val, k, v0);
          if (v1 === undefined)
            delete val[k];
          else if (v1 !== v0)
            val[k] = v1;
        }
      }
    }
    return reviver.call(obj, key, val);
  }
  exports2.applyReviver = applyReviver;
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS((exports2) => {
  var identity = require_identity();
  function toJS(value, arg, ctx) {
    if (Array.isArray(value))
      return value.map((v, i) => toJS(v, String(i), ctx));
    if (value && typeof value.toJSON === "function") {
      if (!ctx || !identity.hasAnchor(value))
        return value.toJSON(arg, ctx);
      const data = { aliasCount: 0, count: 1, res: undefined };
      ctx.anchors.set(value, data);
      ctx.onCreate = (res2) => {
        data.res = res2;
        delete ctx.onCreate;
      };
      const res = value.toJSON(arg, ctx);
      if (ctx.onCreate)
        ctx.onCreate(res);
      return res;
    }
    if (typeof value === "bigint" && !ctx?.keep)
      return Number(value);
    return value;
  }
  exports2.toJS = toJS;
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS((exports2) => {
  var applyReviver = require_applyReviver();
  var identity = require_identity();
  var toJS = require_toJS();

  class NodeBase {
    constructor(type) {
      Object.defineProperty(this, identity.NODE_TYPE, { value: type });
    }
    clone() {
      const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
      if (!identity.isDocument(doc))
        throw new TypeError("A document argument is required");
      const ctx = {
        anchors: new Map,
        doc,
        keep: true,
        mapAsMap: mapAsMap === true,
        mapKeyWarned: false,
        maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
      };
      const res = toJS.toJS(this, "", ctx);
      if (typeof onAnchor === "function")
        for (const { count, res: res2 } of ctx.anchors.values())
          onAnchor(res2, count);
      return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
    }
  }
  exports2.NodeBase = NodeBase;
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS((exports2) => {
  var anchors = require_anchors();
  var visit = require_visit();
  var identity = require_identity();
  var Node = require_Node();
  var toJS = require_toJS();

  class Alias extends Node.NodeBase {
    constructor(source) {
      super(identity.ALIAS);
      this.source = source;
      Object.defineProperty(this, "tag", {
        set() {
          throw new Error("Alias nodes cannot have tags");
        }
      });
    }
    resolve(doc, ctx) {
      if (ctx?.maxAliasCount === 0)
        throw new ReferenceError("Alias resolution is disabled");
      let nodes;
      if (ctx?.aliasResolveCache) {
        nodes = ctx.aliasResolveCache;
      } else {
        nodes = [];
        visit.visit(doc, {
          Node: (_key, node) => {
            if (identity.isAlias(node) || identity.hasAnchor(node))
              nodes.push(node);
          }
        });
        if (ctx)
          ctx.aliasResolveCache = nodes;
      }
      let found = undefined;
      for (const node of nodes) {
        if (node === this)
          break;
        if (node.anchor === this.source)
          found = node;
      }
      return found;
    }
    toJSON(_arg, ctx) {
      if (!ctx)
        return { source: this.source };
      const { anchors: anchors2, doc, maxAliasCount } = ctx;
      const source = this.resolve(doc, ctx);
      if (!source) {
        const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
        throw new ReferenceError(msg);
      }
      let data = anchors2.get(source);
      if (!data) {
        toJS.toJS(source, null, ctx);
        data = anchors2.get(source);
      }
      if (data?.res === undefined) {
        const msg = "This should not happen: Alias anchor was not resolved?";
        throw new ReferenceError(msg);
      }
      if (maxAliasCount >= 0) {
        data.count += 1;
        if (data.aliasCount === 0)
          data.aliasCount = getAliasCount(doc, source, anchors2);
        if (data.count * data.aliasCount > maxAliasCount) {
          const msg = "Excessive alias count indicates a resource exhaustion attack";
          throw new ReferenceError(msg);
        }
      }
      return data.res;
    }
    toString(ctx, _onComment, _onChompKeep) {
      const src = `*${this.source}`;
      if (ctx) {
        anchors.anchorIsValid(this.source);
        if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new Error(msg);
        }
        if (ctx.implicitKey)
          return `${src} `;
      }
      return src;
    }
  }
  function getAliasCount(doc, node, anchors2) {
    if (identity.isAlias(node)) {
      const source = node.resolve(doc);
      const anchor = anchors2 && source && anchors2.get(source);
      return anchor ? anchor.count * anchor.aliasCount : 0;
    } else if (identity.isCollection(node)) {
      let count = 0;
      for (const item of node.items) {
        const c = getAliasCount(doc, item, anchors2);
        if (c > count)
          count = c;
      }
      return count;
    } else if (identity.isPair(node)) {
      const kc = getAliasCount(doc, node.key, anchors2);
      const vc = getAliasCount(doc, node.value, anchors2);
      return Math.max(kc, vc);
    }
    return 1;
  }
  exports2.Alias = Alias;
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS((exports2) => {
  var identity = require_identity();
  var Node = require_Node();
  var toJS = require_toJS();
  var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";

  class Scalar extends Node.NodeBase {
    constructor(value) {
      super(identity.SCALAR);
      this.value = value;
    }
    toJSON(arg, ctx) {
      return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
    }
    toString() {
      return String(this.value);
    }
  }
  Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
  Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
  Scalar.PLAIN = "PLAIN";
  Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
  Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
  exports2.Scalar = Scalar;
  exports2.isScalarValue = isScalarValue;
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS((exports2) => {
  var Alias = require_Alias();
  var identity = require_identity();
  var Scalar = require_Scalar();
  var defaultTagPrefix = "tag:yaml.org,2002:";
  function findTagObject(value, tagName, tags) {
    if (tagName) {
      const match = tags.filter((t) => t.tag === tagName);
      const tagObj = match.find((t) => !t.format) ?? match[0];
      if (!tagObj)
        throw new Error(`Tag ${tagName} not found`);
      return tagObj;
    }
    return tags.find((t) => t.identify?.(value) && !t.format);
  }
  function createNode(value, tagName, ctx) {
    if (identity.isDocument(value))
      value = value.contents;
    if (identity.isNode(value))
      return value;
    if (identity.isPair(value)) {
      const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
      map.items.push(value);
      return map;
    }
    if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
      value = value.valueOf();
    }
    const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
    let ref = undefined;
    if (aliasDuplicateObjects && value && typeof value === "object") {
      ref = sourceObjects.get(value);
      if (ref) {
        ref.anchor ?? (ref.anchor = onAnchor(value));
        return new Alias.Alias(ref.anchor);
      } else {
        ref = { anchor: null, node: null };
        sourceObjects.set(value, ref);
      }
    }
    if (tagName?.startsWith("!!"))
      tagName = defaultTagPrefix + tagName.slice(2);
    let tagObj = findTagObject(value, tagName, schema.tags);
    if (!tagObj) {
      if (value && typeof value.toJSON === "function") {
        value = value.toJSON();
      }
      if (!value || typeof value !== "object") {
        const node2 = new Scalar.Scalar(value);
        if (ref)
          ref.node = node2;
        return node2;
      }
      tagObj = value instanceof Map ? schema[identity.MAP] : (Symbol.iterator in Object(value)) ? schema[identity.SEQ] : schema[identity.MAP];
    }
    if (onTagObj) {
      onTagObj(tagObj);
      delete ctx.onTagObj;
    }
    const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
    if (tagName)
      node.tag = tagName;
    else if (!tagObj.default)
      node.tag = tagObj.tag;
    if (ref)
      ref.node = node;
    return node;
  }
  exports2.createNode = createNode;
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS((exports2) => {
  var createNode = require_createNode();
  var identity = require_identity();
  var Node = require_Node();
  function collectionFromPath(schema, path, value) {
    let v = value;
    for (let i = path.length - 1;i >= 0; --i) {
      const k = path[i];
      if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
        const a = [];
        a[k] = v;
        v = a;
      } else {
        v = new Map([[k, v]]);
      }
    }
    return createNode.createNode(v, undefined, {
      aliasDuplicateObjects: false,
      keepUndefined: false,
      onAnchor: () => {
        throw new Error("This should not happen, please report a bug.");
      },
      schema,
      sourceObjects: new Map
    });
  }
  var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;

  class Collection extends Node.NodeBase {
    constructor(type, schema) {
      super(type);
      Object.defineProperty(this, "schema", {
        value: schema,
        configurable: true,
        enumerable: false,
        writable: true
      });
    }
    clone(schema) {
      const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
      if (schema)
        copy.schema = schema;
      copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    addIn(path, value) {
      if (isEmptyPath(path))
        this.add(value);
      else {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (identity.isCollection(node))
          node.addIn(rest, value);
        else if (node === undefined && this.schema)
          this.set(key, collectionFromPath(this.schema, rest, value));
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
    }
    deleteIn(path) {
      const [key, ...rest] = path;
      if (rest.length === 0)
        return this.delete(key);
      const node = this.get(key, true);
      if (identity.isCollection(node))
        return node.deleteIn(rest);
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
    getIn(path, keepScalar) {
      const [key, ...rest] = path;
      const node = this.get(key, true);
      if (rest.length === 0)
        return !keepScalar && identity.isScalar(node) ? node.value : node;
      else
        return identity.isCollection(node) ? node.getIn(rest, keepScalar) : undefined;
    }
    hasAllNullValues(allowScalar) {
      return this.items.every((node) => {
        if (!identity.isPair(node))
          return false;
        const n = node.value;
        return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
      });
    }
    hasIn(path) {
      const [key, ...rest] = path;
      if (rest.length === 0)
        return this.has(key);
      const node = this.get(key, true);
      return identity.isCollection(node) ? node.hasIn(rest) : false;
    }
    setIn(path, value) {
      const [key, ...rest] = path;
      if (rest.length === 0) {
        this.set(key, value);
      } else {
        const node = this.get(key, true);
        if (identity.isCollection(node))
          node.setIn(rest, value);
        else if (node === undefined && this.schema)
          this.set(key, collectionFromPath(this.schema, rest, value));
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
    }
  }
  exports2.Collection = Collection;
  exports2.collectionFromPath = collectionFromPath;
  exports2.isEmptyPath = isEmptyPath;
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS((exports2) => {
  var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
  function indentComment(comment, indent) {
    if (/^\n+$/.test(comment))
      return comment.substring(1);
    return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
  }
  var lineComment = (str, indent, comment) => str.endsWith(`
`) ? indentComment(comment, indent) : comment.includes(`
`) ? `
` + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
  exports2.indentComment = indentComment;
  exports2.lineComment = lineComment;
  exports2.stringifyComment = stringifyComment;
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS((exports2) => {
  var FOLD_FLOW = "flow";
  var FOLD_BLOCK = "block";
  var FOLD_QUOTED = "quoted";
  function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
    if (!lineWidth || lineWidth < 0)
      return text;
    if (lineWidth < minContentWidth)
      minContentWidth = 0;
    const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
    if (text.length <= endStep)
      return text;
    const folds = [];
    const escapedFolds = {};
    let end = lineWidth - indent.length;
    if (typeof indentAtStart === "number") {
      if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
        folds.push(0);
      else
        end = lineWidth - indentAtStart;
    }
    let split = undefined;
    let prev = undefined;
    let overflow = false;
    let i = -1;
    let escStart = -1;
    let escEnd = -1;
    if (mode === FOLD_BLOCK) {
      i = consumeMoreIndentedLines(text, i, indent.length);
      if (i !== -1)
        end = i + endStep;
    }
    for (let ch;ch = text[i += 1]; ) {
      if (mode === FOLD_QUOTED && ch === "\\") {
        escStart = i;
        switch (text[i + 1]) {
          case "x":
            i += 3;
            break;
          case "u":
            i += 5;
            break;
          case "U":
            i += 9;
            break;
          default:
            i += 1;
        }
        escEnd = i;
      }
      if (ch === `
`) {
        if (mode === FOLD_BLOCK)
          i = consumeMoreIndentedLines(text, i, indent.length);
        end = i + indent.length + endStep;
        split = undefined;
      } else {
        if (ch === " " && prev && prev !== " " && prev !== `
` && prev !== "\t") {
          const next = text[i + 1];
          if (next && next !== " " && next !== `
` && next !== "\t")
            split = i;
        }
        if (i >= end) {
          if (split) {
            folds.push(split);
            end = split + endStep;
            split = undefined;
          } else if (mode === FOLD_QUOTED) {
            while (prev === " " || prev === "\t") {
              prev = ch;
              ch = text[i += 1];
              overflow = true;
            }
            const j = i > escEnd + 1 ? i - 2 : escStart - 1;
            if (escapedFolds[j])
              return text;
            folds.push(j);
            escapedFolds[j] = true;
            end = j + endStep;
            split = undefined;
          } else {
            overflow = true;
          }
        }
      }
      prev = ch;
    }
    if (overflow && onOverflow)
      onOverflow();
    if (folds.length === 0)
      return text;
    if (onFold)
      onFold();
    let res = text.slice(0, folds[0]);
    for (let i2 = 0;i2 < folds.length; ++i2) {
      const fold = folds[i2];
      const end2 = folds[i2 + 1] || text.length;
      if (fold === 0)
        res = `
${indent}${text.slice(0, end2)}`;
      else {
        if (mode === FOLD_QUOTED && escapedFolds[fold])
          res += `${text[fold]}\\`;
        res += `
${indent}${text.slice(fold + 1, end2)}`;
      }
    }
    return res;
  }
  function consumeMoreIndentedLines(text, i, indent) {
    let end = i;
    let start = i + 1;
    let ch = text[start];
    while (ch === " " || ch === "\t") {
      if (i < start + indent) {
        ch = text[++i];
      } else {
        do {
          ch = text[++i];
        } while (ch && ch !== `
`);
        end = i;
        start = i + 1;
        ch = text[start];
      }
    }
    return end;
  }
  exports2.FOLD_BLOCK = FOLD_BLOCK;
  exports2.FOLD_FLOW = FOLD_FLOW;
  exports2.FOLD_QUOTED = FOLD_QUOTED;
  exports2.foldFlowLines = foldFlowLines;
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  var foldFlowLines = require_foldFlowLines();
  var getFoldOptions = (ctx, isBlock) => ({
    indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
    lineWidth: ctx.options.lineWidth,
    minContentWidth: ctx.options.minContentWidth
  });
  var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
  function lineLengthOverLimit(str, lineWidth, indentLength) {
    if (!lineWidth || lineWidth < 0)
      return false;
    const limit = lineWidth - indentLength;
    const strLen = str.length;
    if (strLen <= limit)
      return false;
    for (let i = 0, start = 0;i < strLen; ++i) {
      if (str[i] === `
`) {
        if (i - start > limit)
          return true;
        start = i + 1;
        if (strLen - start <= limit)
          return false;
      }
    }
    return true;
  }
  function doubleQuotedString(value, ctx) {
    const json = JSON.stringify(value);
    if (ctx.options.doubleQuotedAsJSON)
      return json;
    const { implicitKey } = ctx;
    const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
    const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
    let str = "";
    let start = 0;
    for (let i = 0, ch = json[i];ch; ch = json[++i]) {
      if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
        str += json.slice(start, i) + "\\ ";
        i += 1;
        start = i;
        ch = "\\";
      }
      if (ch === "\\")
        switch (json[i + 1]) {
          case "u":
            {
              str += json.slice(start, i);
              const code = json.substr(i + 2, 4);
              switch (code) {
                case "0000":
                  str += "\\0";
                  break;
                case "0007":
                  str += "\\a";
                  break;
                case "000b":
                  str += "\\v";
                  break;
                case "001b":
                  str += "\\e";
                  break;
                case "0085":
                  str += "\\N";
                  break;
                case "00a0":
                  str += "\\_";
                  break;
                case "2028":
                  str += "\\L";
                  break;
                case "2029":
                  str += "\\P";
                  break;
                default:
                  if (code.substr(0, 2) === "00")
                    str += "\\x" + code.substr(2);
                  else
                    str += json.substr(i, 6);
              }
              i += 5;
              start = i + 1;
            }
            break;
          case "n":
            if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
              i += 1;
            } else {
              str += json.slice(start, i) + `

`;
              while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                str += `
`;
                i += 2;
              }
              str += indent;
              if (json[i + 2] === " ")
                str += "\\";
              i += 1;
              start = i + 1;
            }
            break;
          default:
            i += 1;
        }
    }
    str = start ? str + json.slice(start) : json;
    return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
  }
  function singleQuotedString(value, ctx) {
    if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes(`
`) || /[ \t]\n|\n[ \t]/.test(value))
      return doubleQuotedString(value, ctx);
    const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
    const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
    return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
  }
  function quotedString(value, ctx) {
    const { singleQuote } = ctx.options;
    let qs;
    if (singleQuote === false)
      qs = doubleQuotedString;
    else {
      const hasDouble = value.includes('"');
      const hasSingle = value.includes("'");
      if (hasDouble && !hasSingle)
        qs = singleQuotedString;
      else if (hasSingle && !hasDouble)
        qs = doubleQuotedString;
      else
        qs = singleQuote ? singleQuotedString : doubleQuotedString;
    }
    return qs(value, ctx);
  }
  var blockEndNewlines;
  try {
    blockEndNewlines = new RegExp(`(^|(?<!
))
+(?!
|$)`, "g");
  } catch {
    blockEndNewlines = /\n+(?!\n|$)/g;
  }
  function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
    const { blockQuote, commentString, lineWidth } = ctx.options;
    if (!blockQuote || /\n[\t ]+$/.test(value)) {
      return quotedString(value, ctx);
    }
    const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
    const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
    if (!value)
      return literal ? `|
` : `>
`;
    let chomp;
    let endStart;
    for (endStart = value.length;endStart > 0; --endStart) {
      const ch = value[endStart - 1];
      if (ch !== `
` && ch !== "\t" && ch !== " ")
        break;
    }
    let end = value.substring(endStart);
    const endNlPos = end.indexOf(`
`);
    if (endNlPos === -1) {
      chomp = "-";
    } else if (value === end || endNlPos !== end.length - 1) {
      chomp = "+";
      if (onChompKeep)
        onChompKeep();
    } else {
      chomp = "";
    }
    if (end) {
      value = value.slice(0, -end.length);
      if (end[end.length - 1] === `
`)
        end = end.slice(0, -1);
      end = end.replace(blockEndNewlines, `$&${indent}`);
    }
    let startWithSpace = false;
    let startEnd;
    let startNlPos = -1;
    for (startEnd = 0;startEnd < value.length; ++startEnd) {
      const ch = value[startEnd];
      if (ch === " ")
        startWithSpace = true;
      else if (ch === `
`)
        startNlPos = startEnd;
      else
        break;
    }
    let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
    if (start) {
      value = value.substring(start.length);
      start = start.replace(/\n+/g, `$&${indent}`);
    }
    const indentSize = indent ? "2" : "1";
    let header = (startWithSpace ? indentSize : "") + chomp;
    if (comment) {
      header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
      if (onComment)
        onComment();
    }
    if (!literal) {
      const foldedValue = value.replace(/\n+/g, `
$&`).replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
      let literalFallback = false;
      const foldOptions = getFoldOptions(ctx, true);
      if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
        foldOptions.onOverflow = () => {
          literalFallback = true;
        };
      }
      const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
      if (!literalFallback)
        return `>${header}
${indent}${body}`;
    }
    value = value.replace(/\n+/g, `$&${indent}`);
    return `|${header}
${indent}${start}${value}${end}`;
  }
  function plainString(item, ctx, onComment, onChompKeep) {
    const { type, value } = item;
    const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
    if (implicitKey && value.includes(`
`) || inFlow && /[[\]{},]/.test(value)) {
      return quotedString(value, ctx);
    }
    if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
      return implicitKey || inFlow || !value.includes(`
`) ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
    }
    if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes(`
`)) {
      return blockString(item, ctx, onComment, onChompKeep);
    }
    if (containsDocumentMarker(value)) {
      if (indent === "") {
        ctx.forceBlockIndent = true;
        return blockString(item, ctx, onComment, onChompKeep);
      } else if (implicitKey && indent === indentStep) {
        return quotedString(value, ctx);
      }
    }
    const str = value.replace(/\n+/g, `$&
${indent}`);
    if (actualString) {
      const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
      const { compat, tags } = ctx.doc.schema;
      if (tags.some(test) || compat?.some(test))
        return quotedString(value, ctx);
    }
    return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
  }
  function stringifyString(item, ctx, onComment, onChompKeep) {
    const { implicitKey, inFlow } = ctx;
    const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
    let { type } = item;
    if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
      if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
        type = Scalar.Scalar.QUOTE_DOUBLE;
    }
    const _stringify = (_type) => {
      switch (_type) {
        case Scalar.Scalar.BLOCK_FOLDED:
        case Scalar.Scalar.BLOCK_LITERAL:
          return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
        case Scalar.Scalar.QUOTE_DOUBLE:
          return doubleQuotedString(ss.value, ctx);
        case Scalar.Scalar.QUOTE_SINGLE:
          return singleQuotedString(ss.value, ctx);
        case Scalar.Scalar.PLAIN:
          return plainString(ss, ctx, onComment, onChompKeep);
        default:
          return null;
      }
    };
    let res = _stringify(type);
    if (res === null) {
      const { defaultKeyType, defaultStringType } = ctx.options;
      const t = implicitKey && defaultKeyType || defaultStringType;
      res = _stringify(t);
      if (res === null)
        throw new Error(`Unsupported default string type ${t}`);
    }
    return res;
  }
  exports2.stringifyString = stringifyString;
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS((exports2) => {
  var anchors = require_anchors();
  var identity = require_identity();
  var stringifyComment = require_stringifyComment();
  var stringifyString = require_stringifyString();
  function createStringifyContext(doc, options) {
    const opt = Object.assign({
      blockQuote: true,
      commentString: stringifyComment.stringifyComment,
      defaultKeyType: null,
      defaultStringType: "PLAIN",
      directives: null,
      doubleQuotedAsJSON: false,
      doubleQuotedMinMultiLineLength: 40,
      falseStr: "false",
      flowCollectionPadding: true,
      indentSeq: true,
      lineWidth: 80,
      minContentWidth: 20,
      nullStr: "null",
      simpleKeys: false,
      singleQuote: null,
      trailingComma: false,
      trueStr: "true",
      verifyAliasOrder: true
    }, doc.schema.toStringOptions, options);
    let inFlow;
    switch (opt.collectionStyle) {
      case "block":
        inFlow = false;
        break;
      case "flow":
        inFlow = true;
        break;
      default:
        inFlow = null;
    }
    return {
      anchors: new Set,
      doc,
      flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
      indent: "",
      indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
      inFlow,
      options: opt
    };
  }
  function getTagObject(tags, item) {
    if (item.tag) {
      const match = tags.filter((t) => t.tag === item.tag);
      if (match.length > 0)
        return match.find((t) => t.format === item.format) ?? match[0];
    }
    let tagObj = undefined;
    let obj;
    if (identity.isScalar(item)) {
      obj = item.value;
      let match = tags.filter((t) => t.identify?.(obj));
      if (match.length > 1) {
        const testMatch = match.filter((t) => t.test);
        if (testMatch.length > 0)
          match = testMatch;
      }
      tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
    } else {
      obj = item;
      tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
    }
    if (!tagObj) {
      const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
      throw new Error(`Tag not resolved for ${name} value`);
    }
    return tagObj;
  }
  function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
    if (!doc.directives)
      return "";
    const props = [];
    const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
    if (anchor && anchors.anchorIsValid(anchor)) {
      anchors$1.add(anchor);
      props.push(`&${anchor}`);
    }
    const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
    if (tag)
      props.push(doc.directives.tagString(tag));
    return props.join(" ");
  }
  function stringify(item, ctx, onComment, onChompKeep) {
    if (identity.isPair(item))
      return item.toString(ctx, onComment, onChompKeep);
    if (identity.isAlias(item)) {
      if (ctx.doc.directives)
        return item.toString(ctx);
      if (ctx.resolvedAliases?.has(item)) {
        throw new TypeError(`Cannot stringify circular structure without alias nodes`);
      } else {
        if (ctx.resolvedAliases)
          ctx.resolvedAliases.add(item);
        else
          ctx.resolvedAliases = new Set([item]);
        item = item.resolve(ctx.doc);
      }
    }
    let tagObj = undefined;
    const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
    tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
    const props = stringifyProps(node, tagObj, ctx);
    if (props.length > 0)
      ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
    const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
    if (!props)
      return str;
    return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
  }
  exports2.createStringifyContext = createStringifyContext;
  exports2.stringify = stringify;
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS((exports2) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var stringify = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
    const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
    let keyComment = identity.isNode(key) && key.comment || null;
    if (simpleKeys) {
      if (keyComment) {
        throw new Error("With simple keys, key nodes cannot have comments");
      }
      if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
        const msg = "With simple keys, collection cannot be used as a key value";
        throw new Error(msg);
      }
    }
    let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
    ctx = Object.assign({}, ctx, {
      allNullValues: false,
      implicitKey: !explicitKey && (simpleKeys || !allNullValues),
      indent: indent + indentStep
    });
    let keyCommentDone = false;
    let chompKeep = false;
    let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
    if (!explicitKey && !ctx.inFlow && str.length > 1024) {
      if (simpleKeys)
        throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
      explicitKey = true;
    }
    if (ctx.inFlow) {
      if (allNullValues || value == null) {
        if (keyCommentDone && onComment)
          onComment();
        return str === "" ? "?" : explicitKey ? `? ${str}` : str;
      }
    } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
      str = `? ${str}`;
      if (keyComment && !keyCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    if (keyCommentDone)
      keyComment = null;
    if (explicitKey) {
      if (keyComment)
        str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      str = `? ${str}
${indent}:`;
    } else {
      str = `${str}:`;
      if (keyComment)
        str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
    }
    let vsb, vcb, valueComment;
    if (identity.isNode(value)) {
      vsb = !!value.spaceBefore;
      vcb = value.commentBefore;
      valueComment = value.comment;
    } else {
      vsb = false;
      vcb = null;
      valueComment = null;
      if (value && typeof value === "object")
        value = doc.createNode(value);
    }
    ctx.implicitKey = false;
    if (!explicitKey && !keyComment && identity.isScalar(value))
      ctx.indentAtStart = str.length + 1;
    chompKeep = false;
    if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
      ctx.indent = ctx.indent.substring(2);
    }
    let valueCommentDone = false;
    const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
    let ws = " ";
    if (keyComment || vsb || vcb) {
      ws = vsb ? `
` : "";
      if (vcb) {
        const cs = commentString(vcb);
        ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
      }
      if (valueStr === "" && !ctx.inFlow) {
        if (ws === `
` && valueComment)
          ws = `

`;
      } else {
        ws += `
${ctx.indent}`;
      }
    } else if (!explicitKey && identity.isCollection(value)) {
      const vs0 = valueStr[0];
      const nl0 = valueStr.indexOf(`
`);
      const hasNewline = nl0 !== -1;
      const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
      if (hasNewline || !flow) {
        let hasPropsLine = false;
        if (hasNewline && (vs0 === "&" || vs0 === "!")) {
          let sp0 = valueStr.indexOf(" ");
          if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
            sp0 = valueStr.indexOf(" ", sp0 + 1);
          }
          if (sp0 === -1 || nl0 < sp0)
            hasPropsLine = true;
        }
        if (!hasPropsLine)
          ws = `
${ctx.indent}`;
      }
    } else if (valueStr === "" || valueStr[0] === `
`) {
      ws = "";
    }
    str += ws + valueStr;
    if (ctx.inFlow) {
      if (valueCommentDone && onComment)
        onComment();
    } else if (valueComment && !valueCommentDone) {
      str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
    } else if (chompKeep && onChompKeep) {
      onChompKeep();
    }
    return str;
  }
  exports2.stringifyPair = stringifyPair;
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS((exports2) => {
  var node_process = require("process");
  function debug(logLevel, ...messages) {
    if (logLevel === "debug")
      console.log(...messages);
  }
  function warn(logLevel, warning) {
    if (logLevel === "debug" || logLevel === "warn") {
      if (typeof node_process.emitWarning === "function")
        node_process.emitWarning(warning);
      else
        console.warn(warning);
    }
  }
  exports2.debug = debug;
  exports2.warn = warn;
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS((exports2) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var MERGE_KEY = "<<";
  var merge = {
    identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
    default: "key",
    tag: "tag:yaml.org,2002:merge",
    test: /^<<$/,
    resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
      addToJSMap: addMergeToJSMap
    }),
    stringify: () => MERGE_KEY
  };
  var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
  function addMergeToJSMap(ctx, map, value) {
    const source = resolveAliasValue(ctx, value);
    if (identity.isSeq(source))
      for (const it of source.items)
        mergeValue(ctx, map, it);
    else if (Array.isArray(source))
      for (const it of source)
        mergeValue(ctx, map, it);
    else
      mergeValue(ctx, map, source);
  }
  function mergeValue(ctx, map, value) {
    const source = resolveAliasValue(ctx, value);
    if (!identity.isMap(source))
      throw new Error("Merge sources must be maps or map aliases");
    const srcMap = source.toJSON(null, ctx, Map);
    for (const [key, value2] of srcMap) {
      if (map instanceof Map) {
        if (!map.has(key))
          map.set(key, value2);
      } else if (map instanceof Set) {
        map.add(key);
      } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
        Object.defineProperty(map, key, {
          value: value2,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }
    return map;
  }
  function resolveAliasValue(ctx, value) {
    return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
  }
  exports2.addMergeToJSMap = addMergeToJSMap;
  exports2.isMergeKey = isMergeKey;
  exports2.merge = merge;
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS((exports2) => {
  var log = require_log();
  var merge = require_merge();
  var stringify = require_stringify();
  var identity = require_identity();
  var toJS = require_toJS();
  function addPairToJSMap(ctx, map, { key, value }) {
    if (identity.isNode(key) && key.addToJSMap)
      key.addToJSMap(ctx, map, value);
    else if (merge.isMergeKey(ctx, key))
      merge.addMergeToJSMap(ctx, map, value);
    else {
      const jsKey = toJS.toJS(key, "", ctx);
      if (map instanceof Map) {
        map.set(jsKey, toJS.toJS(value, jsKey, ctx));
      } else if (map instanceof Set) {
        map.add(jsKey);
      } else {
        const stringKey = stringifyKey(key, jsKey, ctx);
        const jsValue = toJS.toJS(value, stringKey, ctx);
        if (stringKey in map)
          Object.defineProperty(map, stringKey, {
            value: jsValue,
            writable: true,
            enumerable: true,
            configurable: true
          });
        else
          map[stringKey] = jsValue;
      }
    }
    return map;
  }
  function stringifyKey(key, jsKey, ctx) {
    if (jsKey === null)
      return "";
    if (typeof jsKey !== "object")
      return String(jsKey);
    if (identity.isNode(key) && ctx?.doc) {
      const strCtx = stringify.createStringifyContext(ctx.doc, {});
      strCtx.anchors = new Set;
      for (const node of ctx.anchors.keys())
        strCtx.anchors.add(node.anchor);
      strCtx.inFlow = true;
      strCtx.inStringifyKey = true;
      const strKey = key.toString(strCtx);
      if (!ctx.mapKeyWarned) {
        let jsonStr = JSON.stringify(strKey);
        if (jsonStr.length > 40)
          jsonStr = jsonStr.substring(0, 36) + '..."';
        log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
        ctx.mapKeyWarned = true;
      }
      return strKey;
    }
    return JSON.stringify(jsKey);
  }
  exports2.addPairToJSMap = addPairToJSMap;
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS((exports2) => {
  var createNode = require_createNode();
  var stringifyPair = require_stringifyPair();
  var addPairToJSMap = require_addPairToJSMap();
  var identity = require_identity();
  function createPair(key, value, ctx) {
    const k = createNode.createNode(key, undefined, ctx);
    const v = createNode.createNode(value, undefined, ctx);
    return new Pair(k, v);
  }

  class Pair {
    constructor(key, value = null) {
      Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
      this.key = key;
      this.value = value;
    }
    clone(schema) {
      let { key, value } = this;
      if (identity.isNode(key))
        key = key.clone(schema);
      if (identity.isNode(value))
        value = value.clone(schema);
      return new Pair(key, value);
    }
    toJSON(_, ctx) {
      const pair = ctx?.mapAsMap ? new Map : {};
      return addPairToJSMap.addPairToJSMap(ctx, pair, this);
    }
    toString(ctx, onComment, onChompKeep) {
      return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
    }
  }
  exports2.Pair = Pair;
  exports2.createPair = createPair;
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS((exports2) => {
  var identity = require_identity();
  var stringify = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyCollection(collection, ctx, options) {
    const flow = ctx.inFlow ?? collection.flow;
    const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
    return stringify2(collection, ctx, options);
  }
  function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
    const { indent, options: { commentString } } = ctx;
    const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
    let chompKeep = false;
    const lines = [];
    for (let i = 0;i < items.length; ++i) {
      const item = items[i];
      let comment2 = null;
      if (identity.isNode(item)) {
        if (!chompKeep && item.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
        if (item.comment)
          comment2 = item.comment;
      } else if (identity.isPair(item)) {
        const ik = identity.isNode(item.key) ? item.key : null;
        if (ik) {
          if (!chompKeep && ik.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
        }
      }
      chompKeep = false;
      let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
      if (comment2)
        str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
      if (chompKeep && comment2)
        chompKeep = false;
      lines.push(blockItemPrefix + str2);
    }
    let str;
    if (lines.length === 0) {
      str = flowChars.start + flowChars.end;
    } else {
      str = lines[0];
      for (let i = 1;i < lines.length; ++i) {
        const line = lines[i];
        str += line ? `
${indent}${line}` : `
`;
      }
    }
    if (comment) {
      str += `
` + stringifyComment.indentComment(commentString(comment), indent);
      if (onComment)
        onComment();
    } else if (chompKeep && onChompKeep)
      onChompKeep();
    return str;
  }
  function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
    const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
    itemIndent += indentStep;
    const itemCtx = Object.assign({}, ctx, {
      indent: itemIndent,
      inFlow: true,
      type: null
    });
    let reqNewline = false;
    let linesAtValue = 0;
    const lines = [];
    for (let i = 0;i < items.length; ++i) {
      const item = items[i];
      let comment = null;
      if (identity.isNode(item)) {
        if (item.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, item.commentBefore, false);
        if (item.comment)
          comment = item.comment;
      } else if (identity.isPair(item)) {
        const ik = identity.isNode(item.key) ? item.key : null;
        if (ik) {
          if (ik.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, ik.commentBefore, false);
          if (ik.comment)
            reqNewline = true;
        }
        const iv = identity.isNode(item.value) ? item.value : null;
        if (iv) {
          if (iv.comment)
            comment = iv.comment;
          if (iv.commentBefore)
            reqNewline = true;
        } else if (item.value == null && ik?.comment) {
          comment = ik.comment;
        }
      }
      if (comment)
        reqNewline = true;
      let str = stringify.stringify(item, itemCtx, () => comment = null);
      reqNewline || (reqNewline = lines.length > linesAtValue || str.includes(`
`));
      if (i < items.length - 1) {
        str += ",";
      } else if (ctx.options.trailingComma) {
        if (ctx.options.lineWidth > 0) {
          reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
        }
        if (reqNewline) {
          str += ",";
        }
      }
      if (comment)
        str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
      lines.push(str);
      linesAtValue = lines.length;
    }
    const { start, end } = flowChars;
    if (lines.length === 0) {
      return start + end;
    } else {
      if (!reqNewline) {
        const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
        reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
      }
      if (reqNewline) {
        let str = start;
        for (const line of lines)
          str += line ? `
${indentStep}${indent}${line}` : `
`;
        return `${str}
${indent}${end}`;
      } else {
        return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
      }
    }
  }
  function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
    if (comment && chompKeep)
      comment = comment.replace(/^\n+/, "");
    if (comment) {
      const ic = stringifyComment.indentComment(commentString(comment), indent);
      lines.push(ic.trimStart());
    }
  }
  exports2.stringifyCollection = stringifyCollection;
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS((exports2) => {
  var stringifyCollection = require_stringifyCollection();
  var addPairToJSMap = require_addPairToJSMap();
  var Collection = require_Collection();
  var identity = require_identity();
  var Pair = require_Pair();
  var Scalar = require_Scalar();
  function findPair(items, key) {
    const k = identity.isScalar(key) ? key.value : key;
    for (const it of items) {
      if (identity.isPair(it)) {
        if (it.key === key || it.key === k)
          return it;
        if (identity.isScalar(it.key) && it.key.value === k)
          return it;
      }
    }
    return;
  }

  class YAMLMap extends Collection.Collection {
    static get tagName() {
      return "tag:yaml.org,2002:map";
    }
    constructor(schema) {
      super(identity.MAP, schema);
      this.items = [];
    }
    static from(schema, obj, ctx) {
      const { keepUndefined, replacer } = ctx;
      const map = new this(schema);
      const add = (key, value) => {
        if (typeof replacer === "function")
          value = replacer.call(obj, key, value);
        else if (Array.isArray(replacer) && !replacer.includes(key))
          return;
        if (value !== undefined || keepUndefined)
          map.items.push(Pair.createPair(key, value, ctx));
      };
      if (obj instanceof Map) {
        for (const [key, value] of obj)
          add(key, value);
      } else if (obj && typeof obj === "object") {
        for (const key of Object.keys(obj))
          add(key, obj[key]);
      }
      if (typeof schema.sortMapEntries === "function") {
        map.items.sort(schema.sortMapEntries);
      }
      return map;
    }
    add(pair, overwrite) {
      let _pair;
      if (identity.isPair(pair))
        _pair = pair;
      else if (!pair || typeof pair !== "object" || !("key" in pair)) {
        _pair = new Pair.Pair(pair, pair?.value);
      } else
        _pair = new Pair.Pair(pair.key, pair.value);
      const prev = findPair(this.items, _pair.key);
      const sortEntries = this.schema?.sortMapEntries;
      if (prev) {
        if (!overwrite)
          throw new Error(`Key ${_pair.key} already set`);
        if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
          prev.value.value = _pair.value;
        else
          prev.value = _pair.value;
      } else if (sortEntries) {
        const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
        if (i === -1)
          this.items.push(_pair);
        else
          this.items.splice(i, 0, _pair);
      } else {
        this.items.push(_pair);
      }
    }
    delete(key) {
      const it = findPair(this.items, key);
      if (!it)
        return false;
      const del = this.items.splice(this.items.indexOf(it), 1);
      return del.length > 0;
    }
    get(key, keepScalar) {
      const it = findPair(this.items, key);
      const node = it?.value;
      return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? undefined;
    }
    has(key) {
      return !!findPair(this.items, key);
    }
    set(key, value) {
      this.add(new Pair.Pair(key, value), true);
    }
    toJSON(_, ctx, Type) {
      const map = Type ? new Type : ctx?.mapAsMap ? new Map : {};
      if (ctx?.onCreate)
        ctx.onCreate(map);
      for (const item of this.items)
        addPairToJSMap.addPairToJSMap(ctx, map, item);
      return map;
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      for (const item of this.items) {
        if (!identity.isPair(item))
          throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
      }
      if (!ctx.allNullValues && this.hasAllNullValues(false))
        ctx = Object.assign({}, ctx, { allNullValues: true });
      return stringifyCollection.stringifyCollection(this, ctx, {
        blockItemPrefix: "",
        flowChars: { start: "{", end: "}" },
        itemIndent: ctx.indent || "",
        onChompKeep,
        onComment
      });
    }
  }
  exports2.YAMLMap = YAMLMap;
  exports2.findPair = findPair;
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS((exports2) => {
  var identity = require_identity();
  var YAMLMap = require_YAMLMap();
  var map = {
    collection: "map",
    default: true,
    nodeClass: YAMLMap.YAMLMap,
    tag: "tag:yaml.org,2002:map",
    resolve(map2, onError) {
      if (!identity.isMap(map2))
        onError("Expected a mapping for this tag");
      return map2;
    },
    createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
  };
  exports2.map = map;
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS((exports2) => {
  var createNode = require_createNode();
  var stringifyCollection = require_stringifyCollection();
  var Collection = require_Collection();
  var identity = require_identity();
  var Scalar = require_Scalar();
  var toJS = require_toJS();

  class YAMLSeq extends Collection.Collection {
    static get tagName() {
      return "tag:yaml.org,2002:seq";
    }
    constructor(schema) {
      super(identity.SEQ, schema);
      this.items = [];
    }
    add(value) {
      this.items.push(value);
    }
    delete(key) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        return false;
      const del = this.items.splice(idx, 1);
      return del.length > 0;
    }
    get(key, keepScalar) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        return;
      const it = this.items[idx];
      return !keepScalar && identity.isScalar(it) ? it.value : it;
    }
    has(key) {
      const idx = asItemIndex(key);
      return typeof idx === "number" && idx < this.items.length;
    }
    set(key, value) {
      const idx = asItemIndex(key);
      if (typeof idx !== "number")
        throw new Error(`Expected a valid index, not ${key}.`);
      const prev = this.items[idx];
      if (identity.isScalar(prev) && Scalar.isScalarValue(value))
        prev.value = value;
      else
        this.items[idx] = value;
    }
    toJSON(_, ctx) {
      const seq = [];
      if (ctx?.onCreate)
        ctx.onCreate(seq);
      let i = 0;
      for (const item of this.items)
        seq.push(toJS.toJS(item, String(i++), ctx));
      return seq;
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      return stringifyCollection.stringifyCollection(this, ctx, {
        blockItemPrefix: "- ",
        flowChars: { start: "[", end: "]" },
        itemIndent: (ctx.indent || "") + "  ",
        onChompKeep,
        onComment
      });
    }
    static from(schema, obj, ctx) {
      const { replacer } = ctx;
      const seq = new this(schema);
      if (obj && Symbol.iterator in Object(obj)) {
        let i = 0;
        for (let it of obj) {
          if (typeof replacer === "function") {
            const key = obj instanceof Set ? it : String(i++);
            it = replacer.call(obj, key, it);
          }
          seq.items.push(createNode.createNode(it, undefined, ctx));
        }
      }
      return seq;
    }
  }
  function asItemIndex(key) {
    let idx = identity.isScalar(key) ? key.value : key;
    if (idx && typeof idx === "string")
      idx = Number(idx);
    return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
  }
  exports2.YAMLSeq = YAMLSeq;
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS((exports2) => {
  var identity = require_identity();
  var YAMLSeq = require_YAMLSeq();
  var seq = {
    collection: "seq",
    default: true,
    nodeClass: YAMLSeq.YAMLSeq,
    tag: "tag:yaml.org,2002:seq",
    resolve(seq2, onError) {
      if (!identity.isSeq(seq2))
        onError("Expected a sequence for this tag");
      return seq2;
    },
    createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
  };
  exports2.seq = seq;
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS((exports2) => {
  var stringifyString = require_stringifyString();
  var string = {
    identify: (value) => typeof value === "string",
    default: true,
    tag: "tag:yaml.org,2002:str",
    resolve: (str) => str,
    stringify(item, ctx, onComment, onChompKeep) {
      ctx = Object.assign({ actualString: true }, ctx);
      return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
    }
  };
  exports2.string = string;
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  var nullTag = {
    identify: (value) => value == null,
    createNode: () => new Scalar.Scalar(null),
    default: true,
    tag: "tag:yaml.org,2002:null",
    test: /^(?:~|[Nn]ull|NULL)?$/,
    resolve: () => new Scalar.Scalar(null),
    stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
  };
  exports2.nullTag = nullTag;
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  var boolTag = {
    identify: (value) => typeof value === "boolean",
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
    resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
    stringify({ source, value }, ctx) {
      if (source && boolTag.test.test(source)) {
        const sv = source[0] === "t" || source[0] === "T";
        if (value === sv)
          return source;
      }
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
  };
  exports2.boolTag = boolTag;
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS((exports2) => {
  function stringifyNumber({ format, minFractionDigits, tag, value }) {
    if (typeof value === "bigint")
      return String(value);
    const num = typeof value === "number" ? value : Number(value);
    if (!isFinite(num))
      return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
    let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
    if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
      let i = n.indexOf(".");
      if (i < 0) {
        i = n.length;
        n += ".";
      }
      let d = minFractionDigits - (n.length - i - 1);
      while (d-- > 0)
        n += "0";
    }
    return n;
  }
  exports2.stringifyNumber = stringifyNumber;
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  var stringifyNumber = require_stringifyNumber();
  var floatNaN = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
  };
  var floatExp = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "EXP",
    test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
    resolve: (str) => parseFloat(str),
    stringify(node) {
      const num = Number(node.value);
      return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
  };
  var float = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
    resolve(str) {
      const node = new Scalar.Scalar(parseFloat(str));
      const dot = str.indexOf(".");
      if (dot !== -1 && str[str.length - 1] === "0")
        node.minFractionDigits = str.length - dot - 1;
      return node;
    },
    stringify: stringifyNumber.stringifyNumber
  };
  exports2.float = float;
  exports2.floatExp = floatExp;
  exports2.floatNaN = floatNaN;
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS((exports2) => {
  var stringifyNumber = require_stringifyNumber();
  var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
  var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
  function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value) && value >= 0)
      return prefix + value.toString(radix);
    return stringifyNumber.stringifyNumber(node);
  }
  var intOct = {
    identify: (value) => intIdentify(value) && value >= 0,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "OCT",
    test: /^0o[0-7]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
    stringify: (node) => intStringify(node, 8, "0o")
  };
  var int = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^[-+]?[0-9]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
  };
  var intHex = {
    identify: (value) => intIdentify(value) && value >= 0,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "HEX",
    test: /^0x[0-9a-fA-F]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: (node) => intStringify(node, 16, "0x")
  };
  exports2.int = int;
  exports2.intHex = intHex;
  exports2.intOct = intOct;
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS((exports2) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var bool = require_bool();
  var float = require_float();
  var int = require_int();
  var schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.boolTag,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float
  ];
  exports2.schema = schema;
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  var map = require_map();
  var seq = require_seq();
  function intIdentify(value) {
    return typeof value === "bigint" || Number.isInteger(value);
  }
  var stringifyJSON = ({ value }) => JSON.stringify(value);
  var jsonScalars = [
    {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify: stringifyJSON
    },
    {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^null$/,
      resolve: () => null,
      stringify: stringifyJSON
    },
    {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^true$|^false$/,
      resolve: (str) => str === "true",
      stringify: stringifyJSON
    },
    {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^-?(?:0|[1-9][0-9]*)$/,
      resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
      stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
    },
    {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
      resolve: (str) => parseFloat(str),
      stringify: stringifyJSON
    }
  ];
  var jsonError = {
    default: true,
    tag: "",
    test: /^/,
    resolve(str, onError) {
      onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
      return str;
    }
  };
  var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
  exports2.schema = schema;
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS((exports2) => {
  var node_buffer = require("buffer");
  var Scalar = require_Scalar();
  var stringifyString = require_stringifyString();
  var binary = {
    identify: (value) => value instanceof Uint8Array,
    default: false,
    tag: "tag:yaml.org,2002:binary",
    resolve(src, onError) {
      if (typeof node_buffer.Buffer === "function") {
        return node_buffer.Buffer.from(src, "base64");
      } else if (typeof atob === "function") {
        const str = atob(src.replace(/[\n\r]/g, ""));
        const buffer = new Uint8Array(str.length);
        for (let i = 0;i < str.length; ++i)
          buffer[i] = str.charCodeAt(i);
        return buffer;
      } else {
        onError("This environment does not support reading binary tags; either Buffer or atob is required");
        return src;
      }
    },
    stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
      if (!value)
        return "";
      const buf = value;
      let str;
      if (typeof node_buffer.Buffer === "function") {
        str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
      } else if (typeof btoa === "function") {
        let s = "";
        for (let i = 0;i < buf.length; ++i)
          s += String.fromCharCode(buf[i]);
        str = btoa(s);
      } else {
        throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
      }
      type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
        const n = Math.ceil(str.length / lineWidth);
        const lines = new Array(n);
        for (let i = 0, o = 0;i < n; ++i, o += lineWidth) {
          lines[i] = str.substr(o, lineWidth);
        }
        str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? `
` : " ");
      }
      return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
    }
  };
  exports2.binary = binary;
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS((exports2) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var Scalar = require_Scalar();
  var YAMLSeq = require_YAMLSeq();
  function resolvePairs(seq, onError) {
    if (identity.isSeq(seq)) {
      for (let i = 0;i < seq.items.length; ++i) {
        let item = seq.items[i];
        if (identity.isPair(item))
          continue;
        else if (identity.isMap(item)) {
          if (item.items.length > 1)
            onError("Each pair must have its own sequence indicator");
          const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
          if (item.commentBefore)
            pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
          if (item.comment) {
            const cn = pair.value ?? pair.key;
            cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
          }
          item = pair;
        }
        seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
      }
    } else
      onError("Expected a sequence for this tag");
    return seq;
  }
  function createPairs(schema, iterable, ctx) {
    const { replacer } = ctx;
    const pairs2 = new YAMLSeq.YAMLSeq(schema);
    pairs2.tag = "tag:yaml.org,2002:pairs";
    let i = 0;
    if (iterable && Symbol.iterator in Object(iterable))
      for (let it of iterable) {
        if (typeof replacer === "function")
          it = replacer.call(iterable, String(i++), it);
        let key, value;
        if (Array.isArray(it)) {
          if (it.length === 2) {
            key = it[0];
            value = it[1];
          } else
            throw new TypeError(`Expected [key, value] tuple: ${it}`);
        } else if (it && it instanceof Object) {
          const keys = Object.keys(it);
          if (keys.length === 1) {
            key = keys[0];
            value = it[key];
          } else {
            throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
          }
        } else {
          key = it;
        }
        pairs2.items.push(Pair.createPair(key, value, ctx));
      }
    return pairs2;
  }
  var pairs = {
    collection: "seq",
    default: false,
    tag: "tag:yaml.org,2002:pairs",
    resolve: resolvePairs,
    createNode: createPairs
  };
  exports2.createPairs = createPairs;
  exports2.pairs = pairs;
  exports2.resolvePairs = resolvePairs;
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS((exports2) => {
  var identity = require_identity();
  var toJS = require_toJS();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var pairs = require_pairs();

  class YAMLOMap extends YAMLSeq.YAMLSeq {
    constructor() {
      super();
      this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
      this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
      this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
      this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
      this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
      this.tag = YAMLOMap.tag;
    }
    toJSON(_, ctx) {
      if (!ctx)
        return super.toJSON(_);
      const map = new Map;
      if (ctx?.onCreate)
        ctx.onCreate(map);
      for (const pair of this.items) {
        let key, value;
        if (identity.isPair(pair)) {
          key = toJS.toJS(pair.key, "", ctx);
          value = toJS.toJS(pair.value, key, ctx);
        } else {
          key = toJS.toJS(pair, "", ctx);
        }
        if (map.has(key))
          throw new Error("Ordered maps must not include duplicate keys");
        map.set(key, value);
      }
      return map;
    }
    static from(schema, iterable, ctx) {
      const pairs$1 = pairs.createPairs(schema, iterable, ctx);
      const omap2 = new this;
      omap2.items = pairs$1.items;
      return omap2;
    }
  }
  YAMLOMap.tag = "tag:yaml.org,2002:omap";
  var omap = {
    collection: "seq",
    identify: (value) => value instanceof Map,
    nodeClass: YAMLOMap,
    default: false,
    tag: "tag:yaml.org,2002:omap",
    resolve(seq, onError) {
      const pairs$1 = pairs.resolvePairs(seq, onError);
      const seenKeys = [];
      for (const { key } of pairs$1.items) {
        if (identity.isScalar(key)) {
          if (seenKeys.includes(key.value)) {
            onError(`Ordered maps must not include duplicate keys: ${key.value}`);
          } else {
            seenKeys.push(key.value);
          }
        }
      }
      return Object.assign(new YAMLOMap, pairs$1);
    },
    createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
  };
  exports2.YAMLOMap = YAMLOMap;
  exports2.omap = omap;
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  function boolStringify({ value, source }, ctx) {
    const boolObj = value ? trueTag : falseTag;
    if (source && boolObj.test.test(source))
      return source;
    return value ? ctx.options.trueStr : ctx.options.falseStr;
  }
  var trueTag = {
    identify: (value) => value === true,
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
    resolve: () => new Scalar.Scalar(true),
    stringify: boolStringify
  };
  var falseTag = {
    identify: (value) => value === false,
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
    resolve: () => new Scalar.Scalar(false),
    stringify: boolStringify
  };
  exports2.falseTag = falseTag;
  exports2.trueTag = trueTag;
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  var stringifyNumber = require_stringifyNumber();
  var floatNaN = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
  };
  var floatExp = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "EXP",
    test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
    resolve: (str) => parseFloat(str.replace(/_/g, "")),
    stringify(node) {
      const num = Number(node.value);
      return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
  };
  var float = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
    resolve(str) {
      const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
      const dot = str.indexOf(".");
      if (dot !== -1) {
        const f = str.substring(dot + 1).replace(/_/g, "");
        if (f[f.length - 1] === "0")
          node.minFractionDigits = f.length;
      }
      return node;
    },
    stringify: stringifyNumber.stringifyNumber
  };
  exports2.float = float;
  exports2.floatExp = floatExp;
  exports2.floatNaN = floatNaN;
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS((exports2) => {
  var stringifyNumber = require_stringifyNumber();
  var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
  function intResolve(str, offset, radix, { intAsBigInt }) {
    const sign = str[0];
    if (sign === "-" || sign === "+")
      offset += 1;
    str = str.substring(offset).replace(/_/g, "");
    if (intAsBigInt) {
      switch (radix) {
        case 2:
          str = `0b${str}`;
          break;
        case 8:
          str = `0o${str}`;
          break;
        case 16:
          str = `0x${str}`;
          break;
      }
      const n2 = BigInt(str);
      return sign === "-" ? BigInt(-1) * n2 : n2;
    }
    const n = parseInt(str, radix);
    return sign === "-" ? -1 * n : n;
  }
  function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value)) {
      const str = value.toString(radix);
      return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
    }
    return stringifyNumber.stringifyNumber(node);
  }
  var intBin = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "BIN",
    test: /^[-+]?0b[0-1_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
    stringify: (node) => intStringify(node, 2, "0b")
  };
  var intOct = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "OCT",
    test: /^[-+]?0[0-7_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
    stringify: (node) => intStringify(node, 8, "0")
  };
  var int = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^[-+]?[0-9][0-9_]*$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
  };
  var intHex = {
    identify: intIdentify,
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "HEX",
    test: /^[-+]?0x[0-9a-fA-F_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: (node) => intStringify(node, 16, "0x")
  };
  exports2.int = int;
  exports2.intBin = intBin;
  exports2.intHex = intHex;
  exports2.intOct = intOct;
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS((exports2) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();

  class YAMLSet extends YAMLMap.YAMLMap {
    constructor(schema) {
      super(schema);
      this.tag = YAMLSet.tag;
    }
    add(key) {
      let pair;
      if (identity.isPair(key))
        pair = key;
      else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
        pair = new Pair.Pair(key.key, null);
      else
        pair = new Pair.Pair(key, null);
      const prev = YAMLMap.findPair(this.items, pair.key);
      if (!prev)
        this.items.push(pair);
    }
    get(key, keepPair) {
      const pair = YAMLMap.findPair(this.items, key);
      return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
    }
    set(key, value) {
      if (typeof value !== "boolean")
        throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
      const prev = YAMLMap.findPair(this.items, key);
      if (prev && !value) {
        this.items.splice(this.items.indexOf(prev), 1);
      } else if (!prev && value) {
        this.items.push(new Pair.Pair(key));
      }
    }
    toJSON(_, ctx) {
      return super.toJSON(_, ctx, Set);
    }
    toString(ctx, onComment, onChompKeep) {
      if (!ctx)
        return JSON.stringify(this);
      if (this.hasAllNullValues(true))
        return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
      else
        throw new Error("Set items must all have null values");
    }
    static from(schema, iterable, ctx) {
      const { replacer } = ctx;
      const set2 = new this(schema);
      if (iterable && Symbol.iterator in Object(iterable))
        for (let value of iterable) {
          if (typeof replacer === "function")
            value = replacer.call(iterable, value, value);
          set2.items.push(Pair.createPair(value, null, ctx));
        }
      return set2;
    }
  }
  YAMLSet.tag = "tag:yaml.org,2002:set";
  var set = {
    collection: "map",
    identify: (value) => value instanceof Set,
    nodeClass: YAMLSet,
    default: false,
    tag: "tag:yaml.org,2002:set",
    createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
    resolve(map, onError) {
      if (identity.isMap(map)) {
        if (map.hasAllNullValues(true))
          return Object.assign(new YAMLSet, map);
        else
          onError("Set items must all have null values");
      } else
        onError("Expected a mapping for this tag");
      return map;
    }
  };
  exports2.YAMLSet = YAMLSet;
  exports2.set = set;
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS((exports2) => {
  var stringifyNumber = require_stringifyNumber();
  function parseSexagesimal(str, asBigInt) {
    const sign = str[0];
    const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
    const num = (n) => asBigInt ? BigInt(n) : Number(n);
    const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
    return sign === "-" ? num(-1) * res : res;
  }
  function stringifySexagesimal(node) {
    let { value } = node;
    let num = (n) => n;
    if (typeof value === "bigint")
      num = (n) => BigInt(n);
    else if (isNaN(value) || !isFinite(value))
      return stringifyNumber.stringifyNumber(node);
    let sign = "";
    if (value < 0) {
      sign = "-";
      value *= num(-1);
    }
    const _60 = num(60);
    const parts = [value % _60];
    if (value < 60) {
      parts.unshift(0);
    } else {
      value = (value - parts[0]) / _60;
      parts.unshift(value % _60);
      if (value >= 60) {
        value = (value - parts[0]) / _60;
        parts.unshift(value);
      }
    }
    return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
  }
  var intTime = {
    identify: (value) => typeof value === "bigint" || Number.isInteger(value),
    default: true,
    tag: "tag:yaml.org,2002:int",
    format: "TIME",
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
    resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
    stringify: stringifySexagesimal
  };
  var floatTime = {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    format: "TIME",
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
    resolve: (str) => parseSexagesimal(str, false),
    stringify: stringifySexagesimal
  };
  var timestamp = {
    identify: (value) => value instanceof Date,
    default: true,
    tag: "tag:yaml.org,2002:timestamp",
    test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})" + "(?:" + "(?:t|T|[ \\t]+)" + "([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)" + "(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?" + ")?$"),
    resolve(str) {
      const match = str.match(timestamp.test);
      if (!match)
        throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
      const [, year, month, day, hour, minute, second] = match.map(Number);
      const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
      let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
      const tz = match[8];
      if (tz && tz !== "Z") {
        let d = parseSexagesimal(tz, false);
        if (Math.abs(d) < 30)
          d *= 60;
        date -= 60000 * d;
      }
      return new Date(date);
    },
    stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
  };
  exports2.floatTime = floatTime;
  exports2.intTime = intTime;
  exports2.timestamp = timestamp;
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS((exports2) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var binary = require_binary();
  var bool = require_bool2();
  var float = require_float2();
  var int = require_int2();
  var merge = require_merge();
  var omap = require_omap();
  var pairs = require_pairs();
  var set = require_set();
  var timestamp = require_timestamp();
  var schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.trueTag,
    bool.falseTag,
    int.intBin,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float,
    binary.binary,
    merge.merge,
    omap.omap,
    pairs.pairs,
    set.set,
    timestamp.intTime,
    timestamp.floatTime,
    timestamp.timestamp
  ];
  exports2.schema = schema;
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS((exports2) => {
  var map = require_map();
  var _null = require_null();
  var seq = require_seq();
  var string = require_string();
  var bool = require_bool();
  var float = require_float();
  var int = require_int();
  var schema = require_schema();
  var schema$1 = require_schema2();
  var binary = require_binary();
  var merge = require_merge();
  var omap = require_omap();
  var pairs = require_pairs();
  var schema$2 = require_schema3();
  var set = require_set();
  var timestamp = require_timestamp();
  var schemas = new Map([
    ["core", schema.schema],
    ["failsafe", [map.map, seq.seq, string.string]],
    ["json", schema$1.schema],
    ["yaml11", schema$2.schema],
    ["yaml-1.1", schema$2.schema]
  ]);
  var tagsByName = {
    binary: binary.binary,
    bool: bool.boolTag,
    float: float.float,
    floatExp: float.floatExp,
    floatNaN: float.floatNaN,
    floatTime: timestamp.floatTime,
    int: int.int,
    intHex: int.intHex,
    intOct: int.intOct,
    intTime: timestamp.intTime,
    map: map.map,
    merge: merge.merge,
    null: _null.nullTag,
    omap: omap.omap,
    pairs: pairs.pairs,
    seq: seq.seq,
    set: set.set,
    timestamp: timestamp.timestamp
  };
  var coreKnownTags = {
    "tag:yaml.org,2002:binary": binary.binary,
    "tag:yaml.org,2002:merge": merge.merge,
    "tag:yaml.org,2002:omap": omap.omap,
    "tag:yaml.org,2002:pairs": pairs.pairs,
    "tag:yaml.org,2002:set": set.set,
    "tag:yaml.org,2002:timestamp": timestamp.timestamp
  };
  function getTags(customTags, schemaName, addMergeTag) {
    const schemaTags = schemas.get(schemaName);
    if (schemaTags && !customTags) {
      return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
    }
    let tags = schemaTags;
    if (!tags) {
      if (Array.isArray(customTags))
        tags = [];
      else {
        const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
        throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
      }
    }
    if (Array.isArray(customTags)) {
      for (const tag of customTags)
        tags = tags.concat(tag);
    } else if (typeof customTags === "function") {
      tags = customTags(tags.slice());
    }
    if (addMergeTag)
      tags = tags.concat(merge.merge);
    return tags.reduce((tags2, tag) => {
      const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
      if (!tagObj) {
        const tagName = JSON.stringify(tag);
        const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
        throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
      }
      if (!tags2.includes(tagObj))
        tags2.push(tagObj);
      return tags2;
    }, []);
  }
  exports2.coreKnownTags = coreKnownTags;
  exports2.getTags = getTags;
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS((exports2) => {
  var identity = require_identity();
  var map = require_map();
  var seq = require_seq();
  var string = require_string();
  var tags = require_tags();
  var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

  class Schema {
    constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
      this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
      this.name = typeof schema === "string" && schema || "core";
      this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
      this.tags = tags.getTags(customTags, this.name, merge);
      this.toStringOptions = toStringDefaults ?? null;
      Object.defineProperty(this, identity.MAP, { value: map.map });
      Object.defineProperty(this, identity.SCALAR, { value: string.string });
      Object.defineProperty(this, identity.SEQ, { value: seq.seq });
      this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
    }
    clone() {
      const copy = Object.create(Schema.prototype, Object.getOwnPropertyDescriptors(this));
      copy.tags = this.tags.slice();
      return copy;
    }
  }
  exports2.Schema = Schema;
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS((exports2) => {
  var identity = require_identity();
  var stringify = require_stringify();
  var stringifyComment = require_stringifyComment();
  function stringifyDocument(doc, options) {
    const lines = [];
    let hasDirectives = options.directives === true;
    if (options.directives !== false && doc.directives) {
      const dir = doc.directives.toString(doc);
      if (dir) {
        lines.push(dir);
        hasDirectives = true;
      } else if (doc.directives.docStart)
        hasDirectives = true;
    }
    if (hasDirectives)
      lines.push("---");
    const ctx = stringify.createStringifyContext(doc, options);
    const { commentString } = ctx.options;
    if (doc.commentBefore) {
      if (lines.length !== 1)
        lines.unshift("");
      const cs = commentString(doc.commentBefore);
      lines.unshift(stringifyComment.indentComment(cs, ""));
    }
    let chompKeep = false;
    let contentComment = null;
    if (doc.contents) {
      if (identity.isNode(doc.contents)) {
        if (doc.contents.spaceBefore && hasDirectives)
          lines.push("");
        if (doc.contents.commentBefore) {
          const cs = commentString(doc.contents.commentBefore);
          lines.push(stringifyComment.indentComment(cs, ""));
        }
        ctx.forceBlockIndent = !!doc.comment;
        contentComment = doc.contents.comment;
      }
      const onChompKeep = contentComment ? undefined : () => chompKeep = true;
      let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
      if (contentComment)
        body += stringifyComment.lineComment(body, "", commentString(contentComment));
      if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
        lines[lines.length - 1] = `--- ${body}`;
      } else
        lines.push(body);
    } else {
      lines.push(stringify.stringify(doc.contents, ctx));
    }
    if (doc.directives?.docEnd) {
      if (doc.comment) {
        const cs = commentString(doc.comment);
        if (cs.includes(`
`)) {
          lines.push("...");
          lines.push(stringifyComment.indentComment(cs, ""));
        } else {
          lines.push(`... ${cs}`);
        }
      } else {
        lines.push("...");
      }
    } else {
      let dc = doc.comment;
      if (dc && chompKeep)
        dc = dc.replace(/^\n+/, "");
      if (dc) {
        if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
          lines.push("");
        lines.push(stringifyComment.indentComment(commentString(dc), ""));
      }
    }
    return lines.join(`
`) + `
`;
  }
  exports2.stringifyDocument = stringifyDocument;
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS((exports2) => {
  var Alias = require_Alias();
  var Collection = require_Collection();
  var identity = require_identity();
  var Pair = require_Pair();
  var toJS = require_toJS();
  var Schema = require_Schema();
  var stringifyDocument = require_stringifyDocument();
  var anchors = require_anchors();
  var applyReviver = require_applyReviver();
  var createNode = require_createNode();
  var directives = require_directives();

  class Document {
    constructor(value, replacer, options) {
      this.commentBefore = null;
      this.comment = null;
      this.errors = [];
      this.warnings = [];
      Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === undefined && replacer) {
        options = replacer;
        replacer = undefined;
      }
      const opt = Object.assign({
        intAsBigInt: false,
        keepSourceTokens: false,
        logLevel: "warn",
        prettyErrors: true,
        strict: true,
        stringKeys: false,
        uniqueKeys: true,
        version: "1.2"
      }, options);
      this.options = opt;
      let { version } = opt;
      if (options?._directives) {
        this.directives = options._directives.atDocument();
        if (this.directives.yaml.explicit)
          version = this.directives.yaml.version;
      } else
        this.directives = new directives.Directives({ version });
      this.setSchema(version, options);
      this.contents = value === undefined ? null : this.createNode(value, _replacer, options);
    }
    clone() {
      const copy = Object.create(Document.prototype, {
        [identity.NODE_TYPE]: { value: identity.DOC }
      });
      copy.commentBefore = this.commentBefore;
      copy.comment = this.comment;
      copy.errors = this.errors.slice();
      copy.warnings = this.warnings.slice();
      copy.options = Object.assign({}, this.options);
      if (this.directives)
        copy.directives = this.directives.clone();
      copy.schema = this.schema.clone();
      copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
      if (this.range)
        copy.range = this.range.slice();
      return copy;
    }
    add(value) {
      if (assertCollection(this.contents))
        this.contents.add(value);
    }
    addIn(path, value) {
      if (assertCollection(this.contents))
        this.contents.addIn(path, value);
    }
    createAlias(node, name) {
      if (!node.anchor) {
        const prev = anchors.anchorNames(this);
        node.anchor = !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
      }
      return new Alias.Alias(node.anchor);
    }
    createNode(value, replacer, options) {
      let _replacer = undefined;
      if (typeof replacer === "function") {
        value = replacer.call({ "": value }, "", value);
        _replacer = replacer;
      } else if (Array.isArray(replacer)) {
        const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
        const asStr = replacer.filter(keyToStr).map(String);
        if (asStr.length > 0)
          replacer = replacer.concat(asStr);
        _replacer = replacer;
      } else if (options === undefined && replacer) {
        options = replacer;
        replacer = undefined;
      }
      const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
      const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(this, anchorPrefix || "a");
      const ctx = {
        aliasDuplicateObjects: aliasDuplicateObjects ?? true,
        keepUndefined: keepUndefined ?? false,
        onAnchor,
        onTagObj,
        replacer: _replacer,
        schema: this.schema,
        sourceObjects
      };
      const node = createNode.createNode(value, tag, ctx);
      if (flow && identity.isCollection(node))
        node.flow = true;
      setAnchors();
      return node;
    }
    createPair(key, value, options = {}) {
      const k = this.createNode(key, null, options);
      const v = this.createNode(value, null, options);
      return new Pair.Pair(k, v);
    }
    delete(key) {
      return assertCollection(this.contents) ? this.contents.delete(key) : false;
    }
    deleteIn(path) {
      if (Collection.isEmptyPath(path)) {
        if (this.contents == null)
          return false;
        this.contents = null;
        return true;
      }
      return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
    }
    get(key, keepScalar) {
      return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : undefined;
    }
    getIn(path, keepScalar) {
      if (Collection.isEmptyPath(path))
        return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
      return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : undefined;
    }
    has(key) {
      return identity.isCollection(this.contents) ? this.contents.has(key) : false;
    }
    hasIn(path) {
      if (Collection.isEmptyPath(path))
        return this.contents !== undefined;
      return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
    }
    set(key, value) {
      if (this.contents == null) {
        this.contents = Collection.collectionFromPath(this.schema, [key], value);
      } else if (assertCollection(this.contents)) {
        this.contents.set(key, value);
      }
    }
    setIn(path, value) {
      if (Collection.isEmptyPath(path)) {
        this.contents = value;
      } else if (this.contents == null) {
        this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
      } else if (assertCollection(this.contents)) {
        this.contents.setIn(path, value);
      }
    }
    setSchema(version, options = {}) {
      if (typeof version === "number")
        version = String(version);
      let opt;
      switch (version) {
        case "1.1":
          if (this.directives)
            this.directives.yaml.version = "1.1";
          else
            this.directives = new directives.Directives({ version: "1.1" });
          opt = { resolveKnownTags: false, schema: "yaml-1.1" };
          break;
        case "1.2":
        case "next":
          if (this.directives)
            this.directives.yaml.version = version;
          else
            this.directives = new directives.Directives({ version });
          opt = { resolveKnownTags: true, schema: "core" };
          break;
        case null:
          if (this.directives)
            delete this.directives;
          opt = null;
          break;
        default: {
          const sv = JSON.stringify(version);
          throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
        }
      }
      if (options.schema instanceof Object)
        this.schema = options.schema;
      else if (opt)
        this.schema = new Schema.Schema(Object.assign(opt, options));
      else
        throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
    }
    toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
      const ctx = {
        anchors: new Map,
        doc: this,
        keep: !json,
        mapAsMap: mapAsMap === true,
        mapKeyWarned: false,
        maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
      };
      const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
      if (typeof onAnchor === "function")
        for (const { count, res: res2 } of ctx.anchors.values())
          onAnchor(res2, count);
      return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
    }
    toJSON(jsonArg, onAnchor) {
      return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
    }
    toString(options = {}) {
      if (this.errors.length > 0)
        throw new Error("Document with errors cannot be stringified");
      if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
        const s = JSON.stringify(options.indent);
        throw new Error(`"indent" option must be a positive integer, not ${s}`);
      }
      return stringifyDocument.stringifyDocument(this, options);
    }
  }
  function assertCollection(contents) {
    if (identity.isCollection(contents))
      return true;
    throw new Error("Expected a YAML collection as document contents");
  }
  exports2.Document = Document;
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS((exports2) => {
  class YAMLError extends Error {
    constructor(name, pos, code, message) {
      super();
      this.name = name;
      this.code = code;
      this.message = message;
      this.pos = pos;
    }
  }

  class YAMLParseError extends YAMLError {
    constructor(pos, code, message) {
      super("YAMLParseError", pos, code, message);
    }
  }

  class YAMLWarning extends YAMLError {
    constructor(pos, code, message) {
      super("YAMLWarning", pos, code, message);
    }
  }
  var prettifyError = (src, lc) => (error) => {
    if (error.pos[0] === -1)
      return;
    error.linePos = error.pos.map((pos) => lc.linePos(pos));
    const { line, col } = error.linePos[0];
    error.message += ` at line ${line}, column ${col}`;
    let ci = col - 1;
    let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
    if (ci >= 60 && lineStr.length > 80) {
      const trimStart = Math.min(ci - 39, lineStr.length - 79);
      lineStr = "…" + lineStr.substring(trimStart);
      ci -= trimStart - 1;
    }
    if (lineStr.length > 80)
      lineStr = lineStr.substring(0, 79) + "…";
    if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
      let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
      if (prev.length > 80)
        prev = prev.substring(0, 79) + `…
`;
      lineStr = prev + lineStr;
    }
    if (/[^ ]/.test(lineStr)) {
      let count = 1;
      const end = error.linePos[1];
      if (end?.line === line && end.col > col) {
        count = Math.max(1, Math.min(end.col - col, 80 - ci));
      }
      const pointer = " ".repeat(ci) + "^".repeat(count);
      error.message += `:

${lineStr}
${pointer}
`;
    }
  };
  exports2.YAMLError = YAMLError;
  exports2.YAMLParseError = YAMLParseError;
  exports2.YAMLWarning = YAMLWarning;
  exports2.prettifyError = prettifyError;
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS((exports2) => {
  function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
    let spaceBefore = false;
    let atNewline = startOnNewline;
    let hasSpace = startOnNewline;
    let comment = "";
    let commentSep = "";
    let hasNewline = false;
    let reqSpace = false;
    let tab = null;
    let anchor = null;
    let tag = null;
    let newlineAfterProp = null;
    let comma = null;
    let found = null;
    let start = null;
    for (const token of tokens) {
      if (reqSpace) {
        if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
          onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
        reqSpace = false;
      }
      if (tab) {
        if (atNewline && token.type !== "comment" && token.type !== "newline") {
          onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
        }
        tab = null;
      }
      switch (token.type) {
        case "space":
          if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("\t")) {
            tab = token;
          }
          hasSpace = true;
          break;
        case "comment": {
          if (!hasSpace)
            onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
          const cb = token.source.substring(1) || " ";
          if (!comment)
            comment = cb;
          else
            comment += commentSep + cb;
          commentSep = "";
          atNewline = false;
          break;
        }
        case "newline":
          if (atNewline) {
            if (comment)
              comment += token.source;
            else if (!found || indicator !== "seq-item-ind")
              spaceBefore = true;
          } else
            commentSep += token.source;
          atNewline = true;
          hasNewline = true;
          if (anchor || tag)
            newlineAfterProp = token;
          hasSpace = true;
          break;
        case "anchor":
          if (anchor)
            onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
          if (token.source.endsWith(":"))
            onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
          anchor = token;
          start ?? (start = token.offset);
          atNewline = false;
          hasSpace = false;
          reqSpace = true;
          break;
        case "tag": {
          if (tag)
            onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
          tag = token;
          start ?? (start = token.offset);
          atNewline = false;
          hasSpace = false;
          reqSpace = true;
          break;
        }
        case indicator:
          if (anchor || tag)
            onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
          if (found)
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
          found = token;
          atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
          hasSpace = false;
          break;
        case "comma":
          if (flow) {
            if (comma)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
            comma = token;
            atNewline = false;
            hasSpace = false;
            break;
          }
        default:
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
          atNewline = false;
          hasSpace = false;
      }
    }
    const last = tokens[tokens.length - 1];
    const end = last ? last.offset + last.source.length : offset;
    if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
      onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
    }
    if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
      onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
    return {
      comma,
      found,
      spaceBefore,
      comment,
      hasNewline,
      anchor,
      tag,
      newlineAfterProp,
      end,
      start: start ?? end
    };
  }
  exports2.resolveProps = resolveProps;
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS((exports2) => {
  function containsNewline(key) {
    if (!key)
      return null;
    switch (key.type) {
      case "alias":
      case "scalar":
      case "double-quoted-scalar":
      case "single-quoted-scalar":
        if (key.source.includes(`
`))
          return true;
        if (key.end) {
          for (const st of key.end)
            if (st.type === "newline")
              return true;
        }
        return false;
      case "flow-collection":
        for (const it of key.items) {
          for (const st of it.start)
            if (st.type === "newline")
              return true;
          if (it.sep) {
            for (const st of it.sep)
              if (st.type === "newline")
                return true;
          }
          if (containsNewline(it.key) || containsNewline(it.value))
            return true;
        }
        return false;
      default:
        return true;
    }
  }
  exports2.containsNewline = containsNewline;
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS((exports2) => {
  var utilContainsNewline = require_util_contains_newline();
  function flowIndentCheck(indent, fc, onError) {
    if (fc?.type === "flow-collection") {
      const end = fc.end[0];
      if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
        const msg = "Flow end indicator should be more indented than parent";
        onError(end, "BAD_INDENT", msg, true);
      }
    }
  }
  exports2.flowIndentCheck = flowIndentCheck;
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS((exports2) => {
  var identity = require_identity();
  function mapIncludes(ctx, items, search) {
    const { uniqueKeys } = ctx.options;
    if (uniqueKeys === false)
      return false;
    const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
    return items.some((pair) => isEqual(pair.key, search));
  }
  exports2.mapIncludes = mapIncludes;
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS((exports2) => {
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();
  var resolveProps = require_resolve_props();
  var utilContainsNewline = require_util_contains_newline();
  var utilFlowIndentCheck = require_util_flow_indent_check();
  var utilMapIncludes = require_util_map_includes();
  var startColMsg = "All mapping items must start at the same column";
  function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
    const map = new NodeClass(ctx.schema);
    if (ctx.atRoot)
      ctx.atRoot = false;
    let offset = bm.offset;
    let commentEnd = null;
    for (const collItem of bm.items) {
      const { start, key, sep, value } = collItem;
      const keyProps = resolveProps.resolveProps(start, {
        indicator: "explicit-key-ind",
        next: key ?? sep?.[0],
        offset,
        onError,
        parentIndent: bm.indent,
        startOnNewline: true
      });
      const implicitKey = !keyProps.found;
      if (implicitKey) {
        if (key) {
          if (key.type === "block-seq")
            onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
          else if ("indent" in key && key.indent !== bm.indent)
            onError(offset, "BAD_INDENT", startColMsg);
        }
        if (!keyProps.anchor && !keyProps.tag && !sep) {
          commentEnd = keyProps.end;
          if (keyProps.comment) {
            if (map.comment)
              map.comment += `
` + keyProps.comment;
            else
              map.comment = keyProps.comment;
          }
          continue;
        }
        if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
          onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
        }
      } else if (keyProps.found?.indent !== bm.indent) {
        onError(offset, "BAD_INDENT", startColMsg);
      }
      ctx.atKey = true;
      const keyStart = keyProps.end;
      const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
      if (ctx.schema.compat)
        utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
      ctx.atKey = false;
      if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
        onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
      const valueProps = resolveProps.resolveProps(sep ?? [], {
        indicator: "map-value-ind",
        next: value,
        offset: keyNode.range[2],
        onError,
        parentIndent: bm.indent,
        startOnNewline: !key || key.type === "block-scalar"
      });
      offset = valueProps.end;
      if (valueProps.found) {
        if (implicitKey) {
          if (value?.type === "block-map" && !valueProps.hasNewline)
            onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
          if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
            onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
        }
        const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
        offset = valueNode.range[2];
        const pair = new Pair.Pair(keyNode, valueNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        map.items.push(pair);
      } else {
        if (implicitKey)
          onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
        if (valueProps.comment) {
          if (keyNode.comment)
            keyNode.comment += `
` + valueProps.comment;
          else
            keyNode.comment = valueProps.comment;
        }
        const pair = new Pair.Pair(keyNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        map.items.push(pair);
      }
    }
    if (commentEnd && commentEnd < offset)
      onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
    map.range = [bm.offset, offset, commentEnd ?? offset];
    return map;
  }
  exports2.resolveBlockMap = resolveBlockMap;
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS((exports2) => {
  var YAMLSeq = require_YAMLSeq();
  var resolveProps = require_resolve_props();
  var utilFlowIndentCheck = require_util_flow_indent_check();
  function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
    const seq = new NodeClass(ctx.schema);
    if (ctx.atRoot)
      ctx.atRoot = false;
    if (ctx.atKey)
      ctx.atKey = false;
    let offset = bs.offset;
    let commentEnd = null;
    for (const { start, value } of bs.items) {
      const props = resolveProps.resolveProps(start, {
        indicator: "seq-item-ind",
        next: value,
        offset,
        onError,
        parentIndent: bs.indent,
        startOnNewline: true
      });
      if (!props.found) {
        if (props.anchor || props.tag || value) {
          if (value?.type === "block-seq")
            onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
          else
            onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
        } else {
          commentEnd = props.end;
          if (props.comment)
            seq.comment = props.comment;
          continue;
        }
      }
      const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
      if (ctx.schema.compat)
        utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
      offset = node.range[2];
      seq.items.push(node);
    }
    seq.range = [bs.offset, offset, commentEnd ?? offset];
    return seq;
  }
  exports2.resolveBlockSeq = resolveBlockSeq;
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS((exports2) => {
  function resolveEnd(end, offset, reqSpace, onError) {
    let comment = "";
    if (end) {
      let hasSpace = false;
      let sep = "";
      for (const token of end) {
        const { source, type } = token;
        switch (type) {
          case "space":
            hasSpace = true;
            break;
          case "comment": {
            if (reqSpace && !hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += sep + cb;
            sep = "";
            break;
          }
          case "newline":
            if (comment)
              sep += source;
            hasSpace = true;
            break;
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
        }
        offset += source.length;
      }
    }
    return { comment, offset };
  }
  exports2.resolveEnd = resolveEnd;
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS((exports2) => {
  var identity = require_identity();
  var Pair = require_Pair();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var resolveEnd = require_resolve_end();
  var resolveProps = require_resolve_props();
  var utilContainsNewline = require_util_contains_newline();
  var utilMapIncludes = require_util_map_includes();
  var blockMsg = "Block collections are not allowed within flow collections";
  var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
  function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
    const isMap = fc.start.source === "{";
    const fcName = isMap ? "flow map" : "flow sequence";
    const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
    const coll = new NodeClass(ctx.schema);
    coll.flow = true;
    const atRoot = ctx.atRoot;
    if (atRoot)
      ctx.atRoot = false;
    if (ctx.atKey)
      ctx.atKey = false;
    let offset = fc.offset + fc.start.source.length;
    for (let i = 0;i < fc.items.length; ++i) {
      const collItem = fc.items[i];
      const { start, key, sep, value } = collItem;
      const props = resolveProps.resolveProps(start, {
        flow: fcName,
        indicator: "explicit-key-ind",
        next: key ?? sep?.[0],
        offset,
        onError,
        parentIndent: fc.indent,
        startOnNewline: false
      });
      if (!props.found) {
        if (!props.anchor && !props.tag && !sep && !value) {
          if (i === 0 && props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
          else if (i < fc.items.length - 1)
            onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
          if (props.comment) {
            if (coll.comment)
              coll.comment += `
` + props.comment;
            else
              coll.comment = props.comment;
          }
          offset = props.end;
          continue;
        }
        if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
          onError(key, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
      }
      if (i === 0) {
        if (props.comma)
          onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
      } else {
        if (!props.comma)
          onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
        if (props.comment) {
          let prevItemComment = "";
          loop:
            for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
          if (prevItemComment) {
            let prev = coll.items[coll.items.length - 1];
            if (identity.isPair(prev))
              prev = prev.value ?? prev.key;
            if (prev.comment)
              prev.comment += `
` + prevItemComment;
            else
              prev.comment = prevItemComment;
            props.comment = props.comment.substring(prevItemComment.length + 1);
          }
        }
      }
      if (!isMap && !sep && !props.found) {
        const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
        coll.items.push(valueNode);
        offset = valueNode.range[2];
        if (isBlock(value))
          onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
      } else {
        ctx.atKey = true;
        const keyStart = props.end;
        const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
        if (isBlock(key))
          onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
        ctx.atKey = false;
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          flow: fcName,
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (valueProps.found) {
          if (!isMap && !props.found && ctx.options.strict) {
            if (sep)
              for (const st of sep) {
                if (st === valueProps.found)
                  break;
                if (st.type === "newline") {
                  onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                  break;
                }
              }
            if (props.start < valueProps.found.offset - 1024)
              onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
          }
        } else if (value) {
          if ("source" in value && value.source?.[0] === ":")
            onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
          else
            onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
        }
        const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
        if (valueNode) {
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else if (valueProps.comment) {
          if (keyNode.comment)
            keyNode.comment += `
` + valueProps.comment;
          else
            keyNode.comment = valueProps.comment;
        }
        const pair = new Pair.Pair(keyNode, valueNode);
        if (ctx.options.keepSourceTokens)
          pair.srcToken = collItem;
        if (isMap) {
          const map = coll;
          if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
            onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
          map.items.push(pair);
        } else {
          const map = new YAMLMap.YAMLMap(ctx.schema);
          map.flow = true;
          map.items.push(pair);
          const endRange = (valueNode ?? keyNode).range;
          map.range = [keyNode.range[0], endRange[1], endRange[2]];
          coll.items.push(map);
        }
        offset = valueNode ? valueNode.range[2] : valueProps.end;
      }
    }
    const expectedEnd = isMap ? "}" : "]";
    const [ce, ...ee] = fc.end;
    let cePos = offset;
    if (ce?.source === expectedEnd)
      cePos = ce.offset + ce.source.length;
    else {
      const name = fcName[0].toUpperCase() + fcName.substring(1);
      const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
      onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
      if (ce && ce.source.length !== 1)
        ee.unshift(ce);
    }
    if (ee.length > 0) {
      const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
      if (end.comment) {
        if (coll.comment)
          coll.comment += `
` + end.comment;
        else
          coll.comment = end.comment;
      }
      coll.range = [fc.offset, cePos, end.offset];
    } else {
      coll.range = [fc.offset, cePos, cePos];
    }
    return coll;
  }
  exports2.resolveFlowCollection = resolveFlowCollection;
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS((exports2) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var resolveBlockMap = require_resolve_block_map();
  var resolveBlockSeq = require_resolve_block_seq();
  var resolveFlowCollection = require_resolve_flow_collection();
  function resolveCollection(CN, ctx, token, onError, tagName, tag) {
    const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
    const Coll = coll.constructor;
    if (tagName === "!" || tagName === Coll.tagName) {
      coll.tag = Coll.tagName;
      return coll;
    }
    if (tagName)
      coll.tag = tagName;
    return coll;
  }
  function composeCollection(CN, ctx, token, props, onError) {
    const tagToken = props.tag;
    const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
    if (token.type === "block-seq") {
      const { anchor, newlineAfterProp: nl } = props;
      const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
      if (lastProp && (!nl || nl.offset < lastProp.offset)) {
        const message = "Missing newline after block sequence props";
        onError(lastProp, "MISSING_CHAR", message);
      }
    }
    const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
    if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
      return resolveCollection(CN, ctx, token, onError, tagName);
    }
    let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
    if (!tag) {
      const kt = ctx.schema.knownTags[tagName];
      if (kt?.collection === expType) {
        ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
        tag = kt;
      } else {
        if (kt) {
          onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
        } else {
          onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
        }
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
    }
    const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
    const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
    const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
    node.range = coll.range;
    node.tag = tagName;
    if (tag?.format)
      node.format = tag.format;
    return node;
  }
  exports2.composeCollection = composeCollection;
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  function resolveBlockScalar(ctx, scalar, onError) {
    const start = scalar.offset;
    const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
    if (!header)
      return { value: "", type: null, comment: "", range: [start, start, start] };
    const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
    const lines = scalar.source ? splitLines(scalar.source) : [];
    let chompStart = lines.length;
    for (let i = lines.length - 1;i >= 0; --i) {
      const content = lines[i][1];
      if (content === "" || content === "\r")
        chompStart = i;
      else
        break;
    }
    if (chompStart === 0) {
      const value2 = header.chomp === "+" && lines.length > 0 ? `
`.repeat(Math.max(1, lines.length - 1)) : "";
      let end2 = start + header.length;
      if (scalar.source)
        end2 += scalar.source.length;
      return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
    }
    let trimIndent = scalar.indent + header.indent;
    let offset = scalar.offset + header.length;
    let contentStart = 0;
    for (let i = 0;i < chompStart; ++i) {
      const [indent, content] = lines[i];
      if (content === "" || content === "\r") {
        if (header.indent === 0 && indent.length > trimIndent)
          trimIndent = indent.length;
      } else {
        if (indent.length < trimIndent) {
          const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
          onError(offset + indent.length, "MISSING_CHAR", message);
        }
        if (header.indent === 0)
          trimIndent = indent.length;
        contentStart = i;
        if (trimIndent === 0 && !ctx.atRoot) {
          const message = "Block scalar values in collections must be indented";
          onError(offset, "BAD_INDENT", message);
        }
        break;
      }
      offset += indent.length + content.length + 1;
    }
    for (let i = lines.length - 1;i >= chompStart; --i) {
      if (lines[i][0].length > trimIndent)
        chompStart = i + 1;
    }
    let value = "";
    let sep = "";
    let prevMoreIndented = false;
    for (let i = 0;i < contentStart; ++i)
      value += lines[i][0].slice(trimIndent) + `
`;
    for (let i = contentStart;i < chompStart; ++i) {
      let [indent, content] = lines[i];
      offset += indent.length + content.length + 1;
      const crlf = content[content.length - 1] === "\r";
      if (crlf)
        content = content.slice(0, -1);
      if (content && indent.length < trimIndent) {
        const src = header.indent ? "explicit indentation indicator" : "first line";
        const message = `Block scalar lines must not be less indented than their ${src}`;
        onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
        indent = "";
      }
      if (type === Scalar.Scalar.BLOCK_LITERAL) {
        value += sep + indent.slice(trimIndent) + content;
        sep = `
`;
      } else if (indent.length > trimIndent || content[0] === "\t") {
        if (sep === " ")
          sep = `
`;
        else if (!prevMoreIndented && sep === `
`)
          sep = `

`;
        value += sep + indent.slice(trimIndent) + content;
        sep = `
`;
        prevMoreIndented = true;
      } else if (content === "") {
        if (sep === `
`)
          value += `
`;
        else
          sep = `
`;
      } else {
        value += sep + content;
        sep = " ";
        prevMoreIndented = false;
      }
    }
    switch (header.chomp) {
      case "-":
        break;
      case "+":
        for (let i = chompStart;i < lines.length; ++i)
          value += `
` + lines[i][0].slice(trimIndent);
        if (value[value.length - 1] !== `
`)
          value += `
`;
        break;
      default:
        value += `
`;
    }
    const end = start + header.length + scalar.source.length;
    return { value, type, comment: header.comment, range: [start, end, end] };
  }
  function parseBlockScalarHeader({ offset, props }, strict, onError) {
    if (props[0].type !== "block-scalar-header") {
      onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
      return null;
    }
    const { source } = props[0];
    const mode = source[0];
    let indent = 0;
    let chomp = "";
    let error = -1;
    for (let i = 1;i < source.length; ++i) {
      const ch = source[i];
      if (!chomp && (ch === "-" || ch === "+"))
        chomp = ch;
      else {
        const n = Number(ch);
        if (!indent && n)
          indent = n;
        else if (error === -1)
          error = offset + i;
      }
    }
    if (error !== -1)
      onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
    let hasSpace = false;
    let comment = "";
    let length = source.length;
    for (let i = 1;i < props.length; ++i) {
      const token = props[i];
      switch (token.type) {
        case "space":
          hasSpace = true;
        case "newline":
          length += token.source.length;
          break;
        case "comment":
          if (strict && !hasSpace) {
            const message = "Comments must be separated from other tokens by white space characters";
            onError(token, "MISSING_CHAR", message);
          }
          length += token.source.length;
          comment = token.source.substring(1);
          break;
        case "error":
          onError(token, "UNEXPECTED_TOKEN", token.message);
          length += token.source.length;
          break;
        default: {
          const message = `Unexpected token in block scalar header: ${token.type}`;
          onError(token, "UNEXPECTED_TOKEN", message);
          const ts = token.source;
          if (ts && typeof ts === "string")
            length += ts.length;
        }
      }
    }
    return { mode, indent, chomp, comment, length };
  }
  function splitLines(source) {
    const split = source.split(/\n( *)/);
    const first = split[0];
    const m = first.match(/^( *)/);
    const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
    const lines = [line0];
    for (let i = 1;i < split.length; i += 2)
      lines.push([split[i], split[i + 1]]);
    return lines;
  }
  exports2.resolveBlockScalar = resolveBlockScalar;
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS((exports2) => {
  var Scalar = require_Scalar();
  var resolveEnd = require_resolve_end();
  function resolveFlowScalar(scalar, strict, onError) {
    const { offset, type, source, end } = scalar;
    let _type;
    let value;
    const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
    switch (type) {
      case "scalar":
        _type = Scalar.Scalar.PLAIN;
        value = plainValue(source, _onError);
        break;
      case "single-quoted-scalar":
        _type = Scalar.Scalar.QUOTE_SINGLE;
        value = singleQuotedValue(source, _onError);
        break;
      case "double-quoted-scalar":
        _type = Scalar.Scalar.QUOTE_DOUBLE;
        value = doubleQuotedValue(source, _onError);
        break;
      default:
        onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
        return {
          value: "",
          type: null,
          comment: "",
          range: [offset, offset + source.length, offset + source.length]
        };
    }
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
    return {
      value,
      type: _type,
      comment: re.comment,
      range: [offset, valueEnd, re.offset]
    };
  }
  function plainValue(source, onError) {
    let badChar = "";
    switch (source[0]) {
      case "\t":
        badChar = "a tab character";
        break;
      case ",":
        badChar = "flow indicator character ,";
        break;
      case "%":
        badChar = "directive indicator character %";
        break;
      case "|":
      case ">": {
        badChar = `block scalar indicator ${source[0]}`;
        break;
      }
      case "@":
      case "`": {
        badChar = `reserved character ${source[0]}`;
        break;
      }
    }
    if (badChar)
      onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
    return foldLines(source);
  }
  function singleQuotedValue(source, onError) {
    if (source[source.length - 1] !== "'" || source.length === 1)
      onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
    return foldLines(source.slice(1, -1)).replace(/''/g, "'");
  }
  function foldLines(source) {
    let first, line;
    try {
      first = new RegExp(`(.*?)(?<![ 	])[ 	]*\r?
`, "sy");
      line = new RegExp(`[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?
`, "sy");
    } catch {
      first = /(.*?)[ \t]*\r?\n/sy;
      line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
    }
    let match = first.exec(source);
    if (!match)
      return source;
    let res = match[1];
    let sep = " ";
    let pos = first.lastIndex;
    line.lastIndex = pos;
    while (match = line.exec(source)) {
      if (match[1] === "") {
        if (sep === `
`)
          res += sep;
        else
          sep = `
`;
      } else {
        res += sep + match[1];
        sep = " ";
      }
      pos = line.lastIndex;
    }
    const last = /[ \t]*(.*)/sy;
    last.lastIndex = pos;
    match = last.exec(source);
    return res + sep + (match?.[1] ?? "");
  }
  function doubleQuotedValue(source, onError) {
    let res = "";
    for (let i = 1;i < source.length - 1; ++i) {
      const ch = source[i];
      if (ch === "\r" && source[i + 1] === `
`)
        continue;
      if (ch === `
`) {
        const { fold, offset } = foldNewline(source, i);
        res += fold;
        i = offset;
      } else if (ch === "\\") {
        let next = source[++i];
        const cc = escapeCodes[next];
        if (cc)
          res += cc;
        else if (next === `
`) {
          next = source[i + 1];
          while (next === " " || next === "\t")
            next = source[++i + 1];
        } else if (next === "\r" && source[i + 1] === `
`) {
          next = source[++i + 1];
          while (next === " " || next === "\t")
            next = source[++i + 1];
        } else if (next === "x" || next === "u" || next === "U") {
          const length = next === "x" ? 2 : next === "u" ? 4 : 8;
          res += parseCharCode(source, i + 1, length, onError);
          i += length;
        } else {
          const raw = source.substr(i - 1, 2);
          onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
          res += raw;
        }
      } else if (ch === " " || ch === "\t") {
        const wsStart = i;
        let next = source[i + 1];
        while (next === " " || next === "\t")
          next = source[++i + 1];
        if (next !== `
` && !(next === "\r" && source[i + 2] === `
`))
          res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
      } else {
        res += ch;
      }
    }
    if (source[source.length - 1] !== '"' || source.length === 1)
      onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
    return res;
  }
  function foldNewline(source, offset) {
    let fold = "";
    let ch = source[offset + 1];
    while (ch === " " || ch === "\t" || ch === `
` || ch === "\r") {
      if (ch === "\r" && source[offset + 2] !== `
`)
        break;
      if (ch === `
`)
        fold += `
`;
      offset += 1;
      ch = source[offset + 1];
    }
    if (!fold)
      fold = " ";
    return { fold, offset };
  }
  var escapeCodes = {
    "0": "\x00",
    a: "\x07",
    b: "\b",
    e: "\x1B",
    f: "\f",
    n: `
`,
    r: "\r",
    t: "\t",
    v: "\v",
    N: "",
    _: " ",
    L: "\u2028",
    P: "\u2029",
    " ": " ",
    '"': '"',
    "/": "/",
    "\\": "\\",
    "\t": "\t"
  };
  function parseCharCode(source, offset, length, onError) {
    const cc = source.substr(offset, length);
    const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
    const code = ok ? parseInt(cc, 16) : NaN;
    try {
      return String.fromCodePoint(code);
    } catch {
      const raw = source.substr(offset - 2, length + 2);
      onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
      return raw;
    }
  }
  exports2.resolveFlowScalar = resolveFlowScalar;
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS((exports2) => {
  var identity = require_identity();
  var Scalar = require_Scalar();
  var resolveBlockScalar = require_resolve_block_scalar();
  var resolveFlowScalar = require_resolve_flow_scalar();
  function composeScalar(ctx, token, tagToken, onError) {
    const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
    const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
    let tag;
    if (ctx.options.stringKeys && ctx.atKey) {
      tag = ctx.schema[identity.SCALAR];
    } else if (tagName)
      tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
    else if (token.type === "scalar")
      tag = findScalarTagByTest(ctx, value, token, onError);
    else
      tag = ctx.schema[identity.SCALAR];
    let scalar;
    try {
      const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
      scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
      scalar = new Scalar.Scalar(value);
    }
    scalar.range = range;
    scalar.source = value;
    if (type)
      scalar.type = type;
    if (tagName)
      scalar.tag = tagName;
    if (tag.format)
      scalar.format = tag.format;
    if (comment)
      scalar.comment = comment;
    return scalar;
  }
  function findScalarTagByName(schema, value, tagName, tagToken, onError) {
    if (tagName === "!")
      return schema[identity.SCALAR];
    const matchWithTest = [];
    for (const tag of schema.tags) {
      if (!tag.collection && tag.tag === tagName) {
        if (tag.default && tag.test)
          matchWithTest.push(tag);
        else
          return tag;
      }
    }
    for (const tag of matchWithTest)
      if (tag.test?.test(value))
        return tag;
    const kt = schema.knownTags[tagName];
    if (kt && !kt.collection) {
      schema.tags.push(Object.assign({}, kt, { default: false, test: undefined }));
      return kt;
    }
    onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
    return schema[identity.SCALAR];
  }
  function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
    const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
    if (schema.compat) {
      const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
      if (tag.tag !== compat.tag) {
        const ts = directives.tagString(tag.tag);
        const cs = directives.tagString(compat.tag);
        const msg = `Value may be parsed as either ${ts} or ${cs}`;
        onError(token, "TAG_RESOLVE_FAILED", msg, true);
      }
    }
    return tag;
  }
  exports2.composeScalar = composeScalar;
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS((exports2) => {
  function emptyScalarPosition(offset, before, pos) {
    if (before) {
      pos ?? (pos = before.length);
      for (let i = pos - 1;i >= 0; --i) {
        let st = before[i];
        switch (st.type) {
          case "space":
          case "comment":
          case "newline":
            offset -= st.source.length;
            continue;
        }
        st = before[++i];
        while (st?.type === "space") {
          offset += st.source.length;
          st = before[++i];
        }
        break;
      }
    }
    return offset;
  }
  exports2.emptyScalarPosition = emptyScalarPosition;
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS((exports2) => {
  var Alias = require_Alias();
  var identity = require_identity();
  var composeCollection = require_compose_collection();
  var composeScalar = require_compose_scalar();
  var resolveEnd = require_resolve_end();
  var utilEmptyScalarPosition = require_util_empty_scalar_position();
  var CN = { composeNode, composeEmptyNode };
  function composeNode(ctx, token, props, onError) {
    const atKey = ctx.atKey;
    const { spaceBefore, comment, anchor, tag } = props;
    let node;
    let isSrcToken = true;
    switch (token.type) {
      case "alias":
        node = composeAlias(ctx, token, onError);
        if (anchor || tag)
          onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
        break;
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
      case "block-scalar":
        node = composeScalar.composeScalar(ctx, token, tag, onError);
        if (anchor)
          node.anchor = anchor.source.substring(1);
        break;
      case "block-map":
      case "block-seq":
      case "flow-collection":
        try {
          node = composeCollection.composeCollection(CN, ctx, token, props, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          onError(token, "RESOURCE_EXHAUSTION", message);
        }
        break;
      default: {
        const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
        onError(token, "UNEXPECTED_TOKEN", message);
        isSrcToken = false;
      }
    }
    node ?? (node = composeEmptyNode(ctx, token.offset, undefined, null, props, onError));
    if (anchor && node.anchor === "")
      onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
    if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
      const msg = "With stringKeys, all keys must be strings";
      onError(tag ?? token, "NON_STRING_KEY", msg);
    }
    if (spaceBefore)
      node.spaceBefore = true;
    if (comment) {
      if (token.type === "scalar" && token.source === "")
        node.comment = comment;
      else
        node.commentBefore = comment;
    }
    if (ctx.options.keepSourceTokens && isSrcToken)
      node.srcToken = token;
    return node;
  }
  function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
    const token = {
      type: "scalar",
      offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
      indent: -1,
      source: ""
    };
    const node = composeScalar.composeScalar(ctx, token, tag, onError);
    if (anchor) {
      node.anchor = anchor.source.substring(1);
      if (node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
    }
    if (spaceBefore)
      node.spaceBefore = true;
    if (comment) {
      node.comment = comment;
      node.range[2] = end;
    }
    return node;
  }
  function composeAlias({ options }, { offset, source, end }, onError) {
    const alias = new Alias.Alias(source.substring(1));
    if (alias.source === "")
      onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
    if (alias.source.endsWith(":"))
      onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
    alias.range = [offset, valueEnd, re.offset];
    if (re.comment)
      alias.comment = re.comment;
    return alias;
  }
  exports2.composeEmptyNode = composeEmptyNode;
  exports2.composeNode = composeNode;
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS((exports2) => {
  var Document = require_Document();
  var composeNode = require_compose_node();
  var resolveEnd = require_resolve_end();
  var resolveProps = require_resolve_props();
  function composeDoc(options, directives, { offset, start, value, end }, onError) {
    const opts = Object.assign({ _directives: directives }, options);
    const doc = new Document.Document(undefined, opts);
    const ctx = {
      atKey: false,
      atRoot: true,
      directives: doc.directives,
      options: doc.options,
      schema: doc.schema
    };
    const props = resolveProps.resolveProps(start, {
      indicator: "doc-start",
      next: value ?? end?.[0],
      offset,
      onError,
      parentIndent: 0,
      startOnNewline: true
    });
    if (props.found) {
      doc.directives.docStart = true;
      if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
        onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
    }
    doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
    const contentEnd = doc.contents.range[2];
    const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
    if (re.comment)
      doc.comment = re.comment;
    doc.range = [offset, contentEnd, re.offset];
    return doc;
  }
  exports2.composeDoc = composeDoc;
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS((exports2) => {
  var node_process = require("process");
  var directives = require_directives();
  var Document = require_Document();
  var errors = require_errors();
  var identity = require_identity();
  var composeDoc = require_compose_doc();
  var resolveEnd = require_resolve_end();
  function getErrorPos(src) {
    if (typeof src === "number")
      return [src, src + 1];
    if (Array.isArray(src))
      return src.length === 2 ? src : [src[0], src[1]];
    const { offset, source } = src;
    return [offset, offset + (typeof source === "string" ? source.length : 1)];
  }
  function parsePrelude(prelude) {
    let comment = "";
    let atComment = false;
    let afterEmptyLine = false;
    for (let i = 0;i < prelude.length; ++i) {
      const source = prelude[i];
      switch (source[0]) {
        case "#":
          comment += (comment === "" ? "" : afterEmptyLine ? `

` : `
`) + (source.substring(1) || " ");
          atComment = true;
          afterEmptyLine = false;
          break;
        case "%":
          if (prelude[i + 1]?.[0] !== "#")
            i += 1;
          atComment = false;
          break;
        default:
          if (!atComment)
            afterEmptyLine = true;
          atComment = false;
      }
    }
    return { comment, afterEmptyLine };
  }

  class Composer {
    constructor(options = {}) {
      this.doc = null;
      this.atDirectives = false;
      this.prelude = [];
      this.errors = [];
      this.warnings = [];
      this.onError = (source, code, message, warning) => {
        const pos = getErrorPos(source);
        if (warning)
          this.warnings.push(new errors.YAMLWarning(pos, code, message));
        else
          this.errors.push(new errors.YAMLParseError(pos, code, message));
      };
      this.directives = new directives.Directives({ version: options.version || "1.2" });
      this.options = options;
    }
    decorate(doc, afterDoc) {
      const { comment, afterEmptyLine } = parsePrelude(this.prelude);
      if (comment) {
        const dc = doc.contents;
        if (afterDoc) {
          doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
        } else if (afterEmptyLine || doc.directives.docStart || !dc) {
          doc.commentBefore = comment;
        } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
          let it = dc.items[0];
          if (identity.isPair(it))
            it = it.key;
          const cb = it.commentBefore;
          it.commentBefore = cb ? `${comment}
${cb}` : comment;
        } else {
          const cb = dc.commentBefore;
          dc.commentBefore = cb ? `${comment}
${cb}` : comment;
        }
      }
      if (afterDoc) {
        for (let i = 0;i < this.errors.length; ++i)
          doc.errors.push(this.errors[i]);
        for (let i = 0;i < this.warnings.length; ++i)
          doc.warnings.push(this.warnings[i]);
      } else {
        doc.errors = this.errors;
        doc.warnings = this.warnings;
      }
      this.prelude = [];
      this.errors = [];
      this.warnings = [];
    }
    streamInfo() {
      return {
        comment: parsePrelude(this.prelude).comment,
        directives: this.directives,
        errors: this.errors,
        warnings: this.warnings
      };
    }
    *compose(tokens, forceDoc = false, endOffset = -1) {
      for (const token of tokens)
        yield* this.next(token);
      yield* this.end(forceDoc, endOffset);
    }
    *next(token) {
      if (node_process.env.LOG_STREAM)
        console.dir(token, { depth: null });
      switch (token.type) {
        case "directive":
          this.directives.add(token.source, (offset, message, warning) => {
            const pos = getErrorPos(token);
            pos[0] += offset;
            this.onError(pos, "BAD_DIRECTIVE", message, warning);
          });
          this.prelude.push(token.source);
          this.atDirectives = true;
          break;
        case "document": {
          const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
          if (this.atDirectives && !doc.directives.docStart)
            this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
          this.decorate(doc, false);
          if (this.doc)
            yield this.doc;
          this.doc = doc;
          this.atDirectives = false;
          break;
        }
        case "byte-order-mark":
        case "space":
          break;
        case "comment":
        case "newline":
          this.prelude.push(token.source);
          break;
        case "error": {
          const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
          const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
          if (this.atDirectives || !this.doc)
            this.errors.push(error);
          else
            this.doc.errors.push(error);
          break;
        }
        case "doc-end": {
          if (!this.doc) {
            const msg = "Unexpected doc-end without preceding document";
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
            break;
          }
          this.doc.directives.docEnd = true;
          const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
          this.decorate(this.doc, true);
          if (end.comment) {
            const dc = this.doc.comment;
            this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
          }
          this.doc.range[2] = end.offset;
          break;
        }
        default:
          this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
      }
    }
    *end(forceDoc = false, endOffset = -1) {
      if (this.doc) {
        this.decorate(this.doc, true);
        yield this.doc;
        this.doc = null;
      } else if (forceDoc) {
        const opts = Object.assign({ _directives: this.directives }, this.options);
        const doc = new Document.Document(undefined, opts);
        if (this.atDirectives)
          this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
        doc.range = [0, endOffset, endOffset];
        this.decorate(doc, false);
        yield doc;
      }
    }
  }
  exports2.Composer = Composer;
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS((exports2) => {
  var resolveBlockScalar = require_resolve_block_scalar();
  var resolveFlowScalar = require_resolve_flow_scalar();
  var errors = require_errors();
  var stringifyString = require_stringifyString();
  function resolveAsScalar(token, strict = true, onError) {
    if (token) {
      const _onError = (pos, code, message) => {
        const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
        if (onError)
          onError(offset, code, message);
        else
          throw new errors.YAMLParseError([offset, offset + 1], code, message);
      };
      switch (token.type) {
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
        case "block-scalar":
          return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
      }
    }
    return null;
  }
  function createScalarToken(value, context) {
    const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
    const source = stringifyString.stringifyString({ type, value }, {
      implicitKey,
      indent: indent > 0 ? " ".repeat(indent) : "",
      inFlow,
      options: { blockQuote: true, lineWidth: -1 }
    });
    const end = context.end ?? [
      { type: "newline", offset: -1, indent, source: `
` }
    ];
    switch (source[0]) {
      case "|":
      case ">": {
        const he = source.indexOf(`
`);
        const head = source.substring(0, he);
        const body = source.substring(he + 1) + `
`;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, end))
          props.push({ type: "newline", offset: -1, indent, source: `
` });
        return { type: "block-scalar", offset, indent, props, source: body };
      }
      case '"':
        return { type: "double-quoted-scalar", offset, indent, source, end };
      case "'":
        return { type: "single-quoted-scalar", offset, indent, source, end };
      default:
        return { type: "scalar", offset, indent, source, end };
    }
  }
  function setScalarValue(token, value, context = {}) {
    let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
    let indent = "indent" in token ? token.indent : null;
    if (afterKey && typeof indent === "number")
      indent += 2;
    if (!type)
      switch (token.type) {
        case "single-quoted-scalar":
          type = "QUOTE_SINGLE";
          break;
        case "double-quoted-scalar":
          type = "QUOTE_DOUBLE";
          break;
        case "block-scalar": {
          const header = token.props[0];
          if (header.type !== "block-scalar-header")
            throw new Error("Invalid block scalar header");
          type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
          break;
        }
        default:
          type = "PLAIN";
      }
    const source = stringifyString.stringifyString({ type, value }, {
      implicitKey: implicitKey || indent === null,
      indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
      inFlow,
      options: { blockQuote: true, lineWidth: -1 }
    });
    switch (source[0]) {
      case "|":
      case ">":
        setBlockScalarValue(token, source);
        break;
      case '"':
        setFlowScalarValue(token, source, "double-quoted-scalar");
        break;
      case "'":
        setFlowScalarValue(token, source, "single-quoted-scalar");
        break;
      default:
        setFlowScalarValue(token, source, "scalar");
    }
  }
  function setBlockScalarValue(token, source) {
    const he = source.indexOf(`
`);
    const head = source.substring(0, he);
    const body = source.substring(he + 1) + `
`;
    if (token.type === "block-scalar") {
      const header = token.props[0];
      if (header.type !== "block-scalar-header")
        throw new Error("Invalid block scalar header");
      header.source = head;
      token.source = body;
    } else {
      const { offset } = token;
      const indent = "indent" in token ? token.indent : -1;
      const props = [
        { type: "block-scalar-header", offset, indent, source: head }
      ];
      if (!addEndtoBlockProps(props, "end" in token ? token.end : undefined))
        props.push({ type: "newline", offset: -1, indent, source: `
` });
      for (const key of Object.keys(token))
        if (key !== "type" && key !== "offset")
          delete token[key];
      Object.assign(token, { type: "block-scalar", indent, props, source: body });
    }
  }
  function addEndtoBlockProps(props, end) {
    if (end)
      for (const st of end)
        switch (st.type) {
          case "space":
          case "comment":
            props.push(st);
            break;
          case "newline":
            props.push(st);
            return true;
        }
    return false;
  }
  function setFlowScalarValue(token, source, type) {
    switch (token.type) {
      case "scalar":
      case "double-quoted-scalar":
      case "single-quoted-scalar":
        token.type = type;
        token.source = source;
        break;
      case "block-scalar": {
        const end = token.props.slice(1);
        let oa = source.length;
        if (token.props[0].type === "block-scalar-header")
          oa -= token.props[0].source.length;
        for (const tok of end)
          tok.offset += oa;
        delete token.props;
        Object.assign(token, { type, source, end });
        break;
      }
      case "block-map":
      case "block-seq": {
        const offset = token.offset + source.length;
        const nl = { type: "newline", offset, indent: token.indent, source: `
` };
        delete token.items;
        Object.assign(token, { type, source, end: [nl] });
        break;
      }
      default: {
        const indent = "indent" in token ? token.indent : -1;
        const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type, indent, source, end });
      }
    }
  }
  exports2.createScalarToken = createScalarToken;
  exports2.resolveAsScalar = resolveAsScalar;
  exports2.setScalarValue = setScalarValue;
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS((exports2) => {
  var stringify = (cst) => ("type" in cst) ? stringifyToken(cst) : stringifyItem(cst);
  function stringifyToken(token) {
    switch (token.type) {
      case "block-scalar": {
        let res = "";
        for (const tok of token.props)
          res += stringifyToken(tok);
        return res + token.source;
      }
      case "block-map":
      case "block-seq": {
        let res = "";
        for (const item of token.items)
          res += stringifyItem(item);
        return res;
      }
      case "flow-collection": {
        let res = token.start.source;
        for (const item of token.items)
          res += stringifyItem(item);
        for (const st of token.end)
          res += st.source;
        return res;
      }
      case "document": {
        let res = stringifyItem(token);
        if (token.end)
          for (const st of token.end)
            res += st.source;
        return res;
      }
      default: {
        let res = token.source;
        if ("end" in token && token.end)
          for (const st of token.end)
            res += st.source;
        return res;
      }
    }
  }
  function stringifyItem({ start, key, sep, value }) {
    let res = "";
    for (const st of start)
      res += st.source;
    if (key)
      res += stringifyToken(key);
    if (sep)
      for (const st of sep)
        res += st.source;
    if (value)
      res += stringifyToken(value);
    return res;
  }
  exports2.stringify = stringify;
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS((exports2) => {
  var BREAK = Symbol("break visit");
  var SKIP = Symbol("skip children");
  var REMOVE = Symbol("remove item");
  function visit(cst, visitor) {
    if ("type" in cst && cst.type === "document")
      cst = { start: cst.start, value: cst.value };
    _visit(Object.freeze([]), cst, visitor);
  }
  visit.BREAK = BREAK;
  visit.SKIP = SKIP;
  visit.REMOVE = REMOVE;
  visit.itemAtPath = (cst, path) => {
    let item = cst;
    for (const [field, index] of path) {
      const tok = item?.[field];
      if (tok && "items" in tok) {
        item = tok.items[index];
      } else
        return;
    }
    return item;
  };
  visit.parentCollection = (cst, path) => {
    const parent = visit.itemAtPath(cst, path.slice(0, -1));
    const field = path[path.length - 1][0];
    const coll = parent?.[field];
    if (coll && "items" in coll)
      return coll;
    throw new Error("Parent collection not found");
  };
  function _visit(path, item, visitor) {
    let ctrl = visitor(item, path);
    if (typeof ctrl === "symbol")
      return ctrl;
    for (const field of ["key", "value"]) {
      const token = item[field];
      if (token && "items" in token) {
        for (let i = 0;i < token.items.length; ++i) {
          const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
          if (typeof ci === "number")
            i = ci - 1;
          else if (ci === BREAK)
            return BREAK;
          else if (ci === REMOVE) {
            token.items.splice(i, 1);
            i -= 1;
          }
        }
        if (typeof ctrl === "function" && field === "key")
          ctrl = ctrl(item, path);
      }
    }
    return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
  }
  exports2.visit = visit;
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS((exports2) => {
  var cstScalar = require_cst_scalar();
  var cstStringify = require_cst_stringify();
  var cstVisit = require_cst_visit();
  var BOM = "\uFEFF";
  var DOCUMENT = "\x02";
  var FLOW_END = "\x18";
  var SCALAR = "\x1F";
  var isCollection = (token) => !!token && ("items" in token);
  var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
  function prettyToken(token) {
    switch (token) {
      case BOM:
        return "<BOM>";
      case DOCUMENT:
        return "<DOC>";
      case FLOW_END:
        return "<FLOW_END>";
      case SCALAR:
        return "<SCALAR>";
      default:
        return JSON.stringify(token);
    }
  }
  function tokenType(source) {
    switch (source) {
      case BOM:
        return "byte-order-mark";
      case DOCUMENT:
        return "doc-mode";
      case FLOW_END:
        return "flow-error-end";
      case SCALAR:
        return "scalar";
      case "---":
        return "doc-start";
      case "...":
        return "doc-end";
      case "":
      case `
`:
      case `\r
`:
        return "newline";
      case "-":
        return "seq-item-ind";
      case "?":
        return "explicit-key-ind";
      case ":":
        return "map-value-ind";
      case "{":
        return "flow-map-start";
      case "}":
        return "flow-map-end";
      case "[":
        return "flow-seq-start";
      case "]":
        return "flow-seq-end";
      case ",":
        return "comma";
    }
    switch (source[0]) {
      case " ":
      case "\t":
        return "space";
      case "#":
        return "comment";
      case "%":
        return "directive-line";
      case "*":
        return "alias";
      case "&":
        return "anchor";
      case "!":
        return "tag";
      case "'":
        return "single-quoted-scalar";
      case '"':
        return "double-quoted-scalar";
      case "|":
      case ">":
        return "block-scalar-header";
    }
    return null;
  }
  exports2.createScalarToken = cstScalar.createScalarToken;
  exports2.resolveAsScalar = cstScalar.resolveAsScalar;
  exports2.setScalarValue = cstScalar.setScalarValue;
  exports2.stringify = cstStringify.stringify;
  exports2.visit = cstVisit.visit;
  exports2.BOM = BOM;
  exports2.DOCUMENT = DOCUMENT;
  exports2.FLOW_END = FLOW_END;
  exports2.SCALAR = SCALAR;
  exports2.isCollection = isCollection;
  exports2.isScalar = isScalar;
  exports2.prettyToken = prettyToken;
  exports2.tokenType = tokenType;
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS((exports2) => {
  var cst = require_cst();
  function isEmpty(ch) {
    switch (ch) {
      case undefined:
      case " ":
      case `
`:
      case "\r":
      case "\t":
        return true;
      default:
        return false;
    }
  }
  var hexDigits = new Set("0123456789ABCDEFabcdef");
  var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
  var flowIndicatorChars = new Set(",[]{}");
  var invalidAnchorChars = new Set(` ,[]{}
\r	`);
  var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);

  class Lexer {
    constructor() {
      this.atEnd = false;
      this.blockScalarIndent = -1;
      this.blockScalarKeep = false;
      this.buffer = "";
      this.flowKey = false;
      this.flowLevel = 0;
      this.indentNext = 0;
      this.indentValue = 0;
      this.lineEndPos = null;
      this.next = null;
      this.pos = 0;
    }
    *lex(source, incomplete = false) {
      if (source) {
        if (typeof source !== "string")
          throw TypeError("source is not a string");
        this.buffer = this.buffer ? this.buffer + source : source;
        this.lineEndPos = null;
      }
      this.atEnd = !incomplete;
      let next = this.next ?? "stream";
      while (next && (incomplete || this.hasChars(1)))
        next = yield* this.parseNext(next);
    }
    atLineEnd() {
      let i = this.pos;
      let ch = this.buffer[i];
      while (ch === " " || ch === "\t")
        ch = this.buffer[++i];
      if (!ch || ch === "#" || ch === `
`)
        return true;
      if (ch === "\r")
        return this.buffer[i + 1] === `
`;
      return false;
    }
    charAt(n) {
      return this.buffer[this.pos + n];
    }
    continueScalar(offset) {
      let ch = this.buffer[offset];
      if (this.indentNext > 0) {
        let indent = 0;
        while (ch === " ")
          ch = this.buffer[++indent + offset];
        if (ch === "\r") {
          const next = this.buffer[indent + offset + 1];
          if (next === `
` || !next && !this.atEnd)
            return offset + indent + 1;
        }
        return ch === `
` || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
      }
      if (ch === "-" || ch === ".") {
        const dt = this.buffer.substr(offset, 3);
        if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
          return -1;
      }
      return offset;
    }
    getLine() {
      let end = this.lineEndPos;
      if (typeof end !== "number" || end !== -1 && end < this.pos) {
        end = this.buffer.indexOf(`
`, this.pos);
        this.lineEndPos = end;
      }
      if (end === -1)
        return this.atEnd ? this.buffer.substring(this.pos) : null;
      if (this.buffer[end - 1] === "\r")
        end -= 1;
      return this.buffer.substring(this.pos, end);
    }
    hasChars(n) {
      return this.pos + n <= this.buffer.length;
    }
    setNext(state) {
      this.buffer = this.buffer.substring(this.pos);
      this.pos = 0;
      this.lineEndPos = null;
      this.next = state;
      return null;
    }
    peek(n) {
      return this.buffer.substr(this.pos, n);
    }
    *parseNext(next) {
      switch (next) {
        case "stream":
          return yield* this.parseStream();
        case "line-start":
          return yield* this.parseLineStart();
        case "block-start":
          return yield* this.parseBlockStart();
        case "doc":
          return yield* this.parseDocument();
        case "flow":
          return yield* this.parseFlowCollection();
        case "quoted-scalar":
          return yield* this.parseQuotedScalar();
        case "block-scalar":
          return yield* this.parseBlockScalar();
        case "plain-scalar":
          return yield* this.parsePlainScalar();
      }
    }
    *parseStream() {
      let line = this.getLine();
      if (line === null)
        return this.setNext("stream");
      if (line[0] === cst.BOM) {
        yield* this.pushCount(1);
        line = line.substring(1);
      }
      if (line[0] === "%") {
        let dirEnd = line.length;
        let cs = line.indexOf("#");
        while (cs !== -1) {
          const ch = line[cs - 1];
          if (ch === " " || ch === "\t") {
            dirEnd = cs - 1;
            break;
          } else {
            cs = line.indexOf("#", cs + 1);
          }
        }
        while (true) {
          const ch = line[dirEnd - 1];
          if (ch === " " || ch === "\t")
            dirEnd -= 1;
          else
            break;
        }
        const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
        yield* this.pushCount(line.length - n);
        this.pushNewline();
        return "stream";
      }
      if (this.atLineEnd()) {
        const sp = yield* this.pushSpaces(true);
        yield* this.pushCount(line.length - sp);
        yield* this.pushNewline();
        return "stream";
      }
      yield cst.DOCUMENT;
      return yield* this.parseLineStart();
    }
    *parseLineStart() {
      const ch = this.charAt(0);
      if (!ch && !this.atEnd)
        return this.setNext("line-start");
      if (ch === "-" || ch === ".") {
        if (!this.atEnd && !this.hasChars(4))
          return this.setNext("line-start");
        const s = this.peek(3);
        if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
          yield* this.pushCount(3);
          this.indentValue = 0;
          this.indentNext = 0;
          return s === "---" ? "doc" : "stream";
        }
      }
      this.indentValue = yield* this.pushSpaces(false);
      if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
        this.indentNext = this.indentValue;
      return yield* this.parseBlockStart();
    }
    *parseBlockStart() {
      const [ch0, ch1] = this.peek(2);
      if (!ch1 && !this.atEnd)
        return this.setNext("block-start");
      if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
        const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
        this.indentNext = this.indentValue + 1;
        this.indentValue += n;
        return "block-start";
      }
      return "doc";
    }
    *parseDocument() {
      yield* this.pushSpaces(true);
      const line = this.getLine();
      if (line === null)
        return this.setNext("doc");
      let n = yield* this.pushIndicators();
      switch (line[n]) {
        case "#":
          yield* this.pushCount(line.length - n);
        case undefined:
          yield* this.pushNewline();
          return yield* this.parseLineStart();
        case "{":
        case "[":
          yield* this.pushCount(1);
          this.flowKey = false;
          this.flowLevel = 1;
          return "flow";
        case "}":
        case "]":
          yield* this.pushCount(1);
          return "doc";
        case "*":
          yield* this.pushUntil(isNotAnchorChar);
          return "doc";
        case '"':
        case "'":
          return yield* this.parseQuotedScalar();
        case "|":
        case ">":
          n += yield* this.parseBlockScalarHeader();
          n += yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - n);
          yield* this.pushNewline();
          return yield* this.parseBlockScalar();
        default:
          return yield* this.parsePlainScalar();
      }
    }
    *parseFlowCollection() {
      let nl, sp;
      let indent = -1;
      do {
        nl = yield* this.pushNewline();
        if (nl > 0) {
          sp = yield* this.pushSpaces(false);
          this.indentValue = indent = sp;
        } else {
          sp = 0;
        }
        sp += yield* this.pushSpaces(true);
      } while (nl + sp > 0);
      const line = this.getLine();
      if (line === null)
        return this.setNext("flow");
      if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
        const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
        if (!atFlowEndMarker) {
          this.flowLevel = 0;
          yield cst.FLOW_END;
          return yield* this.parseLineStart();
        }
      }
      let n = 0;
      while (line[n] === ",") {
        n += yield* this.pushCount(1);
        n += yield* this.pushSpaces(true);
        this.flowKey = false;
      }
      n += yield* this.pushIndicators();
      switch (line[n]) {
        case undefined:
          return "flow";
        case "#":
          yield* this.pushCount(line.length - n);
          return "flow";
        case "{":
        case "[":
          yield* this.pushCount(1);
          this.flowKey = false;
          this.flowLevel += 1;
          return "flow";
        case "}":
        case "]":
          yield* this.pushCount(1);
          this.flowKey = true;
          this.flowLevel -= 1;
          return this.flowLevel ? "flow" : "doc";
        case "*":
          yield* this.pushUntil(isNotAnchorChar);
          return "flow";
        case '"':
        case "'":
          this.flowKey = true;
          return yield* this.parseQuotedScalar();
        case ":": {
          const next = this.charAt(1);
          if (this.flowKey || isEmpty(next) || next === ",") {
            this.flowKey = false;
            yield* this.pushCount(1);
            yield* this.pushSpaces(true);
            return "flow";
          }
        }
        default:
          this.flowKey = false;
          return yield* this.parsePlainScalar();
      }
    }
    *parseQuotedScalar() {
      const quote = this.charAt(0);
      let end = this.buffer.indexOf(quote, this.pos + 1);
      if (quote === "'") {
        while (end !== -1 && this.buffer[end + 1] === "'")
          end = this.buffer.indexOf("'", end + 2);
      } else {
        while (end !== -1) {
          let n = 0;
          while (this.buffer[end - 1 - n] === "\\")
            n += 1;
          if (n % 2 === 0)
            break;
          end = this.buffer.indexOf('"', end + 1);
        }
      }
      const qb = this.buffer.substring(0, end);
      let nl = qb.indexOf(`
`, this.pos);
      if (nl !== -1) {
        while (nl !== -1) {
          const cs = this.continueScalar(nl + 1);
          if (cs === -1)
            break;
          nl = qb.indexOf(`
`, cs);
        }
        if (nl !== -1) {
          end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
        }
      }
      if (end === -1) {
        if (!this.atEnd)
          return this.setNext("quoted-scalar");
        end = this.buffer.length;
      }
      yield* this.pushToIndex(end + 1, false);
      return this.flowLevel ? "flow" : "doc";
    }
    *parseBlockScalarHeader() {
      this.blockScalarIndent = -1;
      this.blockScalarKeep = false;
      let i = this.pos;
      while (true) {
        const ch = this.buffer[++i];
        if (ch === "+")
          this.blockScalarKeep = true;
        else if (ch > "0" && ch <= "9")
          this.blockScalarIndent = Number(ch) - 1;
        else if (ch !== "-")
          break;
      }
      return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
    }
    *parseBlockScalar() {
      let nl = this.pos - 1;
      let indent = 0;
      let ch;
      loop:
        for (let i2 = this.pos;ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case `
`:
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === `
`)
                break;
            }
            default:
              break loop;
          }
        }
      if (!ch && !this.atEnd)
        return this.setNext("block-scalar");
      if (indent >= this.indentNext) {
        if (this.blockScalarIndent === -1)
          this.indentNext = indent;
        else {
          this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
        }
        do {
          const cs = this.continueScalar(nl + 1);
          if (cs === -1)
            break;
          nl = this.buffer.indexOf(`
`, cs);
        } while (nl !== -1);
        if (nl === -1) {
          if (!this.atEnd)
            return this.setNext("block-scalar");
          nl = this.buffer.length;
        }
      }
      let i = nl + 1;
      ch = this.buffer[i];
      while (ch === " ")
        ch = this.buffer[++i];
      if (ch === "\t") {
        while (ch === "\t" || ch === " " || ch === "\r" || ch === `
`)
          ch = this.buffer[++i];
        nl = i - 1;
      } else if (!this.blockScalarKeep) {
        do {
          let i2 = nl - 1;
          let ch2 = this.buffer[i2];
          if (ch2 === "\r")
            ch2 = this.buffer[--i2];
          const lastChar = i2;
          while (ch2 === " ")
            ch2 = this.buffer[--i2];
          if (ch2 === `
` && i2 >= this.pos && i2 + 1 + indent > lastChar)
            nl = i2;
          else
            break;
        } while (true);
      }
      yield cst.SCALAR;
      yield* this.pushToIndex(nl + 1, true);
      return yield* this.parseLineStart();
    }
    *parsePlainScalar() {
      const inFlow = this.flowLevel > 0;
      let end = this.pos - 1;
      let i = this.pos - 1;
      let ch;
      while (ch = this.buffer[++i]) {
        if (ch === ":") {
          const next = this.buffer[i + 1];
          if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
            break;
          end = i;
        } else if (isEmpty(ch)) {
          let next = this.buffer[i + 1];
          if (ch === "\r") {
            if (next === `
`) {
              i += 1;
              ch = `
`;
              next = this.buffer[i + 1];
            } else
              end = i;
          }
          if (next === "#" || inFlow && flowIndicatorChars.has(next))
            break;
          if (ch === `
`) {
            const cs = this.continueScalar(i + 1);
            if (cs === -1)
              break;
            i = Math.max(i, cs - 2);
          }
        } else {
          if (inFlow && flowIndicatorChars.has(ch))
            break;
          end = i;
        }
      }
      if (!ch && !this.atEnd)
        return this.setNext("plain-scalar");
      yield cst.SCALAR;
      yield* this.pushToIndex(end + 1, true);
      return inFlow ? "flow" : "doc";
    }
    *pushCount(n) {
      if (n > 0) {
        yield this.buffer.substr(this.pos, n);
        this.pos += n;
        return n;
      }
      return 0;
    }
    *pushToIndex(i, allowEmpty) {
      const s = this.buffer.slice(this.pos, i);
      if (s) {
        yield s;
        this.pos += s.length;
        return s.length;
      } else if (allowEmpty)
        yield "";
      return 0;
    }
    *pushIndicators() {
      let n = 0;
      loop:
        while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            case "?":
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
      return n;
    }
    *pushTag() {
      if (this.charAt(1) === "<") {
        let i = this.pos + 2;
        let ch = this.buffer[i];
        while (!isEmpty(ch) && ch !== ">")
          ch = this.buffer[++i];
        return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
      } else {
        let i = this.pos + 1;
        let ch = this.buffer[i];
        while (ch) {
          if (tagChars.has(ch))
            ch = this.buffer[++i];
          else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
            ch = this.buffer[i += 3];
          } else
            break;
        }
        return yield* this.pushToIndex(i, false);
      }
    }
    *pushNewline() {
      const ch = this.buffer[this.pos];
      if (ch === `
`)
        return yield* this.pushCount(1);
      else if (ch === "\r" && this.charAt(1) === `
`)
        return yield* this.pushCount(2);
      else
        return 0;
    }
    *pushSpaces(allowTabs) {
      let i = this.pos - 1;
      let ch;
      do {
        ch = this.buffer[++i];
      } while (ch === " " || allowTabs && ch === "\t");
      const n = i - this.pos;
      if (n > 0) {
        yield this.buffer.substr(this.pos, n);
        this.pos = i;
      }
      return n;
    }
    *pushUntil(test) {
      let i = this.pos;
      let ch = this.buffer[i];
      while (!test(ch))
        ch = this.buffer[++i];
      return yield* this.pushToIndex(i, false);
    }
  }
  exports2.Lexer = Lexer;
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS((exports2) => {
  class LineCounter {
    constructor() {
      this.lineStarts = [];
      this.addNewLine = (offset) => this.lineStarts.push(offset);
      this.linePos = (offset) => {
        let low = 0;
        let high = this.lineStarts.length;
        while (low < high) {
          const mid = low + high >> 1;
          if (this.lineStarts[mid] < offset)
            low = mid + 1;
          else
            high = mid;
        }
        if (this.lineStarts[low] === offset)
          return { line: low + 1, col: 1 };
        if (low === 0)
          return { line: 0, col: offset };
        const start = this.lineStarts[low - 1];
        return { line: low, col: offset - start + 1 };
      };
    }
  }
  exports2.LineCounter = LineCounter;
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS((exports2) => {
  var node_process = require("process");
  var cst = require_cst();
  var lexer = require_lexer();
  function includesToken(list, type) {
    for (let i = 0;i < list.length; ++i)
      if (list[i].type === type)
        return true;
    return false;
  }
  function findNonEmptyIndex(list) {
    for (let i = 0;i < list.length; ++i) {
      switch (list[i].type) {
        case "space":
        case "comment":
        case "newline":
          break;
        default:
          return i;
      }
    }
    return -1;
  }
  function isFlowToken(token) {
    switch (token?.type) {
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
      case "flow-collection":
        return true;
      default:
        return false;
    }
  }
  function getPrevProps(parent) {
    switch (parent.type) {
      case "document":
        return parent.start;
      case "block-map": {
        const it = parent.items[parent.items.length - 1];
        return it.sep ?? it.start;
      }
      case "block-seq":
        return parent.items[parent.items.length - 1].start;
      default:
        return [];
    }
  }
  function getFirstKeyStartProps(prev) {
    if (prev.length === 0)
      return [];
    let i = prev.length;
    loop:
      while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
    while (prev[++i]?.type === "space") {}
    return prev.splice(i, prev.length);
  }
  function arrayPushArray(target, source) {
    if (source.length < 1e5)
      Array.prototype.push.apply(target, source);
    else
      for (let i = 0;i < source.length; ++i)
        target.push(source[i]);
  }
  function fixFlowSeqItems(fc) {
    if (fc.start.type === "flow-seq-start") {
      for (const it of fc.items) {
        if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
          if (it.key)
            it.value = it.key;
          delete it.key;
          if (isFlowToken(it.value)) {
            if (it.value.end)
              arrayPushArray(it.value.end, it.sep);
            else
              it.value.end = it.sep;
          } else
            arrayPushArray(it.start, it.sep);
          delete it.sep;
        }
      }
    }
  }

  class Parser {
    constructor(onNewLine) {
      this.atNewLine = true;
      this.atScalar = false;
      this.indent = 0;
      this.offset = 0;
      this.onKeyLine = false;
      this.stack = [];
      this.source = "";
      this.type = "";
      this.lexer = new lexer.Lexer;
      this.onNewLine = onNewLine;
    }
    *parse(source, incomplete = false) {
      if (this.onNewLine && this.offset === 0)
        this.onNewLine(0);
      for (const lexeme of this.lexer.lex(source, incomplete))
        yield* this.next(lexeme);
      if (!incomplete)
        yield* this.end();
    }
    *next(source) {
      this.source = source;
      if (node_process.env.LOG_TOKENS)
        console.log("|", cst.prettyToken(source));
      if (this.atScalar) {
        this.atScalar = false;
        yield* this.step();
        this.offset += source.length;
        return;
      }
      const type = cst.tokenType(source);
      if (!type) {
        const message = `Not a YAML token: ${source}`;
        yield* this.pop({ type: "error", offset: this.offset, message, source });
        this.offset += source.length;
      } else if (type === "scalar") {
        this.atNewLine = false;
        this.atScalar = true;
        this.type = "scalar";
      } else {
        this.type = type;
        yield* this.step();
        switch (type) {
          case "newline":
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine)
              this.onNewLine(this.offset + source.length);
            break;
          case "space":
            if (this.atNewLine && source[0] === " ")
              this.indent += source.length;
            break;
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
            if (this.atNewLine)
              this.indent += source.length;
            break;
          case "doc-mode":
          case "flow-error-end":
            return;
          default:
            this.atNewLine = false;
        }
        this.offset += source.length;
      }
    }
    *end() {
      while (this.stack.length > 0)
        yield* this.pop();
    }
    get sourceToken() {
      const st = {
        type: this.type,
        offset: this.offset,
        indent: this.indent,
        source: this.source
      };
      return st;
    }
    *step() {
      const top = this.peek(1);
      if (this.type === "doc-end" && top?.type !== "doc-end") {
        while (this.stack.length > 0)
          yield* this.pop();
        this.stack.push({
          type: "doc-end",
          offset: this.offset,
          source: this.source
        });
        return;
      }
      if (!top)
        return yield* this.stream();
      switch (top.type) {
        case "document":
          return yield* this.document(top);
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return yield* this.scalar(top);
        case "block-scalar":
          return yield* this.blockScalar(top);
        case "block-map":
          return yield* this.blockMap(top);
        case "block-seq":
          return yield* this.blockSequence(top);
        case "flow-collection":
          return yield* this.flowCollection(top);
        case "doc-end":
          return yield* this.documentEnd(top);
      }
      yield* this.pop();
    }
    peek(n) {
      return this.stack[this.stack.length - n];
    }
    *pop(error) {
      const token = error ?? this.stack.pop();
      if (!token) {
        const message = "Tried to pop an empty stack";
        yield { type: "error", offset: this.offset, source: "", message };
      } else if (this.stack.length === 0) {
        yield token;
      } else {
        const top = this.peek(1);
        if (token.type === "block-scalar") {
          token.indent = "indent" in top ? top.indent : 0;
        } else if (token.type === "flow-collection" && top.type === "document") {
          token.indent = 0;
        }
        if (token.type === "flow-collection")
          fixFlowSeqItems(token);
        switch (top.type) {
          case "document":
            top.value = token;
            break;
          case "block-scalar":
            top.props.push(token);
            break;
          case "block-map": {
            const it = top.items[top.items.length - 1];
            if (it.value) {
              top.items.push({ start: [], key: token, sep: [] });
              this.onKeyLine = true;
              return;
            } else if (it.sep) {
              it.value = token;
            } else {
              Object.assign(it, { key: token, sep: [] });
              this.onKeyLine = !it.explicitKey;
              return;
            }
            break;
          }
          case "block-seq": {
            const it = top.items[top.items.length - 1];
            if (it.value)
              top.items.push({ start: [], value: token });
            else
              it.value = token;
            break;
          }
          case "flow-collection": {
            const it = top.items[top.items.length - 1];
            if (!it || it.value)
              top.items.push({ start: [], key: token, sep: [] });
            else if (it.sep)
              it.value = token;
            else
              Object.assign(it, { key: token, sep: [] });
            return;
          }
          default:
            yield* this.pop();
            yield* this.pop(token);
        }
        if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
          const last = token.items[token.items.length - 1];
          if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
            if (top.type === "document")
              top.end = last.start;
            else
              top.items.push({ start: last.start });
            token.items.splice(-1, 1);
          }
        }
      }
    }
    *stream() {
      switch (this.type) {
        case "directive-line":
          yield { type: "directive", offset: this.offset, source: this.source };
          return;
        case "byte-order-mark":
        case "space":
        case "comment":
        case "newline":
          yield this.sourceToken;
          return;
        case "doc-mode":
        case "doc-start": {
          const doc = {
            type: "document",
            offset: this.offset,
            start: []
          };
          if (this.type === "doc-start")
            doc.start.push(this.sourceToken);
          this.stack.push(doc);
          return;
        }
      }
      yield {
        type: "error",
        offset: this.offset,
        message: `Unexpected ${this.type} token in YAML stream`,
        source: this.source
      };
    }
    *document(doc) {
      if (doc.value)
        return yield* this.lineEnd(doc);
      switch (this.type) {
        case "doc-start": {
          if (findNonEmptyIndex(doc.start) !== -1) {
            yield* this.pop();
            yield* this.step();
          } else
            doc.start.push(this.sourceToken);
          return;
        }
        case "anchor":
        case "tag":
        case "space":
        case "comment":
        case "newline":
          doc.start.push(this.sourceToken);
          return;
      }
      const bv = this.startBlockValue(doc);
      if (bv)
        this.stack.push(bv);
      else {
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML document`,
          source: this.source
        };
      }
    }
    *scalar(scalar) {
      if (this.type === "map-value-ind") {
        const prev = getPrevProps(this.peek(2));
        const start = getFirstKeyStartProps(prev);
        let sep;
        if (scalar.end) {
          sep = scalar.end;
          sep.push(this.sourceToken);
          delete scalar.end;
        } else
          sep = [this.sourceToken];
        const map = {
          type: "block-map",
          offset: scalar.offset,
          indent: scalar.indent,
          items: [{ start, key: scalar, sep }]
        };
        this.onKeyLine = true;
        this.stack[this.stack.length - 1] = map;
      } else
        yield* this.lineEnd(scalar);
    }
    *blockScalar(scalar) {
      switch (this.type) {
        case "space":
        case "comment":
        case "newline":
          scalar.props.push(this.sourceToken);
          return;
        case "scalar":
          scalar.source = this.source;
          this.atNewLine = true;
          this.indent = 0;
          if (this.onNewLine) {
            let nl = this.source.indexOf(`
`) + 1;
            while (nl !== 0) {
              this.onNewLine(this.offset + nl);
              nl = this.source.indexOf(`
`, nl) + 1;
            }
          }
          yield* this.pop();
          break;
        default:
          yield* this.pop();
          yield* this.step();
      }
    }
    *blockMap(map) {
      const it = map.items[map.items.length - 1];
      switch (this.type) {
        case "newline":
          this.onKeyLine = false;
          if (it.value) {
            const end = "end" in it.value ? it.value.end : undefined;
            const last = Array.isArray(end) ? end[end.length - 1] : undefined;
            if (last?.type === "comment")
              end?.push(this.sourceToken);
            else
              map.items.push({ start: [this.sourceToken] });
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            it.start.push(this.sourceToken);
          }
          return;
        case "space":
        case "comment":
          if (it.value) {
            map.items.push({ start: [this.sourceToken] });
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            if (this.atIndentedComment(it.start, map.indent)) {
              const prev = map.items[map.items.length - 2];
              const end = prev?.value?.end;
              if (Array.isArray(end)) {
                arrayPushArray(end, it.start);
                end.push(this.sourceToken);
                map.items.pop();
                return;
              }
            }
            it.start.push(this.sourceToken);
          }
          return;
      }
      if (this.indent >= map.indent) {
        const atMapIndent = !this.onKeyLine && this.indent === map.indent;
        const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
        let start = [];
        if (atNextItem && it.sep && !it.value) {
          const nl = [];
          for (let i = 0;i < it.sep.length; ++i) {
            const st = it.sep[i];
            switch (st.type) {
              case "newline":
                nl.push(i);
                break;
              case "space":
                break;
              case "comment":
                if (st.indent > map.indent)
                  nl.length = 0;
                break;
              default:
                nl.length = 0;
            }
          }
          if (nl.length >= 2)
            start = it.sep.splice(nl[1]);
        }
        switch (this.type) {
          case "anchor":
          case "tag":
            if (atNextItem || it.value) {
              start.push(this.sourceToken);
              map.items.push({ start });
              this.onKeyLine = true;
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "explicit-key-ind":
            if (!it.sep && !it.explicitKey) {
              it.start.push(this.sourceToken);
              it.explicitKey = true;
            } else if (atNextItem || it.value) {
              start.push(this.sourceToken);
              map.items.push({ start, explicitKey: true });
            } else {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: [this.sourceToken], explicitKey: true }]
              });
            }
            this.onKeyLine = true;
            return;
          case "map-value-ind":
            if (it.explicitKey) {
              if (!it.sep) {
                if (includesToken(it.start, "newline")) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else {
                  const start2 = getFirstKeyStartProps(it.start);
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                  });
                }
              } else if (it.value) {
                map.items.push({ start: [], key: null, sep: [this.sourceToken] });
              } else if (includesToken(it.sep, "map-value-ind")) {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start, key: null, sep: [this.sourceToken] }]
                });
              } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                const start2 = getFirstKeyStartProps(it.start);
                const key = it.key;
                const sep = it.sep;
                sep.push(this.sourceToken);
                delete it.key;
                delete it.sep;
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: start2, key, sep }]
                });
              } else if (start.length > 0) {
                it.sep = it.sep.concat(start, this.sourceToken);
              } else {
                it.sep.push(this.sourceToken);
              }
            } else {
              if (!it.sep) {
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              } else if (it.value || atNextItem) {
                map.items.push({ start, key: null, sep: [this.sourceToken] });
              } else if (includesToken(it.sep, "map-value-ind")) {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [], key: null, sep: [this.sourceToken] }]
                });
              } else {
                it.sep.push(this.sourceToken);
              }
            }
            this.onKeyLine = true;
            return;
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar": {
            const fs = this.flowScalar(this.type);
            if (atNextItem || it.value) {
              map.items.push({ start, key: fs, sep: [] });
              this.onKeyLine = true;
            } else if (it.sep) {
              this.stack.push(fs);
            } else {
              Object.assign(it, { key: fs, sep: [] });
              this.onKeyLine = true;
            }
            return;
          }
          default: {
            const bv = this.startBlockValue(map);
            if (bv) {
              if (bv.type === "block-seq") {
                if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                  yield* this.pop({
                    type: "error",
                    offset: this.offset,
                    message: "Unexpected block-seq-ind on same line with key",
                    source: this.source
                  });
                  return;
                }
              } else if (atMapIndent) {
                map.items.push({ start });
              }
              this.stack.push(bv);
              return;
            }
          }
        }
      }
      yield* this.pop();
      yield* this.step();
    }
    *blockSequence(seq) {
      const it = seq.items[seq.items.length - 1];
      switch (this.type) {
        case "newline":
          if (it.value) {
            const end = "end" in it.value ? it.value.end : undefined;
            const last = Array.isArray(end) ? end[end.length - 1] : undefined;
            if (last?.type === "comment")
              end?.push(this.sourceToken);
            else
              seq.items.push({ start: [this.sourceToken] });
          } else
            it.start.push(this.sourceToken);
          return;
        case "space":
        case "comment":
          if (it.value)
            seq.items.push({ start: [this.sourceToken] });
          else {
            if (this.atIndentedComment(it.start, seq.indent)) {
              const prev = seq.items[seq.items.length - 2];
              const end = prev?.value?.end;
              if (Array.isArray(end)) {
                arrayPushArray(end, it.start);
                end.push(this.sourceToken);
                seq.items.pop();
                return;
              }
            }
            it.start.push(this.sourceToken);
          }
          return;
        case "anchor":
        case "tag":
          if (it.value || this.indent <= seq.indent)
            break;
          it.start.push(this.sourceToken);
          return;
        case "seq-item-ind":
          if (this.indent !== seq.indent)
            break;
          if (it.value || includesToken(it.start, "seq-item-ind"))
            seq.items.push({ start: [this.sourceToken] });
          else
            it.start.push(this.sourceToken);
          return;
      }
      if (this.indent > seq.indent) {
        const bv = this.startBlockValue(seq);
        if (bv) {
          this.stack.push(bv);
          return;
        }
      }
      yield* this.pop();
      yield* this.step();
    }
    *flowCollection(fc) {
      const it = fc.items[fc.items.length - 1];
      if (this.type === "flow-error-end") {
        let top;
        do {
          yield* this.pop();
          top = this.peek(1);
        } while (top?.type === "flow-collection");
      } else if (fc.end.length === 0) {
        switch (this.type) {
          case "comma":
          case "explicit-key-ind":
            if (!it || it.sep)
              fc.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
          case "map-value-ind":
            if (!it || it.value)
              fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else
              Object.assign(it, { key: null, sep: [this.sourceToken] });
            return;
          case "space":
          case "comment":
          case "newline":
          case "anchor":
          case "tag":
            if (!it || it.value)
              fc.items.push({ start: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else
              it.start.push(this.sourceToken);
            return;
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar": {
            const fs = this.flowScalar(this.type);
            if (!it || it.value)
              fc.items.push({ start: [], key: fs, sep: [] });
            else if (it.sep)
              this.stack.push(fs);
            else
              Object.assign(it, { key: fs, sep: [] });
            return;
          }
          case "flow-map-end":
          case "flow-seq-end":
            fc.end.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(fc);
        if (bv)
          this.stack.push(bv);
        else {
          yield* this.pop();
          yield* this.step();
        }
      } else {
        const parent = this.peek(2);
        if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
          yield* this.pop();
          yield* this.step();
        } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          fixFlowSeqItems(fc);
          const sep = fc.end.splice(1, fc.end.length);
          sep.push(this.sourceToken);
          const map = {
            type: "block-map",
            offset: fc.offset,
            indent: fc.indent,
            items: [{ start, key: fc, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else {
          yield* this.lineEnd(fc);
        }
      }
    }
    flowScalar(type) {
      if (this.onNewLine) {
        let nl = this.source.indexOf(`
`) + 1;
        while (nl !== 0) {
          this.onNewLine(this.offset + nl);
          nl = this.source.indexOf(`
`, nl) + 1;
        }
      }
      return {
        type,
        offset: this.offset,
        indent: this.indent,
        source: this.source
      };
    }
    startBlockValue(parent) {
      switch (this.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
          return this.flowScalar(this.type);
        case "block-scalar-header":
          return {
            type: "block-scalar",
            offset: this.offset,
            indent: this.indent,
            props: [this.sourceToken],
            source: ""
          };
        case "flow-map-start":
        case "flow-seq-start":
          return {
            type: "flow-collection",
            offset: this.offset,
            indent: this.indent,
            start: this.sourceToken,
            items: [],
            end: []
          };
        case "seq-item-ind":
          return {
            type: "block-seq",
            offset: this.offset,
            indent: this.indent,
            items: [{ start: [this.sourceToken] }]
          };
        case "explicit-key-ind": {
          this.onKeyLine = true;
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          start.push(this.sourceToken);
          return {
            type: "block-map",
            offset: this.offset,
            indent: this.indent,
            items: [{ start, explicitKey: true }]
          };
        }
        case "map-value-ind": {
          this.onKeyLine = true;
          const prev = getPrevProps(parent);
          const start = getFirstKeyStartProps(prev);
          return {
            type: "block-map",
            offset: this.offset,
            indent: this.indent,
            items: [{ start, key: null, sep: [this.sourceToken] }]
          };
        }
      }
      return null;
    }
    atIndentedComment(start, indent) {
      if (this.type !== "comment")
        return false;
      if (this.indent <= indent)
        return false;
      return start.every((st) => st.type === "newline" || st.type === "space");
    }
    *documentEnd(docEnd) {
      if (this.type !== "doc-mode") {
        if (docEnd.end)
          docEnd.end.push(this.sourceToken);
        else
          docEnd.end = [this.sourceToken];
        if (this.type === "newline")
          yield* this.pop();
      }
    }
    *lineEnd(token) {
      switch (this.type) {
        case "comma":
        case "doc-start":
        case "doc-end":
        case "flow-seq-end":
        case "flow-map-end":
        case "map-value-ind":
          yield* this.pop();
          yield* this.step();
          break;
        case "newline":
          this.onKeyLine = false;
        case "space":
        case "comment":
        default:
          if (token.end)
            token.end.push(this.sourceToken);
          else
            token.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
      }
    }
  }
  exports2.Parser = Parser;
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS((exports2) => {
  var composer = require_composer();
  var Document = require_Document();
  var errors = require_errors();
  var log = require_log();
  var identity = require_identity();
  var lineCounter = require_line_counter();
  var parser = require_parser();
  function parseOptions(options) {
    const prettyErrors = options.prettyErrors !== false;
    const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter || null;
    return { lineCounter: lineCounter$1, prettyErrors };
  }
  function parseAllDocuments(source, options = {}) {
    const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
    const composer$1 = new composer.Composer(options);
    const docs = Array.from(composer$1.compose(parser$1.parse(source)));
    if (prettyErrors && lineCounter2)
      for (const doc of docs) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
    if (docs.length > 0)
      return docs;
    return Object.assign([], { empty: true }, composer$1.streamInfo());
  }
  function parseDocument(source, options = {}) {
    const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
    const composer$1 = new composer.Composer(options);
    let doc = null;
    for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
      if (!doc)
        doc = _doc;
      else if (doc.options.logLevel !== "silent") {
        doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
        break;
      }
    }
    if (prettyErrors && lineCounter2) {
      doc.errors.forEach(errors.prettifyError(source, lineCounter2));
      doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
    }
    return doc;
  }
  function parse(src, reviver, options) {
    let _reviver = undefined;
    if (typeof reviver === "function") {
      _reviver = reviver;
    } else if (options === undefined && reviver && typeof reviver === "object") {
      options = reviver;
    }
    const doc = parseDocument(src, options);
    if (!doc)
      return null;
    doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
    if (doc.errors.length > 0) {
      if (doc.options.logLevel !== "silent")
        throw doc.errors[0];
      else
        doc.errors = [];
    }
    return doc.toJS(Object.assign({ reviver: _reviver }, options));
  }
  function stringify(value, replacer, options) {
    let _replacer = null;
    if (typeof replacer === "function" || Array.isArray(replacer)) {
      _replacer = replacer;
    } else if (options === undefined && replacer) {
      options = replacer;
    }
    if (typeof options === "string")
      options = options.length;
    if (typeof options === "number") {
      const indent = Math.round(options);
      options = indent < 1 ? undefined : indent > 8 ? { indent: 8 } : { indent };
    }
    if (value === undefined) {
      const { keepUndefined } = options ?? replacer ?? {};
      if (!keepUndefined)
        return;
    }
    if (identity.isDocument(value) && !_replacer)
      return value.toString(options);
    return new Document.Document(value, _replacer, options).toString(options);
  }
  exports2.parse = parse;
  exports2.parseAllDocuments = parseAllDocuments;
  exports2.parseDocument = parseDocument;
  exports2.stringify = stringify;
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS((exports2) => {
  var composer = require_composer();
  var Document = require_Document();
  var Schema = require_Schema();
  var errors = require_errors();
  var Alias = require_Alias();
  var identity = require_identity();
  var Pair = require_Pair();
  var Scalar = require_Scalar();
  var YAMLMap = require_YAMLMap();
  var YAMLSeq = require_YAMLSeq();
  var cst = require_cst();
  var lexer = require_lexer();
  var lineCounter = require_line_counter();
  var parser = require_parser();
  var publicApi = require_public_api();
  var visit = require_visit();
  exports2.Composer = composer.Composer;
  exports2.Document = Document.Document;
  exports2.Schema = Schema.Schema;
  exports2.YAMLError = errors.YAMLError;
  exports2.YAMLParseError = errors.YAMLParseError;
  exports2.YAMLWarning = errors.YAMLWarning;
  exports2.Alias = Alias.Alias;
  exports2.isAlias = identity.isAlias;
  exports2.isCollection = identity.isCollection;
  exports2.isDocument = identity.isDocument;
  exports2.isMap = identity.isMap;
  exports2.isNode = identity.isNode;
  exports2.isPair = identity.isPair;
  exports2.isScalar = identity.isScalar;
  exports2.isSeq = identity.isSeq;
  exports2.Pair = Pair.Pair;
  exports2.Scalar = Scalar.Scalar;
  exports2.YAMLMap = YAMLMap.YAMLMap;
  exports2.YAMLSeq = YAMLSeq.YAMLSeq;
  exports2.CST = cst;
  exports2.Lexer = lexer.Lexer;
  exports2.LineCounter = lineCounter.LineCounter;
  exports2.Parser = parser.Parser;
  exports2.parse = publicApi.parse;
  exports2.parseAllDocuments = publicApi.parseAllDocuments;
  exports2.parseDocument = publicApi.parseDocument;
  exports2.stringify = publicApi.stringify;
  exports2.visit = visit.visit;
  exports2.visitAsync = visit.visitAsync;
});

// src/action/github.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
function inputEnvName(name) {
  return `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
}
function getInput(name, environment) {
  const value = environment[inputEnvName(name)];
  return value === undefined ? undefined : value.trim();
}
function escapeCommandData(value) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeCommandProperty(value) {
  return escapeCommandData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
function emitCommand(level, message, log = console.log) {
  log(`::${level}::${escapeCommandData(message)}`);
}
function emitAnnotation(level, message, properties, log = console.log) {
  const serialized = [];
  if (properties.title !== undefined) {
    serialized.push(`title=${escapeCommandProperty(properties.title)}`);
  }
  if (properties.file !== undefined) {
    serialized.push(`file=${escapeCommandProperty(properties.file)}`);
  }
  for (const [name, value] of [
    ["line", properties.line],
    ["col", properties.col]
  ]) {
    if (value === undefined)
      continue;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Invalid GitHub annotation ${name}: ${value}.`);
    }
    serialized.push(`${name}=${value}`);
  }
  const prefix = serialized.length > 0 ? ` ${serialized.join(",")}` : "";
  log(`::${level}${prefix}::${escapeCommandData(message)}`);
}
function maskSecret(secret, log = console.log) {
  if (secret !== "")
    log(`::add-mask::${escapeCommandData(secret)}`);
}
function appendCommand(file, key, value, uuid = import_node_crypto.randomUUID) {
  if (!file)
    return;
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) {
    throw new Error(`Invalid GitHub output name: ${key}`);
  }
  let delimiter = `ghadelimiter_${uuid()}`;
  const lines = new Set(value.split(/\r?\n/));
  while (lines.has(delimiter))
    delimiter = `ghadelimiter_${uuid()}`;
  import_node_fs.appendFileSync(file, `${key}<<${delimiter}${import_node_os.EOL}${value}${import_node_os.EOL}${delimiter}${import_node_os.EOL}`, "utf8");
}
function appendSummary(file, markdown) {
  if (file)
    import_node_fs.appendFileSync(file, markdown.endsWith(import_node_os.EOL) ? markdown : `${markdown}${import_node_os.EOL}`, "utf8");
}

// src/action/run.ts
var import_node_fs4 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path3 = require("node:path");

// src/lifecycle/feed.ts
var import_node_crypto2 = require("node:crypto");
var V3_FEED_LIMITS = Object.freeze({
  maxDocumentBytes: 32 * 1024 * 1024,
  maxRecords: 1e5,
  maxAdapterIdCodePoints: 128,
  maxAdapterVersionCodePoints: 64,
  maxRecordIdCodePoints: 256,
  maxIdentifierCodePoints: 2048,
  maxDisplayNameCodePoints: 512,
  maxUrlCodePoints: 2048,
  maxSupersededRecordsPerRecord: 1000,
  maxReplacementModelsPerRecord: 100
});
var CANONICAL_PLATFORM_SLUGS = Object.freeze([
  "openai",
  "azure",
  "anthropic",
  "aws-bedrock",
  "google",
  "google-vertex",
  "cohere",
  "groq",
  "xai"
]);
var CANONICAL_PLATFORM_REGISTRY = Object.freeze({
  openai: Object.freeze({ displayName: "OpenAI API" }),
  azure: Object.freeze({ displayName: "Azure OpenAI / Azure AI Foundry" }),
  anthropic: Object.freeze({ displayName: "Anthropic API" }),
  "aws-bedrock": Object.freeze({ displayName: "Amazon Bedrock" }),
  google: Object.freeze({ displayName: "Google Gemini API / Google AI Studio" }),
  "google-vertex": Object.freeze({ displayName: "Google Vertex AI" }),
  cohere: Object.freeze({ displayName: "Cohere API" }),
  groq: Object.freeze({ displayName: "Groq API" }),
  xai: Object.freeze({ displayName: "xAI API" })
});
var SOURCE_PROVIDER_PLATFORM_MAPPING = Object.freeze({
  OpenAI: "openai",
  Azure: "azure",
  Anthropic: "anthropic",
  "AWS Bedrock": "aws-bedrock",
  Google: "google",
  "Google Vertex": "google-vertex",
  Cohere: "cohere",
  Groq: "groq",
  xAI: "xai"
});
var PROVIDER_LIFECYCLE_ALIAS_REGISTRY = Object.freeze({
  version: "3.0.0",
  aliases: Object.freeze([])
});
var CANONICAL_PLATFORM_SET = new Set(CANONICAL_PLATFORM_SLUGS);
var PLATFORM_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
var SHA256_PATTERN = /^[a-f0-9]{64}$/;
var CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
var RFC3339_UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;
var DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
var NON_MODEL_RECORD_KINDS = [
  "api",
  "sdk",
  "feature",
  "tool",
  "product",
  "prompt",
  "agent",
  "other"
];
var NON_MODEL_RECORD_KIND_SET = new Set(NON_MODEL_RECORD_KINDS);
var V3_TYPED_FEED_RUNTIME_MANIFEST = Object.freeze({
  schemaVersion: 3,
  canonicalPlatforms: Object.freeze(CANONICAL_PLATFORM_SLUGS.map((slug) => Object.freeze({ slug, displayName: CANONICAL_PLATFORM_REGISTRY[slug].displayName }))),
  sourceProviderPlatformMapping: Object.freeze(Object.entries(SOURCE_PROVIDER_PLATFORM_MAPPING).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([provider, platform]) => Object.freeze([provider, platform]))),
  nonModelRecordKinds: Object.freeze([...NON_MODEL_RECORD_KINDS]),
  providerLifecycleAliasRegistry: PROVIDER_LIFECYCLE_ALIAS_REGISTRY
});

class V3FeedValidationError extends Error {
  path;
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "V3FeedValidationError";
    this.path = path;
  }
}
function isPlatformSlug(value) {
  return PLATFORM_SLUG_PATTERN.test(value);
}
function isCanonicalPlatformSlug(value) {
  return CANONICAL_PLATFORM_SET.has(value);
}
function platformForSourceProvider(sourceProvider) {
  return Object.prototype.hasOwnProperty.call(SOURCE_PROVIDER_PLATFORM_MAPPING, sourceProvider) ? SOURCE_PROVIDER_PLATFORM_MAPPING[sourceProvider] ?? null : null;
}
function modelPairIdentity(servingPlatform, modelId) {
  return JSON.stringify(["model", servingPlatform, modelId]);
}
function nonModelPairIdentity(servingPlatform, resourceId) {
  return JSON.stringify(["non-model", servingPlatform, resourceId]);
}
function lifecycleSignatureIdentity(record) {
  return JSON.stringify([
    record.servingPlatform,
    record.modelId,
    record.lifecycleStatus,
    record.announcementDate ?? null,
    record.deprecationDate ?? null,
    record.shutdownDate ?? null,
    record.literalScanEligible
  ]);
}
function codePointLength(value) {
  let length = 0;
  for (const _codePoint of value)
    length += 1;
  return length;
}
function diagnosticPreview(value, maxCodePoints = 120) {
  const codePoints = [...value];
  const bounded = codePoints.length <= maxCodePoints ? value : `${codePoints.slice(0, maxCodePoints - 1).join("")}…`;
  return JSON.stringify(bounded);
}
function fail(path, message) {
  throw new V3FeedValidationError(path, message);
}
function isJsonObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function objectAt(value, path) {
  if (!isJsonObject(value))
    fail(path, "must be a JSON object");
  return value;
}
function rejectUnknownFields(value, allowedFields, path) {
  const unknownFields = Object.keys(value).filter((field) => !allowedFields.has(field)).sort();
  if (unknownFields.length > 0) {
    const shown = unknownFields.slice(0, 10).map((field) => diagnosticPreview(field, 80));
    const omitted = unknownFields.length - shown.length;
    fail(path, `contains unknown field(s): ${shown.join(", ")}${omitted === 0 ? "" : `, … +${omitted} more`}`);
  }
}
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function textAt(value, path, maxCodePoints) {
  if (typeof value !== "string")
    fail(path, "must be a string");
  if (value.trim() === "")
    fail(path, "must not be empty or whitespace-only");
  if (value.trim() !== value)
    fail(path, "must not have surrounding whitespace");
  if (CONTROL_CHARACTER_PATTERN.test(value))
    fail(path, "must not contain control characters");
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 55296 && codePoint <= 57343) {
      fail(path, "must contain only Unicode scalar values (no unpaired surrogates)");
    }
  }
  if (codePointLength(value) > maxCodePoints) {
    fail(path, `must contain at most ${maxCodePoints} Unicode code points`);
  }
  return value;
}
function requiredText(object, field, path, maxCodePoints) {
  if (!hasOwn(object, field))
    fail(`${path}.${field}`, "is required");
  return textAt(object[field], `${path}.${field}`, maxCodePoints);
}
function optionalText(object, field, path, maxCodePoints) {
  if (!hasOwn(object, field))
    return;
  return textAt(object[field], `${path}.${field}`, maxCodePoints);
}
function requiredBoolean(object, field, path) {
  if (!hasOwn(object, field))
    fail(`${path}.${field}`, "is required");
  const value = object[field];
  if (typeof value !== "boolean")
    fail(`${path}.${field}`, "must be a boolean");
  return value;
}
function arrayAt(value, path, maxItems) {
  if (!Array.isArray(value))
    fail(path, "must be an array");
  if (value.length > maxItems)
    fail(path, `must contain at most ${maxItems} items`);
  return value;
}
function isDateOnly(value) {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (match === null)
    return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12)
    return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (daysInMonth[month - 1] ?? 0);
}
function isRfc3339UtcInstant(value) {
  const match = RFC3339_UTC_PATTERN.exec(value);
  if (match === null)
    return false;
  return isDateOnly(`${match[1]}-${match[2]}-${match[3]}`);
}
var MILLISECONDS_PER_DAY = 86400000;
function feedAgeInDays(generatedAt, nowMs) {
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs)) {
    throw new Error(`Cannot measure feed age from generatedAt ${JSON.stringify(generatedAt)}.`);
  }
  return Math.max(0, Math.floor((nowMs - generatedMs) / MILLISECONDS_PER_DAY));
}
function dateField(object, field, path) {
  const value = optionalText(object, field, path, 10);
  if (value !== undefined && !isDateOnly(value)) {
    fail(`${path}.${field}`, "must be a real YYYY-MM-DD date");
  }
  return value;
}
function platformSlugAt(value, path) {
  const slug = textAt(value, path, 63);
  if (!isPlatformSlug(slug)) {
    fail(path, "must match [a-z0-9](?:[a-z0-9-]{0,62})");
  }
  return slug;
}
function httpUrlAt(value, path) {
  const url = textAt(value, path, V3_FEED_LIMITS.maxUrlCodePoints);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(path, "must be an absolute HTTP(S) URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || parsed.hostname === "") {
    fail(path, "must be an absolute HTTP(S) URL");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    fail(path, "must not contain credentials");
  }
  return url;
}
var ENVELOPE_FIELDS = new Set(["schemaVersion", "adapter", "generatedAt", "records"]);
var ADAPTER_FIELDS = new Set(["id", "version", "sourceSha256"]);
var MODEL_FIELDS = new Set([
  "recordId",
  "servingPlatform",
  "primarySourceUrl",
  "supersedesRecordIds",
  "recordKind",
  "modelId",
  "literalScanEligible",
  "lifecycleStatus",
  "announcementDate",
  "deprecationDate",
  "shutdownDate",
  "replacementModels"
]);
var NON_MODEL_FIELDS = new Set([
  "recordId",
  "servingPlatform",
  "primarySourceUrl",
  "supersedesRecordIds",
  "recordKind",
  "resourceId",
  "displayName",
  "literalScanEligible"
]);
var REPLACEMENT_FIELDS = new Set(["modelId", "servingPlatform"]);
function parseAdapter(value) {
  const path = "$.adapter";
  const object = objectAt(value, path);
  rejectUnknownFields(object, ADAPTER_FIELDS, path);
  const id = requiredText(object, "id", path, V3_FEED_LIMITS.maxAdapterIdCodePoints);
  const version = requiredText(object, "version", path, V3_FEED_LIMITS.maxAdapterVersionCodePoints);
  const sourceSha256 = requiredText(object, "sourceSha256", path, 64);
  if (!SHA256_PATTERN.test(sourceSha256)) {
    fail(`${path}.sourceSha256`, "must be a lower-case SHA-256 hex digest");
  }
  return { id, version, sourceSha256 };
}
function parseSupersedesRecordIds(object, path) {
  if (!hasOwn(object, "supersedesRecordIds")) {
    fail(`${path}.supersedesRecordIds`, "is required");
  }
  const items = arrayAt(object.supersedesRecordIds, `${path}.supersedesRecordIds`, V3_FEED_LIMITS.maxSupersededRecordsPerRecord);
  const seen = new Set;
  return items.map((item, index) => {
    const recordId = textAt(item, `${path}.supersedesRecordIds[${index}]`, V3_FEED_LIMITS.maxRecordIdCodePoints);
    if (seen.has(recordId)) {
      fail(`${path}.supersedesRecordIds[${index}]`, `duplicates record ID ${JSON.stringify(recordId)}`);
    }
    seen.add(recordId);
    return recordId;
  });
}
function parseCommon(object, path) {
  const recordId = requiredText(object, "recordId", path, V3_FEED_LIMITS.maxRecordIdCodePoints);
  if (!hasOwn(object, "servingPlatform"))
    fail(`${path}.servingPlatform`, "is required");
  const servingPlatform = platformSlugAt(object.servingPlatform, `${path}.servingPlatform`);
  if (!hasOwn(object, "primarySourceUrl"))
    fail(`${path}.primarySourceUrl`, "is required");
  const primarySourceUrl = httpUrlAt(object.primarySourceUrl, `${path}.primarySourceUrl`);
  const supersedesRecordIds = parseSupersedesRecordIds(object, path);
  return { recordId, servingPlatform, primarySourceUrl, supersedesRecordIds };
}
function parseReplacementModels(object, path) {
  if (!hasOwn(object, "replacementModels"))
    fail(`${path}.replacementModels`, "is required");
  const replacements = arrayAt(object.replacementModels, `${path}.replacementModels`, V3_FEED_LIMITS.maxReplacementModelsPerRecord);
  return replacements.map((candidate, index) => {
    const replacementPath = `${path}.replacementModels[${index}]`;
    const replacement = objectAt(candidate, replacementPath);
    rejectUnknownFields(replacement, REPLACEMENT_FIELDS, replacementPath);
    const modelId = requiredText(replacement, "modelId", replacementPath, V3_FEED_LIMITS.maxIdentifierCodePoints);
    if (!hasOwn(replacement, "servingPlatform"))
      return { modelId };
    return {
      modelId,
      servingPlatform: platformSlugAt(replacement.servingPlatform, `${replacementPath}.servingPlatform`)
    };
  });
}
function assertDateOrdering(record, path) {
  const orderedDates = [
    ["announcementDate", record.announcementDate],
    ["deprecationDate", record.deprecationDate],
    ["shutdownDate", record.shutdownDate]
  ];
  let previous;
  for (const current of orderedDates) {
    if (current[1] === undefined)
      continue;
    if (previous !== undefined && previous[1] !== undefined && previous[1] > current[1]) {
      fail(`${path}.${current[0]}`, `must not precede ${previous[0]} (${previous[1]})`);
    }
    previous = current;
  }
}
function parseModelRecord(object, path, generatedDate) {
  rejectUnknownFields(object, MODEL_FIELDS, path);
  const common = parseCommon(object, path);
  const modelId = requiredText(object, "modelId", path, V3_FEED_LIMITS.maxIdentifierCodePoints);
  const literalScanEligible = requiredBoolean(object, "literalScanEligible", path);
  const lifecycleStatus = requiredText(object, "lifecycleStatus", path, 32);
  if (lifecycleStatus !== "deprecated" && lifecycleStatus !== "shutdown-scheduled" && lifecycleStatus !== "retired") {
    fail(`${path}.lifecycleStatus`, "must be deprecated, shutdown-scheduled, or retired");
  }
  const announcementDate = dateField(object, "announcementDate", path);
  const deprecationDate = dateField(object, "deprecationDate", path);
  const shutdownDate = dateField(object, "shutdownDate", path);
  const replacementModels = parseReplacementModels(object, path);
  const record = {
    ...common,
    recordKind: "model",
    modelId,
    literalScanEligible,
    lifecycleStatus,
    replacementModels,
    ...announcementDate === undefined ? {} : { announcementDate },
    ...deprecationDate === undefined ? {} : { deprecationDate },
    ...shutdownDate === undefined ? {} : { shutdownDate }
  };
  if (deprecationDate === undefined && shutdownDate === undefined) {
    fail(path, "a model record requires deprecationDate or shutdownDate");
  }
  assertDateOrdering(record, path);
  switch (lifecycleStatus) {
    case "deprecated":
      if (deprecationDate === undefined) {
        fail(`${path}.deprecationDate`, "is required when lifecycleStatus is deprecated");
      }
      if (shutdownDate !== undefined) {
        fail(`${path}.shutdownDate`, "must be absent when lifecycleStatus is deprecated");
      }
      break;
    case "shutdown-scheduled":
      if (shutdownDate === undefined) {
        fail(`${path}.shutdownDate`, "is required when lifecycleStatus is shutdown-scheduled");
      }
      if (shutdownDate <= generatedDate) {
        fail(`${path}.shutdownDate`, `must be after the generatedAt UTC date ${generatedDate}`);
      }
      break;
    case "retired":
      if (shutdownDate === undefined) {
        fail(`${path}.shutdownDate`, "is required when lifecycleStatus is retired");
      }
      if (shutdownDate > generatedDate) {
        fail(`${path}.shutdownDate`, `must be on or before the generatedAt UTC date ${generatedDate}`);
      }
      break;
  }
  return record;
}
function parseNonModelRecord(object, path, recordKind) {
  rejectUnknownFields(object, NON_MODEL_FIELDS, path);
  const common = parseCommon(object, path);
  const resourceId = requiredText(object, "resourceId", path, V3_FEED_LIMITS.maxIdentifierCodePoints);
  const literalScanEligible = requiredBoolean(object, "literalScanEligible", path);
  if (literalScanEligible !== false) {
    fail(`${path}.literalScanEligible`, "must be false for a non-model record");
  }
  const displayName = optionalText(object, "displayName", path, V3_FEED_LIMITS.maxDisplayNameCodePoints);
  return {
    ...common,
    recordKind,
    resourceId,
    literalScanEligible: false,
    ...displayName === undefined ? {} : { displayName }
  };
}
function parseRecord(value, index, generatedDate) {
  const path = `$.records[${index}]`;
  const object = objectAt(value, path);
  if (!hasOwn(object, "recordKind"))
    fail(`${path}.recordKind`, "is required");
  const recordKind = object.recordKind;
  if (recordKind === "model")
    return parseModelRecord(object, path, generatedDate);
  if (typeof recordKind === "string" && NON_MODEL_RECORD_KIND_SET.has(recordKind)) {
    return parseNonModelRecord(object, path, recordKind);
  }
  fail(`${path}.recordKind`, `must be model or one of ${NON_MODEL_RECORD_KINDS.join(", ")}`);
}
function pairIdentityForRecord(record) {
  return record.recordKind === "model" ? modelPairIdentity(record.servingPlatform, record.modelId) : nonModelPairIdentity(record.servingPlatform, record.resourceId);
}
function assertSupersessionGraph(records) {
  const byId = new Map(records.map((record) => [record.recordId, record]));
  const indegree = new Map(records.map((record) => [record.recordId, 0]));
  for (const [index, record] of records.entries()) {
    for (const [referenceIndex, supersededRecordId] of record.supersedesRecordIds.entries()) {
      const path = `$.records[${index}].supersedesRecordIds[${referenceIndex}]`;
      if (supersededRecordId === record.recordId)
        fail(path, "must not reference its own record");
      const supersededRecord = byId.get(supersededRecordId);
      if (supersededRecord === undefined) {
        fail(path, `references missing record ID ${JSON.stringify(supersededRecordId)}`);
      }
      if (pairIdentityForRecord(record) !== pairIdentityForRecord(supersededRecord)) {
        fail(path, "must reference the same exact platform/model or platform/resource pair");
      }
      indegree.set(supersededRecordId, (indegree.get(supersededRecordId) ?? 0) + 1);
    }
  }
  const queue = records.filter((record) => indegree.get(record.recordId) === 0).map((record) => record.recordId).sort(compareText);
  let queueIndex = 0;
  let visited = 0;
  while (queueIndex < queue.length) {
    const recordId = queue[queueIndex];
    queueIndex += 1;
    if (recordId === undefined)
      break;
    visited += 1;
    const record = byId.get(recordId);
    if (record === undefined)
      fail("$.records", "contains an inconsistent supersession graph");
    for (const supersededRecordId of record.supersedesRecordIds) {
      const nextIndegree = (indegree.get(supersededRecordId) ?? 0) - 1;
      indegree.set(supersededRecordId, nextIndegree);
      if (nextIndegree === 0)
        queue.push(supersededRecordId);
    }
  }
  if (visited !== records.length)
    fail("$.records", "supersession graph contains a cycle");
}
function validateV3Feed(payload) {
  const object = objectAt(payload, "$");
  rejectUnknownFields(object, ENVELOPE_FIELDS, "$");
  if (!hasOwn(object, "schemaVersion"))
    fail("$.schemaVersion", "is required");
  if (object.schemaVersion !== 3)
    fail("$.schemaVersion", "must equal 3");
  if (!hasOwn(object, "adapter"))
    fail("$.adapter", "is required");
  const adapter = parseAdapter(object.adapter);
  const generatedAt = requiredText(object, "generatedAt", "$", 64);
  if (!isRfc3339UtcInstant(generatedAt)) {
    fail("$.generatedAt", "must be an RFC 3339 UTC instant ending in Z");
  }
  if (!hasOwn(object, "records"))
    fail("$.records", "is required");
  const rawRecords = arrayAt(object.records, "$.records", V3_FEED_LIMITS.maxRecords);
  if (rawRecords.length === 0)
    fail("$.records", "must contain at least one record");
  const generatedDate = generatedAt.slice(0, 10);
  const records = rawRecords.map((record, index) => parseRecord(record, index, generatedDate));
  const recordIds = new Set;
  for (const [index, record] of records.entries()) {
    if (recordIds.has(record.recordId)) {
      fail(`$.records[${index}].recordId`, `duplicates record ID ${JSON.stringify(record.recordId)}`);
    }
    recordIds.add(record.recordId);
  }
  assertSupersessionGraph(records);
  return { schemaVersion: 3, adapter, generatedAt, records };
}
function rawFeedBytes(raw) {
  const bytes = typeof raw === "string" ? Buffer.from(raw, "utf8") : raw;
  if (bytes.byteLength > V3_FEED_LIMITS.maxDocumentBytes) {
    fail("$", `feed document exceeds ${V3_FEED_LIMITS.maxDocumentBytes} bytes`);
  }
  return bytes;
}
function decodeFeedJson(raw) {
  const bytes = rawFeedBytes(raw);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("$", "feed document must be valid UTF-8");
  }
  if (typeof raw === "string" && text !== raw) {
    fail("$", "feed document string must round-trip as exact UTF-8 bytes");
  }
  try {
    return { bytes, value: JSON.parse(text) };
  } catch (error) {
    fail("$", `feed document must be valid JSON (${diagnosticPreview(error instanceof Error ? error.message : String(error), 240)})`);
  }
}
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}
function indexValidatedFeed(envelope) {
  const recordById = new Map(envelope.records.map((record) => [record.recordId, record]));
  const supersededRecordIdSet = new Set(envelope.records.flatMap((record) => [...record.supersedesRecordIds]));
  const activeRecords = envelope.records.filter((record) => !supersededRecordIdSet.has(record.recordId)).sort((left, right) => compareText(left.recordId, right.recordId));
  const mutablePairs = new Map;
  for (const record of envelope.records) {
    if (record.recordKind !== "model")
      continue;
    const pairIdentity = modelPairIdentity(record.servingPlatform, record.modelId);
    let pair = mutablePairs.get(pairIdentity);
    if (pair === undefined) {
      pair = {
        servingPlatform: record.servingPlatform,
        modelId: record.modelId,
        all: [],
        active: []
      };
      mutablePairs.set(pairIdentity, pair);
    }
    pair.all.push(record);
    if (!supersededRecordIdSet.has(record.recordId))
      pair.active.push(record);
  }
  const modelPairs = [];
  const diagnostics = [];
  for (const [pairIdentity, pair] of [...mutablePairs.entries()].sort(([left], [right]) => compareText(left, right))) {
    const bySignature = new Map;
    for (const record of pair.active) {
      const signatureIdentity = lifecycleSignatureIdentity(record);
      const records = bySignature.get(signatureIdentity) ?? [];
      records.push(record);
      bySignature.set(signatureIdentity, records);
    }
    const activeLifecycles = [...bySignature.entries()].sort(([left], [right]) => compareText(left, right)).map(([signatureIdentity, records]) => {
      const representative = records[0];
      if (representative === undefined) {
        fail("$.records", "contains an empty lifecycle-signature group");
      }
      const provenance = records.map((record) => ({
        recordId: record.recordId,
        primarySourceUrl: record.primarySourceUrl,
        replacementModels: record.replacementModels
      })).sort((left, right) => compareText(left.recordId, right.recordId));
      return {
        signatureIdentity,
        lifecycleStatus: representative.lifecycleStatus,
        announcementDate: representative.announcementDate ?? null,
        deprecationDate: representative.deprecationDate ?? null,
        shutdownDate: representative.shutdownDate ?? null,
        literalScanEligible: representative.literalScanEligible,
        recordIds: provenance.map((item) => item.recordId),
        primarySourceUrls: sortedUnique(provenance.map((item) => item.primarySourceUrl)),
        provenance
      };
    });
    const activeRecordIds = pair.active.map((record) => record.recordId).sort(compareText);
    const conflict = activeLifecycles.length > 1;
    const onlyLifecycle = activeLifecycles[0];
    const platformSupport = isCanonicalPlatformSlug(pair.servingPlatform) ? "canonical" : "unsupported";
    const indexedPair = {
      pairIdentity,
      servingPlatform: pair.servingPlatform,
      modelId: pair.modelId,
      platformSupport,
      allRecordIds: pair.all.map((record) => record.recordId).sort(compareText),
      activeRecordIds,
      supersededRecordIds: pair.all.filter((record) => supersededRecordIdSet.has(record.recordId)).map((record) => record.recordId).sort(compareText),
      activeLifecycles,
      conflict,
      lexicalScanEligible: !conflict && onlyLifecycle !== undefined && onlyLifecycle.literalScanEligible,
      blockingJoinEligible: !conflict && onlyLifecycle !== undefined && platformSupport === "canonical"
    };
    modelPairs.push(indexedPair);
    if (conflict) {
      diagnostics.push({
        kind: "feed-conflict",
        pairIdentity,
        servingPlatform: pair.servingPlatform,
        modelId: pair.modelId,
        activeRecordIds,
        activeLifecycleSignatureIdentities: activeLifecycles.map((lifecycle) => lifecycle.signatureIdentity)
      });
    }
  }
  const modelPairByIdentity = new Map(modelPairs.map((pair) => [pair.pairIdentity, pair]));
  return {
    envelope,
    recordById,
    modelPairByIdentity,
    modelPairs,
    lexicalModelPairs: modelPairs.filter((pair) => pair.lexicalScanEligible),
    activeRecords,
    activeNonModelRecords: activeRecords.filter((record) => record.recordKind !== "model"),
    supersededRecordIds: [...supersededRecordIdSet].sort(compareText),
    diagnostics
  };
}
function getV3ModelPair(index, servingPlatform, modelId) {
  return index.modelPairByIdentity.get(modelPairIdentity(servingPlatform, modelId));
}
function canonicalJson(value) {
  if (value === null)
    return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      fail("$.adapterManifest", "must contain only finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (!isJsonObject(value)) {
    fail("$.adapterManifest", "must contain only JSON values");
  }
  const object = value;
  return `{${Object.keys(object).sort(compareText).map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
function normalizedRecordForDigest(record) {
  const supersedesRecordIds = [...record.supersedesRecordIds].sort(compareText);
  if (record.recordKind !== "model") {
    return { ...record, supersedesRecordIds };
  }
  const replacementModels = [...record.replacementModels].sort((left, right) => compareText(JSON.stringify([left.servingPlatform ?? null, left.modelId]), JSON.stringify([right.servingPlatform ?? null, right.modelId])));
  return { ...record, supersedesRecordIds, replacementModels };
}
function sha256(value) {
  return import_node_crypto2.createHash("sha256").update(value).digest("hex");
}
function computeV3FeedDigests(raw, index, adapterManifest) {
  const bytes = rawFeedBytes(raw);
  const { id, version } = index.envelope.adapter;
  const normalizedEnvelope = {
    ...index.envelope,
    adapter: { id, version },
    records: [...index.envelope.records].sort((left, right) => compareText(left.recordId, right.recordId)).map(normalizedRecordForDigest)
  };
  const activeRecords = index.activeRecords.map(normalizedRecordForDigest);
  return {
    sourceFeedSha256: sha256(bytes),
    normalizedFeedSha256: sha256(canonicalJson(normalizedEnvelope)),
    activeRecordsSha256: sha256(canonicalJson(activeRecords)),
    feedAdapterManifestSha256: sha256(canonicalJson({ adapter: { id, version }, manifest: adapterManifest }))
  };
}
function assertManifestMatchesAdapter(manifest, adapter) {
  if (manifest.id !== adapter.id || manifest.version !== adapter.version) {
    fail("$.adapter", `does not match reviewed manifest ${JSON.stringify(`${manifest.id}@${manifest.version}`)}`);
  }
}
function loadV3FeedJson(raw, options = {}) {
  const decoded = decodeFeedJson(raw);
  const envelope = validateV3Feed(decoded.value);
  const expectedAdapter = options.expectedAdapter;
  if (expectedAdapter !== undefined && (envelope.adapter.id !== expectedAdapter.id || envelope.adapter.version !== expectedAdapter.version)) {
    fail("$.adapter", `is not the approved producer ${JSON.stringify(`${expectedAdapter.id}@${expectedAdapter.version}`)}`);
  }
  if (options.adapterManifest !== undefined) {
    assertManifestMatchesAdapter(options.adapterManifest, envelope.adapter);
  }
  const index = indexValidatedFeed(envelope);
  return {
    index,
    digests: computeV3FeedDigests(decoded.bytes, index, options.adapterManifest ?? V3_TYPED_FEED_RUNTIME_MANIFEST)
  };
}
function loadAdaptedV3Feed(sourceBytes, envelopePayload, adapterManifest, additionalDiagnostics = []) {
  const bytes = rawFeedBytes(sourceBytes);
  const envelope = validateV3Feed(envelopePayload);
  assertManifestMatchesAdapter(adapterManifest, envelope.adapter);
  const sourceFeedSha256 = sha256(bytes);
  if (envelope.adapter.sourceSha256 !== sourceFeedSha256) {
    fail("$.adapter.sourceSha256", "must identify the exact immutable source bytes supplied to the reviewed adapter");
  }
  const indexed = indexValidatedFeed(envelope);
  const index = additionalDiagnostics.length === 0 ? indexed : {
    ...indexed,
    diagnostics: [...indexed.diagnostics, ...additionalDiagnostics]
  };
  return {
    index,
    digests: computeV3FeedDigests(bytes, index, adapterManifest)
  };
}

// src/policy/policy.ts
var import_yaml = __toESM(require_dist(), 1);

// src/shared/status.ts
var import_node_crypto3 = require("node:crypto");
var RESULT_RANK = {
  "no-actionable-risk": 0,
  advisory: 1,
  blocking: 2
};
var OUTCOME_RANK = {
  none: 0,
  notice: 1,
  warning: 2,
  breach: 3
};
var SCAN_RANK = {
  complete: 0,
  partial: 1,
  failed: 2
};
var HEALTH_RANK = {
  current: 0,
  "review-overdue": 1,
  stale: 2,
  expired: 3,
  invalid: 4
};
var EXIT_RANK = {
  none: 0,
  "notification-failed": 1,
  "partial-disallowed": 2,
  "policy-breach": 3,
  "trusted-base-unavailable": 4,
  "assessment-failed": 5
};
function strongerResult(left, right) {
  return RESULT_RANK[left] >= RESULT_RANK[right] ? left : right;
}
function compareResult(left, right) {
  return RESULT_RANK[left] - RESULT_RANK[right];
}
function strongerOutcome(left, right) {
  return OUTCOME_RANK[left] >= OUTCOME_RANK[right] ? left : right;
}
function compareOutcome(left, right) {
  return OUTCOME_RANK[left] - OUTCOME_RANK[right];
}
function combineScanStatus(...statuses) {
  let result = "complete";
  for (const status of statuses) {
    if (SCAN_RANK[status] > SCAN_RANK[result])
      result = status;
  }
  return result;
}
function combineEvidenceHealth(...statuses) {
  let result = "current";
  for (const status of statuses) {
    if (HEALTH_RANK[status] > HEALTH_RANK[result])
      result = status;
  }
  return result;
}
function chooseExitReason(...reasons) {
  let result = "none";
  for (const reason of reasons) {
    if (EXIT_RANK[reason] > EXIT_RANK[result])
      result = reason;
  }
  return result;
}
function daysUntilEarliestLifecycleDate(daysUntilShutdown, daysUntilDeprecation) {
  if (daysUntilShutdown === null)
    return null;
  return daysUntilDeprecation === null || daysUntilDeprecation === undefined ? daysUntilShutdown : Math.min(daysUntilDeprecation, daysUntilShutdown);
}
function earliestLifecycleDays(finding) {
  return daysUntilEarliestLifecycleDate(finding.daysUntilShutdown, finding.daysUntilDeprecation);
}
function deprecationLeadsHorizon(finding) {
  if (finding.deprecationDate === undefined)
    return false;
  return finding.daysUntilShutdown === null || (finding.daysUntilDeprecation ?? 0) < finding.daysUntilShutdown;
}
function resultFromFindings(findings) {
  let result = "no-actionable-risk";
  for (const finding of findings) {
    if (finding.outcome === "breach")
      result = strongerResult(result, "blocking");
    else if (finding.outcome === "warning")
      result = strongerResult(result, "advisory");
  }
  return result;
}
function compareText2(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function canonicalize(value) {
  if (Array.isArray(value))
    return value.map(canonicalize);
  if (value === null || typeof value !== "object")
    return value;
  const source = value;
  const result = {};
  for (const key of Object.keys(source).sort(compareText2)) {
    result[key] = canonicalize(source[key]);
  }
  return result;
}
function canonicalSha256(domain, value) {
  return import_node_crypto3.createHash("sha256").update(JSON.stringify([domain, canonicalize(value)]), "utf8").digest("hex");
}
function findingFingerprint(finding) {
  return canonicalSha256("ai-model-eol/finding/v3", {
    modelId: finding.modelId,
    servingPlatform: finding.servingPlatform,
    lifecycleStatus: finding.lifecycleStatus,
    shutdownDate: finding.shutdownDate ?? null,
    outcome: finding.outcome
  });
}
var SCOPES = [
  "application",
  "deployment",
  "test",
  "example",
  "documentation",
  "unknown"
];
var RESOLUTIONS = ["resolved", "dynamic", "unresolved"];
function buildCounts(evidence, findings, unresolved) {
  const byScope = Object.fromEntries(SCOPES.map((scope) => [scope, 0]));
  const byResolution = Object.fromEntries(RESOLUTIONS.map((resolution) => [resolution, 0]));
  for (const fact of evidence) {
    byScope[fact.scope] += 1;
    byResolution[fact.modelResolution] += 1;
  }
  return {
    evidence: evidence.length,
    findings: findings.length,
    blocking: findings.filter((finding) => finding.outcome === "breach").length,
    advisory: findings.filter((finding) => finding.outcome === "warning").length,
    notices: findings.filter((finding) => finding.outcome === "notice").length,
    unresolved: unresolved.length,
    byScope,
    byResolution
  };
}
function scanFingerprint(report) {
  return canonicalSha256("ai-model-eol/scan/v3", {
    event: report.event,
    scanStatus: report.scanStatus,
    diagnostics: report.diagnostics,
    evidenceIds: report.evidenceFacts.map((fact) => fact.evidenceId).sort(compareText2)
  });
}
function alertFingerprint(findings) {
  const actionableFindingFingerprints = new Set(findings.filter((finding) => finding.outcome === "breach" || finding.outcome === "warning").map(findingFingerprint));
  return canonicalSha256("ai-model-eol/alert/v3", [...actionableFindingFingerprints].sort(compareText2));
}

// src/detection/manifest.ts
var DETECTOR_MANIFEST_VERSION = "3.0.0-3";
var DETECTOR_QUALIFICATION = Object.freeze([
  Object.freeze({
    ecosystem: "npm",
    package: "openai",
    version: "6.49.0",
    sourceUrl: "https://www.npmjs.com/package/openai/v/6.49.0"
  }),
  Object.freeze({
    ecosystem: "pypi",
    package: "openai",
    version: "2.46.0",
    sourceUrl: "https://pypi.org/project/openai/2.46.0/"
  }),
  Object.freeze({
    ecosystem: "npm",
    package: "@anthropic-ai/sdk",
    version: "0.112.4",
    sourceUrl: "https://www.npmjs.com/package/@anthropic-ai/sdk/v/0.112.4"
  }),
  Object.freeze({
    ecosystem: "pypi",
    package: "anthropic",
    version: "0.117.0",
    sourceUrl: "https://pypi.org/project/anthropic/0.117.0/"
  }),
  Object.freeze({
    ecosystem: "npm",
    package: "@google/genai",
    version: "2.13.0",
    sourceUrl: "https://www.npmjs.com/package/@google/genai/v/2.13.0"
  }),
  Object.freeze({
    ecosystem: "pypi",
    package: "google-genai",
    version: "2.13.0",
    sourceUrl: "https://pypi.org/project/google-genai/2.13.0/"
  }),
  Object.freeze({
    ecosystem: "npm",
    package: "@aws-sdk/client-bedrock-runtime",
    version: "3.1096.0",
    sourceUrl: "https://www.npmjs.com/package/@aws-sdk/client-bedrock-runtime/v/3.1096.0"
  }),
  Object.freeze({
    ecosystem: "pypi",
    package: "boto3",
    version: "1.43.51",
    sourceUrl: "https://pypi.org/project/boto3/1.43.51/"
  }),
  Object.freeze({
    ecosystem: "terraform-provider",
    package: "hashicorp/azurerm",
    version: "4.79.0",
    sourceUrl: "https://registry.terraform.io/providers/hashicorp/azurerm/4.79.0"
  })
]);
var DETECTOR_RULES = Object.freeze([
  {
    ruleId: "source.ts.openai.request-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true
  },
  {
    ruleId: "source.py.openai.request-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: true
  },
  {
    ruleId: "source.ts.anthropic.messages-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true
  },
  {
    ruleId: "source.py.anthropic.messages-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: true
  },
  {
    ruleId: "source.ts.google-genai.generate-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: true
  },
  {
    ruleId: "source.py.google-genai.generate-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: true
  },
  {
    ruleId: "source.ts.aws-bedrock.invoke-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: false
  },
  {
    ruleId: "source.ts.aws-bedrock.converse-model@1",
    languages: ["javascript", "typescript"],
    confidence: "high",
    policyEligible: false
  },
  {
    ruleId: "source.py.aws-bedrock.invoke-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: false
  },
  {
    ruleId: "source.py.aws-bedrock.converse-model@1",
    languages: ["python"],
    confidence: "high",
    policyEligible: false
  },
  {
    ruleId: "deploy.hcl.azure.cognitive-deployment-model@1",
    languages: ["hcl"],
    confidence: "high",
    policyEligible: false
  },
  {
    ruleId: "binding.env.consumed-model@1",
    languages: ["dotenv"],
    confidence: "high",
    policyEligible: false
  },
  {
    ruleId: "binding.github-actions.consumed-model@1",
    languages: ["yaml"],
    confidence: "high",
    policyEligible: false
  },
  {
    ruleId: "fallback.text.lifecycle-id@1",
    languages: ["text"],
    confidence: "low",
    policyEligible: false
  }
]);
var DETECTOR_MANIFEST_SHA256 = canonicalSha256("ai-model-eol/detector-manifest/v3", {
  version: DETECTOR_MANIFEST_VERSION,
  rules: DETECTOR_RULES,
  qualification: DETECTOR_QUALIFICATION,
  providerAliasRegistry: []
});

// src/shared/limits.ts
var MAX_POLICY_DAYS = 36500;
var DEFAULT_MAX_FEED_AGE_DAYS = 30;

// src/policy/policy.ts
var POLICY_PATH = ".github/ai-model-lifecycle.yml";
var DEFAULT_WARN_WITHIN_DAYS = 180;
var MAX_POLICY_BYTES = 512 * 1024;
var MAX_RULES = 1000;
var MAX_TEXT = 4096;
var ID = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
var PLATFORM = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
var RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?Z$/;
var CANONICAL_PLATFORMS = new Set([
  "openai",
  "azure",
  "anthropic",
  "aws-bedrock",
  "google",
  "google-vertex",
  "cohere",
  "groq",
  "xai"
]);
var SCOPES2 = new Set([
  "application",
  "deployment",
  "test",
  "example",
  "documentation",
  "unknown"
]);
var ENVIRONMENTS = new Set([
  "production",
  "staging",
  "development",
  "test",
  "unknown"
]);
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function object(value, label) {
  if (!isObject(value))
    throw new Error(`${label} must be an object.`);
  return value;
}
function exactKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unsupported field(s): ${unknown.sort().join(", ")}.`);
  }
}
function text(value, label, max = MAX_TEXT) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must not have leading or trailing whitespace.`);
  }
  if ([...value].length > max) {
    throw new Error(`${label} must not exceed ${max} Unicode code points.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must not contain control characters.`);
  }
  return value;
}
function id(value, label) {
  const normalized = text(value, label, 128);
  if (!ID.test(normalized))
    throw new Error(`${label} has an invalid stable ID.`);
  return normalized;
}
function modelId(value, label) {
  return text(value, label, 256);
}
function platform(value, label) {
  const normalized = text(value, label, 63);
  if (!PLATFORM.test(normalized) || !CANONICAL_PLATFORMS.has(normalized)) {
    throw new Error(`${label} must be a registered canonical serving-platform slug.`);
  }
  return normalized;
}
function timestamp(value, label) {
  const normalized = text(value, label, 64);
  const match = RFC3339_UTC.exec(normalized);
  const parsed = Date.parse(normalized);
  if (match === null || Number.isNaN(parsed)) {
    throw new Error(`${label} must be an RFC 3339 UTC timestamp.`);
  }
  const instant = new Date(parsed);
  if (instant.getUTCFullYear() !== Number(match[1]) || instant.getUTCMonth() + 1 !== Number(match[2]) || instant.getUTCDate() !== Number(match[3]) || instant.getUTCHours() !== Number(match[4]) || instant.getUTCMinutes() !== Number(match[5]) || instant.getUTCSeconds() !== Number(match[6])) {
    throw new Error(`${label} must be a real RFC 3339 UTC instant.`);
  }
  return normalized;
}
function boolean(value, label, fallback) {
  if (value === undefined)
    return fallback;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean.`);
  return value;
}
function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_POLICY_DAYS) {
    throw new Error(`${label} must be an integer from 0 to ${MAX_POLICY_DAYS}.`);
  }
  return value;
}
function array(value, label, required = false) {
  if (value === undefined && !required)
    return [];
  if (!Array.isArray(value))
    throw new Error(`${label} must be an array.`);
  if (value.length > MAX_RULES)
    throw new Error(`${label} exceeds ${MAX_RULES} entries.`);
  return value;
}
function stringArray(value, label) {
  const values = array(value, label, true).map((entry, index) => text(entry, `${label}[${index}]`, 1024));
  if (values.length === 0)
    throw new Error(`${label} must not be empty.`);
  if (new Set(values).size !== values.length)
    throw new Error(`${label} contains duplicates.`);
  return values;
}
function validateRepositoryPattern(value, label) {
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((segment) => segment === "" || segment === "..") || /[!{}[\]]/.test(value)) {
    throw new Error(`${label} is not a valid root-anchored repository pattern.`);
  }
  for (const segment of value.split("/")) {
    if (segment.includes("**") && segment !== "**") {
      throw new Error(`${label} may use ** only as a complete path segment.`);
    }
  }
  return value;
}
function patterns(value, label) {
  return stringArray(value, label).map((entry, index) => validateRepositoryPattern(entry, `${label}[${index}]`));
}
function platformList(value, label) {
  return stringArray(value, label).map((entry, index) => platform(entry, `${label}[${index}]`)).sort();
}
function suppressionPatterns(value, label) {
  const result = patterns(value, label);
  if (result.some((pattern) => !/[^*?/]/u.test(pattern))) {
    throw new Error(`${label} must contain a bounded literal path component.`);
  }
  return result;
}
function ordered(values, label) {
  for (let index = 1;index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (Date.parse(previous[1]) > Date.parse(current[1])) {
      throw new Error(`${label} timestamp ordering is invalid at ${current[0]}.`);
    }
  }
}
function strictBefore(left, right, label) {
  if (Date.parse(left) >= Date.parse(right)) {
    throw new Error(`${label} requires the first timestamp to be strictly earlier.`);
  }
}
function parseAssertion(value, index) {
  const label = `assertions[${index}]`;
  const source = object(value, label);
  exactKeys(source, [
    "evidenceId",
    "modelId",
    "servingPlatform",
    "scope",
    "environment",
    "policyEligible",
    "reason",
    "provenance",
    "assertedAt",
    "reviewedAt",
    "reviewAfter",
    "expiresAt"
  ], label);
  const scope = text(source.scope, `${label}.scope`);
  if (!SCOPES2.has(scope))
    throw new Error(`${label}.scope is invalid.`);
  const environment = text(source.environment, `${label}.environment`);
  if (!ENVIRONMENTS.has(environment))
    throw new Error(`${label}.environment is invalid.`);
  const assertedAt = timestamp(source.assertedAt, `${label}.assertedAt`);
  const reviewedAt = timestamp(source.reviewedAt, `${label}.reviewedAt`);
  const reviewAfter = timestamp(source.reviewAfter, `${label}.reviewAfter`);
  const expiresAt = timestamp(source.expiresAt, `${label}.expiresAt`);
  ordered([
    ["assertedAt", assertedAt],
    ["reviewedAt", reviewedAt],
    ["reviewAfter", reviewAfter],
    ["expiresAt", expiresAt]
  ], label);
  strictBefore(reviewedAt, reviewAfter, `${label}.reviewedAt/reviewAfter`);
  return {
    evidenceId: id(source.evidenceId, `${label}.evidenceId`),
    modelId: modelId(source.modelId, `${label}.modelId`),
    servingPlatform: platform(source.servingPlatform, `${label}.servingPlatform`),
    scope,
    environment,
    policyEligible: boolean(source.policyEligible, `${label}.policyEligible`, false),
    reason: text(source.reason, `${label}.reason`),
    provenance: text(source.provenance, `${label}.provenance`),
    assertedAt,
    reviewedAt,
    reviewAfter,
    expiresAt
  };
}
function parseResolution(value, index) {
  const label = `resolutions[${index}]`;
  const source = object(value, label);
  exactKeys(source, ["resolutionId", "match", "resolveTo", "reason", "reviewedAt", "reviewAfter", "expiresAt"], label);
  const match = object(source.match, `${label}.match`);
  exactKeys(match, ["detectorRuleId", "rawValue", "paths"], `${label}.match`);
  const resolveTo = object(source.resolveTo, `${label}.resolveTo`);
  exactKeys(resolveTo, ["modelId", "servingPlatform"], `${label}.resolveTo`);
  const reviewedAt = timestamp(source.reviewedAt, `${label}.reviewedAt`);
  const reviewAfter = timestamp(source.reviewAfter, `${label}.reviewAfter`);
  const expiresAt = timestamp(source.expiresAt, `${label}.expiresAt`);
  ordered([
    ["reviewedAt", reviewedAt],
    ["reviewAfter", reviewAfter],
    ["expiresAt", expiresAt]
  ], label);
  strictBefore(reviewedAt, reviewAfter, `${label}.reviewedAt/reviewAfter`);
  return {
    resolutionId: id(source.resolutionId, `${label}.resolutionId`),
    match: {
      detectorRuleId: text(match.detectorRuleId, `${label}.match.detectorRuleId`, 256),
      rawValue: text(match.rawValue, `${label}.match.rawValue`, 1024),
      paths: patterns(match.paths, `${label}.match.paths`)
    },
    resolveTo: {
      modelId: modelId(resolveTo.modelId, `${label}.resolveTo.modelId`),
      servingPlatform: platform(resolveTo.servingPlatform, `${label}.resolveTo.servingPlatform`)
    },
    reason: text(source.reason, `${label}.reason`),
    reviewedAt,
    reviewAfter,
    expiresAt
  };
}
function parseScopeRule(value, index) {
  const label = `scopeRules[${index}]`;
  const source = object(value, label);
  exactKeys(source, ["scopeRuleId", "detectorRuleIds", "paths", "scope", "environment", "reason"], label);
  const scope = text(source.scope, `${label}.scope`);
  if (!SCOPES2.has(scope))
    throw new Error(`${label}.scope is invalid.`);
  const environment = text(source.environment, `${label}.environment`);
  if (!ENVIRONMENTS.has(environment))
    throw new Error(`${label}.environment is invalid.`);
  return {
    scopeRuleId: id(source.scopeRuleId, `${label}.scopeRuleId`),
    detectorRuleIds: stringArray(source.detectorRuleIds, `${label}.detectorRuleIds`),
    paths: patterns(source.paths, `${label}.paths`),
    scope,
    environment,
    reason: text(source.reason, `${label}.reason`)
  };
}
function parseSuppression(value, index) {
  const label = `suppressions[${index}]`;
  const source = object(value, label);
  exactKeys(source, ["suppressionId", "target", "reason", "createdAt", "expiresAt"], label);
  const target = object(source.target, `${label}.target`);
  const targetKeys = Object.keys(target);
  let parsedTarget;
  if (targetKeys.includes("evidenceId")) {
    exactKeys(target, ["evidenceId"], `${label}.target`);
    parsedTarget = { evidenceId: id(target.evidenceId, `${label}.target.evidenceId`) };
  } else {
    exactKeys(target, ["modelId", "servingPlatform", "detectorRuleIds", "paths"], `${label}.target`);
    parsedTarget = {
      modelId: modelId(target.modelId, `${label}.target.modelId`),
      servingPlatform: platform(target.servingPlatform, `${label}.target.servingPlatform`),
      detectorRuleIds: stringArray(target.detectorRuleIds, `${label}.target.detectorRuleIds`),
      paths: suppressionPatterns(target.paths, `${label}.target.paths`)
    };
  }
  const createdAt = timestamp(source.createdAt, `${label}.createdAt`);
  const expiresAt = timestamp(source.expiresAt, `${label}.expiresAt`);
  strictBefore(createdAt, expiresAt, `${label}.createdAt/expiresAt`);
  return {
    suppressionId: id(source.suppressionId, `${label}.suppressionId`),
    target: parsedTarget,
    reason: text(source.reason, `${label}.reason`),
    createdAt,
    expiresAt
  };
}
function uniqueIds(values, label) {
  const seen = new Set;
  for (const value of values) {
    if (seen.has(value))
      throw new Error(`${label} contains duplicate ID ${value}.`);
    seen.add(value);
  }
}
function defaultPolicy() {
  return {
    warnWithinDays: DEFAULT_WARN_WITHIN_DAYS,
    failWithinDays: null,
    allowPartial: false,
    servingPlatforms: [],
    usageEvidenceFiles: [],
    assertions: [],
    resolutions: [],
    scopeRules: [],
    suppressions: []
  };
}
function parsePolicyPayload(payload) {
  const root = object(payload, "Policy document");
  exactKeys(root, [
    "schemaVersion",
    "policy",
    "servingPlatforms",
    "usageEvidenceFiles",
    "assertions",
    "resolutions",
    "scopeRules",
    "suppressions"
  ], "Policy document");
  if (root.schemaVersion !== 1)
    throw new Error("Policy document schemaVersion must be 1.");
  const policy = defaultPolicy();
  if (root.policy !== undefined) {
    const source = object(root.policy, "policy");
    exactKeys(source, ["warnWithinDays", "failWithinDays", "allowPartial"], "policy");
    if (source.warnWithinDays !== undefined) {
      policy.warnWithinDays = integer(source.warnWithinDays, "policy.warnWithinDays");
    }
    if (source.failWithinDays !== undefined && source.failWithinDays !== null) {
      policy.failWithinDays = integer(source.failWithinDays, "policy.failWithinDays");
    }
    policy.allowPartial = boolean(source.allowPartial, "policy.allowPartial", false);
  }
  if (root.servingPlatforms !== undefined) {
    policy.servingPlatforms = platformList(root.servingPlatforms, "servingPlatforms");
  }
  if (root.usageEvidenceFiles !== undefined) {
    policy.usageEvidenceFiles = patterns(root.usageEvidenceFiles, "usageEvidenceFiles");
  }
  policy.assertions = array(root.assertions, "assertions").map(parseAssertion);
  policy.resolutions = array(root.resolutions, "resolutions").map(parseResolution);
  policy.scopeRules = array(root.scopeRules, "scopeRules").map(parseScopeRule);
  policy.suppressions = array(root.suppressions, "suppressions").map(parseSuppression);
  uniqueIds(policy.assertions.map((entry) => entry.evidenceId), "assertions");
  uniqueIds(policy.resolutions.map((entry) => entry.resolutionId), "resolutions");
  uniqueIds(policy.scopeRules.map((entry) => entry.scopeRuleId), "scopeRules");
  uniqueIds(policy.suppressions.map((entry) => entry.suppressionId), "suppressions");
  return policy;
}
function inspectPolicy(textValue) {
  if (textValue === undefined) {
    return {
      policy: defaultPolicy(),
      present: false,
      valid: true,
      digest: canonicalSha256("ai-model-eol/policy-document/v3", null),
      diagnostics: [],
      rawAssertionIds: []
    };
  }
  if (Buffer.byteLength(textValue, "utf8") > MAX_POLICY_BYTES) {
    return invalidInspection(`Policy document exceeds ${MAX_POLICY_BYTES} bytes.`, textValue);
  }
  try {
    const document = import_yaml.parseDocument(textValue, {
      schema: "core",
      uniqueKeys: true,
      prettyErrors: false,
      strict: true
    });
    if (document.errors.length > 0) {
      throw new Error(document.errors.map((error) => error.message).join("; "));
    }
    if (document.warnings.length > 0) {
      throw new Error(document.warnings.map((warning) => warning.message).join("; "));
    }
    const payload = document.toJS({ maxAliasCount: 0 });
    const policy = parsePolicyPayload(payload);
    return {
      policy,
      present: true,
      valid: true,
      digest: canonicalSha256("ai-model-eol/policy-document/v3", payload),
      diagnostics: [],
      rawAssertionIds: policy.assertions.map((entry) => entry.evidenceId).sort()
    };
  } catch (error) {
    return invalidInspection(error instanceof Error ? error.message : String(error), textValue);
  }
}
function invalidInspection(message, source) {
  return {
    policy: defaultPolicy(),
    present: true,
    valid: false,
    digest: canonicalSha256("ai-model-eol/policy-document/v3", source),
    diagnostics: [
      {
        code: "invalid-policy",
        message,
        path: POLICY_PATH,
        severity: "failed"
      }
    ],
    rawAssertionIds: []
  };
}
function applyTrustedInputs(policy, inputs) {
  return {
    ...policy,
    warnWithinDays: inputs.warnWithinDays ?? policy.warnWithinDays,
    failWithinDays: inputs.failWithinDays ?? policy.failWithinDays,
    allowPartial: inputs.allowPartial ?? policy.allowPartial
  };
}
function appendUniqueById(base, proposed, identity) {
  const result = [...base];
  const serialized = new Set(base.map((value) => JSON.stringify(value)));
  for (const value of proposed) {
    const exact = JSON.stringify(value);
    if (!serialized.has(exact)) {
      result.push(value);
      serialized.add(exact);
    }
  }
  return result.sort((left, right) => {
    const leftId = identity(left);
    const rightId = identity(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}
function monotonicPolicy(base, proposed) {
  const failWithinDays = base.failWithinDays === null ? proposed.failWithinDays : proposed.failWithinDays === null ? base.failWithinDays : Math.max(base.failWithinDays, proposed.failWithinDays);
  const servingPlatforms = base.servingPlatforms.length === 0 || proposed.servingPlatforms.length === 0 ? [] : [...new Set([...base.servingPlatforms, ...proposed.servingPlatforms])].sort();
  return {
    warnWithinDays: Math.max(base.warnWithinDays, proposed.warnWithinDays),
    failWithinDays,
    allowPartial: base.allowPartial && proposed.allowPartial,
    servingPlatforms,
    usageEvidenceFiles: [...new Set([...base.usageEvidenceFiles, ...proposed.usageEvidenceFiles])].sort(),
    assertions: appendUniqueById(base.assertions, proposed.assertions, (entry) => entry.evidenceId),
    resolutions: appendUniqueById(base.resolutions, proposed.resolutions, (entry) => entry.resolutionId),
    scopeRules: appendUniqueById(base.scopeRules, proposed.scopeRules, (entry) => entry.scopeRuleId),
    suppressions: [...base.suppressions]
  };
}
function policyDiff(base, target, inputs) {
  const changes = [];
  if (base.digest !== target.digest)
    changes.push("Checked-in policy/configuration changed.");
  if (!target.valid)
    changes.push("Target policy/configuration is invalid and was not trusted.");
  if (inputs.warnWithinDays !== null) {
    changes.push(`Action input proposes warnWithinDays=${inputs.warnWithinDays}.`);
  }
  if (inputs.failWithinDays !== null) {
    changes.push(`Action input proposes failWithinDays=${inputs.failWithinDays}.`);
  }
  if (inputs.allowPartial !== null) {
    changes.push(`Action input proposes allowPartial=${String(inputs.allowPartial)}.`);
  }
  return changes;
}
function globSegment(pattern, value) {
  let expression = "^";
  for (const character of pattern) {
    if (character === "*")
      expression += "[^/]*";
    else if (character === "?")
      expression += "[^/]";
    else
      expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`${expression}$`, "u").test(value);
}
function matchRepositoryPattern(pattern, path) {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  const memo = new Map;
  const visit = (patternIndex, pathIndex) => {
    const key = `${patternIndex}:${pathIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined)
      return cached;
    let result;
    if (patternIndex === patternSegments.length)
      result = pathIndex === pathSegments.length;
    else if (patternSegments[patternIndex] === "**") {
      result = visit(patternIndex + 1, pathIndex) || pathIndex < pathSegments.length && visit(patternIndex, pathIndex + 1);
    } else {
      result = pathIndex < pathSegments.length && globSegment(patternSegments[patternIndex], pathSegments[pathIndex]) && visit(patternIndex + 1, pathIndex + 1);
    }
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
}
function assertionHealth(assertion, now) {
  if (now >= Date.parse(assertion.expiresAt))
    return "expired";
  if (now >= Date.parse(assertion.reviewAfter))
    return "review-overdue";
  return "current";
}
function assertionsToEvidence(assertions, now) {
  let health = "current";
  const diagnostics = [];
  const facts = assertions.map((assertion) => {
    const currentHealth = assertionHealth(assertion, now);
    health = combineEvidenceHealth(health, currentHealth);
    if (currentHealth !== "current") {
      diagnostics.push({
        code: `assertion-${currentHealth}`,
        message: `Assertion ${assertion.evidenceId} is ${currentHealth}.`,
        path: POLICY_PATH,
        severity: "partial"
      });
    }
    return {
      evidenceId: assertion.evidenceId,
      origin: "manual-claim",
      kind: "manual-claim",
      confidence: "high",
      scope: assertion.scope,
      environment: assertion.environment,
      detectorRuleId: "claim.manual.assertion@1",
      detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
      rawValue: assertion.modelId,
      modelId: assertion.modelId,
      servingPlatform: assertion.servingPlatform,
      modelResolution: "resolved",
      selectorKind: "model-id",
      platformResolution: "resolved",
      policyEligible: assertion.policyEligible && currentHealth === "current",
      locations: [{ path: POLICY_PATH, line: 1, column: 1 }],
      resolutionTrace: [{ kind: "detector", detail: "checked-in manual assertion" }],
      evidenceHealth: currentHealth,
      reason: assertion.reason,
      provenance: assertion.provenance
    };
  });
  return { facts, health, diagnostics };
}

// src/policy/evaluate.ts
var TRUSTED_RESOLUTION_POLICY_RULES = new Set([
  "source.ts.openai.request-model@1",
  "source.py.openai.request-model@1",
  "source.ts.anthropic.messages-model@1",
  "source.py.anthropic.messages-model@1",
  "source.ts.google-genai.generate-model@1",
  "source.py.google-genai.generate-model@1",
  "source.ts.aws-bedrock.invoke-model@1",
  "source.ts.aws-bedrock.converse-model@1",
  "source.py.aws-bedrock.invoke-model@1",
  "source.py.aws-bedrock.converse-model@1",
  "deploy.hcl.azure.cognitive-deployment-model@1"
]);
function compareText3(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function calendarDaysUntil(date, now) {
  const evaluated = new Date(now);
  const evaluatedDay = Date.UTC(evaluated.getUTCFullYear(), evaluated.getUTCMonth(), evaluated.getUTCDate());
  const [year, month, day] = date.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - evaluatedDay) / 86400000);
}
function currentResolution(rule, now) {
  if (now >= Date.parse(rule.expiresAt))
    return "expired";
  if (now >= Date.parse(rule.reviewAfter))
    return "review-overdue";
  return "current";
}
function pathsForFact(fact) {
  return [...new Set(fact.locations.map((location) => location.path))];
}
function resolutionMatches(rule, fact) {
  return rule.match.detectorRuleId === fact.detectorRuleId && rule.match.rawValue === fact.rawValue && pathsForFact(fact).some((path) => rule.match.paths.some((pattern) => matchRepositoryPattern(pattern, path)));
}
function applyResolutions(evidence, policy, now) {
  const diagnostics = [];
  let scanStatus = "complete";
  for (const resolution of policy.resolutions) {
    const health = currentResolution(resolution, now);
    if (health !== "current") {
      scanStatus = "partial";
      diagnostics.push({
        code: `resolution-${health}`,
        message: `Resolution ${resolution.resolutionId} is ${health} and was not applied.`,
        path: ".github/ai-model-lifecycle.yml",
        severity: "partial"
      });
    }
  }
  const resolvedEvidence = evidence.map((original) => {
    let fact = {
      ...original,
      locations: [...original.locations],
      resolutionTrace: [...original.resolutionTrace]
    };
    const matches = policy.resolutions.filter((rule) => currentResolution(rule, now) === "current" && resolutionMatches(rule, fact));
    const pairs = new Map(matches.map((rule) => [
      JSON.stringify([rule.resolveTo.servingPlatform, rule.resolveTo.modelId]),
      rule
    ]));
    if (pairs.size === 1) {
      const rule = pairs.values().next().value;
      if (rule !== undefined) {
        fact = {
          ...fact,
          modelId: rule.resolveTo.modelId,
          servingPlatform: rule.resolveTo.servingPlatform,
          modelResolution: "resolved",
          selectorKind: "model-id",
          platformResolution: "resolved",
          policyEligible: fact.origin === "repository" && TRUSTED_RESOLUTION_POLICY_RULES.has(fact.detectorRuleId) && fact.confidence === "high" && fact.scope !== "test" && fact.scope !== "example" && fact.scope !== "documentation",
          resolutionTrace: [
            ...fact.resolutionTrace,
            { kind: "policy-resolution", detail: rule.resolutionId }
          ]
        };
      }
    } else if (pairs.size > 1) {
      fact = {
        ...fact,
        modelResolution: "unresolved",
        platformResolution: "ambiguous",
        policyEligible: false,
        resolutionTrace: [
          ...fact.resolutionTrace,
          { kind: "policy-resolution", detail: "conflicting trusted resolutions" }
        ]
      };
      diagnostics.push({
        code: "conflicting-resolutions",
        message: `Conflicting current resolutions match evidence ${fact.evidenceId}.`,
        ...fact.locations[0]?.path === undefined ? {} : { path: fact.locations[0].path },
        severity: "partial"
      });
      scanStatus = "partial";
    }
    return fact;
  });
  for (const resolution of policy.resolutions) {
    if (!evidence.some((fact) => resolutionMatches(resolution, fact))) {
      diagnostics.push({
        code: "unused-resolution",
        message: `Resolution ${resolution.resolutionId} did not match evidence in this tree.`,
        path: ".github/ai-model-lifecycle.yml",
        severity: "notice"
      });
    }
  }
  return { evidence: resolvedEvidence, diagnostics, scanStatus };
}
var PROTECTED_SCOPES = new Set(["documentation", "test", "example"]);
var REPOSITORY_BLOCKING_KINDS = new Set([
  "sdk-argument",
  "structured-config",
  "deployment-resource"
]);
function originAndKindCanBlock(fact) {
  if (fact.origin === "repository")
    return REPOSITORY_BLOCKING_KINDS.has(fact.kind);
  if (fact.origin === "manual-claim")
    return fact.kind === "manual-claim";
  return fact.kind === "runtime-observation" || fact.kind === "deployment-snapshot";
}
function scopeRuleStrength(scope, environment) {
  const scopeRank = {
    documentation: 0,
    example: 1,
    test: 2,
    unknown: 3,
    application: 4,
    deployment: 5
  };
  const environmentRank = {
    unknown: 0,
    test: 1,
    development: 2,
    staging: 3,
    production: 4
  };
  return scopeRank[scope] * 10 + environmentRank[environment];
}
function applyScopeRules(evidence, policy, diagnostics) {
  return evidence.map((original) => {
    const applicable = [];
    for (const rule of policy.scopeRules) {
      if (!rule.detectorRuleIds.includes(original.detectorRuleId))
        continue;
      if (!pathsForFact(original).some((path) => rule.paths.some((pattern) => matchRepositoryPattern(pattern, path)))) {
        continue;
      }
      if (PROTECTED_SCOPES.has(original.scope) && !PROTECTED_SCOPES.has(rule.scope)) {
        diagnostics.push({
          code: "protected-scope-promotion-ignored",
          message: `Scope rule ${rule.scopeRuleId} cannot promote ${original.scope} evidence.`,
          ...original.locations[0]?.path === undefined ? {} : { path: original.locations[0].path },
          severity: "notice"
        });
        continue;
      }
      applicable.push({ scope: rule.scope, environment: rule.environment });
    }
    if (applicable.length === 0)
      return original;
    applicable.sort((left, right) => {
      const strength = scopeRuleStrength(right.scope, right.environment) - scopeRuleStrength(left.scope, left.environment);
      return strength || compareText3(left.scope, right.scope) || compareText3(left.environment, right.environment);
    });
    const selected = applicable[0];
    return { ...original, ...selected };
  });
}
function suppressionMatches(suppression, fact, modelId2, servingPlatform) {
  const target = suppression.target;
  if ("evidenceId" in target) {
    return target.evidenceId === fact.evidenceId;
  }
  return target.modelId === modelId2 && target.servingPlatform === servingPlatform && target.detectorRuleIds.includes(fact.detectorRuleId) && pathsForFact(fact).some((path) => target.paths.some((pattern) => matchRepositoryPattern(pattern, path)));
}
function dayPhrase(subject, days) {
  if (days < 0)
    return `${subject} was ${Math.abs(days)} UTC calendar day(s) ago`;
  if (days === 0)
    return `${subject} is today`;
  return `${subject} is ${days} UTC calendar day(s) away`;
}
function horizonReason(daysUntilShutdown, daysUntilDeprecation) {
  if (daysUntilShutdown === null) {
    return daysUntilDeprecation === null ? "The joined lifecycle record has no published shutdown date." : `The joined lifecycle record has no published shutdown date; ${dayPhrase("deprecation", daysUntilDeprecation)}.`;
  }
  if (daysUntilDeprecation === null || daysUntilDeprecation >= daysUntilShutdown) {
    return `${dayPhrase("Shutdown", daysUntilShutdown)}.`;
  }
  return `${dayPhrase("Deprecation", daysUntilDeprecation)}; ${dayPhrase("shutdown", daysUntilShutdown)}.`;
}
function policyOutcome(input) {
  const { fact, pair, lifecycle, policy, exactPlatform } = input;
  const daysUntilShutdown = lifecycle.shutdownDate === null ? null : calendarDaysUntil(lifecycle.shutdownDate, input.now);
  const daysUntilDeprecation = lifecycle.deprecationDate === null ? null : calendarDaysUntil(lifecycle.deprecationDate, input.now);
  const reasons = [];
  const scopeEligible = fact.scope === "application" || fact.scope === "deployment";
  const protectedOrUnknown = fact.scope === "documentation" || fact.scope === "test" || fact.scope === "example" || fact.scope === "unknown";
  const daysUntilLifecycle = daysUntilEarliestLifecycleDate(daysUntilShutdown, daysUntilDeprecation);
  const insideWarning = daysUntilLifecycle === null || daysUntilLifecycle <= policy.warnWithinDays;
  let outcome = "none";
  if (insideWarning) {
    if (fact.kind === "lexical") {
      outcome = scopeEligible ? "warning" : "notice";
      reasons.push(scopeEligible ? "Exact typed-feed ID appears in application/deployment text; lexical evidence cannot block." : "Exact typed-feed ID appears only in protected or unknown-scope text.");
    } else if (scopeEligible || fact.origin !== "repository") {
      outcome = "warning";
      reasons.push(horizonReason(daysUntilShutdown, daysUntilDeprecation));
    } else if (protectedOrUnknown) {
      outcome = "notice";
      reasons.push("Evidence is outside an actionable application/deployment scope.");
    }
  } else {
    outcome = "notice";
    reasons.push("Lifecycle date is outside the warning horizon.");
  }
  if (pair.conflict) {
    if (outcome === "notice" || outcome === "none")
      outcome = "warning";
    reasons.push("The feed has conflicting active lifecycle signatures for this exact pair.");
  }
  const breachEligible = policy.failWithinDays !== null && daysUntilShutdown !== null && daysUntilShutdown <= policy.failWithinDays && originAndKindCanBlock(fact) && fact.policyEligible && fact.confidence === "high" && (fact.scope === "deployment" || fact.scope === "application" && fact.environment === "production") && fact.modelResolution === "resolved" && fact.platformResolution === "resolved" && fact.selectorKind === "model-id" && exactPlatform && pair.blockingJoinEligible && !pair.conflict && (fact.evidenceHealth === undefined || fact.evidenceHealth === "current");
  if (breachEligible) {
    outcome = "breach";
    reasons.push(`Definite evidence breaches failWithinDays=${policy.failWithinDays}.`);
  }
  return { outcome, daysUntilShutdown, daysUntilDeprecation, reasons };
}
function strongestScope(left, right) {
  const rank = {
    documentation: 0,
    test: 0,
    example: 0,
    unknown: 1,
    application: 2,
    deployment: 3
  };
  return rank[left] >= rank[right] ? left : right;
}
function strongestEnvironment(left, right) {
  const rank = {
    unknown: 0,
    test: 1,
    development: 2,
    staging: 3,
    production: 4
  };
  return rank[left] >= rank[right] ? left : right;
}
function strongestConfidence(left, right) {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[left] >= rank[right] ? left : right;
}
function compareLocation(left, right) {
  return compareText3(left.path, right.path) || left.line - right.line || left.column - right.column || (left.endLine ?? 0) - (right.endLine ?? 0) || (left.endColumn ?? 0) - (right.endColumn ?? 0);
}
function lifecycleFinding(fact, pair, lifecycle, policy, now, exactPlatform) {
  const evaluated = policyOutcome({ fact, pair, lifecycle, policy, now, exactPlatform });
  const semanticKey = JSON.stringify([
    pair.servingPlatform,
    pair.modelId,
    lifecycle.signatureIdentity
  ]);
  return {
    findingId: canonicalSha256("ai-model-eol/lifecycle-finding/v3", semanticKey),
    semanticKey,
    evidenceIds: [fact.evidenceId],
    modelId: pair.modelId,
    servingPlatform: pair.servingPlatform,
    servingPlatforms: [pair.servingPlatform],
    lifecycleMatch: "exact",
    lifecycleStatus: lifecycle.lifecycleStatus,
    ...lifecycle.announcementDate === null ? {} : { announcementDate: lifecycle.announcementDate },
    ...lifecycle.deprecationDate === null ? {} : { deprecationDate: lifecycle.deprecationDate },
    ...lifecycle.shutdownDate === null ? {} : { shutdownDate: lifecycle.shutdownDate },
    daysUntilShutdown: evaluated.daysUntilShutdown,
    ...evaluated.daysUntilDeprecation === null ? {} : { daysUntilDeprecation: evaluated.daysUntilDeprecation },
    replacementModels: lifecycle.provenance.flatMap((entry) => [...entry.replacementModels]),
    sourceUrls: [...lifecycle.primarySourceUrls],
    feedConflict: pair.conflict,
    outcome: evaluated.outcome,
    reasons: evaluated.reasons,
    scope: fact.scope,
    environment: fact.environment,
    confidence: fact.confidence,
    selectorKind: fact.selectorKind,
    locations: [...fact.locations]
  };
}
function mergeReplacementModels(replacements) {
  return [
    ...new Map(replacements.map((replacement) => [
      JSON.stringify([replacement.servingPlatform ?? null, replacement.modelId]),
      replacement
    ])).values()
  ].sort((left, right) => compareText3(left.servingPlatform ?? "", right.servingPlatform ?? "") || compareText3(left.modelId, right.modelId));
}
function platformIsProven(fact) {
  return fact.platformResolution === "resolved" && fact.kind !== "lexical";
}
function compareAmbiguousCandidate(left, right) {
  const leftDays = earliestLifecycleDays(left);
  const rightDays = earliestLifecycleDays(right);
  return compareOutcome(right.outcome, left.outcome) || (leftDays === null ? 1 : 0) - (rightDays === null ? 1 : 0) || (leftDays ?? 0) - (rightDays ?? 0) || compareText3(left.servingPlatform, right.servingPlatform) || compareText3(left.semanticKey, right.semanticKey);
}
function collapseAmbiguousCandidates(candidates, restrictedTo) {
  const ordered2 = [...candidates].sort(compareAmbiguousCandidate);
  const representative = ordered2[0];
  const servingPlatforms = [
    ...new Set(ordered2.map((candidate) => candidate.servingPlatform))
  ].sort(compareText3);
  const semanticKey = JSON.stringify([
    "ambiguous-platform",
    servingPlatforms,
    representative.semanticKey
  ]);
  const reasons = [
    ...representative.reasons,
    servingPlatforms.length === 1 ? "Serving platform is ambiguous; this match cannot block." : `Serving platform is ambiguous across ${servingPlatforms.join(", ")}; the most urgent of their lifecycle records is reported and this match cannot block.`,
    ...restrictedTo.length === 0 ? [] : [`Matching was restricted to the declared serving platform(s): ${restrictedTo.join(", ")}.`]
  ];
  return {
    ...representative,
    findingId: canonicalSha256("ai-model-eol/lifecycle-finding/v3", semanticKey),
    semanticKey,
    servingPlatforms,
    outcome: ordered2.reduce((strongest, candidate) => strongerOutcome(strongest, candidate.outcome), "none"),
    feedConflict: ordered2.some((candidate) => candidate.feedConflict),
    sourceUrls: [...new Set(ordered2.flatMap((candidate) => candidate.sourceUrls))].sort(compareText3),
    replacementModels: mergeReplacementModels(ordered2.flatMap((candidate) => candidate.replacementModels)),
    reasons
  };
}
function joinFact(fact, feed, policy, now) {
  if (fact.modelResolution !== "resolved" || fact.modelId === undefined)
    return [];
  let pairs = [];
  let exactPlatform = false;
  if (fact.platformResolution === "resolved" && fact.servingPlatform !== undefined) {
    const pair = getV3ModelPair(feed, fact.servingPlatform, fact.modelId);
    if (pair !== undefined)
      pairs = [pair];
    exactPlatform = true;
  } else if (fact.platformResolution === "ambiguous") {
    pairs = feed.modelPairs.filter((pair) => pair.modelId === fact.modelId);
  }
  const restrictedTo = policy.servingPlatforms.length > 0 && !platformIsProven(fact) ? policy.servingPlatforms : [];
  if (restrictedTo.length > 0) {
    const declared = new Set(restrictedTo);
    pairs = pairs.filter((pair) => declared.has(pair.servingPlatform));
  }
  const findings = [];
  for (const pair of pairs) {
    for (const lifecycle of pair.activeLifecycles) {
      const finding = lifecycleFinding(fact, pair, lifecycle, policy, now, exactPlatform);
      if (!exactPlatform && finding.outcome === "breach")
        finding.outcome = "warning";
      findings.push(finding);
    }
  }
  if (exactPlatform || findings.length === 0)
    return findings;
  return [collapseAmbiguousCandidates(findings, restrictedTo)];
}
function aggregateFindings(findings) {
  const byKey = new Map;
  for (const finding of [...findings].sort((left, right) => compareText3(left.evidenceIds[0] ?? "", right.evidenceIds[0] ?? "") || compareText3(left.semanticKey, right.semanticKey))) {
    const existing = byKey.get(finding.semanticKey);
    if (existing === undefined) {
      byKey.set(finding.semanticKey, {
        ...finding,
        evidenceIds: [...finding.evidenceIds],
        servingPlatforms: [...finding.servingPlatforms],
        replacementModels: [...finding.replacementModels],
        sourceUrls: [...finding.sourceUrls],
        reasons: [...finding.reasons],
        locations: [...finding.locations]
      });
      continue;
    }
    existing.outcome = strongerOutcome(existing.outcome, finding.outcome);
    existing.servingPlatforms = [
      ...new Set([...existing.servingPlatforms, ...finding.servingPlatforms])
    ].sort(compareText3);
    existing.evidenceIds = [...new Set([...existing.evidenceIds, ...finding.evidenceIds])].sort(compareText3);
    existing.sourceUrls = [...new Set([...existing.sourceUrls, ...finding.sourceUrls])].sort(compareText3);
    existing.reasons = [...new Set([...existing.reasons, ...finding.reasons])].sort(compareText3);
    existing.locations = [...existing.locations, ...finding.locations].sort(compareLocation).slice(0, 20);
    existing.replacementModels = mergeReplacementModels([
      ...existing.replacementModels,
      ...finding.replacementModels
    ]);
    existing.scope = strongestScope(existing.scope, finding.scope);
    existing.environment = strongestEnvironment(existing.environment, finding.environment);
    existing.confidence = strongestConfidence(existing.confidence, finding.confidence);
    if (existing.suppressedBy !== finding.suppressedBy)
      delete existing.suppressedBy;
  }
  return [...byKey.values()].sort((left, right) => {
    const daysLeft = earliestLifecycleDays(left) ?? Number.MAX_SAFE_INTEGER;
    const daysRight = earliestLifecycleDays(right) ?? Number.MAX_SAFE_INTEGER;
    return daysLeft - daysRight || compareText3(left.semanticKey, right.semanticKey);
  });
}
function applySuppressions(findings, evidenceById, policy, now, diagnostics) {
  const current = policy.suppressions.filter((suppression) => {
    if (now < Date.parse(suppression.expiresAt))
      return true;
    diagnostics.push({
      code: "suppression-expired",
      message: `Suppression ${suppression.suppressionId} expired and was not applied.`,
      path: ".github/ai-model-lifecycle.yml",
      severity: "notice"
    });
    return false;
  });
  for (const finding of findings) {
    for (const suppression of current) {
      const matched = finding.evidenceIds.some((evidenceId) => {
        const fact = evidenceById.get(evidenceId);
        return fact !== undefined && finding.servingPlatforms.some((servingPlatform) => suppressionMatches(suppression, fact, finding.modelId, servingPlatform));
      });
      if (matched) {
        finding.suppressedBy = suppression.suppressionId;
        finding.outcome = "none";
        finding.reasons.push(`Suppressed by ${suppression.suppressionId}.`);
        break;
      }
    }
  }
}
function evidenceHealth(evidence) {
  return combineEvidenceHealth(...evidence.map((fact) => fact.evidenceHealth ?? "current"));
}
function unresolvedIsAdvisory(fact) {
  return fact.kind !== "lexical" && fact.confidence !== "low" && (fact.scope === "application" || fact.scope === "deployment");
}
function evaluateEvidence(input) {
  const diagnostics = [...input.diagnostics ?? []];
  if (input.policy.servingPlatforms.length > 0) {
    diagnostics.push({
      code: "declared-serving-platforms",
      message: `Lifecycle matching for lexical and platform-ambiguous evidence is restricted to the declared serving platform(s): ${input.policy.servingPlatforms.join(", ")}.`,
      path: POLICY_PATH,
      severity: "notice"
    });
  }
  const orderedEvidence = [...input.evidence].sort((left, right) => compareText3(left.evidenceId, right.evidenceId));
  const resolved = applyResolutions(orderedEvidence, input.policy, input.now);
  diagnostics.push(...resolved.diagnostics);
  const scoped = applyScopeRules(resolved.evidence, input.policy, diagnostics);
  const unresolved = scoped.filter((fact) => fact.modelResolution !== "resolved" || fact.platformResolution !== "resolved" || fact.selectorKind !== "model-id" || fact.modelId === undefined || fact.servingPlatform === undefined);
  const rawFindings = scoped.flatMap((fact) => joinFact(fact, input.feed, input.policy, input.now));
  const evidenceById = new Map(scoped.map((fact) => [fact.evidenceId, fact]));
  applySuppressions(rawFindings, evidenceById, input.policy, input.now, diagnostics);
  const findings = aggregateFindings(rawFindings);
  let result = resultFromFindings(findings);
  const health = evidenceHealth(scoped);
  if (result === "no-actionable-risk" && (unresolved.some(unresolvedIsAdvisory) || health !== "current")) {
    result = "advisory";
  }
  return {
    result,
    scanStatus: input.scanStatus === "partial" || resolved.scanStatus === "partial" || health !== "current" ? "partial" : "complete",
    evidence: scoped,
    findings,
    unresolved,
    diagnostics,
    evidenceHealth: health
  };
}

// src/policy/comparison.ts
function compareText4(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function immutableClaimIdentity(fact) {
  return JSON.stringify([
    fact.origin,
    fact.kind,
    fact.modelId ?? null,
    fact.servingPlatform ?? null,
    fact.scope,
    fact.environment,
    fact.sourceId ?? null
  ]);
}
function assertionById(claims) {
  return new Map(claims.policy.policy.assertions.map((assertion) => [assertion.evidenceId, assertion]));
}
function assertionRefreshAccepted(base, target) {
  return JSON.stringify([
    base.evidenceId,
    base.modelId,
    base.servingPlatform,
    base.scope,
    base.environment,
    base.assertedAt
  ]) === JSON.stringify([
    target.evidenceId,
    target.modelId,
    target.servingPlatform,
    target.scope,
    target.environment,
    target.assertedAt
  ]) && Date.parse(target.reviewedAt) > Date.parse(base.reviewedAt) && Date.parse(target.reviewAfter) > Date.parse(base.reviewAfter) && Date.parse(target.expiresAt) > Date.parse(base.expiresAt);
}
function documentsBySource(claims) {
  const documents = claims.evidenceDocuments.filter((document) => document.valid && document.sourceId !== undefined);
  const counts = new Map;
  for (const document of documents) {
    counts.set(document.sourceId, (counts.get(document.sourceId) ?? 0) + 1);
  }
  return new Map(documents.filter((document) => counts.get(document.sourceId) === 1).map((document) => [document.sourceId, document]));
}
function externalRefreshAccepted(base, target) {
  return base.sourceId === target.sourceId && base.sourceKind === target.sourceKind && base.sourceEnvironment === target.sourceEnvironment && base.lineageIdentity === target.lineageIdentity && base.sourceVersionTime !== undefined && target.sourceVersionTime !== undefined && base.freshnessBoundary !== undefined && target.freshnessBoundary !== undefined && base.expiresAt !== undefined && target.expiresAt !== undefined && Date.parse(target.sourceVersionTime) > Date.parse(base.sourceVersionTime) && Date.parse(target.freshnessBoundary) > Date.parse(base.freshnessBoundary) && Date.parse(target.expiresAt) > Date.parse(base.expiresAt);
}
function monotonicEvidenceSourceDocuments(baseClaims, targetClaims) {
  const baseDocuments = documentsBySource(baseClaims);
  const targetDocuments = documentsBySource(targetClaims);
  const result = new Map;
  for (const [sourceId, baseDocument] of baseDocuments) {
    const targetDocument = targetDocuments.get(sourceId);
    result.set(sourceId, targetDocument !== undefined && externalRefreshAccepted(baseDocument, targetDocument) ? targetDocument : baseDocument);
  }
  for (const [sourceId, targetDocument] of targetDocuments) {
    if (!result.has(sourceId))
      result.set(sourceId, targetDocument);
  }
  return [...result.values()].sort((left, right) => {
    const leftId = left.sourceId ?? left.path;
    const rightId = right.sourceId ?? right.path;
    return compareText4(leftId, rightId) || compareText4(left.path, right.path);
  });
}
function applyEvidenceSourceCoverage(evaluation, documents) {
  const sourceHealth = combineEvidenceHealth(...documents.map((document) => document.health));
  const sourcePartial = documents.some((document) => document.partialCoverage || document.health !== "current");
  return {
    ...evaluation,
    result: evaluation.result === "no-actionable-risk" && sourceHealth !== "current" ? "advisory" : evaluation.result,
    scanStatus: evaluation.scanStatus === "partial" || sourcePartial ? "partial" : "complete",
    evidenceHealth: combineEvidenceHealth(evaluation.evidenceHealth, sourceHealth)
  };
}
function strongerClaim(base, target) {
  return {
    ...base,
    policyEligible: base.policyEligible || target.policyEligible,
    confidence: base.confidence === "high" || target.confidence === "high" ? "high" : base.confidence,
    evidenceHealth: combineEvidenceHealth(base.evidenceHealth ?? "current", target.evidenceHealth ?? "current"),
    locations: [...base.locations, ...target.locations].slice(0, 20),
    resolutionTrace: [...base.resolutionTrace, ...target.resolutionTrace]
  };
}
function acceptedRefresh(base, target) {
  return {
    ...target,
    policyEligible: base.policyEligible || target.policyEligible,
    confidence: base.confidence === "high" || target.confidence === "high" ? "high" : target.confidence,
    locations: [...base.locations, ...target.locations].slice(0, 20),
    resolutionTrace: [...base.resolutionTrace, ...target.resolutionTrace]
  };
}
function monotonicClaimFacts(baseClaims, targetClaims) {
  const baseAssertions = assertionById(baseClaims);
  const targetAssertions = assertionById(targetClaims);
  const baseDocuments = documentsBySource(baseClaims);
  const targetDocuments = documentsBySource(targetClaims);
  const baseById = new Map(baseClaims.facts.map((fact) => [fact.evidenceId, fact]));
  const targetById = new Map(targetClaims.facts.map((fact) => [fact.evidenceId, fact]));
  const result = new Map;
  for (const [evidenceId, baseFact] of baseById) {
    const targetFact = targetById.get(evidenceId);
    if (targetFact === undefined || immutableClaimIdentity(baseFact) !== immutableClaimIdentity(targetFact)) {
      result.set(evidenceId, baseFact);
      continue;
    }
    let refreshAccepted = false;
    if (baseFact.origin === "manual-claim") {
      const baseAssertion = baseAssertions.get(evidenceId);
      const targetAssertion = targetAssertions.get(evidenceId);
      refreshAccepted = baseAssertion !== undefined && targetAssertion !== undefined && assertionRefreshAccepted(baseAssertion, targetAssertion);
    } else if (baseFact.sourceId !== undefined && targetFact.sourceId === baseFact.sourceId) {
      const baseDocument = baseDocuments.get(baseFact.sourceId);
      const targetDocument = targetDocuments.get(baseFact.sourceId);
      refreshAccepted = baseDocument !== undefined && targetDocument !== undefined && externalRefreshAccepted(baseDocument, targetDocument);
    }
    result.set(evidenceId, refreshAccepted ? acceptedRefresh(baseFact, targetFact) : strongerClaim(baseFact, targetFact));
  }
  for (const [evidenceId, targetFact] of targetById) {
    if (!result.has(evidenceId) && !baseById.has(evidenceId))
      result.set(evidenceId, targetFact);
  }
  for (const [sourceId, baseDocument] of baseDocuments) {
    const targetDocument = targetDocuments.get(sourceId);
    if (targetDocument === undefined || !externalRefreshAccepted(baseDocument, targetDocument))
      continue;
    for (const [evidenceId, fact] of result) {
      if (fact.sourceId === sourceId) {
        result.set(evidenceId, {
          ...fact,
          evidenceHealth: targetDocument.health
        });
      }
    }
  }
  return [...result.values()].sort((left, right) => compareText4(left.evidenceId, right.evidenceId));
}
function claimChangeDiagnostics(base, target) {
  const diagnostics = [];
  if (!target.policy.valid) {
    diagnostics.push({
      code: "invalid-target-policy",
      message: "The target policy is invalid and excluded from trusted evaluation.",
      path: ".github/ai-model-lifecycle.yml",
      severity: "notice"
    });
  }
  for (const document of target.evidenceDocuments.filter((candidate) => !candidate.valid)) {
    diagnostics.push({
      code: "invalid-target-evidence",
      message: `Target evidence document ${document.path} is invalid and excluded.`,
      path: document.path,
      severity: "notice"
    });
  }
  const targetFacts = new Map(target.facts.map((fact) => [fact.evidenceId, fact]));
  for (const baseFact of base.facts) {
    const targetFact = targetFacts.get(baseFact.evidenceId);
    if (targetFact === undefined) {
      diagnostics.push({
        code: "claim-deletion-ignored",
        message: `Target deletion of claim ${baseFact.evidenceId} cannot weaken this PR evaluation.`,
        ...baseFact.locations[0]?.path === undefined ? {} : { path: baseFact.locations[0].path },
        severity: "notice"
      });
    } else if (immutableClaimIdentity(baseFact) !== immutableClaimIdentity(targetFact)) {
      diagnostics.push({
        code: "claim-lineage-mutation-ignored",
        message: `Target mutation of immutable claim lineage ${baseFact.evidenceId} is ignored.`,
        ...targetFact.locations[0]?.path === undefined ? {} : { path: targetFact.locations[0].path },
        severity: "notice"
      });
    }
  }
  const baseAssertions = assertionById(base);
  const targetAssertions = assertionById(target);
  for (const [evidenceId, baseAssertion] of baseAssertions) {
    const targetAssertion = targetAssertions.get(evidenceId);
    if (targetAssertion !== undefined && !assertionRefreshAccepted(baseAssertion, targetAssertion) && JSON.stringify(baseAssertion) !== JSON.stringify(targetAssertion)) {
      diagnostics.push({
        code: "assertion-refresh-rejected",
        message: `Same-ID assertion refresh ${evidenceId} is not strictly later or changes immutable lineage.`,
        path: ".github/ai-model-lifecycle.yml",
        severity: "notice"
      });
    }
  }
  const baseDocuments = documentsBySource(base);
  const targetDocuments = documentsBySource(target);
  for (const [sourceId, baseDocument] of baseDocuments) {
    const targetDocument = targetDocuments.get(sourceId);
    if (targetDocument === undefined) {
      diagnostics.push({
        code: "evidence-source-deletion-ignored",
        message: `Target deletion of evidence source ${sourceId} cannot weaken this PR evaluation.`,
        path: baseDocument.path,
        severity: "notice"
      });
    } else if (targetDocument !== undefined && baseDocument.digest !== targetDocument.digest && !externalRefreshAccepted(baseDocument, targetDocument)) {
      diagnostics.push({
        code: "evidence-refresh-rejected",
        message: `Same-ID evidence-source refresh ${sourceId} is not strictly later or changes immutable lineage.`,
        path: targetDocument.path,
        severity: "notice"
      });
    }
  }
  return diagnostics;
}
function mergeFindings(left, right) {
  const result = new Map;
  for (const source of [left, right]) {
    for (const finding of source) {
      const existing = result.get(finding.semanticKey);
      if (existing === undefined) {
        result.set(finding.semanticKey, { ...finding });
      } else if (compareOutcome(finding.outcome, existing.outcome) > 0) {
        result.set(finding.semanticKey, {
          ...finding,
          evidenceIds: [...new Set([...existing.evidenceIds, ...finding.evidenceIds])].sort(compareText4),
          locations: [...existing.locations, ...finding.locations].slice(0, 20)
        });
      } else {
        existing.evidenceIds = [...new Set([...existing.evidenceIds, ...finding.evidenceIds])].sort(compareText4);
        existing.locations = [...existing.locations, ...finding.locations].slice(0, 20);
      }
    }
  }
  return [...result.values()].sort((a, b) => compareText4(a.semanticKey, b.semanticKey));
}
function dedupeDiagnostics(diagnostics) {
  const seen = new Set;
  const result = [];
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([
      diagnostic.code,
      diagnostic.message,
      diagnostic.path ?? null,
      diagnostic.severity
    ]);
    if (seen.has(key))
      continue;
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}
function mergeEvaluations(left, right) {
  const findings = mergeFindings(left.findings, right.findings);
  const evidence = new Map([...left.evidence, ...right.evidence].map((fact) => [fact.evidenceId, fact]));
  const unresolved = new Map([...left.unresolved, ...right.unresolved].map((fact) => [fact.evidenceId, fact]));
  return {
    result: strongerResult(resultFromFindings(findings), strongerResult(left.result, right.result)),
    scanStatus: combineScanStatus(left.scanStatus, right.scanStatus),
    evidence: [...evidence.values()].sort((a, b) => compareText4(a.evidenceId, b.evidenceId)),
    findings,
    unresolved: [...unresolved.values()].sort((a, b) => compareText4(a.evidenceId, b.evidenceId)),
    diagnostics: dedupeDiagnostics([...left.diagnostics, ...right.diagnostics]),
    evidenceHealth: combineEvidenceHealth(left.evidenceHealth, right.evidenceHealth)
  };
}
function isClaimFreshnessDiagnostic(diagnostic) {
  return diagnostic.code === "assertion-review-overdue" || diagnostic.code === "assertion-expired" || diagnostic.code === "evidence-source-review-overdue" || diagnostic.code === "evidence-source-stale" || diagnostic.code === "evidence-source-expired";
}
function baseExtractionIsPartial(detection, claims) {
  return detection.scanStatus === "partial" || claims.diagnostics.some((diagnostic) => diagnostic.severity === "partial" && !isClaimFreshnessDiagnostic(diagnostic));
}
function addDelta(baseline, target, comparisonPartial) {
  const baseByKey = new Map(baseline.findings.map((finding) => [finding.semanticKey, finding]));
  const targetByKey = new Map(target.findings.map((finding) => [finding.semanticKey, finding]));
  const findings = [];
  for (const finding of target.findings) {
    const base = baseByKey.get(finding.semanticKey);
    let delta;
    if (base === undefined)
      delta = comparisonPartial ? "comparison-unknown" : "new";
    else if (compareOutcome(finding.outcome, base.outcome) > 0)
      delta = "worsened";
    else
      delta = "unchanged";
    const copy = { ...finding, delta };
    if (delta === "comparison-unknown" && copy.outcome === "breach") {
      copy.outcome = "warning";
      copy.reasons = [
        ...copy.reasons,
        "Base extraction coverage is partial; this target fact cannot be classified as a new blocker."
      ];
    }
    findings.push(copy);
  }
  for (const base of baseline.findings) {
    if (!targetByKey.has(base.semanticKey)) {
      findings.push({
        ...base,
        outcome: "none",
        delta: "resolved",
        reasons: [...base.reasons, "The ordinary repository evidence is absent from the target."]
      });
    }
  }
  const actionableDelta = findings.filter((finding) => finding.delta === "new" || finding.delta === "worsened" || finding.delta === "comparison-unknown");
  let result = resultFromFindings(actionableDelta);
  if (compareResult(target.result, baseline.result) > 0) {
    const increasedResult = comparisonPartial && target.result === "blocking" ? "advisory" : target.result;
    result = strongerResult(result, increasedResult);
  }
  return { findings, result };
}
function evaluateComparison(input) {
  const trustedBasePolicy = input.baseClaims.policy.policy;
  const proposedTargetPolicy = applyTrustedInputs(input.targetClaims.policy.valid ? input.targetClaims.policy.policy : defaultPolicy(), input.inputs);
  const effectiveTargetPolicy = monotonicPolicy(trustedBasePolicy, proposedTargetPolicy);
  const claimDiagnostics = claimChangeDiagnostics(input.baseClaims, input.targetClaims);
  const baseEvidence = [...input.baseDetection.evidence, ...input.baseClaims.facts];
  const targetClaims = monotonicClaimFacts(input.baseClaims, input.targetClaims);
  const targetEvidence = [...input.targetDetection.evidence, ...targetClaims];
  const targetTrustedDiagnostics = input.targetClaims.diagnostics.filter((diagnostic) => diagnostic.severity !== "failed");
  const baseline = applyEvidenceSourceCoverage(evaluateEvidence({
    evidence: baseEvidence,
    feed: input.feed,
    policy: trustedBasePolicy,
    now: input.now,
    scanStatus: combineScanStatus(input.baseDetection.scanStatus, input.baseClaims.scanStatus),
    diagnostics: [...input.baseDetection.diagnostics, ...input.baseClaims.diagnostics]
  }), [...documentsBySource(input.baseClaims).values()]);
  const effectiveSourceDocuments = monotonicEvidenceSourceDocuments(input.baseClaims, input.targetClaims);
  const effectiveSourceDiagnostics = effectiveSourceDocuments.flatMap((document) => document.diagnostics).filter((diagnostic) => !targetTrustedDiagnostics.some((targetDiagnostic) => targetDiagnostic.code === diagnostic.code && targetDiagnostic.path === diagnostic.path && targetDiagnostic.message === diagnostic.message));
  const targetUnderBase = applyEvidenceSourceCoverage(evaluateEvidence({
    evidence: targetEvidence,
    feed: input.feed,
    policy: trustedBasePolicy,
    now: input.now,
    scanStatus: combineScanStatus(input.targetDetection.scanStatus, input.targetClaims.scanStatus),
    diagnostics: [
      ...input.targetDetection.diagnostics,
      ...targetTrustedDiagnostics,
      ...effectiveSourceDiagnostics
    ]
  }), effectiveSourceDocuments);
  const policyDomain = "ai-model-eol/comparison-policy-identity/v3";
  const targetUnderMonotonic = canonicalSha256(policyDomain, effectiveTargetPolicy) === canonicalSha256(policyDomain, trustedBasePolicy) ? targetUnderBase : applyEvidenceSourceCoverage(evaluateEvidence({
    evidence: targetEvidence,
    feed: input.feed,
    policy: effectiveTargetPolicy,
    now: input.now,
    scanStatus: targetUnderBase.scanStatus,
    diagnostics: targetUnderBase.diagnostics
  }), effectiveSourceDocuments);
  const target = mergeEvaluations(targetUnderBase, targetUnderMonotonic);
  const comparisonPartial = baseExtractionIsPartial(input.baseDetection, input.baseClaims) || target.scanStatus === "partial";
  const delta = addDelta(baseline, target, comparisonPartial);
  const policyChanges = policyDiff(input.baseClaims.policy, input.targetClaims.policy, input.inputs);
  const baseSuppressions = new Set(trustedBasePolicy.suppressions.map((suppression) => JSON.stringify(suppression)));
  const proposedSuppression = proposedTargetPolicy.suppressions.some((suppression) => !baseSuppressions.has(JSON.stringify(suppression)));
  const proposedPlatformNarrowing = proposedTargetPolicy.servingPlatforms.length > 0 && (trustedBasePolicy.servingPlatforms.length === 0 || !trustedBasePolicy.servingPlatforms.every((servingPlatform) => proposedTargetPolicy.servingPlatforms.includes(servingPlatform)));
  const attemptedWeakening = proposedTargetPolicy.warnWithinDays < trustedBasePolicy.warnWithinDays || trustedBasePolicy.failWithinDays !== null && (proposedTargetPolicy.failWithinDays === null || proposedTargetPolicy.failWithinDays < trustedBasePolicy.failWithinDays) || !trustedBasePolicy.allowPartial && proposedTargetPolicy.allowPartial || proposedSuppression || proposedPlatformNarrowing;
  let result = delta.result;
  if (result === "no-actionable-risk" && (claimDiagnostics.length > 0 || attemptedWeakening)) {
    result = "advisory";
  }
  const evaluation = {
    ...target,
    result,
    findings: delta.findings,
    diagnostics: [...target.diagnostics, ...claimDiagnostics]
  };
  return {
    result,
    baselineResult: baseline.result,
    targetResult: target.result,
    scanStatus: comparisonPartial ? "partial" : "complete",
    baselineScanStatus: baseline.scanStatus,
    targetScanStatus: target.scanStatus,
    comparisonStatus: comparisonPartial ? "partial" : "available",
    evaluation,
    baseline,
    policy: effectiveTargetPolicy,
    policyDiff: [
      ...policyChanges,
      ...attemptedWeakening ? ["A target policy weakening was ignored for this comparison."] : [],
      ...claimDiagnostics.map((diagnostic) => diagnostic.message)
    ]
  };
}

// src/detection/detectors.ts
var import_node_path = require("node:path");
var import_yaml2 = __toESM(require_dist(), 1);
var MAX_EVIDENCE_FACTS = 1e5;
var ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
var DOTENV_PATH = /(?:^|\/)\.env(?:\.[A-Za-z0-9_-]+)*$/u;
var GITHUB_WORKFLOW_PATH = /^\.github\/workflows\/[^/]+\.ya?ml$/u;
var SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".kts",
  ".cs",
  ".rb",
  ".php",
  ".rs",
  ".swift",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".sh"
]);
var JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
var JSX_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".tsx"]);
var HCL_EXTENSIONS = new Set([".tf", ".hcl"]);
var IDENTIFIER_CHARACTER = /^[\p{L}\p{N}\p{M}._:/-]$/u;
var DIRECT_POLICY_RULES = new Set(DETECTOR_RULES.filter((rule) => rule.policyEligible).map((rule) => rule.ruleId));
function assertEvidenceBudget(count) {
  if (count > MAX_EVIDENCE_FACTS) {
    throw new Error(`Detector evidence exceeds the aggregate ${MAX_EVIDENCE_FACTS}-fact budget.`);
  }
}
function compareText5(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function fromCodePointOrReplacement(codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 1114111)
    return "�";
  return String.fromCodePoint(codePoint);
}
function decodeStringContent(raw, quoteLength, closed) {
  const content = raw.slice(quoteLength, closed ? raw.length - quoteLength : raw.length);
  let invalidUnicodeEscape = false;
  const value = content.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|n|r|t|b|f|v|0|([\\'"`]))/g, (match, wide, unicode, hex, simple) => {
    if (wide !== undefined) {
      const codePoint = Number.parseInt(wide, 16);
      if (codePoint > 1114111)
        invalidUnicodeEscape = true;
      return fromCodePointOrReplacement(codePoint);
    }
    if (unicode !== undefined)
      return fromCodePointOrReplacement(Number.parseInt(unicode, 16));
    if (hex !== undefined)
      return fromCodePointOrReplacement(Number.parseInt(hex, 16));
    if (simple !== undefined)
      return simple;
    const escapes = {
      "\\n": `
`,
      "\\r": "\r",
      "\\t": "\t",
      "\\b": "\b",
      "\\f": "\f",
      "\\v": "\v",
      "\\0": "\x00"
    };
    return escapes[match] ?? match;
  });
  return { value, invalidUnicodeEscape };
}
var REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await"
]);
function valueEndingToken(token) {
  if (token === undefined)
    return false;
  if (token.kind === "string")
    return true;
  if (token.kind === "identifier")
    return !REGEX_PRECEDING_KEYWORDS.has(token.value);
  if (/^[0-9]$/u.test(token.value))
    return true;
  return token.value === ")" || token.value === "]" || token.value === "}" || token.value === "++" || token.value === "--";
}
function regexLiteralAllowed(tokens) {
  let index = tokens.length - 1;
  if (structuralValue(tokens[index]) === "!" && valueEndingToken(tokens[index - 1])) {
    index -= 1;
  }
  return !valueEndingToken(tokens[index]);
}
var JSX_TAG_LOOKAHEAD_CHARACTERS = 4096;
var JSX_NAME_START = /[A-Za-z_$]/u;
var JSX_NAME_CHARACTER = /[A-Za-z0-9_$.:-]/u;
function jsxQuotedEnd(source, index, limit) {
  const quote = source[index];
  for (let scan = index + 1;scan < limit; scan += 1) {
    if (source[scan] === quote)
      return scan + 1;
  }
  return -1;
}
var JSX_VALUE_ENDING_CHARACTER = /[\p{L}\p{N}_$)\]}]/u;
var JSX_STEPPED_OVER_VALUE = "0";
function jsxOpaqueEnd(source, index, limit, previous) {
  const character = source[index];
  if (character === '"' || character === "'") {
    for (let scan = index + 1;scan < limit; scan += 1) {
      const inner = source[scan];
      if (inner === "\\")
        scan += 1;
      else if (inner === `
`)
        break;
      else if (inner === character)
        return scan + 1;
    }
    return index;
  }
  if (character === "`") {
    let substitutions = 0;
    for (let scan = index + 1;scan < limit; scan += 1) {
      const inner = source[scan];
      if (inner === "\\")
        scan += 1;
      else if (inner === "$" && source[scan + 1] === "{") {
        substitutions += 1;
        scan += 1;
      } else if (inner === "}" && substitutions > 0)
        substitutions -= 1;
      else if (inner === "`" && substitutions === 0)
        return scan + 1;
    }
    return index;
  }
  if (character !== "/")
    return index;
  if (source[index + 1] === "*") {
    const closed = source.indexOf("*/", index + 2);
    return closed < 0 || closed + 2 > limit ? index : closed + 2;
  }
  if (source[index + 1] === "/") {
    const newline = source.indexOf(`
`, index + 2);
    return newline < 0 || newline >= limit ? index : newline + 1;
  }
  if (JSX_VALUE_ENDING_CHARACTER.test(previous))
    return index;
  let characterClass = false;
  for (let scan = index + 1;scan < limit; scan += 1) {
    const inner = source[scan];
    if (inner === "\\")
      scan += 1;
    else if (inner === `
`)
      break;
    else if (inner === "[")
      characterClass = true;
    else if (inner === "]")
      characterClass = false;
    else if (inner === "/" && !characterClass)
      return scan + 1;
  }
  return index;
}
function jsxBalancedEnd(source, index, limit, open, close) {
  let depth = 0;
  let previous = "";
  for (let scan = index;scan < limit; scan += 1) {
    const character = source[scan];
    const opaque = jsxOpaqueEnd(source, scan, limit, previous);
    if (opaque > scan) {
      const comment = character === "/" && (source[scan + 1] === "/" || source[scan + 1] === "*");
      if (!comment)
        previous = JSX_STEPPED_OVER_VALUE;
      scan = opaque - 1;
      continue;
    }
    if (character === open)
      depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0)
        return scan + 1;
    }
    if (!/\s/u.test(character))
      previous = character;
  }
  return -1;
}
function jsxBracedEnd(source, index, limit) {
  return jsxBalancedEnd(source, index, limit, "{", "}");
}
function jsxAngleEnd(source, index, limit) {
  return jsxBalancedEnd(source, index, limit, "<", ">");
}
function looksLikeJsxTag(source, offset) {
  const limit = Math.min(source.length, offset + JSX_TAG_LOOKAHEAD_CHARACTERS);
  let index = offset + 1;
  const first = source[index];
  if (first === undefined)
    return false;
  if (first === ">")
    return true;
  if (!JSX_NAME_START.test(first))
    return false;
  while (index < limit && JSX_NAME_CHARACTER.test(source[index]))
    index += 1;
  while (index < limit) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === ">")
      return true;
    if (character === "/" && source[index + 1] === ">")
      return true;
    if (character === "/" && source[index + 1] === "*") {
      const closed = source.indexOf("*/", index + 2);
      if (closed < 0 || closed + 2 > limit)
        return false;
      index = closed + 2;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      const newline = source.indexOf(`
`, index + 2);
      if (newline < 0 || newline >= limit)
        return false;
      index = newline + 1;
      continue;
    }
    if (character === "=") {
      index += 1;
      continue;
    }
    if (character === "{") {
      index = jsxBracedEnd(source, index, limit);
      if (index < 0)
        return false;
      continue;
    }
    if (character === "'" || character === '"') {
      index = jsxQuotedEnd(source, index, limit);
      if (index < 0)
        return false;
      continue;
    }
    if (character === "<") {
      index = jsxAngleEnd(source, index, limit);
      if (index < 0)
        return false;
      continue;
    }
    if (JSX_NAME_START.test(character)) {
      const nameStart = index;
      while (index < limit && JSX_NAME_CHARACTER.test(source[index]))
        index += 1;
      if (source.slice(nameStart, index) === "extends")
        return false;
      continue;
    }
    return false;
  }
  return false;
}
function jsxElementAllowed(tokens, source, offset) {
  const previous = tokens[tokens.length - 1];
  const valuePosition = regexLiteralAllowed(tokens) || structuralValue(previous) === "}" || isIdentifier(previous, "default");
  return valuePosition && looksLikeJsxTag(source, offset);
}
function tokenize(source, language, jsx = false) {
  const tokens = [];
  let issue;
  const reportIssue = (candidate) => {
    issue ??= candidate;
  };
  let offset = 0;
  let line = 1;
  let column = 1;
  const frames = [];
  const advance = (character) => {
    offset += character.length;
    if (character === `
`) {
      line += 1;
      column = 1;
    } else {
      column += [...character].length;
    }
  };
  const emitPunctuation = (value) => {
    const tokenStart = offset;
    const tokenLine = line;
    const tokenColumn = column;
    for (const part of value)
      advance(part);
    tokens.push({
      kind: "punctuation",
      value,
      raw: value,
      offset: tokenStart,
      line: tokenLine,
      column: tokenColumn,
      static: true
    });
  };
  const emitJsxName = () => {
    const tokenStart = offset;
    const tokenLine = line;
    const tokenColumn = column;
    while (offset < source.length && JSX_NAME_CHARACTER.test(source[offset])) {
      advance(source[offset]);
    }
    const raw = source.slice(tokenStart, offset);
    tokens.push({
      kind: "identifier",
      value: raw,
      raw,
      offset: tokenStart,
      line: tokenLine,
      column: tokenColumn,
      static: true
    });
  };
  const consumeJavascriptTemplate = () => {
    const frames2 = [{ mode: "text", braceDepth: 0, regexAllowed: true }];
    let dynamic = false;
    const consumeQuotedExpressionString = (quote) => {
      advance(quote);
      let escaped = false;
      while (offset < source.length) {
        const current = source[offset];
        if (current === `
` && !escaped)
          return false;
        advance(current);
        if (escaped)
          escaped = false;
        else if (current === "\\")
          escaped = true;
        else if (current === quote)
          return true;
      }
      return false;
    };
    const consumeExpressionRegex = () => {
      advance("/");
      let escaped = false;
      let inClass = false;
      while (offset < source.length) {
        const current = source[offset];
        if (current === `
`)
          return false;
        advance(current);
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === "\\")
          escaped = true;
        else if (current === "[")
          inClass = true;
        else if (current === "]")
          inClass = false;
        else if (current === "/" && !inClass) {
          while (offset < source.length && /[a-z]/u.test(source[offset])) {
            advance(source[offset]);
          }
          return true;
        }
      }
      return false;
    };
    advance("`");
    while (offset < source.length) {
      const frame = frames2.at(-1);
      const current = source[offset];
      const next = source[offset + 1];
      if (frame.mode === "text") {
        if (current === "\\") {
          advance(current);
          if (offset < source.length)
            advance(source[offset]);
          continue;
        }
        if (current === "`") {
          advance(current);
          frames2.pop();
          if (frames2.length === 0)
            return { closed: true, dynamic };
          const parent = frames2.at(-1);
          if (parent !== undefined)
            parent.regexAllowed = false;
          continue;
        }
        if (current === "$" && next === "{") {
          dynamic = true;
          advance(current);
          advance("{");
          frame.mode = "expression";
          frame.braceDepth = 1;
          frame.regexAllowed = true;
          continue;
        }
        advance(current);
        continue;
      }
      if (/\s/u.test(current)) {
        advance(current);
        continue;
      }
      if (current === "'" || current === '"') {
        if (!consumeQuotedExpressionString(current))
          return { closed: false, dynamic };
        frame.regexAllowed = false;
        continue;
      }
      if (current === "`") {
        frames2.push({ mode: "text", braceDepth: 0, regexAllowed: true });
        advance(current);
        continue;
      }
      if (current === "/" && next === "/") {
        while (offset < source.length && source[offset] !== `
`) {
          advance(source[offset]);
        }
        continue;
      }
      if (current === "/" && next === "*") {
        advance(current);
        advance("*");
        let closed = false;
        while (offset < source.length) {
          const commentCharacter = source[offset];
          if (commentCharacter === "*" && source[offset + 1] === "/") {
            advance(commentCharacter);
            advance("/");
            closed = true;
            break;
          }
          advance(commentCharacter);
        }
        if (!closed)
          return { closed: false, dynamic };
        continue;
      }
      const operatorPair = source.slice(offset, offset + 2);
      if (operatorPair === "++" || operatorPair === "--") {
        advance(operatorPair[0]);
        advance(operatorPair[1]);
        frame.regexAllowed = false;
        continue;
      }
      if (["??", "=>", "==", "!=", "<=", ">=", "**", "&&", "||", "+=", "-=", "*=", "%="].includes(operatorPair)) {
        advance(operatorPair[0]);
        advance(operatorPair[1]);
        frame.regexAllowed = true;
        continue;
      }
      if (current === "/" && frame.regexAllowed) {
        if (!consumeExpressionRegex())
          return { closed: false, dynamic };
        frame.regexAllowed = false;
        continue;
      }
      if (/[$_\p{L}]/u.test(current)) {
        const wordStart = offset;
        advance(current);
        while (offset < source.length && /[$_\p{L}\p{N}]/u.test(source[offset])) {
          advance(source[offset]);
        }
        frame.regexAllowed = REGEX_PRECEDING_KEYWORDS.has(source.slice(wordStart, offset));
        continue;
      }
      if (/[0-9]/u.test(current)) {
        advance(current);
        while (offset < source.length && /[0-9A-Za-z_.]/u.test(source[offset])) {
          advance(source[offset]);
        }
        frame.regexAllowed = false;
        continue;
      }
      if (current === "{") {
        advance(current);
        frame.braceDepth += 1;
        frame.regexAllowed = true;
        continue;
      }
      if (current === "}") {
        advance(current);
        frame.braceDepth -= 1;
        if (frame.braceDepth === 0)
          frame.mode = "text";
        else
          frame.regexAllowed = false;
        continue;
      }
      if (current === ")" || current === "]") {
        advance(current);
        frame.regexAllowed = false;
        continue;
      }
      if (current === "/") {
        advance(current);
        frame.regexAllowed = true;
        continue;
      }
      advance(current);
      frame.regexAllowed = current !== ")" && current !== "]";
    }
    return { closed: false, dynamic };
  };
  while (offset < source.length) {
    const start = offset;
    const startLine = line;
    const startColumn = column;
    const character = source[offset];
    const next = source[offset + 1];
    const frame = frames.at(-1);
    if (frame?.kind === "jsx" && frame.mode === "children") {
      if (character === "<" && next === "/") {
        emitPunctuation("<");
        emitPunctuation("/");
        frame.mode = "closing";
        continue;
      }
      if (character === "<" && looksLikeJsxTag(source, offset)) {
        emitPunctuation("<");
        frames.push({
          kind: "jsx",
          mode: "tag",
          angleDepth: 0,
          line: startLine,
          column: startColumn
        });
        continue;
      }
      if (character === "{") {
        emitPunctuation("{");
        frames.push({
          kind: "jsx-expression",
          braceDepth: 0,
          line: startLine,
          column: startColumn
        });
        continue;
      }
      advance(character);
      continue;
    }
    if (frame?.kind === "jsx" && frame.mode === "closing") {
      if (character === ">") {
        emitPunctuation(">");
        frames.pop();
        continue;
      }
      if (JSX_NAME_START.test(character)) {
        emitJsxName();
        continue;
      }
      advance(character);
      continue;
    }
    if (frame?.kind === "jsx" && frame.mode === "tag" && character !== "'" && character !== '"' && !(character === "/" && (next === "/" || next === "*"))) {
      if (character === "/" && next === ">") {
        emitPunctuation("/");
        emitPunctuation(">");
        frames.pop();
        continue;
      }
      if (character === "<") {
        emitPunctuation("<");
        frame.angleDepth += 1;
        continue;
      }
      if (character === ">") {
        emitPunctuation(">");
        if (frame.angleDepth > 0)
          frame.angleDepth -= 1;
        else
          frame.mode = "children";
        continue;
      }
      if (character === "{") {
        emitPunctuation("{");
        frames.push({
          kind: "jsx-expression",
          braceDepth: 0,
          line: startLine,
          column: startColumn
        });
        continue;
      }
      if (/\s/u.test(character)) {
        advance(character);
        continue;
      }
      if (JSX_NAME_START.test(character)) {
        emitJsxName();
        continue;
      }
      emitPunctuation(character);
      continue;
    }
    if (frame?.kind === "jsx-expression") {
      if (character === "{")
        frame.braceDepth += 1;
      else if (character === "}") {
        if (frame.braceDepth === 0) {
          emitPunctuation("}");
          frames.pop();
          continue;
        }
        frame.braceDepth -= 1;
      }
    }
    if (/\s/u.test(character)) {
      advance(character);
      continue;
    }
    if (language === "javascript" && start === 0 && character === "#" && next === "!") {
      while (offset < source.length && source[offset] !== `
`)
        advance(source[offset]);
      continue;
    }
    if (language === "python" && character === "#" || language === "hcl" && character === "#" || language !== "python" && character === "/" && next === "/") {
      while (offset < source.length && source[offset] !== `
`)
        advance(source[offset]);
      continue;
    }
    if (language !== "python" && character === "/" && next === "*") {
      let closed = false;
      advance(character);
      advance(next);
      while (offset < source.length) {
        const current = source[offset];
        if (current === "*" && source[offset + 1] === "/") {
          advance(current);
          advance("/");
          closed = true;
          break;
        }
        advance(current);
      }
      if (!closed) {
        reportIssue({ kind: "unterminated-block-comment", line: startLine, column: startColumn });
      }
      continue;
    }
    if (language === "javascript" && character === "/" && regexLiteralAllowed(tokens)) {
      advance(character);
      let escaped = false;
      let inClass = false;
      let closed = false;
      while (offset < source.length) {
        const current = source[offset];
        if (current === `
`)
          break;
        advance(current);
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === "\\")
          escaped = true;
        else if (current === "[")
          inClass = true;
        else if (current === "]")
          inClass = false;
        else if (current === "/" && !inClass) {
          closed = true;
          break;
        }
      }
      if (closed) {
        while (offset < source.length && /[a-z]/u.test(source[offset])) {
          advance(source[offset]);
        }
      } else {
        reportIssue({
          kind: "unterminated-regex-literal",
          line: startLine,
          column: startColumn
        });
      }
      continue;
    }
    if (language === "javascript" && character === "`") {
      const template = consumeJavascriptTemplate();
      const raw = source.slice(start, offset);
      const decoded = template.dynamic ? { value: raw.slice(1, template.closed ? -1 : undefined), invalidUnicodeEscape: false } : decodeStringContent(raw, 1, template.closed);
      if (!template.closed) {
        reportIssue({
          kind: "unterminated-string-literal",
          line: startLine,
          column: startColumn
        });
      } else if (decoded.invalidUnicodeEscape) {
        reportIssue({
          kind: "invalid-unicode-escape",
          line: startLine,
          column: startColumn
        });
      }
      tokens.push({
        kind: "string",
        value: decoded.value,
        raw,
        offset: start,
        line: startLine,
        column: startColumn,
        static: template.closed && !template.dynamic
      });
      continue;
    }
    if (character === "'" || character === '"') {
      const jsxAttribute = frame?.kind === "jsx" && frame.mode === "tag";
      const triple = language === "python" && source.slice(offset, offset + 3) === character.repeat(3);
      const quoteLength = triple ? 3 : 1;
      const multiline = triple || jsxAttribute;
      for (let count = 0;count < quoteLength; count += 1)
        advance(character);
      let escaped = false;
      let dynamic = false;
      let closed = false;
      while (offset < source.length) {
        if (source.slice(offset, offset + quoteLength) === character.repeat(quoteLength) && !escaped) {
          for (let count = 0;count < quoteLength; count += 1)
            advance(character);
          closed = true;
          break;
        }
        const current = source[offset];
        if (current === `
` && !multiline && !escaped) {
          reportIssue({
            kind: "unterminated-string-literal",
            line: startLine,
            column: startColumn
          });
          break;
        }
        if (language === "hcl" && (current === "$" || current === "%") && source[offset + 1] === "{") {
          dynamic = true;
        }
        advance(current);
        if (escaped)
          escaped = false;
        else if (current === "\\" && !jsxAttribute)
          escaped = true;
      }
      const raw = source.slice(start, offset);
      const decoded = decodeStringContent(raw, quoteLength, closed);
      if (!closed) {
        reportIssue({
          kind: "unterminated-string-literal",
          line: startLine,
          column: startColumn
        });
      } else if (decoded.invalidUnicodeEscape) {
        reportIssue({
          kind: "invalid-unicode-escape",
          line: startLine,
          column: startColumn
        });
      }
      tokens.push({
        kind: "string",
        value: decoded.value,
        raw,
        offset: start,
        line: startLine,
        column: startColumn,
        static: closed && !dynamic
      });
      continue;
    }
    if (/[$_\p{L}]/u.test(character)) {
      advance(character);
      while (offset < source.length && /[$_\p{L}\p{N}]/u.test(source[offset])) {
        advance(source[offset]);
      }
      const raw = source.slice(start, offset);
      tokens.push({
        kind: "identifier",
        value: raw,
        raw,
        offset: start,
        line: startLine,
        column: startColumn,
        static: true
      });
      continue;
    }
    if (jsx && character === "<" && jsxElementAllowed(tokens, source, offset)) {
      emitPunctuation("<");
      frames.push({
        kind: "jsx",
        mode: "tag",
        angleDepth: 0,
        line: startLine,
        column: startColumn
      });
      continue;
    }
    const pair = source.slice(offset, offset + 2);
    const punctuation = [
      "??",
      "=>",
      "==",
      "!=",
      "<=",
      ">=",
      "?.",
      "::",
      "++",
      "--",
      "**",
      "&&",
      "||",
      "+=",
      "-=",
      "*=",
      "/=",
      "%=",
      "&=",
      "|=",
      "^="
    ].includes(pair) ? pair : character;
    for (const part of punctuation)
      advance(part);
    tokens.push({
      kind: "punctuation",
      value: punctuation,
      raw: punctuation,
      offset: start,
      line: startLine,
      column: startColumn,
      static: true
    });
  }
  const unterminatedFrame = frames.at(-1);
  if (unterminatedFrame !== undefined) {
    reportIssue({
      kind: "mismatched-delimiter",
      line: unterminatedFrame.line,
      column: unterminatedFrame.column
    });
  }
  if (issue === undefined) {
    const stack = [];
    const closingToOpening = new Map([
      [")", "("],
      ["]", "["],
      ["}", "{"]
    ]);
    for (const token of tokens) {
      const value = structuralValue(token);
      if (value === "(" || value === "[" || value === "{") {
        stack.push(token);
        continue;
      }
      const expected = value === null ? undefined : closingToOpening.get(value);
      if (expected === undefined)
        continue;
      if (structuralValue(stack.at(-1)) !== expected) {
        reportIssue({ kind: "mismatched-delimiter", line: token.line, column: token.column });
        break;
      }
      stack.pop();
    }
    const unmatched = stack.at(-1);
    if (issue === undefined && unmatched !== undefined) {
      reportIssue({
        kind: "mismatched-delimiter",
        line: unmatched.line,
        column: unmatched.column
      });
    }
  }
  return issue === undefined ? { tokens } : { tokens, issue };
}
function structuralValue(token) {
  if (token === undefined || token.kind === "string")
    return null;
  return token.value;
}
function isIdentifier(token, value) {
  return token?.kind === "identifier" && token.value === value;
}
function isPropertyNameAt(tokens, index, property) {
  const token = tokens[index];
  if (token === undefined || token.value !== property)
    return false;
  if (token.kind !== "identifier" && token.kind !== "string")
    return false;
  const previousToken = tokens[index - 1];
  const previous = structuralValue(tokens[index - 1]);
  return previousToken === undefined || previousToken.line < token.line || previous === "{" || previous === "," || previous === "(";
}
function matchingIndex(tokens, openIndex, open, close) {
  let depth = 0;
  for (let index = openIndex;index < tokens.length; index += 1) {
    const value = structuralValue(tokens[index]);
    if (value === open)
      depth += 1;
    else if (value === close) {
      depth -= 1;
      if (depth === 0)
        return index;
    }
  }
  return null;
}
function matchingOpenIndex(tokens, closeIndex, open, close) {
  let depth = 0;
  for (let index = closeIndex;index >= 0; index -= 1) {
    const value = structuralValue(tokens[index]);
    if (value === close)
      depth += 1;
    else if (value === open) {
      depth -= 1;
      if (depth === 0)
        return index;
    }
  }
  return null;
}
function functionParameterNames(tokens, language) {
  const names = new Set;
  const inspect = (open, close) => {
    let depth = 0;
    for (let index = open + 1;index < close; index += 1) {
      const value = structuralValue(tokens[index]);
      if (["(", "[", "{"].includes(value ?? ""))
        depth += 1;
      else if ([")", "]", "}"].includes(value ?? ""))
        depth = Math.max(0, depth - 1);
      if (depth === 0 && tokens[index]?.kind === "identifier" && (structuralValue(tokens[index - 1]) === "(" || structuralValue(tokens[index - 1]) === ",")) {
        names.add(value);
      }
    }
  };
  for (let index = 0;index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = token?.value;
    if (token?.kind === "identifier" && (value === "function" || value === "def") && tokens[index + 1]?.kind === "identifier") {
      let open = index + 2;
      while (open < Math.min(tokens.length, index + 12) && structuralValue(tokens[open]) !== "(") {
        open += 1;
      }
      if (structuralValue(tokens[open]) === "(") {
        const close = matchingIndex(tokens, open, "(", ")");
        if (close !== null)
          inspect(open, close);
      }
    }
    if (language !== "javascript" || structuralValue(token) !== "=>")
      continue;
    if (tokens[index - 1]?.kind === "identifier") {
      names.add(tokens[index - 1]?.value);
    } else if (structuralValue(tokens[index - 1]) === ")") {
      const open = matchingOpenIndex(tokens, index - 1, "(", ")");
      if (open !== null)
        inspect(open, index - 1);
    }
  }
  return names;
}
var DIRECT_VALUE_TERMINATORS = new Set([",", ")", "}", "]", ";"]);
function isCompleteDirectValue(tokens, valueIndex, allowLineBoundary = false) {
  const value = tokens[valueIndex];
  const next = tokens[valueIndex + 1];
  if (value === undefined || next === undefined)
    return value !== undefined;
  if (DIRECT_VALUE_TERMINATORS.has(next.value))
    return true;
  return allowLineBoundary && next.line > value.line;
}
function collectConstants(tokens, language) {
  const candidates = new Map;
  const record = (name, value) => {
    candidates.set(name, candidates.has(name) ? null : value);
  };
  let braceDepth = 0;
  for (let index = 0;index < tokens.length; index += 1) {
    if (language === "javascript") {
      if (structuralValue(tokens[index]) === "{") {
        braceDepth += 1;
        continue;
      }
      if (structuralValue(tokens[index]) === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (braceDepth === 0 && isIdentifier(tokens[index], "const") && tokens[index + 1]?.kind === "identifier" && tokens[index + 2]?.value === "=" && tokens[index + 3]?.kind === "string" && tokens[index + 3]?.static && isCompleteDirectValue(tokens, index + 3, true)) {
        record(tokens[index + 1]?.value, tokens[index + 3]?.value);
      }
      continue;
    }
    const token = tokens[index];
    if (token?.kind === "identifier" && token.column === 1 && structuralValue(tokens[index + 1]) === "=" && tokens[index + 2]?.kind === "string" && tokens[index + 2]?.static && isCompleteDirectValue(tokens, index + 2, true)) {
      record(token.value, tokens[index + 2]?.value);
    }
  }
  const shadowed = functionParameterNames(tokens, language);
  const assignmentCounts = new Map;
  for (let index = 0;index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token?.kind === "identifier" && tokens[index + 1]?.value === "=") {
      assignmentCounts.set(token.value, (assignmentCounts.get(token.value) ?? 0) + 1);
    }
  }
  return new Map([...candidates.entries()].filter((entry) => entry[1] !== null && !shadowed.has(entry[0]) && (assignmentCounts.get(entry[0]) ?? 0) === 1));
}
function staticAtom(tokens, valueIndex, constants) {
  if (!isCompleteDirectValue(tokens, valueIndex))
    return;
  const token = tokens[valueIndex];
  if (token?.kind === "string" && token.static) {
    return {
      modelId: token.value,
      trace: [{ kind: "detector", detail: "direct static string" }]
    };
  }
  if (token?.kind === "identifier") {
    const constant = constants.get(token.value);
    if (constant !== undefined) {
      return {
        modelId: constant,
        trace: [{ kind: "constant", detail: `same-file constant ${token.value}` }]
      };
    }
  }
  return;
}
function resolveTokenValue(tokens, valueIndex, constants, defaultSelectorKind, environmentReference) {
  const token = tokens[valueIndex];
  if (environmentReference !== undefined) {
    const fallback = environmentReference.fallbackIndex === undefined ? undefined : staticAtom(tokens, environmentReference.fallbackIndex, constants);
    if (fallback !== undefined) {
      return {
        rawValue: fallback.modelId,
        modelId: fallback.modelId,
        modelResolution: "resolved",
        selectorKind: "dynamic",
        trace: [
          {
            kind: "environment-fallback",
            detail: "static fallback for a runtime environment selector"
          },
          ...fallback.trace
        ],
        environmentVariable: environmentReference.variable
      };
    }
    return {
      rawValue: `environment:${environmentReference.variable}`,
      modelResolution: "dynamic",
      selectorKind: "dynamic",
      trace: [
        {
          kind: "environment-fallback",
          detail: `runtime environment variable ${environmentReference.variable}`
        }
      ],
      environmentVariable: environmentReference.variable
    };
  }
  const resolved = staticAtom(tokens, valueIndex, constants);
  if (resolved !== undefined) {
    return {
      rawValue: token?.kind === "identifier" ? token.value : resolved.modelId,
      modelId: resolved.modelId,
      modelResolution: "resolved",
      selectorKind: defaultSelectorKind,
      trace: resolved.trace
    };
  }
  return {
    rawValue: token?.raw ?? "<missing>",
    modelResolution: token === undefined ? "unresolved" : "dynamic",
    selectorKind: "dynamic",
    trace: [{ kind: "detector", detail: "runtime-computed selector" }]
  };
}
var CONSTRUCTORS_BY_MODULE = {
  openai: {
    OpenAI: "openai",
    AsyncOpenAI: "openai",
    AzureOpenAI: "openai",
    AsyncAzureOpenAI: "openai"
  },
  "@anthropic-ai/sdk": { Anthropic: "anthropic", AsyncAnthropic: "anthropic" },
  anthropic: { Anthropic: "anthropic", AsyncAnthropic: "anthropic" },
  "@google/genai": { GoogleGenAI: "google" },
  "@aws-sdk/client-bedrock-runtime": { BedrockRuntimeClient: "aws-bedrock" }
};
var DEFAULT_CONSTRUCTOR_BY_MODULE = {
  openai: "OpenAI",
  "@anthropic-ai/sdk": "Anthropic"
};
var AWS_COMMANDS = new Set([
  "InvokeModelCommand",
  "InvokeModelWithResponseStreamCommand",
  "ConverseCommand",
  "ConverseStreamCommand"
]);
function importProvenance(tokens, language) {
  const constructors = new Map;
  const awsCommands = new Map;
  const googleNamespaces = new Set;
  const boto3Namespaces = new Set;
  const pythonOsNamespaces = new Set;
  const pythonGetenvFunctions = new Set;
  const pythonEnvironObjects = new Set;
  const conflicted = new Set;
  const addConstructor = (moduleName, canonicalName, localName) => {
    const integration = CONSTRUCTORS_BY_MODULE[moduleName]?.[canonicalName];
    if (integration === undefined || conflicted.has(localName))
      return;
    const existing = constructors.get(localName);
    if (existing !== undefined && (existing.integration !== integration || existing.canonicalName !== canonicalName)) {
      constructors.delete(localName);
      conflicted.add(localName);
      return;
    }
    constructors.set(localName, { integration, canonicalName });
  };
  const addNamedImport = (moduleName, canonicalName, localName) => {
    addConstructor(moduleName, canonicalName, localName);
    if (moduleName === "@aws-sdk/client-bedrock-runtime" && AWS_COMMANDS.has(canonicalName)) {
      awsCommands.set(localName, canonicalName);
    }
  };
  if (language === "javascript") {
    for (let index = 0;index < tokens.length; index += 1) {
      if (isIdentifier(tokens[index], "import")) {
        let fromIndex = -1;
        let moduleIndex = -1;
        for (let cursor = index + 1;cursor < Math.min(tokens.length, index + 80); cursor += 1) {
          if (structuralValue(tokens[cursor]) === ";" || isIdentifier(tokens[cursor], "import"))
            break;
          if (isIdentifier(tokens[cursor], "from") && tokens[cursor + 1]?.kind === "string") {
            fromIndex = cursor;
            moduleIndex = cursor + 1;
            break;
          }
        }
        if (fromIndex < 0 || moduleIndex < 0)
          continue;
        const moduleName2 = tokens[moduleIndex]?.value;
        if (tokens[index + 1]?.value === "type") {
          index = moduleIndex;
          continue;
        }
        const defaultName = DEFAULT_CONSTRUCTOR_BY_MODULE[moduleName2];
        const first = tokens[index + 1];
        if (defaultName !== undefined && first?.kind === "identifier" && first.value !== "type") {
          addConstructor(moduleName2, defaultName, first.value);
        }
        const open2 = tokens.findIndex((token, tokenIndex) => tokenIndex > index && tokenIndex < fromIndex && structuralValue(token) === "{");
        if (open2 >= 0) {
          const close = matchingIndex(tokens, open2, "{", "}");
          if (close !== null && close < fromIndex) {
            for (let cursor = open2 + 1;cursor < close; cursor += 1) {
              const imported = tokens[cursor];
              if (imported?.kind !== "identifier")
                continue;
              if (imported.value === "type") {
                cursor += 1;
                continue;
              }
              const local = tokens[cursor + 1]?.value === "as" && tokens[cursor + 2]?.kind === "identifier" ? tokens[cursor + 2]?.value : imported.value;
              addNamedImport(moduleName2, imported.value, local);
              if (local !== imported.value)
                cursor += 2;
            }
          }
        }
        index = moduleIndex;
        continue;
      }
      if (!isIdentifier(tokens[index], "require") || tokens[index + 1]?.value !== "(" || tokens[index + 2]?.kind !== "string" || tokens[index + 3]?.value !== ")") {
        continue;
      }
      const moduleName = tokens[index + 2]?.value;
      if (tokens[index - 1]?.value !== "=")
        continue;
      if (tokens[index - 2]?.kind === "identifier") {
        const defaultName = DEFAULT_CONSTRUCTOR_BY_MODULE[moduleName];
        if (defaultName !== undefined) {
          addConstructor(moduleName, defaultName, tokens[index - 2]?.value);
        }
        continue;
      }
      if (tokens[index - 2]?.value !== "}")
        continue;
      let open = index - 3;
      while (open >= 0 && tokens[open]?.value !== "{")
        open -= 1;
      if (open < 0)
        continue;
      for (let cursor = open + 1;cursor < index - 2; cursor += 1) {
        const imported = tokens[cursor];
        if (imported?.kind !== "identifier")
          continue;
        const local = tokens[cursor + 1]?.value === ":" && tokens[cursor + 2]?.kind === "identifier" ? tokens[cursor + 2]?.value : imported.value;
        addNamedImport(moduleName, imported.value, local);
        if (local !== imported.value)
          cursor += 2;
      }
    }
  } else {
    for (let index = 0;index < tokens.length; index += 1) {
      if (isIdentifier(tokens[index], "from")) {
        let importIndex = index + 1;
        while (importIndex < tokens.length && !isIdentifier(tokens[importIndex], "import")) {
          if (tokens[importIndex]?.line !== tokens[index]?.line)
            break;
          importIndex += 1;
        }
        if (!isIdentifier(tokens[importIndex], "import"))
          continue;
        const moduleName = tokens.slice(index + 1, importIndex).map((token) => token.value).join("");
        let cursor = importIndex + 1;
        while (cursor < tokens.length && tokens[cursor]?.line === tokens[importIndex]?.line) {
          const imported = tokens[cursor];
          if (imported?.kind !== "identifier") {
            cursor += 1;
            continue;
          }
          const local = tokens[cursor + 1]?.value === "as" && tokens[cursor + 2]?.kind === "identifier" ? tokens[cursor + 2]?.value : imported.value;
          if (moduleName === "google" && imported.value === "genai") {
            googleNamespaces.add(local);
          } else if (moduleName === "os" && imported.value === "getenv") {
            pythonGetenvFunctions.add(local);
          } else if (moduleName === "os" && imported.value === "environ") {
            pythonEnvironObjects.add(local);
          } else {
            pythonGetenvFunctions.delete(local);
            pythonEnvironObjects.delete(local);
            addNamedImport(moduleName, imported.value, local);
          }
          cursor += local === imported.value ? 1 : 3;
        }
      } else if (isIdentifier(tokens[index], "import") && tokens[index + 1]?.kind === "identifier") {
        const importedModule = tokens[index + 1]?.value;
        const local = tokens[index + 2]?.value === "as" && tokens[index + 3]?.kind === "identifier" ? tokens[index + 3]?.value : importedModule;
        if (importedModule === "boto3")
          boto3Namespaces.add(local);
        else if (importedModule === "os")
          pythonOsNamespaces.add(local);
      }
    }
  }
  const importedNames = new Set([
    ...constructors.keys(),
    ...awsCommands.keys(),
    ...googleNamespaces,
    ...boto3Namespaces,
    ...pythonOsNamespaces,
    ...pythonGetenvFunctions,
    ...pythonEnvironObjects
  ]);
  const shadowed = new Set;
  for (const name of functionParameterNames(tokens, language)) {
    if (importedNames.has(name))
      shadowed.add(name);
  }
  const inspectParameters = (open, close) => {
    let depth = 0;
    for (let index = open + 1;index < close; index += 1) {
      const value = structuralValue(tokens[index]);
      if (["(", "[", "{"].includes(value ?? ""))
        depth += 1;
      else if ([")", "]", "}"].includes(value ?? ""))
        depth = Math.max(0, depth - 1);
      if (depth === 0 && tokens[index]?.kind === "identifier" && importedNames.has(value ?? "") && (structuralValue(tokens[index - 1]) === "(" || structuralValue(tokens[index - 1]) === ",")) {
        shadowed.add(value);
      }
    }
  };
  for (let index = 0;index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = token?.value;
    if (token?.kind === "identifier" && (value === "function" || value === "def") && tokens[index + 1]?.kind === "identifier") {
      let open = index + 2;
      while (open < Math.min(tokens.length, index + 12) && structuralValue(tokens[open]) !== "(") {
        open += 1;
      }
      if (structuralValue(tokens[open]) === "(") {
        const close = matchingIndex(tokens, open, "(", ")");
        if (close !== null)
          inspectParameters(open, close);
      }
    }
    if (language === "javascript" && structuralValue(token) === "=>") {
      if (tokens[index - 1]?.kind === "identifier" && importedNames.has(tokens[index - 1]?.value ?? "")) {
        shadowed.add(tokens[index - 1]?.value);
      }
    }
    if (tokens[index]?.kind === "identifier" && importedNames.has(value ?? "") && tokens[index + 1]?.value === "=" && !isIdentifier(tokens[index + 2], "require")) {
      shadowed.add(value);
    }
    if ((isIdentifier(tokens[index - 1], "class") || isIdentifier(tokens[index - 1], "function")) && importedNames.has(value ?? "")) {
      shadowed.add(value);
    }
  }
  for (const name of shadowed) {
    constructors.delete(name);
    awsCommands.delete(name);
    googleNamespaces.delete(name);
    boto3Namespaces.delete(name);
    pythonOsNamespaces.delete(name);
    pythonGetenvFunctions.delete(name);
    pythonEnvironObjects.delete(name);
  }
  return {
    constructors,
    awsCommands,
    googleNamespaces,
    boto3Namespaces,
    pythonOsNamespaces,
    pythonGetenvFunctions,
    pythonEnvironObjects
  };
}
function chainBefore(tokens, openIndex) {
  const chain = [];
  let index = openIndex - 1;
  if (tokens[index]?.kind !== "identifier")
    return chain;
  chain.unshift(tokens[index]?.value);
  index -= 1;
  while (index >= 1 && (tokens[index]?.value === "." || tokens[index]?.value === "?.")) {
    const identifier = tokens[index - 1];
    if (identifier?.kind !== "identifier")
      break;
    chain.unshift(identifier.value);
    index -= 2;
  }
  return chain;
}
function propertyValueIndex(tokens, start, end, property, separator) {
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  for (let index = start;index < end - 1; index += 1) {
    const value = structuralValue(tokens[index]);
    if (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0 && isPropertyNameAt(tokens, index, property) && structuralValue(tokens[index + 1]) === separator) {
      return index + 2;
    }
    if (value === "{")
      braceDepth += 1;
    else if (value === "}")
      braceDepth = Math.max(0, braceDepth - 1);
    else if (value === "[")
      bracketDepth += 1;
    else if (value === "]")
      bracketDepth = Math.max(0, bracketDepth - 1);
    else if (value === "(")
      parenDepth += 1;
    else if (value === ")")
      parenDepth = Math.max(0, parenDepth - 1);
  }
  return null;
}
function directObjectPropertyValueIndex(tokens, start, end, property, separator) {
  if (structuralValue(tokens[start]) !== "{")
    return null;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  for (let index = start + 1;index < end - 1; index += 1) {
    const value = structuralValue(tokens[index]);
    if (value === "{")
      braceDepth += 1;
    else if (value === "}") {
      if (braceDepth === 0)
        break;
      braceDepth -= 1;
    } else if (value === "[")
      bracketDepth += 1;
    else if (value === "]")
      bracketDepth = Math.max(0, bracketDepth - 1);
    else if (value === "(")
      parenDepth += 1;
    else if (value === ")")
      parenDepth = Math.max(0, parenDepth - 1);
    if (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0 && isPropertyNameAt(tokens, index, property) && structuralValue(tokens[index + 1]) === separator) {
      return index + 2;
    }
  }
  return null;
}
function directArgumentPropertyValueIndex(tokens, start, end, property, separator, language) {
  if (language === "javascript") {
    return directObjectPropertyValueIndex(tokens, start, end, property, separator);
  }
  return propertyValueIndex(tokens, start, end, property, separator);
}
function constructorArguments(tokens, classIndex) {
  const open = classIndex + 1;
  if (structuralValue(tokens[open]) !== "(")
    return [];
  const close = matchingIndex(tokens, open, "(", ")");
  return close === null ? [] : tokens.slice(open + 1, close);
}
function recognizedEndpointPlatform(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    return;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (hostname === "api.openai.com")
    return "openai";
  if (hostname.endsWith(".openai.azure.com") || hostname.endsWith(".cognitiveservices.azure.com")) {
    return "azure";
  }
  if (hostname === "api.anthropic.com")
    return "anthropic";
  if (hostname === "generativelanguage.googleapis.com")
    return "google";
  if (hostname === "aiplatform.googleapis.com" || /^[a-z0-9-]+-aiplatform\.googleapis\.com$/u.test(hostname)) {
    return "google-vertex";
  }
  if (/^bedrock-runtime(?:-fips)?\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/u.test(hostname)) {
    return "aws-bedrock";
  }
  return;
}
function endpointSignal(tokens) {
  const endpointProperties = new Set([
    "baseURL",
    "baseUrl",
    "base_url",
    "endpoint",
    "endpoint_url",
    "azure_endpoint",
    "api_endpoint"
  ]);
  const indices = [];
  for (let index = 0;index < tokens.length - 2; index += 1) {
    const property = tokens[index]?.value;
    if (property !== undefined && endpointProperties.has(property) && isPropertyNameAt(tokens, index, property) && (structuralValue(tokens[index + 1]) === ":" || structuralValue(tokens[index + 1]) === "=")) {
      indices.push(index + 2);
    }
  }
  if (indices.length === 0)
    return { present: false, safe: true };
  const platforms = new Set;
  for (const index of indices) {
    const token = tokens[index];
    if (token?.kind !== "string" || !token.static || !isCompleteDirectValue(tokens, index)) {
      return { present: true, safe: false };
    }
    const platform3 = recognizedEndpointPlatform(token.value);
    if (platform3 === undefined)
      return { present: true, safe: false };
    platforms.add(platform3);
  }
  if (platforms.size !== 1)
    return { present: true, safe: false };
  const platform2 = platforms.values().next().value;
  return platform2 === undefined ? { present: true, safe: false } : { present: true, platform: platform2, safe: true };
}
function resolvedClientPlatform(input) {
  const endpoint = endpointSignal(input.arguments);
  if (!endpoint.safe)
    return { platformResolution: "unknown", endpointSafe: false };
  if (!endpoint.present) {
    return input.defaultPlatform === undefined ? { platformResolution: "ambiguous", endpointSafe: true } : {
      servingPlatform: input.defaultPlatform,
      platformResolution: "resolved",
      endpointSafe: true
    };
  }
  const endpointPlatform = endpoint.platform;
  const acceptsEndpointOverride = input.integration === "openai" && input.canonicalName === "OpenAI" && (endpointPlatform === "openai" || endpointPlatform === "azure");
  if (acceptsEndpointOverride || endpointPlatform === input.defaultPlatform) {
    return {
      servingPlatform: endpointPlatform,
      platformResolution: "resolved",
      endpointSafe: true
    };
  }
  return { platformResolution: "ambiguous", endpointSafe: false };
}
function clientBindings(tokens, language) {
  const bindings = new Map;
  const imports = importProvenance(tokens, language);
  const conflictedBindings = new Set;
  const setBinding = (binding) => {
    if (conflictedBindings.has(binding.variable))
      return;
    const existing = bindings.get(binding.variable);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(binding)) {
      bindings.delete(binding.variable);
      conflictedBindings.add(binding.variable);
      return;
    }
    bindings.set(binding.variable, binding);
  };
  const googlePlatform = (arguments_) => {
    const endpoint = endpointSignal(arguments_);
    if (!endpoint.safe)
      return { platformResolution: "unknown", endpointSafe: false };
    const separator = language === "javascript" ? ":" : "=";
    const vertexIndex = directArgumentPropertyValueIndex(arguments_, 0, arguments_.length, "vertexai", separator, language);
    const apiKeyIndex = directArgumentPropertyValueIndex(arguments_, 0, arguments_.length, language === "javascript" ? "apiKey" : "api_key", separator, language);
    const candidates = new Set;
    if (vertexIndex !== null) {
      const valueToken = arguments_[vertexIndex];
      const value = valueToken?.kind === "identifier" ? valueToken.value : undefined;
      if (!isCompleteDirectValue(arguments_, vertexIndex)) {
        return { platformResolution: "ambiguous", endpointSafe: true };
      }
      if (value === "true" || value === "True")
        candidates.add("google-vertex");
      else if (value === "false" || value === "False")
        candidates.add("google");
      else
        return { platformResolution: "ambiguous", endpointSafe: true };
    }
    if (apiKeyIndex !== null)
      candidates.add("google");
    if (endpoint.present) {
      if (endpoint.platform !== "google" && endpoint.platform !== "google-vertex") {
        return { platformResolution: "ambiguous", endpointSafe: false };
      }
      candidates.add(endpoint.platform);
    }
    if (candidates.size !== 1) {
      return { platformResolution: "ambiguous", endpointSafe: true };
    }
    return {
      servingPlatform: candidates.values().next().value,
      platformResolution: "resolved",
      endpointSafe: true
    };
  };
  for (let index = 0;index < tokens.length; index += 1) {
    const token = tokens[index];
    const isNew = language === "javascript" && isIdentifier(token, "new");
    const classIndex = isNew ? index + 1 : index;
    const localClassName = tokens[classIndex]?.value;
    if (tokens[classIndex]?.kind !== "identifier" || localClassName === undefined)
      continue;
    const imported = imports.constructors.get(localClassName);
    if (imported === undefined)
      continue;
    let variable;
    if (isNew) {
      if (tokens[index - 1]?.value === "=" && tokens[index - 2]?.kind === "identifier") {
        variable = tokens[index - 2]?.value;
      }
    } else if (language === "python" && tokens[index - 1]?.value === "=" && tokens[index - 2]?.kind === "identifier") {
      variable = tokens[index - 2]?.value;
    }
    if (variable === undefined)
      continue;
    const arguments_ = constructorArguments(tokens, classIndex);
    if (imported.integration === "openai") {
      const platform2 = imported.canonicalName.includes("Azure") ? "azure" : "openai";
      const resolution = resolvedClientPlatform({
        integration: "openai",
        canonicalName: imported.canonicalName,
        defaultPlatform: platform2,
        arguments: arguments_,
        language
      });
      const selectorPlatform = resolution.servingPlatform ?? platform2;
      setBinding({
        variable,
        integration: "openai",
        ...resolution,
        selectorKind: selectorPlatform === "azure" ? "deployment-name" : selectorPlatform === "aws-bedrock" ? "polymorphic" : "model-id"
      });
    } else if (imported.integration === "anthropic") {
      const resolution = resolvedClientPlatform({
        integration: "anthropic",
        canonicalName: imported.canonicalName,
        defaultPlatform: "anthropic",
        arguments: arguments_,
        language
      });
      setBinding({
        variable,
        integration: "anthropic",
        ...resolution,
        selectorKind: "model-id"
      });
    } else if (imported.integration === "google") {
      setBinding({
        variable,
        integration: "google",
        ...googlePlatform(arguments_),
        selectorKind: "model-id"
      });
    } else if (imported.integration === "aws-bedrock") {
      const resolution = resolvedClientPlatform({
        integration: "aws-bedrock",
        canonicalName: imported.canonicalName,
        defaultPlatform: "aws-bedrock",
        arguments: arguments_,
        language
      });
      setBinding({
        variable,
        integration: "aws-bedrock",
        ...resolution,
        selectorKind: "polymorphic"
      });
    }
  }
  if (language === "python") {
    for (let index = 0;index < tokens.length - 5; index += 1) {
      if (tokens[index]?.kind === "identifier" && tokens[index + 1]?.value === "=" && imports.googleNamespaces.has(tokens[index + 2]?.value ?? "") && tokens[index + 3]?.value === "." && tokens[index + 4]?.value === "Client" && structuralValue(tokens[index + 5]) === "(") {
        const close = matchingIndex(tokens, index + 5, "(", ")");
        const arguments_ = close === null ? [] : tokens.slice(index + 6, close);
        setBinding({
          variable: tokens[index]?.value,
          integration: "google",
          ...googlePlatform(arguments_),
          selectorKind: "model-id"
        });
      }
    }
    for (let index = 0;index < tokens.length - 6; index += 1) {
      if (tokens[index]?.kind === "identifier" && tokens[index + 1]?.value === "=" && imports.boto3Namespaces.has(tokens[index + 2]?.value ?? "") && tokens[index + 3]?.value === "." && tokens[index + 4]?.value === "client" && structuralValue(tokens[index + 5]) === "(" && tokens[index + 6]?.kind === "string" && tokens[index + 6]?.value === "bedrock-runtime") {
        const close = matchingIndex(tokens, index + 5, "(", ")");
        const arguments_ = close === null ? [] : tokens.slice(index + 6, close);
        const resolution = resolvedClientPlatform({
          integration: "aws-bedrock",
          canonicalName: "boto3.client",
          defaultPlatform: "aws-bedrock",
          arguments: arguments_,
          language
        });
        setBinding({
          variable: tokens[index]?.value,
          integration: "aws-bedrock",
          ...resolution,
          selectorKind: "polymorphic"
        });
      }
    }
  }
  const parameterNames = functionParameterNames(tokens, language);
  const assignmentCounts = new Map;
  for (let index = 0;index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token?.kind === "identifier" && tokens[index + 1]?.value === "=") {
      assignmentCounts.set(token.value, (assignmentCounts.get(token.value) ?? 0) + 1);
    }
  }
  for (const [variable] of bindings) {
    const assignments = assignmentCounts.get(variable) ?? 0;
    if (assignments > 1 || parameterNames.has(variable)) {
      bindings.delete(variable);
    }
  }
  return { bindings, imports };
}
function shadowedJavascriptEnvironmentGlobals(tokens) {
  const candidates = new Set(["process", "Bun", "Deno"]);
  const shadowed = new Set;
  for (const name of functionParameterNames(tokens, "javascript")) {
    if (candidates.has(name))
      shadowed.add(name);
  }
  for (let index = 0;index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "identifier" || !candidates.has(token.value))
      continue;
    const previous = tokens[index - 1]?.value;
    if (["const", "let", "var", "class", "function", "import"].includes(previous ?? "") || tokens[index + 1]?.value === "=") {
      shadowed.add(token.value);
    }
  }
  return shadowed;
}
function withTrailingEnvironmentFallback(tokens, expressionEnd, language, reference) {
  if (language === "javascript") {
    if (tokens[expressionEnd]?.value === "??") {
      return { ...reference, fallbackIndex: expressionEnd + 1 };
    }
    if (tokens[expressionEnd]?.value === "|" && tokens[expressionEnd + 1]?.value === "|") {
      return { ...reference, fallbackIndex: expressionEnd + 2 };
    }
  } else if (tokens[expressionEnd]?.value === "or") {
    return { ...reference, fallbackIndex: expressionEnd + 1 };
  }
  return reference;
}
function environmentCallReference(tokens, openIndex, allowArgumentFallback) {
  if (tokens[openIndex]?.value !== "(")
    return;
  const close = matchingIndex(tokens, openIndex, "(", ")");
  const name = tokens[openIndex + 1];
  if (close === null || name?.kind !== "string" || !name.static || !ENVIRONMENT_NAME.test(name.value)) {
    return;
  }
  if (structuralValue(tokens[openIndex + 2]) === ")") {
    return { reference: { variable: name.value }, expressionEnd: close + 1 };
  }
  if (!allowArgumentFallback || tokens[openIndex + 2]?.value !== ",")
    return;
  const fallbackIndex = openIndex + 3;
  if (fallbackIndex + 1 !== close)
    return;
  return {
    reference: { variable: name.value, fallbackIndex },
    expressionEnd: close + 1
  };
}
function environmentReferenceAt(tokens, valueIndex, language, imports, shadowedJavascriptGlobals) {
  const root = tokens[valueIndex]?.value;
  if (language === "javascript") {
    if ((root === "process" || root === "Bun") && !shadowedJavascriptGlobals.has(root) && tokens[valueIndex + 1]?.value === "." && tokens[valueIndex + 2]?.value === "env") {
      if (tokens[valueIndex + 3]?.value === "." && tokens[valueIndex + 4]?.kind === "identifier" && ENVIRONMENT_NAME.test(tokens[valueIndex + 4]?.value ?? "")) {
        return withTrailingEnvironmentFallback(tokens, valueIndex + 5, language, { variable: tokens[valueIndex + 4]?.value });
      }
      if (structuralValue(tokens[valueIndex + 3]) === "[" && tokens[valueIndex + 4]?.kind === "string" && tokens[valueIndex + 4]?.static && ENVIRONMENT_NAME.test(tokens[valueIndex + 4]?.value ?? "") && structuralValue(tokens[valueIndex + 5]) === "]") {
        return withTrailingEnvironmentFallback(tokens, valueIndex + 6, language, { variable: tokens[valueIndex + 4]?.value });
      }
    }
    if (root === "Deno" && !shadowedJavascriptGlobals.has(root) && tokens[valueIndex + 1]?.value === "." && tokens[valueIndex + 2]?.value === "env" && tokens[valueIndex + 3]?.value === "." && tokens[valueIndex + 4]?.value === "get") {
      const call = environmentCallReference(tokens, valueIndex + 5, false);
      return call === undefined ? undefined : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
    }
    if (root === "import" && tokens[valueIndex + 1]?.value === "." && tokens[valueIndex + 2]?.value === "meta" && tokens[valueIndex + 3]?.value === "." && tokens[valueIndex + 4]?.value === "env" && tokens[valueIndex + 5]?.value === "." && tokens[valueIndex + 6]?.kind === "identifier" && ENVIRONMENT_NAME.test(tokens[valueIndex + 6]?.value ?? "")) {
      return withTrailingEnvironmentFallback(tokens, valueIndex + 7, language, { variable: tokens[valueIndex + 6]?.value });
    }
    return;
  }
  if (root !== undefined && imports.pythonOsNamespaces.has(root)) {
    if (tokens[valueIndex + 1]?.value === "." && tokens[valueIndex + 2]?.value === "getenv") {
      const call = environmentCallReference(tokens, valueIndex + 3, true);
      return call === undefined ? undefined : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
    }
    if (tokens[valueIndex + 1]?.value === "." && tokens[valueIndex + 2]?.value === "environ") {
      if (structuralValue(tokens[valueIndex + 3]) === "[" && tokens[valueIndex + 4]?.kind === "string" && tokens[valueIndex + 4]?.static && ENVIRONMENT_NAME.test(tokens[valueIndex + 4]?.value ?? "") && structuralValue(tokens[valueIndex + 5]) === "]") {
        return withTrailingEnvironmentFallback(tokens, valueIndex + 6, language, { variable: tokens[valueIndex + 4]?.value });
      }
      if (tokens[valueIndex + 3]?.value === "." && tokens[valueIndex + 4]?.value === "get") {
        const call = environmentCallReference(tokens, valueIndex + 5, true);
        return call === undefined ? undefined : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
      }
    }
  }
  if (root !== undefined && imports.pythonGetenvFunctions.has(root)) {
    const call = environmentCallReference(tokens, valueIndex + 1, true);
    return call === undefined ? undefined : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
  }
  if (root !== undefined && imports.pythonEnvironObjects.has(root)) {
    if (structuralValue(tokens[valueIndex + 1]) === "[" && tokens[valueIndex + 2]?.kind === "string" && tokens[valueIndex + 2]?.static && ENVIRONMENT_NAME.test(tokens[valueIndex + 2]?.value ?? "") && structuralValue(tokens[valueIndex + 3]) === "]") {
      return withTrailingEnvironmentFallback(tokens, valueIndex + 4, language, { variable: tokens[valueIndex + 2]?.value });
    }
    if (tokens[valueIndex + 1]?.value === "." && tokens[valueIndex + 2]?.value === "get") {
      const call = environmentCallReference(tokens, valueIndex + 3, true);
      return call === undefined ? undefined : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
    }
  }
  return;
}
function requestScopedBinding(binding, requestArguments) {
  if (binding.integration !== "google")
    return binding;
  const endpoint = endpointSignal(requestArguments);
  if (!endpoint.present)
    return binding;
  if (!endpoint.safe || endpoint.platform !== "google" && endpoint.platform !== "google-vertex") {
    return {
      variable: binding.variable,
      integration: binding.integration,
      platformResolution: "unknown",
      selectorKind: binding.selectorKind,
      endpointSafe: false
    };
  }
  if (binding.platformResolution === "resolved" && binding.servingPlatform !== endpoint.platform) {
    return {
      variable: binding.variable,
      integration: binding.integration,
      platformResolution: "ambiguous",
      selectorKind: binding.selectorKind,
      endpointSafe: false
    };
  }
  return {
    variable: binding.variable,
    integration: binding.integration,
    servingPlatform: endpoint.platform,
    platformResolution: "resolved",
    selectorKind: binding.selectorKind,
    endpointSafe: true
  };
}
function guardIntegrationSelector(binding, resolved) {
  if (binding.integration !== "google" || resolved.modelResolution !== "resolved" || resolved.modelId === undefined || !resolved.modelId.includes("/")) {
    return resolved;
  }
  const { modelId: _modelId, ...unresolved } = resolved;
  return {
    ...unresolved,
    modelResolution: "unresolved",
    selectorKind: "resource-name",
    trace: [
      ...resolved.trace,
      {
        kind: "detector",
        detail: "Google resource, tuned-model, and publisher paths are not exact model IDs"
      }
    ]
  };
}
function methodRule(binding, chain) {
  const tail = chain.slice(1).join(".");
  if (binding.integration === "openai") {
    const accepted = new Set([
      "responses.create",
      "responses.stream",
      "chat.completions.create",
      "chat.completions.stream",
      "embeddings.create",
      "images.generate",
      "images.edit",
      "audio.speech.create",
      "audio.transcriptions.create",
      "audio.translations.create"
    ]);
    return accepted.has(tail) ? {
      ruleId: chain[0] !== undefined && binding.variable === chain[0] ? "request-model" : "request-model",
      property: "model"
    } : null;
  }
  if (binding.integration === "anthropic") {
    return new Set(["messages.create", "messages.stream", "messages.countTokens", "messages.count_tokens"]).has(tail) ? { ruleId: "messages-model", property: "model" } : null;
  }
  if (binding.integration === "google") {
    return new Set([
      "models.generateContent",
      "models.generateContentStream",
      "models.generate_content",
      "models.generate_content_stream"
    ]).has(tail) ? { ruleId: "generate-model", property: "model" } : null;
  }
  if (binding.integration === "aws-bedrock") {
    if (new Set(["invoke_model", "invoke_model_with_response_stream"]).has(tail)) {
      return { ruleId: "invoke-model", property: "modelId" };
    }
    if (new Set(["converse", "converse_stream"]).has(tail)) {
      return { ruleId: "converse-model", property: "modelId" };
    }
  }
  return null;
}
function semanticRuleId(language, integration, rule) {
  const languageId = language === "javascript" ? "ts" : "py";
  if (integration === "openai")
    return `source.${languageId}.openai.${rule}@1`;
  if (integration === "anthropic")
    return `source.${languageId}.anthropic.${rule}@1`;
  if (integration === "google")
    return `source.${languageId}.google-genai.${rule}@1`;
  return `source.${languageId}.aws-bedrock.${rule}@1`;
}
function makeEvidenceId(ruleId, path, anchor, rawValue, occurrence) {
  return canonicalSha256("ai-model-eol/semantic-evidence/v3", [
    ruleId,
    path,
    anchor,
    rawValue,
    occurrence
  ]);
}
function createSemanticFact(input) {
  const environment = input.scope === "test" ? "test" : "unknown";
  const policyEligible = DIRECT_POLICY_RULES.has(input.ruleId) && input.binding.endpointSafe && input.binding.platformResolution === "resolved" && input.binding.selectorKind === "model-id" && input.resolved.modelResolution === "resolved" && input.resolved.selectorKind === "model-id" && input.scope !== "test" && input.scope !== "example" && input.scope !== "documentation";
  return {
    evidenceId: makeEvidenceId(input.ruleId, input.path, input.anchor, input.resolved.rawValue, input.occurrence),
    origin: "repository",
    kind: "sdk-argument",
    confidence: "high",
    scope: input.scope,
    environment,
    detectorRuleId: input.ruleId,
    detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
    rawValue: input.resolved.rawValue,
    ...input.resolved.modelId === undefined ? {} : { modelId: input.resolved.modelId },
    ...input.binding.servingPlatform === undefined ? {} : { servingPlatform: input.binding.servingPlatform },
    modelResolution: input.resolved.modelResolution,
    selectorKind: input.resolved.selectorKind,
    platformResolution: input.binding.platformResolution,
    policyEligible,
    locations: [
      {
        path: input.path,
        line: input.token.line,
        column: input.token.column,
        blobOid: input.blobOid
      }
    ],
    resolutionTrace: [
      { kind: "detector", detail: input.anchor },
      ...input.resolved.trace
    ]
  };
}
function directSemanticLiteralSpan(token, resolved) {
  if (token.kind !== "string" || !token.static || resolved.modelResolution !== "resolved" || resolved.modelId === undefined || token.value !== resolved.modelId) {
    return;
  }
  const quote = token.raw[0];
  if (quote !== "'" && quote !== '"' && quote !== "`")
    return;
  const quoteLength = token.raw.startsWith(quote.repeat(3)) ? 3 : 1;
  const literalContent = token.raw.slice(quoteLength, -quoteLength);
  if (literalContent !== resolved.modelId)
    return;
  const startOffset = token.offset + quoteLength;
  return {
    modelId: resolved.modelId,
    startOffset,
    endOffset: startOffset + literalContent.length
  };
}
function detectSdkCalls(source, path, blobOid, language, scope, jsx = false) {
  const tokenization = tokenize(source, language, jsx);
  if (tokenization.issue !== undefined) {
    return {
      facts: [],
      consumedEnvironmentSelectors: [],
      literalSpans: [],
      tokenizationIssue: tokenization.issue
    };
  }
  const tokens = tokenization.tokens;
  const constants = collectConstants(tokens, language);
  const analyzedClients = clientBindings(tokens, language);
  const bindings = analyzedClients.bindings;
  const facts = [];
  const consumedEnvironmentSelectors = [];
  const literalSpans = [];
  const shadowedEnvironmentGlobals = language === "javascript" ? shadowedJavascriptEnvironmentGlobals(tokens) : new Set;
  const recordConsumedEnvironment = (fact, binding, resolved) => {
    if (resolved.environmentVariable === undefined)
      return;
    const location = fact.locations[0];
    if (location === undefined)
      return;
    consumedEnvironmentSelectors.push({
      variable: resolved.environmentVariable,
      ruleId: fact.detectorRuleId,
      scope: fact.scope,
      environment: fact.environment,
      binding,
      location
    });
  };
  const occurrenceByAnchor = new Map;
  for (let openIndex = 0;openIndex < tokens.length; openIndex += 1) {
    if (structuralValue(tokens[openIndex]) !== "(")
      continue;
    const chain = chainBefore(tokens, openIndex);
    const binding = chain[0] === undefined ? undefined : bindings.get(chain[0]);
    if (binding === undefined)
      continue;
    const rule = methodRule(binding, chain);
    if (rule === null)
      continue;
    const closeIndex = matchingIndex(tokens, openIndex, "(", ")");
    if (closeIndex === null)
      continue;
    const separator = language === "javascript" ? ":" : "=";
    const valueIndex = directArgumentPropertyValueIndex(tokens, openIndex + 1, closeIndex, rule.property, separator, language);
    if (valueIndex === null)
      continue;
    const valueToken = tokens[valueIndex];
    if (valueToken === undefined)
      continue;
    const effectiveBinding = requestScopedBinding(binding, tokens.slice(openIndex + 1, closeIndex));
    const environmentReference = environmentReferenceAt(tokens, valueIndex, language, analyzedClients.imports, shadowedEnvironmentGlobals);
    const resolved = guardIntegrationSelector(effectiveBinding, resolveTokenValue(tokens, valueIndex, constants, effectiveBinding.selectorKind, environmentReference));
    const ruleId = semanticRuleId(language, binding.integration, rule.ruleId);
    const anchor = chain.join(".");
    const occurrence = occurrenceByAnchor.get(anchor) ?? 0;
    occurrenceByAnchor.set(anchor, occurrence + 1);
    const fact = createSemanticFact({
      ruleId,
      path,
      blobOid,
      scope,
      token: valueToken,
      binding: effectiveBinding,
      resolved,
      occurrence,
      anchor
    });
    facts.push(fact);
    const literalSpan = directSemanticLiteralSpan(valueToken, resolved);
    if (literalSpan !== undefined)
      literalSpans.push(literalSpan);
    recordConsumedEnvironment(fact, effectiveBinding, resolved);
    assertEvidenceBudget(facts.length);
  }
  if (language === "javascript" && analyzedClients.imports.awsCommands.size > 0) {
    const commands = {
      InvokeModelCommand: { rule: "invoke-model", property: "modelId" },
      InvokeModelWithResponseStreamCommand: { rule: "invoke-model", property: "modelId" },
      ConverseCommand: { rule: "converse-model", property: "modelId" },
      ConverseStreamCommand: { rule: "converse-model", property: "modelId" }
    };
    for (let index = 0;index < tokens.length - 3; index += 1) {
      if (!isIdentifier(tokens[index], "new"))
        continue;
      const canonicalCommand = analyzedClients.imports.awsCommands.get(tokens[index + 1]?.value ?? "");
      const command = canonicalCommand === undefined ? undefined : commands[canonicalCommand];
      if (command === undefined || tokens[index + 2]?.value !== "(")
        continue;
      const close = matchingIndex(tokens, index + 2, "(", ")");
      if (close === null)
        continue;
      const valueIndex = directArgumentPropertyValueIndex(tokens, index + 3, close, command.property, ":", language);
      if (valueIndex === null || tokens[valueIndex] === undefined)
        continue;
      const awsClients = [...bindings.values()].filter((binding2) => binding2.integration === "aws-bedrock");
      const clientSignatures = new Set(awsClients.map((binding2) => JSON.stringify([
        binding2.servingPlatform ?? null,
        binding2.platformResolution,
        binding2.endpointSafe
      ])));
      const sourceBinding = awsClients.length > 0 && clientSignatures.size === 1 ? awsClients[0] : undefined;
      const binding = sourceBinding === undefined ? {
        variable: tokens[index + 1]?.value,
        integration: "aws-bedrock",
        platformResolution: awsClients.length > 1 ? "ambiguous" : "unknown",
        selectorKind: "polymorphic",
        endpointSafe: false
      } : {
        ...sourceBinding,
        variable: tokens[index + 1]?.value,
        selectorKind: "polymorphic"
      };
      const ruleId = semanticRuleId(language, "aws-bedrock", command.rule);
      const environmentReference = environmentReferenceAt(tokens, valueIndex, language, analyzedClients.imports, shadowedEnvironmentGlobals);
      const resolved = resolveTokenValue(tokens, valueIndex, constants, "polymorphic", environmentReference);
      const fact = createSemanticFact({
        ruleId,
        path,
        blobOid,
        scope,
        token: tokens[valueIndex],
        binding,
        resolved,
        occurrence: facts.length,
        anchor: canonicalCommand
      });
      facts.push(fact);
      const literalSpan = directSemanticLiteralSpan(tokens[valueIndex], resolved);
      if (literalSpan !== undefined)
        literalSpans.push(literalSpan);
      recordConsumedEnvironment(fact, binding, resolved);
      assertEvidenceBudget(facts.length);
    }
  }
  return { facts, consumedEnvironmentSelectors, literalSpans };
}
function terraformStringAttribute(tokens, valueIndex, blockClose) {
  if (valueIndex === null)
    return { state: "absent" };
  const token = tokens[valueIndex];
  if (token?.kind !== "string" || token.raw[0] !== '"' || !token.static) {
    return { state: "non-static" };
  }
  const nextIndex = valueIndex + 1;
  const next = tokens[nextIndex];
  const followedByAttribute = next !== undefined && next.line > token.line && next.kind === "identifier" && structuralValue(tokens[nextIndex + 1]) === "=";
  if (nextIndex !== blockClose && !followedByAttribute) {
    return { state: "non-static" };
  }
  return { state: "static", token, value: token.value };
}
function detectTerraform(source, path, blobOid, scope) {
  const tokenization = tokenize(source, "hcl");
  if (tokenization.issue !== undefined) {
    return { facts: [], tokenizationIssue: tokenization.issue };
  }
  const tokens = tokenization.tokens;
  const facts = [];
  for (let index = 0;index < tokens.length - 3; index += 1) {
    if (!isIdentifier(tokens[index], "resource") || tokens[index + 1]?.kind !== "string" || tokens[index + 1]?.value !== "azurerm_cognitive_deployment") {
      continue;
    }
    const blockOpen = tokens.findIndex((token, tokenIndex) => tokenIndex > index + 1 && structuralValue(token) === "{");
    if (blockOpen < 0)
      continue;
    const blockClose = matchingIndex(tokens, blockOpen, "{", "}");
    if (blockClose === null)
      continue;
    let modelOpen = -1;
    for (let cursor = blockOpen + 1;cursor < blockClose - 1; cursor += 1) {
      if (isIdentifier(tokens[cursor], "model") && structuralValue(tokens[cursor + 1]) === "{") {
        modelOpen = cursor + 1;
        break;
      }
    }
    if (modelOpen < 0)
      continue;
    const modelClose = matchingIndex(tokens, modelOpen, "{", "}");
    if (modelClose === null)
      continue;
    const nameIndex = propertyValueIndex(tokens, modelOpen + 1, modelClose, "name", "=");
    const formatIndex = propertyValueIndex(tokens, modelOpen + 1, modelClose, "format", "=");
    const versionIndex = propertyValueIndex(tokens, modelOpen + 1, modelClose, "version", "=");
    const name = terraformStringAttribute(tokens, nameIndex, modelClose);
    const format = terraformStringAttribute(tokens, formatIndex, modelClose);
    const version = terraformStringAttribute(tokens, versionIndex, modelClose);
    if (name.state !== "static" || format.state !== "static" || version.state === "non-static") {
      continue;
    }
    const rawValue = JSON.stringify([
      format.value,
      name.value,
      version.state === "static" ? version.value : null
    ]);
    const ruleId = "deploy.hcl.azure.cognitive-deployment-model@1";
    facts.push({
      evidenceId: makeEvidenceId(ruleId, path, "azurerm_cognitive_deployment.model", rawValue, facts.length),
      origin: "repository",
      kind: "deployment-resource",
      confidence: "high",
      scope,
      environment: "unknown",
      detectorRuleId: ruleId,
      detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
      rawValue,
      servingPlatform: "azure",
      modelResolution: "unresolved",
      selectorKind: "deployment-name",
      platformResolution: "resolved",
      policyEligible: false,
      locations: [{ path, line: name.token.line, column: name.token.column, blobOid }],
      resolutionTrace: [
        {
          kind: "detector",
          detail: "static Azure cognitive deployment model tuple; trusted resolution required"
        }
      ]
    });
    assertEvidenceBudget(facts.length);
  }
  return { facts };
}
function pathSegments(path) {
  return path.toLowerCase().split("/");
}
function classifyEvidenceScope(path, semantic = false) {
  const lower = path.toLowerCase();
  const segments = pathSegments(path);
  const extension = import_node_path.extname(lower);
  if (extension === ".md" || extension === ".mdx" || segments.some((segment) => ["docs", "doc", "documentation"].includes(segment))) {
    return "documentation";
  }
  const fileName = segments.at(-1) ?? "";
  if (segments.some((segment) => ["test", "tests", "__tests__", "spec", "fixtures"].includes(segment)) || /\.(?:test|spec)\.[^.]+$/u.test(fileName)) {
    return "test";
  }
  if (segments.some((segment) => ["example", "examples", "demo", "demos", "sample", "samples"].includes(segment))) {
    return "example";
  }
  if (segments.some((segment) => ["dist", "build", "generated", "out", "archive", "archived", "legacy", "vendor"].includes(segment))) {
    return "unknown";
  }
  if (HCL_EXTENSIONS.has(extension))
    return "deployment";
  if (semantic || SOURCE_EXTENSIONS.has(extension))
    return "application";
  return "unknown";
}
function lexicalCandidates(index) {
  const byId = new Map;
  for (const pair of index.lexicalModelPairs) {
    const pairs = byId.get(pair.modelId) ?? [];
    pairs.push(pair);
    byId.set(pair.modelId, pairs);
  }
  return [...byId.entries()].map(([modelId2, pairs]) => ({
    modelId: modelId2,
    codePointLength: [...modelId2].length,
    pairs: pairs.sort((left, right) => compareText5(left.servingPlatform, right.servingPlatform))
  })).sort((left, right) => compareText5(left.modelId, right.modelId));
}
function buildAutomaton(candidates) {
  const nodes = [{ transitions: new Map, failure: 0, outputs: [] }];
  for (let candidateIndex = 0;candidateIndex < candidates.length; candidateIndex += 1) {
    let state = 0;
    for (const character of candidates[candidateIndex]?.modelId ?? "") {
      let next = nodes[state]?.transitions.get(character);
      if (next === undefined) {
        next = nodes.length;
        nodes.push({ transitions: new Map, failure: 0, outputs: [] });
        nodes[state]?.transitions.set(character, next);
      }
      state = next;
    }
    nodes[state]?.outputs.push(candidateIndex);
  }
  const queue = [];
  for (const state of nodes[0]?.transitions.values() ?? [])
    queue.push(state);
  for (let queueIndex = 0;queueIndex < queue.length; queueIndex += 1) {
    const state = queue[queueIndex];
    for (const [character, next] of nodes[state]?.transitions ?? []) {
      queue.push(next);
      let fallback = nodes[state]?.failure ?? 0;
      while (fallback !== 0 && !nodes[fallback]?.transitions.has(character)) {
        fallback = nodes[fallback]?.failure ?? 0;
      }
      const transition = nodes[fallback]?.transitions.get(character);
      nodes[next].failure = transition === undefined || transition === next ? 0 : transition;
      nodes[next].outputs.push(...nodes[nodes[next].failure]?.outputs ?? []);
    }
  }
  return nodes;
}
function identifierCharacter(value) {
  return value !== undefined && IDENTIFIER_CHARACTER.test(value);
}
function characterAt(source, index) {
  if (index < 0 || index >= source.length)
    return;
  const codePoint = source.codePointAt(index);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}
function characterBefore(source, index) {
  if (index <= 0)
    return;
  let start = index - 1;
  const unit = source.charCodeAt(start);
  if (unit >= 56320 && unit <= 57343 && start > 0)
    start -= 1;
  return characterAt(source, start);
}
function lexicalFacts(source, path, blobOid, candidates, automaton, semanticLiteralSpans = []) {
  const scope = classifyEvidenceScope(path);
  const facts = [];
  let state = 0;
  let offset = 0;
  let line = 1;
  let column = 1;
  const semanticSpans = new Set(semanticLiteralSpans.map((span) => JSON.stringify([span.modelId, span.startOffset, span.endOffset])));
  for (const character of source) {
    while (state !== 0 && !automaton[state]?.transitions.has(character)) {
      state = automaton[state]?.failure ?? 0;
    }
    state = automaton[state]?.transitions.get(character) ?? 0;
    for (const candidateIndex of automaton[state]?.outputs ?? []) {
      const candidate = candidates[candidateIndex];
      if (candidate === undefined)
        continue;
      const end = offset + character.length;
      const start = end - candidate.modelId.length;
      if (identifierCharacter(characterBefore(source, start)) || identifierCharacter(characterAt(source, end))) {
        continue;
      }
      if (semanticSpans.has(JSON.stringify([candidate.modelId, start, end])))
        continue;
      const platforms = [...new Set(candidate.pairs.map((pair) => pair.servingPlatform))];
      const platformResolution = platforms.length === 1 ? "resolved" : "ambiguous";
      const rawValue = candidate.modelId;
      facts.push({
        evidenceId: makeEvidenceId("fallback.text.lifecycle-id@1", path, candidate.modelId, rawValue, facts.length),
        origin: "repository",
        kind: "lexical",
        confidence: "low",
        scope,
        environment: scope === "test" ? "test" : "unknown",
        detectorRuleId: "fallback.text.lifecycle-id@1",
        detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
        rawValue,
        modelId: candidate.modelId,
        ...platforms.length === 1 ? { servingPlatform: platforms[0] } : {},
        modelResolution: "resolved",
        selectorKind: "model-id",
        platformResolution,
        policyEligible: false,
        locations: [
          {
            path,
            line,
            column: Math.max(1, column - candidate.codePointLength + 1),
            blobOid
          }
        ],
        resolutionTrace: [{ kind: "detector", detail: "exact typed-feed lexical fallback" }]
      });
      assertEvidenceBudget(facts.length);
    }
    offset += character.length;
    if (character === `
`) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return facts;
}
function parseDotenvLiteral(tail) {
  if (tail === "")
    return { value: "", contentOffset: 0 };
  const quote = tail[0];
  if (quote === "'" || quote === '"') {
    const close = tail.lastIndexOf(quote);
    if (close <= 0)
      return;
    const remainder = tail.slice(close + 1);
    if (!/^\s*(?:#.*)?$/u.test(remainder))
      return;
    const value = tail.slice(1, close);
    if (quote === '"' && value.includes("\\"))
      return;
    return { value, contentOffset: 1 };
  }
  const match = /^([^\s#]+)(?:\s+(?:#.*)?)?$/u.exec(tail);
  return match?.[1] === undefined ? undefined : { value: match[1], contentOffset: 0 };
}
function parseDotenvAssignments(source, path, blobOid, consumedNames, activeModelIds) {
  const assignments = [];
  const lines = source.split(/\r?\n/u);
  for (let lineIndex = 0;lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]{0,127})(\s*=\s*)(.*)$/u.exec(line);
    if (match === null)
      continue;
    const variable = match[2];
    if (!consumedNames.has(variable))
      continue;
    const tail = match[4];
    const literal = parseDotenvLiteral(tail);
    if (literal === undefined || !activeModelIds.has(literal.value))
      continue;
    const valueOffset = (match[1]?.length ?? 0) + variable.length + (match[3]?.length ?? 0) + literal.contentOffset;
    assignments.push({
      ruleId: "binding.env.consumed-model@1",
      variable,
      value: literal.value,
      path,
      blobOid,
      line: lineIndex + 1,
      column: [...line.slice(0, valueOffset)].length + 1
    });
  }
  return assignments;
}
function yamlMapValue(map, key) {
  if (!import_yaml2.isMap(map))
    return;
  for (const pair of map.items) {
    if (import_yaml2.isScalar(pair.key) && pair.key.value === key)
      return pair.value;
  }
  return;
}
function parseGithubWorkflowAssignments(source, path, blobOid, consumedNames, activeModelIds) {
  const lineCounter = new import_yaml2.LineCounter;
  const document = import_yaml2.parseDocument(source, {
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
    strict: true,
    lineCounter
  });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    return { assignments: [], invalid: true };
  }
  if (document.contents === null) {
    return { assignments: [], invalid: false };
  }
  if (!import_yaml2.isMap(document.contents)) {
    return { assignments: [], invalid: true };
  }
  const assignments = [];
  const inspectEnvMap = (node) => {
    if (!import_yaml2.isMap(node))
      return;
    for (const pair of node.items) {
      if (!import_yaml2.isScalar(pair.key) || typeof pair.key.value !== "string" || !consumedNames.has(pair.key.value) || !import_yaml2.isScalar(pair.value) || typeof pair.value.value !== "string" || !activeModelIds.has(pair.value.value)) {
        continue;
      }
      const start = pair.value.range?.[0];
      if (start === undefined)
        continue;
      const end = pair.value.range?.[1] ?? start;
      const raw = source.slice(start, end);
      const contentIndex = raw.indexOf(pair.value.value);
      const position = lineCounter.linePos(start + Math.max(0, contentIndex));
      assignments.push({
        ruleId: "binding.github-actions.consumed-model@1",
        variable: pair.key.value,
        value: pair.value.value,
        path,
        blobOid,
        line: position.line,
        column: position.col
      });
    }
  };
  inspectEnvMap(yamlMapValue(document.contents, "env"));
  const jobs = yamlMapValue(document.contents, "jobs");
  if (import_yaml2.isMap(jobs)) {
    for (const jobPair of jobs.items) {
      const job = jobPair.value;
      if (!import_yaml2.isMap(job))
        continue;
      inspectEnvMap(yamlMapValue(job, "env"));
      const steps = yamlMapValue(job, "steps");
      if (!import_yaml2.isSeq(steps))
        continue;
      for (const step of steps.items) {
        if (import_yaml2.isMap(step))
          inspectEnvMap(yamlMapValue(step, "env"));
      }
    }
  }
  return { assignments, invalid: false };
}
function compatiblePlatforms(binding) {
  if (binding.platformResolution === "resolved" && binding.servingPlatform !== undefined) {
    return new Set([binding.servingPlatform]);
  }
  if (binding.integration === "openai")
    return new Set(["openai", "azure"]);
  if (binding.integration === "anthropic")
    return new Set(["anthropic"]);
  if (binding.integration === "google")
    return new Set(["google", "google-vertex"]);
  return new Set(["aws-bedrock"]);
}
function protectedAssignmentScope(path) {
  const scope = classifyEvidenceScope(path);
  if (scope === "documentation" || scope === "test" || scope === "example")
    return scope;
  const fileName = path.toLowerCase().split("/").at(-1) ?? "";
  if (/^\.env(?:\.[a-z0-9_-]+)*\.(?:example|sample|template|dist)(?:\.|$)/u.test(fileName)) {
    return "example";
  }
  if (/^\.env(?:\.[a-z0-9_-]+)*\.test(?:\.|$)/u.test(fileName))
    return "test";
  return;
}
function environmentBindingFacts(assignments, consumers, feed) {
  const activePairsByModel = new Map;
  for (const pair of feed.modelPairs) {
    if (pair.activeLifecycles.length === 0)
      continue;
    const pairs = activePairsByModel.get(pair.modelId) ?? [];
    pairs.push(pair);
    activePairsByModel.set(pair.modelId, pairs);
  }
  for (const pairs of activePairsByModel.values()) {
    pairs.sort((left, right) => compareText5(left.servingPlatform, right.servingPlatform));
  }
  const consumersByVariable = new Map;
  for (const consumer of consumers) {
    const entries = consumersByVariable.get(consumer.variable) ?? [];
    entries.push(consumer);
    consumersByVariable.set(consumer.variable, entries);
  }
  for (const entries of consumersByVariable.values()) {
    entries.sort((left, right) => compareText5(left.location.path, right.location.path) || left.location.line - right.location.line || left.location.column - right.location.column || compareText5(left.ruleId, right.ruleId));
  }
  const orderedAssignments = [...assignments].sort((left, right) => compareText5(left.path, right.path) || left.line - right.line || left.column - right.column || compareText5(left.variable, right.variable) || compareText5(left.value, right.value));
  const facts = [];
  const evidenceIds = new Set;
  for (const assignment of orderedAssignments) {
    const allPairs = activePairsByModel.get(assignment.value) ?? [];
    const matchingConsumers = consumersByVariable.get(assignment.variable) ?? [];
    for (const consumer of matchingConsumers) {
      const platforms = compatiblePlatforms(consumer.binding);
      const compatiblePairs = allPairs.filter((pair) => platforms.has(pair.servingPlatform));
      if (compatiblePairs.length === 0)
        continue;
      const crossPlatformConflict = allPairs.some((pair) => !platforms.has(pair.servingPlatform));
      const platformResolution = consumer.binding.platformResolution === "resolved" ? "resolved" : consumer.binding.platformResolution === "ambiguous" && !crossPlatformConflict ? "ambiguous" : "unknown";
      const servingPlatform = platformResolution === "resolved" ? consumer.binding.servingPlatform : undefined;
      const googleResource = consumer.binding.integration === "google" && assignment.value.includes("/");
      const scope = protectedAssignmentScope(assignment.path) ?? consumer.scope;
      const environment = scope === "test" ? "test" : consumer.environment;
      const anchor = JSON.stringify([
        assignment.variable,
        consumer.ruleId,
        consumer.location.path,
        consumer.location.line,
        consumer.location.column,
        platformResolution,
        servingPlatform ?? null,
        scope
      ]);
      const evidenceId = makeEvidenceId(assignment.ruleId, assignment.path, anchor, assignment.value, 0);
      if (evidenceIds.has(evidenceId))
        continue;
      evidenceIds.add(evidenceId);
      facts.push({
        evidenceId,
        origin: "repository",
        kind: "env-binding",
        confidence: "high",
        scope,
        environment,
        detectorRuleId: assignment.ruleId,
        detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
        rawValue: assignment.value,
        ...googleResource ? {} : { modelId: assignment.value },
        ...servingPlatform === undefined ? {} : { servingPlatform },
        modelResolution: googleResource ? "unresolved" : "resolved",
        selectorKind: googleResource ? "resource-name" : consumer.binding.selectorKind,
        platformResolution,
        policyEligible: false,
        locations: [
          {
            path: assignment.path,
            line: assignment.line,
            column: assignment.column,
            blobOid: assignment.blobOid
          },
          consumer.location
        ],
        resolutionTrace: [
          {
            kind: "detector",
            detail: `exact committed model value for environment variable ${assignment.variable}`
          },
          {
            kind: "environment-fallback",
            detail: `consumed by ${consumer.ruleId} at ${consumer.location.path}:${consumer.location.line}`
          }
        ]
      });
      assertEvidenceBudget(facts.length);
    }
  }
  return facts;
}
function supportedSemanticPath(path) {
  const extension = import_node_path.extname(path.toLowerCase());
  return JS_EXTENSIONS.has(extension) || extension === ".py" || HCL_EXTENSIONS.has(extension) || DOTENV_PATH.test(path) || GITHUB_WORKFLOW_PATH.test(path);
}
function tokenizationFidelityDiagnostic(path, language, issue) {
  const descriptions = {
    "invalid-unicode-escape": "an invalid Unicode escape",
    "mismatched-delimiter": "an unmatched or mismatched delimiter",
    "unterminated-block-comment": "an unterminated block comment",
    "unterminated-regex-literal": "an unterminated regular-expression literal",
    "unterminated-string-literal": "an unterminated string literal"
  };
  return {
    code: "semantic-tokenization-incomplete@1",
    message: `The ${language} semantic detector found ${descriptions[issue.kind]} at line ${issue.line}, column ${issue.column}. Semantic evidence from this file was discarded; the blob remains assessed by lexical fallback, so declared coverage is unchanged.`,
    path,
    severity: "notice"
  };
}
var AGGREGATED_DIAGNOSTIC_PATH_SAMPLE = 10;
function aggregateDiagnostics(diagnostics) {
  const groups = new Map;
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([diagnostic.code, diagnostic.severity]);
    const group = groups.get(key);
    if (group === undefined)
      groups.set(key, [diagnostic]);
    else
      group.push(diagnostic);
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    if (group.length === 1)
      return first;
    const paths = group.map((diagnostic) => diagnostic.path).filter((path) => path !== undefined);
    const sample = paths.slice(0, AGGREGATED_DIAGNOSTIC_PATH_SAMPLE);
    return {
      code: first.code,
      message: `${group.length} files reported this diagnostic; the first is representative: ${first.message}${sample.length === 0 ? "" : ` Sampled paths (${sample.length} of ${paths.length}): ${sample.join(", ")}.`}`,
      severity: first.severity
    };
  });
}
function isClaimDocument(path) {
  return path === ".github/ai-model-lifecycle.yml" || path.startsWith(".github/ai-model-evidence/");
}
function detectSnapshot(snapshot, feed) {
  const candidates = lexicalCandidates(feed);
  const automaton = buildAutomaton(candidates);
  const evidence = [];
  const consumedEnvironmentSelectors = [];
  const diagnostics = snapshot.diagnostics.filter((diagnostic) => diagnostic.coverageImpact === "partial").map((diagnostic) => ({
    code: diagnostic.code,
    message: `${diagnostic.displayPath}: ${diagnostic.code}`,
    path: diagnostic.displayPath,
    severity: "partial"
  }));
  let partial = snapshot.scanStatus === "partial";
  for (const entry of snapshot.entries) {
    if (entry.content.state !== "available" || entry.kind === "symlink")
      continue;
    if (isClaimDocument(entry.displayPath))
      continue;
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(entry.content.bytes);
    } catch {
      if (supportedSemanticPath(entry.displayPath)) {
        partial = true;
        diagnostics.push({
          code: "invalid-detector-encoding",
          message: "A published semantic detector could not process this non-UTF-8 blob.",
          path: entry.displayPath,
          severity: "partial"
        });
      }
      continue;
    }
    const scope = classifyEvidenceScope(entry.displayPath, true);
    const extension = import_node_path.extname(entry.displayPath.toLowerCase());
    let semantic = [];
    let literalSpans = [];
    let tokenizationIssue;
    let semanticLanguage;
    if (JS_EXTENSIONS.has(extension)) {
      semanticLanguage = "javascript";
      const detected = detectSdkCalls(source, entry.displayPath, entry.objectId, "javascript", scope, JSX_EXTENSIONS.has(extension));
      semantic = detected.facts;
      literalSpans = detected.literalSpans;
      tokenizationIssue = detected.tokenizationIssue;
      consumedEnvironmentSelectors.push(...detected.consumedEnvironmentSelectors);
    } else if (extension === ".py") {
      semanticLanguage = "python";
      const detected = detectSdkCalls(source, entry.displayPath, entry.objectId, "python", scope);
      semantic = detected.facts;
      literalSpans = detected.literalSpans;
      tokenizationIssue = detected.tokenizationIssue;
      consumedEnvironmentSelectors.push(...detected.consumedEnvironmentSelectors);
    } else if (HCL_EXTENSIONS.has(extension)) {
      semanticLanguage = "hcl";
      const detected = detectTerraform(source, entry.displayPath, entry.objectId, scope);
      semantic = detected.facts;
      tokenizationIssue = detected.tokenizationIssue;
    }
    if (tokenizationIssue !== undefined && semanticLanguage !== undefined) {
      diagnostics.push(tokenizationFidelityDiagnostic(entry.displayPath, semanticLanguage, tokenizationIssue));
    }
    const lexical = lexicalFacts(source, entry.displayPath, entry.objectId, candidates, automaton, literalSpans);
    evidence.push(...semantic, ...lexical);
    assertEvidenceBudget(evidence.length);
  }
  if (consumedEnvironmentSelectors.length > 0) {
    const consumedNames = new Set(consumedEnvironmentSelectors.map((consumer) => consumer.variable));
    const activeModelIds = new Set(feed.modelPairs.filter((pair) => pair.activeLifecycles.length > 0).map((pair) => pair.modelId));
    const assignments = [];
    for (const entry of snapshot.entries) {
      if (entry.content.state !== "available" || entry.kind === "symlink")
        continue;
      const dotenv = DOTENV_PATH.test(entry.displayPath);
      const workflow = GITHUB_WORKFLOW_PATH.test(entry.displayPath);
      if (!dotenv && !workflow)
        continue;
      let source;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(entry.content.bytes);
      } catch {
        continue;
      }
      if (dotenv) {
        assignments.push(...parseDotenvAssignments(source, entry.displayPath, entry.objectId, consumedNames, activeModelIds));
      } else {
        const parsed = parseGithubWorkflowAssignments(source, entry.displayPath, entry.objectId, consumedNames, activeModelIds);
        assignments.push(...parsed.assignments);
        if (parsed.invalid) {
          partial = true;
          diagnostics.push({
            code: "invalid-github-actions-yaml",
            message: "A tracked GitHub workflow could not be parsed for static environment bindings.",
            path: entry.displayPath,
            severity: "partial"
          });
        }
      }
      assertEvidenceBudget(assignments.length);
    }
    evidence.push(...environmentBindingFacts(assignments, consumedEnvironmentSelectors, feed));
    assertEvidenceBudget(evidence.length);
  }
  evidence.sort((left, right) => compareText5(left.evidenceId, right.evidenceId));
  return {
    evidence,
    diagnostics: aggregateDiagnostics(diagnostics),
    scanStatus: partial ? "partial" : "complete"
  };
}

// src/repository/event.ts
var import_node_child_process2 = require("node:child_process");

// src/shared/document.ts
var import_node_fs2 = require("node:fs");
var READ_CHUNK_BYTES = 64 * 1024;

class FileByteLimitError extends Error {
  observedBytes;
  limitBytes;
  constructor(label, observedBytes, limitBytes, observedExactly) {
    super(observedExactly ? `${label} is ${observedBytes} bytes; the limit is ${limitBytes} bytes.` : `${label} is at least ${observedBytes} bytes; the limit is ${limitBytes} bytes.`);
    this.observedBytes = observedBytes;
    this.limitBytes = limitBytes;
    this.name = "FileByteLimitError";
  }
}
function readBoundedRegularFileBytes(filePath, maxBytes, label) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error(`Invalid byte limit for ${label}.`);
  }
  const noFollow = typeof import_node_fs2.constants.O_NOFOLLOW === "number" ? import_node_fs2.constants.O_NOFOLLOW : 0;
  let descriptor;
  try {
    descriptor = import_node_fs2.openSync(filePath, import_node_fs2.constants.O_RDONLY | noFollow);
  } catch (error) {
    throw new Error(`Could not access ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    let size;
    try {
      const stats = import_node_fs2.fstatSync(descriptor);
      if (!stats.isFile())
        throw new Error("path is not a regular file");
      size = stats.size;
    } catch (error) {
      throw new Error(`Could not access ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (size > maxBytes) {
      throw new FileByteLimitError(label, size, maxBytes, true);
    }
    const chunks = [];
    let totalBytes = 0;
    while (totalBytes <= maxBytes) {
      const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, maxBytes + 1 - totalBytes));
      let bytesRead;
      try {
        bytesRead = import_node_fs2.readSync(descriptor, chunk, 0, chunk.length, null);
      } catch (error) {
        throw new Error(`Could not read ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (bytesRead === 0)
        break;
      chunks.push(bytesRead === chunk.length ? chunk : chunk.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    if (totalBytes > maxBytes) {
      throw new FileByteLimitError(label, totalBytes, maxBytes, false);
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    try {
      import_node_fs2.closeSync(descriptor);
    } catch {}
  }
}
function decodeJsonDocument(bytes, label) {
  let text2;
  try {
    text2 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} was not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return { value: JSON.parse(text2), bytes };
  } catch (error) {
    throw new Error(`${label} did not contain valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// src/repository/git.ts
var import_node_child_process = require("node:child_process");
var ASCII_HEADER = /^[\x20-\x7e]+$/;
var OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
var DECIMAL_INTEGER = /^(?:0|[1-9][0-9]*)$/;
var CONTROL_OR_FORMAT_CHARACTER = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
var UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
var MAX_TREEISH_BYTES = 1024;
var MAX_ERROR_BYTES = 512;
var DEFAULT_GIT_TREE_SNAPSHOT_LIMITS = Object.freeze({
  maxEntries: 1e5,
  maxUniqueObjects: 1e5,
  maxMetadataBytes: 32 * 1024 * 1024,
  maxBlobBytes: 2 * 1024 * 1024,
  maxTotalBlobBytes: 100 * 1024 * 1024
});

class GitTreeSnapshotError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "GitTreeSnapshotError";
  }
}

class GitTreeSnapshotBudgetError extends GitTreeSnapshotError {
  budget;
  observed;
  limit;
  observedExactly;
  constructor(budget, observed, limit, observedExactly) {
    super("aggregate-budget-exhausted", `${budget} budget exhausted: observed ${observedExactly ? observed : `at least ${observed}`}; limit ${limit}.`);
    this.budget = budget;
    this.observed = observed;
    this.limit = limit;
    this.observedExactly = observedExactly;
    this.name = "GitTreeSnapshotBudgetError";
  }
}
function validateLimits(requested) {
  const limits = {
    ...DEFAULT_GIT_TREE_SNAPSHOT_LIMITS,
    ...requested
  };
  for (const key of Object.keys(limits)) {
    const value = limits[key];
    const hardLimit = DEFAULT_GIT_TREE_SNAPSHOT_LIMITS[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > hardLimit) {
      throw new GitTreeSnapshotError("invalid-options", `${key} must be a non-negative safe integer no greater than ${hardLimit}.`);
    }
  }
  return limits;
}
function gitEnvironment() {
  const environment = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_COMMON_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES"
  ]) {
    delete environment[key];
  }
  environment.GIT_NO_LAZY_FETCH = "1";
  environment.GIT_NO_REPLACE_OBJECTS = "1";
  environment.GIT_OPTIONAL_LOCKS = "0";
  environment.LC_ALL = "C";
  environment.LANG = "C";
  return environment;
}
function boundedError(stderr) {
  if (stderr === null || stderr.byteLength === 0)
    return "";
  const bounded = stderr.subarray(0, MAX_ERROR_BYTES);
  const rendered = Buffer.from(bounded).toString("utf8").replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "?").trim();
  return rendered === "" ? "" : `: ${rendered}`;
}
function runGit(repositoryPath, arguments_, input, maxOutputBytes, failureCode, operation, outputBudget) {
  const result = import_node_child_process.spawnSync("git", arguments_, {
    cwd: repositoryPath,
    env: gitEnvironment(),
    input,
    maxBuffer: maxOutputBytes + 1,
    windowsHide: true
  });
  const stdout = result.stdout;
  if (result.error !== undefined) {
    const errorCode = result.error.code;
    if (errorCode === "ENOBUFS" || stdout?.byteLength > maxOutputBytes) {
      if (outputBudget !== undefined) {
        throw new GitTreeSnapshotBudgetError(outputBudget.budget, outputBudget.alreadyObserved + maxOutputBytes + 1, outputBudget.totalLimit, false);
      }
      throw new GitTreeSnapshotError(failureCode, `Git exceeded its checked output length while attempting to ${operation}.`);
    }
    throw new GitTreeSnapshotError("git-command-failed", `Could not ${operation}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new GitTreeSnapshotError(failureCode, `Could not ${operation} (Git exited ${result.status ?? "without a status"})${boundedError(result.stderr)}.`);
  }
  if (stdout === null) {
    throw new GitTreeSnapshotError(failureCode, `Git returned no output while attempting to ${operation}.`);
  }
  if (stdout.byteLength > maxOutputBytes) {
    if (outputBudget !== undefined) {
      throw new GitTreeSnapshotBudgetError(outputBudget.budget, outputBudget.alreadyObserved + stdout.byteLength, outputBudget.totalLimit, true);
    }
    throw new GitTreeSnapshotError(failureCode, `Git exceeded its checked output length while attempting to ${operation}.`);
  }
  return Uint8Array.from(stdout);
}
function resolveTreeObjectId(repositoryPath, treeish) {
  const treeishBytes = Buffer.byteLength(treeish);
  if (treeishBytes === 0 || treeishBytes > MAX_TREEISH_BYTES || treeish.startsWith("-") || /[\u0000-\u001f\u007f]/.test(treeish)) {
    throw new GitTreeSnapshotError("invalid-options", `treeish must be a safe, non-option revision of at most ${MAX_TREEISH_BYTES} bytes.`);
  }
  const output = runGit(repositoryPath, ["rev-parse", "--verify", "--end-of-options", `${treeish}^{tree}`], undefined, 256, "tree-unavailable", "resolve the target Git tree");
  const rendered = Buffer.from(output).toString("ascii");
  const match = /^(?<objectId>[0-9a-f]{40}|[0-9a-f]{64})\r?\n?$/.exec(rendered);
  const objectId = match?.groups?.objectId;
  if (objectId === undefined) {
    throw new GitTreeSnapshotError("tree-unavailable", "Git returned a malformed target tree object ID.");
  }
  return objectId;
}
function ascii(bytes, label) {
  const value = Buffer.from(bytes).toString("ascii");
  if (!ASCII_HEADER.test(value)) {
    throw new GitTreeSnapshotError("malformed-tree", `${label} was not printable ASCII.`);
  }
  return value;
}
function displayGitPath(pathBytes) {
  let decoded;
  try {
    decoded = UTF8_DECODER.decode(pathBytes);
  } catch {
    let escaped2 = "";
    for (const byte of pathBytes) {
      if (byte === 92)
        escaped2 += "\\\\";
      else if (byte >= 32 && byte <= 126)
        escaped2 += String.fromCharCode(byte);
      else
        escaped2 += `\\x${byte.toString(16).padStart(2, "0")}`;
    }
    return escaped2;
  }
  let escaped = "";
  for (const character of decoded) {
    switch (character) {
      case "\\":
        escaped += "\\\\";
        break;
      case `
`:
        escaped += "\\n";
        break;
      case "\r":
        escaped += "\\r";
        break;
      case "\t":
        escaped += "\\t";
        break;
      default:
        if (CONTROL_OR_FORMAT_CHARACTER.test(character)) {
          const codePoint = character.codePointAt(0);
          if (codePoint === undefined) {
            throw new GitTreeSnapshotError("malformed-tree", "Git path decoding failed.");
          }
          escaped += `\\u{${codePoint.toString(16)}}`;
        } else {
          escaped += character;
        }
    }
  }
  return escaped;
}
function classifyEntryMode(mode, objectType) {
  switch (mode) {
    case "100644":
      if (objectType !== "blob")
        break;
      return { mode, kind: "regular", declaredObjectType: "blob" };
    case "100755":
      if (objectType !== "blob")
        break;
      return { mode, kind: "executable", declaredObjectType: "blob" };
    case "120000":
      if (objectType !== "blob")
        break;
      return { mode, kind: "symlink", declaredObjectType: "blob" };
    case "160000":
      if (objectType !== "commit")
        break;
      return { mode, kind: "gitlink", declaredObjectType: "commit" };
    default:
      throw new GitTreeSnapshotError("unknown-tree-mode", `Target tree contains unsupported entry mode ${JSON.stringify(mode)}.`);
  }
  throw new GitTreeSnapshotError("object-type-mismatch", `Target tree mode ${mode} declared inconsistent object type ${JSON.stringify(objectType)}.`);
}
function parseTreeEntries(output, maxEntries) {
  const entries = [];
  const seenPaths = new Set;
  let offset = 0;
  while (offset < output.byteLength) {
    const nul = Buffer.from(output.buffer, output.byteOffset, output.byteLength).indexOf(0, offset);
    if (nul < 0) {
      throw new GitTreeSnapshotError("malformed-tree", "Git tree listing was not NUL terminated.");
    }
    if (entries.length >= maxEntries) {
      throw new GitTreeSnapshotBudgetError("entries", entries.length + 1, maxEntries, false);
    }
    const record = output.subarray(offset, nul);
    const tab = record.indexOf(9);
    if (tab <= 0 || tab === record.byteLength - 1) {
      throw new GitTreeSnapshotError("malformed-tree", "Git tree entry had a malformed path record.");
    }
    const header = ascii(record.subarray(0, tab), "Git tree entry header");
    const headerMatch = /^(?<mode>[0-9]{6}) (?<type>[a-z]+) (?<objectId>[0-9a-f]+)$/.exec(header);
    if (headerMatch?.groups === undefined) {
      throw new GitTreeSnapshotError("malformed-tree", "Git tree entry header was malformed.");
    }
    const { mode, type, objectId } = headerMatch.groups;
    if (mode === undefined || type === undefined || objectId === undefined || !OBJECT_ID.test(objectId)) {
      throw new GitTreeSnapshotError("malformed-tree", "Git tree entry metadata was malformed.");
    }
    const classification = classifyEntryMode(mode, type);
    const pathBytes = Uint8Array.from(record.subarray(tab + 1));
    const pathKey = Buffer.from(pathBytes).toString("hex");
    if (seenPaths.has(pathKey)) {
      throw new GitTreeSnapshotError("malformed-tree", "Target tree contained a duplicate path.");
    }
    seenPaths.add(pathKey);
    entries.push({
      ...classification,
      objectId,
      pathBytes,
      displayPath: displayGitPath(pathBytes)
    });
    offset = nul + 1;
  }
  return entries;
}
function newlineTerminatedLines(output, expectedCount, failureCode) {
  if (expectedCount === 0) {
    if (output.byteLength !== 0) {
      throw new GitTreeSnapshotError(failureCode, "Git returned unexpected batch output.");
    }
    return [];
  }
  if (output.at(-1) !== 10) {
    throw new GitTreeSnapshotError(failureCode, "Git batch output was not newline terminated.");
  }
  const lines = [];
  let offset = 0;
  for (let index = 0;index < output.byteLength; index += 1) {
    if (output[index] !== 10)
      continue;
    lines.push(output.subarray(offset, index));
    offset = index + 1;
  }
  if (lines.length !== expectedCount) {
    throw new GitTreeSnapshotError(failureCode, "Git batch output count did not match its request.");
  }
  return lines;
}
function inspectObjectMetadata(repositoryPath, objectIds, expectedTypes, metadataBytesAlreadyObserved, metadataLimit) {
  if (objectIds.length === 0)
    return { metadata: new Map, outputBytes: 0 };
  const metadataBudgetRemaining = metadataLimit - metadataBytesAlreadyObserved;
  const minimumOutputBytes = objectIds.reduce((total, objectId) => total + objectId.length + 8, 0);
  if (minimumOutputBytes > metadataBudgetRemaining) {
    throw new GitTreeSnapshotBudgetError("metadata-bytes", metadataBytesAlreadyObserved + minimumOutputBytes, metadataLimit, false);
  }
  const input = Buffer.from(`${objectIds.join(`
`)}
`, "ascii");
  const output = runGit(repositoryPath, ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], input, metadataBudgetRemaining, "malformed-object-metadata", "inspect target Git blob metadata", {
    budget: "metadata-bytes",
    alreadyObserved: metadataBytesAlreadyObserved,
    totalLimit: metadataLimit
  });
  const lines = newlineTerminatedLines(output, objectIds.length, "malformed-object-metadata");
  const metadata = new Map;
  for (let index = 0;index < objectIds.length; index += 1) {
    const expectedObjectId = objectIds[index];
    const line = lines[index];
    if (expectedObjectId === undefined || line === undefined) {
      throw new GitTreeSnapshotError("malformed-object-metadata", "Git batch metadata response lost request ordering.");
    }
    const rendered = ascii(line, "Git object metadata");
    const expectedType = expectedTypes.get(expectedObjectId);
    if (expectedType === undefined) {
      throw new GitTreeSnapshotError("malformed-object-metadata", "Git object metadata had no declared tree type.");
    }
    if (rendered === `${expectedObjectId} missing`) {
      metadata.set(expectedObjectId, { state: "missing" });
      continue;
    }
    const match = /^(?<objectId>[0-9a-f]+) (?<type>[a-z]+) (?<size>[0-9]+)$/.exec(rendered);
    if (match?.groups === undefined) {
      throw new GitTreeSnapshotError("malformed-object-metadata", "Git returned malformed object metadata.");
    }
    const objectId = match.groups.objectId;
    const objectType = match.groups.type;
    const sizeText = match.groups.size;
    if (objectId !== expectedObjectId || objectType === undefined || sizeText === undefined || !DECIMAL_INTEGER.test(sizeText)) {
      throw new GitTreeSnapshotError("malformed-object-metadata", "Git object metadata did not match its request.");
    }
    if (objectType !== expectedType) {
      throw new GitTreeSnapshotError("object-type-mismatch", `Tree entry ${expectedObjectId} resolved to ${objectType}, not ${expectedType}.`);
    }
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size)) {
      throw new GitTreeSnapshotError("malformed-object-metadata", "Git object size exceeded the supported integer range.");
    }
    metadata.set(expectedObjectId, { state: "available", type: expectedType, size });
  }
  return { metadata, outputBytes: output.byteLength };
}
function readBlobObjects(repositoryPath, objectIds, metadata) {
  if (objectIds.length === 0)
    return { objects: new Map, outputBytes: 0 };
  let expectedOutputBytes = 0;
  for (const objectId of objectIds) {
    const objectMetadata = metadata.get(objectId);
    if (objectMetadata?.state !== "available" || objectMetadata.type !== "blob") {
      throw new GitTreeSnapshotError("malformed-object-content", "Attempted to read a Git blob without available metadata.");
    }
    expectedOutputBytes += Buffer.byteLength(`${objectId} blob ${objectMetadata.size}
`, "ascii") + objectMetadata.size + 1;
    if (!Number.isSafeInteger(expectedOutputBytes)) {
      throw new GitTreeSnapshotError("malformed-object-content", "Git batch response size exceeded the supported integer range.");
    }
  }
  const input = Buffer.from(`${objectIds.join(`
`)}
`, "ascii");
  const output = runGit(repositoryPath, ["cat-file", "--batch"], input, expectedOutputBytes, "malformed-object-content", "read target Git blobs");
  const objects = new Map;
  let offset = 0;
  for (const expectedObjectId of objectIds) {
    const newline = Buffer.from(output.buffer, output.byteOffset, output.byteLength).indexOf(10, offset);
    if (newline < 0) {
      throw new GitTreeSnapshotError("malformed-object-content", "Git blob response header was not newline terminated.");
    }
    const header = ascii(output.subarray(offset, newline), "Git blob response header");
    const objectMetadata = metadata.get(expectedObjectId);
    if (objectMetadata?.state !== "available" || objectMetadata.type !== "blob") {
      throw new GitTreeSnapshotError("malformed-object-content", "Git blob metadata became unavailable during its batch read.");
    }
    if (header !== `${expectedObjectId} blob ${objectMetadata.size}`) {
      throw new GitTreeSnapshotError("malformed-object-content", "Git blob response did not match its checked metadata.");
    }
    const bodyStart = newline + 1;
    const bodyEnd = bodyStart + objectMetadata.size;
    if (bodyEnd >= output.byteLength || output[bodyEnd] !== 10) {
      throw new GitTreeSnapshotError("malformed-object-content", "Git blob response length did not match its checked metadata.");
    }
    objects.set(expectedObjectId, output.subarray(bodyStart, bodyEnd));
    offset = bodyEnd + 1;
  }
  if (offset !== output.byteLength) {
    throw new GitTreeSnapshotError("malformed-object-content", "Git returned trailing data after its requested blobs.");
  }
  return { objects, outputBytes: output.byteLength };
}
function parseLfsPointer(bytes) {
  if (bytes.byteLength >= 1024)
    return null;
  let text2;
  try {
    text2 = UTF8_DECODER.decode(bytes);
  } catch {
    return null;
  }
  if (!text2.endsWith(`
`) || text2.includes("\r"))
    return null;
  const lines = text2.slice(0, -1).split(`
`);
  const version = lines.shift();
  if (version !== "version https://git-lfs.github.com/spec/v1" && version !== "version https://hawser.github.com/spec/v1") {
    return null;
  }
  const values = new Map;
  let previousKey = "";
  for (const line of lines) {
    const separator = line.indexOf(" ");
    if (separator <= 0 || separator === line.length - 1)
      return null;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!/^[a-z0-9.-]+$/.test(key) || key === "version" || key <= previousKey || value.startsWith(" ")) {
      return null;
    }
    previousKey = key;
    values.set(key, value);
  }
  const oid = values.get("oid");
  const sizeText = values.get("size");
  if (oid === undefined || sizeText === undefined)
    return null;
  if (!/^sha256:[0-9a-f]{64}$/.test(oid) || !DECIMAL_INTEGER.test(sizeText))
    return null;
  const declaredSize = Number(sizeText);
  if (!Number.isSafeInteger(declaredSize))
    return null;
  return { oid, declaredSize };
}
function readGitTreeSnapshot(options) {
  const limits = validateLimits(options.limits);
  const treeObjectId = resolveTreeObjectId(options.repositoryPath, options.treeish);
  const treeOutput = runGit(options.repositoryPath, ["ls-tree", "-r", "-z", "--full-tree", treeObjectId], undefined, limits.maxMetadataBytes, "tree-unavailable", "enumerate the target Git tree", {
    budget: "metadata-bytes",
    alreadyObserved: 0,
    totalLimit: limits.maxMetadataBytes
  });
  const rawEntries = parseTreeEntries(treeOutput, limits.maxEntries);
  const expectedObjectTypes = new Map;
  for (const entry of rawEntries) {
    const previousType = expectedObjectTypes.get(entry.objectId);
    if (previousType !== undefined && previousType !== entry.declaredObjectType) {
      throw new GitTreeSnapshotError("object-type-mismatch", `Target tree declares object ${entry.objectId} as both ${previousType} and ${entry.declaredObjectType}.`);
    }
    expectedObjectTypes.set(entry.objectId, entry.declaredObjectType);
  }
  const uniqueObjectIds = [...expectedObjectTypes.keys()].sort();
  const uniqueBlobObjectIds = uniqueObjectIds.filter((objectId) => expectedObjectTypes.get(objectId) === "blob");
  if (uniqueObjectIds.length > limits.maxUniqueObjects) {
    throw new GitTreeSnapshotBudgetError("unique-objects", uniqueObjectIds.length, limits.maxUniqueObjects, true);
  }
  const metadataResult = inspectObjectMetadata(options.repositoryPath, uniqueObjectIds, expectedObjectTypes, treeOutput.byteLength, limits.maxMetadataBytes);
  const metadataBytes = treeOutput.byteLength + metadataResult.outputBytes;
  let assessedBlobBytes = 0;
  for (const entry of rawEntries) {
    if (entry.kind === "gitlink")
      continue;
    const objectMetadata = metadataResult.metadata.get(entry.objectId);
    if (objectMetadata?.state !== "available" || objectMetadata.type !== "blob" || objectMetadata.size > limits.maxBlobBytes) {
      continue;
    }
    assessedBlobBytes += objectMetadata.size;
    if (assessedBlobBytes > limits.maxTotalBlobBytes) {
      throw new GitTreeSnapshotBudgetError("total-blob-bytes", assessedBlobBytes, limits.maxTotalBlobBytes, true);
    }
  }
  const readableObjectIds = uniqueBlobObjectIds.filter((objectId) => {
    const objectMetadata = metadataResult.metadata.get(objectId);
    return objectMetadata?.state === "available" && objectMetadata.type === "blob" && objectMetadata.size <= limits.maxBlobBytes;
  });
  const blobResult = readBlobObjects(options.repositoryPath, readableObjectIds, metadataResult.metadata);
  const diagnostics = [];
  const entries = [];
  let availableBlobEntryCount = 0;
  let oversizedBlobEntryCount = 0;
  let unavailableBlobEntryCount = 0;
  let symlinkEntryCount = 0;
  let gitlinkEntryCount = 0;
  let lfsPointerEntryCount = 0;
  for (const entry of rawEntries) {
    if (entry.kind === "gitlink") {
      gitlinkEntryCount += 1;
      diagnostics.push({
        code: "gitlink-boundary",
        coverageImpact: "none",
        displayPath: entry.displayPath,
        objectId: entry.objectId
      });
      entries.push({
        ...entry,
        objectSize: null,
        content: { state: "gitlink-boundary" }
      });
      continue;
    }
    if (entry.kind === "symlink") {
      symlinkEntryCount += 1;
      diagnostics.push({
        code: "symlink-link-text",
        coverageImpact: "none",
        displayPath: entry.displayPath,
        objectId: entry.objectId
      });
    }
    const objectMetadata = metadataResult.metadata.get(entry.objectId);
    if (objectMetadata === undefined || objectMetadata.state === "missing") {
      unavailableBlobEntryCount += 1;
      diagnostics.push({
        code: "blob-unavailable",
        coverageImpact: "partial",
        displayPath: entry.displayPath,
        objectId: entry.objectId
      });
      entries.push({
        ...entry,
        objectSize: null,
        content: { state: "unavailable" }
      });
      continue;
    }
    if (objectMetadata.size > limits.maxBlobBytes) {
      oversizedBlobEntryCount += 1;
      diagnostics.push({
        code: "blob-too-large",
        coverageImpact: "partial",
        displayPath: entry.displayPath,
        objectId: entry.objectId,
        objectSize: objectMetadata.size,
        limitBytes: limits.maxBlobBytes
      });
      entries.push({
        ...entry,
        objectSize: objectMetadata.size,
        content: {
          state: "too-large",
          objectSize: objectMetadata.size,
          limitBytes: limits.maxBlobBytes
        }
      });
      continue;
    }
    const bytes = blobResult.objects.get(entry.objectId);
    if (bytes === undefined) {
      throw new GitTreeSnapshotError("malformed-object-content", "A checked Git blob was absent from the batch response.");
    }
    const lfsPointer = entry.kind === "symlink" ? null : parseLfsPointer(bytes);
    if (lfsPointer !== null) {
      lfsPointerEntryCount += 1;
      diagnostics.push({
        code: "git-lfs-boundary",
        coverageImpact: "none",
        displayPath: entry.displayPath,
        objectId: entry.objectId,
        lfsObjectId: lfsPointer.oid,
        declaredSize: lfsPointer.declaredSize
      });
      entries.push({
        ...entry,
        objectSize: objectMetadata.size,
        content: {
          state: "lfs-pointer",
          bytes,
          oid: lfsPointer.oid,
          declaredSize: lfsPointer.declaredSize
        }
      });
      continue;
    }
    availableBlobEntryCount += 1;
    entries.push({
      ...entry,
      objectSize: objectMetadata.size,
      content: { state: "available", bytes }
    });
  }
  const partial = diagnostics.some((diagnostic) => diagnostic.coverageImpact === "partial");
  const readObjectBytes = readableObjectIds.reduce((total, objectId) => {
    const objectMetadata = metadataResult.metadata.get(objectId);
    if (objectMetadata?.state !== "available" || objectMetadata.type !== "blob") {
      throw new GitTreeSnapshotError("malformed-object-content", "Readable Git object metadata was lost while computing statistics.");
    }
    return total + objectMetadata.size;
  }, 0);
  return {
    treeObjectId,
    scanStatus: partial ? "partial" : "complete",
    entries,
    diagnostics,
    stats: {
      entryCount: entries.length,
      blobEntryCount: entries.length - gitlinkEntryCount,
      uniqueObjectCount: uniqueObjectIds.length,
      uniqueBlobObjectCount: uniqueBlobObjectIds.length,
      availableBlobEntryCount,
      oversizedBlobEntryCount,
      unavailableBlobEntryCount,
      symlinkEntryCount,
      gitlinkEntryCount,
      lfsPointerEntryCount,
      assessedBlobBytes,
      readObjectBytes,
      readObjectCount: readableObjectIds.length,
      metadataBytes
    },
    limits
  };
}

// src/repository/event.ts
var OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
var MAX_EVENT_BYTES = 2 * 1024 * 1024;

class EventSelectionError extends Error {
  scanStatus;
  constructor(scanStatus, message) {
    super(message);
    this.scanStatus = scanStatus;
    this.name = "EventSelectionError";
  }
}
function runGit2(repositoryPath, arguments_) {
  return import_node_child_process2.spawnSync("git", arguments_, {
    cwd: repositoryPath,
    env: gitEnvironment(),
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    windowsHide: true
  });
}
function defaultProbe(repositoryPath) {
  return {
    resolveCommit(revision) {
      if (revision !== "HEAD" && !OID.test(revision))
        return null;
      const result = runGit2(repositoryPath, [
        "rev-parse",
        "--verify",
        "--end-of-options",
        `${revision}^{commit}`
      ]);
      if (result.status !== 0 || typeof result.stdout !== "string")
        return null;
      const resolved = result.stdout.trim();
      if (!OID.test(resolved))
        return null;
      const tree = runGit2(repositoryPath, ["cat-file", "-e", `${resolved}^{tree}`]);
      return tree.status === 0 ? resolved : null;
    },
    parents(oid) {
      const result = runGit2(repositoryPath, [
        "show",
        "-s",
        "--no-show-signature",
        "--format=%P",
        oid
      ]);
      if (result.status !== 0 || typeof result.stdout !== "string") {
        throw new EventSelectionError("failed", `Could not inspect parents for commit ${oid}.`);
      }
      const rendered = result.stdout.trim();
      if (rendered === "")
        return [];
      const parents = rendered.split(" ");
      if (parents.some((parent) => !OID.test(parent))) {
        throw new EventSelectionError("failed", `Commit ${oid} has malformed parent metadata.`);
      }
      return parents;
    },
    isAncestor(base, head) {
      const result = runGit2(repositoryPath, ["merge-base", "--is-ancestor", base, head]);
      if (result.status === 0)
        return true;
      if (result.status !== 1)
        return null;
      const shallow = runGit2(repositoryPath, ["rev-parse", "--is-shallow-repository"]);
      if (shallow.status !== 0 || typeof shallow.stdout !== "string" || !/^(?:true|false)\s*$/.test(shallow.stdout)) {
        return null;
      }
      return shallow.stdout.trim() === "true" ? null : false;
    }
  };
}
function oid(value, label) {
  if (typeof value !== "string" || !OID.test(value)) {
    throw new EventSelectionError("failed", `${label} must be a full lowercase Git object ID.`);
  }
  return value;
}
function object2(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new EventSelectionError("failed", `${label} must be an object.`);
  }
  return value;
}
function readEventPayload(environment) {
  const path = environment.GITHUB_EVENT_PATH;
  if (!path)
    throw new EventSelectionError("failed", "GITHUB_EVENT_PATH is required.");
  try {
    const bytes = readBoundedRegularFileBytes(path, MAX_EVENT_BYTES, "GitHub event payload");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new EventSelectionError("failed", `Could not read the GitHub event payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function unavailableDiagnostic(message) {
  return { code: "trusted-base-unavailable", message, severity: "partial" };
}
function resolveCommit(probe, revision, label) {
  const resolved = probe.resolveCommit(revision);
  if (resolved === null)
    return null;
  if (!OID.test(resolved)) {
    throw new EventSelectionError("failed", `${label} resolved to a malformed Git commit object ID.`);
  }
  if (OID.test(revision) && resolved !== revision) {
    throw new EventSelectionError("failed", `${label} did not resolve to the exact event commit.`);
  }
  return resolved;
}
function exactParents(actual, base, head) {
  if (actual.length !== 2)
    return null;
  const expected = [base, head].sort();
  const sortedActual = [...actual].sort();
  if (sortedActual[0] !== expected[0] || sortedActual[1] !== expected[1])
    return null;
  const first = actual[0];
  const second = actual[1];
  if (first === undefined || second === undefined)
    return null;
  return [first, second];
}
function resolveEventSelection(options) {
  const eventName = options.environment.GITHUB_EVENT_NAME?.trim() || "local";
  const probe = options.probe ?? defaultProbe(options.repositoryPath);
  const targetFromEnvironment = options.environment.GITHUB_SHA?.trim();
  if (eventName === "pull_request") {
    const payload = object2(options.eventPayload ?? readEventPayload(options.environment), "Event payload");
    const pullRequest = object2(payload.pull_request, "Event payload.pull_request");
    const base = object2(pullRequest.base, "Event payload.pull_request.base");
    const head = object2(pullRequest.head, "Event payload.pull_request.head");
    const baseOid = oid(base.sha, "pull_request.base.sha");
    const headOid = oid(head.sha, "pull_request.head.sha");
    const mergeOid = oid(targetFromEnvironment, "GITHUB_SHA");
    const mergeAvailable = resolveCommit(probe, mergeOid, "GITHUB_SHA") !== null;
    const headAvailable = resolveCommit(probe, headOid, "pull_request.head.sha") !== null;
    const baseAvailable = resolveCommit(probe, baseOid, "pull_request.base.sha") !== null;
    if (mergeAvailable) {
      const parents = probe.parents(mergeOid);
      const validatedParents = exactParents(parents, baseOid, headOid);
      if (validatedParents === null) {
        throw new EventSelectionError("failed", "GITHUB_SHA is not the validated synthetic merge of the event base and head commits.");
      }
      if (baseAvailable && headAvailable) {
        return {
          selection: {
            eventName,
            targetOid: mergeOid,
            targetKind: "synthetic-merge",
            baseOid,
            submittedHeadOid: headOid,
            comparisonRequested: true
          },
          comparisonStatus: "available",
          diagnostics: [],
          targetParentOids: validatedParents
        };
      }
      return {
        selection: {
          eventName,
          targetOid: mergeOid,
          targetKind: "synthetic-merge-uncompared",
          baseOid,
          submittedHeadOid: headOid,
          comparisonRequested: true
        },
        comparisonStatus: "unavailable",
        diagnostics: [
          unavailableDiagnostic("The synthetic merge is readable, but the exact base or submitted head " + "commit is unavailable locally. Use checkout fetch-depth: 0.")
        ],
        targetParentOids: validatedParents
      };
    }
    if (headAvailable) {
      return {
        selection: {
          eventName,
          targetOid: headOid,
          targetKind: "raw-head-fallback",
          baseOid,
          submittedHeadOid: headOid,
          comparisonRequested: true
        },
        comparisonStatus: "unavailable",
        diagnostics: [
          unavailableDiagnostic("The validated synthetic merge is unavailable; the raw submitted head " + "is diagnostic only. Use checkout fetch-depth: 0.")
        ]
      };
    }
    throw new EventSelectionError("failed", "Neither the validated pull-request merge commit nor the exact submitted head " + "is available locally.");
  }
  if (eventName === "merge_group") {
    const payload = object2(options.eventPayload ?? readEventPayload(options.environment), "Event payload");
    const mergeGroup = object2(payload.merge_group, "Event payload.merge_group");
    const baseOid = oid(mergeGroup.base_sha, "merge_group.base_sha");
    const headOid = oid(mergeGroup.head_sha, "merge_group.head_sha");
    const baseAvailable = resolveCommit(probe, baseOid, "merge_group.base_sha") !== null;
    const headAvailable = resolveCommit(probe, headOid, "merge_group.head_sha") !== null;
    if (!headAvailable) {
      throw new EventSelectionError("failed", "The exact merge-group head commit is unavailable locally.");
    }
    if (!baseAvailable) {
      return {
        selection: {
          eventName,
          targetOid: headOid,
          targetKind: "merge-group",
          baseOid,
          submittedHeadOid: headOid,
          comparisonRequested: true
        },
        comparisonStatus: "unavailable",
        diagnostics: [
          unavailableDiagnostic("The merge-group head is readable, but its trusted base is unavailable " + "locally. Use checkout fetch-depth: 0.")
        ]
      };
    }
    const ancestry = probe.isAncestor(baseOid, headOid);
    if (ancestry === null) {
      return {
        selection: {
          eventName,
          targetOid: headOid,
          targetKind: "merge-group",
          baseOid,
          submittedHeadOid: headOid,
          comparisonRequested: true
        },
        comparisonStatus: "unavailable",
        diagnostics: [
          unavailableDiagnostic("The merge-group head and base are readable, but their ancestry cannot be " + "proven from local history. Use checkout fetch-depth: 0.")
        ]
      };
    }
    if (!ancestry) {
      throw new EventSelectionError("failed", "The merge-group base is not an ancestor of its combined head.");
    }
    return {
      selection: {
        eventName,
        targetOid: headOid,
        targetKind: "merge-group",
        baseOid,
        submittedHeadOid: headOid,
        comparisonRequested: true
      },
      comparisonStatus: "available",
      diagnostics: []
    };
  }
  if (eventName !== "local" && eventName !== "schedule" && eventName !== "workflow_dispatch" && eventName !== "push" && eventName !== "release") {
    throw new EventSelectionError("failed", `Unsupported GitHub event: ${eventName}.`);
  }
  const targetRevision = eventName === "local" && !targetFromEnvironment ? "HEAD" : oid(targetFromEnvironment, "GITHUB_SHA");
  const targetOid = resolveCommit(probe, targetRevision, "Target commit");
  if (targetOid === null) {
    throw new EventSelectionError("failed", `Target commit ${targetRevision} and its tree are unavailable locally.`);
  }
  return {
    selection: {
      eventName,
      targetOid,
      targetKind: "commit",
      comparisonRequested: false
    },
    comparisonStatus: "not-applicable",
    diagnostics: []
  };
}

// src/shared/http.ts
var DEFAULT_REQUEST_TIMEOUT_MS = 15000;
var DEFAULT_RETRIES = 2;
var MAX_FEED_BYTES = 5 * 1024 * 1024;

class InvalidResponseError extends Error {
}
var defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function defaultRequestPolicy(fetchImplementation = fetch) {
  return {
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    retries: DEFAULT_RETRIES,
    fetch: fetchImplementation,
    sleep: defaultSleep,
    random: Math.random
  };
}
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}
function retryDelay(response, attempt, random) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(seconds * 1000, 1e4);
    const timestamp2 = Date.parse(retryAfter);
    if (!Number.isNaN(timestamp2))
      return Math.max(0, Math.min(timestamp2 - Date.now(), 1e4));
  }
  return Math.min(500 * 2 ** attempt + Math.floor(random() * 250), 1e4);
}
function errorDetail(error) {
  if (error instanceof DOMException && error.name === "AbortError")
    return "request timed out";
  if (error instanceof Error)
    return error.message;
  return String(error);
}
async function consumeWithRetry(url, init, label, policy, consume) {
  let lastError;
  let attempts = 0;
  for (let attempt = 0;attempt <= policy.retries; attempt += 1) {
    attempts = attempt + 1;
    const controller = new AbortController;
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    let response = null;
    try {
      response = await policy.fetch(url, { ...init, signal: controller.signal });
      if (response.ok)
        return await consume(response);
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      const shouldRetry = isRetryableStatus(response.status) && attempt < policy.retries;
      await response.body?.cancel().catch(() => {
        return;
      });
      if (!shouldRetry)
        break;
    } catch (error) {
      await response?.body?.cancel().catch(() => {
        return;
      });
      if (error instanceof InvalidResponseError)
        throw error;
      lastError = error;
      if (attempt === policy.retries)
        break;
    } finally {
      clearTimeout(timeout);
    }
    await policy.sleep(retryDelay(response, attempt, policy.random));
  }
  throw new Error(`${label} failed after ${attempts} attempt(s): ${errorDetail(lastError).replace(/\.$/, "")}.`);
}
async function readBoundedBody(response, maxBytes) {
  if (!response.body)
    return new Uint8Array;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {
          return;
        });
        throw new InvalidResponseError(`Deprecations feed exceeded the ${maxBytes}-byte response limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function fetchBoundedDocumentBytes(url, policy, maxBytes = MAX_FEED_BYTES) {
  return consumeWithRetry(url, {
    method: "GET",
    headers: {
      Accept: "application/json, application/feed+json;q=0.9",
      "User-Agent": "ai-model-end-of-life-action"
    }
  }, "Deprecations feed request", policy, async (response) => {
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
    if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new InvalidResponseError(`Deprecations feed is ${contentLength} bytes; the limit is ${maxBytes}.`);
    }
    return readBoundedBody(response, maxBytes);
  });
}
async function postSlack(webhook, text2, policy) {
  await consumeWithRetry(webhook, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text2 })
  }, "Slack notification", { ...policy, retries: 0 }, async (response) => {
    await response.body?.cancel().catch(() => {
      return;
    });
  });
}

// src/lifecycle/legacy-feed-adapter.ts
var import_node_crypto4 = require("node:crypto");

// src/lifecycle/legacy-feed-pairs.ts
var REVIEWED_LEGACY_SOURCE_PAIRS = Object.freeze([
  ["AWS Bedrock", "ai21.jamba-1-5-large-v1:0"],
  ["AWS Bedrock", "ai21.jamba-1-5-mini-v1:0"],
  ["AWS Bedrock", "amazon.nova-canvas-v1:0"],
  ["AWS Bedrock", "amazon.nova-premier-v1:0"],
  ["AWS Bedrock", "amazon.nova-reel-v1:0"],
  ["AWS Bedrock", "amazon.nova-reel-v1:1"],
  ["AWS Bedrock", "amazon.nova-sonic-v1:0"],
  ["AWS Bedrock", "anthropic.claude-3-5-sonnet-20240620-v1:0"],
  ["AWS Bedrock", "anthropic.claude-3-5-sonnet-20241022-v2:0"],
  ["AWS Bedrock", "anthropic.claude-3-7-sonnet-20250219-v1:0"],
  ["AWS Bedrock", "anthropic.claude-3-haiku-20240307-v1:0"],
  ["AWS Bedrock", "anthropic.claude-3-sonnet-20240229-v1:0"],
  ["AWS Bedrock", "anthropic.claude-opus-4-1-20250805-v1:0"],
  ["AWS Bedrock", "anthropic.claude-sonnet-4-20250514-v1:0"],
  ["AWS Bedrock", "cohere.command-r-plus-v1:0"],
  ["AWS Bedrock", "cohere.command-r-v1:0"],
  ["AWS Bedrock", "twelvelabs.marengo-embed-2-7-v1:0"],
  ["Anthropic", "claude-1.0"],
  ["Anthropic", "claude-1.1"],
  ["Anthropic", "claude-1.2"],
  ["Anthropic", "claude-1.3"],
  ["Anthropic", "claude-2.0"],
  ["Anthropic", "claude-2.1"],
  ["Anthropic", "claude-3-5-haiku-20241022"],
  ["Anthropic", "claude-3-5-sonnet-20240620"],
  ["Anthropic", "claude-3-5-sonnet-20241022"],
  ["Anthropic", "claude-3-7-sonnet-20250219"],
  ["Anthropic", "claude-3-haiku-20240307"],
  ["Anthropic", "claude-3-opus-20240229"],
  ["Anthropic", "claude-3-sonnet-20240229"],
  ["Anthropic", "claude-instant-1.0"],
  ["Anthropic", "claude-instant-1.1"],
  ["Anthropic", "claude-instant-1.2"],
  ["Anthropic", "claude-opus-4-1-20250805"],
  ["Anthropic", "claude-opus-4-20250514"],
  ["Anthropic", "claude-sonnet-4-20250514"],
  ["Azure", "Cohere-command-a-plus-05-2026"],
  ["Azure", "Cohere-command-r-08-2024"],
  ["Azure", "Cohere-command-r-plus-08-2024"],
  ["Azure", "Cohere-rerank-v3.5"],
  ["Azure", "DeepSeek-R1"],
  ["Azure", "DeepSeek-R1-0528"],
  ["Azure", "DeepSeek-V3-0324"],
  ["Azure", "DeepSeek-V3.1"],
  ["Azure", "DeepSeek-V4-Flash"],
  ["Azure", "DeepSeek-V4-Pro"],
  ["Azure", "FW-DeepSeek-V3.1"],
  ["Azure", "FW-DeepSeek-V3.2"],
  ["Azure", "FW-GLM-4.7"],
  ["Azure", "FW-GLM-5"],
  ["Azure", "FW-GLM-5.1"],
  ["Azure", "FW-GPT-OSS-120B"],
  ["Azure", "FW-Kimi-K2-Instruct-0905"],
  ["Azure", "FW-Kimi-K2-Thinking"],
  ["Azure", "FW-Kimi-K2.5"],
  ["Azure", "FW-MiniMax-M2.5"],
  ["Azure", "FW-Qwen3-14B"],
  ["Azure", "FW-Qwen3.5-122B-A10B"],
  ["Azure", "FW-Qwen3.5-397B-A17B"],
  ["Azure", "Kimi-K2.5"],
  ["Azure", "Kimi-K2.6"],
  ["Azure", "Kimi-K2.7-Code"],
  ["Azure", "Llama-3.2-11B-Vision-Instruct"],
  ["Azure", "Llama-3.2-90B-Vision-Instruct"],
  ["Azure", "MAI-Image-2"],
  ["Azure", "MAI-Image-2e"],
  ["Azure", "Meta-Llama-3.1-405B-Instruct"],
  ["Azure", "Meta-Llama-3.1-8B"],
  ["Azure", "Meta-Llama-3.1-8B-Instruct"],
  ["Azure", "Stable-Diffusion-3.5-Large"],
  ["Azure", "Stable-Image-Core"],
  ["Azure", "Stable-Image-Ultra"],
  ["Azure", "TimeGEN-1"],
  ["Azure", "claude-haiku-4-5"],
  ["Azure", "claude-opus-4-1"],
  ["Azure", "claude-opus-4-5"],
  ["Azure", "claude-opus-4-6"],
  ["Azure", "claude-opus-4-7"],
  ["Azure", "claude-sonnet-4-5"],
  ["Azure", "claude-sonnet-4-6"],
  ["Azure", "codex-mini"],
  ["Azure", "gpt-4.1"],
  ["Azure", "gpt-4.1-mini"],
  ["Azure", "gpt-4.1-nano"],
  ["Azure", "gpt-4o"],
  ["Azure", "gpt-4o-mini"],
  ["Azure", "gpt-4o-mini-transcribe"],
  ["Azure", "gpt-4o-mini-tts"],
  ["Azure", "gpt-4o-transcribe"],
  ["Azure", "gpt-4o-transcribe-diarize"],
  ["Azure", "gpt-5"],
  ["Azure", "gpt-5-chat"],
  ["Azure", "gpt-5-codex"],
  ["Azure", "gpt-5-mini"],
  ["Azure", "gpt-5-nano"],
  ["Azure", "gpt-5-pro"],
  ["Azure", "gpt-5.1"],
  ["Azure", "gpt-5.1-chat"],
  ["Azure", "gpt-5.1-codex"],
  ["Azure", "gpt-5.1-codex-max"],
  ["Azure", "gpt-5.1-codex-mini"],
  ["Azure", "gpt-5.2"],
  ["Azure", "gpt-5.2-chat"],
  ["Azure", "gpt-5.2-codex"],
  ["Azure", "gpt-5.3-chat"],
  ["Azure", "gpt-5.3-codex"],
  ["Azure", "gpt-5.4"],
  ["Azure", "gpt-5.4-mini"],
  ["Azure", "gpt-5.4-nano"],
  ["Azure", "gpt-5.4-pro"],
  ["Azure", "gpt-5.5"],
  ["Azure", "gpt-5.6-luna"],
  ["Azure", "gpt-5.6-sol"],
  ["Azure", "gpt-5.6-terra"],
  ["Azure", "gpt-audio"],
  ["Azure", "gpt-audio-1.5"],
  ["Azure", "gpt-audio-mini"],
  ["Azure", "gpt-chat-latest"],
  ["Azure", "gpt-image-1"],
  ["Azure", "gpt-image-1-mini"],
  ["Azure", "gpt-image-1.5"],
  ["Azure", "gpt-image-2"],
  ["Azure", "gpt-realtime"],
  ["Azure", "gpt-realtime-1.5"],
  ["Azure", "gpt-realtime-2"],
  ["Azure", "gpt-realtime-2.1"],
  ["Azure", "gpt-realtime-2.1-mini"],
  ["Azure", "gpt-realtime-mini"],
  ["Azure", "grok-3"],
  ["Azure", "grok-3-mini"],
  ["Azure", "grok-4-20-non-reasoning"],
  ["Azure", "grok-4-20-reasoning"],
  ["Azure", "grok-4-fast-non-reasoning"],
  ["Azure", "grok-4-fast-reasoning"],
  ["Azure", "mistral-document-ai-2505"],
  ["Azure", "model-router"],
  ["Azure", "o1"],
  ["Azure", "o1-pro"],
  ["Azure", "o3"],
  ["Azure", "o3-deep-research"],
  ["Azure", "o3-mini"],
  ["Azure", "o3-pro"],
  ["Azure", "o4-mini"],
  ["Azure", "sora-2"],
  ["Azure", "text-embedding-3-large"],
  ["Azure", "text-embedding-3-small"],
  ["Azure", "text-embedding-ada-002"],
  ["Azure", "tsuzumi-7b"],
  ["Azure", "tts"],
  ["Azure", "tts-hd"],
  ["Azure", "whisper"],
  ["Cohere", "c4ai-aya-expanse-8b"],
  ["Cohere", "c4ai-aya-vision-8b"],
  ["Cohere", "command"],
  ["Cohere", "command-light"],
  ["Cohere", "command-r"],
  ["Cohere", "command-r-03-2024"],
  ["Cohere", "command-r-plus"],
  ["Cohere", "command-r-plus-04-2024"],
  ["Cohere", "embed-english-light-v2.0"],
  ["Cohere", "embed-english-v2.0"],
  ["Cohere", "embed-multilingual-v2.0"],
  ["Cohere", "rerank-english-v2.0"],
  ["Cohere", "rerank-multilingual-v2.0"],
  ["Google Vertex", "claude-3-5-haiku"],
  ["Google Vertex", "claude-3-5-sonnet"],
  ["Google Vertex", "claude-3-5-sonnet-v2"],
  ["Google Vertex", "claude-3-7-sonnet"],
  ["Google Vertex", "claude-3-haiku"],
  ["Google Vertex", "claude-3-opus"],
  ["Google Vertex", "jamba-1.5-large"],
  ["Google Vertex", "jamba-1.5-mini"],
  ["Google", "embedding-001"],
  ["Google", "embedding-2-preview"],
  ["Google", "embedding-gecko-001"],
  ["Google", "gemini-1.0-pro"],
  ["Google", "gemini-1.0-pro-vision"],
  ["Google", "gemini-1.5-flash"],
  ["Google", "gemini-1.5-flash-8b"],
  ["Google", "gemini-1.5-pro"],
  ["Google", "gemini-2.0-flash"],
  ["Google", "gemini-2.0-flash-001"],
  ["Google", "gemini-2.0-flash-exp"],
  ["Google", "gemini-2.0-flash-exp-image-generation"],
  ["Google", "gemini-2.0-flash-lite"],
  ["Google", "gemini-2.0-flash-lite-001"],
  ["Google", "gemini-2.0-flash-lite-preview"],
  ["Google", "gemini-2.0-flash-lite-preview-02-05"],
  ["Google", "gemini-2.0-flash-live-001"],
  ["Google", "gemini-2.0-flash-preview-image-generation"],
  ["Google", "gemini-2.0-flash-thinking-exp"],
  ["Google", "gemini-2.0-flash-thinking-exp-01-21"],
  ["Google", "gemini-2.0-flash-thinking-exp-1219"],
  ["Google", "gemini-2.0-pro-exp"],
  ["Google", "gemini-2.0-pro-exp-02-05"],
  ["Google", "gemini-2.5-flash"],
  ["Google", "gemini-2.5-flash-exp-native-audio-thinking-dialog"],
  ["Google", "gemini-2.5-flash-image"],
  ["Google", "gemini-2.5-flash-image-preview"],
  ["Google", "gemini-2.5-flash-lite"],
  ["Google", "gemini-2.5-flash-lite-preview-06-17"],
  ["Google", "gemini-2.5-flash-lite-preview-09-2025"],
  ["Google", "gemini-2.5-flash-preview-04-17"],
  ["Google", "gemini-2.5-flash-preview-05-20"],
  ["Google", "gemini-2.5-flash-preview-09-25"],
  ["Google", "gemini-2.5-flash-preview-native-audio-dialog"],
  ["Google", "gemini-2.5-pro"],
  ["Google", "gemini-2.5-pro-exp-03-25"],
  ["Google", "gemini-2.5-pro-preview-03-25"],
  ["Google", "gemini-2.5-pro-preview-05-06"],
  ["Google", "gemini-2.5-pro-preview-06-05"],
  ["Google", "gemini-3-pro-image-preview"],
  ["Google", "gemini-3-pro-preview"],
  ["Google", "gemini-3.1-flash-image-preview"],
  ["Google", "gemini-3.1-flash-lite"],
  ["Google", "gemini-3.1-flash-lite-preview"],
  ["Google", "gemini-embedding-001"],
  ["Google", "gemini-embedding-exp"],
  ["Google", "gemini-embedding-exp-03-07"],
  ["Google", "gemini-live-2.5-flash-preview"],
  ["Google", "gemini-robotics-er-1.5-preview"],
  ["Google", "gemini-robotics-er-1.6-preview"],
  ["Google", "imagen-3.0-generate-002"],
  ["Google", "imagen-4.0-fast-generate-001"],
  ["Google", "imagen-4.0-generate-001"],
  ["Google", "imagen-4.0-generate-preview-06-06"],
  ["Google", "imagen-4.0-ultra-generate-001"],
  ["Google", "imagen-4.0-ultra-generate-preview-06-06"],
  ["Google", "text-embedding-004"],
  ["Google", "veo-2.0-generate-001"],
  ["Google", "veo-3.0-fast-generate-001"],
  ["Google", "veo-3.0-fast-generate-preview"],
  ["Google", "veo-3.0-generate-001"],
  ["Google", "veo-3.0-generate-preview"],
  ["Groq", "deepseek-r1-distill-llama-70b"],
  ["Groq", "deepseek-r1-distill-llama-70b-specdec"],
  ["Groq", "deepseek-r1-distill-qwen-32b"],
  ["Groq", "distil-whisper-large-v3-en"],
  ["Groq", "gemma-7b-it"],
  ["Groq", "gemma2-9b-it"],
  ["Groq", "llama-3.1-70b-specdec"],
  ["Groq", "llama-3.1-70b-versatile"],
  ["Groq", "llama-3.1-8b-instant"],
  ["Groq", "llama-3.2-11b-text-preview"],
  ["Groq", "llama-3.2-11b-vision-preview"],
  ["Groq", "llama-3.2-1b-preview"],
  ["Groq", "llama-3.2-3b-preview"],
  ["Groq", "llama-3.2-90b-text-preview"],
  ["Groq", "llama-3.2-90b-vision-preview"],
  ["Groq", "llama-3.3-70b-specdec"],
  ["Groq", "llama-3.3-70b-versatile"],
  ["Groq", "llama-guard-3-8b"],
  ["Groq", "llama3-70b-8192"],
  ["Groq", "llama3-8b-8192"],
  ["Groq", "llama3-groq-70b-8192-tool-use-preview"],
  ["Groq", "llama3-groq-8b-8192-tool-use-preview"],
  ["Groq", "llava-v1.5-7b-4096-preview"],
  ["Groq", "meta-llama/llama-4-maverick-17b-128e-instruct"],
  ["Groq", "meta-llama/llama-4-scout-17b-16e-instruct"],
  ["Groq", "meta-llama/llama-guard-4-12b"],
  ["Groq", "mistral-saba-24b"],
  ["Groq", "mixtral-8x7b-32768"],
  ["Groq", "moonshotai/kimi-k2-instruct"],
  ["Groq", "moonshotai/kimi-k2-instruct-0905"],
  ["Groq", "playai-tts"],
  ["Groq", "playai-tts-arabic"],
  ["Groq", "qwen-2.5-32b"],
  ["Groq", "qwen-2.5-coder-32b"],
  ["Groq", "qwen-qwq-32b"],
  ["Groq", "qwen/qwen3-32b"],
  ["OpenAI", "Agent Builder"],
  ["OpenAI", "Evals platform"],
  ["OpenAI", "Reusable prompts"],
  ["OpenAI", "ada"],
  ["OpenAI", "babbage"],
  ["OpenAI", "babbage-002"],
  ["OpenAI", "chatgpt-4o-latest"],
  ["OpenAI", "chatgpt-image-latest"],
  ["OpenAI", "code-cushman-001"],
  ["OpenAI", "code-cushman-002"],
  ["OpenAI", "code-davinci-001"],
  ["OpenAI", "code-davinci-002"],
  ["OpenAI", "code-davinci-edit-001"],
  ["OpenAI", "code-search-ada-code-001"],
  ["OpenAI", "code-search-ada-text-001"],
  ["OpenAI", "code-search-babbage-code-001"],
  ["OpenAI", "code-search-babbage-text-001"],
  ["OpenAI", "codex-mini-latest"],
  ["OpenAI", "computer-use-preview"],
  ["OpenAI", "computer-use-preview-2025-03-11"],
  ["OpenAI", "curie"],
  ["OpenAI", "dall-e-2"],
  ["OpenAI", "dall-e-3"],
  ["OpenAI", "davinci"],
  ["OpenAI", "davinci-002"],
  ["OpenAI", "ft-babbage-002"],
  ["OpenAI", "ft-davinci-002"],
  ["OpenAI", "ft-gpt-3.5-turbo"],
  ["OpenAI", "ft-gpt-4"],
  ["OpenAI", "ft-gpt-4.1-nano-2025-04-14"],
  ["OpenAI", "ft-o4-mini-2025-04-16"],
  ["OpenAI", "gpt-3.5-turbo"],
  ["OpenAI", "gpt-3.5-turbo-0125"],
  ["OpenAI", "gpt-3.5-turbo-0301"],
  ["OpenAI", "gpt-3.5-turbo-0613"],
  ["OpenAI", "gpt-3.5-turbo-1106"],
  ["OpenAI", "gpt-3.5-turbo-16k-0613"],
  ["OpenAI", "gpt-3.5-turbo-completions"],
  ["OpenAI", "gpt-3.5-turbo-instruct"],
  ["OpenAI", "gpt-4"],
  ["OpenAI", "gpt-4-0125-preview"],
  ["OpenAI", "gpt-4-0314"],
  ["OpenAI", "gpt-4-0613"],
  ["OpenAI", "gpt-4-0613-completions"],
  ["OpenAI", "gpt-4-1106-preview"],
  ["OpenAI", "gpt-4-1106-vision-preview"],
  ["OpenAI", "gpt-4-32k"],
  ["OpenAI", "gpt-4-32k-0314"],
  ["OpenAI", "gpt-4-32k-0613"],
  ["OpenAI", "gpt-4-completions"],
  ["OpenAI", "gpt-4-turbo"],
  ["OpenAI", "gpt-4-turbo-2024-04-09"],
  ["OpenAI", "gpt-4-turbo-completions"],
  ["OpenAI", "gpt-4-turbo-preview"],
  ["OpenAI", "gpt-4-turbo-preview-completions"],
  ["OpenAI", "gpt-4-vision-preview"],
  ["OpenAI", "gpt-4.1-nano"],
  ["OpenAI", "gpt-4.1-nano-2025-04-14"],
  ["OpenAI", "gpt-4.5-preview"],
  ["OpenAI", "gpt-4o-2024-05-13"],
  ["OpenAI", "gpt-4o-audio"],
  ["OpenAI", "gpt-4o-audio-preview"],
  ["OpenAI", "gpt-4o-audio-preview-2024-10-01"],
  ["OpenAI", "gpt-4o-mini-audio"],
  ["OpenAI", "gpt-4o-mini-audio-preview"],
  ["OpenAI", "gpt-4o-mini-realtime"],
  ["OpenAI", "gpt-4o-mini-realtime-preview"],
  ["OpenAI", "gpt-4o-mini-search-preview-2025-03-11"],
  ["OpenAI", "gpt-4o-mini-transcribe-2025-03-20"],
  ["OpenAI", "gpt-4o-mini-tts-2025-03-20"],
  ["OpenAI", "gpt-4o-realtime"],
  ["OpenAI", "gpt-4o-realtime-preview"],
  ["OpenAI", "gpt-4o-realtime-preview-2024-10-01"],
  ["OpenAI", "gpt-4o-realtime-preview-2024-12-17"],
  ["OpenAI", "gpt-4o-realtime-preview-2025-06-03"],
  ["OpenAI", "gpt-4o-search-preview-2025-03-11"],
  ["OpenAI", "gpt-5-2025-08-07"],
  ["OpenAI", "gpt-5-chat-latest"],
  ["OpenAI", "gpt-5-codex"],
  ["OpenAI", "gpt-5-mini-2025-08-07"],
  ["OpenAI", "gpt-5-nano-2025-08-07"],
  ["OpenAI", "gpt-5-pro-2025-10-06"],
  ["OpenAI", "gpt-5.1-chat-latest"],
  ["OpenAI", "gpt-5.1-codex"],
  ["OpenAI", "gpt-5.1-codex-max"],
  ["OpenAI", "gpt-5.1-codex-mini"],
  ["OpenAI", "gpt-5.2-chat-latest"],
  ["OpenAI", "gpt-5.2-codex"],
  ["OpenAI", "gpt-5.3-chat-latest"],
  ["OpenAI", "gpt-audio"],
  ["OpenAI", "gpt-audio-mini"],
  ["OpenAI", "gpt-audio-mini-2025-10-06"],
  ["OpenAI", "gpt-image-1"],
  ["OpenAI", "gpt-image-1-mini"],
  ["OpenAI", "gpt-image-1.5"],
  ["OpenAI", "gpt-realtime"],
  ["OpenAI", "gpt-realtime-mini"],
  ["OpenAI", "gpt-realtime-mini-2025-10-06"],
  ["OpenAI", "o1"],
  ["OpenAI", "o1-2024-12-17"],
  ["OpenAI", "o1-mini"],
  ["OpenAI", "o1-preview"],
  ["OpenAI", "o1-pro"],
  ["OpenAI", "o1-pro-2025-03-19"],
  ["OpenAI", "o3-2025-04-16"],
  ["OpenAI", "o3-deep-research"],
  ["OpenAI", "o3-deep-research-2025-06-26"],
  ["OpenAI", "o3-mini"],
  ["OpenAI", "o3-mini-2025-01-31"],
  ["OpenAI", "o3-pro-2025-06-10"],
  ["OpenAI", "o4-mini"],
  ["OpenAI", "o4-mini-2025-04-16"],
  ["OpenAI", "o4-mini-deep-research"],
  ["OpenAI", "o4-mini-deep-research-2025-06-26"],
  ["OpenAI", "sora-2"],
  ["OpenAI", "sora-2-2025-10-06"],
  ["OpenAI", "sora-2-2025-12-08"],
  ["OpenAI", "sora-2-pro"],
  ["OpenAI", "sora-2-pro-2025-10-06"],
  ["OpenAI", "text-ada-001"],
  ["OpenAI", "text-babbage-001"],
  ["OpenAI", "text-curie-001"],
  ["OpenAI", "text-davinci-001"],
  ["OpenAI", "text-davinci-002"],
  ["OpenAI", "text-davinci-003"],
  ["OpenAI", "text-davinci-edit-001"],
  ["OpenAI", "text-moderation-007"],
  ["OpenAI", "text-moderation-latest"],
  ["OpenAI", "text-moderation-stable"],
  ["OpenAI", "text-search-ada-doc-001"],
  ["OpenAI", "text-search-ada-query-001"],
  ["OpenAI", "text-search-babbage-doc-001"],
  ["OpenAI", "text-search-babbage-query-001"],
  ["OpenAI", "text-search-curie-doc-001"],
  ["OpenAI", "text-search-curie-query-001"],
  ["OpenAI", "text-search-davinci-doc-001"],
  ["OpenAI", "text-search-davinci-query-001"],
  ["OpenAI", "text-similarity-ada-001"],
  ["OpenAI", "text-similarity-babbage-001"],
  ["OpenAI", "text-similarity-curie-001"],
  ["OpenAI", "text-similarity-davinci-001"],
  ["xAI", "grok-4"],
  ["xAI", "grok-4-1-fast"],
  ["xAI", "grok-4-fast"],
  ["xAI", "grok-code-fast-1"],
  ["xAI", "grok-imagine-image-pro"]
]);

// src/lifecycle/legacy-feed-adapter.ts
var MAX_LEGACY_RECORDS = 1e5;
var MAX_PAIR_DIAGNOSTIC_PREVIEWS = 50;
var MAX_DEPRECATION_CONTEXT_CODE_POINTS = 16384;
var MAX_CONTENT_HASH_CODE_POINTS = 256;
var EXPLICIT_OFFSET_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?(Z|([+-])([01]\d|2[0-3]):([0-5]\d))$/;
var MAX_FUTURE_SCRAPED_AT_SKEW_MS = 24 * 60 * 60 * 1000;
var SHA256_PATTERN2 = /^[a-f0-9]{64}$/;
var NON_MODEL_RECORD_KINDS2 = new Set([
  "api",
  "sdk",
  "feature",
  "tool",
  "product",
  "prompt",
  "agent",
  "other"
]);
var LEGACY_FIELDS = new Set([
  "provider",
  "model_id",
  "shutdown_date",
  "deprecation_date",
  "announcement_date",
  "replacement_models",
  "deprecation_context",
  "url",
  "content_hash",
  "scraped_at",
  "first_observed",
  "last_observed"
]);
var DEFAULT_LEGACY_ADAPTER_MANIFEST = Object.freeze({
  id: "deprecations-info-v1-reviewed-adapter",
  version: "2026-08-02.1+6317cee249b2",
  reviewedPairs: REVIEWED_LEGACY_SOURCE_PAIRS,
  reviewedPairCount: 416,
  reviewedPairsSha256: "6317cee249b2bf90918c816c842ecf7c1212eaddf9f05842b11babb2d60ac695",
  nonModels: Object.freeze([
    Object.freeze({ provider: "OpenAI", resourceId: "Reusable prompts", recordKind: "prompt" }),
    Object.freeze({ provider: "OpenAI", resourceId: "Evals platform", recordKind: "product" }),
    Object.freeze({ provider: "OpenAI", resourceId: "Agent Builder", recordKind: "agent" })
  ]),
  lexicalIneligiblePairs: Object.freeze([
    Object.freeze(["OpenAI", "ada"]),
    Object.freeze(["OpenAI", "babbage"]),
    Object.freeze(["OpenAI", "curie"]),
    Object.freeze(["OpenAI", "davinci"]),
    Object.freeze(["OpenAI", "o1"]),
    Object.freeze(["Azure", "o1"]),
    Object.freeze(["Azure", "o3"]),
    Object.freeze(["Azure", "tts"]),
    Object.freeze(["Azure", "whisper"]),
    Object.freeze(["Cohere", "command"])
  ]),
  dateCorrections: Object.freeze({
    announcementAfterLifecycle: "omit-source-observation-date",
    deprecationAfterShutdown: "omit-inverted-source-date"
  })
});
function sha2562(value) {
  return import_node_crypto4.createHash("sha256").update(value).digest("hex");
}
function compareText6(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function pairIdentity(provider, identifier) {
  return JSON.stringify([provider, identifier]);
}
function legacyPairSetSha256(pairs) {
  return sha2562(JSON.stringify([...pairs].sort((left, right) => compareText6(JSON.stringify(left), JSON.stringify(right)))));
}
function object3(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}
function text2(value, label, maximum = 1e5) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must not have leading or trailing whitespace.`);
  }
  if ([...value].length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} is too long or contains control characters.`);
  }
  return value;
}
function deprecationContext(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  if ([...value].length > MAX_DEPRECATION_CONTEXT_CODE_POINTS) {
    throw new Error(`${label} must contain at most ${MAX_DEPRECATION_CONTEXT_CODE_POINTS} Unicode code points.`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  return value;
}
function optionalDate(value, label) {
  if (value === undefined || value === null || value === "")
    return;
  const result = text2(value, label, 10);
  if (!isDateOnly(result))
    throw new Error(`${label} must be a real YYYY-MM-DD date.`);
  return result;
}
function optionalStrictDate(value, label) {
  if (value === undefined)
    return;
  const result = text2(value, label, 10);
  if (!isDateOnly(result))
    throw new Error(`${label} must be a real YYYY-MM-DD date.`);
  return result;
}
function parseExplicitOffsetTimestamp(value, label) {
  const candidate = text2(value, label, 128);
  const match = EXPLICIT_OFFSET_TIMESTAMP_PATTERN.exec(candidate);
  if (match === null || !isDateOnly(`${match[1]}-${match[2]}-${match[3]}`)) {
    throw new Error(`${label} must be a real RFC 3339 timestamp with an explicit "Z" or numeric UTC offset.`);
  }
  const zone = match[8];
  const offsetSign = match[9];
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  if (zone === "-00:00") {
    throw new Error(`${label} must identify a known UTC offset; -00:00 is not accepted.`);
  }
  const local = new Date(0);
  local.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  local.setUTCHours(Number(match[4]), Number(match[5]), Number(match[6]), Number((match[7] ?? "").slice(0, 3).padEnd(3, "0")));
  const signedOffsetMinutes = zone === "Z" ? 0 : (offsetSign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  const epochMs = local.getTime() - signedOffsetMinutes * 60000;
  const utc = new Date(epochMs).toISOString();
  if (!isRfc3339UtcInstant(utc)) {
    throw new Error(`${label} normalizes outside the supported four-digit UTC year range.`);
  }
  return { epochMs, utc };
}
function validateManifestClassifications(manifest) {
  text2(manifest.id, "Legacy adapter manifest id", V3_FEED_LIMITS.maxAdapterIdCodePoints);
  text2(manifest.version, "Legacy adapter manifest version", V3_FEED_LIMITS.maxAdapterVersionCodePoints);
  if (!Number.isSafeInteger(manifest.reviewedPairCount) || manifest.reviewedPairCount < 1 || manifest.reviewedPairCount > MAX_LEGACY_RECORDS) {
    throw new Error(`Legacy adapter manifest reviewedPairCount must be an integer from 1 to ${MAX_LEGACY_RECORDS}.`);
  }
  if (!SHA256_PATTERN2.test(manifest.reviewedPairsSha256)) {
    throw new Error("Legacy adapter manifest reviewedPairsSha256 must be lower-case SHA-256 hex.");
  }
  if (manifest.dateCorrections?.announcementAfterLifecycle !== "reject" && manifest.dateCorrections?.announcementAfterLifecycle !== "omit-source-observation-date") {
    throw new Error("Legacy adapter manifest has an invalid announcement-date correction policy.");
  }
  if (manifest.dateCorrections?.deprecationAfterShutdown !== "reject" && manifest.dateCorrections?.deprecationAfterShutdown !== "omit-inverted-source-date") {
    throw new Error("Legacy adapter manifest has an invalid deprecation-date correction policy.");
  }
  if (!Array.isArray(manifest.reviewedPairs) || !Array.isArray(manifest.nonModels) || !Array.isArray(manifest.lexicalIneligiblePairs)) {
    throw new Error("Legacy adapter manifest classifications must be arrays.");
  }
  const reviewedPairs = manifest.reviewedPairs.map((rawPair, index) => {
    if (!Array.isArray(rawPair) || rawPair.length !== 2) {
      throw new Error(`Legacy adapter manifest reviewedPairs[${index}] must be a provider/identifier pair.`);
    }
    const provider = text2(rawPair[0], `Legacy adapter manifest reviewedPairs[${index}][0]`, 100);
    if (platformForSourceProvider(provider) === null) {
      throw new Error(`Legacy adapter manifest reviewedPairs[${index}] uses an unregistered source provider.`);
    }
    const identifier = text2(rawPair[1], `Legacy adapter manifest reviewedPairs[${index}][1]`, V3_FEED_LIMITS.maxIdentifierCodePoints);
    return [provider, identifier];
  });
  const reviewedPairIdentities = new Set(reviewedPairs.map(([provider, identifier]) => pairIdentity(provider, identifier)));
  if (reviewedPairIdentities.size !== reviewedPairs.length) {
    throw new Error("Legacy adapter manifest reviewedPairs contains duplicates.");
  }
  if (reviewedPairs.length !== manifest.reviewedPairCount || legacyPairSetSha256(reviewedPairs) !== manifest.reviewedPairsSha256) {
    throw new Error("Legacy adapter manifest reviewedPairs does not match its pinned count and digest.");
  }
  const nonModels = new Map;
  for (const [index, rawEntry] of manifest.nonModels.entries()) {
    const entry = object3(rawEntry, `Legacy adapter manifest nonModels[${index}]`);
    const provider = text2(entry.provider, `Legacy adapter manifest nonModels[${index}].provider`, 100);
    const resourceId = text2(entry.resourceId, `Legacy adapter manifest nonModels[${index}].resourceId`, V3_FEED_LIMITS.maxIdentifierCodePoints);
    const recordKind = entry.recordKind;
    if (typeof recordKind !== "string" || !NON_MODEL_RECORD_KINDS2.has(recordKind)) {
      throw new Error(`Legacy adapter manifest nonModels[${index}].recordKind must be a supported non-model kind.`);
    }
    const identity = pairIdentity(provider, resourceId);
    if (!reviewedPairIdentities.has(identity)) {
      throw new Error(`Legacy adapter manifest classifies absent source pair ${provider}/${resourceId}.`);
    }
    if (nonModels.has(identity)) {
      throw new Error(`Legacy adapter manifest duplicates non-model source pair ${provider}/${resourceId}.`);
    }
    nonModels.set(identity, { provider, resourceId, recordKind });
  }
  const lexicalIneligible = new Set;
  for (const [index, rawPair] of manifest.lexicalIneligiblePairs.entries()) {
    if (!Array.isArray(rawPair) || rawPair.length !== 2) {
      throw new Error(`Legacy adapter manifest lexicalIneligiblePairs[${index}] must be a provider/model pair.`);
    }
    const provider = text2(rawPair[0], `Legacy adapter manifest lexicalIneligiblePairs[${index}][0]`, 100);
    const modelId2 = text2(rawPair[1], `Legacy adapter manifest lexicalIneligiblePairs[${index}][1]`, V3_FEED_LIMITS.maxIdentifierCodePoints);
    const identity = pairIdentity(provider, modelId2);
    if (!reviewedPairIdentities.has(identity)) {
      throw new Error(`Legacy adapter manifest marks absent source pair ${provider}/${modelId2} as lexical-ineligible.`);
    }
    if (nonModels.has(identity)) {
      throw new Error(`Legacy adapter manifest redundantly marks non-model source pair ${provider}/${modelId2} as lexical-ineligible.`);
    }
    if (lexicalIneligible.has(identity)) {
      throw new Error(`Legacy adapter manifest duplicates lexical-ineligible source pair ${provider}/${modelId2}.`);
    }
    lexicalIneligible.add(identity);
  }
  return { reviewedPairs, reviewedPairIdentities, nonModels, lexicalIneligible };
}
function parseLegacyRecord(value, index, now) {
  const label = `Legacy feed record ${index}`;
  const source = object3(value, label);
  const unknown = Object.keys(source).filter((key) => !LEGACY_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unreviewed field(s): ${unknown.sort().join(", ")}.`);
  }
  const provider = text2(source.provider, `${label}.provider`, 100);
  if (platformForSourceProvider(provider) === null) {
    throw new Error(`${label}.provider is not present in the reviewed platform mapping.`);
  }
  const modelId2 = text2(source.model_id, `${label}.model_id`, 2048);
  const shutdownDate = optionalDate(source.shutdown_date, `${label}.shutdown_date`);
  const deprecationDate = optionalDate(source.deprecation_date, `${label}.deprecation_date`);
  const announcementDate = optionalDate(source.announcement_date, `${label}.announcement_date`);
  if (shutdownDate === undefined && deprecationDate === undefined) {
    throw new Error(`${label} has neither a shutdown nor deprecation date.`);
  }
  let replacements = [];
  if (source.replacement_models !== undefined && source.replacement_models !== null) {
    if (!Array.isArray(source.replacement_models) || source.replacement_models.length > 100) {
      throw new Error(`${label}.replacement_models must be an array of at most 100 strings.`);
    }
    replacements = source.replacement_models.map((entry, replacementIndex) => text2(entry, `${label}.replacement_models[${replacementIndex}]`, 2048));
  }
  if (source.deprecation_context !== undefined) {
    deprecationContext(source.deprecation_context, `${label}.deprecation_context`);
  }
  if (source.content_hash !== undefined) {
    text2(source.content_hash, `${label}.content_hash`, MAX_CONTENT_HASH_CODE_POINTS);
  }
  const firstObserved = optionalStrictDate(source.first_observed, `${label}.first_observed`);
  const lastObserved = optionalStrictDate(source.last_observed, `${label}.last_observed`);
  if (firstObserved !== undefined && lastObserved !== undefined && firstObserved > lastObserved) {
    throw new Error(`${label}.first_observed must be on or before ${label}.last_observed.`);
  }
  const url = text2(source.url, `${label}.url`, 2048);
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`${label}.url must be an absolute HTTP(S) URL.`);
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:" || parsedUrl.hostname === "") {
    throw new Error(`${label}.url must be an absolute HTTP(S) URL.`);
  }
  if (parsedUrl.username !== "" || parsedUrl.password !== "") {
    throw new Error(`${label}.url must not contain credentials.`);
  }
  let scrapedAt;
  if (source.scraped_at !== undefined && source.scraped_at !== null && source.scraped_at !== "") {
    const parsed = parseExplicitOffsetTimestamp(source.scraped_at, `${label}.scraped_at`);
    if (parsed.epochMs > now + MAX_FUTURE_SCRAPED_AT_SKEW_MS) {
      throw new Error(`${label}.scraped_at is further ahead of the runtime clock than one day.`);
    }
    scrapedAt = parsed.utc;
  }
  return {
    provider,
    modelId: modelId2,
    replacements,
    url,
    ...shutdownDate === undefined ? {} : { shutdownDate },
    ...deprecationDate === undefined ? {} : { deprecationDate },
    ...announcementDate === undefined ? {} : { announcementDate },
    ...scrapedAt === undefined ? {} : { scrapedAt }
  };
}
function normalizeDates(record, manifest) {
  const shutdownDate = record.shutdownDate;
  let deprecationDate = record.deprecationDate;
  if (deprecationDate !== undefined && shutdownDate !== undefined && deprecationDate > shutdownDate) {
    if (manifest.dateCorrections.deprecationAfterShutdown === "reject") {
      throw new Error(`Legacy feed record ${record.provider}/${record.modelId} has deprecation_date after shutdown_date.`);
    }
    deprecationDate = undefined;
  }
  const firstLifecycleDate = deprecationDate ?? shutdownDate;
  let announcementDate = record.announcementDate;
  if (announcementDate !== undefined && firstLifecycleDate !== undefined && announcementDate > firstLifecycleDate) {
    if (manifest.dateCorrections.announcementAfterLifecycle === "reject") {
      throw new Error(`Legacy feed record ${record.provider}/${record.modelId} has announcement_date after its lifecycle date.`);
    }
    announcementDate = undefined;
  }
  return {
    ...announcementDate === undefined ? {} : { announcementDate },
    ...deprecationDate === undefined ? {} : { deprecationDate },
    ...shutdownDate === undefined ? {} : { shutdownDate }
  };
}
function legacyRecordId(record) {
  return `legacy-${sha2562(JSON.stringify([
    record.provider,
    record.modelId,
    record.url,
    record.announcementDate ?? null,
    record.deprecationDate ?? null,
    record.shutdownDate ?? null
  ]))}`;
}
function adaptDecodedLegacyFeed(payload, sourceBytes, manifest = DEFAULT_LEGACY_ADAPTER_MANIFEST, now = Date.now()) {
  if (!Number.isFinite(now))
    throw new Error("Legacy feed evaluation time must be finite.");
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > MAX_LEGACY_RECORDS) {
    throw new Error(`Legacy feed must be a non-empty array of at most ${MAX_LEGACY_RECORDS} records.`);
  }
  const records = payload.map((value, index) => parseLegacyRecord(value, index, now));
  const pairs = records.map((record) => [record.provider, record.modelId]);
  const receivedPairIdentities = new Set(pairs.map(([provider, identifier]) => pairIdentity(provider, identifier)));
  if (receivedPairIdentities.size !== records.length) {
    throw new Error("Legacy feed contains duplicate source provider/identifier pairs.");
  }
  const classifications = validateManifestClassifications(manifest);
  const addedPairs = pairs.filter(([provider, identifier]) => !classifications.reviewedPairIdentities.has(pairIdentity(provider, identifier))).sort((left, right) => compareText6(pairIdentity(...left), pairIdentity(...right)));
  const removedPairs = classifications.reviewedPairs.filter(([provider, identifier]) => !receivedPairIdentities.has(pairIdentity(provider, identifier))).sort((left, right) => compareText6(pairIdentity(...left), pairIdentity(...right)));
  const diagnostics = addedPairs.length === 0 && removedPairs.length === 0 ? [] : [
    {
      kind: "feed-pair-set-change",
      addedPairCount: addedPairs.length,
      removedPairCount: removedPairs.length,
      addedPairs: addedPairs.slice(0, MAX_PAIR_DIAGNOSTIC_PREVIEWS),
      removedPairs: removedPairs.slice(0, MAX_PAIR_DIAGNOSTIC_PREVIEWS)
    }
  ];
  for (const record of records)
    normalizeDates(record, manifest);
  const reviewedRecords = records.filter((record) => classifications.reviewedPairIdentities.has(pairIdentity(record.provider, record.modelId)));
  if (reviewedRecords.length === 0) {
    throw new Error("Legacy feed contains no reviewed records after pair-set quarantine.");
  }
  const generatedAt = reviewedRecords.map((record) => record.scrapedAt).filter((value) => value !== undefined).sort(compareText6).at(-1);
  if (generatedAt === undefined) {
    throw new Error("Legacy feed has no reviewed scraped_at timestamp for generatedAt.");
  }
  const generatedDate = generatedAt.slice(0, 10);
  const adaptedRecords = reviewedRecords.map((record) => {
    const servingPlatform = platformForSourceProvider(record.provider);
    if (servingPlatform === null) {
      throw new Error(`Unmapped source provider ${record.provider}.`);
    }
    const common = {
      recordId: legacyRecordId(record),
      servingPlatform,
      primarySourceUrl: record.url,
      supersedesRecordIds: []
    };
    const nonModel = classifications.nonModels.get(pairIdentity(record.provider, record.modelId));
    if (nonModel !== undefined) {
      return {
        ...common,
        recordKind: nonModel.recordKind,
        resourceId: record.modelId,
        displayName: record.modelId,
        literalScanEligible: false
      };
    }
    const dates = normalizeDates(record, manifest);
    const lifecycleStatus = dates.shutdownDate === undefined ? "deprecated" : dates.shutdownDate > generatedDate ? "shutdown-scheduled" : "retired";
    return {
      ...common,
      recordKind: "model",
      modelId: record.modelId,
      literalScanEligible: !classifications.lexicalIneligible.has(pairIdentity(record.provider, record.modelId)),
      lifecycleStatus,
      ...dates,
      replacementModels: record.replacements.map((modelId2) => ({
        modelId: modelId2,
        servingPlatform
      }))
    };
  });
  return {
    envelope: {
      schemaVersion: 3,
      adapter: {
        id: manifest.id,
        version: manifest.version,
        sourceSha256: sha2562(sourceBytes)
      },
      generatedAt,
      records: adaptedRecords
    },
    diagnostics
  };
}
function loadTypedOrReviewedLegacyFeed(sourceBytes, now = Date.now()) {
  if (sourceBytes.byteLength > V3_FEED_LIMITS.maxDocumentBytes) {
    throw new Error(`Lifecycle feed document exceeds ${V3_FEED_LIMITS.maxDocumentBytes} bytes.`);
  }
  const payload = decodeJsonDocument(sourceBytes, "Lifecycle feed").value;
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload) && payload.schemaVersion === 3) {
    return loadV3FeedJson(sourceBytes, {
      expectedAdapter: { id: "deprecations-info-v3", version: "1" }
    });
  }
  const adaptation = adaptDecodedLegacyFeed(payload, sourceBytes, DEFAULT_LEGACY_ADAPTER_MANIFEST, now);
  return loadAdaptedV3Feed(sourceBytes, adaptation.envelope, DEFAULT_LEGACY_ADAPTER_MANIFEST, adaptation.diagnostics);
}

// src/lifecycle/feed-source.ts
var DEFAULT_V3_FEED_URL = "https://deprecations.info/v1/deprecations.json";
async function loadLifecycleFeed(dependencies = {}) {
  const bytes = dependencies.bytes ?? await fetchBoundedDocumentBytes(DEFAULT_V3_FEED_URL, dependencies.requestPolicy ?? defaultRequestPolicy(dependencies.fetch ?? fetch), V3_FEED_LIMITS.maxDocumentBytes);
  return loadTypedOrReviewedLegacyFeed(bytes);
}

// src/action/input.ts
function preview(value) {
  if (value === undefined)
    return "undefined";
  return JSON.stringify(value.length <= 160 ? value : `${value.slice(0, 159)}…`);
}
function parseOptionalInteger(raw, inputName, options = {}) {
  const normalized = raw?.trim() ?? "";
  if (normalized === "")
    return null;
  if (!/^(0|[1-9][0-9]*)$/.test(normalized)) {
    throw new Error(`Invalid ${inputName}: expected a non-negative base-10 integer, got ${preview(raw)}.`);
  }
  const value = Number(normalized);
  const minimum = options.min ?? 0;
  const maximum = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${inputName}: expected an integer from ${minimum} to ${maximum}, got ${preview(raw)}.`);
  }
  return value;
}
function parseBoolean(raw, inputName, fallback) {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === undefined || normalized === "")
    return fallback;
  if (normalized === "true")
    return true;
  if (normalized === "false")
    return false;
  throw new Error(`Invalid ${inputName}: expected \`true\` or \`false\`, got ${preview(raw)}.`);
}
function parseHttpsUrl(raw, inputName) {
  if (raw.length > 8192)
    throw new Error(`Invalid ${inputName}: URL is too long.`);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid ${inputName}: expected an absolute HTTPS URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new Error(`Invalid ${inputName}: HTTPS without URL credentials is required.`);
  }
  return parsed.toString();
}
function parseActionInputs(environment) {
  const rawWarn = getInput("warn-within-days", environment);
  const rawFail = getInput("fail-within-days", environment);
  const rawAllowPartial = getInput("allow-partial", environment);
  const rawMaxFeedAge = getInput("max-feed-age-days", environment);
  const slackWebhook = getInput("slack-webhook", environment);
  const rawNotificationFailure = getInput("notification-failure-mode", environment);
  const warnWithinDays = parseOptionalInteger(rawWarn, "warn-within-days", {
    max: MAX_POLICY_DAYS
  });
  const failWithinDays = parseOptionalInteger(rawFail, "fail-within-days", {
    max: MAX_POLICY_DAYS
  });
  const allowPartial = rawAllowPartial === undefined || rawAllowPartial === "" ? null : parseBoolean(rawAllowPartial, "allow-partial", false);
  const maxFeedAgeDays = rawMaxFeedAge === undefined ? DEFAULT_MAX_FEED_AGE_DAYS : parseOptionalInteger(rawMaxFeedAge, "max-feed-age-days", { max: MAX_POLICY_DAYS });
  const notificationFailureMode = rawNotificationFailure?.toLowerCase() || "fail";
  if (notificationFailureMode !== "fail" && notificationFailureMode !== "warn") {
    throw new Error("Invalid notification-failure-mode: expected `fail` or `warn`.");
  }
  const result = {
    warnWithinDays,
    failWithinDays,
    allowPartial,
    maxFeedAgeDays,
    notificationFailureMode
  };
  if (slackWebhook)
    result.slackWebhook = parseHttpsUrl(slackWebhook, "slack-webhook");
  return result;
}

// src/shared/text.ts
var BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
var CONTROL_OR_WHITESPACE_PATTERN = /[\u0000-\u001f\u007f-\u009f\s]+/g;
function compact(value, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1) {
    throw new Error("Text compaction maximum must be a positive safe integer.");
  }
  const singleLine = value.replace(BIDI_CONTROL_PATTERN, "").replace(CONTROL_OR_WHITESPACE_PATTERN, " ").trim();
  const codePoints = [...singleLine];
  if (codePoints.length <= maximum)
    return singleLine;
  return `${codePoints.slice(0, maximum - 1).join("")}…`;
}
function servingPlatformLabel(finding) {
  const platforms = finding.servingPlatforms.length === 0 ? [finding.servingPlatform] : finding.servingPlatforms;
  return platforms.join(" or ");
}
function resultIcon(result, scanStatus) {
  if (result === "blocking" || result === "unknown")
    return "❌";
  if (result === "advisory" || scanStatus === "partial")
    return "⚠️";
  return "✅";
}

// src/action/notification.ts
var MAX_SLACK_TEXT_BYTES = 12000;
var MAX_ACTIONABLE_FINDINGS = 10;
var MAX_EVIDENCE_SOURCES = 8;
var TRUSTED_NOTIFICATION_EVENTS = new Set(["schedule", "workflow_dispatch", "push"]);
var PROTECTED_SCOPES2 = new Set(["documentation", "example", "test"]);
var REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
var OID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
var RUN_ID_PATTERN = /^[0-9]{1,20}$/;
var SAFE_LINK_PATTERN = /^https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{1,2000}$/;
var BIDI_CONTROL_PATTERN2 = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
function compareText7(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function compact2(value, maximum) {
  const singleLine = value.replace(BIDI_CONTROL_PATTERN2, "").replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
  const codePoints = [...singleLine];
  if (codePoints.length <= maximum)
    return singleLine;
  return `${codePoints.slice(0, maximum - 1).join("")}…`;
}
function slackText(value, maximum) {
  return compact2(value, maximum).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/@/g, "@​").replace(/\*/g, "∗").replace(/_/g, "＿").replace(/~/g, "∼").replace(/`/g, "ˋ");
}
function boundedSlackText(value) {
  if (Buffer.byteLength(value, "utf8") <= MAX_SLACK_TEXT_BYTES)
    return value;
  const suffix = `
… snapshot truncated`;
  const byteLimit = MAX_SLACK_TEXT_BYTES - Buffer.byteLength(suffix, "utf8");
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > byteLimit)
      break;
    result += character;
    bytes += characterBytes;
  }
  return `${result.trimEnd()}${suffix}`;
}
function repositoryName() {
  const candidate = process.env.GITHUB_REPOSITORY?.trim();
  return candidate !== undefined && REPOSITORY_PATTERN.test(candidate) ? candidate : null;
}
function selectedTarget(report) {
  return OID_PATTERN.test(report.event.targetOid) ? report.event.targetOid : "unavailable";
}
function isTextMatch(finding) {
  return finding.confidence === "low";
}
function partitionFindings(report) {
  const outcomeRank = {
    breach: 0,
    warning: 1
  };
  const notifiable = report.lifecycleFindings.filter((finding) => (finding.outcome === "breach" || finding.outcome === "warning") && finding.delta !== "resolved");
  const listed = notifiable.filter((finding) => !PROTECTED_SCOPES2.has(finding.scope)).sort((left, right) => {
    const outcomeDifference = outcomeRank[left.outcome] - outcomeRank[right.outcome];
    if (outcomeDifference !== 0)
      return outcomeDifference;
    const tierDifference = Number(isTextMatch(left)) - Number(isTextMatch(right));
    if (tierDifference !== 0)
      return tierDifference;
    const leftDays = earliestLifecycleDays(left) ?? Number.POSITIVE_INFINITY;
    const rightDays = earliestLifecycleDays(right) ?? Number.POSITIVE_INFINITY;
    if (leftDays !== rightDays)
      return leftDays - rightDays;
    const platformDifference = compareText7(left.servingPlatform, right.servingPlatform);
    return platformDifference !== 0 ? platformDifference : compareText7(left.modelId, right.modelId);
  });
  return {
    listed,
    withheld: notifiable.filter((finding) => PROTECTED_SCOPES2.has(finding.scope))
  };
}
function dateText(label, date, days) {
  if (days === null || days === undefined || !Number.isSafeInteger(days)) {
    return `${label} ${date}`;
  }
  if (days < 0)
    return `${label} ${date} (${Math.abs(days)}d overdue)`;
  if (days === 0)
    return `${label} ${date} (today)`;
  return `${label} ${date} (${days}d)`;
}
function deadlineText(finding) {
  if (finding.shutdownDate === undefined)
    return "shutdown date not announced";
  return dateText("shutdown", finding.shutdownDate, finding.daysUntilShutdown);
}
function safeLink(candidate) {
  if (candidate === undefined)
    return null;
  const trimmed = candidate.trim();
  if (!SAFE_LINK_PATTERN.test(trimmed))
    return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  return parsed.username === "" && parsed.password === "" ? trimmed : null;
}
function slackLink(url, label) {
  return `<${url.replace(/&/g, "&amp;")}|${label}>`;
}
function replacementText(finding) {
  const replacement = finding.replacementModels[0];
  if (replacement === undefined)
    return null;
  const platform2 = replacement.servingPlatform;
  return `→ ${platform2 === undefined || platform2 === finding.servingPlatform ? replacement.modelId : `${platform2}/${replacement.modelId}`}`;
}
function findingLabel(finding) {
  if (finding.outcome === "breach")
    return "BLOCKING";
  return isTextMatch(finding) ? "ADVISORY (text match)" : "ADVISORY";
}
function findingLine(finding) {
  const qualifiers = [];
  if (deprecationLeadsHorizon(finding) && finding.deprecationDate !== undefined) {
    qualifiers.push(dateText("deprecation", finding.deprecationDate, finding.daysUntilDeprecation));
  }
  qualifiers.push(deadlineText(finding));
  if (finding.delta !== undefined && finding.delta !== "unchanged") {
    qualifiers.push(finding.delta);
  }
  if (finding.feedConflict)
    qualifiers.push("feed conflict");
  const replacement = replacementText(finding);
  if (replacement !== null)
    qualifiers.push(replacement);
  const line = `• *${findingLabel(finding)}* ${slackText(servingPlatformLabel(finding), 160)} / ${slackText(finding.modelId, 180)} — ${qualifiers.map((value) => slackText(value, 100)).join(" · ")}`;
  const source = safeLink(finding.sourceUrls[0]);
  return source === null ? line : `${line} · ${slackLink(source, "source")}`;
}
function workflowRunUrl() {
  const repository = repositoryName();
  const runId = process.env.GITHUB_RUN_ID?.trim();
  const server = process.env.GITHUB_SERVER_URL?.trim();
  if (repository === null || server === undefined)
    return null;
  if (runId === undefined || !RUN_ID_PATTERN.test(runId))
    return null;
  let origin;
  try {
    const parsed = new URL(server);
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
      return null;
    }
    origin = parsed.origin;
  } catch {
    return null;
  }
  return safeLink(`${origin}/${repository}/actions/runs/${runId}`);
}
function reportFileHint(path) {
  const normalized = compact2(path, 1024);
  if (normalized === "")
    return null;
  const components = normalized.split(/[\\/]/);
  const basename = components.at(-1)?.trim();
  return basename ? slackText(basename, 180) : null;
}
function resultIcon2(report) {
  if (report.result === "blocking" || report.result === "unknown")
    return "❌";
  if (report.result === "advisory" || report.scanStatus === "partial")
    return "⚠️";
  return "✅";
}
function renderSlackSnapshot(report) {
  const repository = repositoryName();
  const { listed, withheld } = partitionFindings(report);
  const externalSources = report.evidenceSources.filter((source) => source.kind !== "repository");
  const lines = [
    `${resultIcon2(report)} *AI model lifecycle snapshot*`,
    `*Result:* ${report.result} · *Scan:* ${report.scanStatus} · *Evidence:* ${report.evidenceHealth}`,
    `*Counts:* ${report.counts.blocking} blocking · ${report.counts.advisory} advisory · ${report.counts.unresolved} unresolved`
  ];
  if (repository !== null)
    lines.push(`*Repository:* ${slackText(repository, 201)}`);
  lines.push(`*Event:* ${slackText(report.event.eventName, 80)} · *Target:* ${selectedTarget(report)}`, `*Evaluated:* ${slackText(report.evaluatedAt, 80)}`);
  if (externalSources.length > 0) {
    lines.push("", "*Checked-in evidence sources:*");
    for (const source of externalSources.slice(0, MAX_EVIDENCE_SOURCES)) {
      lines.push(`• ${slackText(source.id, 160)} — ${slackText(source.kind, 40)} / ${source.health}`);
    }
    if (externalSources.length > MAX_EVIDENCE_SOURCES) {
      lines.push(`• … ${externalSources.length - MAX_EVIDENCE_SOURCES} more source(s)`);
    }
  }
  lines.push("", `*Actionable findings (${listed.length}):*`);
  if (listed.length === 0 && withheld.length === 0) {
    lines.push("• None in the bounded notification view.");
  } else {
    lines.push(...listed.slice(0, MAX_ACTIONABLE_FINDINGS).map(findingLine));
    if (listed.length > MAX_ACTIONABLE_FINDINGS) {
      lines.push(`• … ${listed.length - MAX_ACTIONABLE_FINDINGS} more finding(s) in the report`);
    }
    if (withheld.length > 0) {
      lines.push(`• ${withheld.length} counted finding(s) outside application and deployment scope stay in the job summary.`);
    }
  }
  const runUrl = workflowRunUrl();
  const reportHint = reportFileHint(report.reportPath);
  const trailer = [];
  if (runUrl !== null)
    trailer.push(`*Run:* ${slackLink(runUrl, "workflow run")}`);
  if (reportHint !== null) {
    trailer.push(`*Report:* ${reportHint} (runner-local; upload it as an artifact to retain it)`);
  }
  if (trailer.length > 0)
    lines.push("", ...trailer);
  return boundedSlackText(lines.join(`
`));
}
function safeFailureDetail(error) {
  const message = error instanceof Error ? error.message : String(error);
  const status = /\bHTTP\s+(\d{3})\b/i.exec(message)?.[1];
  if (status !== undefined)
    return `Slack webhook returned HTTP ${status}.`;
  if (/timed out|abort/i.test(message))
    return "Slack webhook request timed out.";
  return "Slack webhook delivery failed.";
}
async function deliverSlackNotification(options) {
  if (!TRUSTED_NOTIFICATION_EVENTS.has(options.report.event.eventName) || options.report.event.targetKind !== "commit") {
    return {
      status: "skipped",
      detail: `Slack snapshots are disabled for ${slackText(options.report.event.eventName, 80)} events.`
    };
  }
  let webhookUrl;
  try {
    webhookUrl = parseHttpsUrl(options.webhookUrl, "slack-webhook");
  } catch {
    return { status: "failed", detail: "Slack webhook configuration is invalid." };
  }
  try {
    await postSlack(webhookUrl, renderSlackSnapshot(options.report), defaultRequestPolicy(options.fetchImpl));
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", detail: safeFailureDetail(error) };
  }
}

// src/action/publish.ts
var import_node_fs3 = require("node:fs");
var import_node_path2 = require("node:path");
var MAX_DETAIL_OUTPUT_BYTES = 120 * 1024;
var MAX_TOTAL_OUTPUT_BYTES = 700 * 1024;
var MAX_REPORT_BYTES = 25 * 1024 * 1024;
var MAX_ANNOTATIONS = 10;
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/#/g, "&#35;").replace(/\\/g, "&#92;").replace(/\|/g, "&#124;").replace(/`/g, "&#96;").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;").replace(/!/g, "&#33;").replace(/\(/g, "&#40;").replace(/\)/g, "&#41;").replace(/\*/g, "&#42;").replace(/_/g, "&#95;").replace(/~/g, "&#126;").replace(/@/g, "&#64;").replace(/:/g, "&#58;").replace(/\./g, "&#46;").replace(/[\r\n]+/g, "<br>");
}
function resultIcon3(report) {
  return resultIcon(report.result, report.scanStatus);
}
function deliveryLine(report, options = {}) {
  if (options.notificationPending) {
    return "Delivery: GitHub Actions summary published; Slack snapshot pending";
  }
  if (report.notificationStatus === "disabled")
    return "Delivery: GitHub Actions summary only";
  if (report.notificationStatus === "sent")
    return "Delivery: GitHub Actions summary + Slack snapshot";
  if (report.notificationStatus === "failed") {
    return `Delivery: GitHub Actions summary; Slack failed (${escapeHtml(compact(report.notificationReason, 300))})`;
  }
  return `Delivery: GitHub Actions summary; Slack skipped (${escapeHtml(compact(report.notificationReason, 300))})`;
}
function deadlineCell(finding) {
  if (deprecationLeadsHorizon(finding) && finding.deprecationDate !== undefined) {
    return `deprecation ${escapeHtml(finding.deprecationDate)} (${finding.daysUntilDeprecation ?? "?"}d)`;
  }
  return finding.shutdownDate === undefined ? "Not announced" : `shutdown ${escapeHtml(finding.shutdownDate)} (${finding.daysUntilShutdown ?? "?"}d)`;
}
function findingRow(finding) {
  const delta = finding.delta === undefined ? "—" : finding.delta;
  return `| <code>${escapeHtml(compact(finding.modelId, 160))}</code> | ${escapeHtml(compact(servingPlatformLabel(finding), 300))} | ${escapeHtml(finding.outcome)} | ${escapeHtml(delta)} | ${deadlineCell(finding)} |`;
}
function renderSummary(report, options = {}) {
  const actionable = report.lifecycleFindings.filter((finding) => finding.outcome === "breach" || finding.outcome === "warning");
  const visibleSources = report.evidenceSources.slice(0, 20);
  const hiddenSourceCount = report.evidenceSources.length - visibleSources.length;
  const sourceText = report.evidenceSources.length === 1 ? "repository only" : `${visibleSources.map((source) => `${compact(source.id, 180)} (${source.kind}, ${source.health})`).join(" + ")}${hiddenSourceCount > 0 ? ` + ${hiddenSourceCount} more` : ""}`;
  const lines = [
    "## AI model lifecycle",
    "",
    `${resultIcon3(report)} **${report.result}** · ${report.counts.blocking} blocking · ${report.counts.advisory} advisory · ${report.counts.unresolved} unresolved`,
    "",
    `Evidence: ${escapeHtml(sourceText)} · Scan: ${report.scanStatus} · Comparison: ${report.comparisonStatus}`,
    deliveryLine(report, options),
    ""
  ];
  if (report.result === "unknown") {
    lines.push("### Outcome", "", "A trustworthy lifecycle result could not be produced. Review the failed or partial coverage diagnostics below.", "");
  } else if (actionable.length === 0) {
    lines.push("### Outcome", "", "No actionable lifecycle risk found in eligible repository evidence.", "");
    if (report.evidenceSources.length === 1) {
      lines.push("No runtime or control-plane evidence source was supplied; those systems were not assessed.", "");
    }
  } else {
    lines.push("### Actionable lifecycle findings", "", "| Model | Serving platform | Outcome | Change | Next lifecycle date |", "| --- | --- | --- | --- | --- |", ...actionable.slice(0, 100).map(findingRow), "");
    if (actionable.length > 100) {
      lines.push(`${actionable.length - 100} additional finding(s) are in the local JSON report.`, "");
    }
  }
  if (report.unresolvedReferences.length > 0) {
    lines.push("### Conditional and unresolved evidence", "", ...report.unresolvedReferences.slice(0, 50).map((fact) => {
      const location = fact.locations[0];
      return `- <code>${escapeHtml(compact(fact.rawValue, 180))}</code> — ${escapeHtml(compact(fact.detectorRuleId, 240))} · ${fact.modelResolution}/${fact.platformResolution}${location === undefined ? "" : ` · <code>${escapeHtml(compact(location.path, 300))}</code>`}`;
    }), "");
  }
  const external = report.evidenceSources.filter((source) => source.kind !== "repository");
  if (external.length > 0) {
    lines.push("### External evidence health", "", ...external.slice(0, 50).map((source) => `- ${escapeHtml(compact(source.id, 180))}: **${source.health}**`), ...external.length > 50 ? [`- ${external.length - 50} additional source(s) are in the JSON report.`] : [], "");
  }
  if (report.policyDiff.length > 0) {
    lines.push("### Policy and evidence changes", "", ...report.policyDiff.slice(0, 100).map((change) => `- ${escapeHtml(compact(change, 500))}`), "");
  }
  const suppressed = report.lifecycleFindings.filter((finding) => finding.suppressedBy !== undefined);
  if (suppressed.length > 0) {
    lines.push("### Active suppressions", "", ...suppressed.slice(0, 100).map((finding) => `- <code>${escapeHtml(compact(finding.modelId, 160))}</code> on ${escapeHtml(compact(servingPlatformLabel(finding), 300))} — <code>${escapeHtml(compact(finding.suppressedBy, 160))}</code>`), ...suppressed.length > 100 ? [`- ${suppressed.length - 100} additional suppressed finding(s) are in the JSON report.`] : [], "");
  }
  if (report.diagnostics.length > 0) {
    lines.push("<details>", "<summary>Coverage and provenance diagnostics</summary>", "", ...report.diagnostics.slice(0, 200).map((diagnostic) => `- ${escapeHtml(compact(diagnostic.code, 180))}${diagnostic.path === undefined ? "" : ` · <code>${escapeHtml(compact(diagnostic.path, 300))}</code>`}: ${escapeHtml(compact(diagnostic.message, 800))}`), "", "</details>", "");
  }
  const feedFreshness = report.feed.generatedAt === "" || report.feed.ageDays === null ? "unavailable" : `${escapeHtml(report.feed.generatedAt)} (${report.feed.ageDays}d old)`;
  lines.push(`Feed: source <code>${report.feed.sourceFeedSha256}</code> · active <code>${report.feed.activeRecordsSha256}</code> · generated ${feedFreshness}`, `Detector manifest: <code>${report.detectorManifestSha256}</code> · Report: <code>${escapeHtml(compact(report.reportPath, 500))}</code>`, "");
  return lines.join(`
`);
}
function annotationText(finding) {
  const deadline = finding.shutdownDate === undefined ? "shutdown date not announced" : `shutdown ${finding.shutdownDate} (${finding.daysUntilShutdown ?? "?"} day(s))`;
  const deprecation = deprecationLeadsHorizon(finding) && finding.deprecationDate !== undefined ? `deprecation ${finding.deprecationDate} (${finding.daysUntilDeprecation ?? "?"} day(s)), ` : "";
  return `${finding.modelId} on ${servingPlatformLabel(finding)}: ${deprecation}${deadline}. ${finding.reasons.join(" ")}`;
}
function publishAnnotations(report, log = console.log) {
  const actionable = report.lifecycleFindings.filter((finding) => (finding.outcome === "breach" || finding.outcome === "warning") && finding.delta !== "unchanged" && finding.delta !== "resolved");
  let emitted = 0;
  for (const finding of actionable) {
    if (emitted >= MAX_ANNOTATIONS)
      break;
    const location = finding.locations[0];
    if (location === undefined || Buffer.byteLength(location.path, "utf8") > 1024) {
      emitCommand(finding.outcome === "breach" ? "error" : "warning", compact(annotationText(finding), 2000), log);
    } else {
      emitAnnotation(finding.outcome === "breach" ? "error" : "warning", compact(annotationText(finding), 2000), {
        title: "AI model lifecycle",
        file: location.path,
        line: location.line,
        col: location.column
      }, log);
    }
    emitted += 1;
  }
  if (actionable.length > emitted) {
    emitCommand("notice", `${actionable.length - emitted} additional lifecycle annotation(s) were collapsed into the summary and report.`, log);
  }
}
function boundedJson(values) {
  const complete = JSON.stringify(values);
  if (Buffer.byteLength(complete, "utf8") <= MAX_DETAIL_OUTPUT_BYTES) {
    return { json: complete, truncated: false };
  }
  const parts = [];
  let bytes = 2;
  for (const value of values) {
    const serialized = JSON.stringify(value);
    const addition = Buffer.byteLength(serialized, "utf8") + (parts.length === 0 ? 0 : 1);
    if (bytes + addition > MAX_DETAIL_OUTPUT_BYTES)
      break;
    parts.push(serialized);
    bytes += addition;
  }
  return { json: `[${parts.join(",")}]`, truncated: true };
}
function outputSize(outputs) {
  return Object.entries(outputs).reduce((total, [key, value]) => total + Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8") + 100, 0);
}
function writeAssessmentReport(report) {
  const serialized = `${JSON.stringify(report, null, 2)}
`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_REPORT_BYTES) {
    throw new Error(`The complete assessment report exceeds ${MAX_REPORT_BYTES} bytes.`);
  }
  import_node_fs3.mkdirSync(import_node_path2.dirname(report.reportPath), { recursive: true });
  import_node_fs3.writeFileSync(report.reportPath, serialized, { encoding: "utf8", mode: 384 });
}
function publishCoreOutputs(report, environment) {
  const sources = boundedJson(report.evidenceSources);
  const evidence = boundedJson(report.evidenceFacts);
  const findings = boundedJson(report.lifecycleFindings);
  const unresolved = boundedJson(report.unresolvedReferences);
  report.outputTruncated = sources.truncated || evidence.truncated || findings.truncated || unresolved.truncated;
  const evidenceFingerprint = canonicalSha256("ai-model-eol/evidence-set/v3", report.evidenceFacts.map((fact) => fact.evidenceId).sort());
  const findingFingerprint2 = canonicalSha256("ai-model-eol/finding-set/v3", report.lifecycleFindings.map((finding) => finding.findingId).sort());
  const outputs = {
    result: report.result,
    "baseline-result": report.baselineResult ?? "",
    "target-result": report.targetResult ?? "",
    "scan-status": report.scanStatus,
    "baseline-scan-status": report.baselineScanStatus ?? "",
    "target-scan-status": report.targetScanStatus ?? "",
    "comparison-status": report.comparisonStatus,
    "exit-reason": report.exitReason,
    "target-kind": report.targetKind,
    "evidence-health": report.evidenceHealth,
    "evidence-sources": sources.json,
    "evidence-facts": evidence.json,
    "lifecycle-findings": findings.json,
    "unresolved-references": unresolved.json,
    counts: JSON.stringify(report.counts),
    "source-feed-sha256": report.feed.sourceFeedSha256,
    "normalized-feed-sha256": report.feed.normalizedFeedSha256,
    "active-records-sha256": report.feed.activeRecordsSha256,
    "feed-adapter-manifest-sha256": report.feed.feedAdapterManifestSha256,
    "feed-generated-at": report.feed.generatedAt,
    "feed-age-days": report.feed.ageDays === null ? "" : String(report.feed.ageDays),
    "detector-manifest-sha256": report.detectorManifestSha256,
    "evidence-fingerprint": evidenceFingerprint,
    "finding-fingerprint": findingFingerprint2,
    "scan-fingerprint": report.scanFingerprint,
    "alert-fingerprint": report.alertFingerprint,
    "output-truncated": String(report.outputTruncated),
    "report-path": report.reportPath
  };
  if (outputSize(outputs) > MAX_TOTAL_OUTPUT_BYTES) {
    outputs["evidence-facts"] = "[]";
    outputs["unresolved-references"] = "[]";
    outputs["output-truncated"] = "true";
    report.outputTruncated = true;
  }
  if (outputSize(outputs) > MAX_TOTAL_OUTPUT_BYTES) {
    outputs["lifecycle-findings"] = "[]";
    outputs["output-truncated"] = "true";
  }
  if (outputSize(outputs) > MAX_TOTAL_OUTPUT_BYTES) {
    outputs["evidence-sources"] = "[]";
    outputs["output-truncated"] = "true";
  }
  if (outputSize(outputs) > MAX_TOTAL_OUTPUT_BYTES) {
    throw new Error("Required GitHub outputs exceed the bounded publication budget.");
  }
  for (const [name, value] of Object.entries(outputs)) {
    appendCommand(environment.GITHUB_OUTPUT, name, value);
  }
}
function publishNotificationOutputs(report, environment) {
  appendCommand(environment.GITHUB_OUTPUT, "notification-status", report.notificationStatus);
  appendCommand(environment.GITHUB_OUTPUT, "notification-reason", report.notificationReason);
}
function publishSummary(report, environment, options = {}) {
  appendSummary(environment.GITHUB_STEP_SUMMARY, renderSummary(report, options));
}
function publishNotificationSummary(report, environment) {
  appendSummary(environment.GITHUB_STEP_SUMMARY, [
    "## Notification delivery",
    "",
    `Slack: **${report.notificationStatus}** · ${escapeHtml(compact(report.notificationReason, 800))}`,
    ""
  ].join(`
`));
}

// src/evidence/external-evidence.ts
var DEFAULT_EVIDENCE_PREFIX = ".github/ai-model-evidence/";
var MAX_EVIDENCE_DOCUMENT_BYTES = 2 * 1024 * 1024;
var MAX_EVIDENCE_RECORDS = 1e4;
var ID2 = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
var PLATFORM2 = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
var RFC3339_UTC2 = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?Z$/;
var PLATFORMS = new Set([
  "openai",
  "azure",
  "anthropic",
  "aws-bedrock",
  "google",
  "google-vertex",
  "cohere",
  "groq",
  "xai"
]);
var SCOPES3 = new Set([
  "application",
  "deployment",
  "test",
  "example",
  "documentation",
  "unknown"
]);
var ENVIRONMENTS2 = new Set([
  "production",
  "staging",
  "development",
  "test",
  "unknown"
]);
function isObject2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function object4(value, label) {
  if (!isObject2(value))
    throw new Error(`${label} must be an object.`);
  return value;
}
function exactKeys2(source, keys, label) {
  const supported = new Set(keys);
  const unknown = Object.keys(source).filter((key) => !supported.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unsupported field(s): ${unknown.sort().join(", ")}.`);
  }
}
function text3(value, label, maximum = 4096) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(`${label} must not have leading or trailing whitespace.`);
  }
  if ([...value].length > maximum) {
    throw new Error(`${label} must not exceed ${maximum} Unicode code points.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must not contain control characters.`);
  }
  return value;
}
function id2(value, label) {
  const normalized = text3(value, label, 128);
  if (!ID2.test(normalized))
    throw new Error(`${label} has an invalid stable ID.`);
  return normalized;
}
function timestamp2(value, label) {
  const normalized = text3(value, label, 64);
  const match = RFC3339_UTC2.exec(normalized);
  const parsed = Date.parse(normalized);
  if (match === null || Number.isNaN(parsed)) {
    throw new Error(`${label} must be an RFC 3339 UTC timestamp.`);
  }
  const instant = new Date(parsed);
  if (instant.getUTCFullYear() !== Number(match[1]) || instant.getUTCMonth() + 1 !== Number(match[2]) || instant.getUTCDate() !== Number(match[3]) || instant.getUTCHours() !== Number(match[4]) || instant.getUTCMinutes() !== Number(match[5]) || instant.getUTCSeconds() !== Number(match[6])) {
    throw new Error(`${label} must be a real RFC 3339 UTC instant.`);
  }
  return normalized;
}
function boolean2(value, label, fallback) {
  if (value === undefined)
    return fallback;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean.`);
  return value;
}
function ordered2(values, label) {
  for (let index = 1;index < values.length; index += 1) {
    const left = values[index - 1];
    const right = values[index];
    if (Date.parse(left[1]) > Date.parse(right[1])) {
      throw new Error(`${label} timestamp ordering is invalid at ${right[0]}.`);
    }
  }
}
function sourceKind(value) {
  if (value === "runtime-observation" || value === "deployment-snapshot" || value === "generated-declaration") {
    return value;
  }
  throw new Error("source.kind is invalid.");
}
function environment(value, label) {
  const result = text3(value, label);
  if (!ENVIRONMENTS2.has(result))
    throw new Error(`${label} is invalid.`);
  return result;
}
function scope(value, label) {
  const result = text3(value, label);
  if (!SCOPES3.has(result))
    throw new Error(`${label} is invalid.`);
  return result;
}
function platform2(value, label) {
  const result = text3(value, label, 63);
  if (!PLATFORM2.test(result) || !PLATFORMS.has(result)) {
    throw new Error(`${label} must be a registered canonical platform.`);
  }
  return result;
}
function invalid(path, message, digest) {
  return {
    path,
    digest,
    present: true,
    valid: false,
    health: "invalid",
    rawEvidenceIds: [],
    partialCoverage: false,
    facts: [],
    diagnostics: [
      { code: "invalid-evidence-document", message, path, severity: "failed" }
    ]
  };
}
function inspectEvidenceDocument(path, bytes, now) {
  const digest = canonicalSha256("ai-model-eol/external-evidence-document/v3", [...bytes]);
  if (bytes.byteLength > MAX_EVIDENCE_DOCUMENT_BYTES) {
    return invalid(path, `Evidence document exceeds ${MAX_EVIDENCE_DOCUMENT_BYTES} bytes.`, digest);
  }
  let payload;
  try {
    const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    payload = JSON.parse(sourceText);
  } catch (error) {
    return invalid(path, error instanceof Error ? error.message : String(error), digest);
  }
  try {
    const root = object4(payload, "Evidence document");
    exactKeys2(root, ["schemaVersion", "source", "records"], "Evidence document");
    if (root.schemaVersion !== 1)
      throw new Error("Evidence document schemaVersion must be 1.");
    const source = object4(root.source, "source");
    const kind = sourceKind(source.kind);
    const commonKeys = [
      "id",
      "kind",
      "claimBasis",
      "environment",
      "policyEligible",
      "provenance",
      "expiresAt"
    ];
    if (kind === "runtime-observation") {
      exactKeys2(source, [...commonKeys, "generatedAt", "observedFrom", "observedThrough", "freshUntil", "snapshotSemantics"], "source");
    } else if (kind === "deployment-snapshot") {
      exactKeys2(source, [...commonKeys, "capturedAt", "freshUntil", "snapshotSemantics", "sourceBoundary"], "source");
    } else {
      exactKeys2(source, [...commonKeys, "generatedAt", "reviewAfter", "generator", "ruleset", "reason"], "source");
    }
    if (source.claimBasis !== "repository-supplied") {
      throw new Error("source.claimBasis must be repository-supplied.");
    }
    const sourceId = id2(source.id, "source.id");
    const sourceEnvironment = environment(source.environment, "source.environment");
    const policyEligible = boolean2(source.policyEligible, "source.policyEligible", false);
    const provenance = text3(source.provenance, "source.provenance");
    const expiresAt = timestamp2(source.expiresAt, "source.expiresAt");
    let freshnessBoundary;
    let sourceVersionTime;
    let lineageIdentity;
    let partialCoverage = false;
    if (kind === "runtime-observation") {
      if (source.snapshotSemantics !== "observations-only") {
        throw new Error("runtime source.snapshotSemantics must be observations-only.");
      }
      const observedFrom = timestamp2(source.observedFrom, "source.observedFrom");
      const observedThrough = timestamp2(source.observedThrough, "source.observedThrough");
      const generatedAt = timestamp2(source.generatedAt, "source.generatedAt");
      sourceVersionTime = generatedAt;
      lineageIdentity = "observations-only";
      freshnessBoundary = timestamp2(source.freshUntil, "source.freshUntil");
      ordered2([
        ["observedFrom", observedFrom],
        ["observedThrough", observedThrough],
        ["generatedAt", generatedAt],
        ["freshUntil", freshnessBoundary],
        ["expiresAt", expiresAt]
      ], "source");
    } else if (kind === "deployment-snapshot") {
      const capturedAt = timestamp2(source.capturedAt, "source.capturedAt");
      sourceVersionTime = capturedAt;
      freshnessBoundary = timestamp2(source.freshUntil, "source.freshUntil");
      if (source.snapshotSemantics !== "complete-for-source" && source.snapshotSemantics !== "partial") {
        throw new Error("deployment source.snapshotSemantics must be complete-for-source or partial.");
      }
      partialCoverage = source.snapshotSemantics === "partial";
      lineageIdentity = text3(source.sourceBoundary, "source.sourceBoundary");
      ordered2([
        ["capturedAt", capturedAt],
        ["freshUntil", freshnessBoundary],
        ["expiresAt", expiresAt]
      ], "source");
    } else {
      const generatedAt = timestamp2(source.generatedAt, "source.generatedAt");
      sourceVersionTime = generatedAt;
      freshnessBoundary = timestamp2(source.reviewAfter, "source.reviewAfter");
      const generator = text3(source.generator, "source.generator");
      const ruleset = text3(source.ruleset, "source.ruleset");
      lineageIdentity = JSON.stringify([generator, ruleset]);
      text3(source.reason, "source.reason");
      ordered2([
        ["generatedAt", generatedAt],
        ["reviewAfter", freshnessBoundary],
        ["expiresAt", expiresAt]
      ], "source");
    }
    let health = "current";
    if (now >= Date.parse(expiresAt))
      health = "expired";
    else if (now >= Date.parse(freshnessBoundary)) {
      health = kind === "generated-declaration" ? "review-overdue" : "stale";
    }
    const rawRecords = root.records;
    if (!Array.isArray(rawRecords))
      throw new Error("records must be an array.");
    if (rawRecords.length > MAX_EVIDENCE_RECORDS) {
      throw new Error(`records exceeds ${MAX_EVIDENCE_RECORDS} entries.`);
    }
    const seen = new Set;
    const facts = rawRecords.map((value, index) => {
      const label = `records[${index}]`;
      const record = object4(value, label);
      const commonRecordKeys = [
        "evidenceId",
        "modelId",
        "servingPlatform",
        "scope",
        "environment",
        "reason"
      ];
      if (kind === "runtime-observation") {
        exactKeys2(record, [...commonRecordKeys, "firstObservedAt", "lastObservedAt", "observationCount"], label);
      } else {
        exactKeys2(record, commonRecordKeys, label);
      }
      const evidenceId = id2(record.evidenceId, `${label}.evidenceId`);
      if (seen.has(evidenceId))
        throw new Error(`Duplicate evidenceId ${evidenceId}.`);
      seen.add(evidenceId);
      const recordEnvironment = environment(record.environment, `${label}.environment`);
      if (recordEnvironment !== sourceEnvironment) {
        throw new Error(`${label}.environment must equal source.environment.`);
      }
      if (kind === "runtime-observation") {
        const first = timestamp2(record.firstObservedAt, `${label}.firstObservedAt`);
        const last = timestamp2(record.lastObservedAt, `${label}.lastObservedAt`);
        ordered2([
          ["firstObservedAt", first],
          ["lastObservedAt", last]
        ], label);
        if (!Number.isSafeInteger(record.observationCount) || record.observationCount < 1) {
          throw new Error(`${label}.observationCount must be a positive integer.`);
        }
      }
      const recordScope = scope(record.scope, `${label}.scope`);
      return {
        evidenceId,
        origin: "external-source",
        kind,
        confidence: "high",
        scope: recordScope,
        environment: recordEnvironment,
        detectorRuleId: `claim.external.${kind}@1`,
        detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
        rawValue: text3(record.modelId, `${label}.modelId`, 256),
        modelId: text3(record.modelId, `${label}.modelId`, 256),
        servingPlatform: platform2(record.servingPlatform, `${label}.servingPlatform`),
        modelResolution: "resolved",
        selectorKind: "model-id",
        platformResolution: "resolved",
        policyEligible: policyEligible && health === "current" && kind !== "generated-declaration" && (recordScope === "deployment" || recordScope === "application" && recordEnvironment === "production"),
        locations: [{ path, line: 1, column: 1 }],
        resolutionTrace: [{ kind: "detector", detail: `checked-in ${kind} claim` }],
        sourceId,
        evidenceHealth: health,
        reason: text3(record.reason, `${label}.reason`),
        provenance
      };
    });
    const diagnostics = [];
    if (health !== "current") {
      diagnostics.push({
        code: `evidence-source-${health}`,
        message: `Evidence source ${sourceId} is ${health}.`,
        path,
        severity: "partial"
      });
    }
    if (partialCoverage) {
      diagnostics.push({
        code: "evidence-source-partial",
        message: `Evidence source ${sourceId} declares partial coverage.`,
        path,
        severity: "partial"
      });
    }
    return {
      path,
      digest,
      sourceId,
      sourceKind: kind,
      sourceEnvironment,
      lineageIdentity,
      sourceVersionTime,
      freshnessBoundary,
      expiresAt,
      rawEvidenceIds: [...seen].sort(),
      present: true,
      valid: true,
      health,
      partialCoverage,
      facts,
      diagnostics
    };
  } catch (error) {
    return invalid(path, error instanceof Error ? error.message : String(error), digest);
  }
}

// src/evidence/snapshot-claims.ts
function utf8Path(entry) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(entry.pathBytes);
  } catch {
    return null;
  }
}
function entryMap(snapshot) {
  const result = new Map;
  for (const entry of snapshot.entries) {
    const path = utf8Path(entry);
    if (path !== null)
      result.set(path, entry);
  }
  return result;
}
function unavailablePolicy(message, digestSeed) {
  return {
    policy: defaultPolicy(),
    present: true,
    valid: false,
    digest: canonicalSha256("ai-model-eol/policy-document/v3", digestSeed),
    diagnostics: [
      { code: "invalid-policy", message, path: POLICY_PATH, severity: "failed" }
    ],
    rawAssertionIds: []
  };
}
function inspectSnapshotPolicy(snapshot) {
  const entry = entryMap(snapshot).get(POLICY_PATH);
  if (entry === undefined)
    return inspectPolicy(undefined);
  if (entry.kind !== "regular" && entry.kind !== "executable" || entry.content.state !== "available") {
    return unavailablePolicy("The checked-in policy must be an available regular Git blob.", [entry.objectId, entry.content.state]);
  }
  try {
    return inspectPolicy(new TextDecoder("utf-8", { fatal: true }).decode(entry.content.bytes));
  } catch {
    return unavailablePolicy("The checked-in policy must be valid UTF-8.", entry.objectId);
  }
}
function invalidEvidence(path, entry, message) {
  return {
    path,
    digest: canonicalSha256("ai-model-eol/external-evidence-document/v3", [
      entry.objectId,
      entry.content.state
    ]),
    rawEvidenceIds: [],
    present: true,
    valid: false,
    health: "invalid",
    partialCoverage: false,
    facts: [],
    diagnostics: [
      { code: "invalid-evidence-document", message, path, severity: "failed" }
    ]
  };
}
function isDefaultEvidencePath(path) {
  return path.startsWith(DEFAULT_EVIDENCE_PREFIX) && path.length > DEFAULT_EVIDENCE_PREFIX.length && path.endsWith(".json");
}
function inspectSnapshotClaims(options) {
  const policy = options.policy ?? inspectSnapshotPolicy(options.snapshot);
  const entries = entryMap(options.snapshot);
  const configuredPatterns = [
    ...new Set([
      ...policy.policy.usageEvidenceFiles,
      ...options.additionalEvidencePatterns ?? []
    ])
  ].sort();
  const candidatePaths = [...entries.keys()].filter((path) => isDefaultEvidencePath(path) || configuredPatterns.some((pattern) => matchRepositoryPattern(pattern, path))).sort();
  const evidenceDocuments = candidatePaths.map((path) => {
    const entry = entries.get(path);
    if (entry === undefined)
      throw new Error("Evidence path disappeared during inspection.");
    if (entry.kind !== "regular" && entry.kind !== "executable" || entry.content.state !== "available") {
      return invalidEvidence(path, entry, "A configured evidence document must be an available regular Git blob.");
    }
    return inspectEvidenceDocument(path, entry.content.bytes, options.now);
  });
  const diagnostics = [];
  let scanStatus = "complete";
  for (const pattern of configuredPatterns) {
    if (!candidatePaths.some((path) => matchRepositoryPattern(pattern, path))) {
      scanStatus = "partial";
      diagnostics.push({
        code: "configured-evidence-missing",
        message: `Configured evidence pattern ${pattern} matched no tracked document.`,
        path: POLICY_PATH,
        severity: "partial"
      });
    }
  }
  const assertionInspection = assertionsToEvidence(policy.policy.assertions, options.now);
  diagnostics.push(...assertionInspection.diagnostics);
  if (assertionInspection.diagnostics.some((diagnostic) => diagnostic.severity === "partial")) {
    scanStatus = "partial";
  }
  for (const document of evidenceDocuments) {
    diagnostics.push(...document.diagnostics);
    if (document.valid && (document.partialCoverage || document.health !== "current")) {
      scanStatus = "partial";
    }
  }
  const validDocuments = evidenceDocuments.filter((document) => document.valid);
  const sourceIds = validDocuments.map((document) => document.sourceId).filter((sourceId) => sourceId !== undefined);
  let invalid2 = !policy.valid || evidenceDocuments.some((document) => !document.valid);
  const sourceIdCounts = new Map;
  for (const sourceId of sourceIds) {
    sourceIdCounts.set(sourceId, (sourceIdCounts.get(sourceId) ?? 0) + 1);
  }
  if ([...sourceIdCounts.values()].some((count) => count > 1)) {
    invalid2 = true;
    diagnostics.push({
      code: "duplicate-evidence-source-id",
      message: "Evidence source IDs must be unique in one Git tree.",
      severity: "failed"
    });
  }
  const uniqueSourceDocuments = validDocuments.filter((document) => document.sourceId === undefined || (sourceIdCounts.get(document.sourceId) ?? 0) === 1);
  const allFacts = [
    ...assertionInspection.facts,
    ...uniqueSourceDocuments.flatMap((document) => document.facts)
  ];
  const evidenceIdCounts = new Map;
  for (const fact of allFacts) {
    evidenceIdCounts.set(fact.evidenceId, (evidenceIdCounts.get(fact.evidenceId) ?? 0) + 1);
  }
  if ([...evidenceIdCounts.values()].some((count) => count > 1)) {
    invalid2 = true;
    diagnostics.push({
      code: "duplicate-evidence-id",
      message: "User-supplied evidence IDs must be globally unique in one Git tree.",
      severity: "failed"
    });
  }
  const facts = allFacts.filter((fact) => (evidenceIdCounts.get(fact.evidenceId) ?? 0) === 1);
  const evidenceHealth2 = combineEvidenceHealth(assertionInspection.health, ...validDocuments.map((document) => document.health));
  return {
    policy,
    evidenceDocuments,
    facts,
    diagnostics,
    evidenceHealth: evidenceHealth2,
    scanStatus,
    invalid: invalid2
  };
}

// src/action/run.ts
var UNAVAILABLE_SHA256 = canonicalSha256("ai-model-eol/unavailable/v3", null);
var DEFAULT_INPUTS = {
  warnWithinDays: null,
  failWithinDays: null,
  allowPartial: null,
  maxFeedAgeDays: DEFAULT_MAX_FEED_AGE_DAYS,
  notificationFailureMode: "fail"
};

class ActionRunError extends Error {
  report;
  constructor(message, report) {
    super(message);
    this.report = report;
    this.name = "ActionRunError";
  }
}
function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return compact(message, 2000);
}
function reportPath(environment2, requested) {
  if (requested !== undefined)
    return requested;
  const parent = environment2.RUNNER_TEMP || import_node_os2.tmpdir();
  const directory = import_node_fs4.mkdtempSync(import_node_path3.join(parent, "ai-model-eol-"));
  return import_node_path3.join(directory, "report.json");
}
var FULL_HEX_OID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
function fallbackEvent(environment2) {
  const eventName = environment2.GITHUB_EVENT_NAME?.trim() || "local";
  const comparisonRequested = eventName === "pull_request" || eventName === "merge_group";
  const targetSha = environment2.GITHUB_SHA?.trim() ?? "";
  return {
    eventName,
    targetOid: FULL_HEX_OID_PATTERN.test(targetSha) ? targetSha : "unavailable",
    targetKind: eventName === "merge_group" ? "merge-group" : eventName === "pull_request" ? "synthetic-merge-uncompared" : "commit",
    comparisonRequested
  };
}
function reportEvent(resolved) {
  if (resolved.targetParentOids === undefined)
    return resolved.selection;
  return {
    ...resolved.selection,
    targetParentOids: [...resolved.targetParentOids]
  };
}
function unavailableFeed() {
  return {
    sourceFeedSha256: UNAVAILABLE_SHA256,
    normalizedFeedSha256: UNAVAILABLE_SHA256,
    activeRecordsSha256: UNAVAILABLE_SHA256,
    feedAdapterManifestSha256: UNAVAILABLE_SHA256,
    generatedAt: "",
    ageDays: null
  };
}
function feedFreshness(feed, maxAgeDays, nowMs) {
  const generatedAt = feed.index.envelope.generatedAt;
  const ageDays = feedAgeInDays(generatedAt, nowMs);
  return {
    generatedAt,
    ageDays,
    maxAgeDays,
    stale: maxAgeDays !== null && ageDays > maxAgeDays
  };
}
function feedIdentity(feed, freshness) {
  return { ...feed.digests, generatedAt: freshness.generatedAt, ageDays: freshness.ageDays };
}
function feedDiagnostics(feed, freshness) {
  const staleness = freshness.stale ? [
    {
      code: "feed-stale",
      message: `The upstream lifecycle feed was generated at ${freshness.generatedAt}, which is older than the configured max-feed-age-days horizon of ${String(freshness.maxAgeDays)} day(s). A feed that stopped updating reports a permanent all-clear, so lifecycle coverage is not trustworthy.`,
      severity: "partial"
    }
  ] : [];
  const upstream = feed.index.diagnostics.map((diagnostic) => {
    if (diagnostic.kind === "feed-conflict") {
      return {
        code: diagnostic.kind,
        message: `The lifecycle feed has conflicting active records for ${diagnostic.servingPlatform}/${diagnostic.modelId}.`,
        severity: "notice"
      };
    }
    const renderPairs = (pairs) => pairs.slice(0, 10).map(([provider, identifier]) => `${provider}/${identifier}`).join(", ");
    const added = renderPairs(diagnostic.addedPairs);
    const removed = renderPairs(diagnostic.removedPairs);
    return {
      code: diagnostic.kind,
      message: `The untyped lifecycle-feed pair set changed: ${diagnostic.addedPairCount} unreviewed addition(s) were quarantined${added === "" ? "" : ` (${added})`}; ${diagnostic.removedPairCount} reviewed pair(s) were absent${removed === "" ? "" : ` (${removed})`}. No unreviewed row was normalized into lifecycle authority.`,
      severity: "partial"
    };
  });
  return [...upstream, ...staleness];
}
function applyFeedCoverage(detection, feed) {
  if (!feed.index.diagnostics.some((diagnostic) => diagnostic.kind === "feed-pair-set-change")) {
    return detection;
  }
  return detection.scanStatus === "partial" ? detection : { ...detection, scanStatus: "partial" };
}
function applyFeedFreshnessCoverage(scanStatus, freshness) {
  return freshness.stale ? "partial" : scanStatus;
}
function reportEvidenceSources(evaluation, inspections, policy, effectiveDocuments) {
  const result = [
    { id: "repository", kind: "repository", health: "current" }
  ];
  if (policy.servingPlatforms.length > 0) {
    result.push({
      id: `declared-serving-platforms: ${policy.servingPlatforms.join(", ")}`,
      kind: "repository",
      health: "current"
    });
  }
  const manual = evaluation.evidence.filter((fact) => fact.origin === "manual-claim");
  if (manual.length > 0) {
    result.push({
      id: "checked-in-assertions",
      kind: "manual-claim",
      health: combineEvidenceHealth(...manual.map((fact) => fact.evidenceHealth ?? "current"))
    });
  }
  const external = new Map;
  const documents = effectiveDocuments ?? inspections.flatMap((inspection) => inspection.evidenceDocuments);
  for (const document of documents) {
    const id3 = document.sourceId ?? document.path;
    const previous = external.get(id3);
    external.set(id3, previous === undefined ? document.health : combineEvidenceHealth(previous, document.health));
  }
  for (const [id3, health] of [...external].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    result.push({ id: id3, kind: "external-source", health });
  }
  return result;
}
function finishReport(input) {
  const evaluation = input.evaluation;
  const evidenceFacts = evaluation?.evidence ?? [];
  const lifecycleFindings = evaluation?.findings ?? [];
  const unresolvedReferences = evaluation?.unresolved ?? [];
  const report = {
    schemaVersion: 3,
    evaluatedAt: input.evaluatedAt,
    result: input.result,
    ...input.baselineResult === undefined ? {} : { baselineResult: input.baselineResult },
    ...input.targetResult === undefined ? {} : { targetResult: input.targetResult },
    scanStatus: input.scanStatus,
    ...input.baselineScanStatus === undefined ? {} : { baselineScanStatus: input.baselineScanStatus },
    ...input.targetScanStatus === undefined ? {} : { targetScanStatus: input.targetScanStatus },
    comparisonStatus: input.comparisonStatus,
    exitReason: input.exitReason,
    targetKind: input.event.targetKind,
    event: input.event,
    evidenceHealth: evaluation?.evidenceHealth ?? "current",
    evidenceSources: input.evidenceSources ?? [
      { id: "repository", kind: "repository", health: "current" }
    ],
    evidenceFacts,
    lifecycleFindings,
    unresolvedReferences,
    diagnostics: [...input.diagnostics ?? evaluation?.diagnostics ?? []],
    counts: buildCounts(evidenceFacts, lifecycleFindings, unresolvedReferences),
    policyDiff: [...input.policyDiff ?? []],
    feed: input.feed ?? unavailableFeed(),
    detectorManifestSha256: DETECTOR_MANIFEST_SHA256,
    scanFingerprint: UNAVAILABLE_SHA256,
    alertFingerprint: alertFingerprint(lifecycleFindings),
    outputTruncated: false,
    notificationStatus: "disabled",
    notificationReason: "no Slack webhook configured",
    reportPath: input.reportPath
  };
  report.scanFingerprint = scanFingerprint(report);
  return report;
}
function failureProduct(input) {
  const event = input.event ?? fallbackEvent(input.environment);
  const diagnostic = {
    code: `${input.stage}-failed`,
    message: safeMessage(input.error),
    severity: "failed"
  };
  return {
    report: finishReport({
      evaluatedAt: input.evaluatedAt,
      result: "unknown",
      scanStatus: "failed",
      comparisonStatus: input.comparisonStatus ?? (event.comparisonRequested ? "unavailable" : "not-applicable"),
      exitReason: "assessment-failed",
      event,
      diagnostics: [...input.diagnostics ?? [], diagnostic],
      ...input.feed === undefined ? {} : { feed: input.feed },
      reportPath: input.reportPath
    }),
    policy: defaultPolicy(),
    inputs: input.inputs ?? DEFAULT_INPUTS
  };
}
function decisionFor(result, scanStatus, policy) {
  return chooseExitReason(result === "blocking" ? "policy-breach" : "none", scanStatus === "partial" && policy.failWithinDays !== null && !policy.allowPartial ? "partial-disallowed" : "none");
}
function diagnosticTargetEvaluation(input) {
  const policy = applyTrustedInputs(input.claims.policy.valid ? input.claims.policy.policy : defaultPolicy(), input.inputs);
  const claimDiagnostics = input.claims.diagnostics.map((diagnostic) => diagnostic.severity === "failed" ? { ...diagnostic, severity: "notice" } : diagnostic);
  return {
    evaluation: evaluateEvidence({
      evidence: [...input.detection.evidence, ...input.claims.facts],
      feed: input.feed.index,
      policy,
      now: input.now,
      scanStatus: combineScanStatus(input.detection.scanStatus, input.claims.scanStatus),
      diagnostics: [
        ...input.extraDiagnostics,
        ...input.detection.diagnostics,
        ...claimDiagnostics,
        ...feedDiagnostics(input.feed, input.freshness)
      ]
    }),
    policy
  };
}
async function assess(dependencies, environment2, evaluatedAtMs, localReportPath, log) {
  const evaluatedAt = new Date(evaluatedAtMs).toISOString();
  const repositoryPath = dependencies.repositoryPath ?? environment2.GITHUB_WORKSPACE ?? process.cwd();
  let stage = "inputs";
  let inputs = DEFAULT_INPUTS;
  let resolvedEvent;
  let feed;
  let freshness;
  try {
    const rawWebhook = getInput("slack-webhook", environment2);
    if (rawWebhook !== undefined && rawWebhook !== "")
      maskSecret(rawWebhook, log);
    inputs = parseActionInputs(environment2);
    stage = "event-selection";
    resolvedEvent = dependencies.resolveEvent?.() ?? resolveEventSelection({
      repositoryPath,
      environment: environment2,
      ...dependencies.eventPayload === undefined ? {} : { eventPayload: dependencies.eventPayload }
    });
    stage = "feed";
    feed = await (dependencies.loadFeed?.() ?? loadLifecycleFeed());
    freshness = feedFreshness(feed, inputs.maxFeedAgeDays, evaluatedAtMs);
    const readSnapshot = dependencies.readSnapshot ?? ((path, treeish) => readGitTreeSnapshot({ repositoryPath: path, treeish }));
    const detector = dependencies.detect ?? detectSnapshot;
    const policyInspector = dependencies.inspectPolicy ?? inspectSnapshotPolicy;
    const claimsInspector = dependencies.inspectClaims ?? inspectSnapshotClaims;
    stage = "target-snapshot";
    const targetSnapshot = readSnapshot(repositoryPath, resolvedEvent.selection.targetOid);
    stage = "target-detection";
    const targetDetection = applyFeedCoverage(detector(targetSnapshot, feed.index), feed);
    const targetPolicy = policyInspector(targetSnapshot);
    if (resolvedEvent.comparisonStatus === "unavailable") {
      stage = "target-claims";
      const targetClaims2 = claimsInspector({
        snapshot: targetSnapshot,
        now: evaluatedAtMs,
        policy: targetPolicy
      });
      const diagnostic = diagnosticTargetEvaluation({
        detection: targetDetection,
        claims: targetClaims2,
        feed,
        freshness,
        inputs,
        now: evaluatedAtMs,
        extraDiagnostics: resolvedEvent.diagnostics
      });
      return {
        report: finishReport({
          evaluatedAt,
          result: "unknown",
          scanStatus: "partial",
          comparisonStatus: "unavailable",
          exitReason: "trusted-base-unavailable",
          event: reportEvent(resolvedEvent),
          evaluation: diagnostic.evaluation,
          diagnostics: diagnostic.evaluation.diagnostics,
          policyDiff: targetClaims2.policy.valid ? [] : ["Target policy/configuration is invalid and non-authoritative."],
          feed: feedIdentity(feed, freshness),
          evidenceSources: reportEvidenceSources(diagnostic.evaluation, [targetClaims2], diagnostic.policy),
          reportPath: localReportPath
        }),
        policy: diagnostic.policy,
        inputs
      };
    }
    if (!resolvedEvent.selection.comparisonRequested) {
      stage = "target-claims";
      const targetClaims2 = claimsInspector({
        snapshot: targetSnapshot,
        now: evaluatedAtMs,
        policy: targetPolicy
      });
      const diagnostic = diagnosticTargetEvaluation({
        detection: targetDetection,
        claims: targetClaims2,
        feed,
        freshness,
        inputs,
        now: evaluatedAtMs,
        extraDiagnostics: resolvedEvent.diagnostics
      });
      if (targetClaims2.invalid) {
        return {
          report: finishReport({
            evaluatedAt,
            result: "unknown",
            scanStatus: "failed",
            comparisonStatus: "not-applicable",
            exitReason: "assessment-failed",
            event: reportEvent(resolvedEvent),
            evaluation: diagnostic.evaluation,
            diagnostics: [
              ...targetClaims2.diagnostics,
              ...targetDetection.diagnostics,
              ...feedDiagnostics(feed, freshness)
            ],
            feed: feedIdentity(feed, freshness),
            evidenceSources: reportEvidenceSources(diagnostic.evaluation, [targetClaims2], diagnostic.policy),
            reportPath: localReportPath
          }),
          policy: diagnostic.policy,
          inputs
        };
      }
      const scanStatus2 = applyFeedFreshnessCoverage(diagnostic.evaluation.scanStatus, freshness);
      const exitReason2 = decisionFor(diagnostic.evaluation.result, scanStatus2, diagnostic.policy);
      return {
        report: finishReport({
          evaluatedAt,
          result: diagnostic.evaluation.result,
          scanStatus: scanStatus2,
          comparisonStatus: "not-applicable",
          exitReason: exitReason2,
          event: reportEvent(resolvedEvent),
          evaluation: diagnostic.evaluation,
          diagnostics: diagnostic.evaluation.diagnostics,
          feed: feedIdentity(feed, freshness),
          evidenceSources: reportEvidenceSources(diagnostic.evaluation, [targetClaims2], diagnostic.policy),
          reportPath: localReportPath
        }),
        policy: diagnostic.policy,
        inputs
      };
    }
    const baseOid = resolvedEvent.selection.baseOid;
    if (baseOid === undefined) {
      throw new Error("A comparison event did not provide a trusted base object ID.");
    }
    stage = "base-snapshot";
    let baseSnapshot;
    try {
      baseSnapshot = readSnapshot(repositoryPath, baseOid);
    } catch (error) {
      if (error instanceof GitTreeSnapshotError && error.code === "tree-unavailable") {
        const targetClaims2 = claimsInspector({
          snapshot: targetSnapshot,
          now: evaluatedAtMs,
          policy: targetPolicy
        });
        const unavailableDiagnostics = [
          ...resolvedEvent.diagnostics,
          {
            code: "trusted-base-unavailable",
            message: safeMessage(error),
            severity: "partial"
          }
        ];
        const diagnostic = diagnosticTargetEvaluation({
          detection: targetDetection,
          claims: targetClaims2,
          feed,
          freshness,
          inputs,
          now: evaluatedAtMs,
          extraDiagnostics: unavailableDiagnostics
        });
        return {
          report: finishReport({
            evaluatedAt,
            result: "unknown",
            scanStatus: "partial",
            comparisonStatus: "unavailable",
            exitReason: "trusted-base-unavailable",
            event: reportEvent(resolvedEvent),
            evaluation: diagnostic.evaluation,
            diagnostics: diagnostic.evaluation.diagnostics,
            feed: feedIdentity(feed, freshness),
            evidenceSources: reportEvidenceSources(diagnostic.evaluation, [targetClaims2], diagnostic.policy),
            reportPath: localReportPath
          }),
          policy: diagnostic.policy,
          inputs
        };
      }
      throw error;
    }
    stage = "comparison-claims";
    const basePolicy = policyInspector(baseSnapshot);
    const baseClaims = claimsInspector({
      snapshot: baseSnapshot,
      now: evaluatedAtMs,
      policy: basePolicy
    });
    if (baseClaims.invalid) {
      throw new Error(`Trusted base policy or evidence is invalid: ${baseClaims.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
    }
    const targetClaims = claimsInspector({
      snapshot: targetSnapshot,
      now: evaluatedAtMs,
      policy: targetPolicy,
      additionalEvidencePatterns: basePolicy.policy.usageEvidenceFiles
    });
    stage = "base-detection";
    const baseDetection = applyFeedCoverage(detector(baseSnapshot, feed.index), feed);
    stage = "comparison-evaluation";
    const comparison = evaluateComparison({
      baseDetection,
      targetDetection,
      baseClaims,
      targetClaims,
      feed: feed.index,
      inputs,
      now: evaluatedAtMs
    });
    const diagnostics = [
      ...resolvedEvent.diagnostics,
      ...comparison.evaluation.diagnostics,
      ...comparison.baseline.diagnostics,
      ...feedDiagnostics(feed, freshness)
    ];
    const scanStatus = applyFeedFreshnessCoverage(comparison.scanStatus, freshness);
    const exitReason = decisionFor(comparison.result, scanStatus, comparison.policy);
    return {
      report: finishReport({
        evaluatedAt,
        result: comparison.result,
        baselineResult: comparison.baselineResult,
        targetResult: comparison.targetResult,
        scanStatus,
        baselineScanStatus: comparison.baselineScanStatus,
        targetScanStatus: comparison.targetScanStatus,
        comparisonStatus: comparison.comparisonStatus,
        exitReason,
        event: reportEvent(resolvedEvent),
        evaluation: comparison.evaluation,
        diagnostics,
        policyDiff: comparison.policyDiff,
        feed: feedIdentity(feed, freshness),
        evidenceSources: reportEvidenceSources(comparison.evaluation, [targetClaims], comparison.policy, monotonicEvidenceSourceDocuments(baseClaims, targetClaims)),
        reportPath: localReportPath
      }),
      policy: comparison.policy,
      inputs
    };
  } catch (error) {
    return failureProduct({
      evaluatedAt,
      reportPath: localReportPath,
      environment: environment2,
      error,
      stage,
      ...resolvedEvent === undefined ? {} : { event: reportEvent(resolvedEvent) },
      ...resolvedEvent === undefined ? {} : { comparisonStatus: resolvedEvent.comparisonStatus },
      ...feed === undefined || freshness === undefined ? {} : { feed: feedIdentity(feed, freshness) },
      inputs,
      ...resolvedEvent === undefined ? {} : { diagnostics: resolvedEvent.diagnostics }
    });
  }
}
function failureMessage(report) {
  switch (report.exitReason) {
    case "assessment-failed":
      return "The AI model lifecycle assessment failed; see the report diagnostics.";
    case "trusted-base-unavailable":
      return "The trusted comparison base is unavailable; the diagnostic target scan is non-authoritative.";
    case "policy-breach":
      return "A definite AI model lifecycle finding breached the configured policy.";
    case "partial-disallowed":
      return "The assessment is partial and trusted enforcement does not allow partial success.";
    case "notification-failed":
      return "The configured Slack lifecycle notification could not be delivered.";
    case "none":
      return "The action failed unexpectedly.";
  }
}
function fallbackPublicationReport(report, error) {
  return finishReport({
    evaluatedAt: report.evaluatedAt,
    result: "unknown",
    scanStatus: "failed",
    comparisonStatus: report.comparisonStatus,
    exitReason: "assessment-failed",
    event: report.event,
    diagnostics: [
      ...report.diagnostics,
      {
        code: "publication-failed",
        message: safeMessage(error),
        severity: "failed"
      }
    ],
    feed: report.feed,
    reportPath: report.reportPath
  });
}
function publishCore(initialReport, environment2, log, notificationPending) {
  let report = initialReport;
  try {
    publishCoreOutputs(report, environment2);
    writeAssessmentReport(report);
    publishAnnotations(report, log);
    publishSummary(report, environment2, { notificationPending });
    return report;
  } catch (error) {
    report = fallbackPublicationReport(report, error);
    publishCoreOutputs(report, environment2);
    writeAssessmentReport(report);
    publishSummary(report, environment2, { notificationPending });
    return report;
  }
}
async function run(dependencies = {}) {
  const environment2 = dependencies.environment ?? process.env;
  const log = dependencies.log ?? console.log;
  const evaluatedAtMs = (dependencies.now ?? Date.now)();
  const localReportPath = reportPath(environment2, dependencies.reportPath);
  const product = await assess(dependencies, environment2, evaluatedAtMs, localReportPath, log);
  let report = publishCore(product.report, environment2, log, product.inputs.slackWebhook !== undefined);
  let notificationFailureShouldFail = false;
  if (product.inputs.slackWebhook === undefined) {
    report.notificationStatus = "disabled";
    report.notificationReason = "no Slack webhook configured";
  } else {
    try {
      const deliver = dependencies.deliverNotification ?? deliverSlackNotification;
      const delivery = await deliver({
        webhookUrl: product.inputs.slackWebhook,
        report
      });
      report.notificationStatus = delivery.status;
      report.notificationReason = delivery.detail ?? (delivery.status === "sent" ? "Slack snapshot delivered" : "Slack snapshot delivery was skipped");
      if (delivery.status === "failed") {
        report.exitReason = chooseExitReason(report.exitReason, "notification-failed");
        notificationFailureShouldFail = product.inputs.notificationFailureMode === "fail";
      }
    } catch (error) {
      report.notificationStatus = "failed";
      report.notificationReason = "Slack webhook delivery failed.";
      report.exitReason = chooseExitReason(report.exitReason, "notification-failed");
      notificationFailureShouldFail = product.inputs.notificationFailureMode === "fail";
    }
  }
  writeAssessmentReport(report);
  appendCommand(environment2.GITHUB_OUTPUT, "exit-reason", report.exitReason);
  publishNotificationOutputs(report, environment2);
  if (product.inputs.slackWebhook !== undefined) {
    publishNotificationSummary(report, environment2);
  }
  const coreFailed = report.result === "unknown" || report.scanStatus === "failed" || report.exitReason === "trusted-base-unavailable" || report.exitReason === "policy-breach" || report.exitReason === "partial-disallowed" || report.exitReason === "assessment-failed";
  log(`AI model lifecycle: ${report.result}; scan ${report.scanStatus}; ${report.counts.findings} finding(s); exit reason ${report.exitReason}.`);
  if (coreFailed || notificationFailureShouldFail) {
    throw new ActionRunError(failureMessage(report), report);
  }
  return report;
}

// src/main.ts
run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  emitCommand("error", message);
  process.exitCode = 1;
});
