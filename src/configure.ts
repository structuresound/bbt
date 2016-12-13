import * as _ from 'lodash';
import * as Promise from 'bluebird';
import * as path from 'path';
import {diff, check} from 'js-object-tools';
import * as fs from 'fs';

import file from './util/file';
import {execAsync, ShellOptions} from './util/sh';
import log from './util/log';

import {deps} from './graph';
import {resolveUrl} from './fetch';
import args from './util/args';
import {replaceInFile} from './parse';

import {cache as db} from './db';

import {generate as cmake} from './cmake';
import {generate as ninja} from './ninja';

import {stringHash} from './util/hash';

import {iterate} from './iterate';

import {Node} from './node';
import {Configuration, CmdObj} from './configuration';

interface VinylFile {
  path: string;
  base: string;
  cwd?: string;
}
interface CopyOptions {
  followSymlinks?: boolean;
  flatten?: boolean;
  relative?: string;
  from?: string;
  to?: string;
}

function copy(patterns: string[], options: CopyOptions) {
  const filePaths: string[] = [];
  return file.wait(file.src(patterns, {
    cwd: options.from,
    followSymlinks: false
  }).pipe(file.map((data: VinylFile, callback: Function) => {
    const mutable = data;
    log.verbose(`+ ${path.relative(mutable.cwd, mutable.path)}`);
    if (options.flatten) {
      mutable.base = path.dirname(mutable.path);
    }
    const newPath = path.join(options.to, path.relative(mutable.base, mutable.path));
    filePaths.push(path.relative(options.relative, newPath));
    return callback(null, file);
  })).pipe(file.dest(options.to))).then(() => {
    return Promise.resolve(filePaths);
  });
}

function globHeaders(node: Node) {
  const patterns = node.globArray(node.configuration.headers
    ? node.configuration.headers.matching
    : [
      '**/*.h',
      '**/*.hpp',
      '**/*.ipp',
      '!test/**',
      '!tests/**',
      '!build/**'
    ]);
  return Promise.map(node.d.includeDirs, (includePath) => {
    return file.glob(patterns, node.d.project, includePath);
  }).then((stack) => {
    return Promise.resolve(_.flatten(stack));
  });
}

function globSources(node: Node) {
  const patterns = node.globArray(node.configuration.sources
    ? node.configuration.sources.matching
    : [
      '**/*.cpp', '**/*.cc', '**/*.c', '!test/**', '!tests/**'
    ]);
  return file.glob(patterns, node.d.project, node.d.source);
}

function globDeps(node: Node) {
  return deps(node);
}

function globFiles(node: Node) {
  return globHeaders(node).then((headers) => {
    node.configuration.headers = headers;
    return globSources(node);
  }).then((sources) => {
    node.configuration.sources = sources;
    return globDeps(node);
  }).then((depGraph) => {
    if (depGraph.length) {
      node.configuration.libs = _
        .chain(depGraph)
        .map((d: Node) => {
          return _.map(d.libs, (lib) => {
            return path.join(d.d.home, lib);
          });
        })
        .flatten()
        .value()
        .reverse() as string[];
    }
    node.configuration.includeDirs = _.union([`${node.d.home}/include`], node.d.includeDirs);
    return Promise.resolve(node);
  });
}

interface StringObject {
  [key: string]: string;
}

function getBuildFile(node: Node, systemName: string): string {
  const buildFileNames: StringObject = {
    ninja: 'build.ninja',
    cmake: 'CMakeLists.txt',
    gyp: 'binding.gyp',
    make: 'Makefile',
    xcode: `${node.name}.xcodeproj`
  };
  return buildFileNames[systemName];
}

function getBuildFilePath(node: Node, systemName: string) {
  return path.join(node.d.project, getBuildFile(node, systemName));
}

function createBuildFileFor(node: Node, systemName: string) {
  return file
    .existsAsync(getBuildFilePath(node, systemName))
    .then((exists) => {
      if (exists) {
        const buildFileName = getBuildFile(node, systemName);
        log.quiet(`using pre-existing build file ${buildFileName}`);
        node.cache.buildFile = buildFileName;
        return db.update({
          name: node.name
        }, {
          $set: {
            'cache.buildFile': node.cache.buildFile
          }
        });
      }
      return generateConfig(node, systemName);
    })
    .then(() => {
      return Promise.resolve(node);
    });
}

function generateConfig(node: Node, systemName: string) {
  return globFiles(node).then((conf) => {
    return generateBuildFile(conf, systemName);
  }).then(() => {
    return processConfig(node, systemName);
  });
}

function generateBuildFile(node: Node, systemName: string) {
  const buildFile = getBuildFilePath(node, systemName);
  switch (systemName) {
    case 'ninja':
      return ninja(node, buildFile);
    case 'cmake':
      return cmake(node).then((CMakeLists) => {
        return file.writeFileAsync(buildFile, CMakeLists);
      }).then((conf) => {
        return Promise.resolve(conf);
      });
    default:
      throw new Error(`bad build system ${systemName}`);
  }
}

function processConfig(node: Node, systemName: string) {
  const buildFileName = getBuildFile(node, systemName);
  node.cache.buildFile = buildFileName;
  return db.update({
    name: node.name
  }, {
    $set: {
      'cache.buildFile': node.cache.buildFile,
      'cache.generatedBuildFile': node.cache.buildFile
    }
  }).then(() => {
    return Promise.resolve(node);
  });
}

function isStale(node: Node, cumulativeHash: string) {
  if (node.cache.metaConfiguration) {
    if (cumulativeHash !== node.cache.metaConfiguration) {
      const url = resolveUrl(node);
      if (node.cache.url !== stringHash(url)) {
        log.error(`url is stale, now ${url}`);
      } else {
        log.error(`${node.name} configuration is stale ${node.cache.metaConfiguration}, now ${cumulativeHash}`);
        log.error(node.configuration);
      }
      return true;
    }
  } else {
    return true;
  }
}

function hashNodeConfiguration(node: Node) {
  const urlHash = stringHash(resolveUrl(node));
  return stringHash(urlHash + node.configuration.hash());
}

interface ReplEntry {
  matching: string[];
}

function configure(node: Node) {
  if (!node.configuration) {
    throw new Error('configure without node');
  }
  // const compiler = new Compiler(node.profile, node.configure);
  const configHash = hashNodeConfiguration(node);
  if (node.force() || isStale(node, configHash)) {
    const commands: CmdObj[] = node.configuration.getCommands();
    return Promise.each(diff.arrayify(commands), (i: CmdObj) => {
      switch (i.cmd) {
        default:
          return Promise.reject(new Error(`no valid cmd in iterable for ${i.cmd}`));
        case 'with':
          log.verbose(`configure for: ${i.arg}`);
          return createBuildFileFor(node, i.arg);
        case 'ninja':
        case 'cmake':
          return createBuildFileFor(node, name);
        case 'shell':
          log.error(name);
          log.error(i.arg);
          return Promise.each(diff.arrayify(i.arg), (command: any) => {
            const c: CmdObj = check(command, String)
              ? <CmdObj> {
                cmd: command
              }
              : command;
            const setting = node
              .pathSetting(c.cwd || node.d.source);
            return execAsync(node.profile.parse(c.cmd, node), <ShellOptions>{
              cwd: setting,
              silent: !args.quiet
            });
          });
        case 'replace':
          return Promise.each(diff.arrayify(i.arg), (replEntry: ReplEntry) => {
            const pattern = node.globArray(replEntry.matching);
            return file
              .glob(pattern, undefined, node.d.source)
              .then((files: string[]) => {
                return Promise.each(files, (file) => {
                  return replaceInFile(file, replEntry, node);
                });
              });
          });
        case 'create':
          return iterate(i.arg, (entry: {string: string, path: string}) => {
            const filePath = path.join(node.d.source, entry.path);
            const existing = file.readIfExists(filePath);
            if (existing !== entry.string) {
              log.verbose(`create file ${filePath}`);
              return file.writeFileAsync(filePath, entry.string, {encoding: 'utf8'});
            }
          });
        case 'copy':
          return Promise.each(diff.arrayify(i.arg), (e: {from: string, matching: string[], to: string}) => {
            log.quiet(`copy ${e}`);
            const fromDir = node
              .pathSetting(e.from);
            return copy(e.matching, {
              from: fromDir,
              to: node.pathSetting(e.to)
            });
          });
      }
    }).then(() => {
      return db.update({
        name: node.name
      }, {
        $set: {
          'cache.metaConfiguration': configHash
        }
      });
    }).then(() => {
      return Promise.resolve(node);
    });
  }
  log.verbose(`configuration ${configHash} is current, use --force=${node.name} if you suspect the cache is stale`);
  return Promise.resolve(node);
}

export {hashNodeConfiguration, configure};
