const gulp = require('gulp');
const path = require('path');
const { spawn } = require('child_process');
const PluginError = require('plugin-error');
const log = require('fancy-log');
const webpack = require('webpack');
const fs = require('fs');

const { getLinkedSharedComponentsPath } = require('./jsbuild-utils.js');

function setProduction(done) {
    process.env.NODE_ENV = 'production';
    done();
}

function setQuick(done) {
    process.env.NODE_ENV = 'quick';
    done();
}

function setDevelopment(done) {
    process.env.NODE_ENV = 'development';
    done();
}

function webpackOnBuild(done) {
    const start = Date.now();
    return function (err, stats) {
        if (err) {
            throw new PluginError('webpack', err);
        }
        log(
            '[webpack]',
            stats.toString({
                colors: true,
            })
        );
        const end = Date.now();
        log('Build Completed, running for ' + (end - start) / 1000) + 's';
        if (done) {
            done(err);
        }
    };
}

function doWebpack(cb) {
    const webpackConfig = require('./webpack.config.js');
    webpack(webpackConfig).run(webpackOnBuild(cb));
}

function watch(done) {
    const webpackConfig = require('./webpack.config.js');
    webpack(webpackConfig).watch(300, webpackOnBuild());
}

function buildSharedPortalComponents(done) {
    const { isLinked, sharedComponentPath } = getLinkedSharedComponentsPath();

    if (!isLinked) {
        // Exit
        done();
        return;
    }

    // Same as shared-portal-components own build method
    const subP = spawn(
        path.join(sharedComponentPath, 'node_modules/.bin/babel'),
        [
            path.join(sharedComponentPath, 'src'),
            '--out-dir',
            path.join(sharedComponentPath, 'es'),
            '--env-name',
            'esm',
        ],
        { stdio: 'inherit' }
    );

    subP.on('error', (err) => {
        console.log(`buildSharedPortalComponents errored - ${err}`);
        return;
    });

    subP.on('close', (code) => {
        console.log(
            `buildSharedPortalComponents process exited with code ${code}`
        );
        done();
    });
}

function watchSharedPortalComponents(done) {
    const { isLinked, sharedComponentPath } = getLinkedSharedComponentsPath();

    if (!isLinked) {
        // Exit
        done();
        return;
    }

    // Same as shared-portal-components own build method, but with "--watch"
    const subP = spawn(
        path.join(sharedComponentPath, 'node_modules/.bin/babel'),
        [
            path.join(sharedComponentPath, 'src'),
            '--out-dir',
            path.join(sharedComponentPath, 'es'),
            '--env-name',
            'esm',
            '--watch',
        ],
        { stdio: 'inherit' }
    );

    subP.on('error', (err) => {
        console.log(`watchSharedPortalComponents errored - ${err}`);
        return;
    });

    subP.on('close', (code) => {
        console.log(
            `watchSharedPortalComponents process exited with code ${code}`
        );
        done();
    });
}

const devQuick = gulp.series(
    setQuick,
    doWebpack,
    gulp.parallel(watch, watchSharedPortalComponents)
);

const devAnalyzed = gulp.series(
    setDevelopment,
    buildSharedPortalComponents,
    doWebpack
);

const build = gulp.series(setProduction, doWebpack);

//gulp.task('dev', devSlow);
//gulp.task('build-quick', buildQuick);
gulp.task('default', devQuick);
gulp.task('dev-quick', devQuick);
gulp.task('dev-analyzed', devAnalyzed);
gulp.task('build', build);
