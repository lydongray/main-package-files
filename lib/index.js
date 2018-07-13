var readFile = require('fs').readFileSync,
    exists = require('path-exists').sync,
    path = require('path'),
    multimatch = require('multimatch'),
    PackageCollection = require('./package_collection');

module.exports = function (filter, opts, cb) {
    var collection,
        files,
        config,
        package,
        packageJson,
        packageDirectory,
        cwd = process.cwd(),
        error;

    if (typeof filter === 'function') {
        cb = filter
        opts = null;
        filter = null;
    } else if (typeof filter !== 'string' && Array.isArray(filter) === false && !(filter instanceof RegExp)) {
        if (typeof opts === 'function') {
            cb = opts;
        }
        opts = filter;
        filter = null;
    } else if (typeof opts === 'function') {
        cb = opts;
        opts = null;
    }

    if (typeof cb !== 'function') {
        cb = null;
    }

    opts = opts || {};
    opts.paths = opts.paths || {};
    opts.filter = opts.filter || filter;

    if (typeof opts.paths === 'string') {
        cwd = path.resolve(cwd, opts.paths);
    } else {
        package = opts.paths.package;
    }

    package = path.resolve(cwd, package || 'package.json');

    if (exists(package)) {
        cwd = path.dirname(package);
    }

    packageJson = opts.paths.packageJson ? path.resolve(process.cwd(), opts.paths.packageJson)
        : path.resolve(cwd, packageJson || 'package.json');

    packageDirectory = opts.paths.packageDirectory ?
        path.resolve(process.cwd(), opts.paths.packageDirectory) :
        path.resolve(cwd, packageDirectory || 'node_modules');

    if (!packageJson || !exists(packageJson)) {
        error = Error('package.json file does not exist at ' + packageJson);
        if (cb) {
            cb(error, []);
            return [];
        } else {
            throw error;
        }
    }

    if (!packageDirectory || !exists(packageDirectory)) {
        error = Error('Node modules directory does not exist at ' + packageDirectory);
        if (cb) {
            cb(error, []);
            return [];
        } else {
            throw error;
        }
    }

    opts.base = opts.base || packageDirectory;
    opts.includeDev = opts.includeDev || false;
    opts.includeSelf = opts.includeSelf || false;
    opts.paths = {
        packageJson: packageJson,
        packageDirectory: packageDirectory
    };

    try {
        collection = new PackageCollection(opts);
        files = collection.getFiles();

        if (typeof opts.filter === 'string' || Array.isArray(opts.filter)) {
            files = multimatch(files, opts.filter, { dot: true });
        } else if (opts.filter instanceof RegExp) {
            files = files.filter(function (file) {
                return opts.filter.test(file);
            });
        } else if (typeof opts.filter === 'function') {
            files = files.filter(opts.filter);
        }
    } catch (e) {
        if (cb) {
            cb(e, []);
            return [];
        } else {
            throw e;
        }
    }

    if (cb) {
        cb(null, files || [])
    }

    return files || [];
};
