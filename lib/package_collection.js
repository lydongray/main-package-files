var path = require('path'),
    readFile = require('fs').readFileSync,
    exists = require('path-exists').sync,
    stripJsonComments = require('strip-json-comments'),
    extend = require('extend'),
    Package = require('./package'),
    logger = require('./logger');

/**
 * Collection for node packages
 *
 * @class PackageCollection
 */

/**
 * @constructor
 * @param {Object} opts
 */
function PackageCollection(opts) {
    this.opts = opts;
    this.opts.main = opts.main || null;
    this.opts.env = opts.env || process.env.NODE_ENV;
    this.debugging = opts.debugging || false;
    this.overrides = opts.overrides || {};
    this._queue = [];
    this._lastQueueLength = 0;
    this._packages = {};
    this._processed = {};

    this.collectPackages();
};

PackageCollection.prototype = {
    /**
     * Adds a package to the collection
     *
     * @param {String} name Name of the package
     * @param {String} path Path to the package files
     */
    add: function (name, path, main) {
        if (this._packages[name]) {
            return;
        }

        if (this.debugging) {
            logger('PackageCollection', 'add', name, path);
        }

        this._packages[name] = true;

        var opts = this.overrides[name] || {};
        opts.name = name;
        opts.path = path;
        if (path.indexOf(this.opts.paths.packageDirectory) === -1) {
            opts.main = main || name;
        }
        opts.path = path;

        this._packages[name] = new Package(opts, this, this.opts.paths.packageDirectory);
    },

    /**
     * Collects all packages
     */
    collectPackages: function () {
        if (!exists(this.opts.paths.packageJson)) {
            throw new Error('package.json does not exist at: ' + this.opts.paths.packageJson);
        }

        var name,
            group = this.opts.group || null,
            includeDev = this.opts.includeDev || false,
            includeSelf = this.opts.includeSelf || false;

        try {
            var packageJson = JSON.parse(stripJsonComments(readFile(this.opts.paths.packageJson, 'utf8'))),
                devDependencies = packageJson.devDependencies || {},
                dependencies = packageJson.dependencies || {},
                main = packageJson.main || {};
        } catch (err) {
            console.error(err + ' in file ' + this.opts.paths.packageJson);
            return
        };

        includeDev = includeDev === true ? 'inclusive' : includeDev;

        this.overrides = extend(packageJson.overrides || {}, this.overrides);

        this.checkGroupExists(group, packageJson, function (missingGroup) {
            throw new Error('group "' + missingGroup + '" does not exists in package.json');
        });

        if (includeDev !== 'exclusive') {
            this.addDependencies(dependencies, group, packageJson);
        }

        if (includeDev !== false) {
            this.addDependencies(devDependencies, group, packageJson);
        }

        if (includeSelf !== false) {
            this.add(packageJson.name || 'self', path.dirname(this.opts.paths.packageJson), main);
        }
    },

    /**
     * Adds all dependencies from list filtered by group
     *
     */
    addDependencies: function (dependencies, group, packageJson) {
        if (typeof dependencies !== "string") {
            var deps = (!!group) ? this.filterByGroup(dependencies, group, packageJson) : dependencies;

            for (var name in deps) {
                this.add(name, path.join(this.opts.paths.packageDirectory, path.sep, name));
            }
        } else {
            this.add(dependencies, path.join(path.dirname(this.opts.paths.packageJson)));
        }
    },

    /**
     * Filters dependencies by group
     *
     * @return {Object}
     */
    filterByGroup: function (deps, group, packageJson) {
        var filtered = {};

        if (typeof group === "string") {
            var isExludingGroup = (group && packageJson.group && group.charAt(0) === "!" && packageJson.group[group.slice(1)].length > 0);

            for (var dep in deps) {
                if (isExludingGroup && packageJson.group[group.slice(1)].indexOf(dep) === -1) {
                    filtered[dep] = deps[dep];
                }
                if (!isExludingGroup && packageJson.group[group].indexOf(dep) >= 0) {
                    filtered[dep] = deps[dep];
                }
            }

            return filtered;
        }

        if (typeof group === "object") {
            for (var i = 0; i < group.length; i++) {
                filtered = extend(filtered, this.filterByGroup(deps, group[i], packageJson));
            }
        }

        return filtered;
    },

    /**
     * Calls error method if group doesn't exist
     */
    checkGroupExists: function (group, packageJson, error) {
        if (!group || !packageJson.group) {
            return;
        }

        if (typeof group === "string") {
            var isExludingGroup = (group && packageJson.group && group.charAt(0) === "!" && packageJson.group[group.slice(1)].length > 0);

            if (!packageJson.group[group] && !isExludingGroup) {
                error(group);

                return;
            }

            return packageJson.group[group];
        }

        if (typeof group === "object") {
            for (var i = 0; i < group.length; i++) {
                this.checkGroupExists(group[i], packageJson, error);
            }
        }
    },

    /**
     * Get srcs of all packages
     *
     * @return {Array}
     */
    getFiles: function () {
        for (var name in this._packages) {
            this._queue.push(this._packages[name]);
        }

        return this.process();
    },

    /**
     * processes the queue and returns the srcs of all packages
     *
     * @private
     * @return {Array}
     */
    process: function () {
        var queue = this._queue,
            srcs = [],
            force = false;

        if (this._lastQueueLength === queue.length) {
            force = true;
        }

        this._lastQueueLength = queue.length;

        this._queue = [];

        queue.forEach(function (package) {
            var packageSrcs = package.getFiles(force);

            if (packageSrcs === false) {
                return this._queue.push(package);
            }

            srcs.push.apply(srcs, packageSrcs);
            this._processed[package.name] = true;
        }, this);

        if (this._queue.length) {
            srcs.push.apply(srcs, this.process());
        }

        return srcs;
    }
};

module.exports = PackageCollection;
