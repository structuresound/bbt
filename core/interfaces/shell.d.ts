/// <reference path="environment.d.ts" />

declare namespace TMake {
  namespace Plugin {
    class Shell extends TMake.Plugin.Environment {
      options: Plugin.Shell.Options;
      constructor(env: TMake.Environment, options?: TMake.Plugin.Shell.Options)

      configureCommand(): string;
      buildCommand(): string;
      installCommand(): string;
    }
    namespace Shell {
      interface Options extends Plugin.Options {
        defines?: any;
        arguments?: any;
        prefix?: any;
        toolchain?: {
          [index: string]: {
            version?: string;
          }
        }
      }
    }
  }
  namespace Shell {
    namespace Exec {
      interface Options {
        silent?: boolean
        cwd?: string
        short?: string
      }
    }
  }
}

declare module 'tmake-core/shell' {
  function execAsync(command: string, options?: TMake.Shell.Exec.Options)
  class Shell extends TMake.Plugin.Shell { }
}