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

// Automation default values
var defaults = {
    baseApplicationPath: '/home/yournode/',
    serverIP: '127.0.0.1',
    proxyAvailable: '/etc/nginx/apps-available/',
    proxyEnabled: '/etc/nginx/apps-enabled/'
}

// Helper functions
var helper = {
    proxyReload: function () {
        var spawn = require('child_process').spawn;
        var response = spawnSync('nginx', ['-s', 'reload']);
        if (response.status === 0) console.log('[OK] Proxy reloaded');
        else console.log('[Error] A problem with the proxy ocurred: ' + response.stderr);
    }
}

// Automation application
var app = {
    configure: function (appName, customDomain) {
        // Workflow:
        // 1. Create folder on /home/yournode/
        // 2. Reserve a port number for this app
        // 3. Create entry on apps-available
        // 4. Call app.enable(appName) to:
        //    - Create symlink on apps-enabled
        //    - Reload nginx

        console.log('-- Configuring new application --');
        console.log('Application name: ' + appName);
        console.log('Custom domain: ' + customDomain);

        // Create app folder and reserve it's port.
        // TODO: Sync Application's Path, Ports and Custom Domain in database
        var applicationPath = defaults.baseApplicationPath + appName;
        var applicationPort = 10000; // TODO: Retrieve from the port pool
        if (fs.accessSync(applicationPath)) {
            console.log('[Error] Directory already exists');
        }
        fs.mkdirSync(applicationPath,0755);
        console.log('[OK] Create application directory');

        // Create entry on apps-available
        var hostConfiguration = "server {\n" +
                                "    listen 80;\n\n" +
                                "    server_name " + customDomain + ";\n\n" +
                                "    location / {\n" +
                                "        proxy_pass http://"+ defaults.serverIP + ":" + applicationPort + ";\n" +
                                "        proxy_http_version 1.1;\n" +
                                "        proxy_set_header Upgrade $http_upgrade;\n" +
                                "        proxy_set_header Connection 'upgrade';\n" +
                                "        proxy_set_header Host $host;\n" +
                                "        proxy_cache_bypass $http_upgrade;\n" +
                                "    }\n" +
                                "}";
        fs.writeFileSync(defaults.proxyAvailable + customDomain + '.conf', hostConfiguration);
        console.log('[OK] Create proxy configuration');

        // Create symlink on apps-enabled and reload nginx
        app.enable(appName, customDomain);

        // App created successfully
        console.log('[OK] Application creation successful! Ready to deploy and start running.');
    },

    update: function (appName) {
        // Workflow:
        // 1. Read package.json to see the main script to run
        // 2. Configure the systemd service with the main script and port number
        // 3. Reload systemd
        // 4. Run npm install for dependencies

        console.log('-- Updating application --');
        console.log('Application name: ' + appName);
    },

    enable: function (appName, customDomain) {
        // Workflow:
        // 1. Create symlink on apps-enabled
        // 2. Reload nginx

        // TODO: Grab Application's Custom Domain in database and remove customDomain parameter
        fs.symlinkSync(defaults.proxyAvailable + customDomain + '.conf', defaults.proxyEnabled + customDomain + '.conf');
        console.log('[OK] Enable application on proxy');

        helper.proxyReload();
    },

    disable: function (appName, customDomain) {
        // Workflow:
        // 1. Remove symlink on apps-enabled
        // 2. Reload nginx
    },

    remove: function (appName) {
        // Workflow:
        // 1. Call app.disable(appName)
        // 2. Remove systemd service
        // 3. Reload systemd
        // 4. Free reserved port for this app
        // 5. Remove files on /home/yournode/
    },

    start: function (appName) {
        // Workflow:
        // 1. Run systemctl start appName
        // 2. Run systemctl enable appName
    },

    stop: function (appName) {
        // Workflow
        // 1. Run systemctl stop appName
        // 2. Run systemctl disable appName
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
