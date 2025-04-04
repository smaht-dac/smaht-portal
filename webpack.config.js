const path = require('path');
const webpack = require('webpack');
const env = process.env.NODE_ENV;
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const PATHS = {
    static: path.resolve(__dirname, 'src/encoded/static'),
    build: path.resolve(__dirname, 'src/encoded/static/build'),
};

const mode = env === 'production' ? 'production' : 'development';

const plugins = [];

console.log('Opened webpack.config.js with env: ' + env + ' & mode: ' + mode);

// don't include momentjs locales (large)
plugins.push(
    new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
    })
);

let chunkFilename = '[name].js';
let devTool = 'source-map'; // Default, slowest.

if (mode === 'production') {
    // add chunkhash to chunk names for production only (it's slower)
    chunkFilename = '[name].[chunkhash].js';
    devTool = 'source-map';
} else if (env === 'quick') {
    // `eval` is fastest but doesn't abide by production Content-Security-Policy, so we check for env=="quick" in app.js to adjust the CSP accordingly.
    devTool = 'eval';
} else if (env === 'development') {
    devTool = 'inline-source-map';
}

const rules = [
    { test: /\.m?js/, resolve: { fullySpecified: false } },
    // Strip @jsx pragma in react-forms, which makes babel abort
    {
        test: /\.js$/,
        loader: 'string-replace-loader',
        enforce: 'pre',
        options: {
            search: '@jsx',
            replace: 'jsx',
        },
    },
    // add babel to load .js files as ES6 and transpile JSX
    {
        test: /\.(js|jsx)$/,
        include: [path.resolve(__dirname, 'src/encoded/static')],
        use: [
            {
                loader: 'babel-loader',
            },
        ],
    },
];

const resolve = {
    extensions: ['.webpack.js', '.web.js', '.js', '.json', '.jsx'],
    //symlinks: false,
    //modules: [
    //    path.resolve(__dirname, '..', 'node_modules'),
    //    'node_modules'
    //]
    alias: {},
};

// Common alias, hopefully is fix for duplicate versions of React
// on npm version 7+ and can supersede `./setup-npm-links-for-local-development.js`.
// @see https://blog.maximeheckel.com/posts/duplicate-dependencies-npm-link/
spcPackageJson = require('@hms-dbmi-bgm/shared-portal-components/package.json');
spcPeerDependencies = spcPackageJson.peerDependencies || {};
Object.keys(spcPeerDependencies).forEach(function (packageName) {
    // Make exception for auth0-lock, which seems to break in Webpack 5 if loaded from SPC peer deps
    if (packageName !== 'auth0-lock') {
        resolve.alias[packageName] = path.resolve(
            './node_modules/' + packageName
        );
    }
});

// Exclusion -- higlass needs react-bootstrap 0.x but we want 1.x; can remove this line below
// once update to higlass version w.o. react-bootstrap dependency.
delete resolve.alias['react-bootstrap'];

const optimization = {
    minimize: mode === 'production',
    minimizer: [
        // Syntax for pulling module from webpack 5: https://stackoverflow.com/questions/66343602/use-latest-terser-webpack-plugin-with-webpack5
        (compiler) => {
            const TerserPlugin = require('terser-webpack-plugin');
            new TerserPlugin({
                parallel: false, // XXX: this option causes docker build to fail - Will 2/25/2021
                terserOptions: {
                    compress: true,
                    mangle: true,
                    output: {
                        comments: false,
                    },
                },
            }).apply(compiler);
        },
    ],
};

const webPlugins = plugins.slice(0);
const serverPlugins = plugins.slice(0);

webPlugins.push(
    new webpack.ProvidePlugin({
        process: 'process/browser',
    })
);

// Inform our React code of what build we're on.
// This works via a find-replace.
webPlugins.push(
    new webpack.DefinePlugin({
        'process.version': JSON.stringify(process.version),
        'process.platform': JSON.stringify(process.platform),
        SERVERSIDE: JSON.stringify(false),
        BUILDTYPE: JSON.stringify(env),
    })
);

serverPlugins.push(
    new webpack.DefinePlugin({
        SERVERSIDE: JSON.stringify(true),
        BUILDTYPE: JSON.stringify(env),
    })
);

// From https://github.com/jsdom/jsdom/issues/3042 (+ updated for Webpack5)
serverPlugins.push(
    new webpack.IgnorePlugin({
        resourceRegExp: /canvas/,
        contextRegExp: /jsdom$/,
    })
);

if (env === 'development') {
    // Skip for `npm run dev-quick` (`env === "quick"`) since takes a while
    webPlugins.push(
        new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false,
            logLevel: 'warn',
            reportFilename: 'report-web-bundle.html',
        })
    );
    serverPlugins.push(
        new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false,
            logLevel: 'warn',
            reportFilename: 'report-server-renderer.html',
        })
    );
}

module.exports = [
    // for browser
    {
        mode: mode,
        entry: {
            bundle: PATHS.static + '/browser',
        },
        target: 'web',
        output: {
            path: PATHS.build,
            publicPath: '/static/build/',
            /**
             * @todo
             * Eventually we can change this to be chunkFilename as well, however this can only occur
             * after we refactor React to only render <body> element and then we can use
             * https://www.npmjs.com/package/chunkhash-replace-webpack-plugin, to replace the <script>
             * tag's src attribute. Alternatively could use an `inline.js`, to be included in serverside
             * html render, as entrypoint instd of `browser.js`.
             * For now, to prevent caching JS, we append a timestamp to JS request.
             */
            filename: '[name].js',
            chunkFilename: chunkFilename,

            libraryTarget: 'umd',
            library: 'App',
            umdNamedDefine: true,
        },
        // https://github.com/hapijs/joi/issues/665
        // stub modules on client side depended on by joi (a dependency of jwt)
        // node: {
        //     net: "empty",
        //     tls: "empty",
        //     dns: "empty",
        // },
        externals: [
            {
                xmlhttprequest: '{XMLHttpRequest:XMLHttpRequest}',
                jsdom: '{JSDOM:{}}',
                // If load via CDN (to-do in future)
                // 'react': 'React',
                // 'react-dom': 'ReactDOM'
            },
        ],
        module: {
            rules: rules,
        },
        optimization: optimization,
        resolve: {
            ...resolve,
            alias: {
                ...resolve.alias,
                // TODO: re-add higlass-dependencies here when ready to re-introduce it
                'package-lock.json': path.resolve(__dirname, './package-lock.json'),
                "statistics-page-components": path.resolve(__dirname, "./src/encoded/static/components/static-pages/components/StatisticsPageViewBody"),
            },
            /**
             * From Webpack CLI:
             * webpack < 5 used to include polyfills for node.js core modules by default.
             * This is no longer the case. Verify if you need this module and configure a polyfill for it.
             * If you want to include a polyfill, you need to:
             *   - add a fallback 'resolve.fallback: { "zlib": require.resolve("browserify-zlib") }'
             *   - install 'browserify-zlib'
             * If you don't want to include a polyfill, you can use an empty module like this:
             *   resolve.fallback: { "zlib": false }
             */
            fallback: {
                zlib: false,
                stream: require.resolve('stream-browserify'),
                crypto: false,
                buffer: false,
                events: false,
                process: require.resolve('process/browser'),
                util: require.resolve('util/'),
            },
        },
        //resolveLoader : resolve,
        devtool: devTool,
        plugins: webPlugins,
        //profile: true
    },
    // for server-side rendering
    ///*
    {
        mode: mode,
        entry: {
            renderer: PATHS.static + '/server',
        },
        target: 'node',
        // make sure compiled modules can use original __dirname
        node: {
            __dirname: true,
        },
        externals: [
            // Anything which is not to be used server-side may be excluded
            // Anything that generates an extra bundle should be excluded from
            // server-side build since it might overwrite web bundle's code-split bundles.
            // But probably some way to append/change name of these chunks in this config.
            {
                d3: 'var {}',
                // This is used during build-time only I think...
                '@babel/register': '@babel/register',
                // TODO: Re-add when higlass is re-introduced
                // 'higlass-dependencies': 'var {}',
                // These remaining /higlass/ defs aren't really necessary
                // but probably speed up build a little bit.
                // 'higlass/dist/hglib' : 'var {}',
                // 'higlass-register': 'var {}',
                // 'higlass-sequence': 'var {}',
                // 'higlass-transcripts': 'var {}',
                // 'higlass-clinvar': 'var {}',
                // 'higlass-text': 'var {}',
                // 'higlass-orthologs': 'var {}',
                // 'higlass-pileup': 'var {}',
                // 'higlass-multivec': 'var {}',
                'auth0-lock': 'var {}',
                'aws-sdk': 'var {}',
                'package-lock.json': 'var {}',
                "statistics-page-components" : 'var {}',
                // Below - prevent some stuff in SPC from being bundled in.
                // These keys are literally matched against the string values, not actual path contents, hence why is "../util/aws".. it exactly what within SPC/SubmissionView.js
                // We can clean up and change to 'aws-utils' in here in future as well and alias it to spc/utils/aws. But this needs to be synchronized with SPC and 4DN.
                // We could have some 'ssr-externals.json' file in SPC (letting it define its own, per own version) and merge it into here.
                // 'aws-utils': 'empty-module',
                '../util/aws': 'var {}',
                // We can rely on NodeJS's internal URL API, since it should match API of npm url package by design.
                // This hopefully improves SSR performance, assuming Node has native non-JS/C code to parse this.
                // 'url': 'commonjs2 url'
            },
        ],
        output: {
            path: PATHS.build,
            filename: '[name].js',
            libraryTarget: 'umd',
            chunkFilename: chunkFilename,
        },
        module: {
            rules,
        },
        optimization: optimization,
        resolve: {
            ...resolve,
            fallback: {
                zlib: false,
                process: require.resolve('process/browser'),
                util: require.resolve('util/'),
            },
        },
        //resolveLoader : resolve,
        devtool: devTool, // No way to debug/log serverside JS currently, so may as well speed up builds for now.
        plugins: serverPlugins,
        // profile: true
    },
];
