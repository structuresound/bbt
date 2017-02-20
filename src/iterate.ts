import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import { contains, check, safeOLHM, OLHM } from 'js-object-tools';

export interface CmdObj {
  cmd: string;
  arg?: any;
  cwd?: string;
}

const _ignore = [
  'linkerFlags',
  'cFlags',
  'cxxFlags',
  'compilerFlags',
  'defines',
  'frameworks',
  'sources',
  'headers',
  'libs',
  'includeDirs',
  'outputFile'
];

export function iterable(val: any) {
  if (check(val, Array)) {
    return val;
  } else if (check(val, Object)) {
    return _.map(val, (v) => { return v; });
  }
  return [val];
}

export function getCommands(it: any, ignore?: string[]) {
  const validCommands = [];
  if (check(it, String)) {
    validCommands.push({ arg: it, cmd: 'shell' });
  } else if (check(it, Array)) {
    for (const statement of it) {
      validCommands.push({ arg: statement, cmd: 'shell' });
    }
  } else if (check(it, Object)) {
    for (const k of Object.keys(it)) {
      if (!contains(ignore || _ignore, k)) {
        validCommands.push({ arg: it[k], cmd: k });
      }
    }
  }
  return validCommands;
}

export function iterateOLHM(obj: any, fn: (any: any) => Promise<any>) {
  const it = safeOLHM(obj);
  if (!check(it, Array)
  ) {
    throw new Error('safeOLHM did not produce array');
  }
  return Bluebird.each(it, fn);
}

export function mapOLHM<T>(obj: OLHM<T>, fn: (object: any) => PromiseLike<T>) {
  const it = safeOLHM(obj);
  if (!check(it, Array)
  ) {
    throw new Error('safeOLHM did not produce array');
  }
  console.log('mapping olhm', it);
  return Bluebird.map(it, fn);
}

export function iterate(obj: any, fn: (cmd: CmdObj) => Promise<any> | Bluebird<any>) {
  const it = iterable(obj);
  if (!check(it, Array)
  ) {
    throw new Error('iterable did not produce array');
  }
  return Bluebird.each(it, fn);
}