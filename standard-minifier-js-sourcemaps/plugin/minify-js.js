const { extractModuleSizesTree } = require("./stats.js");
const { CachingMinifier } = require("meteor/zodern:caching-minifier");
const generatePackageMap = require('./generate-package-map.js');

const statsEnabled = process.env.DISABLE_CLIENT_STATS !== 'true'

if (typeof Profile === 'undefined') {
  if (Plugin.Profile) {
    Profile = Plugin.Profile;
  } else {
    Profile = function (label, func) {
      return function () {
        return func.apply(this, arguments);
      }
    }
    Profile.time = function (label, func) {
      func();
    }
  }
}

let swc;

Plugin.registerMinifier({
  extensions: ['js'],
  archMatching: 'web'
}, function () {
  var minifier = new MeteorBabelMinifier();
  return minifier;
});

class MeteorBabelMinifier extends CachingMinifier {
  constructor() {
    super({
      minifierName: 'fast-minifier'
    })
  }

  _minifyWithSwc(file) {
    swc = swc || require('meteor-package-install-swc');
    const NODE_ENV = process.env.NODE_ENV || 'development';

    let map = file.getSourceMap();
    let content = file.getContentsAsString();

    if (!map) {
      map = generatePackageMap(content, file.getPathInBundle());
    }

    if (map) {
      map = JSON.stringify(map);
    }

    return swc.minifySync(
      content,
      {
        ecma: 5,
        compress: {
          drop_debugger: false,

          unused: true,
          dead_code: true,
          typeofs: false,

          global_defs: {
            'process.env.NODE_ENV': NODE_ENV,
          },
        },
        sourceMap: map ? {
          content: map,
        } : undefined,
        safari10: true,
        inlineSourcesContent: true
      }
    );
  }

  _minifyWithTerser(file) {
    let terser = require('terser');
    const NODE_ENV = process.env.NODE_ENV || 'development';

    return terser.minify(file.getContentsAsString(), {
      compress: {
        drop_debugger: false,
        unused: false,
        dead_code: true,
        global_defs: {
          "process.env.NODE_ENV": NODE_ENV
        }
      },
      // Fix issue meteor/meteor#9866, as explained in this comment:
      // https://github.com/mishoo/UglifyJS2/issues/1753#issuecomment-324814782
      // And fix terser issue #117: https://github.com/terser-js/terser/issues/117
      safari10: true,
      sourceMap: {
        content: file.getSourceMap()
      }
    });
  }

  minifyOneFile(file) {
    try {
      return this._minifyWithSwc(file);
    } catch (swcError) {
      try {
        // swc always parses as if the file is a module, which is
        // too strict for some Meteor packages. Try again with terser
        return this._minifyWithTerser(file).await();
      } catch (_) {
        // swc has a much better error message, so we use it
        throw swcError;
      }
    }
  }
}

MeteorBabelMinifier.prototype.processFilesForBundle = Profile('processFilesForBundle', function (files, options) {
  var mode = options.minifyMode;

  // don't minify anything for development
  if (mode === 'development') {
    files.forEach(function (file) {
      let map = file.getSourceMap();
      if (!map) {
        map = generatePackageMap(file.getContentsAsString(), file.getPathInBundle());
      }

      file.addJavaScript({
        data: file.getContentsAsBuffer(),
        sourceMap: map,
        path: file.getPathInBundle(),
      });
    });
    return;
  }

  // Process each file individually without bundling
  files.forEach(file => {
    const path = file.getPathInBundle();
    if (/\.min\.js$/.test(path)) {
      // Don't reminify *.min.js, just add it back with its original content
      file.addJavaScript({
        data: file.getContentsAsBuffer(),
        sourceMap: file.getSourceMap(),
        path
      });
    } else {
      let minified;
      let label = 'minify file';
      if (path === 'app/app.js') {
        label = 'minify app/app.js'
      }
      if (path === 'packages/modules.js') {
        label = 'minify packages/modules.js'
      }

      try {
        Profile.time(label, () => {
          minified = this.minifyFile(file);
        });

        if (!(minified && typeof minified.code === "string")) {
          throw new Error();
        }

      } catch (err) {
        err.message += " while minifying " + path;
        throw err;
      }

      if (statsEnabled) {
        let tree;
        Profile.time('extractModuleSizesTree', () => {
          tree = extractModuleSizesTree(minified.code);
        });

        // Create stats for this individual file
        let stats = Object.create(null);
        if (tree) {
          stats[path] = [Buffer.byteLength(minified.code), tree];
        } else {
          stats[path] = Buffer.byteLength(minified.code);
        }

        // Add the minified file back to its original location with its own sourcemap
        Profile.time('addJavaScript', () => {
          file.addJavaScript({
            data: minified.code,
            sourceMap: minified.map,
            path,
            stats
          });
        });
      } else {
        // Add the minified file back to its original location with its own sourcemap
        Profile.time('addJavaScript', () => {
          file.addJavaScript({
            data: minified.code,
            sourceMap: minified.map,
            path
          });
        });
      }
    }

    Plugin.nudge();
  });
});
