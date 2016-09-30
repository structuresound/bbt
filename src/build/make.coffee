Promise = require 'bluebird'
sh = require "../util/sh"

module.exports = (argv, dep, platform) ->
  build = ->
    sh.Promise "make -j#{platform.j()}", dep.d.project, !argv.quiet

  build: build
  generate: -> Promise.resolve "sorry, no support for Makefile creation yet - use cmake or ninja instead"
  install: ->
    sh.Promise "make install", dep.d.project, !argv.quiet
