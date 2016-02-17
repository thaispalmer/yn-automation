#!/usr/bin/env node

/**
 * Initial Setup
 * */
// Loading modules
var fs = require('fs');
var spawn = require('child_process');

// Loading configuration
var _config = JSON.parse(fs.readFileSync('yournode-shard.conf', 'utf8'));

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
    createFolderRecursive: function(dirPath, mode, callback) {
        fs.mkdir(dirPath, mode, function(error) {
            if (error && error.errno === 34) {
                helpers.createFolderRecursive(path.dirname(dirPath), mode, callback);
                helpers.createFolderRecursive(dirPath, mode, callback);
            }
            callback && callback(error);
        });
    },
    deleteFolderRecursive: function (path) {
        if (helper.checkIfExists(path)) {
            fs.readdirSync(path).forEach(function(file,index) {
                var curPath = path + "/" + file;
                if (fs.lstatSync(curPath).isDirectory()) {
                    helper.deleteFolderRecursive(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    },
    systemdHelper: function (params, successMessage) {
        var response = spawn.spawnSync('systemctl', params);
        if (response.status === 0) app.log('[OK] ' + successMessage);
        else {
            app.log('[Error] A problem with the systemd ocurred: ' + response.stderr);
            process.error(1);
        }
    },
    npmInstall: function () {
        var response = spawn.spawnSync('npm', ['install']);
        if (response.status === 0) app.log('[OK] NPM Packages installed successfully.');
        else {
            app.log('[Error] A problem with the NPM ocurred: ' + response.stderr);
            process.error(1);
        }
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
    application: {
        init: function (username, app_name) {
            var applicationPath = _config.applicationPath + username + '/' + app_name;
            if (helpers.checkIfExists(applicationPath)) {
                app.log('[Error] Directory already exists');
                process.exit(1);
            }
            helpers.createFolderRecursive(applicationPath, 0755, function () {
                app.log('[OK] Application directory initialized');
                process.exit(0);
            });
        },
        update: function (username, app_name, port) {
            var applicationPath = _config.applicationPath + username + '/' + app_name + '/';
            var packagePath = applicationPath + 'package.json';

            // Read package.json to see the main script to run
            if (helper.checkIfExists(packagePath)) {
                var contents = fs.readFileSync(packagePath);
                var jsonContent = JSON.parse(contents);
                var mainApplication = applicationPath + jsonContent.main;
                app.log('[OK] Read main script from package.json')

                // Configure the systemd service with the main script and port number
                var serviceConfiguration = "[Unit]\n" +
                                           "Description=" + app_name + "\n" +
                                           "After=network.target\n\n" +
                                           "[Service]\n" +
                                           "ExecStart=" + _config.nodeExec + " " + mainApplication + "\n" +
                                           "Restart=always\n" +
                                           "User=nobody\n" +
                                           "Group=nobody\n" +
                                           "Environment=PATH=/usr/bin:/usr/local/bin\n" +
                                           "Environment=NODE_ENV=production\n" +
                                           "Environment=YOURNODE_PORT=" + port + "\n" +
                                           "WorkingDirectory=" + applicationPath + "\n\n" +
                                           "[Install]\n" +
                                           "WantedBy=multi-user.target\n";

                fs.writeFileSync(_config.servicePath + 'yn_' + username + '-' + app_name + '.service', serviceConfiguration);
                app.log('[OK] Created service configuration');

                // Reload systemd
                helper.systemdHelper(['daemon-reload'], 'Reload systemd services list.');

                // Run npm install for dependencies
                if (typeof jsonContent.dependencies !== 'undefined') helper.npmInstall();

                process.exit(0);
            }
            else {
                app.log('[Error] No package.json found. Nothing will be done.');
                process.exit(1);
            }
        }
    },

    init: function() {
        /**
         * Routing parameters
         * */
        switch (process.argv[2]) {
            case 'init':
                app.application.init(process.argv[3], process.argv[4]);
                break;

            case 'update':
                app.application.update(process.argv[3], process.argv[4], process.argv[5]);
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
                console.log('         YourNode - Shard Automation');
                console.log('');
                console.log('   init <username> <app_name> - Initialize application folder');
                console.log('   update <username> <app_name> <port> - Update application entry on system');
                console.log('');
                process.exit(0);
                break;
        }
    }
}

/**
 * Starting the application.
 * */
app.init();
