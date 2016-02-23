_ = require 'underscore'
Promise = require 'bluebird'
fs = require './fs'
numCPUs = require('os').cpus().length
path = require('path')

module.exports = (dep, task, argv) ->
  sh = require('./sh')(task, argv)

  console.log 'cmake src dir is ', task.rootDir
  options =
    directory: task.rootDir

  #fs.nuke task.rootDir + '/build'

  BuildSystem = require('cmake-js').BuildSystem
  buildSystem = new BuildSystem options

  flags = {}

  _.extend flags, task.cmake

  buildSystem.cmake._run = (command) ->
    if command.indexOf('--build') != -1
      config = task.cmake?.build
      command += " -- -j#{numCPUs}"
    else if command.indexOf('--install') != -1 then config = task.cmake?.install
    else config = task.cmake?.configure
    # defaults =
    #   EXECUTABLE_OUTPUT_PATH: "~/bin/"
    #   LIBRARY_OUTPUT_PATH: "~/lib/"
    # _.extend config, defaults
    _.each config, (value, key) ->
      if typeof value == 'string' or value instanceof String
        if value.startsWith '~/'
          value = "#{dep.rootDir}/#{value.slice(2)}"
      command += " -D#{key}=#{value}"
    if argv.verbose then console.log("run cmake command: ", command);
    sh.run command

  cmakeArrayToQuotedList = (array) ->
    s = ""
    _.each array, (el, i) ->
      if i == 0 then s += "\"#{el}\""
      else s += " \"#{el}\""
    s

  header = -> """
              # generated by bbt
              cmake_minimum_required(VERSION #{@cmake?.minimumVersion || 3.1})
              project(#{@name} VERSION #{@version || '0.0.1'})
              """

  flags = -> """\n
  set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++11")
  """

  boost = ->
    if @boost
      if typeof @boost == 'string' or @boost instanceof String
        @boost = libs: [@boost]
      """\n
      # Include BoostLib module
      SET(CMAKE_MODULE_PATH "#{path.join @npmDir, "node_modules/boost-lib/cmake"}")
      include(BoostLib)
      # Locate/Download Boost (semver)
      require_boost_libs("#{@boost.version || ">= 1.59.0"}" "#{@boost.libs.join ";"}")
      include_directories(${Boost_INCLUDE_DIRS})
      """

  includeDirectories = ->
    switch @target
      when 'static', 'dynamic', 'bin'
        """\n
        include_directories(#{cmakeArrayToQuotedList @includeDirs})
        """
      when 'node'
        """\n
        # Essential include files to build a node addon,
        # you should add this line in every CMake.js based project.
        include_directories(${CMAKE_JS_INC})
        include_directories(#{cmakeArrayToQuotedList @includeDirs})
        """

  sources = ->
    switch @target
      when 'static', 'dynamic', 'bin', 'node'
        """\n
        set(SOURCE_FILES #{cmakeArrayToQuotedList @sources})
        """

  target = ->
    switch @target
      when 'static'
        """\n
        add_library(#{@name} STATIC ${SOURCE_FILES})
        """
      when 'bin'
        """\n
        add_executable(#{@name} ${SOURCE_FILES})
        """

  link = ->
    libs = cmakeArrayToQuotedList @libs
    if @boost then libs += " ${Boost_LIBRARIES}"
    if task.target == 'node' then libs += " ${CMAKE_JS_LIB}"
    if libs.length
      """\n
      target_link_libraries(${PROJECT_NAME} #{libs})
      """

  buildCmake = (funcs, context) ->
    cmake = ""
    Promise.each funcs, (fn) ->
      Promise.resolve fn.bind(context)()
      .then (val) -> if val then cmake += val
    .then -> Promise.resolve cmake

  configure: (context) ->
    _.extend context, task
    console.log 'cmake context', context
    buildCmake [header, boost, includeDirectories, sources, target, link], context

  cmake: ->
    command = _.first(argv._) || "build"

    ifCommand = (c, f) ->
      if c == command
        return f()
      false

    exitOnError = (promise) ->
      promise.catch ->
        process.exit 1

    install = -> exitOnError buildSystem.install()
    configure = -> exitOnError buildSystem.configure()

    printConfigure = ->
      exitOnError buildSystem.getConfigureCommand().then((command) ->
        console.info command
      )

    build = -> exitOnError buildSystem.build()

    printBuild = ->
      exitOnError buildSystem.getBuildCommand().then((command) ->
        console.info command
      )

    clean = -> exitOnError buildSystem.clean()

    printClean = ->
      exitOnError buildSystem.getCleanCommand().then((command) ->
        console.info command
      )

    reconfigure = -> exitOnError buildSystem.reconfigure()
    rebuild = -> exitOnError buildSystem.rebuild()
    compile = -> exitOnError buildSystem.compile()

    done = ifCommand("install", install);
    done = done or ifCommand('configure', configure)
    done = done or ifCommand('print-configure', printConfigure)
    done = done or ifCommand('build', build)
    done = done or ifCommand('print-build', printBuild)
    done = done or ifCommand('clean', clean)
    done = done or ifCommand('print-clean', printClean)
    done = done or ifCommand('reconfigure', reconfigure)
    done = done or ifCommand('rebuild', rebuild)
    done = done or ifCommand('compile', compile)

    if !done
      if command
        console.error 'COM', 'Unknown command: ' + command
        process.exit 1
      else
        build()
    done

### FOR CMAKE-JS Reference
BuildSystem = (options) ->
  @options = options or {}
  @options.directory = path.resolve(@options.directory or process.cwd())
  @log = new CMLog(@options)
  appConfig = appCMakeJSConfig(@options.directory, @log)
  if _.isPlainObject(appConfig)
    if _.keys(appConfig).length
      @log.verbose 'CFG', 'Applying CMake.js config from root package.json:'
      @log.verbose 'CFG', JSON.stringify(appConfig)
      # Applying applications's config, if there is no explicit runtime related options specified
      @options.runtime = @options.runtime or appConfig.runtime
      @options.runtimeVersion = @options.runtimeVersion or appConfig.runtimeVersion
      @options.arch = @options.arch or appConfig.arch
  @log.verbose 'CFG', 'Build system options:'
  @log.verbose 'CFG', JSON.stringify(@options)
  @cmake = new CMake(@options)
  @dist = new Dist(@options)
  @toolset = new Toolset(@options)
  return

CMake = (options) ->
  @options = options or {}
  @log = new CMLog(@options)
  @dist = new Dist(@options)
  @projectRoot = path.resolve(@options.directory or process.cwd())
  @workDir = path.join(@projectRoot, 'build')
  @config = if @options.debug then 'Debug' else 'Release'
  @buildDir = path.join(@workDir, @config)
  @_isAvailable = null
  @targetOptions = new TargetOptions(@options)
  @toolset = new Toolset(@options)
  return

Toolset = (options) ->
  @options = options or {}
  @targetOptions = new TargetOptions(@options)
  @generator = null
  @cCompilerPath = null
  @cppCompilerPath = null
  @compilerFlags = []
  @linkerFlags = []
  @makePath = null
  @log = new CMLog(@options)
  @_initialized = false
  return

Toolset::initializePosix = (install) ->
  # 1: Compiler
  if !environment.isGPPAvailable and !environment.isClangAvailable
    if environment.isOSX
      throw new Error('C++ Compiler toolset is not available. Install Xcode Commandline Tools from Apple Dev Center, or install Clang with homebrew by invoking: \'brew install llvm --with-clang --with-asan\'.')
    else
      throw new Error('C++ Compiler toolset is not available. Install proper compiler toolset with your package manager, eg. \'sudo apt-get install g++\'.')
  if @options.preferClang and environment.isClangAvailable
    if install
      @log.info 'TOOL', 'Using clang++ compiler, because preferClang option is set, and clang++ is available.'
    @cppCompilerPath = 'clang++'
    @cCompilerPath = 'clang'
  else if @options.preferGnu and environment.isGPPAvailable
    if install
      @log.info 'TOOL', 'Using g++ compiler, because preferGnu option is set, and g++ is available.'
    @cppCompilerPath = 'g++'
    @cCompilerPath = 'gcc'
  # 2: Generator
  if environment.isOSX
    if @options.preferXcode
      if install
        @log.info 'TOOL', 'Using Xcode generator, because preferXcode option is set.'
      @generator = 'Xcode'
    else if @options.preferMake and environment.isMakeAvailable
      if install
        @log.info 'TOOL', 'Using Unix Makefiles generator, because preferMake option is set, and make is available.'
      @generator = 'Unix Makefiles'
    else if environment.isNinjaAvailable
      if install
        @log.info 'TOOL', 'Using Ninja generator, because ninja is available.'
      @generator = 'Ninja'
    else
      if install
        @log.info 'TOOL', 'Using Unix Makefiles generator.'
      @generator = 'Unix Makefiles'
  else
    if @options.preferMake and environment.isMakeAvailable
      if install
        @log.info 'TOOL', 'Using Unix Makefiles generator, because preferMake option is set, and make is available.'
      @generator = 'Unix Makefiles'
    else if environment.isNinjaAvailable
      if install
        @log.info 'TOOL', 'Using Ninja generator, because ninja is available.'
      @generator = 'Ninja'
    else
      if install
        @log.info 'TOOL', 'Using Unix Makefiles generator.'
      @generator = 'Unix Makefiles'
  # 3: Flags
  @_setupGNUStd install
  if environment.isOSX
    if install
      @log.verbose 'TOOL', 'Setting default OSX compiler flags.'
    @compilerFlags.push '-D_DARWIN_USE_64_BIT_INODE=1'
    @compilerFlags.push '-D_LARGEFILE_SOURCE'
    @compilerFlags.push '-D_FILE_OFFSET_BITS=64'
    @compilerFlags.push '-DBUILDING_NODE_EXTENSION'
    @compilerFlags.push '-w'
    @linkerFlags.push '-undefined dynamic_lookup'
  return
###