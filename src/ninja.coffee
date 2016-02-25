os = require('os')
ps = require('promise-streams')
fs = require('fs')
unzip = require('unzip')
request = require('request-promise')
numCPUs = require('os').cpus().length
path = require('path')
sh = require "shelljs"
_ = require 'underscore'
Promise = require 'bluebird'

ninjaVersion = "1.6.0"
platformName =
  linux: "linux"
  darwin: "mac"
  win32: "win"

ninjaUrl = "https://github.com/ninja-build/ninja/releases/download/v#{ninjaVersion}/ninja-#{platformName[os.platform()]}.zip"
ninjaPath = "#{process.cwd()}/.bbt"
ninjaLocal = ninjaPath + "/ninja"

module.exports = (step, argv) ->
  useSystemNinja = ->
    if step.useSystemNinja
      if sh.which 'ninja' then return "ninja"
    false

  getNinja = ->
    if fs.existsSync ninjaLocal || useSystemNinja()
      if argv.verbose then console.log 'found ninja'
      ninjaPath = ninjaLocal || useSystemNinja
      Promise.resolve ninjaPath
    else
      if argv.verbose then console.log 'fetch ninja binaries . . . '
      ps.wait(request(ninjaUrl).pipe(unzip.Extract(path: ninjaPath)))
      .then ->
        sh.chmod "+x", "#{ninjaLocal}"
        Promise.resolve ninjaLocal

  stdOptions =
    O2: true
    std: "c++11"
    stdlib: "libc++"

  jsonToCflags = (pkgOptions) ->
    options = _.extend stdOptions, pkgOptions

    if options.O3
      options.O2 = false
    if options.O3 or options.O2
      options.O1 = false
    if options.O3 or options.O2 or options.O1
      options.Os = false
    if options.O3 or options.O2 or options.O1 or options.Os
      options.O0 = false

    jsonToFlags options

  jsonToLDFlags = (pkgOptions) ->
    options = pkgOptions || {}
    jsonToFlags options

  jsonToFlags = (json) ->
    flags = ""
    _.each json, (opt, key) ->
      if typeof opt == 'string'
        flags += " -#{key}=#{opt}"
      else if opt
        flags += " -#{key}"
    flags

  build = (dir) ->
    getNinja().then (ninjaPath) ->
      command = "#{ninjaPath} -C #{dir}"
      new Promise (resolve, reject) ->
        sh.exec command, (code, stdout, stderr) ->
          if code then reject "ninja exited with code " + code + "\n" + command
          else if stdout
            if argv.verbose then console.log 'ninja done'
            resolve()
          else if stderr then reject stderr

  genBuildScript = (context, fileStream) ->
    if argv.verbose then console.log 'ninjabuild, context:', context
    getRule = (ext) ->
      switch ext
        when "cpp", "cc", "c" then "cc"
        else "cc"
    ninjaConfig = require('ninja-build-gen')(ninjaVersion, 'build')
    includeString = " -I" + context.includeDirs.join(" -I")

    cc = context.compiler or "gcc"

    compileCommand = "#{cc} -MMD -MF $out.d#{jsonToCflags step.cflags} -c $in -o $out #{includeString}"
    linkCommand = "ar rv $out $in#{jsonToLDFlags step.ldflags}"

    ninjaConfig
    .rule 'compile'
    .depfile '$out.d'
    .run compileCommand
    .description compileCommand

    ninjaConfig
    .rule('link')
    .run linkCommand
    .description linkCommand

    linkNames = []
    _.each context.sources, (filePath) ->
      ext = path.extname filePath
      name = path.basename filePath, ext
      linkNames.push 'build/' + name + '.o'
      ninjaConfig.edge('build/' + name + '.o').from(filePath).using("compile")

    linkInput = linkNames.join(" ")
    ninjaConfig.edge('build/lib' + step.name + '.a').from(linkInput).using("link")
    ninjaConfig.saveToStream fileStream

  configure: genBuildScript
  build: build
