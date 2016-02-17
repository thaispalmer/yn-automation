#!/usr/bin/env node

/**
 * Initial Setup
 * */
// Loading modules
var fs = require('fs');
var spawn = require('child_process');
var mongoose = require('mongoose');

// Loading configuration
var _config = JSON.parse(fs.readFileSync('yournode-master.conf', 'utf8'));

// Verbose mode
var verbose = true;


/**
 * Helper functions
 * */
var helpers = {
    checkIfExists: function (path) {
        if (typeof fs.accessSync !== 'undefined') check = fs.accessSync(path);
        else check = fs.existsSync(path);
        return check;
    },
    arraySearch: function (haystack, key, needle) {
        var results = [];
        for (var i=0; i < haystack.length; i++) {
            if (haystack[i][key].indexOf(needle) != -1) results.push(i);
        }
        return results;
    },
    getPort: function (shardName, callback) {
        var search = function() {
            var port = Math.floor((Math.random() * (_config.portRange.max - _config.portRange.min)) + _config.portRange.min);
            models.User.findOne({'apps.shard': shardName, 'apps.port': port}, function (error, result) {
                if (error) app.dbError(error);
                else if (result) search();
                else callback(port);
            });
        }
        search();
    },
    remoteCommand: function(host, params) {
        var response = spawn.spawnSync('ssh', ['yournode@'+host, params]);
        if (response.status === 0) return true;
        else {
            app.log('[Error] A problem with the shard ocurred: ' + response.stderr);
            process.error(1);
        }
    }
    sortShardsByUsage: function (callback) {
        models.Shard.find({}, function (error, foundShards) {
            if (error) app.dbError(error);
            else if (foundShards) {
                shardsQuery = [];
                for (var i=0; i < foundShards.length; i++) {
                    shardsQuery.push({ 'apps.shard': foundShards[i].name });
                }
                models.User.aggregate([
                    { $match: {
                        $or: shardsQuery
                    } },
                    { $project: { 'apps.shard': 1 } },
                    { $unwind: "$apps" },
                    { $group: {
                        _id: "$apps.shard",
                        count: { $sum: 1 }
                    } },
                    { $sort: { count: 1 } }
                ], function (error, result) {
                    if (error) app.dbError(error);
                    else {
                        // TODO: Sort shards by usage.
                        for (var i=0; i < foundShards.length; i++) {
                            if (helpers.arraySearch(result, '_id', foundShards[i].name).length === 0) {
                                result.unshift({
                                    _id: foundShards[i].name,
                                    count: 0
                                });
                            }
                        }
                        callback(result);
                    }
                });
            }
            else {
                app.log('[Error] No shards found.');
                process.exit(1);
            }
        });
    },
    proxyReload: function () {
        var response = spawn.spawnSync('nginx', ['-s', 'reload']);
        if (response.status === 0) app.log('[OK] Proxy reloaded');
        else {
            app.log('[Error] A problem with the proxy ocurred: ' + response.stderr);
            process.exit(1);
        }
    },
    generateKeys: function (username) {
        var response = spawn.spawnSync('ssh-keygen', ['-t', 'rsa', '-C', 'YourNode deploy key for ' + username, '-N', '', '-f', _config.userKeys + username]);
        if (response.status === 0) app.log('[OK] Deploy Keys created sucessfully for ' + username);
        else {
            app.log('[Error] A problem while generating deploy keys ocurred: ' + response.stderr);
            process.exit(1);
        }
    },
    transferKeys: function (username, ip) {
        var response = spawn.spawnSync('scp', [_config.userKeys + username + '*', 'yournode@' + ip + ':' + _config.userKeys]);
        if (response.status === 0) app.log('[OK] Deploy Keys transfered sucessfully for ' + username + ' to ' + ip);
        else {
            app.log('[Error] A problem while transfering deploy keys ocurred: ' + response.stderr);
            process.exit(1);
        }
    },
    generateProxyConfig: function (username, app_name, ip, port, custom_domain) {
        var hostConfiguration = "server {\n" +
                                "    listen 80;\n\n" +
                                "    server_name " + (username + '-' + app_name) + _config.subdomain + ";\n\n" +
                                "    location / {\n" +
                                "        proxy_pass http://" + ip + ":" + port + ";\n" +
                                "        proxy_http_version 1.1;\n" +
                                "        proxy_set_header Upgrade $http_upgrade;\n" +
                                "        proxy_set_header Connection 'upgrade';\n" +
                                "        proxy_set_header Host $host;\n" +
                                "        proxy_cache_bypass $http_upgrade;\n" +
                                "    }\n" +
                                "}";
        if (custom_domain) {
            hostConfiguration += "\n\nserver {\n" +
                                 "    listen 80;\n\n" +
                                 "    server_name " + customDomain + ";\n\n" +
                                 "    location / {\n" +
                                 "        proxy_pass http://" + ip + ":" + port + ";\n" +
                                 "        proxy_http_version 1.1;\n" +
                                 "        proxy_set_header Upgrade $http_upgrade;\n" +
                                 "        proxy_set_header Connection 'upgrade';\n" +
                                 "        proxy_set_header Host $host;\n" +
                                 "        proxy_cache_bypass $http_upgrade;\n" +
                                 "    }\n" +
                                 "}";
        }
        fs.writeFileSync(_config.proxy.available + (username + '-' + app_name) + '.conf', hostConfiguration);
        app.log('[OK] Create proxy configuration for ' + username + '-' + app_name);
    }
}


/**
 * Application functions
 * */
var app = {
    log: function (message) {
        if (verbose) console.log(message);
        fs.appendFile(_config.logFile, message + "\n");
    },
    dbError: function (error) {
        app.log('[Error] Database Error: ' + error);
        process.exit(1);
    },
    shard: {
        create: function (name, hostname, ip, limit) {
            hostname = hostname.toLowerCase();
            models.Shard.findOne({$or: [{name: name}, {hostname: hostname}, {ip: ip}]}, function (error, foundShard) {
                if (error) app.dbError(error);
                else if (foundShard) {
                    if ((foundShard.hostname == hostname) && (foundShard.ip == ip)) app.log('[Error] Shard already exists');
                    else if (foundShard.name == name) app.log('[Error] There is already a shard with that name');
                    else if (foundShard.hostname == hostname) app.log('[Error] There is already a shard with that hostname');
                    else if (foundShard.ip == ip) app.log('[Error] There is already a shard with that ip');
                    process.exit(1);
                }
                else {
                    newShard = new models.Shard({
                        name: name,
                        hostname: hostname,
                        ip: ip,
                        limit: limit,
                    });
                    newShard.save(function (error, result) {
                        if (error) app.dbError(error);
                        else {
                            app.log('[OK] Shard ' + name + ' created sucessfully');
                            process.exit(0);
                        }
                    });
                }
            });
        },
        list: function (byUsage) {
            if (byUsage == true) {
                helpers.sortShardsByUsage(function (result) {
                    console.log('Listing Shards by Usage:');
                    console.log('');
                    for (var i=0; i < result.length; i++) {
                        console.log(result[i]._id + ' : ' + result[i].count + ' apps');
                    }
                    if (i>0) {
                        console.log('');
                        console.log('Total of ' + i + ' shards.');
                    }
                    else console.log('No Shards found.');
                    process.exit(0);
                });
            }
            else {
                console.log('Listing Shards:');
                console.log('');
                models.Shard.find({}, function (error, foundShards) {
                    if (error) app.dbError(error);
                    else if (foundShards) {
                        for (var i=0; i < foundShards.length; i++) {
                            console.log(foundShards[i].name);
                        }
                        console.log('');
                        console.log('Total of ' + i + ' shards.');
                        process.exit(0);
                    }
                    else {
                        console.log('No Shards found.');
                        process.exit(0);
                    }
                });
            }
        }
    },
    user: {
        create: function (first_name, last_name, auth0_token, email, username) {
            email = email.toLowerCase();
            username = username.toLowerCase();
            models.User.findOne({$or: [{email: email}, {username: username}]}, function (error, foundUser) {
                if (error) app.dbError(error);
                else if (foundUser) {
                    if ((foundUser.email == email) && (foundUser.username == username)) app.log('[Error] Username and Email already exists');
                    else if (foundUser.email == email) app.log('[Error] Email already exists');
                    else if (foundUser.username == username) app.log('[Error] Username already exists');
                    process.exit(1);
                }
                else {
                    newUser = new models.User({
                        first_name: first_name,
                        last_name: last_name,
                        auth0_token: auth0_token,
                        email: email,
                        username: username,
                        member_since: new Date,
                        last_tos_signed: new Date,
                        apps: [],
                        active: true
                    });
                    newUser.save(function (error, result) {
                        if (error) app.dbError(error);
                        else {
                            app.log('[OK] User ' + username + ' created');
                            helpers.generateKeys(username);
                            process.exit(0);
                        }
                    });
                }
            });
        },
        list: function () {
            console.log('Listing Users:');
            console.log('');
            models.User.find({}, function (error, foundUsers) {
                if (error) app.dbError(error);
                else if (foundUsers) {
                    for (var i=0; i < foundUsers.length; i++) {
                        console.log(foundUsers[i].first_name + ' ' + foundUsers[i].last_name + ' (' + foundUsers[i].username +') has ' + foundUsers[i].apps.length + ' applications - User ID: ' + foundUsers[i]._id);
                    }
                    console.log('');
                    console.log('Total of ' + i + ' users.');
                    process.exit(0);
                }
                else {
                    console.log('No Users found.');
                    process.exit(0);
                }
            });
        }
    },
    application: {
        create: function (user_id, app_name, plan) {
            app_name = app_name.toLowerCase();
            models.User.findOne({_id: user_id}, function (error, foundUser) {
                if (error) app.dbError(error);
                else if (foundUser) {
                    if (foundUser.active == false) {
                        app.log('[Error] The user is not active');
                        process.exit(1);
                    }
                    else {
                        var apps = helpers.arraySearch(foundUser.apps, 'name', app_name);
                        if (apps.length > 0) {
                            app.log('[Error] The user already has an application called ' + app_name);
                            process.exit(1);
                        }
                        else {
                            helpers.sortShardsByUsage(function (shardList) {
                                var shardName = shardList[0]._id;
                                helpers.getPort(shardName, function (port) {
                                    models.Shard.findOne({name: shardName}, function (error, foundShard) {
                                        if (error) app.dbError(error);
                                        else {
                                            helpers.generateProxyConfig(foundUser.username, app_name, foundShard.ip, port, null);
                                            foundUser.apps.push({
                                                "name": app_name,
                                                "port": port,
                                                "custom_domain": "",
                                                "created_on": new Date,
                                                "shard": shardName,
                                                "plan": plan,
                                                "enabled": false
                                            });
                                            helpers.remoteCommand(foundShard.ip, 'yn-shard init ' + foundUser.username + ' ' + app_name);
                                            helpers.transferKeys(foundUser.username, foundShard.ip);
                                            foundUser.save(function (error) {
                                                if (error) app.dbError(error);
                                                else {
                                                    app.log('[OK] Application ' + app_name + ' created sucessfully');
                                                    process.exit(0);
                                                }
                                            });
                                        }
                                    });
                                });
                            });
                        }
                    }
                }
                else {
                    app.log('[Error] User not found');
                    process.exit(1);
                }
            });
        },
        setDomain: function (app_id, custom_domain) {
            models.User.findOne({'apps._id': app_id}, function (error, foundUser) {
                if (error) app.dbError(error);
                else if (foundUser) {
                    var application = foundUser.apps.id(app_id);
                    models.Shard.findOne({name: application.shard}, function (error, foundShard) {
                        if (error) app.dbError(error);
                        else if (foundShard) {
                            helpers.generateProxyConfig(foundUser.username, application.name, foundShard.ip, application.port, (custom_domain == "" ? null : custom_domain));
                            application.custom_domain = custom_domain;
                            foundUser.save(function (error) {
                                if (error) app.dbError(error);
                                else {
                                    app.log('[OK] Custom domain for ' + application.name + ' configured sucessfully');
                                    process.exit(0);
                                }
                            });
                        }
                        else {
                            app.log('[Error] Shard not found');
                            process.exit(1);
                        }
                    });
                }
                else {
                    app.log('[Error] Application not found');
                    process.exit(1);
                }
            });
        },
        enable: function (app_id) {
            models.User.findOne({'apps._id': app_id}, function (error, foundUser) {
                if (error) app.dbError(error);
                else if (foundUser) {
                    var application = foundUser.apps.id(app_id);
                    var pathToAvailable = _config.proxy.available + foundUser.username + '-' + application.name + '.conf';
                    var pathToEnabled = _config.proxy.enabled + foundUser.username + '-' + application.name + '.conf';
                    if (helpers.checkIfExists(pathToEnabled)) {
                        app.log('[Warning] Symlink already exists, creating a new one to be sure.');
                        fs.unlinkSync(pathToEnabled);
                    }
                    fs.symlinkSync(pathToAvailable, pathToEnabled);
                    helpers.proxyReload();
                    application.enable = true;
                    //foundUser.apps.id(app_id).enable = true;
                    foundUser.save(function (error) {
                        if (error) app.dbError(error);
                        else {
                            app.log('[OK] Application ' + application.name + ' enabled sucessfully');
                            process.exit(0);
                        }
                    });
                }
                else {
                    app.log('[Error] Application not found');
                    process.exit(1);
                }
            });
        },
        update: function (app_id) {
            models.User.findOne({'apps._id': app_id}, function (error, foundUser) {
                if (error) app.dbError(error);
                else if (foundUser) {
                    var application = foundUser.apps.id(app_id);
                    models.Shard.findOne({'name': application.shard}, function (error, foundShard) {
                        helpers.remoteCommand(foundShard.ip, 'yn-shard update ' + foundUser.username + ' ' + application.name + ' ' + application.port);
                        app.log('[OK] Application ' + application.name + ' settings and dependencies updated sucessfully');
                        process.exit(0);
                    });
                }
                else {
                    app.log('[Error] Application not found');
                    process.exit(1);
                }
            });
        },
        list: function (user_id) {
            if (typeof user_id == 'undefined') {
                console.log('Listing Applications:');
                console.log('');
                models.User.find({}, function (error, foundUsers) {
                    if (error) app.dbError(error);
                    else if (foundUsers) {
                        var appCount = 0;
                        for (var i=0; i < foundUsers.length; i++) {
                            for (var j=0; j < foundUsers[i].apps.length; j++) {
                                console.log(foundUsers[i].apps[j].name + ' (owned by ' + foundUsers[i].username + ') - Hosted on ' + foundUsers[i].apps[j].shard + ' - Aplication ID: ' + foundUsers[i].apps[j]._id);
                                appCount += 1;
                            }
                        }
                        console.log('');
                        console.log('Total of ' + appCount + ' applications.');
                        process.exit(0);
                    }
                    else {
                        console.log('No applications found.');
                        process.exit(0);
                    }
                });
            }
            else {
                models.User.findOne({_id: user_id}, function (error, foundUser) {
                    if (error) app.dbError(error);
                    else if (foundUser) {
                        console.log('Listing Applications for ' + foundUser.username + ':');
                        console.log('');
                        for (var i=0; i < foundUser.apps.length; i++) {
                            console.log(foundUser.apps[i].name + ' - Hosted on ' + foundUser.apps[i].shard + ' - Aplication ID: ' + foundUser.apps[i]._id);
                        }
                        if (i>0) {
                            console.log('');
                            console.log('Total of ' + foundUser.apps.length + ' applications.');
                        }
                        else console.log('No applications found.');
                        process.exit(0);
                    }
                    else {
                        console.log('No user found.');
                        process.exit(0);
                    }
                });
            }
        }
    },

    init: function() {
        /**
         * Models
         * */
        models = { Shard: null, Plan: null, User: null };
        schemas = { Shard: null, Plan: null, Application: null, User: null };
        var Schema = mongoose.Schema;
        schemas.Shard = new Schema({
            "name": String,
            "hostname": String,
            "ip": String,
            "limit": Number,
        });
        schemas.Plan = new Schema({
            "name": String,
            "price": Number,
            "cicle": Number,
            "created_on": Date,
            "updated_on": Date,
        });
        schemas.Application = new Schema({
            "name": String,
            "port": Number,
            "custom_domain": String,
            "created_on": Date,
            "shard": String,
            "plan": String,
            "enabled": false
        });
        schemas.User = new Schema({
            "first_name": String,
            "last_name": String,
            "auth0_token": String,
            "email": String,
            "username": String,
            "member_since": Date,
            "last_tos_signed": Date,
            "apps": [schemas.Application],
            "active": Boolean
        });
        models.Shard = mongoose.model('Shard', schemas.Shard);
        models.Plan = mongoose.model('Plan', schemas.Plan);
        models.User = mongoose.model('User', schemas.User);

        /**
         * Routing parameters
         * */
        switch (process.argv[2]) {
            case 'create':
                switch (process.argv[3]) {
                    case 'user':
                        app.user.create(process.argv[4], process.argv[5], process.argv[6], process.argv[7], process.argv[8]);
                        break;

                    case 'app':
                        app.application.create(process.argv[4], process.argv[5]);
                        break;

                    case 'shard':
                        app.shard.create(process.argv[4], process.argv[5], process.argv[6], process.argv[7]);
                        break;

                    default:
                        console.log('Unknown parameter.');
                        process.exit(0);
                        break;
                }
                break;

            case 'app':
                switch (process.argv[4]) {
                    case 'setDomain':
                        app.application.setDomain(process.argv[3], process.argv[5]);
                        break;

                    default:
                        console.log('Unknown parameter.');
                        process.exit(0);
                        break;
                }
                break;

            case 'list':
                switch (process.argv[3]) {
                    case 'shards':
                        if (typeof process.argv[4] == 'undefined') app.shard.list(false);
                        else if (process.argv[4] == 'usage') app.shard.list(true);
                        else {
                            console.log('Unknown parameter.');
                            process.exit(0);
                        }
                        break;

                    case 'users':
                        app.user.list();
                        break;

                    case 'apps':
                        app.application.list(process.argv[4]);
                        break;

                    default:
                        console.log('Unknown parameter.');
                        process.exit(0);
                        break;
                }
                break;

            default:
                // TODO: Help
                console.log("__     __              _   _           _       ");
                console.log("\\ \\   / /             | \\ | |         | |      ");
                console.log(" \\ \\_/ /__  _   _ _ __|  \\| | ___   __| | ___  ");
                console.log("  \\   / _ \\| | | | '__| . ` |/ _ \\ / _` |/ _ \\");
                console.log("   | | (_) | |_| | |  | |\\  | (_) | (_| |  __/ ");
                console.log("   |_|\\___/ \\__,_|_|  |_| \\_|\\___(_)__,_|\\___| ");
                console.log('');
                console.log('         YourNode - Master Automation');
                console.log('');
                console.log('   create user <first_name> <last_name> <auth0_token> <email> <username> - Creates an user');
                console.log('   create app <user_id> <app_name> <plan> - Creates an application');
                console.log('   create shard <name> <hostname> <ip> <limit> - Creates a shard');
                console.log('');
                console.log('   app <app_id> setDomain <custom_domain> - Configure a custom domain for an application');
                console.log('   app <app_id> enable - Enable an application');
                console.log('   app <app_id> update - Updates an application service settings and dependencies');
                console.log('');
                console.log('   list shards [usage] - Lists shards. Optional: usage');
                console.log('   list users - Lists users');
                console.log('   list apps [<user_id>] - Lists applications. Optional: <user_id>');
                console.log('');
                process.exit(0);
                break;
        }
    }
}

/**
 * Connecting to the database and starting the application.
 * */
mongoose.connect(_config.database.master, {
    user: _config.database.user,
    pass: _config.database.pass
});
var db = mongoose.connection;
db.on('error', app.dbError);
db.once('open', app.init);
var models;
var schemas;
