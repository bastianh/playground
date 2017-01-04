var _ = require('lodash');

function getRandomString() {
    for (var val = Math.floor(Math.random() * 0x10000).toString(16); val.length < 4; val = '0' + val);
    return val;
}

function genId(obj) {
    var id = getRandomString() + Date.now().toString(16).slice(4) + getRandomString();
    if (obj && !obj._id) {
        obj._id = id;
    }
    return id;
}

function recursReplaceNeNull(val) {
    if (!_.isObject(val)) {
        return;
    }

    for (var i in val) {
        if (_.isEqual(val[i], {
                $ne: null
            }) && !val.$and) {
            val.$and = [{
                [i]: {
                    $ne: null
                }
            }, {
                [i]: {
                    $ne: undefined
                }
            }];
            delete val[i];
        }
        if (_.isEqual(val[i], {
                $eq: null
            }) && !val.$or) {
            val.$or = [{
                [i]: {
                    $eq: null
                }
            }, {
                [i]: {
                    $eq: undefined
                }
            }];
            delete val[i];
        }
        recursReplaceNeNull(val[i]);
    }
}


module.exports = function(config) {

    if (config.storage) {
        var oldGetDb = config.storage.getDb;
        var db;
        config.storage.getDb = function() {
            db = oldGetDb.apply(this, Array.prototype.slice.call(arguments));
            return db;
        }

        zerorpc = require("zerorpc");

        var server = new zerorpc.Server({
            hello: function(name, reply) {
                reply(null, "Hello, " + name);
            },
            dbRequest: function(collectionName, method, argsArray, cb) {
                try {
                    var collection = db.getCollection(collectionName);
                    if (method == 'insert') {
                        if (_.isArray(argsArray[0])) {
                            argsArray[0].forEach(genId);
                        } else {
                            genId(argsArray[0]);
                        }
                    }

                    if (method == 'find' || method == 'findOne' || method == 'count' || method == 'removeWhere') {
                        recursReplaceNeNull(argsArray[0]);
                    }

                    var result = collection[method].apply(collection, argsArray);
                    cb(null, result);
                } catch (e) {
                    cb(e.message);
                    console.error(e);
                }
            },
            dbFindEx: function(collectionName, query, opts, cb) {
                try {
                    console.log("C", collectionName, "Q", query, "O", opts, "CB", cb);
                    recursReplaceNeNull(query);
                    var collection = db.getCollection(collectionName);
                    var chain = collection.chain().find(query);
                    if (opts.sort) {
                        for (var field in opts.sort) {
                            chain = chain.simplesort(field, opts.sort[field] == -1);
                        }
                    }
                    if (opts.offset) {
                        chain = chain.offset(opts.offset);
                    }
                    if (opts.limit) {
                        chain = chain.limit(opts.limit);
                    }
                    cb(null, chain.data());
                } catch (e) {
                    cb(e.message);
                    console.error(e);
                }
            },

        });
        server.bind("tcp://127.0.0.1:4242");
        console.log("Starting ZeroRPC Service...")
    }
};
