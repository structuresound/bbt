import * as Bluebird from 'bluebird';
import { contains, check, OLHM, map } from 'typed-json-transform';

import { errors } from './errors';
import { Plugin } from './plugin';

export function iterable(val: any) {
  if (check(val, Array)) {
    return val;
  } else if (check(val, Object)) {
    return map(val, (v) => { return v; });
  }
  return [val];
}

export function iterateOLHM(obj: any, fn: (any: any) => PromiseLike<any>): PromiseLike<any> {
  const it = OLHM.safe(obj);
  if (!check(it, Array)
  ) {
    throw new Error('safeOLHM did not produce array');
  }
  return Bluebird.each(it, fn);
}

export function mapOLHM<T>(obj: OLHM<T>, fn: (object: any) => PromiseLike<T>): PromiseLike<T[]> {
  const it = OLHM.safe(obj);
  if (!check(it, Array)
  ) {
    return Bluebird.reject(new Error('safeOLHM did not produce array'));
  }
  return Bluebird.map(it, fn);
}

export function iterate(obj: any, fn: (cmd: TMake.CmdObj) => Bluebird<any>): PromiseLike<any> {
  const it = iterable(obj);
  if (!check(it, Array)
  ) {
    throw new Error('iterable did not produce array');
  }
  return Bluebird.each(it, (i: TMake.CmdObj) => {
    return fn(i).catch((error: Error) => {
      return Bluebird.reject(errors.build.command.failed(i.cmd, error));
    });
  });
}