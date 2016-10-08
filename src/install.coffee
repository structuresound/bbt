_ = require('underscore')
_vinyl = require('vinyl-fs')
_p = require("bluebird")
path = require('path')
sh = require "shelljs"
colors = require ('chalk')
fs = require('./util/fs')
vinyl =
  symlink: _vinyl.symlink
  dest: _vinyl.dest
  src: (glob, opt) ->
    patterns = _.map glob, (string) ->
      if string.startsWith '/'
        return string.slice(1)
      string
    _vinyl.src patterns, opt

module.exports = (argv, dep, platform, db) ->
  copy = (patterns, from, to, opt) ->
    filePaths = []
    fs.wait(vinyl.src(patterns,
      cwd: from
      followSymlinks: opt.followSymlinks
    ).pipe(fs.map (file, emit) ->
      #if argv.verbose then console.log '+ ', path.relative file.cwd, file.path
      if opt.flatten then file.base = path.dirname file.path
      newPath = to + '/' + path.relative file.base, file.path
      filePaths.push path.relative dep.d.home, newPath
      emit(null, file)
    ).pipe(vinyl.dest to)
    ).then ->
      _p.resolve filePaths

  symlink = (patterns, from, to, opt) ->
    filePaths = []
    fs.wait(vinyl.src(patterns,
      cwd: from
      followSymlinks: opt.followSymlinks
    ).pipe(fs.map (file, emit) ->
      #if argv.verbose then console.log '+ ', path.relative file.cwd, file.path
      if opt.flatten then file.base = path.dirname file.path
      newPath = to + '/' + path.relative file.base, file.path
      filePaths.push path.relative dep.d.home, newPath
      emit(null, file)
    ).pipe(vinyl.symlink to, relative: true)
    ).then ->
      _p.resolve filePaths

  installBin = ->
    if _.contains ['bin'], dep.target
      sh.mkdir '-p', path.join argv.runDir, 'bin'
      _.each dep.d.install.binaries, (ft) ->
        from = path.join(ft.from, dep.name)
        to = path.join(ft.to, dep.name)
        if argv.verbose then console.log colors.green '[ install bin ] from', from, 'to', to
        sh.mv from, to
    else _p.resolve('bin')

  installAssets = ->
    if dep.d.install.assets
      _p.map dep.d.install.assets, (ft) ->
        patterns = ft.matching || ['**/*.*']
        if argv.verbose then console.log colors.green '[ install assets ] from', ft.from, 'to', ft.to
        copy patterns, ft.from, ft.to,
          flatten: false
          followSymlinks: true
      .then (assetPaths) ->
        db.update name: dep.name,
          $set: assets: _.flatten assetPaths
        , {}
    else _p.resolve('assets')

  installLibs = ->
    if _.contains ['static','dynamic'], dep.target
      _p.map dep.d.install.libraries, (ft) ->
        patterns = ft.matching || ['*.a']
        if dep.target == 'dynamic' then patterns = ft.matching || ['*.dylib', '*.so', '*.dll']
        if argv.verbose then console.log colors.green '[ install libs ] from', ft.from, 'to', ft.to
        symlink patterns, ft.from, ft.to,
          flatten: true
          followSymlinks: false
      .then (libPaths) ->
        db.update name: dep.name,
          $set: libs: _.flatten libPaths
        , {}
    else _p.resolve('libs')

  installHeaders = ->
    if _.contains ['static','dynamic'], dep.target
      _p.map dep.d.install.headers, (ft) ->
        patterns = ft.matching || ["**/*.h", "**/*.hpp", "**/*.ipp"]
        if argv.verbose then console.log colors.yellow '[ install headers ] matching', patterns, '\nfrom', ft.from, '\nto', ft.to
        symlink patterns, ft.from, ft.to,
          flatten: false
          followSymlinks: true
      .then (headerPaths) ->
        db.update name: dep.name,
          $set: headers: _.flatten headerPaths
        , {}
    else _p.resolve('headers')

  execute = ->
    installHeaders()
    .then ->
      installLibs()
    .then ->
      if argv.verbose then console.log colors.green "libs"
      installBin()
    .then ->
      installAssets()
    .then ->
      if argv.verbose then console.log colors.green "installed"
      db.update {name: dep.name}, {$set: {"cache.installed": true}}, {}

  installHeaders: installHeaders
  installLibs: installLibs
  installAssets: installAssets
  execute: execute
  copy: copy
