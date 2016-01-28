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
var spawn = require('child_process');

// Automation default values
var defaults = {
    baseApplicationPath: '/home/yournode/',
    serverIP: '127.0.0.1',
    proxyAvailable: '/etc/nginx/apps-available/',
    proxyEnabled: '/etc/nginx/apps-enabled/',
    servicePath: '/etc/systemd/system/yn_',
    nodeExec: '/usr/bin/env node'
}

// Helper functions
var helper = {
    checkIfExists: function (path) {
        if (typeof fs.accessSync !== 'undefined') check = fs.accessSync(path);
        else check = fs.existsSync(path);
        return check;
    },
    proxyReload: function () {
        var response = spawn.spawnSync('nginx', ['-s', 'reload']);
        if (response.status === 0) console.log('[OK] Proxy reloaded');
        else {
            console.log('[Error] A problem with the proxy ocurred: ' + response.stderr);
            process.error(1);
        }
    },
    systemdHelper: function (params, successMessage) {
        var response = spawn.spawnSync('systemctl', params);
        if (response.status === 0) console.log('[OK] ' + successMessage);
        else {
            console.log('[Error] A problem with the systemd ocurred: ' + response.stderr);
            process.error(1);
        }
    },
    npmInstall: function () {
        var response = spawn.spawnSync('npm', ['install']);
        if (response.status === 0) console.log('[OK] NPM Packages installed successfully.');
        else {
            console.log('[Error] A problem with the NPM ocurred: ' + response.stderr);
            process.error(1);
        }
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

        if (helper.checkIfExists(applicationPath)) {
            console.log('[Error] Directory already exists');
            process.exit(1);
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

        var packagePath = defaults.baseApplicationPath + appName + '/package.json';

        // Read package.json to see the main script to run
        if (helper.checkIfExists(packagePath)) {
            var applicationPort = 10000; // TODO: Retrieve from the app meta on db

            var contents = fs.readFileSync(packagePath);
            var jsonContent = JSON.parse(contents);
            var mainApplication = defaults.baseApplicationPath + appName + "/" + jsonContent.main;
            console.log('[OK] Read main script from package.json')

            // Configure the systemd service with the main script and port number
            var serviceConfiguration = "[Unit]\n" +
                                    "Description=" + appName + "\n" +
                                    "After=network.target\n\n" +
                                    "[Service]\n" +
                                    "ExecStart=" + defaults.nodeExec + " " + mainApplication + "\n" +
                                    "Restart=always\n" +
                                    "User=nobody\n" +
                                    "Group=nobody\n" +
                                    "Environment=PATH=/usr/bin:/usr/local/bin\n" +
                                    "Environment=NODE_ENV=production\n" +
                                    "Environment=YOURNODE_PORT=" + applicationPort + "\n" +
                                    "WorkingDirectory=/home/app1\n\n" +
                                    "[Install]\n" +
                                    "WantedBy=multi-user.target\n";

            fs.writeFileSync(defaults.servicePath + appName + '.service', hostConfiguration);
            console.log('[OK] Create service configuration');

            // Reload systemd
            helper.systemdHelper(['daemon-reload'], 'Reload systemd services list.');

            // Run npm install for dependencies
            if (typeof jsonContent.dependencies !== 'undefined') helper.npmInstall();
        }
        else {
            console.log('[Error] No package.json found. Nothing will be done.');
            process.exit(1);
        }
    },

    enable: function (appName, customDomain) {
        // Workflow:
        // 1. Create symlink on apps-enabled
        // 2. Reload nginx

        console.log('-- Enabling application --');
        console.log('Application name: ' + appName);

        // Create symlink on apps-enabled
        // TODO: Grab Application's Custom Domain in database and remove customDomain parameter
        var pathToAvailable = defaults.proxyAvailable + customDomain + '.conf';
        var pathToEnabled = defaults.proxyEnabled + customDomain + '.conf';
        if (helper.checkIfExists(pathToEnabled)) {
            console.log('[Warning] Symlink already exists, creating a new one to be sure.');
            fs.unlinkSync(pathToEnabled);
        }
        fs.symlinkSync(pathToAvailable, pathToEnabled);
        console.log('[OK] Enable application on proxy');

        // Reload nginx
        helper.proxyReload();
    },

    disable: function (appName, customDomain) {
        // Workflow:
        // 1. Stop application if its running
        // 2. Remove symlink on apps-enabled
        // 3. Reload nginx

        console.log('-- Disabling application --');
        console.log('Application name: ' + appName);

        // Stop application if its running
        app.stop(appName);

        // Remove symlink on apps-enabled
        // TODO: Grab Application's Custom Domain in database and remove customDomain parameter
        var pathToEnabled = defaults.proxyEnabled + customDomain + '.conf';
        if (helper.checkIfExists(pathToEnabled)) {
            fs.unlinkSync(pathToEnabled);
            console.log('[OK] Disable application on proxy');

            // Reload nginx
            helper.proxyReload();
        }
        else console.log("[Warning] Symlink doesn't exists. Doing nothing.");
    },

    remove: function (appName, customDomain) {
        // Workflow:
        // 1. Call app.disable(appName)
        // 2. Remove entry from apps-available
        // 3. Remove systemd service
        // 4. Reload systemd
        // 5. Free reserved port for this app
        // 6. Remove files on /home/yournode/

        console.log('-- Remove application --');
        console.log('Application name: ' + appName);

        app.disable(appName, customDomain);

        fs.unlinkSync(defaults.proxyAvailable + customDomain + '.conf');
        console.log('[OK] Remove entry from proxy completely');

        fs.unlinkSync(defaults.servicePath + appName + '.service');
        console.log('[OK] Remove systemd service');

        helper.systemdHelper(['daemon-reload'], 'Reload systemd services list.');
        console.log('[OK] Reload systemd');

        // TODO: Free reserved port for this app
        console.log('[OK] Free reserved port');

        helper.deleteFolderRecursive(defaults.baseApplicationPath + appName);
        console.log('[OK] Remove app files. App no longer exists.');
    },

    start: function (appName) {
        // Workflow:
        // 1. Run systemctl enable appName
        // 2. Run systemctl start appName

        console.log('-- Starting application --');
        console.log('Application name: ' + appName);

        helper.systemdHelper(['enable',appName], 'Enable app init on restart.');
        helper.systemdHelper(['start',appName], 'Starting application.');
    },

    stop: function (appName) {
        // Workflow
        // 1. Run systemctl stop appName
        // 2. Run systemctl disable appName

        console.log('-- Stopping application --');
        console.log('Application name: ' + appName);

        helper.systemdHelper(['stop',appName], 'Stopping application.');
        helper.systemdHelper(['disable',appName], 'Disabled app init on restart.');
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
        // TODO: Help
        console.log('Unknown parameter.');
        break;
}
