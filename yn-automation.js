#!/usr/bin/env node

/*

configure <appName> <customDomain>
update <appName>
enable <appName>
disable <appName>
remove <appName>
start <appName>
stop <appName>

*/

var fs = require("fs");

var app = {
    configure: function (appName, customDomain) {
        console.log('-- Configuring new application --');
        console.log('Application name: ' + appName);
        console.log('Custom domain: ' + customDomain);
        // create folder on /home/yournode/
        // create entry on apps-available
        // reserve a port number for this app
        // call app.enable(appName) to:
        // - create symlink on apps-enabled
        // - reload nginx
    },

    update: function (appName) {
        console.log('-- Updating application --');
        console.log('Application name: ' + appName);
        // read package.json to see the main script to run
        // configure the systemd service with the main script and port number
        // reload systemd
        // run npm install for dependencies
    },

    enable: function (appName) {
        // create symlink on apps-enabled
        // reload nginx
    },

    disable: function (appName) {
        // remove symlink on apps-enabled
        // reload nginx
    },

    remove: function (appName) {
        // call app.disable(appName)
        // remove systemd service
        // reload systemd
        // free reserved port for this app
        // remove files on /home/yournode/
    },

    start: function (appName) {
        // run systemctl start appName
        // run systemctl enable appName
    },

    stop: function (appName) {
        // run systemctl stop appName
        // run systemctl enable appName
    }

}

switch (process.argv[2]) {
    case 'configure':
        app.configure(process.argv[3], process.argv[4]);
        break;

    case 'update':
    case 'enable':
    case 'disable':
    case 'remove':
    case 'start':
    case 'stop':
        app[process.argv[2]](process.argv[3]);
        break;

    default:
        console.log('Unknown parameter.');
        break;
}
