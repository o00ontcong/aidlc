var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/lodash/_listCacheClear.js
var require_listCacheClear = __commonJS({
  "node_modules/lodash/_listCacheClear.js"(exports, module) {
    function listCacheClear() {
      this.__data__ = [];
      this.size = 0;
    }
    module.exports = listCacheClear;
  }
});

// node_modules/lodash/eq.js
var require_eq = __commonJS({
  "node_modules/lodash/eq.js"(exports, module) {
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    module.exports = eq;
  }
});

// node_modules/lodash/_assocIndexOf.js
var require_assocIndexOf = __commonJS({
  "node_modules/lodash/_assocIndexOf.js"(exports, module) {
    var eq = require_eq();
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    module.exports = assocIndexOf;
  }
});

// node_modules/lodash/_listCacheDelete.js
var require_listCacheDelete = __commonJS({
  "node_modules/lodash/_listCacheDelete.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    var arrayProto = Array.prototype;
    var splice = arrayProto.splice;
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      --this.size;
      return true;
    }
    module.exports = listCacheDelete;
  }
});

// node_modules/lodash/_listCacheGet.js
var require_listCacheGet = __commonJS({
  "node_modules/lodash/_listCacheGet.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    module.exports = listCacheGet;
  }
});

// node_modules/lodash/_listCacheHas.js
var require_listCacheHas = __commonJS({
  "node_modules/lodash/_listCacheHas.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    module.exports = listCacheHas;
  }
});

// node_modules/lodash/_listCacheSet.js
var require_listCacheSet = __commonJS({
  "node_modules/lodash/_listCacheSet.js"(exports, module) {
    var assocIndexOf = require_assocIndexOf();
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        ++this.size;
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    module.exports = listCacheSet;
  }
});

// node_modules/lodash/_ListCache.js
var require_ListCache = __commonJS({
  "node_modules/lodash/_ListCache.js"(exports, module) {
    var listCacheClear = require_listCacheClear();
    var listCacheDelete = require_listCacheDelete();
    var listCacheGet = require_listCacheGet();
    var listCacheHas = require_listCacheHas();
    var listCacheSet = require_listCacheSet();
    function ListCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    module.exports = ListCache;
  }
});

// node_modules/lodash/_stackClear.js
var require_stackClear = __commonJS({
  "node_modules/lodash/_stackClear.js"(exports, module) {
    var ListCache = require_ListCache();
    function stackClear() {
      this.__data__ = new ListCache();
      this.size = 0;
    }
    module.exports = stackClear;
  }
});

// node_modules/lodash/_stackDelete.js
var require_stackDelete = __commonJS({
  "node_modules/lodash/_stackDelete.js"(exports, module) {
    function stackDelete(key) {
      var data = this.__data__, result = data["delete"](key);
      this.size = data.size;
      return result;
    }
    module.exports = stackDelete;
  }
});

// node_modules/lodash/_stackGet.js
var require_stackGet = __commonJS({
  "node_modules/lodash/_stackGet.js"(exports, module) {
    function stackGet(key) {
      return this.__data__.get(key);
    }
    module.exports = stackGet;
  }
});

// node_modules/lodash/_stackHas.js
var require_stackHas = __commonJS({
  "node_modules/lodash/_stackHas.js"(exports, module) {
    function stackHas(key) {
      return this.__data__.has(key);
    }
    module.exports = stackHas;
  }
});

// node_modules/lodash/_freeGlobal.js
var require_freeGlobal = __commonJS({
  "node_modules/lodash/_freeGlobal.js"(exports, module) {
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    module.exports = freeGlobal;
  }
});

// node_modules/lodash/_root.js
var require_root = __commonJS({
  "node_modules/lodash/_root.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    module.exports = root;
  }
});

// node_modules/lodash/_Symbol.js
var require_Symbol = __commonJS({
  "node_modules/lodash/_Symbol.js"(exports, module) {
    var root = require_root();
    var Symbol2 = root.Symbol;
    module.exports = Symbol2;
  }
});

// node_modules/lodash/_getRawTag.js
var require_getRawTag = __commonJS({
  "node_modules/lodash/_getRawTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var nativeObjectToString = objectProto.toString;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function getRawTag(value) {
      var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
      try {
        value[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e) {
      }
      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }
    module.exports = getRawTag;
  }
});

// node_modules/lodash/_objectToString.js
var require_objectToString = __commonJS({
  "node_modules/lodash/_objectToString.js"(exports, module) {
    var objectProto = Object.prototype;
    var nativeObjectToString = objectProto.toString;
    function objectToString(value) {
      return nativeObjectToString.call(value);
    }
    module.exports = objectToString;
  }
});

// node_modules/lodash/_baseGetTag.js
var require_baseGetTag = __commonJS({
  "node_modules/lodash/_baseGetTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var getRawTag = require_getRawTag();
    var objectToString = require_objectToString();
    var nullTag = "[object Null]";
    var undefinedTag = "[object Undefined]";
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function baseGetTag(value) {
      if (value == null) {
        return value === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    module.exports = baseGetTag;
  }
});

// node_modules/lodash/isObject.js
var require_isObject = __commonJS({
  "node_modules/lodash/isObject.js"(exports, module) {
    function isObject(value) {
      var type = typeof value;
      return value != null && (type == "object" || type == "function");
    }
    module.exports = isObject;
  }
});

// node_modules/lodash/isFunction.js
var require_isFunction = __commonJS({
  "node_modules/lodash/isFunction.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObject = require_isObject();
    var asyncTag = "[object AsyncFunction]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var proxyTag = "[object Proxy]";
    function isFunction(value) {
      if (!isObject(value)) {
        return false;
      }
      var tag = baseGetTag(value);
      return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }
    module.exports = isFunction;
  }
});

// node_modules/lodash/_coreJsData.js
var require_coreJsData = __commonJS({
  "node_modules/lodash/_coreJsData.js"(exports, module) {
    var root = require_root();
    var coreJsData = root["__core-js_shared__"];
    module.exports = coreJsData;
  }
});

// node_modules/lodash/_isMasked.js
var require_isMasked = __commonJS({
  "node_modules/lodash/_isMasked.js"(exports, module) {
    var coreJsData = require_coreJsData();
    var maskSrcKey = function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    }();
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    module.exports = isMasked;
  }
});

// node_modules/lodash/_toSource.js
var require_toSource = __commonJS({
  "node_modules/lodash/_toSource.js"(exports, module) {
    var funcProto = Function.prototype;
    var funcToString = funcProto.toString;
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    module.exports = toSource;
  }
});

// node_modules/lodash/_baseIsNative.js
var require_baseIsNative = __commonJS({
  "node_modules/lodash/_baseIsNative.js"(exports, module) {
    var isFunction = require_isFunction();
    var isMasked = require_isMasked();
    var isObject = require_isObject();
    var toSource = require_toSource();
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    module.exports = baseIsNative;
  }
});

// node_modules/lodash/_getValue.js
var require_getValue = __commonJS({
  "node_modules/lodash/_getValue.js"(exports, module) {
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    module.exports = getValue;
  }
});

// node_modules/lodash/_getNative.js
var require_getNative = __commonJS({
  "node_modules/lodash/_getNative.js"(exports, module) {
    var baseIsNative = require_baseIsNative();
    var getValue = require_getValue();
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    module.exports = getNative;
  }
});

// node_modules/lodash/_Map.js
var require_Map = __commonJS({
  "node_modules/lodash/_Map.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Map2 = getNative(root, "Map");
    module.exports = Map2;
  }
});

// node_modules/lodash/_nativeCreate.js
var require_nativeCreate = __commonJS({
  "node_modules/lodash/_nativeCreate.js"(exports, module) {
    var getNative = require_getNative();
    var nativeCreate = getNative(Object, "create");
    module.exports = nativeCreate;
  }
});

// node_modules/lodash/_hashClear.js
var require_hashClear = __commonJS({
  "node_modules/lodash/_hashClear.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
      this.size = 0;
    }
    module.exports = hashClear;
  }
});

// node_modules/lodash/_hashDelete.js
var require_hashDelete = __commonJS({
  "node_modules/lodash/_hashDelete.js"(exports, module) {
    function hashDelete(key) {
      var result = this.has(key) && delete this.__data__[key];
      this.size -= result ? 1 : 0;
      return result;
    }
    module.exports = hashDelete;
  }
});

// node_modules/lodash/_hashGet.js
var require_hashGet = __commonJS({
  "node_modules/lodash/_hashGet.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty.call(data, key) ? data[key] : void 0;
    }
    module.exports = hashGet;
  }
});

// node_modules/lodash/_hashHas.js
var require_hashHas = __commonJS({
  "node_modules/lodash/_hashHas.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty.call(data, key);
    }
    module.exports = hashHas;
  }
});

// node_modules/lodash/_hashSet.js
var require_hashSet = __commonJS({
  "node_modules/lodash/_hashSet.js"(exports, module) {
    var nativeCreate = require_nativeCreate();
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function hashSet(key, value) {
      var data = this.__data__;
      this.size += this.has(key) ? 0 : 1;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    module.exports = hashSet;
  }
});

// node_modules/lodash/_Hash.js
var require_Hash = __commonJS({
  "node_modules/lodash/_Hash.js"(exports, module) {
    var hashClear = require_hashClear();
    var hashDelete = require_hashDelete();
    var hashGet = require_hashGet();
    var hashHas = require_hashHas();
    var hashSet = require_hashSet();
    function Hash(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    module.exports = Hash;
  }
});

// node_modules/lodash/_mapCacheClear.js
var require_mapCacheClear = __commonJS({
  "node_modules/lodash/_mapCacheClear.js"(exports, module) {
    var Hash = require_Hash();
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    function mapCacheClear() {
      this.size = 0;
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    module.exports = mapCacheClear;
  }
});

// node_modules/lodash/_isKeyable.js
var require_isKeyable = __commonJS({
  "node_modules/lodash/_isKeyable.js"(exports, module) {
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    module.exports = isKeyable;
  }
});

// node_modules/lodash/_getMapData.js
var require_getMapData = __commonJS({
  "node_modules/lodash/_getMapData.js"(exports, module) {
    var isKeyable = require_isKeyable();
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    module.exports = getMapData;
  }
});

// node_modules/lodash/_mapCacheDelete.js
var require_mapCacheDelete = __commonJS({
  "node_modules/lodash/_mapCacheDelete.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheDelete(key) {
      var result = getMapData(this, key)["delete"](key);
      this.size -= result ? 1 : 0;
      return result;
    }
    module.exports = mapCacheDelete;
  }
});

// node_modules/lodash/_mapCacheGet.js
var require_mapCacheGet = __commonJS({
  "node_modules/lodash/_mapCacheGet.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    module.exports = mapCacheGet;
  }
});

// node_modules/lodash/_mapCacheHas.js
var require_mapCacheHas = __commonJS({
  "node_modules/lodash/_mapCacheHas.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    module.exports = mapCacheHas;
  }
});

// node_modules/lodash/_mapCacheSet.js
var require_mapCacheSet = __commonJS({
  "node_modules/lodash/_mapCacheSet.js"(exports, module) {
    var getMapData = require_getMapData();
    function mapCacheSet(key, value) {
      var data = getMapData(this, key), size = data.size;
      data.set(key, value);
      this.size += data.size == size ? 0 : 1;
      return this;
    }
    module.exports = mapCacheSet;
  }
});

// node_modules/lodash/_MapCache.js
var require_MapCache = __commonJS({
  "node_modules/lodash/_MapCache.js"(exports, module) {
    var mapCacheClear = require_mapCacheClear();
    var mapCacheDelete = require_mapCacheDelete();
    var mapCacheGet = require_mapCacheGet();
    var mapCacheHas = require_mapCacheHas();
    var mapCacheSet = require_mapCacheSet();
    function MapCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    module.exports = MapCache;
  }
});

// node_modules/lodash/_stackSet.js
var require_stackSet = __commonJS({
  "node_modules/lodash/_stackSet.js"(exports, module) {
    var ListCache = require_ListCache();
    var Map2 = require_Map();
    var MapCache = require_MapCache();
    var LARGE_ARRAY_SIZE = 200;
    function stackSet(key, value) {
      var data = this.__data__;
      if (data instanceof ListCache) {
        var pairs = data.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          this.size = ++data.size;
          return this;
        }
        data = this.__data__ = new MapCache(pairs);
      }
      data.set(key, value);
      this.size = data.size;
      return this;
    }
    module.exports = stackSet;
  }
});

// node_modules/lodash/_Stack.js
var require_Stack = __commonJS({
  "node_modules/lodash/_Stack.js"(exports, module) {
    var ListCache = require_ListCache();
    var stackClear = require_stackClear();
    var stackDelete = require_stackDelete();
    var stackGet = require_stackGet();
    var stackHas = require_stackHas();
    var stackSet = require_stackSet();
    function Stack(entries) {
      var data = this.__data__ = new ListCache(entries);
      this.size = data.size;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    module.exports = Stack;
  }
});

// node_modules/lodash/_arrayEach.js
var require_arrayEach = __commonJS({
  "node_modules/lodash/_arrayEach.js"(exports, module) {
    function arrayEach(array, iteratee) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (iteratee(array[index], index, array) === false) {
          break;
        }
      }
      return array;
    }
    module.exports = arrayEach;
  }
});

// node_modules/lodash/_defineProperty.js
var require_defineProperty = __commonJS({
  "node_modules/lodash/_defineProperty.js"(exports, module) {
    var getNative = require_getNative();
    var defineProperty = function() {
      try {
        var func = getNative(Object, "defineProperty");
        func({}, "", {});
        return func;
      } catch (e) {
      }
    }();
    module.exports = defineProperty;
  }
});

// node_modules/lodash/_baseAssignValue.js
var require_baseAssignValue = __commonJS({
  "node_modules/lodash/_baseAssignValue.js"(exports, module) {
    var defineProperty = require_defineProperty();
    function baseAssignValue(object, key, value) {
      if (key == "__proto__" && defineProperty) {
        defineProperty(object, key, {
          "configurable": true,
          "enumerable": true,
          "value": value,
          "writable": true
        });
      } else {
        object[key] = value;
      }
    }
    module.exports = baseAssignValue;
  }
});

// node_modules/lodash/_assignValue.js
var require_assignValue = __commonJS({
  "node_modules/lodash/_assignValue.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var eq = require_eq();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function assignValue(object, key, value) {
      var objValue = object[key];
      if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) || value === void 0 && !(key in object)) {
        baseAssignValue(object, key, value);
      }
    }
    module.exports = assignValue;
  }
});

// node_modules/lodash/_copyObject.js
var require_copyObject = __commonJS({
  "node_modules/lodash/_copyObject.js"(exports, module) {
    var assignValue = require_assignValue();
    var baseAssignValue = require_baseAssignValue();
    function copyObject(source, props, object, customizer) {
      var isNew = !object;
      object || (object = {});
      var index = -1, length = props.length;
      while (++index < length) {
        var key = props[index];
        var newValue = customizer ? customizer(object[key], source[key], key, object, source) : void 0;
        if (newValue === void 0) {
          newValue = source[key];
        }
        if (isNew) {
          baseAssignValue(object, key, newValue);
        } else {
          assignValue(object, key, newValue);
        }
      }
      return object;
    }
    module.exports = copyObject;
  }
});

// node_modules/lodash/_baseTimes.js
var require_baseTimes = __commonJS({
  "node_modules/lodash/_baseTimes.js"(exports, module) {
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    module.exports = baseTimes;
  }
});

// node_modules/lodash/isObjectLike.js
var require_isObjectLike = __commonJS({
  "node_modules/lodash/isObjectLike.js"(exports, module) {
    function isObjectLike(value) {
      return value != null && typeof value == "object";
    }
    module.exports = isObjectLike;
  }
});

// node_modules/lodash/_baseIsArguments.js
var require_baseIsArguments = __commonJS({
  "node_modules/lodash/_baseIsArguments.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    function baseIsArguments(value) {
      return isObjectLike(value) && baseGetTag(value) == argsTag;
    }
    module.exports = baseIsArguments;
  }
});

// node_modules/lodash/isArguments.js
var require_isArguments = __commonJS({
  "node_modules/lodash/isArguments.js"(exports, module) {
    var baseIsArguments = require_baseIsArguments();
    var isObjectLike = require_isObjectLike();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var isArguments = baseIsArguments(/* @__PURE__ */ function() {
      return arguments;
    }()) ? baseIsArguments : function(value) {
      return isObjectLike(value) && hasOwnProperty.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
    };
    module.exports = isArguments;
  }
});

// node_modules/lodash/isArray.js
var require_isArray = __commonJS({
  "node_modules/lodash/isArray.js"(exports, module) {
    var isArray = Array.isArray;
    module.exports = isArray;
  }
});

// node_modules/lodash/stubFalse.js
var require_stubFalse = __commonJS({
  "node_modules/lodash/stubFalse.js"(exports, module) {
    function stubFalse() {
      return false;
    }
    module.exports = stubFalse;
  }
});

// node_modules/lodash/isBuffer.js
var require_isBuffer = __commonJS({
  "node_modules/lodash/isBuffer.js"(exports, module) {
    var root = require_root();
    var stubFalse = require_stubFalse();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : void 0;
    var isBuffer = nativeIsBuffer || stubFalse;
    module.exports = isBuffer;
  }
});

// node_modules/lodash/_isIndex.js
var require_isIndex = __commonJS({
  "node_modules/lodash/_isIndex.js"(exports, module) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    function isIndex(value, length) {
      var type = typeof value;
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (type == "number" || type != "symbol" && reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    module.exports = isIndex;
  }
});

// node_modules/lodash/isLength.js
var require_isLength = __commonJS({
  "node_modules/lodash/isLength.js"(exports, module) {
    var MAX_SAFE_INTEGER = 9007199254740991;
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    module.exports = isLength;
  }
});

// node_modules/lodash/_baseIsTypedArray.js
var require_baseIsTypedArray = __commonJS({
  "node_modules/lodash/_baseIsTypedArray.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isLength = require_isLength();
    var isObjectLike = require_isObjectLike();
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
    function baseIsTypedArray(value) {
      return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
    }
    module.exports = baseIsTypedArray;
  }
});

// node_modules/lodash/_baseUnary.js
var require_baseUnary = __commonJS({
  "node_modules/lodash/_baseUnary.js"(exports, module) {
    function baseUnary(func) {
      return function(value) {
        return func(value);
      };
    }
    module.exports = baseUnary;
  }
});

// node_modules/lodash/_nodeUtil.js
var require_nodeUtil = __commonJS({
  "node_modules/lodash/_nodeUtil.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = function() {
      try {
        var types = freeModule && freeModule.require && freeModule.require("util").types;
        if (types) {
          return types;
        }
        return freeProcess && freeProcess.binding && freeProcess.binding("util");
      } catch (e) {
      }
    }();
    module.exports = nodeUtil;
  }
});

// node_modules/lodash/isTypedArray.js
var require_isTypedArray = __commonJS({
  "node_modules/lodash/isTypedArray.js"(exports, module) {
    var baseIsTypedArray = require_baseIsTypedArray();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
    module.exports = isTypedArray;
  }
});

// node_modules/lodash/_arrayLikeKeys.js
var require_arrayLikeKeys = __commonJS({
  "node_modules/lodash/_arrayLikeKeys.js"(exports, module) {
    var baseTimes = require_baseTimes();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isIndex = require_isIndex();
    var isTypedArray = require_isTypedArray();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function arrayLikeKeys(value, inherited) {
      var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && // Safari 9 has enumerable `arguments.length` in strict mode.
        (key == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
        isBuff && (key == "offset" || key == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
        isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || // Skip index properties.
        isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = arrayLikeKeys;
  }
});

// node_modules/lodash/_isPrototype.js
var require_isPrototype = __commonJS({
  "node_modules/lodash/_isPrototype.js"(exports, module) {
    var objectProto = Object.prototype;
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    module.exports = isPrototype;
  }
});

// node_modules/lodash/_overArg.js
var require_overArg = __commonJS({
  "node_modules/lodash/_overArg.js"(exports, module) {
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    module.exports = overArg;
  }
});

// node_modules/lodash/_nativeKeys.js
var require_nativeKeys = __commonJS({
  "node_modules/lodash/_nativeKeys.js"(exports, module) {
    var overArg = require_overArg();
    var nativeKeys = overArg(Object.keys, Object);
    module.exports = nativeKeys;
  }
});

// node_modules/lodash/_baseKeys.js
var require_baseKeys = __commonJS({
  "node_modules/lodash/_baseKeys.js"(exports, module) {
    var isPrototype = require_isPrototype();
    var nativeKeys = require_nativeKeys();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = baseKeys;
  }
});

// node_modules/lodash/isArrayLike.js
var require_isArrayLike = __commonJS({
  "node_modules/lodash/isArrayLike.js"(exports, module) {
    var isFunction = require_isFunction();
    var isLength = require_isLength();
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    module.exports = isArrayLike;
  }
});

// node_modules/lodash/keys.js
var require_keys = __commonJS({
  "node_modules/lodash/keys.js"(exports, module) {
    var arrayLikeKeys = require_arrayLikeKeys();
    var baseKeys = require_baseKeys();
    var isArrayLike = require_isArrayLike();
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    module.exports = keys;
  }
});

// node_modules/lodash/_baseAssign.js
var require_baseAssign = __commonJS({
  "node_modules/lodash/_baseAssign.js"(exports, module) {
    var copyObject = require_copyObject();
    var keys = require_keys();
    function baseAssign(object, source) {
      return object && copyObject(source, keys(source), object);
    }
    module.exports = baseAssign;
  }
});

// node_modules/lodash/_nativeKeysIn.js
var require_nativeKeysIn = __commonJS({
  "node_modules/lodash/_nativeKeysIn.js"(exports, module) {
    function nativeKeysIn(object) {
      var result = [];
      if (object != null) {
        for (var key in Object(object)) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = nativeKeysIn;
  }
});

// node_modules/lodash/_baseKeysIn.js
var require_baseKeysIn = __commonJS({
  "node_modules/lodash/_baseKeysIn.js"(exports, module) {
    var isObject = require_isObject();
    var isPrototype = require_isPrototype();
    var nativeKeysIn = require_nativeKeysIn();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseKeysIn(object) {
      if (!isObject(object)) {
        return nativeKeysIn(object);
      }
      var isProto = isPrototype(object), result = [];
      for (var key in object) {
        if (!(key == "constructor" && (isProto || !hasOwnProperty.call(object, key)))) {
          result.push(key);
        }
      }
      return result;
    }
    module.exports = baseKeysIn;
  }
});

// node_modules/lodash/keysIn.js
var require_keysIn = __commonJS({
  "node_modules/lodash/keysIn.js"(exports, module) {
    var arrayLikeKeys = require_arrayLikeKeys();
    var baseKeysIn = require_baseKeysIn();
    var isArrayLike = require_isArrayLike();
    function keysIn(object) {
      return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
    }
    module.exports = keysIn;
  }
});

// node_modules/lodash/_baseAssignIn.js
var require_baseAssignIn = __commonJS({
  "node_modules/lodash/_baseAssignIn.js"(exports, module) {
    var copyObject = require_copyObject();
    var keysIn = require_keysIn();
    function baseAssignIn(object, source) {
      return object && copyObject(source, keysIn(source), object);
    }
    module.exports = baseAssignIn;
  }
});

// node_modules/lodash/_cloneBuffer.js
var require_cloneBuffer = __commonJS({
  "node_modules/lodash/_cloneBuffer.js"(exports, module) {
    var root = require_root();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var allocUnsafe = Buffer2 ? Buffer2.allocUnsafe : void 0;
    function cloneBuffer(buffer, isDeep) {
      if (isDeep) {
        return buffer.slice();
      }
      var length = buffer.length, result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);
      buffer.copy(result);
      return result;
    }
    module.exports = cloneBuffer;
  }
});

// node_modules/lodash/_copyArray.js
var require_copyArray = __commonJS({
  "node_modules/lodash/_copyArray.js"(exports, module) {
    function copyArray(source, array) {
      var index = -1, length = source.length;
      array || (array = Array(length));
      while (++index < length) {
        array[index] = source[index];
      }
      return array;
    }
    module.exports = copyArray;
  }
});

// node_modules/lodash/_arrayFilter.js
var require_arrayFilter = __commonJS({
  "node_modules/lodash/_arrayFilter.js"(exports, module) {
    function arrayFilter(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
      while (++index < length) {
        var value = array[index];
        if (predicate(value, index, array)) {
          result[resIndex++] = value;
        }
      }
      return result;
    }
    module.exports = arrayFilter;
  }
});

// node_modules/lodash/stubArray.js
var require_stubArray = __commonJS({
  "node_modules/lodash/stubArray.js"(exports, module) {
    function stubArray() {
      return [];
    }
    module.exports = stubArray;
  }
});

// node_modules/lodash/_getSymbols.js
var require_getSymbols = __commonJS({
  "node_modules/lodash/_getSymbols.js"(exports, module) {
    var arrayFilter = require_arrayFilter();
    var stubArray = require_stubArray();
    var objectProto = Object.prototype;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
      if (object == null) {
        return [];
      }
      object = Object(object);
      return arrayFilter(nativeGetSymbols(object), function(symbol) {
        return propertyIsEnumerable.call(object, symbol);
      });
    };
    module.exports = getSymbols;
  }
});

// node_modules/lodash/_copySymbols.js
var require_copySymbols = __commonJS({
  "node_modules/lodash/_copySymbols.js"(exports, module) {
    var copyObject = require_copyObject();
    var getSymbols = require_getSymbols();
    function copySymbols(source, object) {
      return copyObject(source, getSymbols(source), object);
    }
    module.exports = copySymbols;
  }
});

// node_modules/lodash/_arrayPush.js
var require_arrayPush = __commonJS({
  "node_modules/lodash/_arrayPush.js"(exports, module) {
    function arrayPush(array, values) {
      var index = -1, length = values.length, offset = array.length;
      while (++index < length) {
        array[offset + index] = values[index];
      }
      return array;
    }
    module.exports = arrayPush;
  }
});

// node_modules/lodash/_getPrototype.js
var require_getPrototype = __commonJS({
  "node_modules/lodash/_getPrototype.js"(exports, module) {
    var overArg = require_overArg();
    var getPrototype = overArg(Object.getPrototypeOf, Object);
    module.exports = getPrototype;
  }
});

// node_modules/lodash/_getSymbolsIn.js
var require_getSymbolsIn = __commonJS({
  "node_modules/lodash/_getSymbolsIn.js"(exports, module) {
    var arrayPush = require_arrayPush();
    var getPrototype = require_getPrototype();
    var getSymbols = require_getSymbols();
    var stubArray = require_stubArray();
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var getSymbolsIn = !nativeGetSymbols ? stubArray : function(object) {
      var result = [];
      while (object) {
        arrayPush(result, getSymbols(object));
        object = getPrototype(object);
      }
      return result;
    };
    module.exports = getSymbolsIn;
  }
});

// node_modules/lodash/_copySymbolsIn.js
var require_copySymbolsIn = __commonJS({
  "node_modules/lodash/_copySymbolsIn.js"(exports, module) {
    var copyObject = require_copyObject();
    var getSymbolsIn = require_getSymbolsIn();
    function copySymbolsIn(source, object) {
      return copyObject(source, getSymbolsIn(source), object);
    }
    module.exports = copySymbolsIn;
  }
});

// node_modules/lodash/_baseGetAllKeys.js
var require_baseGetAllKeys = __commonJS({
  "node_modules/lodash/_baseGetAllKeys.js"(exports, module) {
    var arrayPush = require_arrayPush();
    var isArray = require_isArray();
    function baseGetAllKeys(object, keysFunc, symbolsFunc) {
      var result = keysFunc(object);
      return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
    }
    module.exports = baseGetAllKeys;
  }
});

// node_modules/lodash/_getAllKeys.js
var require_getAllKeys = __commonJS({
  "node_modules/lodash/_getAllKeys.js"(exports, module) {
    var baseGetAllKeys = require_baseGetAllKeys();
    var getSymbols = require_getSymbols();
    var keys = require_keys();
    function getAllKeys(object) {
      return baseGetAllKeys(object, keys, getSymbols);
    }
    module.exports = getAllKeys;
  }
});

// node_modules/lodash/_getAllKeysIn.js
var require_getAllKeysIn = __commonJS({
  "node_modules/lodash/_getAllKeysIn.js"(exports, module) {
    var baseGetAllKeys = require_baseGetAllKeys();
    var getSymbolsIn = require_getSymbolsIn();
    var keysIn = require_keysIn();
    function getAllKeysIn(object) {
      return baseGetAllKeys(object, keysIn, getSymbolsIn);
    }
    module.exports = getAllKeysIn;
  }
});

// node_modules/lodash/_DataView.js
var require_DataView = __commonJS({
  "node_modules/lodash/_DataView.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var DataView = getNative(root, "DataView");
    module.exports = DataView;
  }
});

// node_modules/lodash/_Promise.js
var require_Promise = __commonJS({
  "node_modules/lodash/_Promise.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Promise2 = getNative(root, "Promise");
    module.exports = Promise2;
  }
});

// node_modules/lodash/_Set.js
var require_Set = __commonJS({
  "node_modules/lodash/_Set.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var Set2 = getNative(root, "Set");
    module.exports = Set2;
  }
});

// node_modules/lodash/_WeakMap.js
var require_WeakMap = __commonJS({
  "node_modules/lodash/_WeakMap.js"(exports, module) {
    var getNative = require_getNative();
    var root = require_root();
    var WeakMap = getNative(root, "WeakMap");
    module.exports = WeakMap;
  }
});

// node_modules/lodash/_getTag.js
var require_getTag = __commonJS({
  "node_modules/lodash/_getTag.js"(exports, module) {
    var DataView = require_DataView();
    var Map2 = require_Map();
    var Promise2 = require_Promise();
    var Set2 = require_Set();
    var WeakMap = require_WeakMap();
    var baseGetTag = require_baseGetTag();
    var toSource = require_toSource();
    var mapTag = "[object Map]";
    var objectTag = "[object Object]";
    var promiseTag = "[object Promise]";
    var setTag = "[object Set]";
    var weakMapTag = "[object WeakMap]";
    var dataViewTag = "[object DataView]";
    var dataViewCtorString = toSource(DataView);
    var mapCtorString = toSource(Map2);
    var promiseCtorString = toSource(Promise2);
    var setCtorString = toSource(Set2);
    var weakMapCtorString = toSource(WeakMap);
    var getTag = baseGetTag;
    if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap && getTag(new WeakMap()) != weakMapTag) {
      getTag = function(value) {
        var result = baseGetTag(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
        if (ctorString) {
          switch (ctorString) {
            case dataViewCtorString:
              return dataViewTag;
            case mapCtorString:
              return mapTag;
            case promiseCtorString:
              return promiseTag;
            case setCtorString:
              return setTag;
            case weakMapCtorString:
              return weakMapTag;
          }
        }
        return result;
      };
    }
    module.exports = getTag;
  }
});

// node_modules/lodash/_initCloneArray.js
var require_initCloneArray = __commonJS({
  "node_modules/lodash/_initCloneArray.js"(exports, module) {
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function initCloneArray(array) {
      var length = array.length, result = new array.constructor(length);
      if (length && typeof array[0] == "string" && hasOwnProperty.call(array, "index")) {
        result.index = array.index;
        result.input = array.input;
      }
      return result;
    }
    module.exports = initCloneArray;
  }
});

// node_modules/lodash/_Uint8Array.js
var require_Uint8Array = __commonJS({
  "node_modules/lodash/_Uint8Array.js"(exports, module) {
    var root = require_root();
    var Uint8Array2 = root.Uint8Array;
    module.exports = Uint8Array2;
  }
});

// node_modules/lodash/_cloneArrayBuffer.js
var require_cloneArrayBuffer = __commonJS({
  "node_modules/lodash/_cloneArrayBuffer.js"(exports, module) {
    var Uint8Array2 = require_Uint8Array();
    function cloneArrayBuffer(arrayBuffer) {
      var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
      new Uint8Array2(result).set(new Uint8Array2(arrayBuffer));
      return result;
    }
    module.exports = cloneArrayBuffer;
  }
});

// node_modules/lodash/_cloneDataView.js
var require_cloneDataView = __commonJS({
  "node_modules/lodash/_cloneDataView.js"(exports, module) {
    var cloneArrayBuffer = require_cloneArrayBuffer();
    function cloneDataView(dataView, isDeep) {
      var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
      return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
    }
    module.exports = cloneDataView;
  }
});

// node_modules/lodash/_cloneRegExp.js
var require_cloneRegExp = __commonJS({
  "node_modules/lodash/_cloneRegExp.js"(exports, module) {
    var reFlags = /\w*$/;
    function cloneRegExp(regexp) {
      var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
      result.lastIndex = regexp.lastIndex;
      return result;
    }
    module.exports = cloneRegExp;
  }
});

// node_modules/lodash/_cloneSymbol.js
var require_cloneSymbol = __commonJS({
  "node_modules/lodash/_cloneSymbol.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function cloneSymbol(symbol) {
      return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
    }
    module.exports = cloneSymbol;
  }
});

// node_modules/lodash/_cloneTypedArray.js
var require_cloneTypedArray = __commonJS({
  "node_modules/lodash/_cloneTypedArray.js"(exports, module) {
    var cloneArrayBuffer = require_cloneArrayBuffer();
    function cloneTypedArray(typedArray, isDeep) {
      var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
      return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
    }
    module.exports = cloneTypedArray;
  }
});

// node_modules/lodash/_initCloneByTag.js
var require_initCloneByTag = __commonJS({
  "node_modules/lodash/_initCloneByTag.js"(exports, module) {
    var cloneArrayBuffer = require_cloneArrayBuffer();
    var cloneDataView = require_cloneDataView();
    var cloneRegExp = require_cloneRegExp();
    var cloneSymbol = require_cloneSymbol();
    var cloneTypedArray = require_cloneTypedArray();
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    function initCloneByTag(object, tag, isDeep) {
      var Ctor = object.constructor;
      switch (tag) {
        case arrayBufferTag:
          return cloneArrayBuffer(object);
        case boolTag:
        case dateTag:
          return new Ctor(+object);
        case dataViewTag:
          return cloneDataView(object, isDeep);
        case float32Tag:
        case float64Tag:
        case int8Tag:
        case int16Tag:
        case int32Tag:
        case uint8Tag:
        case uint8ClampedTag:
        case uint16Tag:
        case uint32Tag:
          return cloneTypedArray(object, isDeep);
        case mapTag:
          return new Ctor();
        case numberTag:
        case stringTag:
          return new Ctor(object);
        case regexpTag:
          return cloneRegExp(object);
        case setTag:
          return new Ctor();
        case symbolTag:
          return cloneSymbol(object);
      }
    }
    module.exports = initCloneByTag;
  }
});

// node_modules/lodash/_baseCreate.js
var require_baseCreate = __commonJS({
  "node_modules/lodash/_baseCreate.js"(exports, module) {
    var isObject = require_isObject();
    var objectCreate = Object.create;
    var baseCreate = /* @__PURE__ */ function() {
      function object() {
      }
      return function(proto) {
        if (!isObject(proto)) {
          return {};
        }
        if (objectCreate) {
          return objectCreate(proto);
        }
        object.prototype = proto;
        var result = new object();
        object.prototype = void 0;
        return result;
      };
    }();
    module.exports = baseCreate;
  }
});

// node_modules/lodash/_initCloneObject.js
var require_initCloneObject = __commonJS({
  "node_modules/lodash/_initCloneObject.js"(exports, module) {
    var baseCreate = require_baseCreate();
    var getPrototype = require_getPrototype();
    var isPrototype = require_isPrototype();
    function initCloneObject(object) {
      return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
    }
    module.exports = initCloneObject;
  }
});

// node_modules/lodash/_baseIsMap.js
var require_baseIsMap = __commonJS({
  "node_modules/lodash/_baseIsMap.js"(exports, module) {
    var getTag = require_getTag();
    var isObjectLike = require_isObjectLike();
    var mapTag = "[object Map]";
    function baseIsMap(value) {
      return isObjectLike(value) && getTag(value) == mapTag;
    }
    module.exports = baseIsMap;
  }
});

// node_modules/lodash/isMap.js
var require_isMap = __commonJS({
  "node_modules/lodash/isMap.js"(exports, module) {
    var baseIsMap = require_baseIsMap();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsMap = nodeUtil && nodeUtil.isMap;
    var isMap = nodeIsMap ? baseUnary(nodeIsMap) : baseIsMap;
    module.exports = isMap;
  }
});

// node_modules/lodash/_baseIsSet.js
var require_baseIsSet = __commonJS({
  "node_modules/lodash/_baseIsSet.js"(exports, module) {
    var getTag = require_getTag();
    var isObjectLike = require_isObjectLike();
    var setTag = "[object Set]";
    function baseIsSet(value) {
      return isObjectLike(value) && getTag(value) == setTag;
    }
    module.exports = baseIsSet;
  }
});

// node_modules/lodash/isSet.js
var require_isSet = __commonJS({
  "node_modules/lodash/isSet.js"(exports, module) {
    var baseIsSet = require_baseIsSet();
    var baseUnary = require_baseUnary();
    var nodeUtil = require_nodeUtil();
    var nodeIsSet = nodeUtil && nodeUtil.isSet;
    var isSet = nodeIsSet ? baseUnary(nodeIsSet) : baseIsSet;
    module.exports = isSet;
  }
});

// node_modules/lodash/_baseClone.js
var require_baseClone = __commonJS({
  "node_modules/lodash/_baseClone.js"(exports, module) {
    var Stack = require_Stack();
    var arrayEach = require_arrayEach();
    var assignValue = require_assignValue();
    var baseAssign = require_baseAssign();
    var baseAssignIn = require_baseAssignIn();
    var cloneBuffer = require_cloneBuffer();
    var copyArray = require_copyArray();
    var copySymbols = require_copySymbols();
    var copySymbolsIn = require_copySymbolsIn();
    var getAllKeys = require_getAllKeys();
    var getAllKeysIn = require_getAllKeysIn();
    var getTag = require_getTag();
    var initCloneArray = require_initCloneArray();
    var initCloneByTag = require_initCloneByTag();
    var initCloneObject = require_initCloneObject();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isMap = require_isMap();
    var isObject = require_isObject();
    var isSet = require_isSet();
    var keys = require_keys();
    var keysIn = require_keysIn();
    var CLONE_DEEP_FLAG = 1;
    var CLONE_FLAT_FLAG = 2;
    var CLONE_SYMBOLS_FLAG = 4;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var objectTag = "[object Object]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var cloneableTags = {};
    cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
    cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;
    function baseClone(value, bitmask, customizer, key, object, stack) {
      var result, isDeep = bitmask & CLONE_DEEP_FLAG, isFlat = bitmask & CLONE_FLAT_FLAG, isFull = bitmask & CLONE_SYMBOLS_FLAG;
      if (customizer) {
        result = object ? customizer(value, key, object, stack) : customizer(value);
      }
      if (result !== void 0) {
        return result;
      }
      if (!isObject(value)) {
        return value;
      }
      var isArr = isArray(value);
      if (isArr) {
        result = initCloneArray(value);
        if (!isDeep) {
          return copyArray(value, result);
        }
      } else {
        var tag = getTag(value), isFunc = tag == funcTag || tag == genTag;
        if (isBuffer(value)) {
          return cloneBuffer(value, isDeep);
        }
        if (tag == objectTag || tag == argsTag || isFunc && !object) {
          result = isFlat || isFunc ? {} : initCloneObject(value);
          if (!isDeep) {
            return isFlat ? copySymbolsIn(value, baseAssignIn(result, value)) : copySymbols(value, baseAssign(result, value));
          }
        } else {
          if (!cloneableTags[tag]) {
            return object ? value : {};
          }
          result = initCloneByTag(value, tag, isDeep);
        }
      }
      stack || (stack = new Stack());
      var stacked = stack.get(value);
      if (stacked) {
        return stacked;
      }
      stack.set(value, result);
      if (isSet(value)) {
        value.forEach(function(subValue) {
          result.add(baseClone(subValue, bitmask, customizer, subValue, value, stack));
        });
      } else if (isMap(value)) {
        value.forEach(function(subValue, key2) {
          result.set(key2, baseClone(subValue, bitmask, customizer, key2, value, stack));
        });
      }
      var keysFunc = isFull ? isFlat ? getAllKeysIn : getAllKeys : isFlat ? keysIn : keys;
      var props = isArr ? void 0 : keysFunc(value);
      arrayEach(props || value, function(subValue, key2) {
        if (props) {
          key2 = subValue;
          subValue = value[key2];
        }
        assignValue(result, key2, baseClone(subValue, bitmask, customizer, key2, value, stack));
      });
      return result;
    }
    module.exports = baseClone;
  }
});

// node_modules/lodash/clone.js
var require_clone = __commonJS({
  "node_modules/lodash/clone.js"(exports, module) {
    var baseClone = require_baseClone();
    var CLONE_SYMBOLS_FLAG = 4;
    function clone(value) {
      return baseClone(value, CLONE_SYMBOLS_FLAG);
    }
    module.exports = clone;
  }
});

// node_modules/lodash/constant.js
var require_constant = __commonJS({
  "node_modules/lodash/constant.js"(exports, module) {
    function constant(value) {
      return function() {
        return value;
      };
    }
    module.exports = constant;
  }
});

// node_modules/lodash/_createBaseFor.js
var require_createBaseFor = __commonJS({
  "node_modules/lodash/_createBaseFor.js"(exports, module) {
    function createBaseFor(fromRight) {
      return function(object, iteratee, keysFunc) {
        var index = -1, iterable = Object(object), props = keysFunc(object), length = props.length;
        while (length--) {
          var key = props[fromRight ? length : ++index];
          if (iteratee(iterable[key], key, iterable) === false) {
            break;
          }
        }
        return object;
      };
    }
    module.exports = createBaseFor;
  }
});

// node_modules/lodash/_baseFor.js
var require_baseFor = __commonJS({
  "node_modules/lodash/_baseFor.js"(exports, module) {
    var createBaseFor = require_createBaseFor();
    var baseFor = createBaseFor();
    module.exports = baseFor;
  }
});

// node_modules/lodash/_baseForOwn.js
var require_baseForOwn = __commonJS({
  "node_modules/lodash/_baseForOwn.js"(exports, module) {
    var baseFor = require_baseFor();
    var keys = require_keys();
    function baseForOwn(object, iteratee) {
      return object && baseFor(object, iteratee, keys);
    }
    module.exports = baseForOwn;
  }
});

// node_modules/lodash/_createBaseEach.js
var require_createBaseEach = __commonJS({
  "node_modules/lodash/_createBaseEach.js"(exports, module) {
    var isArrayLike = require_isArrayLike();
    function createBaseEach(eachFunc, fromRight) {
      return function(collection, iteratee) {
        if (collection == null) {
          return collection;
        }
        if (!isArrayLike(collection)) {
          return eachFunc(collection, iteratee);
        }
        var length = collection.length, index = fromRight ? length : -1, iterable = Object(collection);
        while (fromRight ? index-- : ++index < length) {
          if (iteratee(iterable[index], index, iterable) === false) {
            break;
          }
        }
        return collection;
      };
    }
    module.exports = createBaseEach;
  }
});

// node_modules/lodash/_baseEach.js
var require_baseEach = __commonJS({
  "node_modules/lodash/_baseEach.js"(exports, module) {
    var baseForOwn = require_baseForOwn();
    var createBaseEach = require_createBaseEach();
    var baseEach = createBaseEach(baseForOwn);
    module.exports = baseEach;
  }
});

// node_modules/lodash/identity.js
var require_identity = __commonJS({
  "node_modules/lodash/identity.js"(exports, module) {
    function identity(value) {
      return value;
    }
    module.exports = identity;
  }
});

// node_modules/lodash/_castFunction.js
var require_castFunction = __commonJS({
  "node_modules/lodash/_castFunction.js"(exports, module) {
    var identity = require_identity();
    function castFunction(value) {
      return typeof value == "function" ? value : identity;
    }
    module.exports = castFunction;
  }
});

// node_modules/lodash/forEach.js
var require_forEach = __commonJS({
  "node_modules/lodash/forEach.js"(exports, module) {
    var arrayEach = require_arrayEach();
    var baseEach = require_baseEach();
    var castFunction = require_castFunction();
    var isArray = require_isArray();
    function forEach(collection, iteratee) {
      var func = isArray(collection) ? arrayEach : baseEach;
      return func(collection, castFunction(iteratee));
    }
    module.exports = forEach;
  }
});

// node_modules/lodash/each.js
var require_each = __commonJS({
  "node_modules/lodash/each.js"(exports, module) {
    module.exports = require_forEach();
  }
});

// node_modules/lodash/_baseFilter.js
var require_baseFilter = __commonJS({
  "node_modules/lodash/_baseFilter.js"(exports, module) {
    var baseEach = require_baseEach();
    function baseFilter(collection, predicate) {
      var result = [];
      baseEach(collection, function(value, index, collection2) {
        if (predicate(value, index, collection2)) {
          result.push(value);
        }
      });
      return result;
    }
    module.exports = baseFilter;
  }
});

// node_modules/lodash/_setCacheAdd.js
var require_setCacheAdd = __commonJS({
  "node_modules/lodash/_setCacheAdd.js"(exports, module) {
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    function setCacheAdd(value) {
      this.__data__.set(value, HASH_UNDEFINED);
      return this;
    }
    module.exports = setCacheAdd;
  }
});

// node_modules/lodash/_setCacheHas.js
var require_setCacheHas = __commonJS({
  "node_modules/lodash/_setCacheHas.js"(exports, module) {
    function setCacheHas(value) {
      return this.__data__.has(value);
    }
    module.exports = setCacheHas;
  }
});

// node_modules/lodash/_SetCache.js
var require_SetCache = __commonJS({
  "node_modules/lodash/_SetCache.js"(exports, module) {
    var MapCache = require_MapCache();
    var setCacheAdd = require_setCacheAdd();
    var setCacheHas = require_setCacheHas();
    function SetCache(values) {
      var index = -1, length = values == null ? 0 : values.length;
      this.__data__ = new MapCache();
      while (++index < length) {
        this.add(values[index]);
      }
    }
    SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
    SetCache.prototype.has = setCacheHas;
    module.exports = SetCache;
  }
});

// node_modules/lodash/_arraySome.js
var require_arraySome = __commonJS({
  "node_modules/lodash/_arraySome.js"(exports, module) {
    function arraySome(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (predicate(array[index], index, array)) {
          return true;
        }
      }
      return false;
    }
    module.exports = arraySome;
  }
});

// node_modules/lodash/_cacheHas.js
var require_cacheHas = __commonJS({
  "node_modules/lodash/_cacheHas.js"(exports, module) {
    function cacheHas(cache, key) {
      return cache.has(key);
    }
    module.exports = cacheHas;
  }
});

// node_modules/lodash/_equalArrays.js
var require_equalArrays = __commonJS({
  "node_modules/lodash/_equalArrays.js"(exports, module) {
    var SetCache = require_SetCache();
    var arraySome = require_arraySome();
    var cacheHas = require_cacheHas();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
      if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
        return false;
      }
      var arrStacked = stack.get(array);
      var othStacked = stack.get(other);
      if (arrStacked && othStacked) {
        return arrStacked == other && othStacked == array;
      }
      var index = -1, result = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new SetCache() : void 0;
      stack.set(array, other);
      stack.set(other, array);
      while (++index < arrLength) {
        var arrValue = array[index], othValue = other[index];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
        }
        if (compared !== void 0) {
          if (compared) {
            continue;
          }
          result = false;
          break;
        }
        if (seen) {
          if (!arraySome(other, function(othValue2, othIndex) {
            if (!cacheHas(seen, othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
            result = false;
            break;
          }
        } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
          result = false;
          break;
        }
      }
      stack["delete"](array);
      stack["delete"](other);
      return result;
    }
    module.exports = equalArrays;
  }
});

// node_modules/lodash/_mapToArray.js
var require_mapToArray = __commonJS({
  "node_modules/lodash/_mapToArray.js"(exports, module) {
    function mapToArray(map) {
      var index = -1, result = Array(map.size);
      map.forEach(function(value, key) {
        result[++index] = [key, value];
      });
      return result;
    }
    module.exports = mapToArray;
  }
});

// node_modules/lodash/_setToArray.js
var require_setToArray = __commonJS({
  "node_modules/lodash/_setToArray.js"(exports, module) {
    function setToArray(set) {
      var index = -1, result = Array(set.size);
      set.forEach(function(value) {
        result[++index] = value;
      });
      return result;
    }
    module.exports = setToArray;
  }
});

// node_modules/lodash/_equalByTag.js
var require_equalByTag = __commonJS({
  "node_modules/lodash/_equalByTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var Uint8Array2 = require_Uint8Array();
    var eq = require_eq();
    var equalArrays = require_equalArrays();
    var mapToArray = require_mapToArray();
    var setToArray = require_setToArray();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
      switch (tag) {
        case dataViewTag:
          if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
            return false;
          }
          object = object.buffer;
          other = other.buffer;
        case arrayBufferTag:
          if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
            return false;
          }
          return true;
        case boolTag:
        case dateTag:
        case numberTag:
          return eq(+object, +other);
        case errorTag:
          return object.name == other.name && object.message == other.message;
        case regexpTag:
        case stringTag:
          return object == other + "";
        case mapTag:
          var convert = mapToArray;
        case setTag:
          var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
          convert || (convert = setToArray);
          if (object.size != other.size && !isPartial) {
            return false;
          }
          var stacked = stack.get(object);
          if (stacked) {
            return stacked == other;
          }
          bitmask |= COMPARE_UNORDERED_FLAG;
          stack.set(object, other);
          var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
          stack["delete"](object);
          return result;
        case symbolTag:
          if (symbolValueOf) {
            return symbolValueOf.call(object) == symbolValueOf.call(other);
          }
      }
      return false;
    }
    module.exports = equalByTag;
  }
});

// node_modules/lodash/_equalObjects.js
var require_equalObjects = __commonJS({
  "node_modules/lodash/_equalObjects.js"(exports, module) {
    var getAllKeys = require_getAllKeys();
    var COMPARE_PARTIAL_FLAG = 1;
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, objProps = getAllKeys(object), objLength = objProps.length, othProps = getAllKeys(other), othLength = othProps.length;
      if (objLength != othLength && !isPartial) {
        return false;
      }
      var index = objLength;
      while (index--) {
        var key = objProps[index];
        if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
          return false;
        }
      }
      var objStacked = stack.get(object);
      var othStacked = stack.get(other);
      if (objStacked && othStacked) {
        return objStacked == other && othStacked == object;
      }
      var result = true;
      stack.set(object, other);
      stack.set(other, object);
      var skipCtor = isPartial;
      while (++index < objLength) {
        key = objProps[index];
        var objValue = object[key], othValue = other[key];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
        }
        if (!(compared === void 0 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
          result = false;
          break;
        }
        skipCtor || (skipCtor = key == "constructor");
      }
      if (result && !skipCtor) {
        var objCtor = object.constructor, othCtor = other.constructor;
        if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
          result = false;
        }
      }
      stack["delete"](object);
      stack["delete"](other);
      return result;
    }
    module.exports = equalObjects;
  }
});

// node_modules/lodash/_baseIsEqualDeep.js
var require_baseIsEqualDeep = __commonJS({
  "node_modules/lodash/_baseIsEqualDeep.js"(exports, module) {
    var Stack = require_Stack();
    var equalArrays = require_equalArrays();
    var equalByTag = require_equalByTag();
    var equalObjects = require_equalObjects();
    var getTag = require_getTag();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isTypedArray = require_isTypedArray();
    var COMPARE_PARTIAL_FLAG = 1;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var objectTag = "[object Object]";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
      var objIsArr = isArray(object), othIsArr = isArray(other), objTag = objIsArr ? arrayTag : getTag(object), othTag = othIsArr ? arrayTag : getTag(other);
      objTag = objTag == argsTag ? objectTag : objTag;
      othTag = othTag == argsTag ? objectTag : othTag;
      var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
      if (isSameTag && isBuffer(object)) {
        if (!isBuffer(other)) {
          return false;
        }
        objIsArr = true;
        objIsObj = false;
      }
      if (isSameTag && !objIsObj) {
        stack || (stack = new Stack());
        return objIsArr || isTypedArray(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
      }
      if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
        var objIsWrapped = objIsObj && hasOwnProperty.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty.call(other, "__wrapped__");
        if (objIsWrapped || othIsWrapped) {
          var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
          stack || (stack = new Stack());
          return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
        }
      }
      if (!isSameTag) {
        return false;
      }
      stack || (stack = new Stack());
      return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
    }
    module.exports = baseIsEqualDeep;
  }
});

// node_modules/lodash/_baseIsEqual.js
var require_baseIsEqual = __commonJS({
  "node_modules/lodash/_baseIsEqual.js"(exports, module) {
    var baseIsEqualDeep = require_baseIsEqualDeep();
    var isObjectLike = require_isObjectLike();
    function baseIsEqual(value, other, bitmask, customizer, stack) {
      if (value === other) {
        return true;
      }
      if (value == null || other == null || !isObjectLike(value) && !isObjectLike(other)) {
        return value !== value && other !== other;
      }
      return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
    }
    module.exports = baseIsEqual;
  }
});

// node_modules/lodash/_baseIsMatch.js
var require_baseIsMatch = __commonJS({
  "node_modules/lodash/_baseIsMatch.js"(exports, module) {
    var Stack = require_Stack();
    var baseIsEqual = require_baseIsEqual();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function baseIsMatch(object, source, matchData, customizer) {
      var index = matchData.length, length = index, noCustomizer = !customizer;
      if (object == null) {
        return !length;
      }
      object = Object(object);
      while (index--) {
        var data = matchData[index];
        if (noCustomizer && data[2] ? data[1] !== object[data[0]] : !(data[0] in object)) {
          return false;
        }
      }
      while (++index < length) {
        data = matchData[index];
        var key = data[0], objValue = object[key], srcValue = data[1];
        if (noCustomizer && data[2]) {
          if (objValue === void 0 && !(key in object)) {
            return false;
          }
        } else {
          var stack = new Stack();
          if (customizer) {
            var result = customizer(objValue, srcValue, key, object, source, stack);
          }
          if (!(result === void 0 ? baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG, customizer, stack) : result)) {
            return false;
          }
        }
      }
      return true;
    }
    module.exports = baseIsMatch;
  }
});

// node_modules/lodash/_isStrictComparable.js
var require_isStrictComparable = __commonJS({
  "node_modules/lodash/_isStrictComparable.js"(exports, module) {
    var isObject = require_isObject();
    function isStrictComparable(value) {
      return value === value && !isObject(value);
    }
    module.exports = isStrictComparable;
  }
});

// node_modules/lodash/_getMatchData.js
var require_getMatchData = __commonJS({
  "node_modules/lodash/_getMatchData.js"(exports, module) {
    var isStrictComparable = require_isStrictComparable();
    var keys = require_keys();
    function getMatchData(object) {
      var result = keys(object), length = result.length;
      while (length--) {
        var key = result[length], value = object[key];
        result[length] = [key, value, isStrictComparable(value)];
      }
      return result;
    }
    module.exports = getMatchData;
  }
});

// node_modules/lodash/_matchesStrictComparable.js
var require_matchesStrictComparable = __commonJS({
  "node_modules/lodash/_matchesStrictComparable.js"(exports, module) {
    function matchesStrictComparable(key, srcValue) {
      return function(object) {
        if (object == null) {
          return false;
        }
        return object[key] === srcValue && (srcValue !== void 0 || key in Object(object));
      };
    }
    module.exports = matchesStrictComparable;
  }
});

// node_modules/lodash/_baseMatches.js
var require_baseMatches = __commonJS({
  "node_modules/lodash/_baseMatches.js"(exports, module) {
    var baseIsMatch = require_baseIsMatch();
    var getMatchData = require_getMatchData();
    var matchesStrictComparable = require_matchesStrictComparable();
    function baseMatches(source) {
      var matchData = getMatchData(source);
      if (matchData.length == 1 && matchData[0][2]) {
        return matchesStrictComparable(matchData[0][0], matchData[0][1]);
      }
      return function(object) {
        return object === source || baseIsMatch(object, source, matchData);
      };
    }
    module.exports = baseMatches;
  }
});

// node_modules/lodash/isSymbol.js
var require_isSymbol = __commonJS({
  "node_modules/lodash/isSymbol.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var symbolTag = "[object Symbol]";
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && baseGetTag(value) == symbolTag;
    }
    module.exports = isSymbol;
  }
});

// node_modules/lodash/_isKey.js
var require_isKey = __commonJS({
  "node_modules/lodash/_isKey.js"(exports, module) {
    var isArray = require_isArray();
    var isSymbol = require_isSymbol();
    var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
    var reIsPlainProp = /^\w*$/;
    function isKey(value, object) {
      if (isArray(value)) {
        return false;
      }
      var type = typeof value;
      if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol(value)) {
        return true;
      }
      return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object(object);
    }
    module.exports = isKey;
  }
});

// node_modules/lodash/memoize.js
var require_memoize = __commonJS({
  "node_modules/lodash/memoize.js"(exports, module) {
    var MapCache = require_MapCache();
    var FUNC_ERROR_TEXT = "Expected a function";
    function memoize(func, resolver) {
      if (typeof func != "function" || resolver != null && typeof resolver != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      var memoized = function() {
        var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
        if (cache.has(key)) {
          return cache.get(key);
        }
        var result = func.apply(this, args);
        memoized.cache = cache.set(key, result) || cache;
        return result;
      };
      memoized.cache = new (memoize.Cache || MapCache)();
      return memoized;
    }
    memoize.Cache = MapCache;
    module.exports = memoize;
  }
});

// node_modules/lodash/_memoizeCapped.js
var require_memoizeCapped = __commonJS({
  "node_modules/lodash/_memoizeCapped.js"(exports, module) {
    var memoize = require_memoize();
    var MAX_MEMOIZE_SIZE = 500;
    function memoizeCapped(func) {
      var result = memoize(func, function(key) {
        if (cache.size === MAX_MEMOIZE_SIZE) {
          cache.clear();
        }
        return key;
      });
      var cache = result.cache;
      return result;
    }
    module.exports = memoizeCapped;
  }
});

// node_modules/lodash/_stringToPath.js
var require_stringToPath = __commonJS({
  "node_modules/lodash/_stringToPath.js"(exports, module) {
    var memoizeCapped = require_memoizeCapped();
    var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
    var reEscapeChar = /\\(\\)?/g;
    var stringToPath = memoizeCapped(function(string) {
      var result = [];
      if (string.charCodeAt(0) === 46) {
        result.push("");
      }
      string.replace(rePropName, function(match, number, quote, subString) {
        result.push(quote ? subString.replace(reEscapeChar, "$1") : number || match);
      });
      return result;
    });
    module.exports = stringToPath;
  }
});

// node_modules/lodash/_arrayMap.js
var require_arrayMap = __commonJS({
  "node_modules/lodash/_arrayMap.js"(exports, module) {
    function arrayMap(array, iteratee) {
      var index = -1, length = array == null ? 0 : array.length, result = Array(length);
      while (++index < length) {
        result[index] = iteratee(array[index], index, array);
      }
      return result;
    }
    module.exports = arrayMap;
  }
});

// node_modules/lodash/_baseToString.js
var require_baseToString = __commonJS({
  "node_modules/lodash/_baseToString.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var arrayMap = require_arrayMap();
    var isArray = require_isArray();
    var isSymbol = require_isSymbol();
    var INFINITY = 1 / 0;
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isArray(value)) {
        return arrayMap(value, baseToString) + "";
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    module.exports = baseToString;
  }
});

// node_modules/lodash/toString.js
var require_toString = __commonJS({
  "node_modules/lodash/toString.js"(exports, module) {
    var baseToString = require_baseToString();
    function toString(value) {
      return value == null ? "" : baseToString(value);
    }
    module.exports = toString;
  }
});

// node_modules/lodash/_castPath.js
var require_castPath = __commonJS({
  "node_modules/lodash/_castPath.js"(exports, module) {
    var isArray = require_isArray();
    var isKey = require_isKey();
    var stringToPath = require_stringToPath();
    var toString = require_toString();
    function castPath(value, object) {
      if (isArray(value)) {
        return value;
      }
      return isKey(value, object) ? [value] : stringToPath(toString(value));
    }
    module.exports = castPath;
  }
});

// node_modules/lodash/_toKey.js
var require_toKey = __commonJS({
  "node_modules/lodash/_toKey.js"(exports, module) {
    var isSymbol = require_isSymbol();
    var INFINITY = 1 / 0;
    function toKey(value) {
      if (typeof value == "string" || isSymbol(value)) {
        return value;
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    module.exports = toKey;
  }
});

// node_modules/lodash/_baseGet.js
var require_baseGet = __commonJS({
  "node_modules/lodash/_baseGet.js"(exports, module) {
    var castPath = require_castPath();
    var toKey = require_toKey();
    function baseGet(object, path) {
      path = castPath(path, object);
      var index = 0, length = path.length;
      while (object != null && index < length) {
        object = object[toKey(path[index++])];
      }
      return index && index == length ? object : void 0;
    }
    module.exports = baseGet;
  }
});

// node_modules/lodash/get.js
var require_get = __commonJS({
  "node_modules/lodash/get.js"(exports, module) {
    var baseGet = require_baseGet();
    function get(object, path, defaultValue) {
      var result = object == null ? void 0 : baseGet(object, path);
      return result === void 0 ? defaultValue : result;
    }
    module.exports = get;
  }
});

// node_modules/lodash/_baseHasIn.js
var require_baseHasIn = __commonJS({
  "node_modules/lodash/_baseHasIn.js"(exports, module) {
    function baseHasIn(object, key) {
      return object != null && key in Object(object);
    }
    module.exports = baseHasIn;
  }
});

// node_modules/lodash/_hasPath.js
var require_hasPath = __commonJS({
  "node_modules/lodash/_hasPath.js"(exports, module) {
    var castPath = require_castPath();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isIndex = require_isIndex();
    var isLength = require_isLength();
    var toKey = require_toKey();
    function hasPath(object, path, hasFunc) {
      path = castPath(path, object);
      var index = -1, length = path.length, result = false;
      while (++index < length) {
        var key = toKey(path[index]);
        if (!(result = object != null && hasFunc(object, key))) {
          break;
        }
        object = object[key];
      }
      if (result || ++index != length) {
        return result;
      }
      length = object == null ? 0 : object.length;
      return !!length && isLength(length) && isIndex(key, length) && (isArray(object) || isArguments(object));
    }
    module.exports = hasPath;
  }
});

// node_modules/lodash/hasIn.js
var require_hasIn = __commonJS({
  "node_modules/lodash/hasIn.js"(exports, module) {
    var baseHasIn = require_baseHasIn();
    var hasPath = require_hasPath();
    function hasIn(object, path) {
      return object != null && hasPath(object, path, baseHasIn);
    }
    module.exports = hasIn;
  }
});

// node_modules/lodash/_baseMatchesProperty.js
var require_baseMatchesProperty = __commonJS({
  "node_modules/lodash/_baseMatchesProperty.js"(exports, module) {
    var baseIsEqual = require_baseIsEqual();
    var get = require_get();
    var hasIn = require_hasIn();
    var isKey = require_isKey();
    var isStrictComparable = require_isStrictComparable();
    var matchesStrictComparable = require_matchesStrictComparable();
    var toKey = require_toKey();
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    function baseMatchesProperty(path, srcValue) {
      if (isKey(path) && isStrictComparable(srcValue)) {
        return matchesStrictComparable(toKey(path), srcValue);
      }
      return function(object) {
        var objValue = get(object, path);
        return objValue === void 0 && objValue === srcValue ? hasIn(object, path) : baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG);
      };
    }
    module.exports = baseMatchesProperty;
  }
});

// node_modules/lodash/_baseProperty.js
var require_baseProperty = __commonJS({
  "node_modules/lodash/_baseProperty.js"(exports, module) {
    function baseProperty(key) {
      return function(object) {
        return object == null ? void 0 : object[key];
      };
    }
    module.exports = baseProperty;
  }
});

// node_modules/lodash/_basePropertyDeep.js
var require_basePropertyDeep = __commonJS({
  "node_modules/lodash/_basePropertyDeep.js"(exports, module) {
    var baseGet = require_baseGet();
    function basePropertyDeep(path) {
      return function(object) {
        return baseGet(object, path);
      };
    }
    module.exports = basePropertyDeep;
  }
});

// node_modules/lodash/property.js
var require_property = __commonJS({
  "node_modules/lodash/property.js"(exports, module) {
    var baseProperty = require_baseProperty();
    var basePropertyDeep = require_basePropertyDeep();
    var isKey = require_isKey();
    var toKey = require_toKey();
    function property(path) {
      return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
    }
    module.exports = property;
  }
});

// node_modules/lodash/_baseIteratee.js
var require_baseIteratee = __commonJS({
  "node_modules/lodash/_baseIteratee.js"(exports, module) {
    var baseMatches = require_baseMatches();
    var baseMatchesProperty = require_baseMatchesProperty();
    var identity = require_identity();
    var isArray = require_isArray();
    var property = require_property();
    function baseIteratee(value) {
      if (typeof value == "function") {
        return value;
      }
      if (value == null) {
        return identity;
      }
      if (typeof value == "object") {
        return isArray(value) ? baseMatchesProperty(value[0], value[1]) : baseMatches(value);
      }
      return property(value);
    }
    module.exports = baseIteratee;
  }
});

// node_modules/lodash/filter.js
var require_filter = __commonJS({
  "node_modules/lodash/filter.js"(exports, module) {
    var arrayFilter = require_arrayFilter();
    var baseFilter = require_baseFilter();
    var baseIteratee = require_baseIteratee();
    var isArray = require_isArray();
    function filter(collection, predicate) {
      var func = isArray(collection) ? arrayFilter : baseFilter;
      return func(collection, baseIteratee(predicate, 3));
    }
    module.exports = filter;
  }
});

// node_modules/lodash/_baseHas.js
var require_baseHas = __commonJS({
  "node_modules/lodash/_baseHas.js"(exports, module) {
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function baseHas(object, key) {
      return object != null && hasOwnProperty.call(object, key);
    }
    module.exports = baseHas;
  }
});

// node_modules/lodash/has.js
var require_has = __commonJS({
  "node_modules/lodash/has.js"(exports, module) {
    var baseHas = require_baseHas();
    var hasPath = require_hasPath();
    function has(object, path) {
      return object != null && hasPath(object, path, baseHas);
    }
    module.exports = has;
  }
});

// node_modules/lodash/isEmpty.js
var require_isEmpty = __commonJS({
  "node_modules/lodash/isEmpty.js"(exports, module) {
    var baseKeys = require_baseKeys();
    var getTag = require_getTag();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isArrayLike = require_isArrayLike();
    var isBuffer = require_isBuffer();
    var isPrototype = require_isPrototype();
    var isTypedArray = require_isTypedArray();
    var mapTag = "[object Map]";
    var setTag = "[object Set]";
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    function isEmpty(value) {
      if (value == null) {
        return true;
      }
      if (isArrayLike(value) && (isArray(value) || typeof value == "string" || typeof value.splice == "function" || isBuffer(value) || isTypedArray(value) || isArguments(value))) {
        return !value.length;
      }
      var tag = getTag(value);
      if (tag == mapTag || tag == setTag) {
        return !value.size;
      }
      if (isPrototype(value)) {
        return !baseKeys(value).length;
      }
      for (var key in value) {
        if (hasOwnProperty.call(value, key)) {
          return false;
        }
      }
      return true;
    }
    module.exports = isEmpty;
  }
});

// node_modules/lodash/isUndefined.js
var require_isUndefined = __commonJS({
  "node_modules/lodash/isUndefined.js"(exports, module) {
    function isUndefined(value) {
      return value === void 0;
    }
    module.exports = isUndefined;
  }
});

// node_modules/lodash/_baseMap.js
var require_baseMap = __commonJS({
  "node_modules/lodash/_baseMap.js"(exports, module) {
    var baseEach = require_baseEach();
    var isArrayLike = require_isArrayLike();
    function baseMap(collection, iteratee) {
      var index = -1, result = isArrayLike(collection) ? Array(collection.length) : [];
      baseEach(collection, function(value, key, collection2) {
        result[++index] = iteratee(value, key, collection2);
      });
      return result;
    }
    module.exports = baseMap;
  }
});

// node_modules/lodash/map.js
var require_map = __commonJS({
  "node_modules/lodash/map.js"(exports, module) {
    var arrayMap = require_arrayMap();
    var baseIteratee = require_baseIteratee();
    var baseMap = require_baseMap();
    var isArray = require_isArray();
    function map(collection, iteratee) {
      var func = isArray(collection) ? arrayMap : baseMap;
      return func(collection, baseIteratee(iteratee, 3));
    }
    module.exports = map;
  }
});

// node_modules/lodash/_arrayReduce.js
var require_arrayReduce = __commonJS({
  "node_modules/lodash/_arrayReduce.js"(exports, module) {
    function arrayReduce(array, iteratee, accumulator, initAccum) {
      var index = -1, length = array == null ? 0 : array.length;
      if (initAccum && length) {
        accumulator = array[++index];
      }
      while (++index < length) {
        accumulator = iteratee(accumulator, array[index], index, array);
      }
      return accumulator;
    }
    module.exports = arrayReduce;
  }
});

// node_modules/lodash/_baseReduce.js
var require_baseReduce = __commonJS({
  "node_modules/lodash/_baseReduce.js"(exports, module) {
    function baseReduce(collection, iteratee, accumulator, initAccum, eachFunc) {
      eachFunc(collection, function(value, index, collection2) {
        accumulator = initAccum ? (initAccum = false, value) : iteratee(accumulator, value, index, collection2);
      });
      return accumulator;
    }
    module.exports = baseReduce;
  }
});

// node_modules/lodash/reduce.js
var require_reduce = __commonJS({
  "node_modules/lodash/reduce.js"(exports, module) {
    var arrayReduce = require_arrayReduce();
    var baseEach = require_baseEach();
    var baseIteratee = require_baseIteratee();
    var baseReduce = require_baseReduce();
    var isArray = require_isArray();
    function reduce(collection, iteratee, accumulator) {
      var func = isArray(collection) ? arrayReduce : baseReduce, initAccum = arguments.length < 3;
      return func(collection, baseIteratee(iteratee, 4), accumulator, initAccum, baseEach);
    }
    module.exports = reduce;
  }
});

// node_modules/lodash/isString.js
var require_isString = __commonJS({
  "node_modules/lodash/isString.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isArray = require_isArray();
    var isObjectLike = require_isObjectLike();
    var stringTag = "[object String]";
    function isString(value) {
      return typeof value == "string" || !isArray(value) && isObjectLike(value) && baseGetTag(value) == stringTag;
    }
    module.exports = isString;
  }
});

// node_modules/lodash/_asciiSize.js
var require_asciiSize = __commonJS({
  "node_modules/lodash/_asciiSize.js"(exports, module) {
    var baseProperty = require_baseProperty();
    var asciiSize = baseProperty("length");
    module.exports = asciiSize;
  }
});

// node_modules/lodash/_hasUnicode.js
var require_hasUnicode = __commonJS({
  "node_modules/lodash/_hasUnicode.js"(exports, module) {
    var rsAstralRange = "\\ud800-\\udfff";
    var rsComboMarksRange = "\\u0300-\\u036f";
    var reComboHalfMarksRange = "\\ufe20-\\ufe2f";
    var rsComboSymbolsRange = "\\u20d0-\\u20ff";
    var rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange;
    var rsVarRange = "\\ufe0e\\ufe0f";
    var rsZWJ = "\\u200d";
    var reHasUnicode = RegExp("[" + rsZWJ + rsAstralRange + rsComboRange + rsVarRange + "]");
    function hasUnicode(string) {
      return reHasUnicode.test(string);
    }
    module.exports = hasUnicode;
  }
});

// node_modules/lodash/_unicodeSize.js
var require_unicodeSize = __commonJS({
  "node_modules/lodash/_unicodeSize.js"(exports, module) {
    var rsAstralRange = "\\ud800-\\udfff";
    var rsComboMarksRange = "\\u0300-\\u036f";
    var reComboHalfMarksRange = "\\ufe20-\\ufe2f";
    var rsComboSymbolsRange = "\\u20d0-\\u20ff";
    var rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange;
    var rsVarRange = "\\ufe0e\\ufe0f";
    var rsAstral = "[" + rsAstralRange + "]";
    var rsCombo = "[" + rsComboRange + "]";
    var rsFitz = "\\ud83c[\\udffb-\\udfff]";
    var rsModifier = "(?:" + rsCombo + "|" + rsFitz + ")";
    var rsNonAstral = "[^" + rsAstralRange + "]";
    var rsRegional = "(?:\\ud83c[\\udde6-\\uddff]){2}";
    var rsSurrPair = "[\\ud800-\\udbff][\\udc00-\\udfff]";
    var rsZWJ = "\\u200d";
    var reOptMod = rsModifier + "?";
    var rsOptVar = "[" + rsVarRange + "]?";
    var rsOptJoin = "(?:" + rsZWJ + "(?:" + [rsNonAstral, rsRegional, rsSurrPair].join("|") + ")" + rsOptVar + reOptMod + ")*";
    var rsSeq = rsOptVar + reOptMod + rsOptJoin;
    var rsSymbol = "(?:" + [rsNonAstral + rsCombo + "?", rsCombo, rsRegional, rsSurrPair, rsAstral].join("|") + ")";
    var reUnicode = RegExp(rsFitz + "(?=" + rsFitz + ")|" + rsSymbol + rsSeq, "g");
    function unicodeSize(string) {
      var result = reUnicode.lastIndex = 0;
      while (reUnicode.test(string)) {
        ++result;
      }
      return result;
    }
    module.exports = unicodeSize;
  }
});

// node_modules/lodash/_stringSize.js
var require_stringSize = __commonJS({
  "node_modules/lodash/_stringSize.js"(exports, module) {
    var asciiSize = require_asciiSize();
    var hasUnicode = require_hasUnicode();
    var unicodeSize = require_unicodeSize();
    function stringSize(string) {
      return hasUnicode(string) ? unicodeSize(string) : asciiSize(string);
    }
    module.exports = stringSize;
  }
});

// node_modules/lodash/size.js
var require_size = __commonJS({
  "node_modules/lodash/size.js"(exports, module) {
    var baseKeys = require_baseKeys();
    var getTag = require_getTag();
    var isArrayLike = require_isArrayLike();
    var isString = require_isString();
    var stringSize = require_stringSize();
    var mapTag = "[object Map]";
    var setTag = "[object Set]";
    function size(collection) {
      if (collection == null) {
        return 0;
      }
      if (isArrayLike(collection)) {
        return isString(collection) ? stringSize(collection) : collection.length;
      }
      var tag = getTag(collection);
      if (tag == mapTag || tag == setTag) {
        return collection.size;
      }
      return baseKeys(collection).length;
    }
    module.exports = size;
  }
});

// node_modules/lodash/transform.js
var require_transform = __commonJS({
  "node_modules/lodash/transform.js"(exports, module) {
    var arrayEach = require_arrayEach();
    var baseCreate = require_baseCreate();
    var baseForOwn = require_baseForOwn();
    var baseIteratee = require_baseIteratee();
    var getPrototype = require_getPrototype();
    var isArray = require_isArray();
    var isBuffer = require_isBuffer();
    var isFunction = require_isFunction();
    var isObject = require_isObject();
    var isTypedArray = require_isTypedArray();
    function transform(object, iteratee, accumulator) {
      var isArr = isArray(object), isArrLike = isArr || isBuffer(object) || isTypedArray(object);
      iteratee = baseIteratee(iteratee, 4);
      if (accumulator == null) {
        var Ctor = object && object.constructor;
        if (isArrLike) {
          accumulator = isArr ? new Ctor() : [];
        } else if (isObject(object)) {
          accumulator = isFunction(Ctor) ? baseCreate(getPrototype(object)) : {};
        } else {
          accumulator = {};
        }
      }
      (isArrLike ? arrayEach : baseForOwn)(object, function(value, index, object2) {
        return iteratee(accumulator, value, index, object2);
      });
      return accumulator;
    }
    module.exports = transform;
  }
});

// node_modules/lodash/_isFlattenable.js
var require_isFlattenable = __commonJS({
  "node_modules/lodash/_isFlattenable.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var spreadableSymbol = Symbol2 ? Symbol2.isConcatSpreadable : void 0;
    function isFlattenable(value) {
      return isArray(value) || isArguments(value) || !!(spreadableSymbol && value && value[spreadableSymbol]);
    }
    module.exports = isFlattenable;
  }
});

// node_modules/lodash/_baseFlatten.js
var require_baseFlatten = __commonJS({
  "node_modules/lodash/_baseFlatten.js"(exports, module) {
    var arrayPush = require_arrayPush();
    var isFlattenable = require_isFlattenable();
    function baseFlatten(array, depth, predicate, isStrict, result) {
      var index = -1, length = array.length;
      predicate || (predicate = isFlattenable);
      result || (result = []);
      while (++index < length) {
        var value = array[index];
        if (depth > 0 && predicate(value)) {
          if (depth > 1) {
            baseFlatten(value, depth - 1, predicate, isStrict, result);
          } else {
            arrayPush(result, value);
          }
        } else if (!isStrict) {
          result[result.length] = value;
        }
      }
      return result;
    }
    module.exports = baseFlatten;
  }
});

// node_modules/lodash/_apply.js
var require_apply = __commonJS({
  "node_modules/lodash/_apply.js"(exports, module) {
    function apply(func, thisArg, args) {
      switch (args.length) {
        case 0:
          return func.call(thisArg);
        case 1:
          return func.call(thisArg, args[0]);
        case 2:
          return func.call(thisArg, args[0], args[1]);
        case 3:
          return func.call(thisArg, args[0], args[1], args[2]);
      }
      return func.apply(thisArg, args);
    }
    module.exports = apply;
  }
});

// node_modules/lodash/_overRest.js
var require_overRest = __commonJS({
  "node_modules/lodash/_overRest.js"(exports, module) {
    var apply = require_apply();
    var nativeMax = Math.max;
    function overRest(func, start, transform) {
      start = nativeMax(start === void 0 ? func.length - 1 : start, 0);
      return function() {
        var args = arguments, index = -1, length = nativeMax(args.length - start, 0), array = Array(length);
        while (++index < length) {
          array[index] = args[start + index];
        }
        index = -1;
        var otherArgs = Array(start + 1);
        while (++index < start) {
          otherArgs[index] = args[index];
        }
        otherArgs[start] = transform(array);
        return apply(func, this, otherArgs);
      };
    }
    module.exports = overRest;
  }
});

// node_modules/lodash/_baseSetToString.js
var require_baseSetToString = __commonJS({
  "node_modules/lodash/_baseSetToString.js"(exports, module) {
    var constant = require_constant();
    var defineProperty = require_defineProperty();
    var identity = require_identity();
    var baseSetToString = !defineProperty ? identity : function(func, string) {
      return defineProperty(func, "toString", {
        "configurable": true,
        "enumerable": false,
        "value": constant(string),
        "writable": true
      });
    };
    module.exports = baseSetToString;
  }
});

// node_modules/lodash/_shortOut.js
var require_shortOut = __commonJS({
  "node_modules/lodash/_shortOut.js"(exports, module) {
    var HOT_COUNT = 800;
    var HOT_SPAN = 16;
    var nativeNow = Date.now;
    function shortOut(func) {
      var count = 0, lastCalled = 0;
      return function() {
        var stamp = nativeNow(), remaining = HOT_SPAN - (stamp - lastCalled);
        lastCalled = stamp;
        if (remaining > 0) {
          if (++count >= HOT_COUNT) {
            return arguments[0];
          }
        } else {
          count = 0;
        }
        return func.apply(void 0, arguments);
      };
    }
    module.exports = shortOut;
  }
});

// node_modules/lodash/_setToString.js
var require_setToString = __commonJS({
  "node_modules/lodash/_setToString.js"(exports, module) {
    var baseSetToString = require_baseSetToString();
    var shortOut = require_shortOut();
    var setToString = shortOut(baseSetToString);
    module.exports = setToString;
  }
});

// node_modules/lodash/_baseRest.js
var require_baseRest = __commonJS({
  "node_modules/lodash/_baseRest.js"(exports, module) {
    var identity = require_identity();
    var overRest = require_overRest();
    var setToString = require_setToString();
    function baseRest(func, start) {
      return setToString(overRest(func, start, identity), func + "");
    }
    module.exports = baseRest;
  }
});

// node_modules/lodash/_baseFindIndex.js
var require_baseFindIndex = __commonJS({
  "node_modules/lodash/_baseFindIndex.js"(exports, module) {
    function baseFindIndex(array, predicate, fromIndex, fromRight) {
      var length = array.length, index = fromIndex + (fromRight ? 1 : -1);
      while (fromRight ? index-- : ++index < length) {
        if (predicate(array[index], index, array)) {
          return index;
        }
      }
      return -1;
    }
    module.exports = baseFindIndex;
  }
});

// node_modules/lodash/_baseIsNaN.js
var require_baseIsNaN = __commonJS({
  "node_modules/lodash/_baseIsNaN.js"(exports, module) {
    function baseIsNaN(value) {
      return value !== value;
    }
    module.exports = baseIsNaN;
  }
});

// node_modules/lodash/_strictIndexOf.js
var require_strictIndexOf = __commonJS({
  "node_modules/lodash/_strictIndexOf.js"(exports, module) {
    function strictIndexOf(array, value, fromIndex) {
      var index = fromIndex - 1, length = array.length;
      while (++index < length) {
        if (array[index] === value) {
          return index;
        }
      }
      return -1;
    }
    module.exports = strictIndexOf;
  }
});

// node_modules/lodash/_baseIndexOf.js
var require_baseIndexOf = __commonJS({
  "node_modules/lodash/_baseIndexOf.js"(exports, module) {
    var baseFindIndex = require_baseFindIndex();
    var baseIsNaN = require_baseIsNaN();
    var strictIndexOf = require_strictIndexOf();
    function baseIndexOf(array, value, fromIndex) {
      return value === value ? strictIndexOf(array, value, fromIndex) : baseFindIndex(array, baseIsNaN, fromIndex);
    }
    module.exports = baseIndexOf;
  }
});

// node_modules/lodash/_arrayIncludes.js
var require_arrayIncludes = __commonJS({
  "node_modules/lodash/_arrayIncludes.js"(exports, module) {
    var baseIndexOf = require_baseIndexOf();
    function arrayIncludes(array, value) {
      var length = array == null ? 0 : array.length;
      return !!length && baseIndexOf(array, value, 0) > -1;
    }
    module.exports = arrayIncludes;
  }
});

// node_modules/lodash/_arrayIncludesWith.js
var require_arrayIncludesWith = __commonJS({
  "node_modules/lodash/_arrayIncludesWith.js"(exports, module) {
    function arrayIncludesWith(array, value, comparator) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (comparator(value, array[index])) {
          return true;
        }
      }
      return false;
    }
    module.exports = arrayIncludesWith;
  }
});

// node_modules/lodash/noop.js
var require_noop = __commonJS({
  "node_modules/lodash/noop.js"(exports, module) {
    function noop() {
    }
    module.exports = noop;
  }
});

// node_modules/lodash/_createSet.js
var require_createSet = __commonJS({
  "node_modules/lodash/_createSet.js"(exports, module) {
    var Set2 = require_Set();
    var noop = require_noop();
    var setToArray = require_setToArray();
    var INFINITY = 1 / 0;
    var createSet = !(Set2 && 1 / setToArray(new Set2([, -0]))[1] == INFINITY) ? noop : function(values) {
      return new Set2(values);
    };
    module.exports = createSet;
  }
});

// node_modules/lodash/_baseUniq.js
var require_baseUniq = __commonJS({
  "node_modules/lodash/_baseUniq.js"(exports, module) {
    var SetCache = require_SetCache();
    var arrayIncludes = require_arrayIncludes();
    var arrayIncludesWith = require_arrayIncludesWith();
    var cacheHas = require_cacheHas();
    var createSet = require_createSet();
    var setToArray = require_setToArray();
    var LARGE_ARRAY_SIZE = 200;
    function baseUniq(array, iteratee, comparator) {
      var index = -1, includes = arrayIncludes, length = array.length, isCommon = true, result = [], seen = result;
      if (comparator) {
        isCommon = false;
        includes = arrayIncludesWith;
      } else if (length >= LARGE_ARRAY_SIZE) {
        var set = iteratee ? null : createSet(array);
        if (set) {
          return setToArray(set);
        }
        isCommon = false;
        includes = cacheHas;
        seen = new SetCache();
      } else {
        seen = iteratee ? [] : result;
      }
      outer:
        while (++index < length) {
          var value = array[index], computed = iteratee ? iteratee(value) : value;
          value = comparator || value !== 0 ? value : 0;
          if (isCommon && computed === computed) {
            var seenIndex = seen.length;
            while (seenIndex--) {
              if (seen[seenIndex] === computed) {
                continue outer;
              }
            }
            if (iteratee) {
              seen.push(computed);
            }
            result.push(value);
          } else if (!includes(seen, computed, comparator)) {
            if (seen !== result) {
              seen.push(computed);
            }
            result.push(value);
          }
        }
      return result;
    }
    module.exports = baseUniq;
  }
});

// node_modules/lodash/isArrayLikeObject.js
var require_isArrayLikeObject = __commonJS({
  "node_modules/lodash/isArrayLikeObject.js"(exports, module) {
    var isArrayLike = require_isArrayLike();
    var isObjectLike = require_isObjectLike();
    function isArrayLikeObject(value) {
      return isObjectLike(value) && isArrayLike(value);
    }
    module.exports = isArrayLikeObject;
  }
});

// node_modules/lodash/union.js
var require_union = __commonJS({
  "node_modules/lodash/union.js"(exports, module) {
    var baseFlatten = require_baseFlatten();
    var baseRest = require_baseRest();
    var baseUniq = require_baseUniq();
    var isArrayLikeObject = require_isArrayLikeObject();
    var union = baseRest(function(arrays) {
      return baseUniq(baseFlatten(arrays, 1, isArrayLikeObject, true));
    });
    module.exports = union;
  }
});

// node_modules/lodash/_baseValues.js
var require_baseValues = __commonJS({
  "node_modules/lodash/_baseValues.js"(exports, module) {
    var arrayMap = require_arrayMap();
    function baseValues(object, props) {
      return arrayMap(props, function(key) {
        return object[key];
      });
    }
    module.exports = baseValues;
  }
});

// node_modules/lodash/values.js
var require_values = __commonJS({
  "node_modules/lodash/values.js"(exports, module) {
    var baseValues = require_baseValues();
    var keys = require_keys();
    function values(object) {
      return object == null ? [] : baseValues(object, keys(object));
    }
    module.exports = values;
  }
});

// node_modules/graphlib/lib/lodash.js
var require_lodash = __commonJS({
  "node_modules/graphlib/lib/lodash.js"(exports, module) {
    var lodash;
    if (typeof __require === "function") {
      try {
        lodash = {
          clone: require_clone(),
          constant: require_constant(),
          each: require_each(),
          filter: require_filter(),
          has: require_has(),
          isArray: require_isArray(),
          isEmpty: require_isEmpty(),
          isFunction: require_isFunction(),
          isUndefined: require_isUndefined(),
          keys: require_keys(),
          map: require_map(),
          reduce: require_reduce(),
          size: require_size(),
          transform: require_transform(),
          union: require_union(),
          values: require_values()
        };
      } catch (e) {
      }
    }
    if (!lodash) {
      lodash = window._;
    }
    module.exports = lodash;
  }
});

// node_modules/graphlib/lib/graph.js
var require_graph = __commonJS({
  "node_modules/graphlib/lib/graph.js"(exports, module) {
    "use strict";
    var _ = require_lodash();
    module.exports = Graph;
    var DEFAULT_EDGE_NAME = "\0";
    var GRAPH_NODE = "\0";
    var EDGE_KEY_DELIM = "";
    function Graph(opts) {
      this._isDirected = _.has(opts, "directed") ? opts.directed : true;
      this._isMultigraph = _.has(opts, "multigraph") ? opts.multigraph : false;
      this._isCompound = _.has(opts, "compound") ? opts.compound : false;
      this._label = void 0;
      this._defaultNodeLabelFn = _.constant(void 0);
      this._defaultEdgeLabelFn = _.constant(void 0);
      this._nodes = {};
      if (this._isCompound) {
        this._parent = {};
        this._children = {};
        this._children[GRAPH_NODE] = {};
      }
      this._in = {};
      this._preds = {};
      this._out = {};
      this._sucs = {};
      this._edgeObjs = {};
      this._edgeLabels = {};
    }
    Graph.prototype._nodeCount = 0;
    Graph.prototype._edgeCount = 0;
    Graph.prototype.isDirected = function() {
      return this._isDirected;
    };
    Graph.prototype.isMultigraph = function() {
      return this._isMultigraph;
    };
    Graph.prototype.isCompound = function() {
      return this._isCompound;
    };
    Graph.prototype.setGraph = function(label) {
      this._label = label;
      return this;
    };
    Graph.prototype.graph = function() {
      return this._label;
    };
    Graph.prototype.setDefaultNodeLabel = function(newDefault) {
      if (!_.isFunction(newDefault)) {
        newDefault = _.constant(newDefault);
      }
      this._defaultNodeLabelFn = newDefault;
      return this;
    };
    Graph.prototype.nodeCount = function() {
      return this._nodeCount;
    };
    Graph.prototype.nodes = function() {
      return _.keys(this._nodes);
    };
    Graph.prototype.sources = function() {
      var self2 = this;
      return _.filter(this.nodes(), function(v) {
        return _.isEmpty(self2._in[v]);
      });
    };
    Graph.prototype.sinks = function() {
      var self2 = this;
      return _.filter(this.nodes(), function(v) {
        return _.isEmpty(self2._out[v]);
      });
    };
    Graph.prototype.setNodes = function(vs, value) {
      var args = arguments;
      var self2 = this;
      _.each(vs, function(v) {
        if (args.length > 1) {
          self2.setNode(v, value);
        } else {
          self2.setNode(v);
        }
      });
      return this;
    };
    Graph.prototype.setNode = function(v, value) {
      if (_.has(this._nodes, v)) {
        if (arguments.length > 1) {
          this._nodes[v] = value;
        }
        return this;
      }
      this._nodes[v] = arguments.length > 1 ? value : this._defaultNodeLabelFn(v);
      if (this._isCompound) {
        this._parent[v] = GRAPH_NODE;
        this._children[v] = {};
        this._children[GRAPH_NODE][v] = true;
      }
      this._in[v] = {};
      this._preds[v] = {};
      this._out[v] = {};
      this._sucs[v] = {};
      ++this._nodeCount;
      return this;
    };
    Graph.prototype.node = function(v) {
      return this._nodes[v];
    };
    Graph.prototype.hasNode = function(v) {
      return _.has(this._nodes, v);
    };
    Graph.prototype.removeNode = function(v) {
      var self2 = this;
      if (_.has(this._nodes, v)) {
        var removeEdge = function(e) {
          self2.removeEdge(self2._edgeObjs[e]);
        };
        delete this._nodes[v];
        if (this._isCompound) {
          this._removeFromParentsChildList(v);
          delete this._parent[v];
          _.each(this.children(v), function(child) {
            self2.setParent(child);
          });
          delete this._children[v];
        }
        _.each(_.keys(this._in[v]), removeEdge);
        delete this._in[v];
        delete this._preds[v];
        _.each(_.keys(this._out[v]), removeEdge);
        delete this._out[v];
        delete this._sucs[v];
        --this._nodeCount;
      }
      return this;
    };
    Graph.prototype.setParent = function(v, parent) {
      if (!this._isCompound) {
        throw new Error("Cannot set parent in a non-compound graph");
      }
      if (_.isUndefined(parent)) {
        parent = GRAPH_NODE;
      } else {
        parent += "";
        for (var ancestor = parent; !_.isUndefined(ancestor); ancestor = this.parent(ancestor)) {
          if (ancestor === v) {
            throw new Error("Setting " + parent + " as parent of " + v + " would create a cycle");
          }
        }
        this.setNode(parent);
      }
      this.setNode(v);
      this._removeFromParentsChildList(v);
      this._parent[v] = parent;
      this._children[parent][v] = true;
      return this;
    };
    Graph.prototype._removeFromParentsChildList = function(v) {
      delete this._children[this._parent[v]][v];
    };
    Graph.prototype.parent = function(v) {
      if (this._isCompound) {
        var parent = this._parent[v];
        if (parent !== GRAPH_NODE) {
          return parent;
        }
      }
    };
    Graph.prototype.children = function(v) {
      if (_.isUndefined(v)) {
        v = GRAPH_NODE;
      }
      if (this._isCompound) {
        var children = this._children[v];
        if (children) {
          return _.keys(children);
        }
      } else if (v === GRAPH_NODE) {
        return this.nodes();
      } else if (this.hasNode(v)) {
        return [];
      }
    };
    Graph.prototype.predecessors = function(v) {
      var predsV = this._preds[v];
      if (predsV) {
        return _.keys(predsV);
      }
    };
    Graph.prototype.successors = function(v) {
      var sucsV = this._sucs[v];
      if (sucsV) {
        return _.keys(sucsV);
      }
    };
    Graph.prototype.neighbors = function(v) {
      var preds = this.predecessors(v);
      if (preds) {
        return _.union(preds, this.successors(v));
      }
    };
    Graph.prototype.isLeaf = function(v) {
      var neighbors;
      if (this.isDirected()) {
        neighbors = this.successors(v);
      } else {
        neighbors = this.neighbors(v);
      }
      return neighbors.length === 0;
    };
    Graph.prototype.filterNodes = function(filter) {
      var copy = new this.constructor({
        directed: this._isDirected,
        multigraph: this._isMultigraph,
        compound: this._isCompound
      });
      copy.setGraph(this.graph());
      var self2 = this;
      _.each(this._nodes, function(value, v) {
        if (filter(v)) {
          copy.setNode(v, value);
        }
      });
      _.each(this._edgeObjs, function(e) {
        if (copy.hasNode(e.v) && copy.hasNode(e.w)) {
          copy.setEdge(e, self2.edge(e));
        }
      });
      var parents = {};
      function findParent(v) {
        var parent = self2.parent(v);
        if (parent === void 0 || copy.hasNode(parent)) {
          parents[v] = parent;
          return parent;
        } else if (parent in parents) {
          return parents[parent];
        } else {
          return findParent(parent);
        }
      }
      if (this._isCompound) {
        _.each(copy.nodes(), function(v) {
          copy.setParent(v, findParent(v));
        });
      }
      return copy;
    };
    Graph.prototype.setDefaultEdgeLabel = function(newDefault) {
      if (!_.isFunction(newDefault)) {
        newDefault = _.constant(newDefault);
      }
      this._defaultEdgeLabelFn = newDefault;
      return this;
    };
    Graph.prototype.edgeCount = function() {
      return this._edgeCount;
    };
    Graph.prototype.edges = function() {
      return _.values(this._edgeObjs);
    };
    Graph.prototype.setPath = function(vs, value) {
      var self2 = this;
      var args = arguments;
      _.reduce(vs, function(v, w) {
        if (args.length > 1) {
          self2.setEdge(v, w, value);
        } else {
          self2.setEdge(v, w);
        }
        return w;
      });
      return this;
    };
    Graph.prototype.setEdge = function() {
      var v, w, name, value;
      var valueSpecified = false;
      var arg0 = arguments[0];
      if (typeof arg0 === "object" && arg0 !== null && "v" in arg0) {
        v = arg0.v;
        w = arg0.w;
        name = arg0.name;
        if (arguments.length === 2) {
          value = arguments[1];
          valueSpecified = true;
        }
      } else {
        v = arg0;
        w = arguments[1];
        name = arguments[3];
        if (arguments.length > 2) {
          value = arguments[2];
          valueSpecified = true;
        }
      }
      v = "" + v;
      w = "" + w;
      if (!_.isUndefined(name)) {
        name = "" + name;
      }
      var e = edgeArgsToId(this._isDirected, v, w, name);
      if (_.has(this._edgeLabels, e)) {
        if (valueSpecified) {
          this._edgeLabels[e] = value;
        }
        return this;
      }
      if (!_.isUndefined(name) && !this._isMultigraph) {
        throw new Error("Cannot set a named edge when isMultigraph = false");
      }
      this.setNode(v);
      this.setNode(w);
      this._edgeLabels[e] = valueSpecified ? value : this._defaultEdgeLabelFn(v, w, name);
      var edgeObj = edgeArgsToObj(this._isDirected, v, w, name);
      v = edgeObj.v;
      w = edgeObj.w;
      Object.freeze(edgeObj);
      this._edgeObjs[e] = edgeObj;
      incrementOrInitEntry(this._preds[w], v);
      incrementOrInitEntry(this._sucs[v], w);
      this._in[w][e] = edgeObj;
      this._out[v][e] = edgeObj;
      this._edgeCount++;
      return this;
    };
    Graph.prototype.edge = function(v, w, name) {
      var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
      return this._edgeLabels[e];
    };
    Graph.prototype.hasEdge = function(v, w, name) {
      var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
      return _.has(this._edgeLabels, e);
    };
    Graph.prototype.removeEdge = function(v, w, name) {
      var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
      var edge = this._edgeObjs[e];
      if (edge) {
        v = edge.v;
        w = edge.w;
        delete this._edgeLabels[e];
        delete this._edgeObjs[e];
        decrementOrRemoveEntry(this._preds[w], v);
        decrementOrRemoveEntry(this._sucs[v], w);
        delete this._in[w][e];
        delete this._out[v][e];
        this._edgeCount--;
      }
      return this;
    };
    Graph.prototype.inEdges = function(v, u) {
      var inV = this._in[v];
      if (inV) {
        var edges = _.values(inV);
        if (!u) {
          return edges;
        }
        return _.filter(edges, function(edge) {
          return edge.v === u;
        });
      }
    };
    Graph.prototype.outEdges = function(v, w) {
      var outV = this._out[v];
      if (outV) {
        var edges = _.values(outV);
        if (!w) {
          return edges;
        }
        return _.filter(edges, function(edge) {
          return edge.w === w;
        });
      }
    };
    Graph.prototype.nodeEdges = function(v, w) {
      var inEdges = this.inEdges(v, w);
      if (inEdges) {
        return inEdges.concat(this.outEdges(v, w));
      }
    };
    function incrementOrInitEntry(map, k) {
      if (map[k]) {
        map[k]++;
      } else {
        map[k] = 1;
      }
    }
    function decrementOrRemoveEntry(map, k) {
      if (!--map[k]) {
        delete map[k];
      }
    }
    function edgeArgsToId(isDirected, v_, w_, name) {
      var v = "" + v_;
      var w = "" + w_;
      if (!isDirected && v > w) {
        var tmp = v;
        v = w;
        w = tmp;
      }
      return v + EDGE_KEY_DELIM + w + EDGE_KEY_DELIM + (_.isUndefined(name) ? DEFAULT_EDGE_NAME : name);
    }
    function edgeArgsToObj(isDirected, v_, w_, name) {
      var v = "" + v_;
      var w = "" + w_;
      if (!isDirected && v > w) {
        var tmp = v;
        v = w;
        w = tmp;
      }
      var edgeObj = { v, w };
      if (name) {
        edgeObj.name = name;
      }
      return edgeObj;
    }
    function edgeObjToId(isDirected, edgeObj) {
      return edgeArgsToId(isDirected, edgeObj.v, edgeObj.w, edgeObj.name);
    }
  }
});

// node_modules/graphlib/lib/version.js
var require_version = __commonJS({
  "node_modules/graphlib/lib/version.js"(exports, module) {
    module.exports = "2.1.8";
  }
});

// node_modules/graphlib/lib/index.js
var require_lib = __commonJS({
  "node_modules/graphlib/lib/index.js"(exports, module) {
    module.exports = {
      Graph: require_graph(),
      version: require_version()
    };
  }
});

// node_modules/graphlib/lib/json.js
var require_json = __commonJS({
  "node_modules/graphlib/lib/json.js"(exports, module) {
    var _ = require_lodash();
    var Graph = require_graph();
    module.exports = {
      write,
      read
    };
    function write(g) {
      var json = {
        options: {
          directed: g.isDirected(),
          multigraph: g.isMultigraph(),
          compound: g.isCompound()
        },
        nodes: writeNodes(g),
        edges: writeEdges(g)
      };
      if (!_.isUndefined(g.graph())) {
        json.value = _.clone(g.graph());
      }
      return json;
    }
    function writeNodes(g) {
      return _.map(g.nodes(), function(v) {
        var nodeValue = g.node(v);
        var parent = g.parent(v);
        var node = { v };
        if (!_.isUndefined(nodeValue)) {
          node.value = nodeValue;
        }
        if (!_.isUndefined(parent)) {
          node.parent = parent;
        }
        return node;
      });
    }
    function writeEdges(g) {
      return _.map(g.edges(), function(e) {
        var edgeValue = g.edge(e);
        var edge = { v: e.v, w: e.w };
        if (!_.isUndefined(e.name)) {
          edge.name = e.name;
        }
        if (!_.isUndefined(edgeValue)) {
          edge.value = edgeValue;
        }
        return edge;
      });
    }
    function read(json) {
      var g = new Graph(json.options).setGraph(json.value);
      _.each(json.nodes, function(entry) {
        g.setNode(entry.v, entry.value);
        if (entry.parent) {
          g.setParent(entry.v, entry.parent);
        }
      });
      _.each(json.edges, function(entry) {
        g.setEdge({ v: entry.v, w: entry.w, name: entry.name }, entry.value);
      });
      return g;
    }
  }
});

// node_modules/graphlib/lib/alg/components.js
var require_components = __commonJS({
  "node_modules/graphlib/lib/alg/components.js"(exports, module) {
    var _ = require_lodash();
    module.exports = components;
    function components(g) {
      var visited = {};
      var cmpts = [];
      var cmpt;
      function dfs(v) {
        if (_.has(visited, v)) return;
        visited[v] = true;
        cmpt.push(v);
        _.each(g.successors(v), dfs);
        _.each(g.predecessors(v), dfs);
      }
      _.each(g.nodes(), function(v) {
        cmpt = [];
        dfs(v);
        if (cmpt.length) {
          cmpts.push(cmpt);
        }
      });
      return cmpts;
    }
  }
});

// node_modules/graphlib/lib/data/priority-queue.js
var require_priority_queue = __commonJS({
  "node_modules/graphlib/lib/data/priority-queue.js"(exports, module) {
    var _ = require_lodash();
    module.exports = PriorityQueue;
    function PriorityQueue() {
      this._arr = [];
      this._keyIndices = {};
    }
    PriorityQueue.prototype.size = function() {
      return this._arr.length;
    };
    PriorityQueue.prototype.keys = function() {
      return this._arr.map(function(x) {
        return x.key;
      });
    };
    PriorityQueue.prototype.has = function(key) {
      return _.has(this._keyIndices, key);
    };
    PriorityQueue.prototype.priority = function(key) {
      var index = this._keyIndices[key];
      if (index !== void 0) {
        return this._arr[index].priority;
      }
    };
    PriorityQueue.prototype.min = function() {
      if (this.size() === 0) {
        throw new Error("Queue underflow");
      }
      return this._arr[0].key;
    };
    PriorityQueue.prototype.add = function(key, priority) {
      var keyIndices = this._keyIndices;
      key = String(key);
      if (!_.has(keyIndices, key)) {
        var arr = this._arr;
        var index = arr.length;
        keyIndices[key] = index;
        arr.push({ key, priority });
        this._decrease(index);
        return true;
      }
      return false;
    };
    PriorityQueue.prototype.removeMin = function() {
      this._swap(0, this._arr.length - 1);
      var min = this._arr.pop();
      delete this._keyIndices[min.key];
      this._heapify(0);
      return min.key;
    };
    PriorityQueue.prototype.decrease = function(key, priority) {
      var index = this._keyIndices[key];
      if (priority > this._arr[index].priority) {
        throw new Error("New priority is greater than current priority. Key: " + key + " Old: " + this._arr[index].priority + " New: " + priority);
      }
      this._arr[index].priority = priority;
      this._decrease(index);
    };
    PriorityQueue.prototype._heapify = function(i) {
      var arr = this._arr;
      var l = 2 * i;
      var r = l + 1;
      var largest = i;
      if (l < arr.length) {
        largest = arr[l].priority < arr[largest].priority ? l : largest;
        if (r < arr.length) {
          largest = arr[r].priority < arr[largest].priority ? r : largest;
        }
        if (largest !== i) {
          this._swap(i, largest);
          this._heapify(largest);
        }
      }
    };
    PriorityQueue.prototype._decrease = function(index) {
      var arr = this._arr;
      var priority = arr[index].priority;
      var parent;
      while (index !== 0) {
        parent = index >> 1;
        if (arr[parent].priority < priority) {
          break;
        }
        this._swap(index, parent);
        index = parent;
      }
    };
    PriorityQueue.prototype._swap = function(i, j) {
      var arr = this._arr;
      var keyIndices = this._keyIndices;
      var origArrI = arr[i];
      var origArrJ = arr[j];
      arr[i] = origArrJ;
      arr[j] = origArrI;
      keyIndices[origArrJ.key] = i;
      keyIndices[origArrI.key] = j;
    };
  }
});

// node_modules/graphlib/lib/alg/dijkstra.js
var require_dijkstra = __commonJS({
  "node_modules/graphlib/lib/alg/dijkstra.js"(exports, module) {
    var _ = require_lodash();
    var PriorityQueue = require_priority_queue();
    module.exports = dijkstra;
    var DEFAULT_WEIGHT_FUNC = _.constant(1);
    function dijkstra(g, source, weightFn, edgeFn) {
      return runDijkstra(
        g,
        String(source),
        weightFn || DEFAULT_WEIGHT_FUNC,
        edgeFn || function(v) {
          return g.outEdges(v);
        }
      );
    }
    function runDijkstra(g, source, weightFn, edgeFn) {
      var results = {};
      var pq = new PriorityQueue();
      var v, vEntry;
      var updateNeighbors = function(edge) {
        var w = edge.v !== v ? edge.v : edge.w;
        var wEntry = results[w];
        var weight = weightFn(edge);
        var distance = vEntry.distance + weight;
        if (weight < 0) {
          throw new Error("dijkstra does not allow negative edge weights. Bad edge: " + edge + " Weight: " + weight);
        }
        if (distance < wEntry.distance) {
          wEntry.distance = distance;
          wEntry.predecessor = v;
          pq.decrease(w, distance);
        }
      };
      g.nodes().forEach(function(v2) {
        var distance = v2 === source ? 0 : Number.POSITIVE_INFINITY;
        results[v2] = { distance };
        pq.add(v2, distance);
      });
      while (pq.size() > 0) {
        v = pq.removeMin();
        vEntry = results[v];
        if (vEntry.distance === Number.POSITIVE_INFINITY) {
          break;
        }
        edgeFn(v).forEach(updateNeighbors);
      }
      return results;
    }
  }
});

// node_modules/graphlib/lib/alg/dijkstra-all.js
var require_dijkstra_all = __commonJS({
  "node_modules/graphlib/lib/alg/dijkstra-all.js"(exports, module) {
    var dijkstra = require_dijkstra();
    var _ = require_lodash();
    module.exports = dijkstraAll;
    function dijkstraAll(g, weightFunc, edgeFunc) {
      return _.transform(g.nodes(), function(acc, v) {
        acc[v] = dijkstra(g, v, weightFunc, edgeFunc);
      }, {});
    }
  }
});

// node_modules/graphlib/lib/alg/tarjan.js
var require_tarjan = __commonJS({
  "node_modules/graphlib/lib/alg/tarjan.js"(exports, module) {
    var _ = require_lodash();
    module.exports = tarjan;
    function tarjan(g) {
      var index = 0;
      var stack = [];
      var visited = {};
      var results = [];
      function dfs(v) {
        var entry = visited[v] = {
          onStack: true,
          lowlink: index,
          index: index++
        };
        stack.push(v);
        g.successors(v).forEach(function(w2) {
          if (!_.has(visited, w2)) {
            dfs(w2);
            entry.lowlink = Math.min(entry.lowlink, visited[w2].lowlink);
          } else if (visited[w2].onStack) {
            entry.lowlink = Math.min(entry.lowlink, visited[w2].index);
          }
        });
        if (entry.lowlink === entry.index) {
          var cmpt = [];
          var w;
          do {
            w = stack.pop();
            visited[w].onStack = false;
            cmpt.push(w);
          } while (v !== w);
          results.push(cmpt);
        }
      }
      g.nodes().forEach(function(v) {
        if (!_.has(visited, v)) {
          dfs(v);
        }
      });
      return results;
    }
  }
});

// node_modules/graphlib/lib/alg/find-cycles.js
var require_find_cycles = __commonJS({
  "node_modules/graphlib/lib/alg/find-cycles.js"(exports, module) {
    var _ = require_lodash();
    var tarjan = require_tarjan();
    module.exports = findCycles;
    function findCycles(g) {
      return _.filter(tarjan(g), function(cmpt) {
        return cmpt.length > 1 || cmpt.length === 1 && g.hasEdge(cmpt[0], cmpt[0]);
      });
    }
  }
});

// node_modules/graphlib/lib/alg/floyd-warshall.js
var require_floyd_warshall = __commonJS({
  "node_modules/graphlib/lib/alg/floyd-warshall.js"(exports, module) {
    var _ = require_lodash();
    module.exports = floydWarshall;
    var DEFAULT_WEIGHT_FUNC = _.constant(1);
    function floydWarshall(g, weightFn, edgeFn) {
      return runFloydWarshall(
        g,
        weightFn || DEFAULT_WEIGHT_FUNC,
        edgeFn || function(v) {
          return g.outEdges(v);
        }
      );
    }
    function runFloydWarshall(g, weightFn, edgeFn) {
      var results = {};
      var nodes = g.nodes();
      nodes.forEach(function(v) {
        results[v] = {};
        results[v][v] = { distance: 0 };
        nodes.forEach(function(w) {
          if (v !== w) {
            results[v][w] = { distance: Number.POSITIVE_INFINITY };
          }
        });
        edgeFn(v).forEach(function(edge) {
          var w = edge.v === v ? edge.w : edge.v;
          var d = weightFn(edge);
          results[v][w] = { distance: d, predecessor: v };
        });
      });
      nodes.forEach(function(k) {
        var rowK = results[k];
        nodes.forEach(function(i) {
          var rowI = results[i];
          nodes.forEach(function(j) {
            var ik = rowI[k];
            var kj = rowK[j];
            var ij = rowI[j];
            var altDistance = ik.distance + kj.distance;
            if (altDistance < ij.distance) {
              ij.distance = altDistance;
              ij.predecessor = kj.predecessor;
            }
          });
        });
      });
      return results;
    }
  }
});

// node_modules/graphlib/lib/alg/topsort.js
var require_topsort = __commonJS({
  "node_modules/graphlib/lib/alg/topsort.js"(exports, module) {
    var _ = require_lodash();
    module.exports = topsort;
    topsort.CycleException = CycleException;
    function topsort(g) {
      var visited = {};
      var stack = {};
      var results = [];
      function visit(node) {
        if (_.has(stack, node)) {
          throw new CycleException();
        }
        if (!_.has(visited, node)) {
          stack[node] = true;
          visited[node] = true;
          _.each(g.predecessors(node), visit);
          delete stack[node];
          results.push(node);
        }
      }
      _.each(g.sinks(), visit);
      if (_.size(visited) !== g.nodeCount()) {
        throw new CycleException();
      }
      return results;
    }
    function CycleException() {
    }
    CycleException.prototype = new Error();
  }
});

// node_modules/graphlib/lib/alg/is-acyclic.js
var require_is_acyclic = __commonJS({
  "node_modules/graphlib/lib/alg/is-acyclic.js"(exports, module) {
    var topsort = require_topsort();
    module.exports = isAcyclic;
    function isAcyclic(g) {
      try {
        topsort(g);
      } catch (e) {
        if (e instanceof topsort.CycleException) {
          return false;
        }
        throw e;
      }
      return true;
    }
  }
});

// node_modules/graphlib/lib/alg/dfs.js
var require_dfs = __commonJS({
  "node_modules/graphlib/lib/alg/dfs.js"(exports, module) {
    var _ = require_lodash();
    module.exports = dfs;
    function dfs(g, vs, order) {
      if (!_.isArray(vs)) {
        vs = [vs];
      }
      var navigation = (g.isDirected() ? g.successors : g.neighbors).bind(g);
      var acc = [];
      var visited = {};
      _.each(vs, function(v) {
        if (!g.hasNode(v)) {
          throw new Error("Graph does not have node: " + v);
        }
        doDfs(g, v, order === "post", visited, navigation, acc);
      });
      return acc;
    }
    function doDfs(g, v, postorder, visited, navigation, acc) {
      if (!_.has(visited, v)) {
        visited[v] = true;
        if (!postorder) {
          acc.push(v);
        }
        _.each(navigation(v), function(w) {
          doDfs(g, w, postorder, visited, navigation, acc);
        });
        if (postorder) {
          acc.push(v);
        }
      }
    }
  }
});

// node_modules/graphlib/lib/alg/postorder.js
var require_postorder = __commonJS({
  "node_modules/graphlib/lib/alg/postorder.js"(exports, module) {
    var dfs = require_dfs();
    module.exports = postorder;
    function postorder(g, vs) {
      return dfs(g, vs, "post");
    }
  }
});

// node_modules/graphlib/lib/alg/preorder.js
var require_preorder = __commonJS({
  "node_modules/graphlib/lib/alg/preorder.js"(exports, module) {
    var dfs = require_dfs();
    module.exports = preorder;
    function preorder(g, vs) {
      return dfs(g, vs, "pre");
    }
  }
});

// node_modules/graphlib/lib/alg/prim.js
var require_prim = __commonJS({
  "node_modules/graphlib/lib/alg/prim.js"(exports, module) {
    var _ = require_lodash();
    var Graph = require_graph();
    var PriorityQueue = require_priority_queue();
    module.exports = prim;
    function prim(g, weightFunc) {
      var result = new Graph();
      var parents = {};
      var pq = new PriorityQueue();
      var v;
      function updateNeighbors(edge) {
        var w = edge.v === v ? edge.w : edge.v;
        var pri = pq.priority(w);
        if (pri !== void 0) {
          var edgeWeight = weightFunc(edge);
          if (edgeWeight < pri) {
            parents[w] = v;
            pq.decrease(w, edgeWeight);
          }
        }
      }
      if (g.nodeCount() === 0) {
        return result;
      }
      _.each(g.nodes(), function(v2) {
        pq.add(v2, Number.POSITIVE_INFINITY);
        result.setNode(v2);
      });
      pq.decrease(g.nodes()[0], 0);
      var init = false;
      while (pq.size() > 0) {
        v = pq.removeMin();
        if (_.has(parents, v)) {
          result.setEdge(v, parents[v]);
        } else if (init) {
          throw new Error("Input graph is not connected: " + g);
        } else {
          init = true;
        }
        g.nodeEdges(v).forEach(updateNeighbors);
      }
      return result;
    }
  }
});

// node_modules/graphlib/lib/alg/index.js
var require_alg = __commonJS({
  "node_modules/graphlib/lib/alg/index.js"(exports, module) {
    module.exports = {
      components: require_components(),
      dijkstra: require_dijkstra(),
      dijkstraAll: require_dijkstra_all(),
      findCycles: require_find_cycles(),
      floydWarshall: require_floyd_warshall(),
      isAcyclic: require_is_acyclic(),
      postorder: require_postorder(),
      preorder: require_preorder(),
      prim: require_prim(),
      tarjan: require_tarjan(),
      topsort: require_topsort()
    };
  }
});

// node_modules/graphlib/index.js
var require_graphlib = __commonJS({
  "node_modules/graphlib/index.js"(exports, module) {
    var lib = require_lib();
    module.exports = {
      Graph: lib.Graph,
      json: require_json(),
      alg: require_alg(),
      version: lib.version
    };
  }
});

// node_modules/dagre/lib/graphlib.js
var require_graphlib2 = __commonJS({
  "node_modules/dagre/lib/graphlib.js"(exports, module) {
    var graphlib;
    if (typeof __require === "function") {
      try {
        graphlib = require_graphlib();
      } catch (e) {
      }
    }
    if (!graphlib) {
      graphlib = window.graphlib;
    }
    module.exports = graphlib;
  }
});

// node_modules/lodash/cloneDeep.js
var require_cloneDeep = __commonJS({
  "node_modules/lodash/cloneDeep.js"(exports, module) {
    var baseClone = require_baseClone();
    var CLONE_DEEP_FLAG = 1;
    var CLONE_SYMBOLS_FLAG = 4;
    function cloneDeep(value) {
      return baseClone(value, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG);
    }
    module.exports = cloneDeep;
  }
});

// node_modules/lodash/_isIterateeCall.js
var require_isIterateeCall = __commonJS({
  "node_modules/lodash/_isIterateeCall.js"(exports, module) {
    var eq = require_eq();
    var isArrayLike = require_isArrayLike();
    var isIndex = require_isIndex();
    var isObject = require_isObject();
    function isIterateeCall(value, index, object) {
      if (!isObject(object)) {
        return false;
      }
      var type = typeof index;
      if (type == "number" ? isArrayLike(object) && isIndex(index, object.length) : type == "string" && index in object) {
        return eq(object[index], value);
      }
      return false;
    }
    module.exports = isIterateeCall;
  }
});

// node_modules/lodash/defaults.js
var require_defaults = __commonJS({
  "node_modules/lodash/defaults.js"(exports, module) {
    var baseRest = require_baseRest();
    var eq = require_eq();
    var isIterateeCall = require_isIterateeCall();
    var keysIn = require_keysIn();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var defaults = baseRest(function(object, sources) {
      object = Object(object);
      var index = -1;
      var length = sources.length;
      var guard = length > 2 ? sources[2] : void 0;
      if (guard && isIterateeCall(sources[0], sources[1], guard)) {
        length = 1;
      }
      while (++index < length) {
        var source = sources[index];
        var props = keysIn(source);
        var propsIndex = -1;
        var propsLength = props.length;
        while (++propsIndex < propsLength) {
          var key = props[propsIndex];
          var value = object[key];
          if (value === void 0 || eq(value, objectProto[key]) && !hasOwnProperty.call(object, key)) {
            object[key] = source[key];
          }
        }
      }
      return object;
    });
    module.exports = defaults;
  }
});

// node_modules/lodash/_createFind.js
var require_createFind = __commonJS({
  "node_modules/lodash/_createFind.js"(exports, module) {
    var baseIteratee = require_baseIteratee();
    var isArrayLike = require_isArrayLike();
    var keys = require_keys();
    function createFind(findIndexFunc) {
      return function(collection, predicate, fromIndex) {
        var iterable = Object(collection);
        if (!isArrayLike(collection)) {
          var iteratee = baseIteratee(predicate, 3);
          collection = keys(collection);
          predicate = function(key) {
            return iteratee(iterable[key], key, iterable);
          };
        }
        var index = findIndexFunc(collection, predicate, fromIndex);
        return index > -1 ? iterable[iteratee ? collection[index] : index] : void 0;
      };
    }
    module.exports = createFind;
  }
});

// node_modules/lodash/_trimmedEndIndex.js
var require_trimmedEndIndex = __commonJS({
  "node_modules/lodash/_trimmedEndIndex.js"(exports, module) {
    var reWhitespace = /\s/;
    function trimmedEndIndex(string) {
      var index = string.length;
      while (index-- && reWhitespace.test(string.charAt(index))) {
      }
      return index;
    }
    module.exports = trimmedEndIndex;
  }
});

// node_modules/lodash/_baseTrim.js
var require_baseTrim = __commonJS({
  "node_modules/lodash/_baseTrim.js"(exports, module) {
    var trimmedEndIndex = require_trimmedEndIndex();
    var reTrimStart = /^\s+/;
    function baseTrim(string) {
      return string ? string.slice(0, trimmedEndIndex(string) + 1).replace(reTrimStart, "") : string;
    }
    module.exports = baseTrim;
  }
});

// node_modules/lodash/toNumber.js
var require_toNumber = __commonJS({
  "node_modules/lodash/toNumber.js"(exports, module) {
    var baseTrim = require_baseTrim();
    var isObject = require_isObject();
    var isSymbol = require_isSymbol();
    var NAN = 0 / 0;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var freeParseInt = parseInt;
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = baseTrim(value);
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    module.exports = toNumber;
  }
});

// node_modules/lodash/toFinite.js
var require_toFinite = __commonJS({
  "node_modules/lodash/toFinite.js"(exports, module) {
    var toNumber = require_toNumber();
    var INFINITY = 1 / 0;
    var MAX_INTEGER = 17976931348623157e292;
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    module.exports = toFinite;
  }
});

// node_modules/lodash/toInteger.js
var require_toInteger = __commonJS({
  "node_modules/lodash/toInteger.js"(exports, module) {
    var toFinite = require_toFinite();
    function toInteger(value) {
      var result = toFinite(value), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    module.exports = toInteger;
  }
});

// node_modules/lodash/findIndex.js
var require_findIndex = __commonJS({
  "node_modules/lodash/findIndex.js"(exports, module) {
    var baseFindIndex = require_baseFindIndex();
    var baseIteratee = require_baseIteratee();
    var toInteger = require_toInteger();
    var nativeMax = Math.max;
    function findIndex(array, predicate, fromIndex) {
      var length = array == null ? 0 : array.length;
      if (!length) {
        return -1;
      }
      var index = fromIndex == null ? 0 : toInteger(fromIndex);
      if (index < 0) {
        index = nativeMax(length + index, 0);
      }
      return baseFindIndex(array, baseIteratee(predicate, 3), index);
    }
    module.exports = findIndex;
  }
});

// node_modules/lodash/find.js
var require_find = __commonJS({
  "node_modules/lodash/find.js"(exports, module) {
    var createFind = require_createFind();
    var findIndex = require_findIndex();
    var find = createFind(findIndex);
    module.exports = find;
  }
});

// node_modules/lodash/flatten.js
var require_flatten = __commonJS({
  "node_modules/lodash/flatten.js"(exports, module) {
    var baseFlatten = require_baseFlatten();
    function flatten(array) {
      var length = array == null ? 0 : array.length;
      return length ? baseFlatten(array, 1) : [];
    }
    module.exports = flatten;
  }
});

// node_modules/lodash/forIn.js
var require_forIn = __commonJS({
  "node_modules/lodash/forIn.js"(exports, module) {
    var baseFor = require_baseFor();
    var castFunction = require_castFunction();
    var keysIn = require_keysIn();
    function forIn(object, iteratee) {
      return object == null ? object : baseFor(object, castFunction(iteratee), keysIn);
    }
    module.exports = forIn;
  }
});

// node_modules/lodash/last.js
var require_last = __commonJS({
  "node_modules/lodash/last.js"(exports, module) {
    function last(array) {
      var length = array == null ? 0 : array.length;
      return length ? array[length - 1] : void 0;
    }
    module.exports = last;
  }
});

// node_modules/lodash/mapValues.js
var require_mapValues = __commonJS({
  "node_modules/lodash/mapValues.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var baseForOwn = require_baseForOwn();
    var baseIteratee = require_baseIteratee();
    function mapValues(object, iteratee) {
      var result = {};
      iteratee = baseIteratee(iteratee, 3);
      baseForOwn(object, function(value, key, object2) {
        baseAssignValue(result, key, iteratee(value, key, object2));
      });
      return result;
    }
    module.exports = mapValues;
  }
});

// node_modules/lodash/_baseExtremum.js
var require_baseExtremum = __commonJS({
  "node_modules/lodash/_baseExtremum.js"(exports, module) {
    var isSymbol = require_isSymbol();
    function baseExtremum(array, iteratee, comparator) {
      var index = -1, length = array.length;
      while (++index < length) {
        var value = array[index], current = iteratee(value);
        if (current != null && (computed === void 0 ? current === current && !isSymbol(current) : comparator(current, computed))) {
          var computed = current, result = value;
        }
      }
      return result;
    }
    module.exports = baseExtremum;
  }
});

// node_modules/lodash/_baseGt.js
var require_baseGt = __commonJS({
  "node_modules/lodash/_baseGt.js"(exports, module) {
    function baseGt(value, other) {
      return value > other;
    }
    module.exports = baseGt;
  }
});

// node_modules/lodash/max.js
var require_max = __commonJS({
  "node_modules/lodash/max.js"(exports, module) {
    var baseExtremum = require_baseExtremum();
    var baseGt = require_baseGt();
    var identity = require_identity();
    function max(array) {
      return array && array.length ? baseExtremum(array, identity, baseGt) : void 0;
    }
    module.exports = max;
  }
});

// node_modules/lodash/_assignMergeValue.js
var require_assignMergeValue = __commonJS({
  "node_modules/lodash/_assignMergeValue.js"(exports, module) {
    var baseAssignValue = require_baseAssignValue();
    var eq = require_eq();
    function assignMergeValue(object, key, value) {
      if (value !== void 0 && !eq(object[key], value) || value === void 0 && !(key in object)) {
        baseAssignValue(object, key, value);
      }
    }
    module.exports = assignMergeValue;
  }
});

// node_modules/lodash/isPlainObject.js
var require_isPlainObject = __commonJS({
  "node_modules/lodash/isPlainObject.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var getPrototype = require_getPrototype();
    var isObjectLike = require_isObjectLike();
    var objectTag = "[object Object]";
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectCtorString = funcToString.call(Object);
    function isPlainObject(value) {
      if (!isObjectLike(value) || baseGetTag(value) != objectTag) {
        return false;
      }
      var proto = getPrototype(value);
      if (proto === null) {
        return true;
      }
      var Ctor = hasOwnProperty.call(proto, "constructor") && proto.constructor;
      return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString;
    }
    module.exports = isPlainObject;
  }
});

// node_modules/lodash/_safeGet.js
var require_safeGet = __commonJS({
  "node_modules/lodash/_safeGet.js"(exports, module) {
    function safeGet(object, key) {
      if (key === "constructor" && typeof object[key] === "function") {
        return;
      }
      if (key == "__proto__") {
        return;
      }
      return object[key];
    }
    module.exports = safeGet;
  }
});

// node_modules/lodash/toPlainObject.js
var require_toPlainObject = __commonJS({
  "node_modules/lodash/toPlainObject.js"(exports, module) {
    var copyObject = require_copyObject();
    var keysIn = require_keysIn();
    function toPlainObject(value) {
      return copyObject(value, keysIn(value));
    }
    module.exports = toPlainObject;
  }
});

// node_modules/lodash/_baseMergeDeep.js
var require_baseMergeDeep = __commonJS({
  "node_modules/lodash/_baseMergeDeep.js"(exports, module) {
    var assignMergeValue = require_assignMergeValue();
    var cloneBuffer = require_cloneBuffer();
    var cloneTypedArray = require_cloneTypedArray();
    var copyArray = require_copyArray();
    var initCloneObject = require_initCloneObject();
    var isArguments = require_isArguments();
    var isArray = require_isArray();
    var isArrayLikeObject = require_isArrayLikeObject();
    var isBuffer = require_isBuffer();
    var isFunction = require_isFunction();
    var isObject = require_isObject();
    var isPlainObject = require_isPlainObject();
    var isTypedArray = require_isTypedArray();
    var safeGet = require_safeGet();
    var toPlainObject = require_toPlainObject();
    function baseMergeDeep(object, source, key, srcIndex, mergeFunc, customizer, stack) {
      var objValue = safeGet(object, key), srcValue = safeGet(source, key), stacked = stack.get(srcValue);
      if (stacked) {
        assignMergeValue(object, key, stacked);
        return;
      }
      var newValue = customizer ? customizer(objValue, srcValue, key + "", object, source, stack) : void 0;
      var isCommon = newValue === void 0;
      if (isCommon) {
        var isArr = isArray(srcValue), isBuff = !isArr && isBuffer(srcValue), isTyped = !isArr && !isBuff && isTypedArray(srcValue);
        newValue = srcValue;
        if (isArr || isBuff || isTyped) {
          if (isArray(objValue)) {
            newValue = objValue;
          } else if (isArrayLikeObject(objValue)) {
            newValue = copyArray(objValue);
          } else if (isBuff) {
            isCommon = false;
            newValue = cloneBuffer(srcValue, true);
          } else if (isTyped) {
            isCommon = false;
            newValue = cloneTypedArray(srcValue, true);
          } else {
            newValue = [];
          }
        } else if (isPlainObject(srcValue) || isArguments(srcValue)) {
          newValue = objValue;
          if (isArguments(objValue)) {
            newValue = toPlainObject(objValue);
          } else if (!isObject(objValue) || isFunction(objValue)) {
            newValue = initCloneObject(srcValue);
          }
        } else {
          isCommon = false;
        }
      }
      if (isCommon) {
        stack.set(srcValue, newValue);
        mergeFunc(newValue, srcValue, srcIndex, customizer, stack);
        stack["delete"](srcValue);
      }
      assignMergeValue(object, key, newValue);
    }
    module.exports = baseMergeDeep;
  }
});

// node_modules/lodash/_baseMerge.js
var require_baseMerge = __commonJS({
  "node_modules/lodash/_baseMerge.js"(exports, module) {
    var Stack = require_Stack();
    var assignMergeValue = require_assignMergeValue();
    var baseFor = require_baseFor();
    var baseMergeDeep = require_baseMergeDeep();
    var isObject = require_isObject();
    var keysIn = require_keysIn();
    var safeGet = require_safeGet();
    function baseMerge(object, source, srcIndex, customizer, stack) {
      if (object === source) {
        return;
      }
      baseFor(source, function(srcValue, key) {
        stack || (stack = new Stack());
        if (isObject(srcValue)) {
          baseMergeDeep(object, source, key, srcIndex, baseMerge, customizer, stack);
        } else {
          var newValue = customizer ? customizer(safeGet(object, key), srcValue, key + "", object, source, stack) : void 0;
          if (newValue === void 0) {
            newValue = srcValue;
          }
          assignMergeValue(object, key, newValue);
        }
      }, keysIn);
    }
    module.exports = baseMerge;
  }
});

// node_modules/lodash/_createAssigner.js
var require_createAssigner = __commonJS({
  "node_modules/lodash/_createAssigner.js"(exports, module) {
    var baseRest = require_baseRest();
    var isIterateeCall = require_isIterateeCall();
    function createAssigner(assigner) {
      return baseRest(function(object, sources) {
        var index = -1, length = sources.length, customizer = length > 1 ? sources[length - 1] : void 0, guard = length > 2 ? sources[2] : void 0;
        customizer = assigner.length > 3 && typeof customizer == "function" ? (length--, customizer) : void 0;
        if (guard && isIterateeCall(sources[0], sources[1], guard)) {
          customizer = length < 3 ? void 0 : customizer;
          length = 1;
        }
        object = Object(object);
        while (++index < length) {
          var source = sources[index];
          if (source) {
            assigner(object, source, index, customizer);
          }
        }
        return object;
      });
    }
    module.exports = createAssigner;
  }
});

// node_modules/lodash/merge.js
var require_merge = __commonJS({
  "node_modules/lodash/merge.js"(exports, module) {
    var baseMerge = require_baseMerge();
    var createAssigner = require_createAssigner();
    var merge = createAssigner(function(object, source, srcIndex) {
      baseMerge(object, source, srcIndex);
    });
    module.exports = merge;
  }
});

// node_modules/lodash/_baseLt.js
var require_baseLt = __commonJS({
  "node_modules/lodash/_baseLt.js"(exports, module) {
    function baseLt(value, other) {
      return value < other;
    }
    module.exports = baseLt;
  }
});

// node_modules/lodash/min.js
var require_min = __commonJS({
  "node_modules/lodash/min.js"(exports, module) {
    var baseExtremum = require_baseExtremum();
    var baseLt = require_baseLt();
    var identity = require_identity();
    function min(array) {
      return array && array.length ? baseExtremum(array, identity, baseLt) : void 0;
    }
    module.exports = min;
  }
});

// node_modules/lodash/minBy.js
var require_minBy = __commonJS({
  "node_modules/lodash/minBy.js"(exports, module) {
    var baseExtremum = require_baseExtremum();
    var baseIteratee = require_baseIteratee();
    var baseLt = require_baseLt();
    function minBy(array, iteratee) {
      return array && array.length ? baseExtremum(array, baseIteratee(iteratee, 2), baseLt) : void 0;
    }
    module.exports = minBy;
  }
});

// node_modules/lodash/now.js
var require_now = __commonJS({
  "node_modules/lodash/now.js"(exports, module) {
    var root = require_root();
    var now = function() {
      return root.Date.now();
    };
    module.exports = now;
  }
});

// node_modules/lodash/_baseSet.js
var require_baseSet = __commonJS({
  "node_modules/lodash/_baseSet.js"(exports, module) {
    var assignValue = require_assignValue();
    var castPath = require_castPath();
    var isIndex = require_isIndex();
    var isObject = require_isObject();
    var toKey = require_toKey();
    function baseSet(object, path, value, customizer) {
      if (!isObject(object)) {
        return object;
      }
      path = castPath(path, object);
      var index = -1, length = path.length, lastIndex = length - 1, nested = object;
      while (nested != null && ++index < length) {
        var key = toKey(path[index]), newValue = value;
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          return object;
        }
        if (index != lastIndex) {
          var objValue = nested[key];
          newValue = customizer ? customizer(objValue, key, nested) : void 0;
          if (newValue === void 0) {
            newValue = isObject(objValue) ? objValue : isIndex(path[index + 1]) ? [] : {};
          }
        }
        assignValue(nested, key, newValue);
        nested = nested[key];
      }
      return object;
    }
    module.exports = baseSet;
  }
});

// node_modules/lodash/_basePickBy.js
var require_basePickBy = __commonJS({
  "node_modules/lodash/_basePickBy.js"(exports, module) {
    var baseGet = require_baseGet();
    var baseSet = require_baseSet();
    var castPath = require_castPath();
    function basePickBy(object, paths, predicate) {
      var index = -1, length = paths.length, result = {};
      while (++index < length) {
        var path = paths[index], value = baseGet(object, path);
        if (predicate(value, path)) {
          baseSet(result, castPath(path, object), value);
        }
      }
      return result;
    }
    module.exports = basePickBy;
  }
});

// node_modules/lodash/_basePick.js
var require_basePick = __commonJS({
  "node_modules/lodash/_basePick.js"(exports, module) {
    var basePickBy = require_basePickBy();
    var hasIn = require_hasIn();
    function basePick(object, paths) {
      return basePickBy(object, paths, function(value, path) {
        return hasIn(object, path);
      });
    }
    module.exports = basePick;
  }
});

// node_modules/lodash/_flatRest.js
var require_flatRest = __commonJS({
  "node_modules/lodash/_flatRest.js"(exports, module) {
    var flatten = require_flatten();
    var overRest = require_overRest();
    var setToString = require_setToString();
    function flatRest(func) {
      return setToString(overRest(func, void 0, flatten), func + "");
    }
    module.exports = flatRest;
  }
});

// node_modules/lodash/pick.js
var require_pick = __commonJS({
  "node_modules/lodash/pick.js"(exports, module) {
    var basePick = require_basePick();
    var flatRest = require_flatRest();
    var pick = flatRest(function(object, paths) {
      return object == null ? {} : basePick(object, paths);
    });
    module.exports = pick;
  }
});

// node_modules/lodash/_baseRange.js
var require_baseRange = __commonJS({
  "node_modules/lodash/_baseRange.js"(exports, module) {
    var nativeCeil = Math.ceil;
    var nativeMax = Math.max;
    function baseRange(start, end, step, fromRight) {
      var index = -1, length = nativeMax(nativeCeil((end - start) / (step || 1)), 0), result = Array(length);
      while (length--) {
        result[fromRight ? length : ++index] = start;
        start += step;
      }
      return result;
    }
    module.exports = baseRange;
  }
});

// node_modules/lodash/_createRange.js
var require_createRange = __commonJS({
  "node_modules/lodash/_createRange.js"(exports, module) {
    var baseRange = require_baseRange();
    var isIterateeCall = require_isIterateeCall();
    var toFinite = require_toFinite();
    function createRange(fromRight) {
      return function(start, end, step) {
        if (step && typeof step != "number" && isIterateeCall(start, end, step)) {
          end = step = void 0;
        }
        start = toFinite(start);
        if (end === void 0) {
          end = start;
          start = 0;
        } else {
          end = toFinite(end);
        }
        step = step === void 0 ? start < end ? 1 : -1 : toFinite(step);
        return baseRange(start, end, step, fromRight);
      };
    }
    module.exports = createRange;
  }
});

// node_modules/lodash/range.js
var require_range = __commonJS({
  "node_modules/lodash/range.js"(exports, module) {
    var createRange = require_createRange();
    var range = createRange();
    module.exports = range;
  }
});

// node_modules/lodash/_baseSortBy.js
var require_baseSortBy = __commonJS({
  "node_modules/lodash/_baseSortBy.js"(exports, module) {
    function baseSortBy(array, comparer) {
      var length = array.length;
      array.sort(comparer);
      while (length--) {
        array[length] = array[length].value;
      }
      return array;
    }
    module.exports = baseSortBy;
  }
});

// node_modules/lodash/_compareAscending.js
var require_compareAscending = __commonJS({
  "node_modules/lodash/_compareAscending.js"(exports, module) {
    var isSymbol = require_isSymbol();
    function compareAscending(value, other) {
      if (value !== other) {
        var valIsDefined = value !== void 0, valIsNull = value === null, valIsReflexive = value === value, valIsSymbol = isSymbol(value);
        var othIsDefined = other !== void 0, othIsNull = other === null, othIsReflexive = other === other, othIsSymbol = isSymbol(other);
        if (!othIsNull && !othIsSymbol && !valIsSymbol && value > other || valIsSymbol && othIsDefined && othIsReflexive && !othIsNull && !othIsSymbol || valIsNull && othIsDefined && othIsReflexive || !valIsDefined && othIsReflexive || !valIsReflexive) {
          return 1;
        }
        if (!valIsNull && !valIsSymbol && !othIsSymbol && value < other || othIsSymbol && valIsDefined && valIsReflexive && !valIsNull && !valIsSymbol || othIsNull && valIsDefined && valIsReflexive || !othIsDefined && valIsReflexive || !othIsReflexive) {
          return -1;
        }
      }
      return 0;
    }
    module.exports = compareAscending;
  }
});

// node_modules/lodash/_compareMultiple.js
var require_compareMultiple = __commonJS({
  "node_modules/lodash/_compareMultiple.js"(exports, module) {
    var compareAscending = require_compareAscending();
    function compareMultiple(object, other, orders) {
      var index = -1, objCriteria = object.criteria, othCriteria = other.criteria, length = objCriteria.length, ordersLength = orders.length;
      while (++index < length) {
        var result = compareAscending(objCriteria[index], othCriteria[index]);
        if (result) {
          if (index >= ordersLength) {
            return result;
          }
          var order = orders[index];
          return result * (order == "desc" ? -1 : 1);
        }
      }
      return object.index - other.index;
    }
    module.exports = compareMultiple;
  }
});

// node_modules/lodash/_baseOrderBy.js
var require_baseOrderBy = __commonJS({
  "node_modules/lodash/_baseOrderBy.js"(exports, module) {
    var arrayMap = require_arrayMap();
    var baseGet = require_baseGet();
    var baseIteratee = require_baseIteratee();
    var baseMap = require_baseMap();
    var baseSortBy = require_baseSortBy();
    var baseUnary = require_baseUnary();
    var compareMultiple = require_compareMultiple();
    var identity = require_identity();
    var isArray = require_isArray();
    function baseOrderBy(collection, iteratees, orders) {
      if (iteratees.length) {
        iteratees = arrayMap(iteratees, function(iteratee) {
          if (isArray(iteratee)) {
            return function(value) {
              return baseGet(value, iteratee.length === 1 ? iteratee[0] : iteratee);
            };
          }
          return iteratee;
        });
      } else {
        iteratees = [identity];
      }
      var index = -1;
      iteratees = arrayMap(iteratees, baseUnary(baseIteratee));
      var result = baseMap(collection, function(value, key, collection2) {
        var criteria = arrayMap(iteratees, function(iteratee) {
          return iteratee(value);
        });
        return { "criteria": criteria, "index": ++index, "value": value };
      });
      return baseSortBy(result, function(object, other) {
        return compareMultiple(object, other, orders);
      });
    }
    module.exports = baseOrderBy;
  }
});

// node_modules/lodash/sortBy.js
var require_sortBy = __commonJS({
  "node_modules/lodash/sortBy.js"(exports, module) {
    var baseFlatten = require_baseFlatten();
    var baseOrderBy = require_baseOrderBy();
    var baseRest = require_baseRest();
    var isIterateeCall = require_isIterateeCall();
    var sortBy = baseRest(function(collection, iteratees) {
      if (collection == null) {
        return [];
      }
      var length = iteratees.length;
      if (length > 1 && isIterateeCall(collection, iteratees[0], iteratees[1])) {
        iteratees = [];
      } else if (length > 2 && isIterateeCall(iteratees[0], iteratees[1], iteratees[2])) {
        iteratees = [iteratees[0]];
      }
      return baseOrderBy(collection, baseFlatten(iteratees, 1), []);
    });
    module.exports = sortBy;
  }
});

// node_modules/lodash/uniqueId.js
var require_uniqueId = __commonJS({
  "node_modules/lodash/uniqueId.js"(exports, module) {
    var toString = require_toString();
    var idCounter = 0;
    function uniqueId(prefix) {
      var id = ++idCounter;
      return toString(prefix) + id;
    }
    module.exports = uniqueId;
  }
});

// node_modules/lodash/_baseZipObject.js
var require_baseZipObject = __commonJS({
  "node_modules/lodash/_baseZipObject.js"(exports, module) {
    function baseZipObject(props, values, assignFunc) {
      var index = -1, length = props.length, valsLength = values.length, result = {};
      while (++index < length) {
        var value = index < valsLength ? values[index] : void 0;
        assignFunc(result, props[index], value);
      }
      return result;
    }
    module.exports = baseZipObject;
  }
});

// node_modules/lodash/zipObject.js
var require_zipObject = __commonJS({
  "node_modules/lodash/zipObject.js"(exports, module) {
    var assignValue = require_assignValue();
    var baseZipObject = require_baseZipObject();
    function zipObject(props, values) {
      return baseZipObject(props || [], values || [], assignValue);
    }
    module.exports = zipObject;
  }
});

// node_modules/dagre/lib/lodash.js
var require_lodash2 = __commonJS({
  "node_modules/dagre/lib/lodash.js"(exports, module) {
    var lodash;
    if (typeof __require === "function") {
      try {
        lodash = {
          cloneDeep: require_cloneDeep(),
          constant: require_constant(),
          defaults: require_defaults(),
          each: require_each(),
          filter: require_filter(),
          find: require_find(),
          flatten: require_flatten(),
          forEach: require_forEach(),
          forIn: require_forIn(),
          has: require_has(),
          isUndefined: require_isUndefined(),
          last: require_last(),
          map: require_map(),
          mapValues: require_mapValues(),
          max: require_max(),
          merge: require_merge(),
          min: require_min(),
          minBy: require_minBy(),
          now: require_now(),
          pick: require_pick(),
          range: require_range(),
          reduce: require_reduce(),
          sortBy: require_sortBy(),
          uniqueId: require_uniqueId(),
          values: require_values(),
          zipObject: require_zipObject()
        };
      } catch (e) {
      }
    }
    if (!lodash) {
      lodash = window._;
    }
    module.exports = lodash;
  }
});

// node_modules/dagre/lib/data/list.js
var require_list = __commonJS({
  "node_modules/dagre/lib/data/list.js"(exports, module) {
    module.exports = List;
    function List() {
      var sentinel = {};
      sentinel._next = sentinel._prev = sentinel;
      this._sentinel = sentinel;
    }
    List.prototype.dequeue = function() {
      var sentinel = this._sentinel;
      var entry = sentinel._prev;
      if (entry !== sentinel) {
        unlink(entry);
        return entry;
      }
    };
    List.prototype.enqueue = function(entry) {
      var sentinel = this._sentinel;
      if (entry._prev && entry._next) {
        unlink(entry);
      }
      entry._next = sentinel._next;
      sentinel._next._prev = entry;
      sentinel._next = entry;
      entry._prev = sentinel;
    };
    List.prototype.toString = function() {
      var strs = [];
      var sentinel = this._sentinel;
      var curr = sentinel._prev;
      while (curr !== sentinel) {
        strs.push(JSON.stringify(curr, filterOutLinks));
        curr = curr._prev;
      }
      return "[" + strs.join(", ") + "]";
    };
    function unlink(entry) {
      entry._prev._next = entry._next;
      entry._next._prev = entry._prev;
      delete entry._next;
      delete entry._prev;
    }
    function filterOutLinks(k, v) {
      if (k !== "_next" && k !== "_prev") {
        return v;
      }
    }
  }
});

// node_modules/dagre/lib/greedy-fas.js
var require_greedy_fas = __commonJS({
  "node_modules/dagre/lib/greedy-fas.js"(exports, module) {
    var _ = require_lodash2();
    var Graph = require_graphlib2().Graph;
    var List = require_list();
    module.exports = greedyFAS;
    var DEFAULT_WEIGHT_FN = _.constant(1);
    function greedyFAS(g, weightFn) {
      if (g.nodeCount() <= 1) {
        return [];
      }
      var state = buildState(g, weightFn || DEFAULT_WEIGHT_FN);
      var results = doGreedyFAS(state.graph, state.buckets, state.zeroIdx);
      return _.flatten(_.map(results, function(e) {
        return g.outEdges(e.v, e.w);
      }), true);
    }
    function doGreedyFAS(g, buckets, zeroIdx) {
      var results = [];
      var sources = buckets[buckets.length - 1];
      var sinks = buckets[0];
      var entry;
      while (g.nodeCount()) {
        while (entry = sinks.dequeue()) {
          removeNode(g, buckets, zeroIdx, entry);
        }
        while (entry = sources.dequeue()) {
          removeNode(g, buckets, zeroIdx, entry);
        }
        if (g.nodeCount()) {
          for (var i = buckets.length - 2; i > 0; --i) {
            entry = buckets[i].dequeue();
            if (entry) {
              results = results.concat(removeNode(g, buckets, zeroIdx, entry, true));
              break;
            }
          }
        }
      }
      return results;
    }
    function removeNode(g, buckets, zeroIdx, entry, collectPredecessors) {
      var results = collectPredecessors ? [] : void 0;
      _.forEach(g.inEdges(entry.v), function(edge) {
        var weight = g.edge(edge);
        var uEntry = g.node(edge.v);
        if (collectPredecessors) {
          results.push({ v: edge.v, w: edge.w });
        }
        uEntry.out -= weight;
        assignBucket(buckets, zeroIdx, uEntry);
      });
      _.forEach(g.outEdges(entry.v), function(edge) {
        var weight = g.edge(edge);
        var w = edge.w;
        var wEntry = g.node(w);
        wEntry["in"] -= weight;
        assignBucket(buckets, zeroIdx, wEntry);
      });
      g.removeNode(entry.v);
      return results;
    }
    function buildState(g, weightFn) {
      var fasGraph = new Graph();
      var maxIn = 0;
      var maxOut = 0;
      _.forEach(g.nodes(), function(v) {
        fasGraph.setNode(v, { v, "in": 0, out: 0 });
      });
      _.forEach(g.edges(), function(e) {
        var prevWeight = fasGraph.edge(e.v, e.w) || 0;
        var weight = weightFn(e);
        var edgeWeight = prevWeight + weight;
        fasGraph.setEdge(e.v, e.w, edgeWeight);
        maxOut = Math.max(maxOut, fasGraph.node(e.v).out += weight);
        maxIn = Math.max(maxIn, fasGraph.node(e.w)["in"] += weight);
      });
      var buckets = _.range(maxOut + maxIn + 3).map(function() {
        return new List();
      });
      var zeroIdx = maxIn + 1;
      _.forEach(fasGraph.nodes(), function(v) {
        assignBucket(buckets, zeroIdx, fasGraph.node(v));
      });
      return { graph: fasGraph, buckets, zeroIdx };
    }
    function assignBucket(buckets, zeroIdx, entry) {
      if (!entry.out) {
        buckets[0].enqueue(entry);
      } else if (!entry["in"]) {
        buckets[buckets.length - 1].enqueue(entry);
      } else {
        buckets[entry.out - entry["in"] + zeroIdx].enqueue(entry);
      }
    }
  }
});

// node_modules/dagre/lib/acyclic.js
var require_acyclic = __commonJS({
  "node_modules/dagre/lib/acyclic.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var greedyFAS = require_greedy_fas();
    module.exports = {
      run,
      undo
    };
    function run(g) {
      var fas = g.graph().acyclicer === "greedy" ? greedyFAS(g, weightFn(g)) : dfsFAS(g);
      _.forEach(fas, function(e) {
        var label = g.edge(e);
        g.removeEdge(e);
        label.forwardName = e.name;
        label.reversed = true;
        g.setEdge(e.w, e.v, label, _.uniqueId("rev"));
      });
      function weightFn(g2) {
        return function(e) {
          return g2.edge(e).weight;
        };
      }
    }
    function dfsFAS(g) {
      var fas = [];
      var stack = {};
      var visited = {};
      function dfs(v) {
        if (_.has(visited, v)) {
          return;
        }
        visited[v] = true;
        stack[v] = true;
        _.forEach(g.outEdges(v), function(e) {
          if (_.has(stack, e.w)) {
            fas.push(e);
          } else {
            dfs(e.w);
          }
        });
        delete stack[v];
      }
      _.forEach(g.nodes(), dfs);
      return fas;
    }
    function undo(g) {
      _.forEach(g.edges(), function(e) {
        var label = g.edge(e);
        if (label.reversed) {
          g.removeEdge(e);
          var forwardName = label.forwardName;
          delete label.reversed;
          delete label.forwardName;
          g.setEdge(e.w, e.v, label, forwardName);
        }
      });
    }
  }
});

// node_modules/dagre/lib/util.js
var require_util = __commonJS({
  "node_modules/dagre/lib/util.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var Graph = require_graphlib2().Graph;
    module.exports = {
      addDummyNode,
      simplify,
      asNonCompoundGraph,
      successorWeights,
      predecessorWeights,
      intersectRect,
      buildLayerMatrix,
      normalizeRanks,
      removeEmptyRanks,
      addBorderNode,
      maxRank,
      partition,
      time,
      notime
    };
    function addDummyNode(g, type, attrs, name) {
      var v;
      do {
        v = _.uniqueId(name);
      } while (g.hasNode(v));
      attrs.dummy = type;
      g.setNode(v, attrs);
      return v;
    }
    function simplify(g) {
      var simplified = new Graph().setGraph(g.graph());
      _.forEach(g.nodes(), function(v) {
        simplified.setNode(v, g.node(v));
      });
      _.forEach(g.edges(), function(e) {
        var simpleLabel = simplified.edge(e.v, e.w) || { weight: 0, minlen: 1 };
        var label = g.edge(e);
        simplified.setEdge(e.v, e.w, {
          weight: simpleLabel.weight + label.weight,
          minlen: Math.max(simpleLabel.minlen, label.minlen)
        });
      });
      return simplified;
    }
    function asNonCompoundGraph(g) {
      var simplified = new Graph({ multigraph: g.isMultigraph() }).setGraph(g.graph());
      _.forEach(g.nodes(), function(v) {
        if (!g.children(v).length) {
          simplified.setNode(v, g.node(v));
        }
      });
      _.forEach(g.edges(), function(e) {
        simplified.setEdge(e, g.edge(e));
      });
      return simplified;
    }
    function successorWeights(g) {
      var weightMap = _.map(g.nodes(), function(v) {
        var sucs = {};
        _.forEach(g.outEdges(v), function(e) {
          sucs[e.w] = (sucs[e.w] || 0) + g.edge(e).weight;
        });
        return sucs;
      });
      return _.zipObject(g.nodes(), weightMap);
    }
    function predecessorWeights(g) {
      var weightMap = _.map(g.nodes(), function(v) {
        var preds = {};
        _.forEach(g.inEdges(v), function(e) {
          preds[e.v] = (preds[e.v] || 0) + g.edge(e).weight;
        });
        return preds;
      });
      return _.zipObject(g.nodes(), weightMap);
    }
    function intersectRect(rect, point) {
      var x = rect.x;
      var y = rect.y;
      var dx = point.x - x;
      var dy = point.y - y;
      var w = rect.width / 2;
      var h = rect.height / 2;
      if (!dx && !dy) {
        throw new Error("Not possible to find intersection inside of the rectangle");
      }
      var sx, sy;
      if (Math.abs(dy) * w > Math.abs(dx) * h) {
        if (dy < 0) {
          h = -h;
        }
        sx = h * dx / dy;
        sy = h;
      } else {
        if (dx < 0) {
          w = -w;
        }
        sx = w;
        sy = w * dy / dx;
      }
      return { x: x + sx, y: y + sy };
    }
    function buildLayerMatrix(g) {
      var layering = _.map(_.range(maxRank(g) + 1), function() {
        return [];
      });
      _.forEach(g.nodes(), function(v) {
        var node = g.node(v);
        var rank = node.rank;
        if (!_.isUndefined(rank)) {
          layering[rank][node.order] = v;
        }
      });
      return layering;
    }
    function normalizeRanks(g) {
      var min = _.min(_.map(g.nodes(), function(v) {
        return g.node(v).rank;
      }));
      _.forEach(g.nodes(), function(v) {
        var node = g.node(v);
        if (_.has(node, "rank")) {
          node.rank -= min;
        }
      });
    }
    function removeEmptyRanks(g) {
      var offset = _.min(_.map(g.nodes(), function(v) {
        return g.node(v).rank;
      }));
      var layers = [];
      _.forEach(g.nodes(), function(v) {
        var rank = g.node(v).rank - offset;
        if (!layers[rank]) {
          layers[rank] = [];
        }
        layers[rank].push(v);
      });
      var delta = 0;
      var nodeRankFactor = g.graph().nodeRankFactor;
      _.forEach(layers, function(vs, i) {
        if (_.isUndefined(vs) && i % nodeRankFactor !== 0) {
          --delta;
        } else if (delta) {
          _.forEach(vs, function(v) {
            g.node(v).rank += delta;
          });
        }
      });
    }
    function addBorderNode(g, prefix, rank, order) {
      var node = {
        width: 0,
        height: 0
      };
      if (arguments.length >= 4) {
        node.rank = rank;
        node.order = order;
      }
      return addDummyNode(g, "border", node, prefix);
    }
    function maxRank(g) {
      return _.max(_.map(g.nodes(), function(v) {
        var rank = g.node(v).rank;
        if (!_.isUndefined(rank)) {
          return rank;
        }
      }));
    }
    function partition(collection, fn) {
      var result = { lhs: [], rhs: [] };
      _.forEach(collection, function(value) {
        if (fn(value)) {
          result.lhs.push(value);
        } else {
          result.rhs.push(value);
        }
      });
      return result;
    }
    function time(name, fn) {
      var start = _.now();
      try {
        return fn();
      } finally {
        console.log(name + " time: " + (_.now() - start) + "ms");
      }
    }
    function notime(name, fn) {
      return fn();
    }
  }
});

// node_modules/dagre/lib/normalize.js
var require_normalize = __commonJS({
  "node_modules/dagre/lib/normalize.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var util = require_util();
    module.exports = {
      run,
      undo
    };
    function run(g) {
      g.graph().dummyChains = [];
      _.forEach(g.edges(), function(edge) {
        normalizeEdge(g, edge);
      });
    }
    function normalizeEdge(g, e) {
      var v = e.v;
      var vRank = g.node(v).rank;
      var w = e.w;
      var wRank = g.node(w).rank;
      var name = e.name;
      var edgeLabel = g.edge(e);
      var labelRank = edgeLabel.labelRank;
      if (wRank === vRank + 1) return;
      g.removeEdge(e);
      var dummy, attrs, i;
      for (i = 0, ++vRank; vRank < wRank; ++i, ++vRank) {
        edgeLabel.points = [];
        attrs = {
          width: 0,
          height: 0,
          edgeLabel,
          edgeObj: e,
          rank: vRank
        };
        dummy = util.addDummyNode(g, "edge", attrs, "_d");
        if (vRank === labelRank) {
          attrs.width = edgeLabel.width;
          attrs.height = edgeLabel.height;
          attrs.dummy = "edge-label";
          attrs.labelpos = edgeLabel.labelpos;
        }
        g.setEdge(v, dummy, { weight: edgeLabel.weight }, name);
        if (i === 0) {
          g.graph().dummyChains.push(dummy);
        }
        v = dummy;
      }
      g.setEdge(v, w, { weight: edgeLabel.weight }, name);
    }
    function undo(g) {
      _.forEach(g.graph().dummyChains, function(v) {
        var node = g.node(v);
        var origLabel = node.edgeLabel;
        var w;
        g.setEdge(node.edgeObj, origLabel);
        while (node.dummy) {
          w = g.successors(v)[0];
          g.removeNode(v);
          origLabel.points.push({ x: node.x, y: node.y });
          if (node.dummy === "edge-label") {
            origLabel.x = node.x;
            origLabel.y = node.y;
            origLabel.width = node.width;
            origLabel.height = node.height;
          }
          v = w;
          node = g.node(v);
        }
      });
    }
  }
});

// node_modules/dagre/lib/rank/util.js
var require_util2 = __commonJS({
  "node_modules/dagre/lib/rank/util.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    module.exports = {
      longestPath,
      slack
    };
    function longestPath(g) {
      var visited = {};
      function dfs(v) {
        var label = g.node(v);
        if (_.has(visited, v)) {
          return label.rank;
        }
        visited[v] = true;
        var rank = _.min(_.map(g.outEdges(v), function(e) {
          return dfs(e.w) - g.edge(e).minlen;
        }));
        if (rank === Number.POSITIVE_INFINITY || // return value of _.map([]) for Lodash 3
        rank === void 0 || // return value of _.map([]) for Lodash 4
        rank === null) {
          rank = 0;
        }
        return label.rank = rank;
      }
      _.forEach(g.sources(), dfs);
    }
    function slack(g, e) {
      return g.node(e.w).rank - g.node(e.v).rank - g.edge(e).minlen;
    }
  }
});

// node_modules/dagre/lib/rank/feasible-tree.js
var require_feasible_tree = __commonJS({
  "node_modules/dagre/lib/rank/feasible-tree.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var Graph = require_graphlib2().Graph;
    var slack = require_util2().slack;
    module.exports = feasibleTree;
    function feasibleTree(g) {
      var t = new Graph({ directed: false });
      var start = g.nodes()[0];
      var size = g.nodeCount();
      t.setNode(start, {});
      var edge, delta;
      while (tightTree(t, g) < size) {
        edge = findMinSlackEdge(t, g);
        delta = t.hasNode(edge.v) ? slack(g, edge) : -slack(g, edge);
        shiftRanks(t, g, delta);
      }
      return t;
    }
    function tightTree(t, g) {
      function dfs(v) {
        _.forEach(g.nodeEdges(v), function(e) {
          var edgeV = e.v, w = v === edgeV ? e.w : edgeV;
          if (!t.hasNode(w) && !slack(g, e)) {
            t.setNode(w, {});
            t.setEdge(v, w, {});
            dfs(w);
          }
        });
      }
      _.forEach(t.nodes(), dfs);
      return t.nodeCount();
    }
    function findMinSlackEdge(t, g) {
      return _.minBy(g.edges(), function(e) {
        if (t.hasNode(e.v) !== t.hasNode(e.w)) {
          return slack(g, e);
        }
      });
    }
    function shiftRanks(t, g, delta) {
      _.forEach(t.nodes(), function(v) {
        g.node(v).rank += delta;
      });
    }
  }
});

// node_modules/dagre/lib/rank/network-simplex.js
var require_network_simplex = __commonJS({
  "node_modules/dagre/lib/rank/network-simplex.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var feasibleTree = require_feasible_tree();
    var slack = require_util2().slack;
    var initRank = require_util2().longestPath;
    var preorder = require_graphlib2().alg.preorder;
    var postorder = require_graphlib2().alg.postorder;
    var simplify = require_util().simplify;
    module.exports = networkSimplex;
    networkSimplex.initLowLimValues = initLowLimValues;
    networkSimplex.initCutValues = initCutValues;
    networkSimplex.calcCutValue = calcCutValue;
    networkSimplex.leaveEdge = leaveEdge;
    networkSimplex.enterEdge = enterEdge;
    networkSimplex.exchangeEdges = exchangeEdges;
    function networkSimplex(g) {
      g = simplify(g);
      initRank(g);
      var t = feasibleTree(g);
      initLowLimValues(t);
      initCutValues(t, g);
      var e, f;
      while (e = leaveEdge(t)) {
        f = enterEdge(t, g, e);
        exchangeEdges(t, g, e, f);
      }
    }
    function initCutValues(t, g) {
      var vs = postorder(t, t.nodes());
      vs = vs.slice(0, vs.length - 1);
      _.forEach(vs, function(v) {
        assignCutValue(t, g, v);
      });
    }
    function assignCutValue(t, g, child) {
      var childLab = t.node(child);
      var parent = childLab.parent;
      t.edge(child, parent).cutvalue = calcCutValue(t, g, child);
    }
    function calcCutValue(t, g, child) {
      var childLab = t.node(child);
      var parent = childLab.parent;
      var childIsTail = true;
      var graphEdge = g.edge(child, parent);
      var cutValue = 0;
      if (!graphEdge) {
        childIsTail = false;
        graphEdge = g.edge(parent, child);
      }
      cutValue = graphEdge.weight;
      _.forEach(g.nodeEdges(child), function(e) {
        var isOutEdge = e.v === child, other = isOutEdge ? e.w : e.v;
        if (other !== parent) {
          var pointsToHead = isOutEdge === childIsTail, otherWeight = g.edge(e).weight;
          cutValue += pointsToHead ? otherWeight : -otherWeight;
          if (isTreeEdge(t, child, other)) {
            var otherCutValue = t.edge(child, other).cutvalue;
            cutValue += pointsToHead ? -otherCutValue : otherCutValue;
          }
        }
      });
      return cutValue;
    }
    function initLowLimValues(tree, root) {
      if (arguments.length < 2) {
        root = tree.nodes()[0];
      }
      dfsAssignLowLim(tree, {}, 1, root);
    }
    function dfsAssignLowLim(tree, visited, nextLim, v, parent) {
      var low = nextLim;
      var label = tree.node(v);
      visited[v] = true;
      _.forEach(tree.neighbors(v), function(w) {
        if (!_.has(visited, w)) {
          nextLim = dfsAssignLowLim(tree, visited, nextLim, w, v);
        }
      });
      label.low = low;
      label.lim = nextLim++;
      if (parent) {
        label.parent = parent;
      } else {
        delete label.parent;
      }
      return nextLim;
    }
    function leaveEdge(tree) {
      return _.find(tree.edges(), function(e) {
        return tree.edge(e).cutvalue < 0;
      });
    }
    function enterEdge(t, g, edge) {
      var v = edge.v;
      var w = edge.w;
      if (!g.hasEdge(v, w)) {
        v = edge.w;
        w = edge.v;
      }
      var vLabel = t.node(v);
      var wLabel = t.node(w);
      var tailLabel = vLabel;
      var flip = false;
      if (vLabel.lim > wLabel.lim) {
        tailLabel = wLabel;
        flip = true;
      }
      var candidates = _.filter(g.edges(), function(edge2) {
        return flip === isDescendant(t, t.node(edge2.v), tailLabel) && flip !== isDescendant(t, t.node(edge2.w), tailLabel);
      });
      return _.minBy(candidates, function(edge2) {
        return slack(g, edge2);
      });
    }
    function exchangeEdges(t, g, e, f) {
      var v = e.v;
      var w = e.w;
      t.removeEdge(v, w);
      t.setEdge(f.v, f.w, {});
      initLowLimValues(t);
      initCutValues(t, g);
      updateRanks(t, g);
    }
    function updateRanks(t, g) {
      var root = _.find(t.nodes(), function(v) {
        return !g.node(v).parent;
      });
      var vs = preorder(t, root);
      vs = vs.slice(1);
      _.forEach(vs, function(v) {
        var parent = t.node(v).parent, edge = g.edge(v, parent), flipped = false;
        if (!edge) {
          edge = g.edge(parent, v);
          flipped = true;
        }
        g.node(v).rank = g.node(parent).rank + (flipped ? edge.minlen : -edge.minlen);
      });
    }
    function isTreeEdge(tree, u, v) {
      return tree.hasEdge(u, v);
    }
    function isDescendant(tree, vLabel, rootLabel) {
      return rootLabel.low <= vLabel.lim && vLabel.lim <= rootLabel.lim;
    }
  }
});

// node_modules/dagre/lib/rank/index.js
var require_rank = __commonJS({
  "node_modules/dagre/lib/rank/index.js"(exports, module) {
    "use strict";
    var rankUtil = require_util2();
    var longestPath = rankUtil.longestPath;
    var feasibleTree = require_feasible_tree();
    var networkSimplex = require_network_simplex();
    module.exports = rank;
    function rank(g) {
      switch (g.graph().ranker) {
        case "network-simplex":
          networkSimplexRanker(g);
          break;
        case "tight-tree":
          tightTreeRanker(g);
          break;
        case "longest-path":
          longestPathRanker(g);
          break;
        default:
          networkSimplexRanker(g);
      }
    }
    var longestPathRanker = longestPath;
    function tightTreeRanker(g) {
      longestPath(g);
      feasibleTree(g);
    }
    function networkSimplexRanker(g) {
      networkSimplex(g);
    }
  }
});

// node_modules/dagre/lib/parent-dummy-chains.js
var require_parent_dummy_chains = __commonJS({
  "node_modules/dagre/lib/parent-dummy-chains.js"(exports, module) {
    var _ = require_lodash2();
    module.exports = parentDummyChains;
    function parentDummyChains(g) {
      var postorderNums = postorder(g);
      _.forEach(g.graph().dummyChains, function(v) {
        var node = g.node(v);
        var edgeObj = node.edgeObj;
        var pathData = findPath(g, postorderNums, edgeObj.v, edgeObj.w);
        var path = pathData.path;
        var lca = pathData.lca;
        var pathIdx = 0;
        var pathV = path[pathIdx];
        var ascending = true;
        while (v !== edgeObj.w) {
          node = g.node(v);
          if (ascending) {
            while ((pathV = path[pathIdx]) !== lca && g.node(pathV).maxRank < node.rank) {
              pathIdx++;
            }
            if (pathV === lca) {
              ascending = false;
            }
          }
          if (!ascending) {
            while (pathIdx < path.length - 1 && g.node(pathV = path[pathIdx + 1]).minRank <= node.rank) {
              pathIdx++;
            }
            pathV = path[pathIdx];
          }
          g.setParent(v, pathV);
          v = g.successors(v)[0];
        }
      });
    }
    function findPath(g, postorderNums, v, w) {
      var vPath = [];
      var wPath = [];
      var low = Math.min(postorderNums[v].low, postorderNums[w].low);
      var lim = Math.max(postorderNums[v].lim, postorderNums[w].lim);
      var parent;
      var lca;
      parent = v;
      do {
        parent = g.parent(parent);
        vPath.push(parent);
      } while (parent && (postorderNums[parent].low > low || lim > postorderNums[parent].lim));
      lca = parent;
      parent = w;
      while ((parent = g.parent(parent)) !== lca) {
        wPath.push(parent);
      }
      return { path: vPath.concat(wPath.reverse()), lca };
    }
    function postorder(g) {
      var result = {};
      var lim = 0;
      function dfs(v) {
        var low = lim;
        _.forEach(g.children(v), dfs);
        result[v] = { low, lim: lim++ };
      }
      _.forEach(g.children(), dfs);
      return result;
    }
  }
});

// node_modules/dagre/lib/nesting-graph.js
var require_nesting_graph = __commonJS({
  "node_modules/dagre/lib/nesting-graph.js"(exports, module) {
    var _ = require_lodash2();
    var util = require_util();
    module.exports = {
      run,
      cleanup
    };
    function run(g) {
      var root = util.addDummyNode(g, "root", {}, "_root");
      var depths = treeDepths(g);
      var height = _.max(_.values(depths)) - 1;
      var nodeSep = 2 * height + 1;
      g.graph().nestingRoot = root;
      _.forEach(g.edges(), function(e) {
        g.edge(e).minlen *= nodeSep;
      });
      var weight = sumWeights(g) + 1;
      _.forEach(g.children(), function(child) {
        dfs(g, root, nodeSep, weight, height, depths, child);
      });
      g.graph().nodeRankFactor = nodeSep;
    }
    function dfs(g, root, nodeSep, weight, height, depths, v) {
      var children = g.children(v);
      if (!children.length) {
        if (v !== root) {
          g.setEdge(root, v, { weight: 0, minlen: nodeSep });
        }
        return;
      }
      var top = util.addBorderNode(g, "_bt");
      var bottom = util.addBorderNode(g, "_bb");
      var label = g.node(v);
      g.setParent(top, v);
      label.borderTop = top;
      g.setParent(bottom, v);
      label.borderBottom = bottom;
      _.forEach(children, function(child) {
        dfs(g, root, nodeSep, weight, height, depths, child);
        var childNode = g.node(child);
        var childTop = childNode.borderTop ? childNode.borderTop : child;
        var childBottom = childNode.borderBottom ? childNode.borderBottom : child;
        var thisWeight = childNode.borderTop ? weight : 2 * weight;
        var minlen = childTop !== childBottom ? 1 : height - depths[v] + 1;
        g.setEdge(top, childTop, {
          weight: thisWeight,
          minlen,
          nestingEdge: true
        });
        g.setEdge(childBottom, bottom, {
          weight: thisWeight,
          minlen,
          nestingEdge: true
        });
      });
      if (!g.parent(v)) {
        g.setEdge(root, top, { weight: 0, minlen: height + depths[v] });
      }
    }
    function treeDepths(g) {
      var depths = {};
      function dfs2(v, depth) {
        var children = g.children(v);
        if (children && children.length) {
          _.forEach(children, function(child) {
            dfs2(child, depth + 1);
          });
        }
        depths[v] = depth;
      }
      _.forEach(g.children(), function(v) {
        dfs2(v, 1);
      });
      return depths;
    }
    function sumWeights(g) {
      return _.reduce(g.edges(), function(acc, e) {
        return acc + g.edge(e).weight;
      }, 0);
    }
    function cleanup(g) {
      var graphLabel = g.graph();
      g.removeNode(graphLabel.nestingRoot);
      delete graphLabel.nestingRoot;
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        if (edge.nestingEdge) {
          g.removeEdge(e);
        }
      });
    }
  }
});

// node_modules/dagre/lib/add-border-segments.js
var require_add_border_segments = __commonJS({
  "node_modules/dagre/lib/add-border-segments.js"(exports, module) {
    var _ = require_lodash2();
    var util = require_util();
    module.exports = addBorderSegments;
    function addBorderSegments(g) {
      function dfs(v) {
        var children = g.children(v);
        var node = g.node(v);
        if (children.length) {
          _.forEach(children, dfs);
        }
        if (_.has(node, "minRank")) {
          node.borderLeft = [];
          node.borderRight = [];
          for (var rank = node.minRank, maxRank = node.maxRank + 1; rank < maxRank; ++rank) {
            addBorderNode(g, "borderLeft", "_bl", v, node, rank);
            addBorderNode(g, "borderRight", "_br", v, node, rank);
          }
        }
      }
      _.forEach(g.children(), dfs);
    }
    function addBorderNode(g, prop, prefix, sg, sgNode, rank) {
      var label = { width: 0, height: 0, rank, borderType: prop };
      var prev = sgNode[prop][rank - 1];
      var curr = util.addDummyNode(g, "border", label, prefix);
      sgNode[prop][rank] = curr;
      g.setParent(curr, sg);
      if (prev) {
        g.setEdge(prev, curr, { weight: 1 });
      }
    }
  }
});

// node_modules/dagre/lib/coordinate-system.js
var require_coordinate_system = __commonJS({
  "node_modules/dagre/lib/coordinate-system.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    module.exports = {
      adjust,
      undo
    };
    function adjust(g) {
      var rankDir = g.graph().rankdir.toLowerCase();
      if (rankDir === "lr" || rankDir === "rl") {
        swapWidthHeight(g);
      }
    }
    function undo(g) {
      var rankDir = g.graph().rankdir.toLowerCase();
      if (rankDir === "bt" || rankDir === "rl") {
        reverseY(g);
      }
      if (rankDir === "lr" || rankDir === "rl") {
        swapXY(g);
        swapWidthHeight(g);
      }
    }
    function swapWidthHeight(g) {
      _.forEach(g.nodes(), function(v) {
        swapWidthHeightOne(g.node(v));
      });
      _.forEach(g.edges(), function(e) {
        swapWidthHeightOne(g.edge(e));
      });
    }
    function swapWidthHeightOne(attrs) {
      var w = attrs.width;
      attrs.width = attrs.height;
      attrs.height = w;
    }
    function reverseY(g) {
      _.forEach(g.nodes(), function(v) {
        reverseYOne(g.node(v));
      });
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        _.forEach(edge.points, reverseYOne);
        if (_.has(edge, "y")) {
          reverseYOne(edge);
        }
      });
    }
    function reverseYOne(attrs) {
      attrs.y = -attrs.y;
    }
    function swapXY(g) {
      _.forEach(g.nodes(), function(v) {
        swapXYOne(g.node(v));
      });
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        _.forEach(edge.points, swapXYOne);
        if (_.has(edge, "x")) {
          swapXYOne(edge);
        }
      });
    }
    function swapXYOne(attrs) {
      var x = attrs.x;
      attrs.x = attrs.y;
      attrs.y = x;
    }
  }
});

// node_modules/dagre/lib/order/init-order.js
var require_init_order = __commonJS({
  "node_modules/dagre/lib/order/init-order.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    module.exports = initOrder;
    function initOrder(g) {
      var visited = {};
      var simpleNodes = _.filter(g.nodes(), function(v) {
        return !g.children(v).length;
      });
      var maxRank = _.max(_.map(simpleNodes, function(v) {
        return g.node(v).rank;
      }));
      var layers = _.map(_.range(maxRank + 1), function() {
        return [];
      });
      function dfs(v) {
        if (_.has(visited, v)) return;
        visited[v] = true;
        var node = g.node(v);
        layers[node.rank].push(v);
        _.forEach(g.successors(v), dfs);
      }
      var orderedVs = _.sortBy(simpleNodes, function(v) {
        return g.node(v).rank;
      });
      _.forEach(orderedVs, dfs);
      return layers;
    }
  }
});

// node_modules/dagre/lib/order/cross-count.js
var require_cross_count = __commonJS({
  "node_modules/dagre/lib/order/cross-count.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    module.exports = crossCount;
    function crossCount(g, layering) {
      var cc = 0;
      for (var i = 1; i < layering.length; ++i) {
        cc += twoLayerCrossCount(g, layering[i - 1], layering[i]);
      }
      return cc;
    }
    function twoLayerCrossCount(g, northLayer, southLayer) {
      var southPos = _.zipObject(
        southLayer,
        _.map(southLayer, function(v, i) {
          return i;
        })
      );
      var southEntries = _.flatten(_.map(northLayer, function(v) {
        return _.sortBy(_.map(g.outEdges(v), function(e) {
          return { pos: southPos[e.w], weight: g.edge(e).weight };
        }), "pos");
      }), true);
      var firstIndex = 1;
      while (firstIndex < southLayer.length) firstIndex <<= 1;
      var treeSize = 2 * firstIndex - 1;
      firstIndex -= 1;
      var tree = _.map(new Array(treeSize), function() {
        return 0;
      });
      var cc = 0;
      _.forEach(southEntries.forEach(function(entry) {
        var index = entry.pos + firstIndex;
        tree[index] += entry.weight;
        var weightSum = 0;
        while (index > 0) {
          if (index % 2) {
            weightSum += tree[index + 1];
          }
          index = index - 1 >> 1;
          tree[index] += entry.weight;
        }
        cc += entry.weight * weightSum;
      }));
      return cc;
    }
  }
});

// node_modules/dagre/lib/order/barycenter.js
var require_barycenter = __commonJS({
  "node_modules/dagre/lib/order/barycenter.js"(exports, module) {
    var _ = require_lodash2();
    module.exports = barycenter;
    function barycenter(g, movable) {
      return _.map(movable, function(v) {
        var inV = g.inEdges(v);
        if (!inV.length) {
          return { v };
        } else {
          var result = _.reduce(inV, function(acc, e) {
            var edge = g.edge(e), nodeU = g.node(e.v);
            return {
              sum: acc.sum + edge.weight * nodeU.order,
              weight: acc.weight + edge.weight
            };
          }, { sum: 0, weight: 0 });
          return {
            v,
            barycenter: result.sum / result.weight,
            weight: result.weight
          };
        }
      });
    }
  }
});

// node_modules/dagre/lib/order/resolve-conflicts.js
var require_resolve_conflicts = __commonJS({
  "node_modules/dagre/lib/order/resolve-conflicts.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    module.exports = resolveConflicts;
    function resolveConflicts(entries, cg) {
      var mappedEntries = {};
      _.forEach(entries, function(entry, i) {
        var tmp = mappedEntries[entry.v] = {
          indegree: 0,
          "in": [],
          out: [],
          vs: [entry.v],
          i
        };
        if (!_.isUndefined(entry.barycenter)) {
          tmp.barycenter = entry.barycenter;
          tmp.weight = entry.weight;
        }
      });
      _.forEach(cg.edges(), function(e) {
        var entryV = mappedEntries[e.v];
        var entryW = mappedEntries[e.w];
        if (!_.isUndefined(entryV) && !_.isUndefined(entryW)) {
          entryW.indegree++;
          entryV.out.push(mappedEntries[e.w]);
        }
      });
      var sourceSet = _.filter(mappedEntries, function(entry) {
        return !entry.indegree;
      });
      return doResolveConflicts(sourceSet);
    }
    function doResolveConflicts(sourceSet) {
      var entries = [];
      function handleIn(vEntry) {
        return function(uEntry) {
          if (uEntry.merged) {
            return;
          }
          if (_.isUndefined(uEntry.barycenter) || _.isUndefined(vEntry.barycenter) || uEntry.barycenter >= vEntry.barycenter) {
            mergeEntries(vEntry, uEntry);
          }
        };
      }
      function handleOut(vEntry) {
        return function(wEntry) {
          wEntry["in"].push(vEntry);
          if (--wEntry.indegree === 0) {
            sourceSet.push(wEntry);
          }
        };
      }
      while (sourceSet.length) {
        var entry = sourceSet.pop();
        entries.push(entry);
        _.forEach(entry["in"].reverse(), handleIn(entry));
        _.forEach(entry.out, handleOut(entry));
      }
      return _.map(
        _.filter(entries, function(entry2) {
          return !entry2.merged;
        }),
        function(entry2) {
          return _.pick(entry2, ["vs", "i", "barycenter", "weight"]);
        }
      );
    }
    function mergeEntries(target, source) {
      var sum = 0;
      var weight = 0;
      if (target.weight) {
        sum += target.barycenter * target.weight;
        weight += target.weight;
      }
      if (source.weight) {
        sum += source.barycenter * source.weight;
        weight += source.weight;
      }
      target.vs = source.vs.concat(target.vs);
      target.barycenter = sum / weight;
      target.weight = weight;
      target.i = Math.min(source.i, target.i);
      source.merged = true;
    }
  }
});

// node_modules/dagre/lib/order/sort.js
var require_sort = __commonJS({
  "node_modules/dagre/lib/order/sort.js"(exports, module) {
    var _ = require_lodash2();
    var util = require_util();
    module.exports = sort;
    function sort(entries, biasRight) {
      var parts = util.partition(entries, function(entry) {
        return _.has(entry, "barycenter");
      });
      var sortable = parts.lhs, unsortable = _.sortBy(parts.rhs, function(entry) {
        return -entry.i;
      }), vs = [], sum = 0, weight = 0, vsIndex = 0;
      sortable.sort(compareWithBias(!!biasRight));
      vsIndex = consumeUnsortable(vs, unsortable, vsIndex);
      _.forEach(sortable, function(entry) {
        vsIndex += entry.vs.length;
        vs.push(entry.vs);
        sum += entry.barycenter * entry.weight;
        weight += entry.weight;
        vsIndex = consumeUnsortable(vs, unsortable, vsIndex);
      });
      var result = { vs: _.flatten(vs, true) };
      if (weight) {
        result.barycenter = sum / weight;
        result.weight = weight;
      }
      return result;
    }
    function consumeUnsortable(vs, unsortable, index) {
      var last;
      while (unsortable.length && (last = _.last(unsortable)).i <= index) {
        unsortable.pop();
        vs.push(last.vs);
        index++;
      }
      return index;
    }
    function compareWithBias(bias) {
      return function(entryV, entryW) {
        if (entryV.barycenter < entryW.barycenter) {
          return -1;
        } else if (entryV.barycenter > entryW.barycenter) {
          return 1;
        }
        return !bias ? entryV.i - entryW.i : entryW.i - entryV.i;
      };
    }
  }
});

// node_modules/dagre/lib/order/sort-subgraph.js
var require_sort_subgraph = __commonJS({
  "node_modules/dagre/lib/order/sort-subgraph.js"(exports, module) {
    var _ = require_lodash2();
    var barycenter = require_barycenter();
    var resolveConflicts = require_resolve_conflicts();
    var sort = require_sort();
    module.exports = sortSubgraph;
    function sortSubgraph(g, v, cg, biasRight) {
      var movable = g.children(v);
      var node = g.node(v);
      var bl = node ? node.borderLeft : void 0;
      var br = node ? node.borderRight : void 0;
      var subgraphs = {};
      if (bl) {
        movable = _.filter(movable, function(w) {
          return w !== bl && w !== br;
        });
      }
      var barycenters = barycenter(g, movable);
      _.forEach(barycenters, function(entry) {
        if (g.children(entry.v).length) {
          var subgraphResult = sortSubgraph(g, entry.v, cg, biasRight);
          subgraphs[entry.v] = subgraphResult;
          if (_.has(subgraphResult, "barycenter")) {
            mergeBarycenters(entry, subgraphResult);
          }
        }
      });
      var entries = resolveConflicts(barycenters, cg);
      expandSubgraphs(entries, subgraphs);
      var result = sort(entries, biasRight);
      if (bl) {
        result.vs = _.flatten([bl, result.vs, br], true);
        if (g.predecessors(bl).length) {
          var blPred = g.node(g.predecessors(bl)[0]), brPred = g.node(g.predecessors(br)[0]);
          if (!_.has(result, "barycenter")) {
            result.barycenter = 0;
            result.weight = 0;
          }
          result.barycenter = (result.barycenter * result.weight + blPred.order + brPred.order) / (result.weight + 2);
          result.weight += 2;
        }
      }
      return result;
    }
    function expandSubgraphs(entries, subgraphs) {
      _.forEach(entries, function(entry) {
        entry.vs = _.flatten(entry.vs.map(function(v) {
          if (subgraphs[v]) {
            return subgraphs[v].vs;
          }
          return v;
        }), true);
      });
    }
    function mergeBarycenters(target, other) {
      if (!_.isUndefined(target.barycenter)) {
        target.barycenter = (target.barycenter * target.weight + other.barycenter * other.weight) / (target.weight + other.weight);
        target.weight += other.weight;
      } else {
        target.barycenter = other.barycenter;
        target.weight = other.weight;
      }
    }
  }
});

// node_modules/dagre/lib/order/build-layer-graph.js
var require_build_layer_graph = __commonJS({
  "node_modules/dagre/lib/order/build-layer-graph.js"(exports, module) {
    var _ = require_lodash2();
    var Graph = require_graphlib2().Graph;
    module.exports = buildLayerGraph;
    function buildLayerGraph(g, rank, relationship) {
      var root = createRootNode(g), result = new Graph({ compound: true }).setGraph({ root }).setDefaultNodeLabel(function(v) {
        return g.node(v);
      });
      _.forEach(g.nodes(), function(v) {
        var node = g.node(v), parent = g.parent(v);
        if (node.rank === rank || node.minRank <= rank && rank <= node.maxRank) {
          result.setNode(v);
          result.setParent(v, parent || root);
          _.forEach(g[relationship](v), function(e) {
            var u = e.v === v ? e.w : e.v, edge = result.edge(u, v), weight = !_.isUndefined(edge) ? edge.weight : 0;
            result.setEdge(u, v, { weight: g.edge(e).weight + weight });
          });
          if (_.has(node, "minRank")) {
            result.setNode(v, {
              borderLeft: node.borderLeft[rank],
              borderRight: node.borderRight[rank]
            });
          }
        }
      });
      return result;
    }
    function createRootNode(g) {
      var v;
      while (g.hasNode(v = _.uniqueId("_root"))) ;
      return v;
    }
  }
});

// node_modules/dagre/lib/order/add-subgraph-constraints.js
var require_add_subgraph_constraints = __commonJS({
  "node_modules/dagre/lib/order/add-subgraph-constraints.js"(exports, module) {
    var _ = require_lodash2();
    module.exports = addSubgraphConstraints;
    function addSubgraphConstraints(g, cg, vs) {
      var prev = {}, rootPrev;
      _.forEach(vs, function(v) {
        var child = g.parent(v), parent, prevChild;
        while (child) {
          parent = g.parent(child);
          if (parent) {
            prevChild = prev[parent];
            prev[parent] = child;
          } else {
            prevChild = rootPrev;
            rootPrev = child;
          }
          if (prevChild && prevChild !== child) {
            cg.setEdge(prevChild, child);
            return;
          }
          child = parent;
        }
      });
    }
  }
});

// node_modules/dagre/lib/order/index.js
var require_order = __commonJS({
  "node_modules/dagre/lib/order/index.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var initOrder = require_init_order();
    var crossCount = require_cross_count();
    var sortSubgraph = require_sort_subgraph();
    var buildLayerGraph = require_build_layer_graph();
    var addSubgraphConstraints = require_add_subgraph_constraints();
    var Graph = require_graphlib2().Graph;
    var util = require_util();
    module.exports = order;
    function order(g) {
      var maxRank = util.maxRank(g), downLayerGraphs = buildLayerGraphs(g, _.range(1, maxRank + 1), "inEdges"), upLayerGraphs = buildLayerGraphs(g, _.range(maxRank - 1, -1, -1), "outEdges");
      var layering = initOrder(g);
      assignOrder(g, layering);
      var bestCC = Number.POSITIVE_INFINITY, best;
      for (var i = 0, lastBest = 0; lastBest < 4; ++i, ++lastBest) {
        sweepLayerGraphs(i % 2 ? downLayerGraphs : upLayerGraphs, i % 4 >= 2);
        layering = util.buildLayerMatrix(g);
        var cc = crossCount(g, layering);
        if (cc < bestCC) {
          lastBest = 0;
          best = _.cloneDeep(layering);
          bestCC = cc;
        }
      }
      assignOrder(g, best);
    }
    function buildLayerGraphs(g, ranks, relationship) {
      return _.map(ranks, function(rank) {
        return buildLayerGraph(g, rank, relationship);
      });
    }
    function sweepLayerGraphs(layerGraphs, biasRight) {
      var cg = new Graph();
      _.forEach(layerGraphs, function(lg) {
        var root = lg.graph().root;
        var sorted = sortSubgraph(lg, root, cg, biasRight);
        _.forEach(sorted.vs, function(v, i) {
          lg.node(v).order = i;
        });
        addSubgraphConstraints(lg, cg, sorted.vs);
      });
    }
    function assignOrder(g, layering) {
      _.forEach(layering, function(layer) {
        _.forEach(layer, function(v, i) {
          g.node(v).order = i;
        });
      });
    }
  }
});

// node_modules/dagre/lib/position/bk.js
var require_bk = __commonJS({
  "node_modules/dagre/lib/position/bk.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var Graph = require_graphlib2().Graph;
    var util = require_util();
    module.exports = {
      positionX,
      findType1Conflicts,
      findType2Conflicts,
      addConflict,
      hasConflict,
      verticalAlignment,
      horizontalCompaction,
      alignCoordinates,
      findSmallestWidthAlignment,
      balance
    };
    function findType1Conflicts(g, layering) {
      var conflicts = {};
      function visitLayer(prevLayer, layer) {
        var k0 = 0, scanPos = 0, prevLayerLength = prevLayer.length, lastNode = _.last(layer);
        _.forEach(layer, function(v, i) {
          var w = findOtherInnerSegmentNode(g, v), k1 = w ? g.node(w).order : prevLayerLength;
          if (w || v === lastNode) {
            _.forEach(layer.slice(scanPos, i + 1), function(scanNode) {
              _.forEach(g.predecessors(scanNode), function(u) {
                var uLabel = g.node(u), uPos = uLabel.order;
                if ((uPos < k0 || k1 < uPos) && !(uLabel.dummy && g.node(scanNode).dummy)) {
                  addConflict(conflicts, u, scanNode);
                }
              });
            });
            scanPos = i + 1;
            k0 = k1;
          }
        });
        return layer;
      }
      _.reduce(layering, visitLayer);
      return conflicts;
    }
    function findType2Conflicts(g, layering) {
      var conflicts = {};
      function scan(south, southPos, southEnd, prevNorthBorder, nextNorthBorder) {
        var v;
        _.forEach(_.range(southPos, southEnd), function(i) {
          v = south[i];
          if (g.node(v).dummy) {
            _.forEach(g.predecessors(v), function(u) {
              var uNode = g.node(u);
              if (uNode.dummy && (uNode.order < prevNorthBorder || uNode.order > nextNorthBorder)) {
                addConflict(conflicts, u, v);
              }
            });
          }
        });
      }
      function visitLayer(north, south) {
        var prevNorthPos = -1, nextNorthPos, southPos = 0;
        _.forEach(south, function(v, southLookahead) {
          if (g.node(v).dummy === "border") {
            var predecessors = g.predecessors(v);
            if (predecessors.length) {
              nextNorthPos = g.node(predecessors[0]).order;
              scan(south, southPos, southLookahead, prevNorthPos, nextNorthPos);
              southPos = southLookahead;
              prevNorthPos = nextNorthPos;
            }
          }
          scan(south, southPos, south.length, nextNorthPos, north.length);
        });
        return south;
      }
      _.reduce(layering, visitLayer);
      return conflicts;
    }
    function findOtherInnerSegmentNode(g, v) {
      if (g.node(v).dummy) {
        return _.find(g.predecessors(v), function(u) {
          return g.node(u).dummy;
        });
      }
    }
    function addConflict(conflicts, v, w) {
      if (v > w) {
        var tmp = v;
        v = w;
        w = tmp;
      }
      var conflictsV = conflicts[v];
      if (!conflictsV) {
        conflicts[v] = conflictsV = {};
      }
      conflictsV[w] = true;
    }
    function hasConflict(conflicts, v, w) {
      if (v > w) {
        var tmp = v;
        v = w;
        w = tmp;
      }
      return _.has(conflicts[v], w);
    }
    function verticalAlignment(g, layering, conflicts, neighborFn) {
      var root = {}, align = {}, pos = {};
      _.forEach(layering, function(layer) {
        _.forEach(layer, function(v, order) {
          root[v] = v;
          align[v] = v;
          pos[v] = order;
        });
      });
      _.forEach(layering, function(layer) {
        var prevIdx = -1;
        _.forEach(layer, function(v) {
          var ws = neighborFn(v);
          if (ws.length) {
            ws = _.sortBy(ws, function(w2) {
              return pos[w2];
            });
            var mp = (ws.length - 1) / 2;
            for (var i = Math.floor(mp), il = Math.ceil(mp); i <= il; ++i) {
              var w = ws[i];
              if (align[v] === v && prevIdx < pos[w] && !hasConflict(conflicts, v, w)) {
                align[w] = v;
                align[v] = root[v] = root[w];
                prevIdx = pos[w];
              }
            }
          }
        });
      });
      return { root, align };
    }
    function horizontalCompaction(g, layering, root, align, reverseSep) {
      var xs = {}, blockG = buildBlockGraph(g, layering, root, reverseSep), borderType = reverseSep ? "borderLeft" : "borderRight";
      function iterate(setXsFunc, nextNodesFunc) {
        var stack = blockG.nodes();
        var elem = stack.pop();
        var visited = {};
        while (elem) {
          if (visited[elem]) {
            setXsFunc(elem);
          } else {
            visited[elem] = true;
            stack.push(elem);
            stack = stack.concat(nextNodesFunc(elem));
          }
          elem = stack.pop();
        }
      }
      function pass1(elem) {
        xs[elem] = blockG.inEdges(elem).reduce(function(acc, e) {
          return Math.max(acc, xs[e.v] + blockG.edge(e));
        }, 0);
      }
      function pass2(elem) {
        var min = blockG.outEdges(elem).reduce(function(acc, e) {
          return Math.min(acc, xs[e.w] - blockG.edge(e));
        }, Number.POSITIVE_INFINITY);
        var node = g.node(elem);
        if (min !== Number.POSITIVE_INFINITY && node.borderType !== borderType) {
          xs[elem] = Math.max(xs[elem], min);
        }
      }
      iterate(pass1, blockG.predecessors.bind(blockG));
      iterate(pass2, blockG.successors.bind(blockG));
      _.forEach(align, function(v) {
        xs[v] = xs[root[v]];
      });
      return xs;
    }
    function buildBlockGraph(g, layering, root, reverseSep) {
      var blockGraph = new Graph(), graphLabel = g.graph(), sepFn = sep(graphLabel.nodesep, graphLabel.edgesep, reverseSep);
      _.forEach(layering, function(layer) {
        var u;
        _.forEach(layer, function(v) {
          var vRoot = root[v];
          blockGraph.setNode(vRoot);
          if (u) {
            var uRoot = root[u], prevMax = blockGraph.edge(uRoot, vRoot);
            blockGraph.setEdge(uRoot, vRoot, Math.max(sepFn(g, v, u), prevMax || 0));
          }
          u = v;
        });
      });
      return blockGraph;
    }
    function findSmallestWidthAlignment(g, xss) {
      return _.minBy(_.values(xss), function(xs) {
        var max = Number.NEGATIVE_INFINITY;
        var min = Number.POSITIVE_INFINITY;
        _.forIn(xs, function(x, v) {
          var halfWidth = width(g, v) / 2;
          max = Math.max(x + halfWidth, max);
          min = Math.min(x - halfWidth, min);
        });
        return max - min;
      });
    }
    function alignCoordinates(xss, alignTo) {
      var alignToVals = _.values(alignTo), alignToMin = _.min(alignToVals), alignToMax = _.max(alignToVals);
      _.forEach(["u", "d"], function(vert) {
        _.forEach(["l", "r"], function(horiz) {
          var alignment = vert + horiz, xs = xss[alignment], delta;
          if (xs === alignTo) return;
          var xsVals = _.values(xs);
          delta = horiz === "l" ? alignToMin - _.min(xsVals) : alignToMax - _.max(xsVals);
          if (delta) {
            xss[alignment] = _.mapValues(xs, function(x) {
              return x + delta;
            });
          }
        });
      });
    }
    function balance(xss, align) {
      return _.mapValues(xss.ul, function(ignore, v) {
        if (align) {
          return xss[align.toLowerCase()][v];
        } else {
          var xs = _.sortBy(_.map(xss, v));
          return (xs[1] + xs[2]) / 2;
        }
      });
    }
    function positionX(g) {
      var layering = util.buildLayerMatrix(g);
      var conflicts = _.merge(
        findType1Conflicts(g, layering),
        findType2Conflicts(g, layering)
      );
      var xss = {};
      var adjustedLayering;
      _.forEach(["u", "d"], function(vert) {
        adjustedLayering = vert === "u" ? layering : _.values(layering).reverse();
        _.forEach(["l", "r"], function(horiz) {
          if (horiz === "r") {
            adjustedLayering = _.map(adjustedLayering, function(inner) {
              return _.values(inner).reverse();
            });
          }
          var neighborFn = (vert === "u" ? g.predecessors : g.successors).bind(g);
          var align = verticalAlignment(g, adjustedLayering, conflicts, neighborFn);
          var xs = horizontalCompaction(
            g,
            adjustedLayering,
            align.root,
            align.align,
            horiz === "r"
          );
          if (horiz === "r") {
            xs = _.mapValues(xs, function(x) {
              return -x;
            });
          }
          xss[vert + horiz] = xs;
        });
      });
      var smallestWidth = findSmallestWidthAlignment(g, xss);
      alignCoordinates(xss, smallestWidth);
      return balance(xss, g.graph().align);
    }
    function sep(nodeSep, edgeSep, reverseSep) {
      return function(g, v, w) {
        var vLabel = g.node(v);
        var wLabel = g.node(w);
        var sum = 0;
        var delta;
        sum += vLabel.width / 2;
        if (_.has(vLabel, "labelpos")) {
          switch (vLabel.labelpos.toLowerCase()) {
            case "l":
              delta = -vLabel.width / 2;
              break;
            case "r":
              delta = vLabel.width / 2;
              break;
          }
        }
        if (delta) {
          sum += reverseSep ? delta : -delta;
        }
        delta = 0;
        sum += (vLabel.dummy ? edgeSep : nodeSep) / 2;
        sum += (wLabel.dummy ? edgeSep : nodeSep) / 2;
        sum += wLabel.width / 2;
        if (_.has(wLabel, "labelpos")) {
          switch (wLabel.labelpos.toLowerCase()) {
            case "l":
              delta = wLabel.width / 2;
              break;
            case "r":
              delta = -wLabel.width / 2;
              break;
          }
        }
        if (delta) {
          sum += reverseSep ? delta : -delta;
        }
        delta = 0;
        return sum;
      };
    }
    function width(g, v) {
      return g.node(v).width;
    }
  }
});

// node_modules/dagre/lib/position/index.js
var require_position = __commonJS({
  "node_modules/dagre/lib/position/index.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var util = require_util();
    var positionX = require_bk().positionX;
    module.exports = position;
    function position(g) {
      g = util.asNonCompoundGraph(g);
      positionY(g);
      _.forEach(positionX(g), function(x, v) {
        g.node(v).x = x;
      });
    }
    function positionY(g) {
      var layering = util.buildLayerMatrix(g);
      var rankSep = g.graph().ranksep;
      var prevY = 0;
      _.forEach(layering, function(layer) {
        var maxHeight = _.max(_.map(layer, function(v) {
          return g.node(v).height;
        }));
        _.forEach(layer, function(v) {
          g.node(v).y = prevY + maxHeight / 2;
        });
        prevY += maxHeight + rankSep;
      });
    }
  }
});

// node_modules/dagre/lib/layout.js
var require_layout = __commonJS({
  "node_modules/dagre/lib/layout.js"(exports, module) {
    "use strict";
    var _ = require_lodash2();
    var acyclic = require_acyclic();
    var normalize = require_normalize();
    var rank = require_rank();
    var normalizeRanks = require_util().normalizeRanks;
    var parentDummyChains = require_parent_dummy_chains();
    var removeEmptyRanks = require_util().removeEmptyRanks;
    var nestingGraph = require_nesting_graph();
    var addBorderSegments = require_add_border_segments();
    var coordinateSystem = require_coordinate_system();
    var order = require_order();
    var position = require_position();
    var util = require_util();
    var Graph = require_graphlib2().Graph;
    module.exports = layout;
    function layout(g, opts) {
      var time = opts && opts.debugTiming ? util.time : util.notime;
      time("layout", function() {
        var layoutGraph = time("  buildLayoutGraph", function() {
          return buildLayoutGraph(g);
        });
        time("  runLayout", function() {
          runLayout(layoutGraph, time);
        });
        time("  updateInputGraph", function() {
          updateInputGraph(g, layoutGraph);
        });
      });
    }
    function runLayout(g, time) {
      time("    makeSpaceForEdgeLabels", function() {
        makeSpaceForEdgeLabels(g);
      });
      time("    removeSelfEdges", function() {
        removeSelfEdges(g);
      });
      time("    acyclic", function() {
        acyclic.run(g);
      });
      time("    nestingGraph.run", function() {
        nestingGraph.run(g);
      });
      time("    rank", function() {
        rank(util.asNonCompoundGraph(g));
      });
      time("    injectEdgeLabelProxies", function() {
        injectEdgeLabelProxies(g);
      });
      time("    removeEmptyRanks", function() {
        removeEmptyRanks(g);
      });
      time("    nestingGraph.cleanup", function() {
        nestingGraph.cleanup(g);
      });
      time("    normalizeRanks", function() {
        normalizeRanks(g);
      });
      time("    assignRankMinMax", function() {
        assignRankMinMax(g);
      });
      time("    removeEdgeLabelProxies", function() {
        removeEdgeLabelProxies(g);
      });
      time("    normalize.run", function() {
        normalize.run(g);
      });
      time("    parentDummyChains", function() {
        parentDummyChains(g);
      });
      time("    addBorderSegments", function() {
        addBorderSegments(g);
      });
      time("    order", function() {
        order(g);
      });
      time("    insertSelfEdges", function() {
        insertSelfEdges(g);
      });
      time("    adjustCoordinateSystem", function() {
        coordinateSystem.adjust(g);
      });
      time("    position", function() {
        position(g);
      });
      time("    positionSelfEdges", function() {
        positionSelfEdges(g);
      });
      time("    removeBorderNodes", function() {
        removeBorderNodes(g);
      });
      time("    normalize.undo", function() {
        normalize.undo(g);
      });
      time("    fixupEdgeLabelCoords", function() {
        fixupEdgeLabelCoords(g);
      });
      time("    undoCoordinateSystem", function() {
        coordinateSystem.undo(g);
      });
      time("    translateGraph", function() {
        translateGraph(g);
      });
      time("    assignNodeIntersects", function() {
        assignNodeIntersects(g);
      });
      time("    reversePoints", function() {
        reversePointsForReversedEdges(g);
      });
      time("    acyclic.undo", function() {
        acyclic.undo(g);
      });
    }
    function updateInputGraph(inputGraph, layoutGraph) {
      _.forEach(inputGraph.nodes(), function(v) {
        var inputLabel = inputGraph.node(v);
        var layoutLabel = layoutGraph.node(v);
        if (inputLabel) {
          inputLabel.x = layoutLabel.x;
          inputLabel.y = layoutLabel.y;
          if (layoutGraph.children(v).length) {
            inputLabel.width = layoutLabel.width;
            inputLabel.height = layoutLabel.height;
          }
        }
      });
      _.forEach(inputGraph.edges(), function(e) {
        var inputLabel = inputGraph.edge(e);
        var layoutLabel = layoutGraph.edge(e);
        inputLabel.points = layoutLabel.points;
        if (_.has(layoutLabel, "x")) {
          inputLabel.x = layoutLabel.x;
          inputLabel.y = layoutLabel.y;
        }
      });
      inputGraph.graph().width = layoutGraph.graph().width;
      inputGraph.graph().height = layoutGraph.graph().height;
    }
    var graphNumAttrs = ["nodesep", "edgesep", "ranksep", "marginx", "marginy"];
    var graphDefaults = { ranksep: 50, edgesep: 20, nodesep: 50, rankdir: "tb" };
    var graphAttrs = ["acyclicer", "ranker", "rankdir", "align"];
    var nodeNumAttrs = ["width", "height"];
    var nodeDefaults = { width: 0, height: 0 };
    var edgeNumAttrs = ["minlen", "weight", "width", "height", "labeloffset"];
    var edgeDefaults = {
      minlen: 1,
      weight: 1,
      width: 0,
      height: 0,
      labeloffset: 10,
      labelpos: "r"
    };
    var edgeAttrs = ["labelpos"];
    function buildLayoutGraph(inputGraph) {
      var g = new Graph({ multigraph: true, compound: true });
      var graph = canonicalize(inputGraph.graph());
      g.setGraph(_.merge(
        {},
        graphDefaults,
        selectNumberAttrs(graph, graphNumAttrs),
        _.pick(graph, graphAttrs)
      ));
      _.forEach(inputGraph.nodes(), function(v) {
        var node = canonicalize(inputGraph.node(v));
        g.setNode(v, _.defaults(selectNumberAttrs(node, nodeNumAttrs), nodeDefaults));
        g.setParent(v, inputGraph.parent(v));
      });
      _.forEach(inputGraph.edges(), function(e) {
        var edge = canonicalize(inputGraph.edge(e));
        g.setEdge(e, _.merge(
          {},
          edgeDefaults,
          selectNumberAttrs(edge, edgeNumAttrs),
          _.pick(edge, edgeAttrs)
        ));
      });
      return g;
    }
    function makeSpaceForEdgeLabels(g) {
      var graph = g.graph();
      graph.ranksep /= 2;
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        edge.minlen *= 2;
        if (edge.labelpos.toLowerCase() !== "c") {
          if (graph.rankdir === "TB" || graph.rankdir === "BT") {
            edge.width += edge.labeloffset;
          } else {
            edge.height += edge.labeloffset;
          }
        }
      });
    }
    function injectEdgeLabelProxies(g) {
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        if (edge.width && edge.height) {
          var v = g.node(e.v);
          var w = g.node(e.w);
          var label = { rank: (w.rank - v.rank) / 2 + v.rank, e };
          util.addDummyNode(g, "edge-proxy", label, "_ep");
        }
      });
    }
    function assignRankMinMax(g) {
      var maxRank = 0;
      _.forEach(g.nodes(), function(v) {
        var node = g.node(v);
        if (node.borderTop) {
          node.minRank = g.node(node.borderTop).rank;
          node.maxRank = g.node(node.borderBottom).rank;
          maxRank = _.max(maxRank, node.maxRank);
        }
      });
      g.graph().maxRank = maxRank;
    }
    function removeEdgeLabelProxies(g) {
      _.forEach(g.nodes(), function(v) {
        var node = g.node(v);
        if (node.dummy === "edge-proxy") {
          g.edge(node.e).labelRank = node.rank;
          g.removeNode(v);
        }
      });
    }
    function translateGraph(g) {
      var minX = Number.POSITIVE_INFINITY;
      var maxX = 0;
      var minY = Number.POSITIVE_INFINITY;
      var maxY = 0;
      var graphLabel = g.graph();
      var marginX = graphLabel.marginx || 0;
      var marginY = graphLabel.marginy || 0;
      function getExtremes(attrs) {
        var x = attrs.x;
        var y = attrs.y;
        var w = attrs.width;
        var h = attrs.height;
        minX = Math.min(minX, x - w / 2);
        maxX = Math.max(maxX, x + w / 2);
        minY = Math.min(minY, y - h / 2);
        maxY = Math.max(maxY, y + h / 2);
      }
      _.forEach(g.nodes(), function(v) {
        getExtremes(g.node(v));
      });
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        if (_.has(edge, "x")) {
          getExtremes(edge);
        }
      });
      minX -= marginX;
      minY -= marginY;
      _.forEach(g.nodes(), function(v) {
        var node = g.node(v);
        node.x -= minX;
        node.y -= minY;
      });
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        _.forEach(edge.points, function(p) {
          p.x -= minX;
          p.y -= minY;
        });
        if (_.has(edge, "x")) {
          edge.x -= minX;
        }
        if (_.has(edge, "y")) {
          edge.y -= minY;
        }
      });
      graphLabel.width = maxX - minX + marginX;
      graphLabel.height = maxY - minY + marginY;
    }
    function assignNodeIntersects(g) {
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        var nodeV = g.node(e.v);
        var nodeW = g.node(e.w);
        var p1, p2;
        if (!edge.points) {
          edge.points = [];
          p1 = nodeW;
          p2 = nodeV;
        } else {
          p1 = edge.points[0];
          p2 = edge.points[edge.points.length - 1];
        }
        edge.points.unshift(util.intersectRect(nodeV, p1));
        edge.points.push(util.intersectRect(nodeW, p2));
      });
    }
    function fixupEdgeLabelCoords(g) {
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        if (_.has(edge, "x")) {
          if (edge.labelpos === "l" || edge.labelpos === "r") {
            edge.width -= edge.labeloffset;
          }
          switch (edge.labelpos) {
            case "l":
              edge.x -= edge.width / 2 + edge.labeloffset;
              break;
            case "r":
              edge.x += edge.width / 2 + edge.labeloffset;
              break;
          }
        }
      });
    }
    function reversePointsForReversedEdges(g) {
      _.forEach(g.edges(), function(e) {
        var edge = g.edge(e);
        if (edge.reversed) {
          edge.points.reverse();
        }
      });
    }
    function removeBorderNodes(g) {
      _.forEach(g.nodes(), function(v) {
        if (g.children(v).length) {
          var node = g.node(v);
          var t = g.node(node.borderTop);
          var b = g.node(node.borderBottom);
          var l = g.node(_.last(node.borderLeft));
          var r = g.node(_.last(node.borderRight));
          node.width = Math.abs(r.x - l.x);
          node.height = Math.abs(b.y - t.y);
          node.x = l.x + node.width / 2;
          node.y = t.y + node.height / 2;
        }
      });
      _.forEach(g.nodes(), function(v) {
        if (g.node(v).dummy === "border") {
          g.removeNode(v);
        }
      });
    }
    function removeSelfEdges(g) {
      _.forEach(g.edges(), function(e) {
        if (e.v === e.w) {
          var node = g.node(e.v);
          if (!node.selfEdges) {
            node.selfEdges = [];
          }
          node.selfEdges.push({ e, label: g.edge(e) });
          g.removeEdge(e);
        }
      });
    }
    function insertSelfEdges(g) {
      var layers = util.buildLayerMatrix(g);
      _.forEach(layers, function(layer) {
        var orderShift = 0;
        _.forEach(layer, function(v, i) {
          var node = g.node(v);
          node.order = i + orderShift;
          _.forEach(node.selfEdges, function(selfEdge) {
            util.addDummyNode(g, "selfedge", {
              width: selfEdge.label.width,
              height: selfEdge.label.height,
              rank: node.rank,
              order: i + ++orderShift,
              e: selfEdge.e,
              label: selfEdge.label
            }, "_se");
          });
          delete node.selfEdges;
        });
      });
    }
    function positionSelfEdges(g) {
      _.forEach(g.nodes(), function(v) {
        var node = g.node(v);
        if (node.dummy === "selfedge") {
          var selfNode = g.node(node.e.v);
          var x = selfNode.x + selfNode.width / 2;
          var y = selfNode.y;
          var dx = node.x - x;
          var dy = selfNode.height / 2;
          g.setEdge(node.e, node.label);
          g.removeNode(v);
          node.label.points = [
            { x: x + 2 * dx / 3, y: y - dy },
            { x: x + 5 * dx / 6, y: y - dy },
            { x: x + dx, y },
            { x: x + 5 * dx / 6, y: y + dy },
            { x: x + 2 * dx / 3, y: y + dy }
          ];
          node.label.x = node.x;
          node.label.y = node.y;
        }
      });
    }
    function selectNumberAttrs(obj, attrs) {
      return _.mapValues(_.pick(obj, attrs), Number);
    }
    function canonicalize(attrs) {
      var newAttrs = {};
      _.forEach(attrs, function(v, k) {
        newAttrs[k.toLowerCase()] = v;
      });
      return newAttrs;
    }
  }
});

// node_modules/dagre/lib/debug.js
var require_debug = __commonJS({
  "node_modules/dagre/lib/debug.js"(exports, module) {
    var _ = require_lodash2();
    var util = require_util();
    var Graph = require_graphlib2().Graph;
    module.exports = {
      debugOrdering
    };
    function debugOrdering(g) {
      var layerMatrix = util.buildLayerMatrix(g);
      var h = new Graph({ compound: true, multigraph: true }).setGraph({});
      _.forEach(g.nodes(), function(v) {
        h.setNode(v, { label: v });
        h.setParent(v, "layer" + g.node(v).rank);
      });
      _.forEach(g.edges(), function(e) {
        h.setEdge(e.v, e.w, {}, e.name);
      });
      _.forEach(layerMatrix, function(layer, i) {
        var layerV = "layer" + i;
        h.setNode(layerV, { rank: "same" });
        _.reduce(layer, function(u, v) {
          h.setEdge(u, v, { style: "invis" });
          return v;
        });
      });
      return h;
    }
  }
});

// node_modules/dagre/lib/version.js
var require_version2 = __commonJS({
  "node_modules/dagre/lib/version.js"(exports, module) {
    module.exports = "0.8.5";
  }
});

// node_modules/dagre/index.js
var require_dagre = __commonJS({
  "node_modules/dagre/index.js"(exports, module) {
    module.exports = {
      graphlib: require_graphlib2(),
      layout: require_layout(),
      debug: require_debug(),
      util: {
        time: require_util().time,
        notime: require_util().notime
      },
      version: require_version2()
    };
  }
});

// node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "node_modules/react/cjs/react.production.js"(exports) {
    "use strict";
    var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = Symbol.for("react.memo");
    var REACT_LAZY_TYPE = Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key.replace(/[=:]/g, function(match) {
        return escaperLookup[match];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result;
        ctor = ctor();
        ctor.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject;
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error;
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = ctor);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    var Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports.Activity = REACT_ACTIVITY_TYPE;
    exports.Children = Children;
    exports.Component = Component;
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.Profiler = REACT_PROFILER_TYPE;
    exports.PureComponent = PureComponent;
    exports.StrictMode = REACT_STRICT_MODE_TYPE;
    exports.Suspense = REACT_SUSPENSE_TYPE;
    exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports.cacheSignal = function() {
      return null;
    };
    exports.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key = element.key;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key, props);
    };
    exports.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports.createElement = function(type, config, children) {
      var propName, props = {}, key = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key, props);
    };
    exports.createRef = function() {
      return { current: null };
    };
    exports.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports.isValidElement = isValidElement;
    exports.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports.startTransition = function(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    };
    exports.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports.useDebugValue = function() {
    };
    exports.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    exports.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports.version = "19.2.8";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports, module) {
    "use strict";
    "production" !== process.env.NODE_ENV && function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          oldElement.props,
          oldElement._owner,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var ioInfo = payload._ioInfo;
          null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
          ioInfo = payload._result;
          var thenable = ioInfo();
          thenable.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 1;
                payload._result = moduleObject;
                var _ioInfo = payload._ioInfo;
                null != _ioInfo && (_ioInfo.end = performance.now());
                void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
              }
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 2;
                payload._result = error;
                var _ioInfo2 = payload._ioInfo;
                null != _ioInfo2 && (_ioInfo2.end = performance.now());
                void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            }
          );
          ioInfo = payload._ioInfo;
          if (null != ioInfo) {
            ioInfo.value = thenable;
            var displayName = thenable.displayName;
            "string" === typeof displayName && (ioInfo.name = displayName);
          }
          -1 === payload._status && (payload._status = 0, payload._result = thenable);
        }
        if (1 === payload._status)
          return ioInfo = payload._result, void 0 === ioInfo && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ioInfo
          ), "default" in ioInfo || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ioInfo
          ), ioInfo.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function releaseAsyncTransition() {
        ReactSharedInternals.asyncTransitions--;
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module && module[requireString]).call(
              module,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      var fnName = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports.Activity = REACT_ACTIVITY_TYPE;
      exports.Children = fnName;
      exports.Component = Component;
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.Profiler = REACT_PROFILER_TYPE;
      exports.PureComponent = PureComponent;
      exports.StrictMode = REACT_STRICT_MODE_TYPE;
      exports.Suspense = REACT_SUSPENSE_TYPE;
      exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports.__COMPILER_RUNTIME = deprecatedAPIs;
      exports.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports.cacheSignal = function() {
        return null;
      };
      exports.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key,
          props,
          owner,
          element._debugStack,
          element._debugTask
        );
        for (key = 2; key < arguments.length; key++)
          validateChildKeys(arguments[key]);
        return props;
      };
      exports.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++)
          validateChildKeys(arguments[i]);
        i = {};
        var key = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        key && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return ReactElement(
          type,
          key,
          i,
          getOwner(),
          propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports.isValidElement = isValidElement;
      exports.lazy = function(ctor) {
        ctor = { _status: -1, _result: ctor };
        var lazyType = {
          $$typeof: REACT_LAZY_TYPE,
          _payload: ctor,
          _init: lazyInitializer
        }, ioInfo = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        ctor._ioInfo = ioInfo;
        lazyType._debugInfo = [{ awaited: ioInfo }];
        return lazyType;
      };
      exports.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports.startTransition = function(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      };
      exports.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports.useEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useEffect(create, deps);
      };
      exports.useEffectEvent = function(callback) {
        return resolveDispatcher().useEffectEvent(callback);
      };
      exports.useId = function() {
        return resolveDispatcher().useId();
      };
      exports.useImperativeHandle = function(ref, create, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create, deps);
      };
      exports.useInsertionEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create, deps);
      };
      exports.useLayoutEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create, deps);
      };
      exports.useMemo = function(create, deps) {
        return resolveDispatcher().useMemo(create, deps);
      };
      exports.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports.version = "19.2.8";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    }();
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports, module) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module.exports = require_react_production();
    } else {
      module.exports = require_react_development();
    }
  }
});

// node_modules/react/cjs/react-jsx-runtime.production.js
var require_react_jsx_runtime_production = __commonJS({
  "node_modules/react/cjs/react-jsx-runtime.production.js"(exports) {
    "use strict";
    var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
    var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
    function jsxProd(type, config, maybeKey) {
      var key = null;
      void 0 !== maybeKey && (key = "" + maybeKey);
      void 0 !== config.key && (key = "" + config.key);
      if ("key" in config) {
        maybeKey = {};
        for (var propName in config)
          "key" !== propName && (maybeKey[propName] = config[propName]);
      } else maybeKey = config;
      config = maybeKey.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== config ? config : null,
        props: maybeKey
      };
    }
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.jsx = jsxProd;
    exports.jsxs = jsxProd;
  }
});

// node_modules/react/cjs/react-jsx-runtime.development.js
var require_react_jsx_runtime_development = __commonJS({
  "node_modules/react/cjs/react-jsx-runtime.development.js"(exports) {
    "use strict";
    "production" !== process.env.NODE_ENV && function() {
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
        var children = config.children;
        if (void 0 !== children)
          if (isStaticChildren)
            if (isArrayImpl(children)) {
              for (isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)
                validateChildKeys(children[isStaticChildren]);
              Object.freeze && Object.freeze(children);
            } else
              console.error(
                "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
              );
          else validateChildKeys(children);
        if (hasOwnProperty.call(config, "key")) {
          children = getComponentNameFromType(type);
          var keys = Object.keys(config).filter(function(k) {
            return "key" !== k;
          });
          isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
          didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error(
            'A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />',
            isStaticChildren,
            children,
            keys,
            children
          ), didWarnAboutKeySpread[children + isStaticChildren] = true);
        }
        children = null;
        void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
        hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
        if ("key" in config) {
          maybeKey = {};
          for (var propName in config)
            "key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        children && defineKeyPropWarningGetter(
          maybeKey,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        return ReactElement(
          type,
          children,
          maybeKey,
          getOwner(),
          debugStack,
          debugTask
        );
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      var React = require_react(), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      React = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(
        React,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutKeySpread = {};
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.jsx = function(type, config, maybeKey) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return jsxDEVImpl(
          type,
          config,
          maybeKey,
          false,
          trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports.jsxs = function(type, config, maybeKey) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return jsxDEVImpl(
          type,
          config,
          maybeKey,
          true,
          trackActualOwner ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
    }();
  }
});

// node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "node_modules/react/jsx-runtime.js"(exports, module) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module.exports = require_react_jsx_runtime_production();
    } else {
      module.exports = require_react_jsx_runtime_development();
    }
  }
});

// node_modules/merslim/dist/index.js
var import_dagre = __toESM(require_dagre(), 1);
var import_react = __toESM(require_react(), 1);
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
var __defProp2 = Object.defineProperty;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames2(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
};
function layoutFlowchart(ir, options = {}) {
  const defaultSize = options.defaultNodeSize ?? { width: 180, height: 60 };
  const nodeSizes = options.nodeSizes ?? /* @__PURE__ */ new Map();
  const nodeSep = options.nodeSeparation ?? 60;
  const rankSep = options.rankSeparation ?? 80;
  const margin = options.margin ?? 24;
  const g = new import_dagre.default.graphlib.Graph({ multigraph: true, compound: true });
  g.setGraph({
    rankdir: DAGRE_RANK_DIR[ir.direction],
    nodesep: nodeSep,
    ranksep: rankSep,
    marginx: margin,
    marginy: margin
  });
  g.setDefaultEdgeLabel(() => ({}));
  const subgraphIds = /* @__PURE__ */ new Set();
  if (ir.subgraphs) {
    for (const sg of ir.subgraphs) {
      g.setNode(sg.id, { label: sg.label, clusterLabelPos: "top" });
      subgraphIds.add(sg.id);
    }
  }
  const representativeChild = /* @__PURE__ */ new Map();
  for (const node of ir.nodes) {
    const size = nodeSizes.get(node.id) ?? defaultSize;
    g.setNode(node.id, { ...size, label: node.label });
    if (node.subgraph) {
      g.setParent(node.id, node.subgraph);
      if (!representativeChild.has(node.subgraph)) {
        representativeChild.set(node.subgraph, node.id);
      }
    }
  }
  const resolveEndpoint = (id) => {
    if (!subgraphIds.has(id)) return id;
    return representativeChild.get(id) ?? null;
  };
  for (const edge of ir.edges) {
    const source = resolveEndpoint(edge.source);
    const target = resolveEndpoint(edge.target);
    if (!source || !target) continue;
    if (!g.hasNode(source) || !g.hasNode(target)) continue;
    g.setEdge(source, target, edge.label ? { label: edge.label } : {});
  }
  import_dagre.default.layout(g);
  const nodePositions = /* @__PURE__ */ new Map();
  let maxX = 0;
  let maxY = 0;
  for (const node of ir.nodes) {
    const { x, y } = g.node(node.id);
    const size = nodeSizes.get(node.id) ?? defaultSize;
    const topLeft = { x: x - size.width / 2, y: y - size.height / 2 };
    nodePositions.set(node.id, topLeft);
    maxX = Math.max(maxX, topLeft.x + size.width);
    maxY = Math.max(maxY, topLeft.y + size.height);
  }
  return {
    nodePositions,
    width: maxX + margin,
    height: maxY + margin
  };
}
var DAGRE_RANK_DIR;
var init_dagreLayout = __esm({
  "src/utils/diagrams/layout/dagreLayout.ts"() {
    DAGRE_RANK_DIR = {
      TB: "TB",
      BT: "BT",
      LR: "LR",
      RL: "RL"
    };
  }
});
function getDiagramTheme(dark) {
  return dark ? DARK : LIGHT;
}
var LIGHT;
var DARK;
var init_theme = __esm({
  "src/components/diagrams/shared/theme.ts"() {
    LIGHT = {
      canvasBg: "#f8fafc",
      // slate-50
      edgeColor: "#94a3b8",
      // slate-400
      edgeLabel: "#475569",
      // slate-600
      edgeLabelBg: "#ffffff",
      subgraphBg: "rgba(241, 245, 249, 0.5)",
      // slate-100/50
      subgraphBorder: "#cbd5e1",
      // slate-300
      subgraphLabel: "#475569",
      nodeShadow: "rgba(15, 23, 42, 0.08)",
      byKind: {
        service: {
          border: "#86efac",
          headerBg: "#ecfdf5",
          accent: "#10b981",
          bodyBg: "#ffffff",
          text: "#064e3b",
          iconColor: "#10b981"
        },
        database: {
          border: "#fcd34d",
          headerBg: "#fffbeb",
          accent: "#f59e0b",
          bodyBg: "#ffffff",
          text: "#78350f",
          iconColor: "#f59e0b"
        },
        queue: {
          border: "#fda4af",
          headerBg: "#fff1f2",
          accent: "#f43f5e",
          bodyBg: "#ffffff",
          text: "#881337",
          iconColor: "#f43f5e"
        },
        storage: {
          border: "#67e8f9",
          headerBg: "#ecfeff",
          accent: "#06b6d4",
          bodyBg: "#ffffff",
          text: "#164e63",
          iconColor: "#06b6d4"
        },
        user: {
          border: "#93c5fd",
          headerBg: "#eff6ff",
          accent: "#3b82f6",
          bodyBg: "#ffffff",
          text: "#1e3a8a",
          iconColor: "#3b82f6"
        },
        client: {
          border: "#c4b5fd",
          headerBg: "#f5f3ff",
          accent: "#8b5cf6",
          bodyBg: "#ffffff",
          text: "#4c1d95",
          iconColor: "#8b5cf6"
        },
        external: {
          border: "#cbd5e1",
          headerBg: "#f1f5f9",
          accent: "#64748b",
          bodyBg: "#ffffff",
          text: "#334155",
          iconColor: "#64748b"
        },
        process: {
          border: "#bfdbfe",
          headerBg: "#eff6ff",
          accent: "#60a5fa",
          bodyBg: "#ffffff",
          text: "#1e3a8a",
          iconColor: "#60a5fa"
        },
        decision: {
          border: "#c4b5fd",
          headerBg: "#f5f3ff",
          accent: "#8b5cf6",
          bodyBg: "#faf5ff",
          text: "#4c1d95",
          iconColor: "#8b5cf6"
        },
        start: {
          border: "#86efac",
          headerBg: "#ecfdf5",
          accent: "#10b981",
          bodyBg: "#ffffff",
          text: "#064e3b",
          iconColor: "#10b981"
        },
        end: {
          border: "#fda4af",
          headerBg: "#fff1f2",
          accent: "#f43f5e",
          bodyBg: "#ffffff",
          text: "#881337",
          iconColor: "#f43f5e"
        },
        icon: {
          border: "#cbd5e1",
          headerBg: "#ffffff",
          accent: "#64748b",
          bodyBg: "#ffffff",
          text: "#1e293b",
          iconColor: "#64748b"
        },
        plain: {
          border: "#cbd5e1",
          headerBg: "#f8fafc",
          accent: "#64748b",
          bodyBg: "#ffffff",
          text: "#1e293b",
          iconColor: "#64748b"
        }
      }
    };
    DARK = {
      canvasBg: "#0f172a",
      edgeColor: "#64748b",
      edgeLabel: "#cbd5e1",
      edgeLabelBg: "#1e293b",
      subgraphBg: "rgba(30, 41, 59, 0.5)",
      subgraphBorder: "#475569",
      subgraphLabel: "#94a3b8",
      nodeShadow: "rgba(0, 0, 0, 0.30)",
      byKind: {
        service: {
          border: "#10b981",
          headerBg: "rgba(16, 185, 129, 0.12)",
          accent: "#34d399",
          bodyBg: "#1e293b",
          text: "#a7f3d0",
          iconColor: "#34d399"
        },
        database: {
          border: "#f59e0b",
          headerBg: "rgba(245, 158, 11, 0.12)",
          accent: "#fbbf24",
          bodyBg: "#1e293b",
          text: "#fde68a",
          iconColor: "#fbbf24"
        },
        queue: {
          border: "#f43f5e",
          headerBg: "rgba(244, 63, 94, 0.12)",
          accent: "#fb7185",
          bodyBg: "#1e293b",
          text: "#fecdd3",
          iconColor: "#fb7185"
        },
        storage: {
          border: "#06b6d4",
          headerBg: "rgba(6, 182, 212, 0.12)",
          accent: "#22d3ee",
          bodyBg: "#1e293b",
          text: "#a5f3fc",
          iconColor: "#22d3ee"
        },
        user: {
          border: "#3b82f6",
          headerBg: "rgba(59, 130, 246, 0.12)",
          accent: "#60a5fa",
          bodyBg: "#1e293b",
          text: "#bfdbfe",
          iconColor: "#60a5fa"
        },
        client: {
          border: "#8b5cf6",
          headerBg: "rgba(139, 92, 246, 0.12)",
          accent: "#a78bfa",
          bodyBg: "#1e293b",
          text: "#ddd6fe",
          iconColor: "#a78bfa"
        },
        external: {
          border: "#64748b",
          headerBg: "rgba(100, 116, 139, 0.12)",
          accent: "#94a3b8",
          bodyBg: "#1e293b",
          text: "#cbd5e1",
          iconColor: "#94a3b8"
        },
        process: {
          border: "#60a5fa",
          headerBg: "rgba(96, 165, 250, 0.12)",
          accent: "#93c5fd",
          bodyBg: "#1e293b",
          text: "#bfdbfe",
          iconColor: "#93c5fd"
        },
        decision: {
          border: "#8b5cf6",
          headerBg: "rgba(139, 92, 246, 0.12)",
          accent: "#a78bfa",
          bodyBg: "#1e293b",
          text: "#ddd6fe",
          iconColor: "#a78bfa"
        },
        start: {
          border: "#10b981",
          headerBg: "rgba(16, 185, 129, 0.12)",
          accent: "#34d399",
          bodyBg: "#1e293b",
          text: "#a7f3d0",
          iconColor: "#34d399"
        },
        end: {
          border: "#f43f5e",
          headerBg: "rgba(244, 63, 94, 0.12)",
          accent: "#fb7185",
          bodyBg: "#1e293b",
          text: "#fecdd3",
          iconColor: "#fb7185"
        },
        icon: {
          border: "#475569",
          headerBg: "#1e293b",
          accent: "#94a3b8",
          bodyBg: "#1e293b",
          text: "#e2e8f0",
          iconColor: "#94a3b8"
        },
        plain: {
          border: "#475569",
          headerBg: "#1e293b",
          accent: "#94a3b8",
          bodyBg: "#1e293b",
          text: "#e2e8f0",
          iconColor: "#94a3b8"
        }
      }
    };
  }
});
function escXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function palette(dark) {
  return {
    common: dark ? DARK_COMMON : LIGHT_COMMON,
    byKind: dark ? DARK_KIND : LIGHT_KIND
  };
}
function flowchartNodeSize(node) {
  if (node.kind === "user" || node.kind === "start" || node.kind === "end") {
    return { width: 84, height: 84 };
  }
  if (node.kind === "icon") return { width: 100, height: 96 };
  if (node.kind === "decision") {
    const segs2 = splitOnBr(node.label);
    const maxLen2 = Math.max(...segs2.map((s) => s.length));
    const wrapLines2 = segs2.reduce((acc, s) => acc + Math.max(1, Math.ceil(s.length / 16)), 0);
    return {
      width: Math.max(140, Math.min(280, maxLen2 * 11 + 60)),
      height: Math.max(96, Math.min(160, wrapLines2 * 32 + 64))
    };
  }
  if (node.kind === "queue") return { width: 220, height: 64 };
  const segs = splitOnBr(node.label);
  const maxLen = Math.max(...segs.map((s) => s.length));
  const wrapLines = segs.reduce((acc, s) => acc + Math.max(1, Math.ceil(s.length / 24)), 0);
  return {
    width: Math.max(160, Math.min(320, maxLen * 8 + 40)),
    height: 48 + (wrapLines - 1) * 18
  };
}
function splitOnBr(text) {
  return text.split(BR_REGEX);
}
function wrapText(text, maxChars) {
  const segments = splitOnBr(text);
  const out = [];
  for (const seg of segments) {
    if (seg.length <= maxChars) {
      out.push(seg);
      continue;
    }
    const words = seg.split(/\s+/);
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > maxChars && line) {
        out.push(line);
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    }
    if (line) out.push(line);
  }
  return out;
}
function tspans(lines, x, lineHeight) {
  return lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escXml(l)}</tspan>`).join("");
}
function attachPoint(box, towards) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const tx = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}
function arrowDef(id, color) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`;
}
function svgOpen(viewX, viewY, w, h, bg, title) {
  const label = (title ?? "Diagram").trim() || "Diagram";
  const titleEl = `<title>${escXml(label)}</title>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewX} ${viewY} ${w} ${h}" width="${w}" height="${h}" font-family='${FONT_FAMILY}' role="img" aria-label="${escXml(label)}">${titleEl}<rect x="${viewX}" y="${viewY}" width="${w}" height="${h}" fill="${bg}"/>`;
}
function buildFlowchartSvg(ir, positions, options = {}) {
  const { common, byKind } = palette(options.dark ?? false);
  const padding = options.padding ?? 40;
  const boxes = /* @__PURE__ */ new Map();
  for (const node of ir.nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const size = flowchartNodeSize(node);
    boxes.set(node.id, { x: pos.x, y: pos.y, width: size.width, height: size.height });
  }
  if (boxes.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + "</svg>";
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);
  const parts = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg, "Flowchart diagram"));
  parts.push(`<defs>${arrowDef("arr", common.edgeColor)}</defs>`);
  for (const e of ir.edges) {
    const a = boxes.get(e.source);
    const b = boxes.get(e.target);
    if (!a || !b) continue;
    parts.push(buildEdgePath(a, b, e, common));
  }
  for (const node of ir.nodes) {
    const box = boxes.get(node.id);
    if (!box) continue;
    parts.push(buildFlowNode(node, box, byKind[node.kind]));
  }
  parts.push("</svg>");
  return parts.join("");
}
function buildEdgePath(a, b, edge, common) {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const p1 = attachPoint(a, bc);
  const p2 = attachPoint(b, ac);
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const horizontal = dx > dy;
  const cp = Math.max(30, (horizontal ? dx : dy) * 0.45);
  const c1 = horizontal ? { x: p1.x + Math.sign(p2.x - p1.x) * cp, y: p1.y } : { x: p1.x, y: p1.y + Math.sign(p2.y - p1.y) * cp };
  const c2 = horizontal ? { x: p2.x - Math.sign(p2.x - p1.x) * cp, y: p2.y } : { x: p2.x, y: p2.y - Math.sign(p2.y - p1.y) * cp };
  const dash = edge.kind === "dashed" ? ' stroke-dasharray="6 4"' : edge.kind === "dotted" ? ' stroke-dasharray="2 3"' : "";
  const sw = edge.kind === "thick" ? 2.5 : 1.5;
  const path = `<path d="M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}" stroke="${common.edgeColor}" stroke-width="${sw}" fill="none"${dash} marker-end="url(#arr)"/>`;
  if (!edge.label) return path;
  const lx = 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x;
  const ly = 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y;
  const text = escXml(edge.label);
  const w = text.length * 6.5 + 12;
  return path + `<rect x="${lx - w / 2}" y="${ly - 9}" width="${w}" height="16" fill="${common.edgeLabelBg}" rx="3"/><text x="${lx}" y="${ly + 3}" text-anchor="middle" font-size="11" font-weight="500" fill="${common.edgeLabel}">${text}</text>`;
}
function buildFlowNode(node, box, c) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (node.kind === "decision") {
    const left = box.x, right = box.x + box.width, top = box.y, bottom = box.y + box.height;
    const points = `${cx},${top} ${right},${cy} ${cx},${bottom} ${left},${cy}`;
    const lines2 = wrapText(node.label, 18);
    return `<polygon points="${points}" fill="${c.bodyBg}" stroke="${c.accent}" stroke-width="1.5"/><text x="${cx}" y="${cy - (lines2.length - 1) * 7}" text-anchor="middle" font-size="12" font-weight="600" fill="${c.text}">${tspans(lines2, cx, 14)}</text>`;
  }
  if (node.kind === "database") {
    const rx = box.width / 2;
    const ry = 8;
    const top = box.y;
    const bottom = box.y + box.height;
    const path = `M ${box.x} ${top + ry} A ${rx} ${ry} 0 0 0 ${box.x + box.width} ${top + ry} L ${box.x + box.width} ${bottom - ry} A ${rx} ${ry} 0 0 1 ${box.x} ${bottom - ry} Z`;
    const ellipse = `<ellipse cx="${cx}" cy="${top + ry}" rx="${rx}" ry="${ry}" fill="none" stroke="${c.accent}" stroke-width="2"/>`;
    const lines2 = wrapText(node.label, 24);
    return `<path d="${path}" fill="${c.bodyBg}" stroke="${c.border}" stroke-width="1"/>` + ellipse + `<text x="${cx}" y="${cy + 6 - (lines2.length - 1) * 7}" text-anchor="middle" font-size="13" font-weight="500" fill="${c.text}">${tspans(lines2, cx, 14)}</text>`;
  }
  if (node.kind === "user" || node.kind === "start" || node.kind === "end") {
    const r = Math.min(box.width, box.height) / 2;
    const lines2 = wrapText(node.label, 12);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.bodyBg}" stroke="${c.accent}" stroke-width="2"/><text x="${cx}" y="${cy + 4 - (lines2.length - 1) * 7}" text-anchor="middle" font-size="12" font-weight="600" fill="${c.text}">${tspans(lines2, cx, 14)}</text>`;
  }
  if (node.kind === "queue") {
    const lines2 = wrapText(node.label, 24);
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="${c.bodyBg}" stroke="${c.accent}" stroke-width="1"/><rect x="${box.x + 4}" y="${box.y + 4}" width="${box.width - 8}" height="${box.height - 8}" rx="5" fill="none" stroke="${c.border}" stroke-width="1"/><text x="${cx}" y="${cy + 5 - (lines2.length - 1) * 8}" text-anchor="middle" font-size="13" font-weight="500" fill="${c.text}">${tspans(lines2, cx, 16)}</text>`;
  }
  const lines = wrapText(node.label, 24);
  return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="10" fill="${c.bodyBg}" stroke="${c.border}" stroke-width="1"/><rect x="${box.x}" y="${box.y}" width="4" height="${box.height}" fill="${c.accent}"/><text x="${cx}" y="${cy + 4 - (lines.length - 1) * 8}" text-anchor="middle" font-size="13" font-weight="500" fill="${c.text}">${tspans(lines, cx, 16)}</text>`;
}
function buildStateSvg(ir, positions, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  const boxes = /* @__PURE__ */ new Map();
  for (const [id, p] of positions.topLevel) {
    boxes.set(id, p);
  }
  for (const [id, p] of positions.children) {
    const parent = boxes.get(p.parent);
    if (!parent) continue;
    boxes.set(id, { x: parent.x + p.x, y: parent.y + p.y, width: p.width, height: p.height });
  }
  if (boxes.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + "</svg>";
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);
  const parts = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg, "State diagram"));
  parts.push(`<defs>${arrowDef("arr", common.edgeColor)}</defs>`);
  for (const s of ir.states) {
    if (s.kind !== "composite") continue;
    const box = boxes.get(s.id);
    if (!box) continue;
    parts.push(
      `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="14" fill="${dark ? "rgba(15,23,42,0.5)" : "#ffffff"}" stroke="${common.border}" stroke-width="1.5"/><rect x="${box.x}" y="${box.y}" width="${box.width}" height="32" rx="14" fill="${dark ? "#1e293b" : "#f1f5f9"}"/><rect x="${box.x}" y="${box.y + 18}" width="${box.width}" height="14" fill="${dark ? "#1e293b" : "#f1f5f9"}"/><line x1="${box.x}" y1="${box.y + 32}" x2="${box.x + box.width}" y2="${box.y + 32}" stroke="${common.border}" stroke-width="1"/><text x="${box.x + box.width / 2}" y="${box.y + 21}" text-anchor="middle" font-size="13" font-weight="600" fill="${common.text}">${escXml(s.label || s.id)}</text>`
    );
  }
  for (const t of ir.transitions) {
    const a = boxes.get(t.source);
    const b = boxes.get(t.target);
    if (!a || !b) continue;
    parts.push(buildEdgePath(a, b, { source: t.source, target: t.target, label: t.label, kind: "solid" }, common));
  }
  for (const s of ir.states) {
    if (s.kind === "composite") continue;
    const box = boxes.get(s.id);
    if (!box) continue;
    parts.push(buildStateBox(s, box, common, dark));
  }
  parts.push("</svg>");
  return parts.join("");
}
function buildStateBox(s, box, common, dark) {
  if (s.kind === "start" || s.kind === "end") {
    const cx2 = box.x + box.width / 2;
    const cy2 = box.y + box.height / 2;
    const r = 12;
    const fill = s.kind === "start" ? dark ? "#e2e8f0" : "#0f172a" : dark ? "#0f172a" : "#ffffff";
    const stroke = dark ? "#e2e8f0" : "#0f172a";
    const inner = s.kind === "end" ? `<circle cx="${cx2}" cy="${cy2}" r="${r - 4}" fill="${dark ? "#e2e8f0" : "#0f172a"}"/>` : "";
    return `<circle cx="${cx2}" cy="${cy2}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${inner}`;
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="14" fill="${dark ? "#1e293b" : "#ffffff"}" stroke="${common.border}" stroke-width="1.5"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(s.label || s.id)}</text>`;
}
function buildClassSvg(ir, positions, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  if (positions.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + "</svg>";
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);
  const parts = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg, "Class diagram"));
  parts.push(`<defs>${arrowDef("arr", common.edgeColor)}</defs>`);
  for (const rel of ir.relations) {
    const a = positions.get(rel.source);
    const b = positions.get(rel.target);
    if (!a || !b) continue;
    const aBox = { x: a.x, y: a.y, width: a.width, height: a.height };
    const bBox = { x: b.x, y: b.y, width: b.width, height: b.height };
    const dashed = rel.kind === "dependency" || rel.kind === "realization";
    parts.push(buildEdgePath(aBox, bBox, { source: rel.source, target: rel.target, label: rel.label, kind: dashed ? "dashed" : "solid" }, common));
  }
  for (const cls of ir.classes) {
    const p = positions.get(cls.id);
    if (!p) continue;
    parts.push(buildClassNode(cls, p, common, dark));
  }
  parts.push("</svg>");
  return parts.join("");
}
function buildClassNode(cls, p, common, dark) {
  const headerH = 30;
  const rowH = 18;
  const attrs = cls.members.filter((m) => m.kind === "attribute");
  const methods = cls.members.filter((m) => m.kind === "method");
  const parts = [];
  parts.push(`<g transform="translate(${p.x},${p.y})">`);
  parts.push(`<rect width="${p.width}" height="${p.height}" rx="8" fill="${dark ? "#0f172a" : "#ffffff"}" stroke="${common.border}" stroke-width="1"/>`);
  parts.push(`<rect width="${p.width}" height="${headerH}" rx="8" fill="${dark ? "#1e293b" : "#f1f5f9"}"/>`);
  parts.push(`<rect y="${headerH - 8}" width="${p.width}" height="8" fill="${dark ? "#1e293b" : "#f1f5f9"}"/>`);
  parts.push(`<line x1="0" y1="${headerH}" x2="${p.width}" y2="${headerH}" stroke="${common.border}"/>`);
  parts.push(`<text x="${p.width / 2}" y="${headerH / 2 + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="${common.text}">${escXml(cls.label)}</text>`);
  let y = headerH + 14;
  for (const m of attrs) {
    parts.push(buildClassMember(m, y, p.width, common));
    y += rowH;
  }
  if (attrs.length > 0 && methods.length > 0) {
    parts.push(`<line x1="6" y1="${y - 6}" x2="${p.width - 6}" y2="${y - 6}" stroke="${common.border}" stroke-dasharray="3 2"/>`);
    y += 4;
  }
  for (const m of methods) {
    parts.push(buildClassMember(m, y, p.width, common));
    y += rowH;
  }
  parts.push("</g>");
  return parts.join("");
}
function buildClassMember(m, y, width, common) {
  const sym = m.visibility ? VIS_SYMBOL[m.visibility] ?? "" : "";
  const sig = m.kind === "method" ? `${m.name}(${m.parameters ?? ""})${m.returnType ? `: ${m.returnType}` : ""}` : `${m.name}${m.returnType ? `: ${m.returnType}` : ""}`;
  return `<text x="10" y="${y}" font-family='${MONO_FAMILY}' font-size="11" fill="${common.subtle}">${escXml(sym)}</text><text x="22" y="${y}" font-family='${MONO_FAMILY}' font-size="11" fill="${common.text}">${escXml(sig.length > 32 ? sig.slice(0, 31) + "\u2026" : sig)}</text>`;
}
function buildErSvg(ir, positions, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  const HEADER_H = 34;
  const ROW_H = 26;
  if (positions.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + "</svg>";
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);
  const parts = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg, "Entity-relationship diagram"));
  parts.push(`<defs>${arrowDef("arr", common.edgeColor)}</defs>`);
  for (const rel of ir.schema.relations) {
    const fromTable = ir.schema.tables.find((t) => t.name === rel.fromTable);
    const toTable = ir.schema.tables.find((t) => t.name === rel.toTable);
    if (!fromTable || !toTable) continue;
    const fromPos = positions.get(rel.fromTable);
    const toPos = positions.get(rel.toTable);
    if (!fromPos || !toPos) continue;
    const fromColIdx = fromTable.columns.findIndex((c) => c.name === rel.fromCol);
    const toColIdx = toTable.columns.findIndex((c) => c.name === rel.toCol);
    const fy = fromColIdx >= 0 ? fromPos.y + HEADER_H + fromColIdx * ROW_H + ROW_H / 2 : fromPos.y + fromPos.height / 2;
    const ty = toColIdx >= 0 ? toPos.y + HEADER_H + toColIdx * ROW_H + ROW_H / 2 : toPos.y + toPos.height / 2;
    const goRight = toPos.x + toPos.width / 2 > fromPos.x + fromPos.width / 2;
    const fx = goRight ? fromPos.x + fromPos.width : fromPos.x;
    const tx = goRight ? toPos.x : toPos.x + toPos.width;
    const cp = Math.max(40, Math.abs(tx - fx) * 0.55);
    const c1x = goRight ? fx + cp : fx - cp;
    const c2x = goRight ? tx - cp : tx + cp;
    parts.push(`<path d="M ${fx} ${fy} C ${c1x} ${fy}, ${c2x} ${ty}, ${tx} ${ty}" stroke="${common.edgeColor}" stroke-width="1.4" fill="none" stroke-dasharray="5 4" marker-end="url(#arr)"/>`);
    const lx = (fx + tx) / 2;
    const ly = (fy + ty) / 2 - 5;
    const labelText = fromColIdx >= 0 ? "FK" : rel.fromCol;
    const labelLines = splitOnBr(labelText);
    const labelY = ly - (labelLines.length - 1) * 5;
    parts.push(`<text x="${lx}" y="${labelY}" font-size="9" font-style="italic" fill="${common.subtle}" text-anchor="middle">${tspans(labelLines, lx, 10)}</text>`);
  }
  for (const table of ir.schema.tables) {
    const p = positions.get(table.name);
    if (!p) continue;
    parts.push(`<g transform="translate(${p.x},${p.y})">`);
    parts.push(`<rect width="${p.width}" height="${p.height}" rx="8" fill="${dark ? "#0f172a" : "#ffffff"}" stroke="${common.border}" stroke-width="1"/>`);
    parts.push(`<rect width="${p.width}" height="${HEADER_H}" rx="8" fill="${dark ? "#1e293b" : "#f8fafc"}"/>`);
    parts.push(`<rect y="${HEADER_H - 8}" width="${p.width}" height="8" fill="${dark ? "#1e293b" : "#f8fafc"}"/>`);
    parts.push(`<line x1="0" y1="${HEADER_H}" x2="${p.width}" y2="${HEADER_H}" stroke="${common.border}"/>`);
    parts.push(`<text x="12" y="${HEADER_H / 2 + 5}" font-family='${MONO_FAMILY}' font-size="12" font-weight="600" fill="${common.text}">${escXml(table.name)}</text>`);
    for (let i = 0; i < table.columns.length; i++) {
      const col = table.columns[i];
      const rowY = HEADER_H + i * ROW_H;
      const textY = rowY + ROW_H / 2 + 3;
      if (i > 0) {
        parts.push(`<line x1="8" y1="${rowY}" x2="${p.width - 8}" y2="${rowY}" stroke="${dark ? "#1e293b" : "#f1f5f9"}"/>`);
      }
      const nameColor = col.isPK ? "#d97706" : col.isFK ? "#0284c7" : dark ? "#cbd5e1" : "#475569";
      const marker = col.isPK ? "\u{1F511}" : col.isFK ? "\u2197" : "\xB7";
      parts.push(`<text x="14" y="${textY}" font-size="10" fill="${nameColor}">${marker}</text>`);
      parts.push(`<text x="28" y="${textY}" font-family='${MONO_FAMILY}' font-size="11" font-weight="${col.isPK ? "600" : "400"}" fill="${nameColor}">${escXml(col.name)}</text>`);
      parts.push(`<text x="${p.width - 12}" y="${textY}" text-anchor="end" font-family='${MONO_FAMILY}' font-size="10" fill="${common.subtle}">${escXml(col.type)}</text>`);
    }
    parts.push("</g>");
  }
  parts.push("</svg>");
  return parts.join("");
}
function buildMindmapSvg(ir, positions, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 60;
  if (positions.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + "</svg>";
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);
  const parts = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg, ir.root.label || "Mindmap"));
  const collect = (node) => {
    const p = positions.get(node.id);
    if (!p) return;
    for (const c of node.children) {
      const cp = positions.get(c.id);
      if (!cp) continue;
      const fx = p.x + p.width / 2;
      const fy = p.y + p.height / 2;
      const tx = cp.x + cp.width / 2;
      const ty = cp.y + cp.height / 2;
      const c1x = fx + (tx - fx) * 0.4;
      const c2x = fx + (tx - fx) * 0.6;
      parts.push(`<path d="M ${fx} ${fy} C ${c1x} ${fy}, ${c2x} ${ty}, ${tx} ${ty}" stroke="${common.edgeColor}" stroke-width="1.5" fill="none"/>`);
      collect(c);
    }
  };
  collect(ir.root);
  const palettes = [
    dark ? { bg: "#e2e8f0", border: "#f8fafc", text: "#0f172a" } : { bg: "#1e293b", border: "#0f172a", text: "#f8fafc" },
    dark ? { bg: "rgba(59,130,246,0.20)", border: "#60a5fa", text: "#bfdbfe" } : { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
    dark ? { bg: "rgba(16,185,129,0.20)", border: "#34d399", text: "#a7f3d0" } : { bg: "#dcfce7", border: "#10b981", text: "#064e3b" },
    dark ? { bg: "rgba(245,158,11,0.20)", border: "#fbbf24", text: "#fde68a" } : { bg: "#fef3c7", border: "#f59e0b", text: "#78350f" },
    dark ? { bg: "rgba(244,63,94,0.20)", border: "#fb7185", text: "#fecdd3" } : { bg: "#fee2e2", border: "#f43f5e", text: "#881337" },
    dark ? { bg: "rgba(139,92,246,0.20)", border: "#a78bfa", text: "#ddd6fe" } : { bg: "#ede9fe", border: "#8b5cf6", text: "#4c1d95" }
  ];
  const renderNode = (node) => {
    const p = positions.get(node.id);
    if (!p) return;
    const c = palettes[Math.min(p.depth, palettes.length - 1)];
    const isRoot = p.depth === 0;
    const radius = node.shape === "circle" ? Math.min(p.width, p.height) / 2 : node.shape === "rounded" ? 999 : node.shape === "square" ? 4 : 12;
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${radius}" ry="${radius}" fill="${c.bg}" stroke="${c.border}" stroke-width="2"/>`
    );
    parts.push(
      `<text x="${p.x + p.width / 2}" y="${p.y + p.height / 2 + 4}" text-anchor="middle" font-size="${isRoot ? 14 : 12}" font-weight="${isRoot ? 700 : 500}" fill="${c.text}">${escXml(node.label)}</text>`
    );
    for (const child of node.children) renderNode(child);
  };
  renderNode(ir.root);
  parts.push("</svg>");
  return parts.join("");
}
function buildGanttSvg(ir, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 24;
  if (ir.tasks.length === 0) return svgOpen(0, 0, 200, 60, common.canvasBg) + "</svg>";
  const sections = /* @__PURE__ */ new Map();
  for (const t of ir.tasks) {
    const s = t.section ?? "Tasks";
    if (!sections.has(s)) sections.set(s, []);
    sections.get(s).push(t);
  }
  const rowH = 30;
  const sectionHeaderH = 24;
  const labelW = 160;
  const chartW = 760;
  const headerH = 36;
  const totalRows = ir.tasks.length;
  const totalSections = sections.size;
  const titleH = ir.title ? 32 : 0;
  const bodyH = headerH + totalSections * sectionHeaderH + totalRows * rowH;
  const width = padding * 2 + labelW + chartW;
  const height = padding * 2 + titleH + bodyH;
  let minTime = Infinity, maxTime = -Infinity;
  for (const t of ir.tasks) {
    minTime = Math.min(minTime, new Date(t.start).getTime());
    maxTime = Math.max(maxTime, new Date(t.end).getTime());
  }
  if (!isFinite(minTime) || !isFinite(maxTime) || maxTime === minTime) maxTime = minTime + 864e5;
  const timeToX = (t) => padding + labelW + (t - minTime) / (maxTime - minTime) * chartW;
  const colors = dark ? {
    default: { fill: "rgba(59,130,246,0.30)", stroke: "#60a5fa", text: "#bfdbfe" },
    active: { fill: "rgba(245,158,11,0.30)", stroke: "#fbbf24", text: "#fde68a" },
    done: { fill: "rgba(16,185,129,0.30)", stroke: "#34d399", text: "#a7f3d0" },
    crit: { fill: "rgba(244,63,94,0.30)", stroke: "#fb7185", text: "#fecdd3" },
    milestone: { fill: "rgba(139,92,246,0.40)", stroke: "#a78bfa", text: "#ddd6fe" }
  } : {
    default: { fill: "#bfdbfe", stroke: "#3b82f6", text: "#1e3a8a" },
    active: { fill: "#fde68a", stroke: "#f59e0b", text: "#78350f" },
    done: { fill: "#a7f3d0", stroke: "#10b981", text: "#064e3b" },
    crit: { fill: "#fecaca", stroke: "#f43f5e", text: "#881337" },
    milestone: { fill: "#ddd6fe", stroke: "#8b5cf6", text: "#4c1d95" }
  };
  const parts = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg, ir.title || "Gantt chart"));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  const axisY = padding + titleH + headerH - 4;
  for (const ratio of [0, 0.5, 1]) {
    const x = padding + labelW + ratio * chartW;
    const time = minTime + (maxTime - minTime) * ratio;
    const date = new Date(time);
    const label = `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)}`;
    parts.push(`<text x="${x}" y="${axisY}" text-anchor="middle" font-size="10" fill="${common.subtle}">${escXml(label)}</text>`);
    parts.push(`<line x1="${x}" y1="${axisY + 4}" x2="${x}" y2="${padding + titleH + bodyH}" stroke="${common.border}" stroke-dasharray="2 3"/>`);
  }
  let cy = padding + titleH + headerH;
  for (const [section, tasks] of sections) {
    parts.push(`<rect x="${padding}" y="${cy}" width="${labelW + chartW}" height="${sectionHeaderH}" fill="${dark ? "#1e293b" : "#f8fafc"}"/>`);
    parts.push(`<text x="${padding + 8}" y="${cy + 16}" font-size="11" font-weight="600" fill="${common.text}">${escXml(section)}</text>`);
    cy += sectionHeaderH;
    for (const t of tasks) {
      const x1 = timeToX(new Date(t.start).getTime());
      const x2 = timeToX(new Date(t.end).getTime());
      const c = colors[t.status] ?? colors.default;
      parts.push(`<text x="${padding + 8}" y="${cy + rowH / 2 + 4}" font-size="11" fill="${common.text}">${escXml(t.label)}</text>`);
      if (t.status === "milestone") {
        const cx = x1;
        const my = cy + rowH / 2;
        parts.push(`<polygon points="${cx},${my - 7} ${cx + 7},${my} ${cx},${my + 7} ${cx - 7},${my}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`);
      } else {
        const w = Math.max(4, x2 - x1);
        parts.push(`<rect x="${x1}" y="${cy + 6}" width="${w}" height="${rowH - 12}" rx="4" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1"/>`);
      }
      cy += rowH;
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
function buildTimelineSvg(ir, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 24;
  if (ir.events.length === 0) return svgOpen(0, 0, 200, 60, common.canvasBg) + "</svg>";
  const sectionsMap = /* @__PURE__ */ new Map();
  for (const e of ir.events) {
    const s = e.section ?? "";
    if (!sectionsMap.has(s)) sectionsMap.set(s, []);
    sectionsMap.get(s).push(e);
  }
  const titleH = ir.title ? 32 : 0;
  const sectionHeaderH = 28;
  const eventH = 56;
  const rows = [];
  for (const [section, events] of sectionsMap) {
    if (section) rows.push({ type: "section", data: section });
    for (const e of events) rows.push({ type: "event", data: e });
  }
  const lineX = padding + 80;
  const eventBoxX = lineX + 24;
  const eventBoxW = 480;
  const width = padding * 2 + 80 + 24 + eventBoxW;
  let height = padding * 2 + titleH;
  for (const r of rows) height += r.type === "section" ? sectionHeaderH : eventH;
  height += 20;
  const sectionColors = ["#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4"];
  const parts = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg, ir.title || "Timeline"));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  parts.push(`<line x1="${lineX}" y1="${padding + titleH}" x2="${lineX}" y2="${height - padding}" stroke="${common.border}" stroke-width="2"/>`);
  let cy = padding + titleH + 8;
  let sectionIndex = -1;
  for (const r of rows) {
    if (r.type === "section") {
      sectionIndex++;
      parts.push(`<text x="${padding}" y="${cy + 16}" font-size="11" font-weight="700" fill="${common.subtle}">${escXml(r.data)}</text>`);
      cy += sectionHeaderH;
    } else {
      const e = r.data;
      const color = sectionColors[Math.max(0, sectionIndex) % sectionColors.length];
      parts.push(`<circle cx="${lineX}" cy="${cy + eventH / 2}" r="6" fill="${color}" stroke="${common.canvasBg}" stroke-width="2"/>`);
      parts.push(`<text x="${lineX - 12}" y="${cy + eventH / 2 + 4}" text-anchor="end" font-size="11" font-weight="600" fill="${common.text}">${escXml(e.period)}</text>`);
      parts.push(`<rect x="${eventBoxX}" y="${cy + 4}" width="${eventBoxW}" height="${eventH - 12}" rx="8" fill="${dark ? "rgba(30,41,59,0.6)" : "#f8fafc"}" stroke="${color}" stroke-width="1"/>`);
      const lines = wrapText(e.text, 60);
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        parts.push(`<text x="${eventBoxX + 12}" y="${cy + 22 + i * 14}" font-size="11" fill="${common.text}">${escXml(lines[i])}</text>`);
      }
      cy += eventH;
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
function buildPieSvg(ir, options = {}) {
  const { common } = palette(options.dark ?? false);
  const padding = options.padding ?? 20;
  const titleH = ir.title ? 32 : 0;
  const legendW = 200;
  const radius = 160;
  const cx = padding + radius + 16;
  const cy = padding + titleH + radius + 16;
  const width = padding * 2 + radius * 2 + 32 + legendW;
  const height = padding * 2 + titleH + radius * 2 + 32;
  const total = ir.slices.reduce((s, sl) => s + sl.value, 0);
  const parts = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg, ir.title || "Pie chart"));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  if (total === 0 || ir.slices.length === 0) {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${common.border}"/>`);
    parts.push("</svg>");
    return parts.join("");
  }
  let startAngle = -Math.PI / 2;
  ir.slices.forEach((slice, i) => {
    const fraction = slice.value / total;
    const endAngle = startAngle + fraction * Math.PI * 2;
    const fill = PIE_PALETTE[i % PIE_PALETTE.length];
    if (fraction >= 0.999) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${common.canvasBg}" stroke-width="2"/>`);
    } else {
      const x1 = cx + Math.cos(startAngle) * radius;
      const y1 = cy + Math.sin(startAngle) * radius;
      const x2 = cx + Math.cos(endAngle) * radius;
      const y2 = cy + Math.sin(endAngle) * radius;
      const largeArc = fraction > 0.5 ? 1 : 0;
      parts.push(
        `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${fill}" stroke="${common.canvasBg}" stroke-width="2"/>`
      );
    }
    if (ir.showData && fraction >= 0.04) {
      const mid = (startAngle + endAngle) / 2;
      const lx = cx + Math.cos(mid) * radius * 0.65;
      const ly = cy + Math.sin(mid) * radius * 0.65;
      parts.push(
        `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#ffffff">${(fraction * 100).toFixed(1)}%</text>`
      );
    }
    startAngle = endAngle;
  });
  const legendX = cx + radius + 24;
  let legendY = padding + titleH + 16;
  ir.slices.forEach((slice, i) => {
    const fill = PIE_PALETTE[i % PIE_PALETTE.length];
    const pct = (slice.value / total * 100).toFixed(1);
    parts.push(`<rect x="${legendX}" y="${legendY - 10}" width="14" height="14" rx="2" fill="${fill}"/>`);
    parts.push(`<text x="${legendX + 22}" y="${legendY + 1}" font-size="12" fill="${common.text}">${escXml(slice.label)}</text>`);
    parts.push(`<text x="${legendX + 22}" y="${legendY + 16}" font-size="10" fill="${common.subtle}">${slice.value} \xB7 ${pct}%</text>`);
    legendY += 32;
  });
  parts.push("</svg>");
  return parts.join("");
}
function buildQuadrantSvg(ir, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 60;
  const titleH = ir.title ? 32 : 0;
  const chartW = 700;
  const chartH = 500;
  const yAxis = ir.yAxisLabel ?? { low: "Low", high: "High" };
  const xAxis = ir.xAxisLabel ?? { low: "Low", high: "High" };
  const longestYLabel = Math.max(yAxis.low.length, yAxis.high.length);
  const leftPadding = Math.max(padding, longestYLabel * 7 + 24);
  const width = leftPadding + chartW + padding;
  const height = padding * 2 + titleH + chartH;
  const x0 = leftPadding;
  const y0 = padding + titleH;
  const tints = dark ? { q1: "rgba(16,185,129,0.18)", q2: "rgba(245,158,11,0.18)", q3: "rgba(244,63,94,0.18)", q4: "rgba(59,130,246,0.18)" } : { q1: "#10b98120", q2: "#f59e0b20", q3: "#ef444420", q4: "#3b82f620" };
  const parts = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg, ir.title || "Quadrant chart"));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  const halfW = chartW / 2;
  const halfH = chartH / 2;
  parts.push(`<rect x="${x0}" y="${y0 + halfH}" width="${halfW}" height="${halfH}" fill="${tints.q3}"/>`);
  parts.push(`<rect x="${x0 + halfW}" y="${y0 + halfH}" width="${halfW}" height="${halfH}" fill="${tints.q4}"/>`);
  parts.push(`<rect x="${x0}" y="${y0}" width="${halfW}" height="${halfH}" fill="${tints.q2}"/>`);
  parts.push(`<rect x="${x0 + halfW}" y="${y0}" width="${halfW}" height="${halfH}" fill="${tints.q1}"/>`);
  parts.push(`<line x1="${x0}" y1="${y0 + halfH}" x2="${x0 + chartW}" y2="${y0 + halfH}" stroke="${common.border}" stroke-width="1"/>`);
  parts.push(`<line x1="${x0 + halfW}" y1="${y0}" x2="${x0 + halfW}" y2="${y0 + chartH}" stroke="${common.border}" stroke-width="1"/>`);
  const labels = ir.quadrantLabels ?? {};
  if (labels.q1) parts.push(`<text x="${x0 + halfW + halfW / 2}" y="${y0 + halfH / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(labels.q1)}</text>`);
  if (labels.q2) parts.push(`<text x="${x0 + halfW / 2}" y="${y0 + halfH / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(labels.q2)}</text>`);
  if (labels.q3) parts.push(`<text x="${x0 + halfW / 2}" y="${y0 + halfH + halfH / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(labels.q3)}</text>`);
  if (labels.q4) parts.push(`<text x="${x0 + halfW + halfW / 2}" y="${y0 + halfH + halfH / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(labels.q4)}</text>`);
  parts.push(`<text x="${x0}" y="${y0 + chartH + 24}" text-anchor="start" font-size="12" fill="${common.text}">${escXml(xAxis.low)}</text>`);
  parts.push(`<text x="${x0 + chartW}" y="${y0 + chartH + 24}" text-anchor="end" font-size="12" fill="${common.text}">${escXml(xAxis.high)}</text>`);
  parts.push(`<text x="${x0 - 12}" y="${y0 + chartH}" text-anchor="end" font-size="12" fill="${common.text}">${escXml(yAxis.low)}</text>`);
  parts.push(`<text x="${x0 - 12}" y="${y0 + 12}" text-anchor="end" font-size="12" fill="${common.text}">${escXml(yAxis.high)}</text>`);
  for (const p of ir.points) {
    const px = x0 + p.x * chartW;
    const py = y0 + (1 - p.y) * chartH;
    parts.push(`<circle cx="${px}" cy="${py}" r="6" fill="#3b82f6" stroke="${common.canvasBg}" stroke-width="2"/>`);
    parts.push(`<text x="${px}" y="${py - 12}" text-anchor="middle" font-size="11" font-weight="500" fill="${common.text}">${escXml(p.label)}</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}
function buildJourneySvg(ir, options = {}) {
  const { common } = palette(options.dark ?? false);
  const padding = options.padding ?? 40;
  const titleH = ir.title ? 32 : 0;
  const SECTION_HEADER_H = 32;
  const TASK_H = 36;
  const labelW = 200;
  const chartW = 600;
  const SCORE_MAX = 7;
  const allTasks = [];
  ir.sections.forEach((s, idx) => {
    s.tasks.forEach((t) => allTasks.push({ sectionTitle: s.title, sectionIdx: idx, label: t.label, score: t.score, actors: t.actors }));
  });
  const totalH = padding * 2 + titleH + ir.sections.length * SECTION_HEADER_H + allTasks.length * TASK_H + 40;
  const width = padding * 2 + labelW + chartW;
  const height = totalH;
  const sectionColors = ["#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4"];
  const parts = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg, ir.title || "User journey"));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  const chartX = padding + labelW;
  const axisY = padding + titleH + 14;
  for (let s = 1; s <= SCORE_MAX; s++) {
    const x = chartX + (s - 1) / (SCORE_MAX - 1) * chartW;
    parts.push(`<text x="${x}" y="${axisY}" text-anchor="middle" font-size="10" fill="${common.subtle}">${s}</text>`);
  }
  let cy = padding + titleH + SECTION_HEADER_H;
  ir.sections.forEach((section, idx) => {
    const color = sectionColors[idx % sectionColors.length];
    parts.push(`<rect x="${padding}" y="${cy - SECTION_HEADER_H + 4}" width="${labelW + chartW}" height="${SECTION_HEADER_H - 4}" fill="${color}20" rx="6"/>`);
    parts.push(`<text x="${padding + 10}" y="${cy - 12}" font-size="12" font-weight="600" fill="${common.text}">${escXml(section.title)}</text>`);
    section.tasks.forEach((task) => {
      parts.push(`<text x="${padding + 10}" y="${cy + TASK_H / 2 + 4}" font-size="12" fill="${common.text}">${escXml(task.label)}</text>`);
      const scoreClamped = Math.max(1, Math.min(SCORE_MAX, task.score));
      const dotX = chartX + (scoreClamped - 1) / (SCORE_MAX - 1) * chartW;
      const dotY = cy + TASK_H / 2;
      parts.push(`<line x1="${chartX}" y1="${dotY}" x2="${chartX + chartW}" y2="${dotY}" stroke="${common.border}" stroke-dasharray="2 3"/>`);
      parts.push(`<circle cx="${dotX}" cy="${dotY}" r="8" fill="${color}" stroke="${common.canvasBg}" stroke-width="2"/>`);
      parts.push(`<text x="${dotX}" y="${dotY + 3}" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">${task.score}</text>`);
      if (task.actors.length > 0) {
        const actorsText = task.actors.join(", ");
        parts.push(`<text x="${dotX + 14}" y="${dotY + 4}" font-size="10" fill="${common.subtle}">${escXml(actorsText)}</text>`);
      }
      cy += TASK_H;
    });
    cy += SECTION_HEADER_H;
  });
  parts.push("</svg>");
  return parts.join("");
}
function archTint(icon, dark) {
  if (!icon) return dark ? { fill: "#1e293b", border: "#475569" } : { fill: "#ffffff", border: "#cbd5e1" };
  const key = Object.keys(ARCH_ICON_TINT).find((k) => icon.toLowerCase().includes(k));
  const base = key ? ARCH_ICON_TINT[key] : { fill: "#ffffff", border: "#cbd5e1" };
  if (!dark) return base;
  return { fill: `${base.border}25`, border: base.border };
}
function buildArchitectureSvg(ir, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  const SERVICE_W = 130;
  const SERVICE_H = 80;
  const byParent = /* @__PURE__ */ new Map();
  for (const n of ir.nodes) {
    const k = n.parent;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(n);
  }
  const groupBounds = /* @__PURE__ */ new Map();
  for (const node of ir.nodes) {
    if (node.kind !== "group") continue;
    const children = byParent.get(node.id) ?? [];
    const g = new import_dagre.default.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 50, marginx: 16, marginy: 16 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const c of children) {
      g.setNode(c.id, { width: SERVICE_W, height: SERVICE_H });
    }
    const childIds = new Set(children.map((c) => c.id));
    for (const e of ir.edges) {
      if (childIds.has(e.source) && childIds.has(e.target) && g.hasNode(e.source) && g.hasNode(e.target)) {
        g.setEdge(e.source, e.target);
      }
    }
    if (children.length > 0) import_dagre.default.layout(g);
    const positions = /* @__PURE__ */ new Map();
    let minLeft = Infinity, minTop = Infinity, maxRight = 0, maxBottom = 0;
    for (const c of children) {
      const { x, y } = g.node(c.id);
      const left = x - SERVICE_W / 2;
      const top = y - SERVICE_H / 2;
      positions.set(c.id, { x: left, y: top });
      minLeft = Math.min(minLeft, left);
      minTop = Math.min(minTop, top);
      maxRight = Math.max(maxRight, left + SERVICE_W);
      maxBottom = Math.max(maxBottom, top + SERVICE_H);
    }
    const HEADER = 28;
    const PAD = 16;
    const dx = PAD - (isFinite(minLeft) ? minLeft : 0);
    const dy = HEADER + PAD - (isFinite(minTop) ? minTop : 0);
    const offset = /* @__PURE__ */ new Map();
    for (const [id, p] of positions) offset.set(id, { x: p.x + dx, y: p.y + dy });
    groupBounds.set(node.id, {
      width: Math.max(220, (isFinite(maxRight - minLeft) ? maxRight - minLeft : 0) + PAD * 2),
      height: Math.max(120, (isFinite(maxBottom - minTop) ? maxBottom - minTop : 0) + HEADER + PAD * 2),
      positions: offset
    });
  }
  const topLevel = ir.nodes.filter((n) => !n.parent);
  const outer = new import_dagre.default.graphlib.Graph();
  outer.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 80, marginx: 32, marginy: 32 });
  outer.setDefaultEdgeLabel(() => ({}));
  for (const n of topLevel) {
    if (n.kind === "group") {
      const b = groupBounds.get(n.id);
      outer.setNode(n.id, { width: b.width, height: b.height });
    } else {
      outer.setNode(n.id, { width: SERVICE_W, height: SERVICE_H });
    }
  }
  for (const e of ir.edges) {
    if (outer.hasNode(e.source) && outer.hasNode(e.target)) outer.setEdge(e.source, e.target);
  }
  import_dagre.default.layout(outer);
  const abs = /* @__PURE__ */ new Map();
  for (const n of topLevel) {
    const { x, y } = outer.node(n.id);
    const w = n.kind === "group" ? groupBounds.get(n.id).width : SERVICE_W;
    const h = n.kind === "group" ? groupBounds.get(n.id).height : SERVICE_H;
    abs.set(n.id, { x: x - w / 2, y: y - h / 2, width: w, height: h, kind: n.kind, node: n });
  }
  for (const n of ir.nodes) {
    if (!n.parent) continue;
    const parentBox = abs.get(n.parent);
    if (!parentBox) continue;
    const pos = groupBounds.get(n.parent)?.positions.get(n.id);
    if (!pos) continue;
    abs.set(n.id, { x: parentBox.x + pos.x, y: parentBox.y + pos.y, width: SERVICE_W, height: SERVICE_H, kind: n.kind, node: n });
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of abs.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);
  const parts = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg, "Architecture diagram"));
  parts.push(`<defs>${arrowDef("arr", common.edgeColor)}</defs>`);
  for (const n of ir.nodes) {
    if (n.kind !== "group") continue;
    const b = abs.get(n.id);
    if (!b) continue;
    const tint = archTint(n.icon, dark);
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="12" fill="${tint.fill}" stroke="${tint.border}" stroke-width="1.5" stroke-dasharray="6 4"/>`
    );
    parts.push(`<text x="${b.x + 14}" y="${b.y + 18}" font-size="12" font-weight="700" fill="${common.text}">${escXml(n.label)}</text>`);
    if (n.icon) {
      parts.push(`<text x="${b.x + b.width - 14}" y="${b.y + 18}" text-anchor="end" font-size="9" fill="${common.subtle}">${escXml(n.icon)}</text>`);
    }
  }
  for (const e of ir.edges) {
    const a = abs.get(e.source);
    const b = abs.get(e.target);
    if (!a || !b) continue;
    parts.push(buildEdgePath(a, b, { source: e.source, target: e.target, label: e.label, kind: "solid" }, common));
  }
  for (const n of ir.nodes) {
    if (n.kind !== "service") continue;
    const b = abs.get(n.id);
    if (!b) continue;
    const tint = archTint(n.icon, dark);
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="10" fill="${tint.fill}" stroke="${tint.border}" stroke-width="1.5"/>`
    );
    parts.push(`<circle cx="${b.x + b.width / 2}" cy="${b.y + 22}" r="14" fill="${tint.border}" opacity="0.85"/>`);
    if (n.icon) {
      const short = n.icon.split(":").pop().slice(0, 3).toUpperCase();
      parts.push(`<text x="${b.x + b.width / 2}" y="${b.y + 26}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">${escXml(short)}</text>`);
    }
    parts.push(`<text x="${b.x + b.width / 2}" y="${b.y + 56}" text-anchor="middle" font-size="12" font-weight="600" fill="${common.text}">${escXml(n.label)}</text>`);
  }
  parts.push("</svg>");
  return parts.join("");
}
function c4StyleFor(kind, dark) {
  const isExternal = kind.endsWith("-external");
  const base = kind.startsWith("person") ? { fill: dark ? "rgba(8, 80, 134, 0.4)" : "#08427b", text: "#ffffff" } : kind.startsWith("system") ? { fill: dark ? "rgba(17, 102, 187, 0.4)" : "#1168bd", text: "#ffffff" } : kind.startsWith("container") ? { fill: dark ? "rgba(67, 130, 245, 0.4)" : "#438dd5", text: "#ffffff" } : kind.startsWith("component") ? { fill: dark ? "rgba(133, 187, 245, 0.4)" : "#85bbf0", text: "#0f172a" } : { fill: dark ? "rgba(148, 163, 184, 0.3)" : "#9ca3af", text: "#0f172a" };
  let shape = "rect";
  if (kind.startsWith("person")) shape = "person";
  else if (kind.endsWith("-db")) shape = "cylinder";
  else if (kind.endsWith("-queue")) shape = "queue";
  else if (kind.endsWith("boundary")) shape = "boundary";
  else if (kind === "node") shape = "node";
  return {
    fill: isExternal ? dark ? "rgba(100, 116, 139, 0.4)" : "#999999" : base.fill,
    border: isExternal ? "#64748b" : "#073b6f",
    text: base.text,
    badge: "#0f172a40",
    badgeText: "#ffffff",
    shape,
    dashed: shape === "boundary" || shape === "node"
  };
}
function c4BadgeLabel(kind) {
  if (kind.startsWith("person")) return "Person";
  if (kind.endsWith("-external")) {
    if (kind.startsWith("system")) return "External System";
    if (kind.startsWith("container")) return "External Container";
    if (kind.startsWith("component")) return "External Component";
  }
  if (kind.endsWith("-db")) return kind.startsWith("system") ? "System" : kind.startsWith("container") ? "Container" : "Component";
  if (kind.endsWith("-queue")) return kind.startsWith("system") ? "System" : kind.startsWith("container") ? "Container" : "Component";
  if (kind === "system") return "System";
  if (kind === "container") return "Container";
  if (kind === "component") return "Component";
  if (kind === "node") return "Deployment Node";
  return "Boundary";
}
function buildC4Svg(ir, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  const titleH = ir.title ? 32 : 0;
  const ELEM_W = 200;
  const ELEM_H = 110;
  const nonBoundary = ir.elements.filter((e) => !c4StyleFor(e.kind, dark).shape.includes("boundary") && c4StyleFor(e.kind, dark).shape !== "node");
  const boundaries = ir.elements.filter((e) => {
    const s = c4StyleFor(e.kind, dark);
    return s.shape === "boundary" || s.shape === "node";
  });
  const g = new import_dagre.default.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const el of nonBoundary) g.setNode(el.id, { width: ELEM_W, height: ELEM_H });
  for (const rel of ir.relations) {
    if (g.hasNode(rel.source) && g.hasNode(rel.target)) g.setEdge(rel.source, rel.target);
  }
  import_dagre.default.layout(g);
  const positions = /* @__PURE__ */ new Map();
  for (const el of nonBoundary) {
    const { x, y } = g.node(el.id);
    positions.set(el.id, { x: x - ELEM_W / 2, y: y - ELEM_H / 2, width: ELEM_W, height: ELEM_H });
  }
  for (const b of boundaries) {
    const children = ir.elements.filter((e) => e.parent === b.id);
    const childPositions = children.map((c) => positions.get(c.id)).filter((p) => !!p);
    if (childPositions.length === 0) continue;
    let minX2 = Infinity, minY2 = Infinity, maxX2 = -Infinity, maxY2 = -Infinity;
    for (const p of childPositions) {
      minX2 = Math.min(minX2, p.x);
      minY2 = Math.min(minY2, p.y);
      maxX2 = Math.max(maxX2, p.x + p.width);
      maxY2 = Math.max(maxY2, p.y + p.height);
    }
    positions.set(b.id, { x: minX2 - 20, y: minY2 - 28, width: maxX2 - minX2 + 40, height: maxY2 - minY2 + 48 });
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  minX -= padding;
  minY -= padding - titleH;
  maxX += padding;
  maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY) + titleH;
  const viewMinY = minY - titleH;
  const parts = [];
  parts.push(svgOpen(minX, viewMinY, width, height, common.canvasBg, ir.title || `C4 ${ir.variant} diagram`));
  parts.push(`<defs>${arrowDef("arr", common.edgeColor)}</defs>`);
  if (ir.title) {
    parts.push(`<text x="${minX + width / 2}" y="${viewMinY + 22}" text-anchor="middle" font-size="16" font-weight="700" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  for (const b of boundaries) {
    const p = positions.get(b.id);
    if (!p) continue;
    const style = c4StyleFor(b.kind, dark);
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="8" fill="none" stroke="${style.border}" stroke-width="2" stroke-dasharray="8 4"/>`
    );
    parts.push(`<text x="${p.x + 12}" y="${p.y + 18}" font-size="11" font-weight="700" fill="${common.text}">${escXml(b.label)}</text>`);
    parts.push(`<text x="${p.x + 12}" y="${p.y + 32}" font-size="9" fill="${common.subtle}" font-style="italic">[${escXml(c4BadgeLabel(b.kind))}]</text>`);
  }
  for (const rel of ir.relations) {
    const a = positions.get(rel.source);
    const b = positions.get(rel.target);
    if (!a || !b) continue;
    const labelLine = rel.label ?? "";
    const techLine = rel.technology ? `[${rel.technology}]` : "";
    parts.push(
      buildEdgePath(a, b, { source: rel.source, target: rel.target, label: [labelLine, techLine].filter(Boolean).join(" "), kind: "solid" }, common)
    );
  }
  for (const el of nonBoundary) {
    const p = positions.get(el.id);
    if (!p) continue;
    parts.push(buildC4Element(el, p, dark));
  }
  parts.push("</svg>");
  return parts.join("");
}
function buildC4Element(el, p, dark) {
  const style = c4StyleFor(el.kind, dark);
  const cx = p.x + p.width / 2;
  const parts = [];
  if (style.shape === "person") {
    const headR = 14;
    parts.push(
      `<rect x="${p.x}" y="${p.y + headR + 8}" width="${p.width}" height="${p.height - headR - 8}" rx="10" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`
    );
    parts.push(`<circle cx="${cx}" cy="${p.y + headR + 4}" r="${headR}" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`);
  } else if (style.shape === "cylinder") {
    const ry = 8;
    parts.push(
      `<path d="M ${p.x} ${p.y + ry} A ${p.width / 2} ${ry} 0 0 0 ${p.x + p.width} ${p.y + ry} L ${p.x + p.width} ${p.y + p.height - ry} A ${p.width / 2} ${ry} 0 0 1 ${p.x} ${p.y + p.height - ry} Z" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`
    );
    parts.push(`<ellipse cx="${cx}" cy="${p.y + ry}" rx="${p.width / 2}" ry="${ry}" fill="none" stroke="${style.border}" stroke-width="1.5"/>`);
  } else if (style.shape === "queue") {
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${p.height / 2}" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`
    );
  } else {
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="8" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`
    );
  }
  const badgeY = p.y + (style.shape === "person" ? 36 : 18);
  parts.push(`<text x="${cx}" y="${badgeY}" text-anchor="middle" font-size="9" font-style="italic" font-weight="600" fill="${style.text}" opacity="0.85">[${escXml(c4BadgeLabel(el.kind))}]</text>`);
  parts.push(`<text x="${cx}" y="${badgeY + 18}" text-anchor="middle" font-size="13" font-weight="700" fill="${style.text}">${escXml(el.label)}</text>`);
  if (el.technology) {
    parts.push(`<text x="${cx}" y="${badgeY + 32}" text-anchor="middle" font-size="10" font-style="italic" fill="${style.text}" opacity="0.85">[${escXml(el.technology)}]</text>`);
  }
  if (el.description) {
    const lines = wrapText(el.description, 28);
    const startY = badgeY + (el.technology ? 48 : 36);
    for (let i = 0; i < Math.min(lines.length, 2); i++) {
      parts.push(`<text x="${cx}" y="${startY + i * 12}" text-anchor="middle" font-size="10" fill="${style.text}" opacity="0.92">${escXml(lines[i])}</text>`);
    }
  }
  return parts.join("");
}
function buildGitGraphSvg(ir, options = {}) {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  const titleH = ir.title ? 32 : 0;
  const commits = [];
  const branchOrder = ["main"];
  const branchHead = /* @__PURE__ */ new Map();
  branchHead.set("main", null);
  let currentBranch = "main";
  let counter = 0;
  for (const op of ir.ops) {
    if (op.kind === "branch") {
      if (!branchOrder.includes(op.name)) branchOrder.push(op.name);
      branchHead.set(op.name, branchHead.get(currentBranch) ?? null);
      currentBranch = op.name;
    } else if (op.kind === "checkout") {
      currentBranch = op.name;
      if (!branchOrder.includes(op.name)) branchOrder.push(op.name);
      if (!branchHead.has(op.name)) branchHead.set(op.name, null);
    } else if (op.kind === "commit") {
      const id = op.id ?? `c${++counter}`;
      const parent = branchHead.get(currentBranch);
      const commit = {
        id,
        branch: currentBranch,
        parents: parent ? [parent] : [],
        tag: op.tag,
        type: op.type ?? "NORMAL"
      };
      commits.push(commit);
      branchHead.set(currentBranch, id);
    } else if (op.kind === "merge") {
      const id = `merge-${++counter}`;
      const a = branchHead.get(currentBranch);
      const b = branchHead.get(op.from);
      const commit = {
        id,
        branch: currentBranch,
        parents: [a, b].filter((p) => !!p),
        tag: op.tag,
        type: "NORMAL",
        isMerge: true
      };
      commits.push(commit);
      branchHead.set(currentBranch, id);
    } else if (op.kind === "cherry-pick") {
      const id = `cherry-${++counter}`;
      const parent = branchHead.get(currentBranch);
      commits.push({
        id,
        branch: currentBranch,
        parents: parent ? [parent] : [],
        type: "HIGHLIGHT"
      });
      branchHead.set(currentBranch, id);
    }
  }
  const BRANCH_GAP = 60;
  const COMMIT_GAP = 70;
  const branchIdx = new Map(branchOrder.map((b, i) => [b, i]));
  const branchX = (b) => padding + 90 + (branchIdx.get(b) ?? 0) * BRANCH_GAP;
  const commitPositions = /* @__PURE__ */ new Map();
  commits.forEach((c, i) => {
    commitPositions.set(c.id, { x: branchX(c.branch), y: padding + titleH + 40 + i * COMMIT_GAP });
  });
  const width = padding * 2 + 90 + branchOrder.length * BRANCH_GAP + 200;
  const height = padding * 2 + titleH + 60 + commits.length * COMMIT_GAP;
  const branchColors = ["#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4", "#ec4899"];
  const branchColor = (b) => branchColors[(branchIdx.get(b) ?? 0) % branchColors.length];
  const parts = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg, ir.title || "Git graph"));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  for (const b of branchOrder) {
    const x = branchX(b);
    const y = padding + titleH + 16;
    parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="11" font-weight="700" fill="${branchColor(b)}">${escXml(b)}</text>`);
    parts.push(`<line x1="${x}" y1="${y + 8}" x2="${x}" y2="${height - padding}" stroke="${branchColor(b)}" stroke-width="2" opacity="0.3"/>`);
  }
  for (const c of commits) {
    const cp = commitPositions.get(c.id);
    if (!cp) continue;
    for (const pid of c.parents) {
      const pp = commitPositions.get(pid);
      if (!pp) continue;
      const sameLane = pp.x === cp.x;
      const stroke = branchColor(c.branch);
      if (sameLane) {
        parts.push(`<line x1="${pp.x}" y1="${pp.y}" x2="${cp.x}" y2="${cp.y}" stroke="${stroke}" stroke-width="2"/>`);
      } else {
        const midY = (pp.y + cp.y) / 2;
        parts.push(`<path d="M ${pp.x} ${pp.y} C ${pp.x} ${midY}, ${cp.x} ${midY}, ${cp.x} ${cp.y}" stroke="${stroke}" stroke-width="2" fill="none"/>`);
      }
    }
  }
  for (const c of commits) {
    const cp = commitPositions.get(c.id);
    if (!cp) continue;
    const color = branchColor(c.branch);
    const r = 9;
    if (c.type === "REVERSE") {
      parts.push(`<rect x="${cp.x - r}" y="${cp.y - r}" width="${r * 2}" height="${r * 2}" fill="${dark ? "#0f172a" : "#ffffff"}" stroke="${color}" stroke-width="2"/>`);
    } else if (c.type === "HIGHLIGHT") {
      parts.push(`<rect x="${cp.x - r}" y="${cp.y - r}" width="${r * 2}" height="${r * 2}" rx="3" fill="${color}" stroke="${color}" stroke-width="2"/>`);
    } else if (c.isMerge) {
      parts.push(`<circle cx="${cp.x}" cy="${cp.y}" r="${r}" fill="${dark ? "#0f172a" : "#ffffff"}" stroke="${color}" stroke-width="2.5"/>`);
      parts.push(`<circle cx="${cp.x}" cy="${cp.y}" r="${r - 4}" fill="${color}"/>`);
    } else {
      parts.push(`<circle cx="${cp.x}" cy="${cp.y}" r="${r}" fill="${color}" stroke="${dark ? "#0f172a" : "#ffffff"}" stroke-width="2"/>`);
    }
    const labelX = padding + 90 + branchOrder.length * BRANCH_GAP + 24;
    parts.push(`<text x="${labelX}" y="${cp.y + 4}" font-family='${MONO_FAMILY}' font-size="11" fill="${common.text}">${escXml(c.id)}</text>`);
    if (c.tag) {
      const tagX = labelX + c.id.length * 7 + 12;
      parts.push(`<rect x="${tagX}" y="${cp.y - 8}" width="${c.tag.length * 6.5 + 12}" height="16" rx="3" fill="${color}" opacity="0.85"/>`);
      parts.push(`<text x="${tagX + 6}" y="${cp.y + 4}" font-size="10" font-weight="700" fill="#ffffff">${escXml(c.tag)}</text>`);
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
function svgStringToElement(svg) {
  if (typeof window === "undefined" || !window.DOMParser) return null;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (root.tagName !== "svg") return null;
  const imported = document.importNode(root, true);
  return imported;
}
var LIGHT_KIND;
var DARK_KIND;
var LIGHT_COMMON;
var DARK_COMMON;
var FONT_FAMILY;
var MONO_FAMILY;
var BR_REGEX;
var VIS_SYMBOL;
var PIE_PALETTE;
var ARCH_ICON_TINT;
var init_svgBuilders = __esm({
  "src/utils/diagrams/svgBuilders.ts"() {
    LIGHT_KIND = {
      service: { border: "#86efac", headerBg: "#ecfdf5", accent: "#10b981", bodyBg: "#ffffff", text: "#064e3b" },
      database: { border: "#fcd34d", headerBg: "#fffbeb", accent: "#f59e0b", bodyBg: "#ffffff", text: "#78350f" },
      queue: { border: "#fda4af", headerBg: "#fff1f2", accent: "#f43f5e", bodyBg: "#ffffff", text: "#881337" },
      storage: { border: "#67e8f9", headerBg: "#ecfeff", accent: "#06b6d4", bodyBg: "#ffffff", text: "#164e63" },
      user: { border: "#93c5fd", headerBg: "#eff6ff", accent: "#3b82f6", bodyBg: "#ffffff", text: "#1e3a8a" },
      client: { border: "#c4b5fd", headerBg: "#f5f3ff", accent: "#8b5cf6", bodyBg: "#ffffff", text: "#4c1d95" },
      external: { border: "#cbd5e1", headerBg: "#f1f5f9", accent: "#64748b", bodyBg: "#ffffff", text: "#334155" },
      process: { border: "#bfdbfe", headerBg: "#eff6ff", accent: "#60a5fa", bodyBg: "#ffffff", text: "#1e3a8a" },
      decision: { border: "#c4b5fd", headerBg: "#f5f3ff", accent: "#8b5cf6", bodyBg: "#faf5ff", text: "#4c1d95" },
      start: { border: "#86efac", headerBg: "#ecfdf5", accent: "#10b981", bodyBg: "#ffffff", text: "#064e3b" },
      end: { border: "#fda4af", headerBg: "#fff1f2", accent: "#f43f5e", bodyBg: "#ffffff", text: "#881337" },
      icon: { border: "#cbd5e1", headerBg: "#ffffff", accent: "#64748b", bodyBg: "#ffffff", text: "#1e293b" },
      plain: { border: "#cbd5e1", headerBg: "#f8fafc", accent: "#64748b", bodyBg: "#ffffff", text: "#1e293b" }
    };
    DARK_KIND = {
      service: { border: "#10b981", headerBg: "rgba(16,185,129,0.12)", accent: "#34d399", bodyBg: "#1e293b", text: "#a7f3d0" },
      database: { border: "#f59e0b", headerBg: "rgba(245,158,11,0.12)", accent: "#fbbf24", bodyBg: "#1e293b", text: "#fde68a" },
      queue: { border: "#f43f5e", headerBg: "rgba(244,63,94,0.12)", accent: "#fb7185", bodyBg: "#1e293b", text: "#fecdd3" },
      storage: { border: "#06b6d4", headerBg: "rgba(6,182,212,0.12)", accent: "#22d3ee", bodyBg: "#1e293b", text: "#a5f3fc" },
      user: { border: "#3b82f6", headerBg: "rgba(59,130,246,0.12)", accent: "#60a5fa", bodyBg: "#1e293b", text: "#bfdbfe" },
      client: { border: "#8b5cf6", headerBg: "rgba(139,92,246,0.12)", accent: "#a78bfa", bodyBg: "#1e293b", text: "#ddd6fe" },
      external: { border: "#64748b", headerBg: "rgba(100,116,139,0.12)", accent: "#94a3b8", bodyBg: "#1e293b", text: "#cbd5e1" },
      process: { border: "#60a5fa", headerBg: "rgba(96,165,250,0.12)", accent: "#93c5fd", bodyBg: "#1e293b", text: "#bfdbfe" },
      decision: { border: "#8b5cf6", headerBg: "rgba(139,92,246,0.12)", accent: "#a78bfa", bodyBg: "#1e293b", text: "#ddd6fe" },
      start: { border: "#10b981", headerBg: "rgba(16,185,129,0.12)", accent: "#34d399", bodyBg: "#1e293b", text: "#a7f3d0" },
      end: { border: "#f43f5e", headerBg: "rgba(244,63,94,0.12)", accent: "#fb7185", bodyBg: "#1e293b", text: "#fecdd3" },
      icon: { border: "#475569", headerBg: "#1e293b", accent: "#94a3b8", bodyBg: "#1e293b", text: "#e2e8f0" },
      plain: { border: "#475569", headerBg: "#1e293b", accent: "#94a3b8", bodyBg: "#1e293b", text: "#e2e8f0" }
    };
    LIGHT_COMMON = {
      canvasBg: "#ffffff",
      edgeColor: "#94a3b8",
      edgeLabel: "#475569",
      edgeLabelBg: "#ffffff",
      text: "#1e293b",
      subtle: "#64748b",
      border: "#cbd5e1"
    };
    DARK_COMMON = {
      canvasBg: "#0f172a",
      edgeColor: "#64748b",
      edgeLabel: "#cbd5e1",
      edgeLabelBg: "#1e293b",
      text: "#e2e8f0",
      subtle: "#94a3b8",
      border: "#475569"
    };
    FONT_FAMILY = '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    MONO_FAMILY = '"Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace';
    BR_REGEX = /<br\s*\/?>/gi;
    VIS_SYMBOL = { public: "+", private: "-", protected: "#", package: "~" };
    PIE_PALETTE = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#ec4899",
      "#84cc16",
      "#f97316",
      "#6366f1",
      "#14b8a6",
      "#d946ef"
    ];
    ARCH_ICON_TINT = {
      aws: { fill: "#fff5e6", border: "#ff9900" },
      google: { fill: "#e8f0fe", border: "#4285f4" },
      azure: { fill: "#e3f2fd", border: "#0078d4" },
      cloudflare: { fill: "#fff4e0", border: "#f48120" },
      docker: { fill: "#e7f3ff", border: "#2496ed" },
      kubernetes: { fill: "#eaf1ff", border: "#326ce5" },
      redis: { fill: "#fde7e3", border: "#dc382d" },
      postgresql: { fill: "#e3f2fa", border: "#336791" },
      mongodb: { fill: "#e8f5e9", border: "#47a248" },
      cloud: { fill: "#f0f4ff", border: "#6366f1" },
      database: { fill: "#fff7ed", border: "#f59e0b" },
      disk: { fill: "#ecfeff", border: "#06b6d4" },
      server: { fill: "#ecfdf5", border: "#10b981" },
      internet: { fill: "#eff6ff", border: "#3b82f6" }
    };
  }
});
var FlowchartRenderer_exports = {};
__export(FlowchartRenderer_exports, {
  default: () => FlowchartRenderer
});
function rectSize(label) {
  const segs = splitOnBr(label);
  const maxLen = Math.max(...segs.map((s) => s.length));
  const wrapLines = segs.reduce((acc, s) => acc + Math.max(1, Math.ceil(s.length / 24)), 0);
  return {
    width: Math.max(160, Math.min(320, maxLen * 8 + 40)),
    height: 48 + (wrapLines - 1) * 18
  };
}
function diamondSize(label) {
  const segs = splitOnBr(label);
  const maxLen = Math.max(...segs.map((s) => s.length));
  const wrapLines = segs.reduce((acc, s) => acc + Math.max(1, Math.ceil(s.length / 16)), 0);
  return {
    width: Math.max(140, Math.min(280, maxLen * 11 + 60)),
    height: Math.max(96, Math.min(160, wrapLines * 32 + 64))
  };
}
function FlowchartRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => {
    const sizes = /* @__PURE__ */ new Map();
    for (const n of ir.nodes) {
      if (n.kind === "user" || n.kind === "start" || n.kind === "end") sizes.set(n.id, NODE_SIZE.circle);
      else if (n.kind === "icon") sizes.set(n.id, NODE_SIZE.icon);
      else if (n.kind === "decision") sizes.set(n.id, diamondSize(n.label));
      else if (n.kind === "queue") sizes.set(n.id, NODE_SIZE.subroutine);
      else sizes.set(n.id, rectSize(n.label));
    }
    const layout = layoutFlowchart(ir, { nodeSizes: sizes });
    return buildFlowchartSvg(ir, layout.nodePositions, { dark });
  }, [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "flowchart-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var NODE_SIZE;
var init_FlowchartRenderer = __esm({
  "src/components/diagrams/FlowchartRenderer.tsx"() {
    init_dagreLayout();
    init_theme();
    init_svgBuilders();
    NODE_SIZE = {
      circle: { width: 84, height: 84 },
      icon: { width: 100, height: 96 },
      subroutine: { width: 220, height: 64 }
    };
  }
});
var ERRenderer_exports = {};
__export(ERRenderer_exports, {
  default: () => ERRenderer
});
function ERRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => {
    const g = new import_dagre.default.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 100, marginx: 24, marginy: 24 });
    g.setDefaultEdgeLabel(() => ({}));
    const tableHeight = (cols) => TABLE_HEADER_HEIGHT + cols * TABLE_ROW_HEIGHT;
    for (const table of ir.schema.tables) {
      g.setNode(table.name, { width: TABLE_NODE_WIDTH, height: tableHeight(table.columns.length) });
    }
    for (const rel of ir.schema.relations) {
      if (g.hasNode(rel.fromTable) && g.hasNode(rel.toTable)) g.setEdge(rel.fromTable, rel.toTable);
    }
    import_dagre.default.layout(g);
    const positions = /* @__PURE__ */ new Map();
    for (const table of ir.schema.tables) {
      const { x, y } = g.node(table.name);
      const h = tableHeight(table.columns.length);
      positions.set(table.name, { x: x - TABLE_NODE_WIDTH / 2, y: y - h / 2, width: TABLE_NODE_WIDTH, height: h });
    }
    return buildErSvg(ir, positions, { dark });
  }, [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "er-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var TABLE_NODE_WIDTH;
var TABLE_HEADER_HEIGHT;
var TABLE_ROW_HEIGHT;
var init_ERRenderer = __esm({
  "src/components/diagrams/ERRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
    TABLE_NODE_WIDTH = 240;
    TABLE_HEADER_HEIGHT = 34;
    TABLE_ROW_HEIGHT = 26;
  }
});
var PieRenderer_exports = {};
__export(PieRenderer_exports, {
  default: () => PieRenderer
});
function PieRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => buildPieSvg(ir, { dark }), [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "pie-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_PieRenderer = __esm({
  "src/components/diagrams/PieRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var QuadrantRenderer_exports = {};
__export(QuadrantRenderer_exports, {
  default: () => QuadrantRenderer
});
function QuadrantRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => buildQuadrantSvg(ir, { dark }), [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "quadrant-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_QuadrantRenderer = __esm({
  "src/components/diagrams/QuadrantRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var JourneyRenderer_exports = {};
__export(JourneyRenderer_exports, {
  default: () => JourneyRenderer
});
function JourneyRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => buildJourneySvg(ir, { dark }), [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "journey-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_JourneyRenderer = __esm({
  "src/components/diagrams/JourneyRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var SequenceRenderer_exports = {};
__export(SequenceRenderer_exports, {
  default: () => SequenceRenderer
});
function MultilineText({ x, children }) {
  const lines = splitOnBr(children);
  if (lines.length === 1) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: lines[0] });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: lines.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tspan", { x, dy: i === 0 ? 0 : LINE_H, children: line }, i)) });
}
function SequenceRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const layout = (0, import_react.useMemo)(() => computeLayout(ir.participants, ir.steps), [ir.participants, ir.steps]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => containerRef.current?.querySelector("svg.sequence-svg") ?? null
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, layout]);
  const lifelineColor = dark ? "#475569" : "#cbd5e1";
  const headFill = dark ? "#1e293b" : "#f1f5f9";
  const headBorder = dark ? "#475569" : "#cbd5e1";
  const headText = dark ? "#e2e8f0" : "#1e293b";
  const arrowColor = dark ? "#94a3b8" : "#64748b";
  const labelColor = dark ? "#cbd5e1" : "#334155";
  const noteFill = dark ? "#451a03" : "#fef3c7";
  const noteBorder = dark ? "#92400e" : "#fcd34d";
  const noteText = dark ? "#fde68a" : "#78350f";
  const titleY = ir.title ? TITLE_H : 0;
  const headTopY = titleY + HEAD_PAD_Y;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "sequence-renderer",
      style: {
        width: "100%",
        background: theme.canvasBg,
        borderRadius: 12,
        padding: 16,
        overflow: "auto"
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "svg",
        {
          className: "sequence-svg",
          xmlns: "http://www.w3.org/2000/svg",
          width: layout.width,
          height: layout.height + titleY,
          viewBox: `0 0 ${layout.width} ${layout.height + titleY}`,
          style: { display: "block", minWidth: "100%", fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' },
          children: [
            ir.title && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "text",
              {
                x: layout.width / 2,
                y: 20,
                textAnchor: "middle",
                fontSize: 15,
                fontWeight: 600,
                fill: headText,
                children: ir.title
              }
            ),
            ir.participants.map((p) => {
              const x = layout.participantX.get(p.id);
              if (x === void 0) return null;
              return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "line",
                {
                  x1: x,
                  x2: x,
                  y1: headTopY + PART_BOX_H,
                  y2: headTopY + PART_BOX_H + layout.contentH + STEP_GAP,
                  stroke: lifelineColor,
                  strokeWidth: 1,
                  strokeDasharray: "4 4"
                },
                `life-${p.id}`
              );
            }),
            ir.participants.map((p) => {
              const x = layout.participantX.get(p.id);
              if (x === void 0) return null;
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "rect",
                  {
                    x: x - PART_BOX_W / 2,
                    y: headTopY,
                    width: PART_BOX_W,
                    height: PART_BOX_H,
                    rx: 6,
                    fill: headFill,
                    stroke: headBorder,
                    strokeWidth: 1
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "text",
                  {
                    x,
                    y: headTopY + PART_BOX_H / 2 + 4,
                    textAnchor: "middle",
                    fontSize: 12,
                    fontWeight: 600,
                    fill: headText,
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MultilineText, { x, children: truncate(p.label, 18) })
                  }
                )
              ] }, `head-${p.id}`);
            }),
            layout.placedSteps.map((ps, i) => {
              if (ps.step.kind === "message") {
                const fromX = layout.participantX.get(ps.step.from);
                const isSelf = ps.step.from === ps.step.to;
                const isRightmost = isSelf && fromX === Math.max(...layout.participantX.values());
                return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  MessageStep,
                  {
                    msg: ps.step,
                    fromX,
                    toX: layout.participantX.get(ps.step.to),
                    y: headTopY + PART_BOX_H + ps.y,
                    arrowColor,
                    labelColor,
                    selfDirection: isRightmost ? "left" : "right",
                    canvasWidth: layout.width
                  }
                ) }, i);
              }
              return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                NoteStep,
                {
                  note: ps.step,
                  participantXs: ps.step.participants.map((id) => layout.participantX.get(id)).filter((x) => x !== void 0),
                  y: headTopY + PART_BOX_H + ps.y,
                  fill: noteFill,
                  border: noteBorder,
                  textColor: noteText
                }
              ) }, i);
            }),
            ir.participants.map((p) => {
              const x = layout.participantX.get(p.id);
              if (x === void 0) return null;
              const footY = headTopY + PART_BOX_H + layout.contentH + STEP_GAP - PART_BOX_H / 2;
              return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "rect",
                  {
                    x: x - PART_BOX_W / 2,
                    y: footY,
                    width: PART_BOX_W,
                    height: PART_BOX_H,
                    rx: 6,
                    fill: headFill,
                    stroke: headBorder,
                    strokeWidth: 1
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "text",
                  {
                    x,
                    y: footY + PART_BOX_H / 2 + 4,
                    textAnchor: "middle",
                    fontSize: 12,
                    fontWeight: 600,
                    fill: headText,
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MultilineText, { x, children: truncate(p.label, 18) })
                  }
                )
              ] }, `foot-${p.id}`);
            }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowDefs, { arrowColor })
          ]
        }
      )
    }
  );
}
function MessageStep({
  msg,
  fromX,
  toX,
  y,
  arrowColor,
  labelColor,
  selfDirection = "right",
  canvasWidth
}) {
  const isReply = msg.arrow === "reply";
  const isAsync = msg.arrow === "async";
  const isCross = msg.arrow === "cross";
  const dasharray = isReply ? "5 4" : isAsync ? "8 3" : void 0;
  const markerEnd = isCross ? "url(#arr-cross)" : isAsync ? "url(#arr-open)" : "url(#arr-solid)";
  const labelX = (fromX + toX) / 2;
  const labelY = y - 8;
  const showSelf = fromX === toX;
  if (showSelf) {
    const dir = selfDirection === "left" ? -1 : 1;
    const loopEndX = fromX + dir * SELF_LOOP_W;
    const labelText = truncate(msg.label, 28);
    const charW = 6.2;
    const approxLabelW = labelText.length * charW;
    const labelXPos = dir === 1 ? (
      // loop opens right; label sits to the right of the loop's edge
      Math.min(loopEndX + 8, (canvasWidth ?? Infinity) - approxLabelW - 4)
    ) : (
      // loop opens left; label sits to the left of the loop's edge
      Math.max(loopEndX - approxLabelW - 8, 4)
    );
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "path",
        {
          d: `M ${fromX} ${y} h ${dir * SELF_LOOP_W} v 22 h ${-dir * SELF_LOOP_W}`,
          fill: "none",
          stroke: arrowColor,
          strokeWidth: 1.4,
          strokeDasharray: dasharray,
          markerEnd
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "text",
        {
          x: labelXPos,
          y: y + 14,
          fontSize: 11,
          fill: labelColor,
          textAnchor: dir === 1 ? "start" : "start",
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MultilineText, { x: labelXPos, children: labelText })
        }
      )
    ] });
  }
  const msgLabelText = truncate(msg.label, 60);
  const msgLabelLines = splitOnBr(msgLabelText);
  const msgLabelTopY = labelY - (msgLabelLines.length - 1) * LINE_H;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "text",
      {
        x: labelX,
        y: msgLabelTopY,
        textAnchor: "middle",
        fontSize: 11,
        fill: labelColor,
        fontWeight: 500,
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MultilineText, { x: labelX, children: msgLabelText })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "line",
      {
        x1: fromX,
        x2: toX,
        y1: y,
        y2: y,
        stroke: arrowColor,
        strokeWidth: 1.4,
        strokeDasharray: dasharray,
        markerEnd
      }
    )
  ] });
}
function NoteStep({
  note,
  participantXs,
  y,
  fill,
  border,
  textColor
}) {
  if (participantXs.length === 0) return null;
  let x = 0;
  let w = 160;
  if (note.side === "over") {
    const min = Math.min(...participantXs);
    const max = Math.max(...participantXs);
    w = Math.max(160, max - min + 80);
    x = min - (w - (max - min)) / 2;
  } else if (note.side === "left") {
    x = participantXs[0] - 90 - 60;
    w = 140;
  } else {
    x = participantXs[0] + 60;
    w = 140;
  }
  const noteText = truncate(note.text, 50);
  const noteLines = splitOnBr(noteText);
  const noteH = Math.max(NOTE_H, noteLines.length * LINE_H + 12);
  const cx = x + w / 2;
  const firstLineY = y - 6 + noteH / 2 + 5 - (noteLines.length - 1) * LINE_H / 2;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "rect",
      {
        x,
        y: y - 6,
        width: w,
        height: noteH,
        rx: 4,
        fill,
        stroke: border,
        strokeWidth: 1
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", { x: cx, y: firstLineY, textAnchor: "middle", fontSize: 11, fill: textColor, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MultilineText, { x: cx, children: noteText }) })
  ] });
}
function ArrowDefs({ arrowColor }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("marker", { id: "arr-solid", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: arrowColor }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("marker", { id: "arr-open", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "9", markerHeight: "9", orient: "auto-start-reverse", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M 0 0 L 10 5 L 0 10", fill: "none", stroke: arrowColor, strokeWidth: "1.5" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("marker", { id: "arr-cross", viewBox: "0 0 10 10", refX: "5", refY: "5", markerWidth: "9", markerHeight: "9", orient: "auto", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M 0 0 L 10 10 M 10 0 L 0 10", stroke: arrowColor, strokeWidth: "1.5" }) })
  ] });
}
function computeLayout(participants, steps) {
  const participantX = /* @__PURE__ */ new Map();
  participants.forEach((p, i) => {
    participantX.set(p.id, SIDE_PAD + PART_BOX_W / 2 + i * PARTICIPANT_GAP);
  });
  const lastX = (participants.length - 1) * PARTICIPANT_GAP + SIDE_PAD * 2 + PART_BOX_W;
  const placedSteps = [];
  let y = 36;
  for (const step of steps) {
    placedSteps.push({ step, y });
    if (step.kind === "note") {
      const noteLines = splitOnBr(step.text).length;
      y += Math.max(NOTE_H, noteLines * LINE_H + 12) + 16;
    } else {
      const msgLines = splitOnBr(step.label).length;
      y += STEP_GAP + Math.max(0, msgLines - 1) * LINE_H;
    }
  }
  return {
    width: lastX,
    height: HEAD_PAD_Y + PART_BOX_H + y + STEP_GAP + PART_BOX_H + FOOT_HEIGHT,
    contentH: y,
    participantX,
    placedSteps
  };
}
function truncate(s, max) {
  return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
}
var LINE_H;
var PARTICIPANT_GAP;
var STEP_GAP;
var HEAD_PAD_Y;
var FOOT_HEIGHT;
var SIDE_PAD;
var PART_BOX_W;
var PART_BOX_H;
var NOTE_H;
var TITLE_H;
var SELF_LOOP_W;
var init_SequenceRenderer = __esm({
  "src/components/diagrams/SequenceRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
    LINE_H = 14;
    PARTICIPANT_GAP = 200;
    STEP_GAP = 56;
    HEAD_PAD_Y = 20;
    FOOT_HEIGHT = 36;
    SIDE_PAD = 40;
    PART_BOX_W = 150;
    PART_BOX_H = 36;
    NOTE_H = 38;
    TITLE_H = 28;
    SELF_LOOP_W = 60;
  }
});
var ClassRenderer_exports = {};
__export(ClassRenderer_exports, {
  default: () => ClassRenderer
});
function classBoxSize(memberCount) {
  return { width: 220, height: Math.max(64, 40 + memberCount * 18) };
}
function ClassRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => {
    const g = new import_dagre.default.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80, marginx: 24, marginy: 24 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const cls of ir.classes) g.setNode(cls.id, classBoxSize(cls.members.length));
    for (const rel of ir.relations) {
      if (g.hasNode(rel.source) && g.hasNode(rel.target)) g.setEdge(rel.source, rel.target);
    }
    import_dagre.default.layout(g);
    const positions = /* @__PURE__ */ new Map();
    for (const cls of ir.classes) {
      const { x, y } = g.node(cls.id);
      const size = classBoxSize(cls.members.length);
      positions.set(cls.id, { x: x - size.width / 2, y: y - size.height / 2, width: size.width, height: size.height });
    }
    return buildClassSvg(ir, positions, { dark });
  }, [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "class-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_ClassRenderer = __esm({
  "src/components/diagrams/ClassRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var StateRenderer_exports = {};
__export(StateRenderer_exports, {
  default: () => StateRenderer
});
function stateNodeSize(s) {
  if (s.kind === "start" || s.kind === "end") return { width: 80, height: 32 };
  const segs = splitOnBr(s.label || s.id);
  const maxLen = Math.max(...segs.map((seg) => seg.length));
  return {
    width: Math.max(96, maxLen * 9 + 40),
    height: 44 + (segs.length - 1) * 14
  };
}
function layoutComposite(parentId, ir) {
  const children = ir.states.filter((s) => s.parent === parentId);
  if (children.length === 0) {
    return { width: 200, height: COMPOSITE_HEADER_HEIGHT + 60, positions: /* @__PURE__ */ new Map() };
  }
  const g = new import_dagre.default.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 70, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const c of children) g.setNode(c.id, stateNodeSize(c));
  for (const t of ir.transitions) {
    if (t.parent !== parentId) continue;
    if (g.hasNode(t.source) && g.hasNode(t.target)) g.setEdge(t.source, t.target);
  }
  import_dagre.default.layout(g);
  let minLeft = Infinity, minTop = Infinity, maxRight = 0, maxBottom = 0;
  const tmp = /* @__PURE__ */ new Map();
  for (const c of children) {
    const { x, y } = g.node(c.id);
    const sz = stateNodeSize(c);
    const left = x - sz.width / 2;
    const top = y - sz.height / 2;
    tmp.set(c.id, { x: left, y: top });
    minLeft = Math.min(minLeft, left);
    minTop = Math.min(minTop, top);
    maxRight = Math.max(maxRight, left + sz.width);
    maxBottom = Math.max(maxBottom, top + sz.height);
  }
  const dx = COMPOSITE_PAD - minLeft;
  const dy = COMPOSITE_HEADER_HEIGHT + COMPOSITE_PAD - minTop;
  const positions = /* @__PURE__ */ new Map();
  for (const [id, p] of tmp) positions.set(id, { x: p.x + dx, y: p.y + dy });
  return {
    width: maxRight - minLeft + COMPOSITE_PAD * 2,
    height: maxBottom - minTop + COMPOSITE_HEADER_HEIGHT + COMPOSITE_PAD * 2,
    positions
  };
}
function StateRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => {
    const compositeIds = ir.states.filter((s) => s.kind === "composite").map((s) => s.id);
    const innerLayouts = /* @__PURE__ */ new Map();
    for (const id of compositeIds) innerLayouts.set(id, layoutComposite(id, ir));
    const buildPositions = { topLevel: /* @__PURE__ */ new Map(), children: /* @__PURE__ */ new Map() };
    const topLevel = ir.states.filter((s) => !s.parent);
    const g = new import_dagre.default.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 90, marginx: 32, marginy: 32 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const s of topLevel) {
      if (s.kind === "composite") {
        const inner = innerLayouts.get(s.id);
        g.setNode(s.id, { width: inner.width, height: inner.height });
      } else {
        g.setNode(s.id, stateNodeSize(s));
      }
    }
    for (const t of ir.transitions) {
      if (t.parent) continue;
      if (g.hasNode(t.source) && g.hasNode(t.target)) g.setEdge(t.source, t.target);
    }
    import_dagre.default.layout(g);
    for (const s of topLevel) {
      const { x, y } = g.node(s.id);
      if (s.kind === "composite") {
        const inner = innerLayouts.get(s.id);
        buildPositions.topLevel.set(s.id, {
          x: x - inner.width / 2,
          y: y - inner.height / 2,
          width: inner.width,
          height: inner.height
        });
      } else {
        const size = stateNodeSize(s);
        buildPositions.topLevel.set(s.id, {
          x: x - size.width / 2,
          y: y - size.height / 2,
          width: size.width,
          height: size.height
        });
      }
    }
    for (const compId of compositeIds) {
      const inner = innerLayouts.get(compId);
      const children = ir.states.filter((s) => s.parent === compId);
      for (const c of children) {
        const pos = inner.positions.get(c.id);
        if (!pos) continue;
        const size = stateNodeSize(c);
        buildPositions.children.set(c.id, {
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
          parent: compId
        });
      }
    }
    return buildStateSvg(ir, buildPositions, { dark });
  }, [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "state-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var COMPOSITE_HEADER_HEIGHT;
var COMPOSITE_PAD;
var init_StateRenderer = __esm({
  "src/components/diagrams/StateRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
    COMPOSITE_HEADER_HEIGHT = 32;
    COMPOSITE_PAD = 18;
  }
});
var GanttRenderer_exports = {};
__export(GanttRenderer_exports, {
  default: () => GanttRenderer
});
function GanttRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => buildGanttSvg(ir, { dark }), [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "gantt-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflowX: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_GanttRenderer = __esm({
  "src/components/diagrams/GanttRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var TimelineRenderer_exports = {};
__export(TimelineRenderer_exports, {
  default: () => TimelineRenderer
});
function TimelineRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => buildTimelineSvg(ir, { dark }), [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "timeline-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflowX: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_TimelineRenderer = __esm({
  "src/components/diagrams/TimelineRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var MindmapRenderer_exports = {};
__export(MindmapRenderer_exports, {
  default: () => MindmapRenderer
});
function radialLayout(root) {
  const positioned = [];
  const RING_DISTANCE = 180;
  const place = (node, depth, startAngle, endAngle) => {
    const angle = (startAngle + endAngle) / 2;
    const x = depth === 0 ? 0 : Math.cos(angle) * RING_DISTANCE * depth;
    const y = depth === 0 ? 0 : Math.sin(angle) * RING_DISTANCE * depth;
    positioned.push({ id: node.id, node, x, y, depth });
    if (node.children.length === 0) return;
    const span = endAngle - startAngle;
    const slice = span / node.children.length;
    for (let i = 0; i < node.children.length; i++) {
      place(node.children[i], depth + 1, startAngle + i * slice, startAngle + (i + 1) * slice);
    }
  };
  place(root, 0, 0, Math.PI * 2);
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const p of positioned) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  for (const p of positioned) {
    p.x = p.x - minX + 200;
    p.y = p.y - minY + 100;
  }
  return { positioned, bounds: { w: maxX - minX + 400, h: maxY - minY + 200 } };
}
function MindmapRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => {
    const { positioned } = radialLayout(ir.root);
    const positions = /* @__PURE__ */ new Map();
    for (const p of positioned) {
      const isRoot = p.depth === 0;
      const labelLen = p.node.label.length;
      const w = Math.max(isRoot ? 100 : 70, labelLen * (isRoot ? 9 : 7) + 40);
      const h = isRoot ? 44 : 32;
      positions.set(p.id, { x: p.x, y: p.y, width: w, height: h, depth: p.depth });
    }
    return buildMindmapSvg(ir, positions, { dark });
  }, [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "mindmap-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_MindmapRenderer = __esm({
  "src/components/diagrams/MindmapRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var ArchitectureRenderer_exports = {};
__export(ArchitectureRenderer_exports, {
  default: () => ArchitectureRenderer
});
function ArchitectureRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => buildArchitectureSvg(ir, { dark }), [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "architecture-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_ArchitectureRenderer = __esm({
  "src/components/diagrams/ArchitectureRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var C4Renderer_exports = {};
__export(C4Renderer_exports, {
  default: () => C4Renderer
});
function C4Renderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => buildC4Svg(ir, { dark }), [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "c4-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_C4Renderer = __esm({
  "src/components/diagrams/C4Renderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var GitGraphRenderer_exports = {};
__export(GitGraphRenderer_exports, {
  default: () => GitGraphRenderer
});
function GitGraphRenderer({ ir, dark = false, handleRef }) {
  const theme = getDiagramTheme(dark);
  const containerRef = (0, import_react.useRef)(null);
  const svg = (0, import_react.useMemo)(() => buildGitGraphSvg(ir, { dark }), [ir, dark]);
  (0, import_react.useEffect)(() => {
    if (!handleRef) return;
    const handle = {
      getSvgElement: () => svgStringToElement(svg)
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      ref: containerRef,
      className: "gitgraph-renderer",
      style: { width: "100%", background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: "auto" },
      dangerouslySetInnerHTML: { __html: svg }
    }
  );
}
var init_GitGraphRenderer = __esm({
  "src/components/diagrams/GitGraphRenderer.tsx"() {
    init_theme();
    init_svgBuilders();
  }
});
var HEADER_KEYWORDS = [
  { re: /^(flowchart|graph)\b/i, type: "flowchart" },
  { re: /^erdiagram\b/i, type: "er" },
  { re: /^sequencediagram\b/i, type: "sequence" },
  { re: /^classdiagram\b/i, type: "class" },
  { re: /^statediagram(-v2)?\b/i, type: "state" },
  { re: /^gantt\b/i, type: "gantt" },
  { re: /^pie\b/i, type: "pie" },
  { re: /^quadrantchart\b/i, type: "quadrant" },
  { re: /^mindmap\b/i, type: "mindmap" },
  { re: /^gitgraph\b/i, type: "gitgraph" },
  { re: /^timeline\b/i, type: "timeline" },
  { re: /^journey\b/i, type: "journey" },
  { re: /^c4(context|container|component|deployment)/i, type: "c4" },
  { re: /^architecture(-beta)?\b/i, type: "architecture" }
];
async function detectDiagramType(source) {
  const clean = source.replace(/^﻿/, "");
  const firstLine = clean.split("\n").map((l) => l.trim()).find((l) => l.length > 0 && !l.startsWith("%%"));
  if (!firstLine) return null;
  for (const { re, type } of HEADER_KEYWORDS) {
    if (re.test(firstLine)) return type;
  }
  return "unsupported";
}
async function parseToIR(source) {
  const type = await detectDiagramType(source);
  if (type === null) {
    return { ok: false, source, error: "Empty or whitespace-only source" };
  }
  if (type === "unsupported") {
    return { ok: false, source, error: "Unrecognized diagram type" };
  }
  try {
    switch (type) {
      case "flowchart":
        return { ok: true, type, ir: parseFlowchart(source) };
      case "pie":
        return { ok: true, type, ir: parsePieChart(source) };
      case "quadrant":
        return { ok: true, type, ir: parseQuadrantChart(source) };
      case "journey":
        return { ok: true, type, ir: parseJourney(source) };
      case "sequence":
        return { ok: true, type, ir: parseSequence(source) };
      case "class":
        return { ok: true, type, ir: parseClassDiagram(source) };
      case "state":
        return { ok: true, type, ir: parseStateDiagram(source) };
      case "er":
        return { ok: true, type, ir: parseMermaidERDiagram(source) };
      case "gantt":
        return { ok: true, type, ir: parseGantt(source) };
      case "timeline":
        return { ok: true, type, ir: parseTimeline(source) };
      case "mindmap":
        return { ok: true, type, ir: parseMindmap(source) };
      case "architecture":
        return { ok: true, type, ir: parseArchitecture(source) };
      case "c4":
        return { ok: true, type, ir: parseC4(source) };
      case "gitgraph":
        return { ok: true, type, ir: parseGitGraph(source) };
    }
    return { ok: false, source, error: `Unhandled diagram type: ${String(type)}` };
  } catch (err) {
    return {
      ok: false,
      source,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
var HEADER_RE = /^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i;
var SUBGRAPH_OPEN_RE = /^subgraph\s+([\w-]+)(?:\s*\[(.+?)\])?/i;
var EDGE_LINE_REGEX = /-{2,}>|-{2,}|-\.-+>|\.-+>|={2,}>|-{2,}-|=={2,}|~~~/;
function parseFlowchart(source) {
  const rawLines = source.split("\n");
  if (rawLines.length === 0) throw new Error("Empty flowchart source");
  let direction = "TB";
  const nodes = /* @__PURE__ */ new Map();
  const edges = [];
  const subgraphs = [];
  const subgraphStack = [];
  const ensureNode = (decl) => {
    const existing = nodes.get(decl.id);
    if (existing) {
      if (decl.label && (decl.label !== decl.id || !existing.label)) existing.label = decl.label;
      if (decl.kind !== "plain" && existing.kind === "plain") existing.kind = decl.kind;
      if (decl.icon) {
        existing.icon = decl.icon;
        existing.kind = "icon";
      }
      return existing;
    }
    const node = {
      id: decl.id,
      label: decl.label,
      kind: decl.icon ? "icon" : decl.kind
    };
    if (decl.icon) node.icon = decl.icon;
    if (subgraphStack.length > 0) node.subgraph = subgraphStack[subgraphStack.length - 1];
    nodes.set(decl.id, node);
    return node;
  };
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line || line.startsWith("%%")) continue;
    if (i === 0 || nodes.size === 0 && edges.length === 0 && subgraphs.length === 0) {
      const m = line.match(HEADER_RE);
      if (m) {
        const dir = m[1].toUpperCase();
        direction = dir === "TD" ? "TB" : dir;
        continue;
      }
    }
    const subOpen = line.match(SUBGRAPH_OPEN_RE);
    if (subOpen) {
      const id = subOpen[1];
      const label = subOpen[2] ?? id;
      subgraphs.push({ id, label });
      subgraphStack.push(id);
      continue;
    }
    if (/^end\b/i.test(line)) {
      subgraphStack.pop();
      continue;
    }
    if (/^(direction|class|classDef|style|linkStyle|click)\b/i.test(line)) continue;
    if (EDGE_LINE_REGEX.test(line)) {
      const edge = parseEdge(line);
      if (edge) {
        const fromTokens = edge.from.split(/\s*&\s*/).filter(Boolean);
        const toTokens = edge.to.split(/\s*&\s*/).filter(Boolean);
        for (const f of fromTokens) {
          const fromDecl = parseNodeDecl(f);
          if (!fromDecl.id) continue;
          ensureNode(fromDecl);
          for (const t of toTokens) {
            const toDecl = parseNodeDecl(t);
            if (!toDecl.id) continue;
            ensureNode(toDecl);
            const e = { source: fromDecl.id, target: toDecl.id, kind: edge.kind };
            if (edge.label) e.label = edge.label;
            edges.push(e);
          }
        }
        continue;
      }
    }
    const decl = parseNodeDecl(line);
    if (decl.id) ensureNode(decl);
  }
  for (const sg of subgraphs) nodes.delete(sg.id);
  return {
    type: "flowchart",
    direction,
    nodes: [...nodes.values()],
    edges,
    subgraphs
  };
}
function splitClassDirective(text) {
  const idx = text.indexOf(":::");
  if (idx === -1) return { core: text };
  const core = text.slice(0, idx).trim();
  const rest = text.slice(idx + 3).trim();
  const iconMatch = rest.match(/(?:^|[\s,])icon\s*=\s*([\w:_-]+)/);
  return { core, icon: iconMatch?.[1] };
}
function parseNodeDecl(text) {
  const trimmed = text.trim();
  const { core, icon } = splitClassDirective(trimmed);
  const shapes = [
    { re: /^([\w-]+)\(\(([^)]*)\)\)$/, kind: "user" },
    // ((circle))
    { re: /^([\w-]+)\[\(([^)]*)\)\]$/, kind: "database" },
    // [(cylinder)]
    { re: /^([\w-]+)\[\[([^\]]*)\]\]$/, kind: "queue" },
    // [[subroutine]]
    { re: /^([\w-]+)\[\/([^/]*)\/\]$/, kind: "process" },
    // [/parallelogram/]
    { re: /^([\w-]+)\[\\([^\\]*)\\\]$/, kind: "process" },
    // [\..\]
    { re: /^([\w-]+)\{([^}]*)\}$/, kind: "decision" },
    // {decision}
    { re: /^([\w-]+)>([^\]]*)\]$/, kind: "plain" },
    // >tag]
    { re: /^([\w-]+)\(([^)]*)\)$/, kind: "service" },
    // (rounded)
    { re: /^([\w-]+)\[([^\]]*)\]$/, kind: "process" }
    // [rect]
  ];
  for (const { re, kind } of shapes) {
    const m = core.match(re);
    if (m) {
      return {
        id: m[1],
        label: stripQuotes(m[2]) || m[1],
        kind,
        icon
      };
    }
  }
  const bare = core.match(/^([\w-]+)$/);
  if (bare) {
    return { id: bare[1], label: bare[1], kind: "plain", icon };
  }
  return { id: "", label: "", kind: "plain" };
}
function stripQuotes(s) {
  if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  return s;
}
function parseEdge(line) {
  const labeled = [
    { re: /^(.+?)\s*--\s*([^-][^|]*?)\s*-{1,2}>\s*(.+)$/, kind: "solid" },
    { re: /^(.+?)\s*-\.\s*([^.][^|]*?)\s*\.-+>\s*(.+)$/, kind: "dashed" },
    { re: /^(.+?)\s*==\s*([^=][^|]*?)\s*={1,2}>\s*(.+)$/, kind: "thick" }
  ];
  for (const { re, kind } of labeled) {
    const m = line.match(re);
    if (m) return { from: m[1].trim(), to: m[3].trim(), label: m[2].trim(), kind };
  }
  const unlabeled = [
    { re: /^(.+?)\s*~~~\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: "invisible" },
    { re: /^(.+?)\s*-\.-+>\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: "dashed" },
    { re: /^(.+?)\s*={2,}>\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: "thick" },
    { re: /^(.+?)\s*-{2,}>\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: "solid" },
    { re: /^(.+?)\s*-{2,}\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: "solid" }
  ];
  for (const { re, kind } of unlabeled) {
    const m = line.match(re);
    if (m) {
      const label = m[2]?.trim();
      return { from: m[1].trim(), to: m[3].trim(), label: label || void 0, kind };
    }
  }
  return null;
}
var PIE_SLICE_RE = /^"([^"]+)"\s*:\s*([\d.]+)/;
function parsePieChart(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const ir = { type: "pie", slices: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("%%")) continue;
    if (/^pie\b/i.test(line)) {
      if (/\bshowData\b/i.test(line)) ir.showData = true;
      continue;
    }
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const sliceMatch = line.match(PIE_SLICE_RE);
    if (sliceMatch) {
      const value = parseFloat(sliceMatch[2]);
      if (!isNaN(value)) ir.slices.push({ label: sliceMatch[1], value });
    }
  }
  return ir;
}
var QUADRANT_POINT_RE = /^([^:]+):\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/;
function parseQuadrantChart(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const ir = { type: "quadrant", points: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("%%")) continue;
    if (/^quadrantchart\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const xAxisMatch = line.match(/^x-axis\s+(.+?)\s*-->\s*(.+)$/i);
    if (xAxisMatch) {
      ir.xAxisLabel = { low: xAxisMatch[1].trim(), high: xAxisMatch[2].trim() };
      continue;
    }
    const yAxisMatch = line.match(/^y-axis\s+(.+?)\s*-->\s*(.+)$/i);
    if (yAxisMatch) {
      ir.yAxisLabel = { low: yAxisMatch[1].trim(), high: yAxisMatch[2].trim() };
      continue;
    }
    const qMatch = line.match(/^quadrant-([1-4])\s+(.+)$/i);
    if (qMatch) {
      ir.quadrantLabels = ir.quadrantLabels ?? {};
      ir.quadrantLabels[`q${qMatch[1]}`] = qMatch[2].trim();
      continue;
    }
    const pt = line.match(QUADRANT_POINT_RE);
    if (pt) {
      const x = parseFloat(pt[2]);
      const y = parseFloat(pt[3]);
      if (!isNaN(x) && !isNaN(y)) {
        ir.points.push({ label: pt[1].trim(), x, y });
      }
    }
  }
  return ir;
}
var JOURNEY_TASK_RE = /^([^:]+?)\s*:\s*([\d.]+)\s*:\s*(.+)$/;
function parseJourney(source) {
  const lines = source.split("\n").map((l) => l.replace(/^\s+/, ""));
  const ir = { type: "journey", sections: [] };
  let currentSection = null;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("%%")) continue;
    if (/^journey\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      currentSection = { title: sectionMatch[1].trim(), tasks: [] };
      ir.sections.push(currentSection);
      continue;
    }
    const taskMatch = line.match(JOURNEY_TASK_RE);
    if (taskMatch && currentSection) {
      const score = parseFloat(taskMatch[2]);
      const actors = taskMatch[3].split(",").map((a) => a.trim()).filter(Boolean);
      currentSection.tasks.push({ label: taskMatch[1].trim(), score, actors });
    }
  }
  return ir;
}
var SEQ_ARROW_TOKENS = [
  { token: "-->>", arrow: "reply" },
  { token: "->>", arrow: "sync" },
  { token: "-->", arrow: "reply" },
  { token: "->", arrow: "sync" },
  { token: "-x", arrow: "cross" },
  { token: "-)", arrow: "async" }
];
function matchSequenceArrow(line) {
  let bestIdx = -1;
  let bestToken = null;
  for (const t of SEQ_ARROW_TOKENS) {
    const idx = line.indexOf(t.token);
    if (idx === -1) continue;
    if (bestIdx === -1 || idx < bestIdx || idx === bestIdx && t.token.length > (bestToken?.token.length ?? 0)) {
      bestIdx = idx;
      bestToken = t;
    }
  }
  if (bestIdx === -1 || !bestToken) return null;
  const from = line.slice(0, bestIdx).trim();
  const rest = line.slice(bestIdx + bestToken.token.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) return null;
  let to = rest.slice(0, colonIdx).trim();
  const label = rest.slice(colonIdx + 1).trim();
  if (!from || !to || !label) return null;
  if (to.startsWith("+") || to.startsWith("-")) to = to.slice(1).trim();
  return { from, to, arrow: bestToken.arrow, label };
}
function parseSequence(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const ir = { type: "sequence", participants: [], steps: [] };
  const ensureParticipant = (id, label) => {
    const existing = ir.participants.find((p) => p.id === id);
    if (existing) {
      if (label && existing.label === existing.id) existing.label = label;
      return;
    }
    ir.participants.push({ id, label: label ?? id });
  };
  for (const line of lines) {
    if (!line || line.startsWith("%%")) continue;
    if (/^sequencediagram\b/i.test(line)) continue;
    if (/^(loop|alt|opt|par|else|critical|break|rect|end|activate|deactivate|autonumber|box)\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const partMatch = line.match(/^(?:participant|actor)\s+(.+)$/i);
    if (partMatch) {
      const rest = partMatch[1].trim();
      const asMatch = rest.match(/^(.+?)\s+as\s+(.+)$/i);
      if (asMatch) {
        ensureParticipant(stripQuotes(asMatch[1].trim()), stripQuotes(asMatch[2].trim()));
      } else {
        ensureParticipant(stripQuotes(rest));
      }
      continue;
    }
    const noteMatch = line.match(/^note\s+(left of|right of|over)\s+([^:]+)\s*:\s*(.+)$/i);
    if (noteMatch) {
      const sideRaw = noteMatch[1].toLowerCase();
      const side = sideRaw.startsWith("left") ? "left" : sideRaw.startsWith("right") ? "right" : "over";
      const participants = noteMatch[2].split(",").map((p) => p.trim()).filter(Boolean);
      participants.forEach((p) => ensureParticipant(p));
      const note = { kind: "note", side, participants, text: noteMatch[3].trim() };
      ir.steps.push(note);
      continue;
    }
    const arrowMatch = matchSequenceArrow(line);
    if (arrowMatch) {
      ensureParticipant(arrowMatch.from);
      ensureParticipant(arrowMatch.to);
      const msg = {
        kind: "message",
        from: arrowMatch.from,
        to: arrowMatch.to,
        arrow: arrowMatch.arrow,
        label: arrowMatch.label
      };
      ir.steps.push(msg);
    }
  }
  return ir;
}
var CLASS_VISIBILITY = {
  "+": "public",
  "-": "private",
  "#": "protected",
  "~": "package"
};
var CLASS_REL_PATTERNS = [
  { re: /^([\w-]+)\s*<\|--\s*([\w-]+)$/, kind: "inheritance", reversed: true },
  { re: /^([\w-]+)\s*--\|>\s*([\w-]+)$/, kind: "inheritance" },
  { re: /^([\w-]+)\s*<\|\.\.\s*([\w-]+)$/, kind: "realization", reversed: true },
  { re: /^([\w-]+)\s*\.\.\|>\s*([\w-]+)$/, kind: "realization" },
  { re: /^([\w-]+)\s*\*--\s*([\w-]+)$/, kind: "composition" },
  { re: /^([\w-]+)\s*o--\s*([\w-]+)$/, kind: "aggregation" },
  { re: /^([\w-]+)\s*<\.\.\s*([\w-]+)$/, kind: "dependency", reversed: true },
  { re: /^([\w-]+)\s*\.\.>\s*([\w-]+)$/, kind: "dependency" },
  { re: /^([\w-]+)\s*--\s*([\w-]+)$/, kind: "association" }
];
function parseClassDiagram(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const classes = /* @__PURE__ */ new Map();
  const relations = [];
  const ensureClass = (id) => {
    let cls = classes.get(id);
    if (!cls) {
      cls = { id, label: id, members: [] };
      classes.set(id, cls);
    }
    return cls;
  };
  let currentClassBody = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("%%")) continue;
    if (/^classdiagram\b/i.test(line)) continue;
    if (currentClassBody) {
      if (/^\}\s*$/.test(line)) {
        currentClassBody = null;
        continue;
      }
      const stereotype = matchStereotype(line);
      if (stereotype) {
        ensureClass(currentClassBody).stereotype = stereotype;
        continue;
      }
      const member = parseClassMember(line);
      if (member) ensureClass(currentClassBody).members.push(member);
      continue;
    }
    const sameLine = line.match(/^class\s+([\w-]+)\s*\{(.*)\}\s*$/);
    if (sameLine) {
      const cls = ensureClass(sameLine[1]);
      const inner = sameLine[2].split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
      for (const part of inner) {
        const stereotype = matchStereotype(part);
        if (stereotype) {
          cls.stereotype = stereotype;
          continue;
        }
        const m = parseClassMember(part);
        if (m) cls.members.push(m);
      }
      continue;
    }
    const open = line.match(/^class\s+([\w-]+)\s*\{$/);
    if (open) {
      ensureClass(open[1]);
      currentClassBody = open[1];
      continue;
    }
    const decl = line.match(/^class\s+([\w-]+)$/);
    if (decl) {
      ensureClass(decl[1]);
      continue;
    }
    const memberDecl = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (memberDecl && !line.includes("-->") && !line.includes("--")) {
      const stereotype = matchStereotype(memberDecl[2]);
      if (stereotype) {
        ensureClass(memberDecl[1]).stereotype = stereotype;
        continue;
      }
      const m = parseClassMember(memberDecl[2]);
      if (m) ensureClass(memberDecl[1]).members.push(m);
      continue;
    }
    let labelPart;
    let relLine = line;
    const labelMatch = line.match(/^(.+?)\s*:\s*(.+)$/);
    if (labelMatch && /(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|o--|<\.\.|\.\.>|--)/.test(labelMatch[1])) {
      relLine = labelMatch[1];
      labelPart = labelMatch[2].trim();
    }
    for (const { re, kind, reversed } of CLASS_REL_PATTERNS) {
      const m = relLine.match(re);
      if (m) {
        const a = m[1];
        const b = m[2];
        ensureClass(a);
        ensureClass(b);
        relations.push({
          source: reversed ? b : a,
          target: reversed ? a : b,
          kind,
          label: labelPart
        });
        break;
      }
    }
  }
  return { type: "class", classes: [...classes.values()], relations };
}
function matchStereotype(text) {
  const m = text.trim().match(/^<<\s*([^>]+?)\s*>>$/);
  return m ? m[1] : void 0;
}
function parseClassMember(text) {
  const t = text.trim();
  if (!t) return null;
  let visibility;
  let body = t;
  const first = body[0];
  if (first in CLASS_VISIBILITY) {
    visibility = CLASS_VISIBILITY[first];
    body = body.slice(1).trim();
  }
  const methodMatch = body.match(/^([\w-]+)\(([^)]*)\)(?:\s*([\w<>[\]]+))?$/);
  if (methodMatch) {
    return {
      kind: "method",
      visibility,
      name: methodMatch[1],
      parameters: methodMatch[2] || void 0,
      returnType: methodMatch[3] || void 0
    };
  }
  const colonMatch = body.match(/^([\w-]+)\s*:\s*([\w<>[\]]+)$/);
  if (colonMatch) {
    return { kind: "attribute", visibility, name: colonMatch[1], returnType: colonMatch[2] };
  }
  const typeNameMatch = body.match(/^([\w<>[\]]+)\s+([\w-]+)$/);
  if (typeNameMatch) {
    return { kind: "attribute", visibility, name: typeNameMatch[2], returnType: typeNameMatch[1] };
  }
  return { kind: "attribute", visibility, name: body };
}
function parseStateDiagram(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const states = /* @__PURE__ */ new Map();
  const transitions = [];
  const parentStack = [];
  const currentParent = () => parentStack.length > 0 ? parentStack[parentStack.length - 1] : void 0;
  const markerId = (kind, parent) => parent ? `__${kind}_${parent}` : `__${kind}`;
  const ensureMarker = (kind) => {
    const parent = currentParent();
    const id = markerId(kind, parent);
    let s = states.get(id);
    if (!s) {
      s = { id, label: "", kind, parent };
      states.set(id, s);
    }
    return s;
  };
  const ensureState = (id) => {
    let s = states.get(id);
    if (s) return s;
    s = { id, label: id, kind: "state", parent: currentParent() };
    states.set(id, s);
    return s;
  };
  for (const line of lines) {
    if (!line || line.startsWith("%%")) continue;
    if (/^statediagram(-v2)?\b/i.test(line)) continue;
    const compositeOpen = line.match(/^state\s+([\w-]+)\s*\{$/);
    if (compositeOpen) {
      const id = compositeOpen[1];
      const existing = states.get(id);
      if (existing) {
        existing.kind = "composite";
      } else {
        states.set(id, { id, label: id, kind: "composite", parent: currentParent() });
      }
      parentStack.push(id);
      continue;
    }
    if (line === "}") {
      parentStack.pop();
      continue;
    }
    const arrow = line.match(/^(\[\*\]|[\w-]+)\s*-->\s*(\[\*\]|[\w-]+)(?:\s*:\s*(.+))?$/);
    if (arrow) {
      const src = arrow[1] === "[*]" ? ensureMarker("start") : ensureState(arrow[1]);
      const tgt = arrow[2] === "[*]" ? ensureMarker("end") : ensureState(arrow[2]);
      transitions.push({
        source: src.id,
        target: tgt.id,
        label: arrow[3]?.trim(),
        parent: currentParent()
      });
      continue;
    }
    const stateLabel2 = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (stateLabel2) {
      const s = ensureState(stateLabel2[1]);
      s.label = stateLabel2[2].trim();
      continue;
    }
    if (/^[\w-]+$/.test(line)) ensureState(line);
  }
  return { type: "state", states: [...states.values()], transitions };
}
function parseMermaidERDiagram(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const tables = /* @__PURE__ */ new Map();
  const relations = [];
  const ensureTable = (name) => {
    let t = tables.get(name);
    if (!t) {
      t = { name, columns: [] };
      tables.set(name, t);
    }
    return t;
  };
  let currentTableBody = null;
  for (const line of lines) {
    if (!line || line.startsWith("%%")) continue;
    if (/^erdiagram\b/i.test(line)) continue;
    if (currentTableBody) {
      if (/^\}\s*$/.test(line)) {
        currentTableBody = null;
        continue;
      }
      const col = line.match(/^([\w-]+)\s+([\w-]+)(?:\s+(.+))?$/);
      if (col) {
        const flags = (col[3] ?? "").toUpperCase();
        const column = {
          name: col[2],
          type: col[1],
          isPK: /\bPK\b/.test(flags),
          isFK: /\bFK\b/.test(flags),
          isNullable: !/\bNOT NULL\b/.test(flags),
          isUnique: /\bUK\b/.test(flags) || /\bUNIQUE\b/.test(flags)
        };
        ensureTable(currentTableBody).columns.push(column);
      }
      continue;
    }
    const blockOpen = line.match(/^([A-Z][\w-]*)\s*\{$/);
    if (blockOpen) {
      ensureTable(blockOpen[1]);
      currentTableBody = blockOpen[1];
      continue;
    }
    const rel = line.match(/^([A-Z][\w-]*)\s+([|}{o\-.]+)\s+([A-Z][\w-]*)\s*:\s*(.+)$/);
    if (rel) {
      const fromTable = rel[1];
      const toTable = rel[3];
      const cardinality = rel[2];
      ensureTable(fromTable);
      ensureTable(toTable);
      const labelText = stripQuotes(rel[4].trim());
      relations.push({
        fromTable,
        fromCol: labelText,
        toTable,
        toCol: labelText,
        nullable: cardinality.includes("o")
      });
    }
  }
  const schema = {
    tables: [...tables.values()],
    relations,
    inputFormat: "unknown"
  };
  return { type: "er", schema };
}
var GANTT_TASK_LINE_RE = /^([^:]+?)\s*:\s*(.+)$/;
var STATUS_TOKENS = {
  done: "done",
  active: "active",
  crit: "crit",
  milestone: "milestone"
};
function parseGantt(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const ir = { type: "gantt", tasks: [] };
  const intermediates = [];
  let currentSection;
  let anonCounter = 0;
  for (const line of lines) {
    if (!line || line.startsWith("%%")) continue;
    if (/^gantt\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const dateMatch = line.match(/^dateFormat\s+(.+)$/i);
    if (dateMatch) {
      ir.dateFormat = dateMatch[1].trim();
      continue;
    }
    const axisMatch = line.match(/^axisFormat\s+(.+)$/i);
    if (axisMatch) {
      ir.axisFormat = axisMatch[1].trim();
      continue;
    }
    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    if (/^(excludes|includes|todayMarker|click|tickInterval|weekday)\b/i.test(line)) continue;
    const taskMatch = line.match(GANTT_TASK_LINE_RE);
    if (!taskMatch) continue;
    const label = taskMatch[1].trim();
    const parts = taskMatch[2].split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    let status = "default";
    let id;
    let startSpec;
    let durationOrEnd;
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower in STATUS_TOKENS) {
        status = STATUS_TOKENS[lower];
        continue;
      }
      if (id === void 0 && /^[\w-]+$/.test(part) && !isDateLike(part) && !/^\d/.test(part)) {
        id = part;
        continue;
      }
      if (startSpec === void 0) {
        startSpec = part;
        continue;
      }
      if (durationOrEnd === void 0) {
        durationOrEnd = part;
        continue;
      }
    }
    if (!startSpec || !durationOrEnd) continue;
    intermediates.push({
      id: id ?? `__gantt_${anonCounter++}`,
      label,
      status,
      startSpec,
      durationOrEnd,
      section: currentSection
    });
  }
  const byId = /* @__PURE__ */ new Map();
  for (const it of intermediates) {
    const start = resolveGanttDate(it.startSpec, byId);
    if (!start) continue;
    let end = resolveGanttDate(it.durationOrEnd, byId);
    if (!end) {
      end = applyGanttDuration(start, it.durationOrEnd);
    }
    if (!end) continue;
    if (it.status === "milestone") end = start;
    const task = {
      id: it.id,
      label: it.label,
      start: toIsoDay(start),
      end: toIsoDay(end),
      status: it.status,
      section: it.section
    };
    ir.tasks.push(task);
    byId.set(it.id, task);
  }
  return ir;
}
function isDateLike(s) {
  return /^\d{4}-\d{2}-\d{2}/.test(s);
}
function resolveGanttDate(spec, byId) {
  if (isDateLike(spec)) {
    const d = new Date(spec);
    return isNaN(d.getTime()) ? null : d;
  }
  const after = spec.match(/^after\s+(.+)$/i);
  if (after) {
    const refIds = after[1].split(/\s+/);
    let max = null;
    for (const refId of refIds) {
      const ref = byId.get(refId);
      if (!ref) continue;
      const d = new Date(ref.end);
      if (!max || d.getTime() > max.getTime()) max = d;
    }
    return max;
  }
  return null;
}
function applyGanttDuration(start, dur) {
  const m = dur.match(/^(\d+(?:\.\d+)?)\s*(d|h|w|m|y)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const result = new Date(start);
  switch (unit) {
    case "h":
      result.setHours(result.getHours() + n);
      break;
    case "d":
      result.setDate(result.getDate() + n);
      break;
    case "w":
      result.setDate(result.getDate() + n * 7);
      break;
    case "m":
      result.setMonth(result.getMonth() + n);
      break;
    case "y":
      result.setFullYear(result.getFullYear() + n);
      break;
    default:
      return null;
  }
  return result;
}
function toIsoDay(d) {
  return d.toISOString();
}
function parseTimeline(source) {
  const lines = source.split("\n");
  const ir = { type: "timeline", events: [] };
  let currentSection;
  let counter = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%%")) continue;
    if (/^timeline\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    const parts = line.split(":").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const period = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const event = {
        id: `__tl_${counter++}`,
        period,
        text: parts[i],
        section: currentSection
      };
      ir.events.push(event);
    }
  }
  return ir;
}
var MINDMAP_SHAPE_PATTERNS = [
  { re: /^([\w-]*)\(\(([^)]*)\)\)$/, shape: "circle" },
  // ((text))
  { re: /^([\w-]*)\)\)([^(]*)\(\($/, shape: "bang" },
  // ))text(( bang
  { re: /^([\w-]*)\)([^(]*)\($/, shape: "cloud" },
  // )text( cloud
  { re: /^([\w-]*)\{\{([^}]*)\}\}$/, shape: "hexagon" },
  // {{text}}
  { re: /^([\w-]*)\(([^)]*)\)$/, shape: "rounded" },
  // (text)
  { re: /^([\w-]*)\[([^\]]*)\]$/, shape: "square" }
  // [text]
];
function parseMindmap(source) {
  const rawLines = source.split("\n");
  const stripped = [];
  let inHeader = true;
  for (const line of rawLines) {
    if (line.trim().length === 0) continue;
    if (inHeader && /^\s*mindmap\b/i.test(line)) {
      inHeader = false;
      continue;
    }
    inHeader = false;
    if (line.trim().startsWith("%%")) continue;
    const indent = line.match(/^\s*/)?.[0]?.length ?? 0;
    stripped.push({ indent, raw: line.trim() });
  }
  if (stripped.length === 0) {
    return {
      type: "mindmap",
      root: { id: "__mm_0", label: "Mindmap", shape: "default", children: [] }
    };
  }
  let counter = 0;
  const makeNode = (raw) => {
    let label = raw;
    let shape = "default";
    let icon;
    const iconMatch = label.match(/^(.*?)\s*::icon\(([^)]+)\)\s*$/);
    if (iconMatch) {
      label = iconMatch[1].trim();
      icon = iconMatch[2].trim();
    }
    for (const { re, shape: s } of MINDMAP_SHAPE_PATTERNS) {
      const m = label.match(re);
      if (m) {
        label = m[2].trim() || m[1].trim();
        shape = s;
        break;
      }
    }
    const node = {
      id: `__mm_${counter++}`,
      label,
      shape,
      children: []
    };
    if (icon) node.icon = icon;
    return node;
  };
  const rootEntry = stripped[0];
  const root = makeNode(rootEntry.raw);
  const stack = [{ indent: rootEntry.indent, node: root }];
  for (let i = 1; i < stripped.length; i++) {
    const { indent, raw } = stripped[i];
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
    const node = makeNode(raw);
    parent.children.push(node);
    stack.push({ indent, node });
  }
  return { type: "mindmap", root };
}
var ARCH_DECL_RE = /^(group|service)\s+([\w-]+)\s*(?:\(([^)]+)\))?\s*(?:\[([^\]]+)\])?\s*(?:in\s+([\w-]+))?\s*$/i;
var ARCH_EDGE_RE = /^([\w-]+)(?::([LRTB]))?\s*(?:--|<-->|<--|-->|<-|->)\s*(?:([LRTB]):)?([\w-]+)(?:\s*\[([^\]]+)\])?$/i;
function parseArchitecture(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const nodes = [];
  const edges = [];
  for (const line of lines) {
    if (!line || line.startsWith("%%")) continue;
    if (/^architecture(-beta)?\b/i.test(line)) continue;
    if (/^title\b/i.test(line)) continue;
    const decl = line.match(ARCH_DECL_RE);
    if (decl) {
      const [, kind, id, icon, label, parent] = decl;
      nodes.push({
        id,
        kind: kind.toLowerCase() === "group" ? "group" : "service",
        label: label?.trim() || id,
        icon: icon?.trim() || void 0,
        parent: parent?.trim() || void 0
      });
      continue;
    }
    const edge = line.match(ARCH_EDGE_RE);
    if (edge) {
      const [, source2, sourceSide, targetSide, target, label] = edge;
      edges.push({
        source: source2,
        target,
        sourceSide: sourceSide?.toUpperCase() ?? void 0,
        targetSide: targetSide?.toUpperCase() ?? void 0,
        label: label?.trim() || void 0
      });
    }
  }
  return { type: "architecture", nodes, edges };
}
var C4_VARIANT_RE = /^C4(Context|Container|Component|Deployment)\b/i;
var C4_ELEMENT_RE = /^([A-Z][\w_]*)\s*\(\s*([^,)]+)(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)\s*\{?\s*$/;
var C4_REL_RE = /^(Rel|BiRel|Rel_Back|Rel_Up|Rel_Down|Rel_Left|Rel_Right)\s*\(\s*([\w_]+)\s*,\s*([\w_]+)\s*(?:,\s*"([^"]*)")?(?:\s*,\s*"([^"]*)")?\s*\)\s*$/i;
var C4_KIND_MAP = {
  Person: "person",
  Person_Ext: "person-external",
  System: "system",
  System_Ext: "system-external",
  SystemDb: "system-db",
  SystemDb_Ext: "system-db",
  SystemQueue: "system-queue",
  SystemQueue_Ext: "system-queue",
  Container: "container",
  Container_Ext: "container-external",
  ContainerDb: "container-db",
  ContainerDb_Ext: "container-db",
  ContainerQueue: "container-queue",
  Component: "component",
  Component_Ext: "component-external",
  ComponentDb: "component-db",
  ComponentQueue: "component-queue",
  Boundary: "boundary",
  System_Boundary: "system-boundary",
  Container_Boundary: "container-boundary",
  Enterprise_Boundary: "enterprise-boundary",
  Node: "node",
  Deployment_Node: "node"
};
function parseC4(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const elements = [];
  const relations = [];
  let variant = "context";
  let title;
  const boundaryStack = [];
  for (const rawLine of lines) {
    let line = rawLine;
    if (!line || line.startsWith("%%")) continue;
    const v = line.match(C4_VARIANT_RE);
    if (v) {
      const t = v[1].toLowerCase();
      variant = t === "context" ? "context" : t === "container" ? "container" : t === "component" ? "component" : "deployment";
      continue;
    }
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }
    if (line === "}") {
      boundaryStack.pop();
      continue;
    }
    const rel = line.match(C4_REL_RE);
    if (rel) {
      const [, , src, tgt, label, technology] = rel;
      relations.push({ source: src, target: tgt, label, technology });
      continue;
    }
    const el = line.match(C4_ELEMENT_RE);
    if (el) {
      const [, type, id, ...rest] = el;
      const kind = C4_KIND_MAP[type] ?? "system";
      const label = rest[0] ?? id;
      const isBoundary = kind.endsWith("boundary") || kind === "node";
      const technology = !isBoundary ? rest[1] : void 0;
      const description = !isBoundary ? rest[2] : rest[1];
      elements.push({
        id,
        kind,
        label: label.trim(),
        technology: technology?.trim(),
        description: description?.trim(),
        parent: boundaryStack.length > 0 ? boundaryStack[boundaryStack.length - 1] : void 0
      });
      if (line.endsWith("{") && isBoundary) {
        boundaryStack.push(id);
      }
    }
  }
  return { type: "c4", variant, title, elements, relations };
}
function parseGitGraph(source) {
  const lines = source.split("\n").map((l) => l.trim());
  const ops = [];
  let title;
  for (const line of lines) {
    if (!line || line.startsWith("%%")) continue;
    if (/^gitgraph\b/i.test(line) || /^---/.test(line)) continue;
    const titleMatch = line.match(/^title:\s*(.+)$/i) || line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }
    const commit = line.match(/^commit\b(.*)$/i);
    if (commit) {
      const rest = commit[1];
      const idMatch = rest.match(/id:\s*"([^"]+)"/);
      const tagMatch = rest.match(/tag:\s*"([^"]+)"/);
      const typeMatch = rest.match(/type:\s*(HIGHLIGHT|REVERSE|NORMAL)/);
      ops.push({
        kind: "commit",
        id: idMatch?.[1],
        tag: tagMatch?.[1],
        type: typeMatch ? typeMatch[1] : "NORMAL"
      });
      continue;
    }
    const branch = line.match(/^branch\s+([\w/-]+)/i);
    if (branch) {
      ops.push({ kind: "branch", name: branch[1] });
      continue;
    }
    const checkout = line.match(/^(?:checkout|switch)\s+([\w/-]+)/i);
    if (checkout) {
      ops.push({ kind: "checkout", name: checkout[1] });
      continue;
    }
    const merge = line.match(/^merge\s+([\w/-]+)(?:\s+tag:\s*"([^"]+)")?/i);
    if (merge) {
      ops.push({ kind: "merge", from: merge[1], tag: merge[2] });
      continue;
    }
    const cherry = line.match(/^cherry-pick\s+id:\s*"([^"]+)"/i);
    if (cherry) {
      ops.push({ kind: "cherry-pick", commitId: cherry[1] });
    }
  }
  return { type: "gitgraph", title, ops };
}
init_FlowchartRenderer();
init_ERRenderer();
init_PieRenderer();
init_QuadrantRenderer();
init_JourneyRenderer();
init_SequenceRenderer();
init_ClassRenderer();
init_StateRenderer();
init_GanttRenderer();
init_TimelineRenderer();
init_MindmapRenderer();
init_ArchitectureRenderer();
init_C4Renderer();
init_GitGraphRenderer();
init_dagreLayout();
init_svgBuilders();
var FLOW_DEFAULT_SIZE = { width: 180, height: 60 };
var CLASS_NODE_WIDTH = 220;
var ER_NODE_WIDTH = 240;
var ER_HEADER_H = 34;
var ER_ROW_H = 26;
function flowchartNodeSize2(label) {
  const segs = splitOnBr(label);
  const maxLen = Math.max(...segs.map((s) => s.length));
  return {
    width: Math.max(160, Math.min(320, maxLen * 8 + 40)),
    height: 48 + (segs.length - 1) * 18
  };
}
function flowchartToSvg(ir, options = {}) {
  const nodeSizes = /* @__PURE__ */ new Map();
  for (const node of ir.nodes) {
    nodeSizes.set(node.id, flowchartNodeSize2(node.label || node.id));
  }
  const { nodePositions } = layoutFlowchart(ir, {
    defaultNodeSize: FLOW_DEFAULT_SIZE,
    nodeSizes
  });
  return buildFlowchartSvg(ir, nodePositions, options);
}
function classToSvg(ir, options = {}) {
  const g = new import_dagre.default.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  const sizeFor = (memberCount) => ({
    width: CLASS_NODE_WIDTH,
    height: Math.max(64, 40 + memberCount * 18)
  });
  for (const cls of ir.classes) g.setNode(cls.id, sizeFor(cls.members.length));
  for (const rel of ir.relations) {
    if (g.hasNode(rel.source) && g.hasNode(rel.target)) g.setEdge(rel.source, rel.target);
  }
  import_dagre.default.layout(g);
  const positions = /* @__PURE__ */ new Map();
  for (const cls of ir.classes) {
    const { x, y } = g.node(cls.id);
    const size = sizeFor(cls.members.length);
    positions.set(cls.id, {
      x: x - size.width / 2,
      y: y - size.height / 2,
      width: size.width,
      height: size.height
    });
  }
  return buildClassSvg(ir, positions, options);
}
function erToSvg(ir, options = {}) {
  const g = new import_dagre.default.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 100, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  const tableHeight = (cols) => ER_HEADER_H + cols * ER_ROW_H;
  for (const table of ir.schema.tables) {
    g.setNode(table.name, {
      width: ER_NODE_WIDTH,
      height: tableHeight(table.columns.length)
    });
  }
  for (const rel of ir.schema.relations) {
    if (g.hasNode(rel.fromTable) && g.hasNode(rel.toTable)) {
      g.setEdge(rel.fromTable, rel.toTable);
    }
  }
  import_dagre.default.layout(g);
  const positions = /* @__PURE__ */ new Map();
  for (const table of ir.schema.tables) {
    const { x, y } = g.node(table.name);
    const h = tableHeight(table.columns.length);
    positions.set(table.name, {
      x: x - ER_NODE_WIDTH / 2,
      y: y - h / 2,
      width: ER_NODE_WIDTH,
      height: h
    });
  }
  return buildErSvg(ir, positions, options);
}
init_svgBuilders();
var GLYPH_EDGES = {
  "\u2500": 1 | 2,
  "\u2502": 4 | 8,
  "\u250C": 2 | 8,
  "\u2510": 1 | 8,
  "\u2514": 2 | 4,
  "\u2518": 1 | 4,
  "\u251C": 2 | 4 | 8,
  "\u2524": 1 | 4 | 8,
  "\u252C": 1 | 2 | 8,
  "\u2534": 1 | 2 | 4,
  "\u253C": 1 | 2 | 4 | 8
  /* D */
};
var EDGES_TO_GLYPH = {};
for (const [glyph, mask] of Object.entries(GLYPH_EDGES)) {
  EDGES_TO_GLYPH[mask] = glyph;
}
init_dagreLayout();
var SEQ_HEADER_HEIGHT = 3;
var SEQ_FIRST_STEP_ROW = SEQ_HEADER_HEIGHT + 1;
init_dagreLayout();
init_theme();
export {
  buildArchitectureSvg,
  buildC4Svg,
  buildGanttSvg,
  buildGitGraphSvg,
  buildJourneySvg,
  buildPieSvg,
  buildQuadrantSvg,
  buildTimelineSvg,
  classToSvg,
  erToSvg,
  flowchartToSvg,
  parseToIR
};
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.js:
  (**
   * @license React
   * react-jsx-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.development.js:
  (**
   * @license React
   * react-jsx-runtime.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
