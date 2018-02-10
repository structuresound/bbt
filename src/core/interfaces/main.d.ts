/// <reference path="project.d.ts" />
/// <reference path="shell.d.ts" />

declare namespace TMake {
  interface SIO { [index: string]: string }

  namespace Plugin {
    interface TMake extends TMake.Plugin.Shell {
      constructor(configuration: TMake.Configuration);
      configureCommand();
      buildCommand();
      installCommand();
    }
  }
}

declare module 'tmake-core/main' {
  class ProjectRunner {
    [index: string]: any;
    project: TMake.Product;
    constructor(node: TMake.Product);
    do(fn: Function, opt?: any): PromiseLike<void>
    fetch(isTest?: boolean): PromiseLike<void>
    generate(isTest?: boolean): PromiseLike<void>
    configure(isTest?: boolean): PromiseLike<void>
    build(isTest?: boolean): PromiseLike<void>
    all(): PromiseLike<void>
    install(): PromiseLike<void>
    test(): PromiseLike<void>
    link(): PromiseLike<void>
    clean(): PromiseLike<void>
  }

  function processDep(node: TMake.Product, phase: string): PromiseLike<void>
  function unlink(config: TMake.Product.Cache.File): PromiseLike<void>
  function push(config: TMake.Product.Cache.File): PromiseLike<void>
  function list(repo: string, selector: Object): PromiseLike<TMake.Product>
  function findAndClean(depName: string): PromiseLike<TMake.Product>
  function execute(conf: TMake.Trie.Project, phase: string, subProject?: string)
}

