import _ from 'lodash';
import Promise from 'bluebird';
import path from 'path';
import colors from 'chalk';

import {validate, linkSource} from './util/fetch';
import log from './util/log';
import argv from './util/argv';
import fs from './util/fs';

import profile from './profile';
import prompt from './prompt';
import {graph} from './graph';
import {Module} from './module';
import cloud from './cloud';
import configure from './configure';
import build from './build';
import install from './install';
import test from './test';
import {cache as db, localRepo} from './db';

const buildPhase = {
  fetch(node) {
    if (node.fetch || node.git || node.link) {
      if (node.link) {
        return linkSource();
      }
      return validate(node);
    }
    return Promise.resolve();
  },
  configure(node, tests) {
    if (configure.hashMetaConfiguration() !== node.cache.metaConfiguration) {
      if (node.cache.url) {
        fs.nuke(node.d.clone);
      }
    }
    return buildPhase
      .fetch(node)
      .then(() => configure.execute().then(() => {
        return install.headers(node, profile, db, tests);
      }));
  },
  build(node, tests) {
    return buildPhase
      .configure(node, tests)
      .then(() => build.execute(node, profile, db, tests));
  },
  install(node, phase, tests) {
    return buildPhase
      .build(node, tests)
      .then(() => install.execute(node, profile, db));
  },
  clean(node) {
    return cleanDep(node);
  },
  test(node) {
    return buildPhase
      .build(node, true)
      .then(() => test.execute(node, profile, db));
  }
};

// function findDepNamed(name, root) {
//   if ((root || {}).name === name) {
//     return root;
//   }
//   for (const node of root.deps || root.dependencies) {
//     if (node.name === name) {
//       return node;
//     } else if (resolveName(node) === name) {
//       return node;
//     }
//     const found = findDepNamed(name, node);
//     if (found) {
//       return found;
//     }
//   }
//   if (!root) {
//     throw new Error(`node named ${name} not found, and no root supplied`);
//   }
//   return (root);
// }

function execute(conf, phase) {
  return graph(_.extend(conf, {
    d: {
      root: argv.runDir
    }
  })).then((nodes) => {
    if (!argv.quiet) {
      log.add(_.map(nodes, d => d.name).join(' >> '));
    }
    if (argv.nodeps) {
      return processDep(root, phase);
    }
    return Promise.each(nodes, node => processDep(node, phase));
  });
}

function processDep(node, phase) {
  if (!argv.quiet) {
    log.add(`<< ${node.name} >>`);
  }
  if (!node.cached || phase === 'clean' || profile.force(node)) {
    if (argv.verbose) {
      log.quiet(`>> ${phase} >>`);
    }
    process.chdir(argv.runDir);
    return buildPhase[phase](node);
  }
  return Promise.resolve(node);
}

function unlink(config) {
  const query = {
    name: config.name,
    tag: config.tag || 'master'
  };
  return db
    .localRepo
    .findOne(query)
    .then((doc) => {
      if (doc) {
        return db
          .localRepo
          .remove(query);
      }
      return Promise.resolve();
    });
}

const link = config => prompt.ask(colors.green(`link will do a full build, test and if successful will link to the local db @ ${argv.userCache}\n${colors.yellow('do that now?')} ${colors.gray('(yy = disable this warning)')}`)).then((res) => {
  if (res) {
    return execute(config, 'install');
  }
  return Promise.reject('user abort');
}).then(() => db.findOne({name: config.name})).then((json) => {
  if (json.cache.bin || json.cache.libs) {
    if (!argv.quiet) {
      log.quiet(`${json.name} >> local repo`, 'magenta');
    }
    const doc = _.omit(json, '_id', 'cache');
    if (argv.verbose) {
      log.quiet(JSON.stringify(doc, 0, 2));
    }
    const query = {
      name: doc.name,
      tag: doc.tag || 'master'
    };
    return db
      .localRepo
      .update(query, {
        $set: doc
      }, {upsert: true});
  }
  return Promise.reject(new Error('link failed because build or test failed'));
});

const push = config => prompt.ask(colors.green(`push will do a clean, full build, test and if successful will upload to the ${colors.yellow('public repository')}\n${colors.yellow('do that now?')} ${colors.gray('(yy = disable this warning)')}`)).then((res) => {
  if (res) {
    return execute(config, 'install');
  }
  return Promise.reject('user aborted push command');
}).then(() => db.findOne({name: config.name})).then((json) => {
  if (json.cache.bin || json.cache.libs) {
    return cloud
      .post(json)
      .then((res) => {
        if (argv.v) {
          log.quiet(`<< ${JSON.stringify(res, 0, 2)}`, 'magenta');
        }
        return Promise.resolve(res);
      });
  }
  return Promise.reject(new Error('link failed because build or test failed'));
});

function list(positionalArgs = argv._) {
  let selector = {};
  let repo = db;
  if (positionalArgs[1] === 'local') {
    repo = localRepo;
    selector = {
      name: positionalArgs[2]
    };
  } else if (positionalArgs[1]) {
    selector = {
      name: positionalArgs[1]
    };
  }
  return repo
    .find(selector)
    .then(nodes => log.info(nodes));
}

function parse(config) {
  const module = new Module(config);
  log.quiet(`parsing with selectors:\n ${module.profile.selectors()}`);
  log.quiet(graph(module));
}

function cleanDep(node) {
  log.quiet(`cleaning ${node.name}`);
  log.verbose(node.d);
  log.verbose(node.libs);
  if (fs.existsSync(node.d.build)) {
    log.quiet(`rm -R ${node.d.build}`);
    fs.nuke(node.d.build);
  }
  _.each(node.libs, (libFile) => {
    log.quiet(`rm ${libFile}`);
    if (fs.existsSync(libFile)) {
      fs.unlinkSync(libFile);
    }
  });
  fs.prune(node.d.root);
  const modifier = {
    $unset: {
      'cache.configuration': true,
      'cache.metaConfiguration': true,
      'cache.target': true,
      'cache.libs': true,
      'cache.bin': true
    }
  };
  const preserve = ['_id', 'cache', 'name'];
  _.each(node, (v, k) => {
    if (!_.contains(preserve, k)) {
      modifier.$unset[k] = true;
    }
  });
  return db.update({
    name: node.name
  }, modifier, {}).then(() => {
    if (node.cache.generatedBuildFile) {
      const generatedBuildFile = path.join(node.d.project, node.cache.buildFile);
      const unsetter = {
        $unset: {
          'cache.buildFile': true
        }
      };
      try {
        if (fs.existsSync(generatedBuildFile)) {
          log.quiet(`clean generatedBuildFile ${generatedBuildFile}`);
          if (fs.lstatSync(generatedBuildFile).isDirectory()) {
            fs.nuke(generatedBuildFile);
          } else {
            fs.unlinkSync(generatedBuildFile);
          }
        }
      } catch (err) {
        log.error(err(colors.yellow(err.message || err)));
      }
      return db.update({
        name: node.name
      }, unsetter, {});
    }
    return Promise.resolve();
  });
}

function findAndClean(depName) {
  return db
    .findOne({name: depName})
    .then((node) => {
      if (node) {
        return graph
          .resolveDep(node)
          .then(cleanDep)
          .then(() => db.findOne({name: depName}).then(cleaned => log.verbose(cleaned)));
      }
      return Promise.reject(`didn't find node for ${depName}`);
    });
}

export {
  execute,
  list,
  cleanDep,
  parse,
  push,
  link,
  unlink,
  profile,
  findAndClean
};
