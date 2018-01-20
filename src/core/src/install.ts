import * as Bluebird from 'bluebird';
import * as path from 'path';
import { setValueForKeyPath, contains, flatten, each } from 'typed-json-transform';
import * as fs from 'fs';

import { src, map, dest, wait, symlink } from './file';
import { log } from './log';
import { args } from './runtime';
import { mv, mkdir } from 'shelljs';
import { stringHash, fileHashSync } from './hash';
import { Runtime } from './runtime';
import { replaceAll, startsWith } from './string';
import { Configuration } from './configuration';

function copy({ patterns, from, to, opt }: TMake.Install.CopyOptions): PromiseLike<string[]> {
  const filePaths: string[] = [];
  const stream = src(patterns, {
    cwd: from,
    followSymlinks: opt.followSymlinks
  }).pipe(map((data: TMake.Vinyl.File, callback: Function) => {
    const mut = data;
    if (opt.flatten) {
      mut.base = path.dirname(mut.path);
    }
    const newPath = path.join(to, path.relative(mut.base, mut.path));
    filePaths.push(path.relative(opt.relative, newPath));
    callback(null, mut);
  })).pipe(dest(to));
  return <any>wait(stream).then(() => {
    return Bluebird.resolve(filePaths);
  });
};

function link({ patterns, from, to, opt }: TMake.Install.CopyOptions): PromiseLike<string[]> {
  const filePaths: string[] = [];
  return <any>wait(src(patterns, {
    cwd: from,
    followSymlinks: opt.followSymlinks
  }).pipe(map((data: TMake.Vinyl.File, callback: Function) => {
    const mut = data;
    if (opt.flatten) {
      mut.base = path.dirname(mut.path);
      // console.log('flatten', mut.base);
    }
    const newPath = path.join(to, path.relative(mut.base, mut.path));
    if (opt.flatten) {
      // console.log('add link', path.relative(opt.relative, newPath));
    }
    filePaths.push(path.relative(opt.relative, newPath));
    callback(null, mut);
  })).pipe(symlink(to))).then(() => {
    return Bluebird.resolve(filePaths);
  });
}

function bin(configuration: Configuration) {
  if (contains(['executable'], configuration.parsed.target.output.type)) {
    const base = path.join(args.runDir, 'bin', configuration.parsed.target.architecture);
    mkdir('-p', base);
    const binaries: string[] = [];
    each(configuration.parsed.d.install.binaries, (ft: TMake.Install.Options) => {
      const from = path.join(ft.from, configuration.project.parsed.name);
      const to = path.join(ft.to || base, configuration.project.parsed.name);
      // log.verbose(`[ install bin ] from ${from} to ${to}`);
      mv(from, to);
      binaries.push(to);
    });
  }
  return Bluebird.resolve();
}

function assets(configuration: Configuration): PromiseLike<any> {
  const { glob } = configuration.parsed.target;

  if (configuration.parsed.d.install.assets) {
    return Bluebird.map(configuration.parsed.d.install.assets, (ft: TMake.Install.Options) => {
      const patterns = ft.matching || glob.assets.images.concat(glob.assets.fonts);
      log.verbose(`[ install assets ] from ${ft.from} to ${ft.to}`);
      return copy({
        patterns, from: ft.from, to: ft.to, opt: {
          flatten: false,
          relative: configuration.project.parsed.d.home,
          followSymlinks: true
        }
      });
    }).then(assetPaths => {
      configuration.cache.assets.set(flatten(assetPaths).join(', '));
      return configuration.update();
    });
  };
  return Bluebird.resolve();
}

function libs(configuration: Configuration): PromiseLike<any> {
  const { output } = configuration.parsed.target;

  if (contains(['static', 'dynamic'], configuration.parsed.target.output.type)) {
    return Bluebird.map(configuration.parsed.d.install.libraries, (ft: TMake.Install.Options) => {
      let patterns = ft.matching || ['**/*.a'];
      if (output.type === 'dynamic') {
        patterns = ft.matching || ['**/*.dylib', '**/*.so', '**/*.dll'];
      }
      log.verbose(`[ install libs ] from ${ft.from} to ${ft.to}`);
      return link({
        patterns, from: ft.from, to: ft.to, opt: {
          flatten: true,
          followSymlinks: false,
          relative: configuration.project.parsed.d.home
        }
      });
    }).then((libPaths) => {
      if (!libPaths.length) {
        return Bluebird.resolve();
      }
      const checksums: any = {};
      const libs = flatten(libPaths);
      each(libs, (lib) => {
        checksums[stringHash(path.basename(lib))] = fileHashSync(path.join(configuration.project.parsed.d.home, lib));
      });
      configuration.cache.libs.set(libs);
      configuration.cache.checksums.set(checksums);
      return configuration.update();
    });
  }
  return Bluebird.resolve();
}


export function lipo(project: TMake.Project): PromiseLike<any> {
  const { glob, output } = project.parsed.target;
  if (!output.lipo){
    return Bluebird.resolve();
  }
  console.log('lipo', project.parsed.libs);
  return Bluebird.resolve();
}

export function installHeaders(project: TMake.Project): PromiseLike<any> {
  const { glob, output } = project.parsed.target;

  if (contains([
    'static', 'dynamic'
  ], output.type)) {
    return Bluebird.each(project.parsed.d.install.headers, (ft: TMake.Install.Options) => {
      const patterns = ft.matching || glob.headers;
      if (args.verbose) {
        log.add('[ install headers ]', patterns, '\nfrom', ft.from, '\nto', ft.to);
      }
      return link({
        patterns, from: ft.from, to: ft.to, opt: {
          flatten: false,
          followSymlinks: true,
          relative: project.parsed.d.home
        }
      });
    })
  }
  return Bluebird.resolve();
}

export function installProject(project: TMake.Project) {
  return installHeaders(project).then(() => {
    return lipo(project);
  });
}

export function installConfiguration(configuration: Configuration) {
  return libs(configuration).then(() => {
    return bin(configuration);
  }).then(() => {
    return assets(configuration);
  });
}
