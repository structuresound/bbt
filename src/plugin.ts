export interface StepOptions {
    environment?: any;
    cmd?: any;
    arguments?: any;
    flags?: any;
}

export interface PluginOptions {
    fetch?: any;
    generate?: StepOptions;
    configure?: StepOptions;
    build?: StepOptions;
    install?: StepOptions;
}

export class Plugin<T> {
    name: string;
    static pluginMap: { [index: string]: typeof Plugin } = {};
    static register = (plugin: typeof Plugin) => {
        Plugin.pluginMap[plugin.name] = Plugin;
    }
    static lookup = (name: string) => {
        return Plugin.pluginMap[name];
    }
    public constructor(upstream: T) {
    }
    public fetch(): PromiseLike<any> {
        return Promise.resolve();
    }
    public generate(): PromiseLike<string> {
        return Promise.resolve('');
    }
    public configure(): PromiseLike<any> {
        return Promise.resolve();
    }
    public build(): PromiseLike<any> {
        return Promise.resolve();
    }
    public install(): PromiseLike<any> {
        return Promise.resolve();
    }
}