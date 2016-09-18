os = require('os')
sh = require('./sh')
_ = require('underscore')
cascade = require './cascade'

module.exports = (argv, conf) ->
  iosArches = ["arm64", "armv7s", "armv7"]
  androidArches = iosArches

  platformNames =
    linux: "linux"
    darwin: "mac"
    mac: "mac"
    win: "win"
    win32: "win"
    ios: "ios"
    android: "android"

  validSelectors = [
    # IDE's
    "xcode"
    "clion"
    "msvs"
    "vscode"
    "codeblocks"
    "appcode"
    # Platforms
    "cocoa"
    "sdl"
    "juce"
  ]

  architectureNames =
    x86: "x86"
    x32: "x86"
    x64: "x64"
    arm: "arm"
    mac:
      x64: "x86_64"
    ios:
      x64: iosArches
      x86: iosArches
      arm: iosArches

  keywords = _.uniq(Object.keys(platformNames).concat(Object.keys(architectureNames)).concat(validSelectors))

  argvSelectors = Object.keys _.pick argv, validSelectors
  targetPlatform = -> argv.platform || conf.platform || platformNames[os.platform()]
  targetArch = ->
    # architectures = cascade.deep architectureNames, Object.keys(platformNames), [ targetPlatform() ]
    argv.arch || conf.arch || process.arch

  homeDir: -> process.env[if process.platform == 'win32' then 'USERPROFILE' else 'HOME']
  name: -> targetPlatform()
  keywords: -> keywords
  selectors: ->
    [ targetPlatform(), process.arch ].concat(argvSelectors)
  j: -> os.cpus().length
  macro:
    OS_ENDIANNESS: os.endianness()
