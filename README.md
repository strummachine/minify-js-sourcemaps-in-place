# strummachine:standard-minifier-js

Fast JavaScript minifier for Meteor apps, forked from [zodern](https://github.com/zodern/minify-js-sourcemaps)'s plugin to add [meteor-vite](https://github.com/JorgenVatle/meteor-vite) compatibility.

**Features from [zodern:standard-minifier-js](https://github.com/zodern/minify-js-sourcemaps):**

- Creates production source maps
- Creates source maps for Meteor packages that don't use a compiler
- Very fast by using the swc minifier, a faster js parser, and disk and memory caches
- Compatible with Meteor 1.9 and newer.
- Generates bundle stats for [bundle-visualizer](https://atmospherejs.com/meteor/bundle-visualizer)

**Changes in this fork:**

- Files are not combined/bundled into one file, but are kept separate, which is necessary for compatibility with meteor-vite.
  - This only applies to code built by Meteor, namely Meteor packages and anything in `entry-meteor.js` per meteor-vite's instructions. Most of your code will be compiled by meteor-vite.
  - It could be argued that keeping these packages unbundled is better for caching purposes anyway.
- The `compress` and `mangle` options of `swc` have been disabled, which was necessary to avoid errors with meteor-vite.
  - JS is still minified, just not as efficiently or with as much obfuscation. Again, this mostly applies to framework code, not code built by Vite.
- The target ECMAScript version has been bumped to ES2021 for the web.browser build, and ES6 for web.browser.legacy.
  - ES2021 covers the vast majority of modern browsers, down to Safari/iOS 14.5 or so, at least.
  - Vite [requires](https://vite.dev/guide/build.html#browser-compatibility) somewhat modern features like ES modules and nullish coalescing anyway, by default, although this can be configured in `vite.config.js`.
  - TODO: add code to set `modern-browsers` Meteor package to split the legacy package at a better point.
  - This should probably be implemented as a package setting configurable through Meteor.settings... feel free to submit a PR.

## Installation

First, you need to remove `standard-minifier-js` and/or `zodern:standard-minifier-js` from your app:

```shell
meteor remove standard-minifier-js zodern:standard-minifier-js
```

Then add this package with:

```shell
meteor add strummachine:standard-minifier-js
```

If you want to prevent access to the source maps, you can add the `zodern:hide-production-sourcemaps` package. Source maps include the original content from all of your client files, so you probably want to do this step.

```shell
meteor add zodern:hide-production-sourcemaps
```

## Error tracking

Source maps allow error tracking services to show you better stack traces. Zodern runs [Monti APM](https://montiapm.com) which provides an error tracking service and can use your app's source maps with no additional config.

To use with other error tracking services, you will need to upload the source maps when deploying. The source map is saved in the bundle from `meteor build` at `programs/<arch>/<filename>.js.map`. You will want to upload the source maps for each web arch, and for the dynamic imports for each arch.

For Sentry, the following CLI commands should do the trick:

```shell
sentry-cli sourcemaps inject {{build_dir}}/bundle/programs
sentry-cli releases new $RELEASE
sentry-cli sourcemaps upload --release=$RELEASE --dist=web {{build_dir}}/bundle/programs/web.browser
sentry-cli sourcemaps upload --release=$RELEASE --dist=legacy {{build_dir}}/bundle/programs/web.browser.legacy
sentry-cli sourcemaps upload --release=$RELEASE --dist=cordova {{build_dir}}/bundle/programs/web.cordova
sentry-cli sourcemaps upload --release=$RELEASE --dist=server {{build_dir}}/bundle/programs/server
```

## Caches

When deploying from CI, you will need to configure the CI to cache at least parts of the `.meteor/local` folder for the minify cache to work. Learn more at [this blog post](https://zodern.me/posts/meteor-local-folder/#caching-in-ci).

## Environment Variables

`DISABLE_CLIENT_STATS` Set to `true` to disable creating the `stats.json` file used by the bundle-visualizer. This can save a few seconds during production builds for large apps.

`METEOR_FASTMINIFIER_CACHE_DEBUG` Set to `true` to view the cache logs
