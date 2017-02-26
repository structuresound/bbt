import { check } from 'js-object-tools';
import * as colors from 'chalk';

import { args } from './args';
import { cache } from './db';
import { log } from './log';
import { info } from './info';
import { Project } from './project';

export class TMakeError extends Error {
  reason: Error

  constructor(message: string, reason?: Error) {
    super(message);
    this.message = message;
    if (reason) {
      this.reason = reason;
    }
  }
  postMortem() {
    if (check(this.message, String)) {
      log.log('\ntmake error report {\n', '', this.message);
      if (this.reason) {
        if (args.verbose) {
          log.log(this.reason.stack);
        } else {
          log.log(this.reason.message);
        }
      }
      log.log('}\n');
    } else {
      log.error('terminating due to unknown error: ', this.message);
    }
  }
}

export function exit(code) {
  info.exit();
}

export const errors = {
  graph: {
    failed: function (nodes: string, error: Error) {
      return new TMakeError(`there was a problem building the dependency graph, these nodes were added successfully [ ${colors.magenta(nodes)} ], the problem is likely with one of their dependencies\n`, error);
    }
  },
  build: {
    command: {
      failed: function (command: string, error: Error) {
        return new TMakeError(`command ${command} failed on `, error);
      }
    }
  },
  project: {
    notFound: function (name: string, graph?: Project[]) {
      log.log(`${colors.magenta(name)} does not appear in the module graph, check the name?`);
      if (graph) {
        info.graph.names(graph)
      }
      exit(1);
    },
    noRoot: function (project: Project) {
      throw new TMakeError('project has no root directory or parent');
    }
  },
  shell: {
    failed: function (command: string, error: Error) {
      return new TMakeError(`command ${command} \n failed with error: \n `, error);
    },
    report: function ({command, output, cwd, short}) {
      return cache.update({ type: 'report' }, { $set: { type: 'report', command, output, createdAt: new Date().toDateString() } }, { upsert: true }).then(() => {
        return Promise.resolve(new TMakeError(`    a subprocess failed: ${command},\n\nrun tmake report for more info`));
      });
    }
  }
}