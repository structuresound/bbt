import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as file from './file';
import { combine, check, NodeGraph, OLHM } from 'js-object-tools';
import { log } from './log';
import { args } from './args';
import { iterateOLHM, mapOLHM, iterate } from './iterate';
import { absolutePath } from './parse';
import { cache as db } from './db';
import { jsonStableHash } from './hash';

import { Project, ProjectFile, resolveName } from './project';
import { Environment, EnvironmentCacheFile, CacheProperty } from './environment';

function loadCache(project: Project): PromiseLike<Project> {
  return db.findOne({ name: project.name })
    .then((result: ProjectFile) => {
      if (result) {
        project.merge(<any>result);
      }
      return Bluebird.each(project.environments, (e) => {
        return loadEnvironment(e);
      })
    }).then(() => {
      return Promise.resolve(project);
    })
}

function loadEnvironment(env: Environment) {
  return db.findOne({ name: env.id() })
    .then((result: EnvironmentCacheFile) => {
      if (result) {
        for (const key of Object.keys(result)) {
          env.cache[key].set(result[key]);
        }
      }
    });
}

function createNode(_conf: ProjectFile, parent?: Project) {
  const node = new Project(_conf, parent);
  return loadCache(node);
}

interface Cache {
  [index: string]: Project;
}

interface FileCache {
  [index: string]: ProjectFile;
}

function scanDependencies(require: OLHM<ProjectFile>, node: Project, graph: NodeGraph<Project>,
  cache: Cache, fileCache: FileCache) {
  return mapOLHM(require || {},
    (dep) => {
      console.log('process dep', dep.name || dep.git || dep.link);
      return graphNode(dep, node, graph, cache, fileCache);
    })
    .then((deps) => {
      if (deps.length) {
        node.require = {}
        for (const dep of deps) {
          node.require[dep.name] = <any>dep;
          console.log('resolved dep', dep.name);
        }
      }
      return Promise.resolve(node);
    });
}

function graphNode(_conf: ProjectFile, parent: Project, graph: NodeGraph<Project>,
  cache: Cache, fileCache: FileCache): PromiseLike<Project> {
  let conf = _conf;
  if (conf.link) {
    const configDir = absolutePath(conf.link, parent ? parent.dir : '');
    if (fileCache[configDir]) {
      conf = fileCache[configDir];
      log.verbose(`file @ ${configDir} already loaded`);
    } else {
      const linkedConfig = file.readConfigSync(configDir);
      linkedConfig.dir = configDir;
      if (!linkedConfig) {
        throw new Error(`can't resolve symlink ${conf.link} relative to parent ${parent.dir} fullpath: ${file.getConfigPath(configDir)}`)
      }
      fileCache[configDir] = <ProjectFile>combine(linkedConfig, conf);
      conf = fileCache[configDir]
    }
  }
  const name = resolveName(conf);
  if (parent && (name === parent.name)) {
    throw new Error(`recursive dependency ${parent.name}`);
  }
  if (cache[name]) {
    log.verbose(`project ${name} already loaded`);
    return Promise.resolve(cache[name]);
  }
  return createNode(conf, parent)
    .then((node: Project) => {
      log.verbose(`graph >> ${name} ${node.dir ? '@ ' + node.dir : ''}`);
      graph.addNode(name);
      if (parent) {
        log.verbose(`graph >> ${parent.name} ${name}`);
        graph.addDependency(parent.name, name);
      }
      cache[node.name] = node;
      return scanDependencies(conf.require, node, graph, cache, fileCache);
    }).then((node: Project) => {
      if (args.verbose) {
        log.add(`+${name} ${node.dir ? '@ ' + node.dir : ''}`);
      }
      return Promise.resolve(node);
    });
}

function _map(node: ProjectFile, graphType: string,
  graphArg?: string): PromiseLike<Project[]> {
  const cache: Cache = {};
  const fileCache: FileCache = {};
  const graph = new NodeGraph();

  return graphNode(node, undefined, graph, cache, fileCache)
    .then(() => {
      const nodeNames = graph[graphType](graphArg);
      const nodes: Project[] =
        _.map(nodeNames, (name: string) => { return cache[name]; });
      return Promise.resolve(nodes);
    });
}

function all(node: Project | ProjectFile) {
  return _map(node, 'overallOrder');
}

function deps(node: Project | ProjectFile) {
  return _map(node, 'dependenciesOf', node.name);
}

function resolve(conf: Project | ProjectFile) {
  if (!conf) {
    throw new Error('resolving without a root node');
  }
  return all(conf);
}

export { deps, createNode, loadCache, resolve as graph };