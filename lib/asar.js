(function() {
  var Filesystem, crawlFilesystem, createSnapshot, disk, fs, isUnpackDir, minimatch, mkdirp, os, path;

  fs = require('fs');

  path = require('path');

  os = require('os');

  minimatch = require('minimatch');

  mkdirp = require('mkdirp');

  Filesystem = require('./filesystem');

  disk = require('./disk');

  crawlFilesystem = require('./crawlfs');

  createSnapshot = require('./snapshot');

  isUnpackDir = function(path, pattern) {
    return path.indexOf(pattern) === 0 || minimatch(path, pattern);
  };

  module.exports.createPackage = function(src, dest, callback) {
    return module.exports.createPackageWithOptions(src, dest, {}, callback);
  };

  module.exports.createPackageWithOptions = function(src, dest, options, callback) {
    var dot;
    dot = options.dot;
    if (dot === void 0) {
      dot = true;
    }
    return crawlFilesystem(src, {
      dot: dot
    }, function(error, filenames, metadata) {
      if (error) {
        return callback(error);
      }
      module.exports.createPackageFromFiles(src, dest, filenames, metadata, options, callback);
    });
  };


  /*
  createPackageFromFiles - Create an asar-archive from a list of filenames
  src: Base path. All files are relative to this.
  dest: Archive filename (& path).
  filenames: Array of filenames relative to src.
  metadata: Object with filenames as keys and {type='directory|file|link', stat: fs.stat} as values. (Optional)
  options: The options.
  callback: The callback function. Accepts (err).
   */

  module.exports.createPackageFromFiles = function(src, dest, filenames, metadata, options, callback) {
    var dirName, file, filename, filenamesSorted, files, filesystem, i, j, k, l, len, len1, len2, len3, len4, m, missing, ordering, orderingFiles, pathComponent, pathComponents, shouldUnpack, stat, str, total, type;
    if (metadata == null) {
      metadata = {};
    }
    filesystem = new Filesystem(src);
    files = [];
    if (options.ordering) {
      orderingFiles = fs.readFileSync(options.ordering).toString().split('\n').map(function(line) {
        if (line.indexOf(':') !== -1) {
          line = line.split(':').pop();
        }
        line = line.trim();
        if (line[0] === '/') {
          line = line.slice(1);
        }
        return line;
      });
      ordering = [];
      for (i = 0, len = orderingFiles.length; i < len; i++) {
        file = orderingFiles[i];
        pathComponents = file.split(path.sep);
        str = src;
        for (j = 0, len1 = pathComponents.length; j < len1; j++) {
          pathComponent = pathComponents[j];
          str = path.join(str, pathComponent);
          ordering.push(str);
        }
      }
      filenamesSorted = [];
      missing = 0;
      total = filenames.length;
      for (k = 0, len2 = ordering.length; k < len2; k++) {
        file = ordering[k];
        if (filenamesSorted.indexOf(file) === -1 && filenames.indexOf(file) !== -1) {
          filenamesSorted.push(file);
        }
      }
      for (l = 0, len3 = filenames.length; l < len3; l++) {
        file = filenames[l];
        if (filenamesSorted.indexOf(file) === -1) {
          filenamesSorted.push(file);
          missing += 1;
        }
      }
      console.log("Ordering file has " + ((total - missing) / total * 100) + "% coverage.");
    } else {
      filenamesSorted = filenames;
    }
    for (m = 0, len4 = filenamesSorted.length; m < len4; m++) {
      filename = filenamesSorted[m];
      file = metadata[filename];
      if (!file) {
        stat = fs.lstatSync(filename);
        if (stat.isDirectory()) {
          type = 'directory';
        }
        if (stat.isFile()) {
          type = 'file';
        }
        if (stat.isSymbolicLink()) {
          type = 'link';
        }
        file = {
          stat: stat,
          type: type
        };
      }
      switch (file.type) {
        case 'directory':
          shouldUnpack = options.unpackDir ? isUnpackDir(path.relative(src, filename), options.unpackDir) : false;
          filesystem.insertDirectory(filename, shouldUnpack);
          break;
        case 'file':
          shouldUnpack = false;
          if (options.unpack) {
            shouldUnpack = minimatch(filename, options.unpack, {
              matchBase: true
            });
          }
          if (!shouldUnpack && options.unpackDir) {
            dirName = path.relative(src, path.dirname(filename));
            shouldUnpack = isUnpackDir(dirName, options.unpackDir);
          }
          files.push({
            filename: filename,
            unpack: shouldUnpack
          });
          filesystem.insertFile(filename, shouldUnpack, file.stat);
          break;
        case 'link':
          filesystem.insertLink(filename, file.stat);
      }
    }
    return mkdirp(path.dirname(dest), function(error) {
      if (error) {
        return callback(error);
      }
      return disk.writeFilesystem(dest, filesystem, files, function(error) {
        if (error) {
          return callback(error);
        }
        if (options.snapshot) {
          return createSnapshot(src, dest, filenames, metadata, options, callback);
        } else {
          return callback(null);
        }
      });
    });
  };

  module.exports.statFile = function(archive, filename, followLinks) {
    var filesystem;
    filesystem = disk.readFilesystemSync(archive);
    return filesystem.getFile(filename, followLinks);
  };

  module.exports.listPackage = function(archive) {
    return disk.readFilesystemSync(archive).listFiles();
  };

  module.exports.extractFile = function(archive, filename) {
    var filesystem;
    filesystem = disk.readFilesystemSync(archive);
    return disk.readFileSync(filesystem, filename, filesystem.getFile(filename));
  };

  module.exports.extractAll = function(archive, dest) {
    var content, destFilename, error, file, filename, filenames, filesystem, followLinks, i, len, linkDestPath, linkSrcPath, linkTo, relativePath, results;
    filesystem = disk.readFilesystemSync(archive);
    filenames = filesystem.listFiles();
    followLinks = process.platform === 'win32';
    mkdirp.sync(dest);
    results = [];
    for (i = 0, len = filenames.length; i < len; i++) {
      filename = filenames[i];
      filename = filename.substr(1);
      destFilename = path.join(dest, filename);
      file = filesystem.getFile(filename, followLinks);
      if (file.files) {
        results.push(mkdirp.sync(destFilename));
      } else if (file.link) {
        linkSrcPath = path.dirname(path.join(dest, file.link));
        linkDestPath = path.dirname(destFilename);
        relativePath = path.relative(linkDestPath, linkSrcPath);
        try {
          fs.unlinkSync(destFilename);
        } catch (_error) {
          error = _error;
        }
        linkTo = path.join(relativePath, path.basename(file.link));
        results.push(fs.symlinkSync(linkTo, destFilename));
      } else {
        content = disk.readFileSync(filesystem, filename, file);
        results.push(fs.writeFileSync(destFilename, content));
      }
    }
    return results;
  };

}).call(this);
