#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('fs');
const { spawn, exec } = require('child_process');
const JSZip = require('jszip');
const path = require('path');
const os = require('os');
const moment = require('moment');
const git = require('git-client');
const { program } = require('commander');
const FTPClient = require("./FTPClient");
const VariableResolver_1 = require("./VariableResolver");
const XMLUtils = require('./XMLUtils');
const ENVConfigLoader = require('./ENVConfigLoader');
function loadCredentials(credentialsPath) {
    if (!fs.existsSync(credentialsPath)) {
        return null;
    }
    try {
        var stats = fs.statSync(credentialsPath);
        var mode = stats.mode & parseInt('777', 8);
        if (os.platform() !== 'win32' && mode & parseInt('044', 8)) {
            console.warn(`WARNING: Credentials file "${credentialsPath}" is world-readable. Consider restricting permissions with: chmod 600 "${credentialsPath}"`);
        }
    }
    catch (_) { }
    var raw = fs.readFileSync(credentialsPath, 'utf8');
    var credentials = JSON.parse(raw);
    for (const [name, account] of Object.entries(credentials)) {
        var acc = account;
        if (!acc.host || !acc.username || !acc.password) {
            throw new Error(`Account "${name}" in credentials file is missing required fields (host, username, password)`);
        }
    }
    return credentials;
}
function resolveAccount(task, credentials) {
    var account = task.account;
    if (typeof account === 'string') {
        if (!credentials) {
            throw new Error(`Account "${account}" requires a credentials file. Create a .ftp-credentials.json or use --creds to specify one.`);
        }
        if (!credentials[account]) {
            throw new Error(`Account "${account}" not found in credentials file. Available accounts: ${Object.keys(credentials).join(', ')}`);
        }
        console.log(`Using account: "${account}" (host: ${credentials[account].host})`);
        return credentials[account];
    }
    if (typeof account === 'object' && account !== null) {
        console.warn(`WARNING: Inline credentials detected for task "${task.name}". Consider using a named account in .ftp-credentials.json instead.`);
        if (!account.host || !account.username || !account.password) {
            throw new Error(`Inline account for task "${task.name}" is missing required fields (host, username, password)`);
        }
        return account;
    }
    throw new Error(`Task "${task.name}" has an invalid account configuration`);
}
function shouldRunTask(task, group) {
    if (!group)
        return true;
    if (!task)
        return false;
    if (!task.group)
        return false;
    return task.group.contains(group);
}
function getGroupNames(task) {
    if (!task.group)
        return [];
    if (Array.isArray(task.group))
        return task.group;
    return [task.group];
}
function filterTasks(tasks, options) {
    var filtered = tasks;
    if (options.task && options.task.length > 0) {
        var names = options.task;
        var missing = names.filter(n => !tasks.some(t => t.name === n));
        if (missing.length > 0) {
            var available = tasks.map(t => t.name).join(', ');
            throw new Error(`Unknown task(s): ${missing.join(', ')}. Available: ${available}`);
        }
        filtered = filtered.filter(t => names.includes(t.name));
        console.log(`Running specific tasks: ${names.join(', ')}`);
    }
    if (options.group && options.group.length > 0) {
        var groups = options.group;
        var hasGroup = tasks.some(t => getGroupNames(t).length > 0);
        if (!hasGroup) {
            console.warn(`--group specified but no tasks have a "group" property`);
        }
        filtered = filtered.filter(t => getGroupNames(t).some(g => groups.includes(g)));
        console.log(`Running groups: ${groups.join(', ')}`);
    }
    if (options.from) {
        var fromIdx = tasks.findIndex(t => t.name === options.from);
        if (fromIdx === -1) {
            var available = tasks.map(t => t.name).join(', ');
            throw new Error(`--from task "${options.from}" not found. Available: ${available}`);
        }
        filtered = filtered.filter(t => tasks.indexOf(t) >= fromIdx);
        console.log(`Running tasks from: "${options.from}"`);
    }
    if (options.to) {
        var toIdx = tasks.findIndex(t => t.name === options.to);
        if (toIdx === -1) {
            var available = tasks.map(t => t.name).join(', ');
            throw new Error(`--to task "${options.to}" not found. Available: ${available}`);
        }
        filtered = filtered.filter(t => tasks.indexOf(t) <= toIdx);
        console.log(`Running tasks up to: "${options.to}"`);
    }
    if (options.skip && options.skip.length > 0) {
        filtered = filtered.filter(t => !options.skip.includes(t.name));
        console.log(`Skipping tasks: ${options.skip.join(', ')}`);
    }
    return filtered;
}
async function run(configPath, credentials, filterOptions) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`=============== ${config.name || ''} ===============`);
    var context = {
        env: config.env || {},
        vars: {},
        globalVars: config.globalVars || {},
        outputs: {}
    };
    if (config.vars) {
        var bootContext = { env: config.env || {}, vars: {}, outputs: {}, globalVars: config.globalVars || {} };
        for (var key in config.vars) {
            var resolved = (0, VariableResolver_1.resolveValue)(config.vars[key], bootContext);
            context.vars[key] = resolved;
            bootContext.vars[key] = resolved;
        }
    }
    if (filterOptions.injectedVars) {
        for (var key in filterOptions.injectedVars) {
            context.vars[key] = filterOptions.injectedVars[key];
        }
    }
    var tasks = filterTasks(config.tasks, filterOptions);
    if (tasks.length === 0) {
        console.error("No tasks match the specified filters");
        process.exit(1);
    }
    console.log(`Running ${tasks.length} of ${tasks.length} total tasks`);
    var count = tasks.length;
    var position = 0;
    for (const rawTask of tasks) {
        position++;
        var progress = `${position}/${count}`;
        var task = (0, VariableResolver_1.resolveTask)(rawTask, context);
        console.log(`\n=============== task: ${task.name}(${task.type}) ${progress} ===============`);
        // console.log("path", process.env.PATH)
        try {
            var cwd = config.cwd;
            cwd = path.resolve(process.cwd(), cwd);
            if (task.cwd)
                cwd = path.resolve(cwd, task.cwd);
            var output = undefined;
            if (task.type === 'batch') {
                await runBatch(task.command, task.args || [], cwd, config.env);
            }
            else if (task.type === 'zip') {
                await runZip(cwd, task);
            }
            else if (task.type === 'upload') {
                var account = resolveAccount(task, credentials);
                await runUpload(cwd, task, account);
            }
            else if (task.type === 'http') {
                await runHttp(task);
            }
            else if (task.type === 'git') {
                output = await runGit(task, cwd);
            }
            else if (task.type === 'stat') {
                output = await runStat(task, cwd);
            }
            else if (task.type === 'template') {
                await runTemplate(task, cwd, context);
            }
            else if (task.type === 'moment') {
                output = runMoment(task);
            }
            else if (task.type === 'xml') {
                await runXml(task, cwd);
            }
            else {
                throw new Error(`Unknown task type: ${task.type}`);
            }
            if (task.outputVar && output !== undefined) {
                var display = typeof output === 'object' ? JSON.stringify(output) : String(output);
                context.outputs[task.outputVar] = output;
                console.log(`  output: ${task.outputVar} = "${display}"`);
            }
            console.log(`\n=============== task: ${task.name} - ${progress} ✅ ===============`);
        }
        catch (err) {
            var message = err.message || err.toString();
            console.error(`Task "${task.name}" failed:`, message);
            console.log(`\n=============== task: ${task.name} - ${progress} ❌ ===============`);
            process.exit(1);
        }
    }
    // console.log('\nAll tasks completed successfully');
}
function runBatch(command, args, cwd, env) {
    return new Promise((resolve, reject) => {
        const savedPATH = process.env.PATH;
        const customEnv = { ...process.env, ...env };
        // console.log("original path", savedPATH);
        // console.log(env);
        // console.log("env.path", env.PATH);
        customEnv.PATH = savedPATH;
        for (const [key, value] of Object.entries(env)) {
            if (typeof value === 'string') {
                customEnv[key] = value.replace(/%([^%]+)%/g, (_, name) => {
                    // console.log("replace", _, name, "=", customEnv[name]);
                    if (name === 'PATH')
                        return savedPATH;
                    return customEnv[name] || '';
                });
            }
        }
        // console.log("\nmerged.path", customEnv.PATH);
        console.log(cwd + ">" + command, args.join(" "));
        const child = spawn(command, args, {
            cwd: cwd,
            env: customEnv,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        child.stdout.on('data', data => process.stdout.write(data));
        child.stderr.on('data', data => process.stderr.write(data));
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', chunk => {
                child.stdin.write(chunk);
            });
        }
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Batch command failed with code ${code}`));
            }
            else {
                resolve();
            }
        });
    });
}
function runZip(cwd, task) {
    return new Promise(async (resolve, reject) => {
        try {
            var outputFile = path.resolve(cwd, task.output);
            fs.mkdirSync(path.dirname(outputFile), { recursive: true });
            var outputZip = new JSZip();
            async function processItem(item) {
                if (item.type === 'file') {
                    var fullPath = path.resolve(cwd, item.path);
                    var name = item.output || item.path;
                    console.log("  adding file", item.path, "as", name);
                    outputZip.file(name, fs.readFileSync(fullPath));
                }
                else if (item.type === 'folder') {
                    var fullPath = path.resolve(cwd, item.path);
                    var prefix = item.output || "";
                    console.log("  adding folder", item.path, "to", prefix);
                    var walkDir = function (dir, baseDir) {
                        var entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries) {
                            var fullEntry = path.join(dir, entry.name);
                            if (entry.isDirectory()) {
                                walkDir(fullEntry, path.join(baseDir, entry.name));
                            }
                            else if (entry.isFile()) {
                                var zipName = prefix
                                    ? prefix + '/' + path.join(baseDir, entry.name).replace(/\\/g, '/')
                                    : path.join(baseDir, entry.name).replace(/\\/g, '/');
                                outputZip.file(zipName, fs.readFileSync(fullEntry));
                            }
                        }
                    };
                    walkDir(fullPath, '');
                }
                else if (item.type === 'zip' || item.type === 'merge') {
                    var zipPaths = item.type === 'merge' ? item.paths || item.files : [item.path];
                    if (!zipPaths)
                        zipPaths = [item.path];
                    for (var zp of zipPaths) {
                        var resolvedPath = path.resolve(cwd, zp);
                        console.log("  merging zip", zp);
                        var zip = await JSZip.loadAsync(fs.readFileSync(resolvedPath));
                        var tasks = [];
                        zip.forEach((relativePath, entry) => {
                            if (!entry.dir) {
                                tasks.push(entry.async('nodebuffer').then((content) => {
                                    outputZip.file(entry.name, content);
                                }));
                            }
                        });
                        await Promise.all(tasks);
                    }
                }
                else if (item.type === 'remove' || item.type === 'deleteFiles') {
                    var paths = item.paths || item.files || [item.path].filter(Boolean);
                    console.log("  removing paths:", paths);
                    for (var rm of paths) {
                        removeFromZip(outputZip, rm);
                    }
                }
                else if (item.type === 'replaceFile') {
                    var fromPath = path.resolve(cwd, item.from);
                    if (item.ifExists && !fs.existsSync(fromPath)) {
                        console.log("    skipping", item.to, "- source not found:", item.from);
                        return;
                    }
                    removeFromZip(outputZip, item.to);
                    console.log("    replacing", item.to, "with", item.from);
                    outputZip.file(item.to.replace(/\\/g, '/'), fs.readFileSync(fromPath));
                }
                else if (item.type === 'replaceText') {
                    var content = item.content;
                    if (content !== null && typeof content === 'object') {
                        content = JSON.stringify(content, null, '\t');
                    }
                    await replaceTextInZip(outputZip, item.file, String(content));
                }
                else if (item.type === 'xml') {
                    await updateXmlInZip(outputZip, item.file, item.updates);
                }
                else {
                    throw new Error(`Unknown item type: ${item.type}`);
                }
            }
            if (task.items) {
                for (var item of task.items) {
                    // console.log(item);
                    await processItem(item);
                }
            }
            /*
            if (task.merge) {
                console.log("********************");
                console.log("  merging extra zips:", task.merge);
                for (var zipPath of task.merge) {
                    var resolvedPath = path.resolve(cwd, zipPath);
                    var zip = await JSZip.loadAsync(fs.readFileSync(resolvedPath));
                    var tasks: any[] = [];
                    zip.forEach((relativePath: string, entry: any) => {
                        if (!entry.dir) {
                            tasks.push(
                                entry.async('nodebuffer').then((content: Buffer) => {
                                    outputZip.file(entry.name, content);
                                })
                            );
                        }
                    });
                    await Promise.all(tasks);
                }
            }

            if (task.remove) {
                console.log("********************");
                console.log("  removing paths:", task.remove);
                for (var rm of task.remove) {
                    removeFromZip(outputZip, rm);
                }
            }

            if (task.deleteFiles) {
                console.log("********************");
                console.log("  deleting files:", task.deleteFiles);
                for (var del of task.deleteFiles) {
                    removeFromZip(outputZip, del);
                }
            }

            if (task.replaceFile) {
                console.log("********************");
                console.log("  replacing files:", task.replaceFile);
                for (var rf of task.replaceFile) {
                    var fromPath = path.resolve(cwd, rf.from);
                    if (rf.ifExists && !fs.existsSync(fromPath)) {
                        console.log("    skipping", rf.to, "- source not found:", rf.from);
                        continue;
                    }
                    removeFromZip(outputZip, rf.to);
                    console.log("    replacing", rf.to, "with", rf.from);
                    outputZip.file(rf.to.replace(/\\/g, '/'), fs.readFileSync(fromPath));
                }
            }
            
            if (task.replaceText) {
                console.log("********************");
                console.log("  replacing text in:", task.replaceText.map((r: any) => r.file).join(', '));
                for (var rt of task.replaceText) {
                    var content = rt.content;
                    if (content !== null && typeof content === 'object') {
                        content = JSON.stringify(content, null, '\t');
                    }
                    await replaceTextInZip(outputZip, rt.file, String(content));
                }
            }

            if (task.xml) {
                console.log("********************");
                console.log("  updating XML in:", task.xml.map((x: any) => x.file).join(', '));
                for (var xc of task.xml) {
                    await updateXmlInZip(outputZip, xc.file, xc.updates);
                }
            }
            */
            var genOptions = { type: 'nodebuffer', streamFiles: true };
            var opts = task.options || task;
            if (opts.compression) {
                genOptions.compression = opts.compression;
                genOptions.compressionOptions = opts.compressionOptions || { level: 1 };
                console.log("  compression:", opts.compression, JSON.stringify(genOptions.compressionOptions));
            }
            const out = fs.createWriteStream(outputFile);
            out.on('close', resolve);
            out.on('error', reject);
            outputZip.generateNodeStream(genOptions).pipe(out);
        }
        catch (e) {
            reject(e);
        }
    });
}
function removeFromZip(zip, targetPath) {
    var normalized = targetPath.replace(/\\/g, '/').replace(/\/$/, '');
    var toRemove = [];
    zip.forEach((relativePath, entry) => {
        var entryPath = relativePath.replace(/\\/g, '/');
        if (entryPath === normalized || entryPath.startsWith(normalized + '/')) {
            toRemove.push(relativePath);
        }
    });
    for (var rm of toRemove) {
        zip.remove(rm);
        console.log("removed", rm);
    }
}
function replaceTextInZip(zip, filePath, content) {
    return new Promise((resolve, reject) => {
        var entry = zip.file(filePath);
        if (!entry) {
            console.warn(`file not found in zip: ${filePath}`);
            resolve();
            return;
        }
        entry.async('nodebuffer').then((_original) => {
            zip.remove(filePath);
            zip.file(filePath.replace(/\\/g, '/'), content);
            console.log("replaced text in", filePath);
            resolve();
        }).catch(reject);
    });
}
function updateXmlInZip(zip, filePath, updates) {
    return new Promise((resolve, reject) => {
        var entry = zip.file(filePath);
        if (!entry) {
            console.warn(`xml file not found in zip: ${filePath}`);
            resolve();
            return;
        }
        entry.async('string').then((xmlContent) => {
            var modified = xmlContent;
            for (var upd of updates) {
                var result = XMLUtils.updateXML(modified, upd.xpath, String(upd.value));
                if (result)
                    modified = result;
            }
            zip.remove(filePath);
            zip.file(filePath.replace(/\\/g, '/'), modified);
            console.log("    updated XML in", filePath);
            resolve();
        }).catch(reject);
    });
}
async function runUpload(cwd, task, account) {
    console.log("trying to connect to FTP");
    var client = new FTPClient(account);
    console.log("connecting");
    await client.connect();
    if (task.path && task.mkdir !== false) {
        try {
            await client.mkdir(task.path, true);
        }
        catch (_) { }
    }
    for (const entry of task.files) {
        var localPath, remoteName;
        if (typeof entry === 'string') {
            localPath = path.resolve(cwd, entry);
            remoteName = path.basename(entry);
            console.log("uploading file", entry, "to server", task.path);
            await client.upload(localPath, (task.path || '') + '/' + remoteName);
        }
        else if (entry.type === 'file') {
            localPath = path.resolve(cwd, entry.path);
            remoteName = entry.output || path.basename(entry.path);
            console.log("uploading file", entry.path, "to server", task.path);
            await client.upload(localPath, (task.path || '') + '/' + remoteName);
        }
        else if (entry.type === 'direct') {
            var dirPath = path.resolve(cwd, entry.path);
            console.log("uploading directory", entry.path, "to server", task.path);
            var files = fs.readdirSync(dirPath, { recursive: true });
            for (const f of files) {
                var fullPath = path.resolve(dirPath, f);
                if (fs.statSync(fullPath).isFile()) {
                    await client.upload(fullPath, (task.path || '') + '/' + f.replace(/\\/g, '/'));
                }
            }
        }
    }
    client.close();
}
async function runHttp(task) {
    const res = await fetch(task.url, {
        method: task.method || 'GET',
        headers: task.headers || {},
        body: task.body ? JSON.stringify(task.body) : undefined
    });
    var text = await res.text();
    console.log("response:", text);
    if (!res.ok) {
        throw new Error(`HTTP request failed: ${res.status}`);
    }
}
function runGit(task, cwd) {
    return new Promise((resolve, reject) => {
        var cmd = 'git ' + (task.command || '');
        console.log(cwd + ">", "running:", cmd);
        exec(cmd, { cwd: cwd }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(`git command failed: ${err.message}`));
                return;
            }
            if (stdout)
                process.stdout.write(stdout);
            if (stderr)
                process.stderr.write(stderr);
            var output = stdout.trim();
            console.log(`  result: "${output}"`);
            resolve(output);
        });
    });
}
function runStat(task, cwd) {
    return new Promise((resolve, reject) => {
        var targetPath = path.resolve(cwd, task.path);
        try {
            var stats = fs.statSync(targetPath);
            var result = {
                size: stats.size,
                mtime: stats.mtime.toISOString(),
                ctime: stats.ctime.toISOString(),
                birthtime: stats.birthtime.toISOString(),
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory()
            };
            console.log("  stat:", task.path, "->", JSON.stringify(result));
            resolve(result);
        }
        catch (e) {
            reject(new Error(`stat failed for "${task.path}": ${e.message}`));
        }
    });
}
async function runTemplate(task, cwd, context) {
    var content = task.content;
    if (typeof content === 'string') {
        content = (0, VariableResolver_1.resolveValue)(content, context);
    }
    var outputPath = path.resolve(cwd, task.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf8');
    console.log("  wrote template to", task.output);
}
function runMoment(task) {
    var format = task.format || 'YYYY-MM-DD HH:mm:ss';
    var output = moment().format(format);
    console.log("  moment:", format, "->", output);
    return output;
}
async function runXml(task, cwd) {
    var filePath = path.resolve(cwd, task.file);
    var xmlContent = fs.readFileSync(filePath, 'utf8');
    var modified = xmlContent;
    for (var upd of (task.updates || [])) {
        var result = XMLUtils.updateXML(modified, upd.xpath, String(upd.value));
        if (result)
            modified = result;
        console.log(`  updated ${upd.xpath} = ${upd.value}`);
    }
    var outputPath = task.output ? path.resolve(cwd, task.output) : filePath;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, modified, 'utf8');
    console.log("  wrote XML to", outputPath);
}
async function start() {
    try {
        program
            .option('-c, --config <path>', 'Path to config file')
            .option('--creds <path>', 'Path to credentials file (default: .ftp-credentials.json)')
            .option('-t, --task <names...>', 'Run only specific tasks by name')
            .option('--skip <names...>', 'Skip specific tasks by name')
            .option('-g, --group <names...>', 'Run tasks belonging to specific groups')
            .option('-l, --list', 'List all available tasks and exit')
            .option('--from <name>', 'Run all tasks starting from this task (inclusive)')
            .option('--to <name>', 'Run all tasks up to this task (inclusive)')
            .option('--env-file <path>', 'Path to .env file (default: .env)')
            .option('--env <items...>', 'Inject env variables (key=value)')
            .option('--var <items...>', 'Inject config vars (key=value)')
            .parse(process.argv);
        const options = program.opts();
        if (options.list) {
            if (!options.config) {
                console.error("--list requires --config to read the task list");
                process.exit(1);
            }
            var config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
            console.log('Available tasks:');
            config.tasks.forEach((t, i) => {
                var groups = getGroupNames(t);
                var groupStr = groups.length > 0 ? ` [groups: ${groups.join(', ')}]` : '';
                console.log(`  ${i + 1}. ${t.name} (${t.type})${groupStr}`);
            });
            process.exit(0);
        }
        var envLoader = new ENVConfigLoader();
        var envConfig = envLoader.load([options.envFile || '.env', null]);
        if (Object.keys(envConfig).length) {
            for (var key in envConfig) {
                process.env[key] = envConfig[key];
            }
            console.log('Loaded', Object.keys(envConfig).length, 'env var(s) from .env');
        }
        if (options.env) {
            for (var pair of options.env) {
                var idx = pair.indexOf('=');
                if (idx > 0) {
                    var k = pair.substring(0, idx);
                    var v = pair.substring(idx + 1);
                    process.env[k] = v;
                    console.log(`  env: ${k}=${v}`);
                }
            }
        }
        if (options.var) {
            for (var pair of options.var) {
                var idx = pair.indexOf('=');
                if (idx > 0) {
                    var k = pair.substring(0, idx);
                    var v = pair.substring(idx + 1);
                    if (!options.injectedVars)
                        options.injectedVars = {};
                    options.injectedVars[k] = v;
                    console.log(`  var: ${k}=${v}`);
                }
            }
        }
        if (options.config) {
            console.log('Config file:', options.config);
            var credentials = null;
            var credsPath = options.creds || path.resolve(process.cwd(), '.ftp-credentials.json');
            if (fs.existsSync(credsPath)) {
                console.log('Credentials file:', credsPath);
                credentials = loadCredentials(credsPath);
                console.log('Loaded', Object.keys(credentials).length, 'account(s):', Object.keys(credentials).join(', '));
            }
            else if (options.creds) {
                throw new Error(`Credentials file not found: ${credsPath}`);
            }
            await run(options.config, credentials, options);
        }
        else {
            console.error("missing config");
            process.exit(1);
        }
        // console.log("END");
        process.exit(0);
    }
    catch (reason) {
        console.error(reason.message || reason);
        process.exit(1);
    }
}
start();
